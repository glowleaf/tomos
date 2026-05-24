---
name: epub-editor
description: Use when creating or editing EPUB2 ebooks using calibre's polish API. Provides domain knowledge for the epub-editor plugin tools and for writing custom calibre polish Python scripts. Covers the Container class, cover/TOC/CSS/split/merge operations, and ebook-convert CLI.
---

# EPUB Editor Skill — calibre polish API Reference

This skill documents calibre's ebook editing API (`calibre.ebooks.oeb.polish.*`) for programmatically creating and modifying EPUB2 ebooks. Use this knowledge alongside the `epub_*` plugin tools, or write custom Python scripts executed via `calibre-debug`.

## Getting a Container

The `Container` object represents an open ebook as a folder of files + OPF metadata.

```python
from calibre.ebooks.oeb.polish.container import get_container

# Open an existing EPUB for editing
container = get_container('/path/to/book.epub', tweak_mode=True)

# Container key concepts:
# - Root folder: base of the ebook
# - Names: POSIX-style paths relative to root (e.g. "text/chapter1.xhtml")
# - Always use container methods, never access filesystem directly
```

Inside an Edit Book plugin:
```python
from calibre.gui2.tweak_book import current_container
container = current_container()
```

## Container API Reference

### Reading Files
| Method | Description |
|--------|-------------|
| `container.raw_data(name, decode=True)` | Return raw bytes or decoded unicode of a file |
| `container.parsed(name)` | Return lxml tree (HTML/XML) or css_parser stylesheet (CSS). Cached; call `dirty()` after mutation |
| `container.open(name, mode='rb')` | Open file for direct read/write (commits dirty parsed, removes from cache) |
| `container.filesize(name)` | File size in bytes |
| `container.exists(name)` | True if file exists on filesystem (case-insensitive on some OS) |
| `container.has_name(name)` | True if file exists (always case-sensitive) |
| `container.manifest_has_name(name)` | True if name is in OPF manifest |
| `container.iterlinks(name)` | Iterate over `(link, line_no, offset)` tuples in a file |
| `container.serialize_item(name)` | Serialize parsed object to bytes |

### Writing Files
| Method | Description |
|--------|-------------|
| `container.replace(name, obj)` | Replace parsed object (lxml tree for HTML, css_parser for CSS) |
| `container.dirty(name)` | Mark parsed object as modified (must call after editing parsed()) |
| `container.commit_item(name, keep_parsed=False)` | Serialize and write a single dirty item to disk |
| `container.commit(outpath=None, keep_parsed=False)` | Write all dirty items and save the EPUB |

### Adding & Removing Files
| Method | Description |
|--------|-------------|
| `container.add_file(name, data=b'', media_type=None, spine_index=None)` | Add a file with automatic manifest/spine entries |
| `container.add_name_to_manifest(name)` | Add name to manifest (returns manifest id) |
| `container.remove_item(name, remove_from_guide=True)` | Remove from manifest, guide, spine, and caches |
| `container.generate_item(name, id_prefix=None, media_type=None)` | Add to manifest with auto-unique href/id |
| `container.rename(current_name, new_name)` | Rename file, rebasing links inside it |
| `container.make_name_unique(name)` | Return modified name that doesn't exist yet |

### Spine
| Property/Method | Description |
|-----------------|-------------|
| `container.spine_names` | Iterate `(name, is_linear)` |
| `container.spine_items` | Iterate name for every spine item |
| `container.spine_iter` | Iterate `(element, name, is_linear)` |
| `container.set_spine(spine_items)` | Set spine from `[(name, linear), ...]` |
| `container.remove_from_spine(spine_items)` | Remove from spine (optionally delete) |

