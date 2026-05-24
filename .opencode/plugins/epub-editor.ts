import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';

interface ToolInput {
  [key: string]: unknown;
}

interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function dedent(str: string): string {
  const lines = str.split('\n');
  if (lines.length === 0) return str;
  const indent = lines[1]?.match(/^\s*/)?.[0]?.length ?? 0;
  return lines.map((l, i) => i === 0 ? l.trim() : l.slice(indent)).join('\n').trim();
}

export default (async ({ $ }) => {

  async function runCalibreScript(script: string): Promise<ScriptResult> {
    const tmpFile = path.join(os.tmpdir(), `epub_${Date.now()}_${randomUUID().slice(0, 8)}.py`);
    fs.writeFileSync(tmpFile, script, 'utf-8');
    try {
      const result = await $(`calibre-debug "${tmpFile}" 2>&1`, { timeout: 120000 });
      const stdout = typeof result === 'string' ? result : result.stdout || '';
      return { stdout, stderr: '', exitCode: 0 };
    } catch (e: any) {
      return { stdout: e.stdout || '', stderr: e.stderr || e.message || String(e), exitCode: 1 };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { }
    }
  }

  function lastJsonLine(stdout: string): any {
    const lines = stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('JSON_RESULT:')) {
        try {
          return JSON.parse(trimmed.replace('JSON_RESULT:', ''));
        } catch { }
      }
      try {
        return JSON.parse(trimmed);
      } catch { }
    }
    return null;
  }

  function wrapHandler(scriptTemplate: (input: any) => string) {
    return async (input: ToolInput) => {
      const script = dedent(scriptTemplate(input));
      const { stdout, stderr, exitCode } = await runCalibreScript(script);
      const result = lastJsonLine(stdout) || { stdout, stderr };
      return {
        result,
        content: [{
          type: 'text',
          text: exitCode !== 0
            ? `Error: ${stderr || stdout}`
            : (result.message || JSON.stringify(result, null, 2)),
        }],
      };
    };
  }

  return {
    tool: {
      epub_from_markdown: {
        name: 'epub_from_markdown',
        description: 'Create a complete EPUB2 ebook from markdown content using calibre. Generates a full EPUB with metadata, cover image, and auto TOC from h1/h2/h3 headings.',
        parameters: {
          type: 'object',
          properties: {
            output_path: { type: 'string', description: 'Absolute path for output .epub file' },
            title: { type: 'string', description: 'Book title' },
            author: { type: 'string', description: 'Author name(s)' },
            markdown_content: { type: 'string', description: 'Full markdown content. Use # and ## headings for TOC levels.' },
            language: { type: 'string', description: 'Language code (default: en)', default: 'en' },
            cover_image_path: { type: 'string', description: 'Optional absolute path to cover image' },
          },
          required: ['output_path', 'title', 'author', 'markdown_content'],
        },
        handler: wrapHandler((input) => `
import json, os, sys, subprocess, tempfile, shutil

md_content = ${JSON.stringify(input.markdown_content)}
output_path = ${JSON.stringify(input.output_path)}
title = ${JSON.stringify(input.title)}
author = ${JSON.stringify(input.author)}
lang = ${JSON.stringify(input.language || 'en')}
cover_path = ${JSON.stringify(input.cover_image_path || '')}

tmpdir = tempfile.mkdtemp(prefix='epub_build_')
try:
    md_file = os.path.join(tmpdir, 'book.md')
    with open(md_file, 'w', encoding='utf-8') as f:
        f.write(md_content)

    epub_file = os.path.join(tmpdir, 'book.epub')
    subprocess.run([
        'ebook-convert', md_file, epub_file,
        '--title', title,
        '--authors', author,
        '--language', lang,
        '--chapter-mark', 'pagebreak',
        '--chapter', '//h:h1',
        '--level1-toc', '//h:h1',
        '--level2-toc', '//h:h2',
        '--level3-toc', '//h:h3',
    ], check=True, capture_output=True)

    from calibre.ebooks.oeb.polish.container import get_container
    from calibre.ebooks.oeb.polish.cover import set_cover
    from calibre.ebooks.oeb.polish.toc import from_xpaths
    from calibre.ebooks.oeb.polish.pretty import pretty_all

    container = get_container(epub_file, tweak_mode=True)

    if cover_path and os.path.exists(cover_path):
        set_cover(container, os.path.abspath(cover_path))

    from_xpaths(container, ['//h:h1', '//h:h2', '//h:h3'])
    pretty_all(container)
    container.commit(output_path)

    info = {
        'message': f'EPUB created: {output_path}',
        'output': output_path,
        'title': title,
        'author': author,
        'language': lang,
        'cover_set': bool(cover_path and os.path.exists(cover_path)),
        'file_size': os.path.getsize(output_path),
    }
    print('JSON_RESULT:' + json.dumps(info))
finally:
    shutil.rmtree(tmpdir, ignore_errors=True)
`),
      },

      epub_open: {
        name: 'epub_open',
        description: 'Open an existing EPUB file and return detailed info: manifest files, spine order, metadata, and TOC.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to an existing .epub file' },
          },
          required: ['epub_path'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
from calibre.ebooks.oeb.polish.container import get_container
container = get_container(epub_path, tweak_mode=True)

manifest = []
for item_id, name in container.manifest_id_map.items():
    mi = container.manifest_type_map
    manifest.append({'id': item_id, 'name': name})

type_map = {}
for mtype, names in container.manifest_type_map.items():
    type_map[mtype] = list(names)

spine = []
for name, is_linear in container.spine_names:
    spine.append({'name': name, 'linear': is_linear})

toc = []
try:
    from calibre.ebooks.oeb.polish.toc import get_toc
    for entry in get_toc(container):
        toc.append({'title': entry.title, 'href': entry.href or ''})
except:
    pass

info = {
    'message': 'EPUB info retrieved',
    'opf_version': container.opf_version,
    'book_type': container.book_type,
    'is_dir': container.is_dir,
    'root': container.root,
    'opf_path': container.opf_path if hasattr(container, 'opf_path') else '',
    'manifest': manifest,
    'type_map': type_map,
    'spine': spine,
    'toc': toc,
    'file_size': os.path.getsize(epub_path),
}
print('JSON_RESULT:' + json.dumps(info, default=str))
`),
      },

      epub_edit_html: {
        name: 'epub_edit_html',
        description: 'Replace the content of an HTML file inside an EPUB. Gets a file, lets you modify it, and writes it back.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            file_name: { type: 'string', description: 'Canonical name of file in the epub (e.g. "text/chapter1.xhtml")' },
            new_html: { type: 'string', description: 'New HTML content for the file' },
            output_path: { type: 'string', description: 'Output path for the modified epub. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'file_name', 'new_html'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
file_name = ${JSON.stringify(input.file_name)}
new_html = ${JSON.stringify(input.new_html)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container
from lxml import etree

container = get_container(epub_path, tweak_mode=True)

if not container.has_name(file_name):
    print(f'ERROR: File "{file_name}" not found in epub')
    print('JSON_RESULT:' + json.dumps({'error': f'File not found: {file_name}', 'available_files': list(container.manifest_id_map.values())}))
    sys.exit(1)

# Parse new HTML as lxml tree and replace
parser = etree.HTMLParser()
tree = etree.fromstring(new_html, parser)
container.replace(file_name, tree)
container.dirty(file_name)
container.commit(output_path)

info = {
    'message': f'Replaced {file_name} in {output_path}',
    'file': file_name,
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_add_chapter: {
        name: 'epub_add_chapter',
        description: 'Add a new HTML chapter file to an EPUB and optionally insert it into the spine at a specific position.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            chapter_name: { type: 'string', description: 'Canonical name for the new file (e.g. "text/chapter2.xhtml")' },
            html_content: { type: 'string', description: 'HTML content of the chapter' },
            spine_index: { type: 'number', description: 'Position in spine (0-indexed). Default: append to end.' },
            output_path: { type: 'string', description: 'Output path for modified epub. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'chapter_name', 'html_content'],
        },
        handler: wrapHandler((input) => `
import json, os, sys
epub_path = ${JSON.stringify(input.epub_path)}
chapter_name = ${JSON.stringify(input.chapter_name)}
html_content = ${JSON.stringify(input.html_content)}
spine_index = ${JSON.stringify(input.spine_index !== undefined ? input.spine_index : null)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container
from lxml import etree

container = get_container(epub_path, tweak_mode=True)

# Parse HTML content
parser = etree.HTMLParser()
tree = etree.fromstring(html_content, parser)

# Add file to container
container.add_file(chapter_name, data=b'', media_type='application/xhtml+xml')
container.replace(chapter_name, tree)
container.dirty(chapter_name)

# Reorder spine if index specified
if spine_index is not None:
    current_spine = list(container.spine_names)
    names = [s[0] for s in current_spine]
    # Move the new item to desired index
    names.remove(chapter_name)
    names.insert(spine_index, chapter_name)
    container.set_spine([(n, True) for n in names])

container.commit(output_path)

info = {
    'message': f'Added chapter {chapter_name} to {output_path}',
    'chapter': chapter_name,
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_set_metadata: {
        name: 'epub_set_metadata',
        description: 'Update metadata fields (title, author, language, etc.) of an EPUB file.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            title: { type: 'string', description: 'New title' },
            author: { type: 'string', description: 'New author(s)' },
            language: { type: 'string', description: 'Language code (e.g., en, fr, de)' },
            publisher: { type: 'string', description: 'Publisher name' },
            pubdate: { type: 'string', description: 'Publication date (ISO format, e.g. 2025-01-15)' },
            description: { type: 'string', description: 'Book description / abstract' },
            identifier: { type: 'string', description: 'Unique identifier (e.g., ISBN or UUID)' },
            tags: { type: 'string', description: 'Comma-separated list of tags/genres' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}
changes = {k: v for k, v in {
    'title': ${JSON.stringify(input.title || null)},
    'authors': ${JSON.stringify(input.author || null)},
    'language': ${JSON.stringify(input.language || null)},
    'publisher': ${JSON.stringify(input.publisher || null)},
    'pubdate': ${JSON.stringify(input.pubdate || null)},
    'description': ${JSON.stringify(input.description || null)},
    'identifier': ${JSON.stringify(input.identifier || null)},
    'tags': ${JSON.stringify(input.tags || null)},
}.items() if v is not None}

from calibre.ebooks.oeb.polish.container import get_container
from calibre.ebooks.metadata.book.base import Metadata

container = get_container(epub_path, tweak_mode=True)

# Apply metadata via OPF manipulation
opf = container.opf
nsmap = {'dc': 'http://purl.org/dc/elements/1.1/', 'opf': 'http://www.idpf.org/2007/opf'}

for key, value in changes.items():
    if key == 'title':
        el = opf.find('.//dc:title', nsmap)
        if el is not None:
            el.text = value
        else:
            from lxml import etree
            meta = opf.find('.//opf:metadata', nsmap)
            if meta is not None:
                el = etree.SubElement(meta, '{http://purl.org/dc/elements/1.1/}title')
                el.text = value
    elif key == 'authors':
        for el in opf.findall('.//dc:creator', nsmap):
            el.getparent().remove(el)
        from lxml import etree
        meta = opf.find('.//opf:metadata', nsmap)
        if meta is not None:
            el = etree.SubElement(meta, '{http://purl.org/dc/elements/1.1/}creator')
            el.set('opf:role', 'aut')
            el.text = value
    elif key == 'language':
        el = opf.find('.//dc:language', nsmap)
        if el is not None:
            el.text = value
    elif key == 'publisher':
        el = opf.find('.//dc:publisher', nsmap)
        if el is not None:
            el.text = value
    elif key == 'pubdate':
        el = opf.find('.//dc:date', nsmap)
        if el is not None:
            el.text = value
    elif key == 'description':
        el = opf.find('.//dc:description', nsmap)
        if el is not None:
            el.text = value
    elif key == 'identifier':
        el = opf.find('.//dc:identifier', nsmap)
        if el is not None:
            el.text = value
    elif key == 'tags':
        for el in opf.findall('.//dc:subject', nsmap):
            el.getparent().remove(el)
        from lxml import etree
        meta = opf.find('.//opf:metadata', nsmap)
        if meta is not None:
            for tag in value.split(','):
                tag = tag.strip()
                if tag:
                    el = etree.SubElement(meta, '{http://purl.org/dc/elements/1.1/}subject')
                    el.text = tag

container.dirty(container.opf_name if hasattr(container, 'opf_name') else container.opf_path)
container.commit(output_path)

info = {
    'message': 'Metadata updated',
    'changes': changes,
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_set_cover: {
        name: 'epub_set_cover',
        description: 'Set or replace the cover image of an EPUB using an image file on disk.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            cover_image_path: { type: 'string', description: 'Absolute path to the cover image file (JPEG or PNG)' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'cover_image_path'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
cover_image_path = ${JSON.stringify(input.cover_image_path)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container
from calibre.ebooks.oeb.polish.cover import set_cover

container = get_container(epub_path, tweak_mode=True)
set_cover(container, os.path.abspath(cover_image_path))
container.commit(output_path)

info = {
    'message': f'Cover set from {cover_image_path}',
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_add_image: {
        name: 'epub_add_image',
        description: 'Add an image file (JPEG/PNG) to an EPUB container and optionally reference it from the manifest.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            image_source_path: { type: 'string', description: 'Absolute path to the image file on disk' },
            target_name: { type: 'string', description: 'Canonical name in epub (e.g. "images/photo.jpg")' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'image_source_path', 'target_name'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
image_source = ${JSON.stringify(input.image_source_path)}
target_name = ${JSON.stringify(input.target_name)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container

container = get_container(epub_path, tweak_mode=True)

with open(image_source, 'rb') as f:
    img_data = f.read()

ext = os.path.splitext(image_source)[1].lower()
mtypes = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml'}
media_type = mtypes.get(ext, 'image/jpeg')

container.add_file(target_name, data=img_data, media_type=media_type)
container.commit(output_path)

info = {
    'message': f'Added image {target_name} to {output_path}',
    'image': target_name,
    'media_type': media_type,
    'size_bytes': len(img_data),
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_generate_toc: {
        name: 'epub_generate_toc',
        description: 'Generate a Table of Contents from h1/h2/h3 headings in the EPUB.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container
from calibre.ebooks.oeb.polish.toc import from_xpaths

container = get_container(epub_path, tweak_mode=True)
from_xpaths(container, ['//h:h1', '//h:h2', '//h:h3'])
container.commit(output_path)

info = {
    'message': 'TOC generated from h1/h2/h3 headings',
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_set_spine: {
        name: 'epub_set_spine',
        description: 'Set the reading order (spine) of an EPUB by providing the file names in order.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            spine_order: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of file names in desired reading order (e.g. ["titlepage.xhtml", "text/chapter1.xhtml"])',
            },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'spine_order'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
spine_order = ${JSON.stringify(input.spine_order)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container

container = get_container(epub_path, tweak_mode=True)
container.set_spine([(name, True) for name in spine_order])
container.commit(output_path)

info = {
    'message': f'Spine set with {len(spine_order)} items',
    'spine_order': spine_order,
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_remove_file: {
        name: 'epub_remove_file',
        description: 'Remove a file (HTML, CSS, image, etc.) from an EPUB container.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            file_name: { type: 'string', description: 'Canonical name of file to remove (e.g. "text/old_chapter.xhtml")' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'file_name'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
file_name = ${JSON.stringify(input.file_name)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container

container = get_container(epub_path, tweak_mode=True)
container.remove_item(file_name)
container.commit(output_path)

info = {
    'message': f'Removed {file_name} from {output_path}',
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_rename_file: {
        name: 'epub_rename_file',
        description: 'Rename a file inside the EPUB, updating all internal links.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            old_name: { type: 'string', description: 'Current canonical name (e.g. "text/chapter1.xhtml")' },
            new_name: { type: 'string', description: 'New canonical name (e.g. "text/01-chapter.xhtml")' },
            output_path: { type: 'string', description: 'Output path. Defaults to overwriting original.' },
          },
          required: ['epub_path', 'old_name', 'new_name'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
old_name = ${JSON.stringify(input.old_name)}
new_name = ${JSON.stringify(input.new_name)}
output_path = ${JSON.stringify(input.output_path || input.epub_path)}

from calibre.ebooks.oeb.polish.container import get_container
from calibre.ebooks.oeb.polish.replace import rename_files

container = get_container(epub_path, tweak_mode=True)
rename_files(container, {old_name: new_name})
container.commit(output_path)

info = {
    'message': f'Renamed {old_name} -> {new_name}',
    'old_name': old_name,
    'new_name': new_name,
    'output': output_path,
    'file_size': os.path.getsize(output_path),
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },

      epub_get_file: {
        name: 'epub_get_file',
        description: 'Read the raw HTML/CSS/XML content of a file inside an EPUB.',
        parameters: {
          type: 'object',
          properties: {
            epub_path: { type: 'string', description: 'Absolute path to .epub file' },
            file_name: { type: 'string', description: 'Canonical name of the file (e.g. "text/chapter1.xhtml")' },
          },
          required: ['epub_path', 'file_name'],
        },
        handler: wrapHandler((input) => `
import json, os
epub_path = ${JSON.stringify(input.epub_path)}
file_name = ${JSON.stringify(input.file_name)}

from calibre.ebooks.oeb.polish.container import get_container

container = get_container(epub_path, tweak_mode=True)
data = container.raw_data(file_name, decode=True)
info = {
    'message': 'File content retrieved',
    'file_name': file_name,
    'content': data,
}
print('JSON_RESULT:' + json.dumps(info))
`),
      },
    },
  };
});