### OPF / Metadata
| Property/Method | Description |
|-----------------|-------------|
| `container.opf` | Parsed OPF lxml tree |
| `container.opf_version` | OPF package version string |
| `container.opf_version_parsed` | Version as `(major, minor)` tuple |
| `container.opf_xpath(expr)` | XPath query on OPF (namespaces `opf:` and `dc:` predefined) |
| `container.opf_get_or_create(name)` | Get or create an OPF child element under package |
| `container.manifest_id_map` | Dict of `{id: name}` |
| `container.manifest_type_map` | Dict of `{media_type: [names]}` |
| `container.manifest_items_of_type(predicate)` | Names matching a media-type predicate |
| `container.manifest_items_with_property(prop)` | Names with given property |
| `container.mi` | Metadata object (constructed on demand) |
| `container.guide_type_map` | Guide type to canonical name mapping |

### Links and References
| Method | Description |
|--------|-------------|
| `container.href_to_name(href, base=None)` | Convert href relative to base into canonical name |
| `container.name_to_href(name, base=None)` | Convert name to href relative to base |
| `container.name_to_abspath(name)` | Convert name to absolute OS path |
| `container.abspath_to_name(fullpath)` | Convert absolute path to canonical name |
| `container.replace_links(name, replace_func)` | Replace links in a file using a callable |
| `container.relpath(path, base=None)` | Convert OS path to relative path |

### Properties
| Property | Description |
|----------|-------------|
| `container.book_type` | `'oeb'` (epub) or `'azw3'` |
| `container.is_dir` | True if container is a directory (unzipped) |
| `container.names_that_must_not_be_changed` | Reserved names |
| `container.names_that_must_not_be_removed` | Reserved names |
| `container.names_that_need_not_be_manifested` | Allowed to be missing from manifest |

## Module-Level Functions

### `calibre.ebooks.oeb.polish.replace`
```python
# Bulk rename files with automatic link updates
rename_files(container, {'old/name.xhtml': 'new/name.xhtml'})

# Bulk replace links across all files
replace_links(container, {'old/path': 'new/path'}, replace_in_opf=False)

# Get recommended folders for file types
get_recommended_folders(container, ['image.jpg'])
```

### `calibre.ebooks.oeb.polish.cover`
```python
# Set cover from external image or existing book image
set_cover(container, '/path/to/cover.jpg')
# Options: keep_aspect=True/False, no_svg=True/False, existing=True/False

# Mark an existing image as cover
mark_as_cover(container, 'images/photo.jpg')

# Mark an HTML file as titlepage (moves to start of spine)
mark_as_titlepage(container, 'text/titlepage.xhtml')
```

### `calibre.ebooks.oeb.polish.toc`
```python
# Generate TOC from XPath expressions
# ⚠ WARNING: Do NOT use if ebook-convert already generated the TOC.
#   This overwrites the working NCX and breaks calibre's TOC panel.
#   Only use on EPUBs that have no existing TOC.
from_xpaths(container, ['//h:h1', '//h:h2', '//h:h3'])

# Generate TOC from existing links
from_links(container)

# Generate TOC from files (one entry per file)
from_files(container)

# Create inline HTML TOC from NCX
create_inline_toc(container, title='Contents')
```

### `calibre.ebooks.oeb.polish.split`
```python
# Split file at XPath match
split(container, 'text/chapter.xhtml', '//h:h2', before=True)

# Split at multiple locations
multisplit(container, 'text/chapter.xhtml', '//h:h2', before=True)

# Merge files into one
merge(container, 'text', ['ch1.xhtml', 'ch2.xhtml'], master='ch1.xhtml')
```

### `calibre.ebooks.oeb.polish.css`
```python
# Remove unused CSS rules
remove_unused_css(container, remove_unused_classes=False, merge_rules=False)

# Remove specific CSS properties
filter_css(container, {'font-family', 'color'})
```

### `calibre.ebooks.oeb.polish.fonts`
```python
# Change font family everywhere
change_font(container, 'OldFont', 'NewFont')
# Set new_name=None to remove the font family entirely
```

### `calibre.ebooks.oeb.polish.pretty`
```python
# Pretty-print individual files or everything
pretty_html(container, name, raw)
pretty_css(container, name, raw)
pretty_xml(container, name, raw)
pretty_all(container)

# Fix HTML parsing errors
fix_html(container, raw)
fix_all_html(container)
```

### `calibre.ebooks.oeb.polish.jacket`
```python
# Add or replace metadata jacket page
add_or_replace_jacket(container)

# Remove existing jacket
remove_jacket(container)
```

## ebook-convert CLI

For initial conversion from markdown to EPUB (before polish editing):

```bash
ebook-convert input.md output.epub \
  --title "Book Title" \
  --authors "Author Name" \
  --language en \
  --chapter-mark pagebreak \
  --chapter "//h:h1" \
  --level1-toc "//h:h1" \
  --level2-toc "//h:h2" \
  --level3-toc "//h:h3" \
  --cover /path/to/cover.jpg
```

## Verified Complete Workflow — Chapter MD Folder to EPUB

This is the battle-tested workflow used for **Ice Labyrinth** (44 chapters). Follow it exactly.

### Prompt Flow (ask these first)
- **Title?**
- **Author?**
- **Folder path?** (contains `Chapter *.md` files, `back matter.md`, cover image)
- **Ending text?** (default: "The End", e.g. "End of Book 4")
- **Backmatter** — use existing `back matter.md` or customize?
- **Confirm previous values** if re-running

### Build Process

```
files/
  Chapter 1.md
  Chapter 2.md
  ...
  back matter.md
  cover.jpg
```

The working reference script is at `.opencode/skills/epub-editor/build_epub.py`.

**Critical rules learned from testing:**

1. **Do NOT call `from_xpaths()`** in the polish step. `ebook-convert` already generates a proper NCX TOC via `--level1-toc '//h:h1'`. Calling `from_xpaths` overwrites it and breaks calibre's TOC panel.

2. **Page breaks between every distinct section:** Use HTML page-break markers between sections:
   ```
   <div style="page-break-before: always;"></div>
   ```
   Insert between: copyright → TOC → each chapter → backmatter. Never inside a chapter.

3. **Remove `---` horizontal rules** from backmatter markdown. They create unwanted page splits in the output.

4. **Blank line before numbered lists** in backmatter. Markdown requires a blank line between a paragraph and a list:
   ```
   **Series Name**
   
   1. Item one
   2. Item two
   ```

5. **Ending text** goes at the end of the last chapter's content (no separate h1 page). Append as `\n\n*End of Book 4*` italic text.

6. **No duplicate title page.** `ebook-convert` auto-generates `titlepage.xhtml` from `--title` and `--authors` metadata. Don't add a second h1 title page in the markdown content.

7. **Version auto-increment:** Scan output dir for `*rc*.epub` files, extract the highest number, create `rc{N+1}`. Never overwrite.

8. **Make URLs clickable** in backmatter: wrap with angle brackets `<https://example.com>` in markdown.

### Full Markdown Structure

```
# Copyright

Copyright © 2026 Author Name
All rights reserved...

<div style="page-break-before: always;"></div>

# Table of Contents

- [Chapter 1 — Title](#chapter-1--title)
- [Chapter 2 — Title](#chapter-2--title)
...

<div style="page-break-before: always;"></div>

# Chapter 1 — Title

Content...

<div style="page-break-before: always;"></div>

# Chapter 2 — Title

Content...

<div style="page-break-before: always;"></div>

# Thank You for Reading

Backmatter content...

## Coming Next

...

## Also by this Author

...
```

### ebook-convert Command

```bash
ebook-convert book.md book.epub \
  --title "Book Title" \
  --authors "Author Name" \
  --language en \
  --chapter-mark pagebreak \
  --chapter '//h:h1' \
  --level1-toc '//h:h1' \
  --level2-toc '//h:h2' \
  --level3-toc '//h:h3' \
  --cover /path/to/cover.jpg
```

### Polish Step (minimal)

```python
from calibre.ebooks.oeb.polish.container import get_container
from calibre.ebooks.oeb.polish.pretty import pretty_all

container = get_container(epub_file, tweak_mode=True)
pretty_all(container)                    # pretty-print HTML/CSS/XML
# Do NOT call from_xpaths() here       # breaks TOC
container.commit(output_path)
```

### Edit Content in Existing EPUB
1. Open with `get_container(path, tweak_mode=True)`
2. Read HTML with `container.raw_data(name, decode=True)`
3. Modify the HTML string
4. Parse new HTML: `lxml.etree.fromstring(html, lxml.etree.HTMLParser())`
5. Replace: `container.replace(name, tree)`
6. Mark dirty: `container.dirty(name)`
7. Save: `container.commit(path)`

### Metadata Update via OPF
```python
opf = container.opf
# Find elements using these namespaces:
# dc: http://purl.org/dc/elements/1.1/
# opf: http://www.idpf.org/2007/opf

el = opf.find('.//dc:title', {'dc': 'http://purl.org/dc/elements/1.1/'})
el.text = 'New Title'
container.dirty(container.opf_name)
container.commit()
```

## Smashwords Style Guide Requirements

**Reference URL:** https://www.smashwords.com/books/view/52
**Guide EPUB:** https://www.smashwords.com/books/download/52/8/latest/0/0/smashwords-style-guide.epub

When the user asks for a Smashwords-compliant EPUB, follow these rules:

### Cover Requirements
- Minimum width: **1400px** (1400-2000px recommended)
- Must be **vertical** (height > width)
- JPEG format preferred
- No text on cover that overlaps with metadata (title, author is fine)

### Metadata
- **Title:** Proper capitalization (not all caps)
- **Author:** Real name or consistent pen name
- **Language:** Must be set correctly
- **Publisher:** Optional but should be consistent
- **ISBN/Smashwords ID:** Leave blank for auto-assignment

### Formatting Rules
1. **No blank lines between paragraphs** — Use first-line indent instead (`text-indent: 1.5em` on `p` tags)
2. **No inline styles** — Strip all inline CSS, use `<p>` tags with class-based styling
3. **No section breaks** (`***` or `---`) — Use `text-align: center` with empty `<p>` for scene breaks
4. **Headers/footers** — Remove page numbers, running heads, or any auto-generated headers
5. **TOC** — Do NOT include a Table of Contents in the content. Smashwords auto-generates one from the NCX
6. **Fonts** — Must be embeddable or standard web-safe (Times New Roman, Arial, Georgia)
7. **Font size** — Use `em` or `%`, never `pt` or `px`
8. **Line height** — 1.5 for body text
9. **Margins** — No large margins on body text

### Required Structure
- **NCX (toc.ncx)** — Must be present and properly formatted
- **Spine order** — Title page → Copyright → Body → Back matter
- **Guide reference** — OPF must include `<reference type="cover">` pointing to cover
- **Cover in manifest** — Cover image must be listed in OPF manifest

### What to Strip Before Upload
- External links (unless necessary for backmatter)
- Embedded fonts (Smashwords strips them anyway)
- JavaScript (not allowed in EPUB2)
- Custom fonts, colored text, background images
- Drop caps (must be styled with CSS, not images)

### Auto-Processing Script (when user asks for Smashwords conversion)
1. Convert to EPUB2 if needed
2. Set cover dimensions ≥ 1400px, crop/resize if smaller
3. Normalize metadata formatting (title case, author)
4. Remove inline styles, replace with class-based CSS
5. Remove blank lines between paragraphs, add text-indent
6. Remove headers/footers, page numbers
7. Remove content TOC (Smashwords generates its own)
8. Generate NCX from h1/h2/h3
9. Verify cover referenced in manifest and guide
10. Output with `_smashwords` suffix

## Running Custom Scripts

Use `calibre-debug` to run Python scripts that use calibre's API:

```bash
calibre-debug /path/to/script.py
```

This gives you full access to `calibre.ebooks.oeb.polish.*` and all calibre libraries.
