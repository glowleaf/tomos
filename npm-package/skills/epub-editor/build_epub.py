import json, os, subprocess, tempfile, shutil, glob, re

def build_epub(files_dir, output_dir, title, author, ending_text="The End",
               year=None, version_prefix=None, cover=None):
    """Build a complete EPUB from a folder of chapter markdown files.

    Args:
        files_dir: Folder containing Chapter *.md files + back matter.md + cover image
        output_dir: Where to save the output .epub
        title: Book title
        author: Author name
        ending_text: Text to append after last chapter (e.g. "End of Book 4")
        year: Copyright year (defaults to current year)
        version_prefix: e.g. "MyBook rc" -> "MyBook rc1.epub"
        cover: Path to cover image. If None, auto-detects in files_dir
    """
    from datetime import datetime
    year = year or str(datetime.now().year)
    version_prefix = version_prefix or f"{title} rc"

    COVER = cover or next(
        (os.path.join(files_dir, f) for f in os.listdir(files_dir)
         if f.lower().endswith(('.jpg', '.jpeg', '.png')) and 'cover' in f.lower()),
        None
    )

    PB = '\n<div style="page-break-before: always;"></div>\n\n'

    # Auto-increment version
    existing = glob.glob(os.path.join(output_dir, f"{version_prefix}*.epub"))
    rc_nums = [int(re.search(r'rc(\d+)', os.path.basename(f)).group(1))
               for f in existing if re.search(r'rc(\d+)', os.path.basename(f))]
    rc_num = max(rc_nums) + 1 if rc_nums else 1
    version = f"{version_prefix}{rc_num}"
    output_file = os.path.join(output_dir, f"{version}.epub")

    print(f"Building: {version}")
    print(f"Output: {output_file}")

    # Read chapter files in order
    chapter_files = sorted(
        glob.glob(os.path.join(files_dir, "Chapter *.md")),
        key=lambda f: int(re.search(r'Chapter (\d+)', f).group(1))
    )

    # Read and clean backmatter
    backmatter_file = os.path.join(files_dir, "back matter.md")
    with open(backmatter_file, 'r', encoding='utf-8') as f:
        backmatter = f.read()

    # Make URLs clickable
    backmatter = re.sub(r'(https?://[^\s<]+)', r'<\1>', backmatter)

    # Remove horizontal rules that cause unwanted page splits
    backmatter_lines = backmatter.split('\n')
    backmatter = '\n'.join([l for l in backmatter_lines if l.strip() != '---'])

    # Fix list formatting (need blank line before numbered lists)
    backmatter = re.sub(r'(\*\*[^*]+\*\*)\n(\d+\.)', r'\1\n\n\2', backmatter)

    # Collect headings for inline TOC
    chapter_headings = []
    for cf in chapter_files:
        with open(cf, 'r', encoding='utf-8') as f:
            chapter_headings.append(f.readline().strip().lstrip('# '))

    def make_toc_id(heading):
        h = re.sub(r'[^\w\s-]', '', heading.lower()).strip()
        return re.sub(r'\s+', '-', h)

    # Build sections
    sections = []

    # Copyright page
    sections.append(
        f"# Copyright\n\n"
        f"Copyright \u00a9 {year} {author}\n"
        f"All rights reserved.\n\n"
        f"This is a work of fiction. Any resemblance to actual persons, "
        f"living or dead, or actual events is purely coincidental."
    )

    # Table of Contents
    toc_lines = ["# Table of Contents\n"]
    for heading in chapter_headings:
        toc_lines.append(f"- [{heading}](#{make_toc_id(heading)})")
    sections.append("\n".join(toc_lines))

    # Chapters (append ending text after last chapter, no separate page)
    for i, cf in enumerate(chapter_files):
        with open(cf, 'r', encoding='utf-8') as f:
            content = f.read().strip()
        if i == len(chapter_files) - 1:
            content += f"\n\n*{ending_text}*"
        sections.append(content)

    # Backmatter
    sections.append(backmatter.strip())

    full_markdown = PB.join(sections)

    # Convert
    tmpdir = tempfile.mkdtemp(prefix='epub_build_')
    try:
        md_file = os.path.join(tmpdir, 'book.md')
        with open(md_file, 'w', encoding='utf-8') as f:
            f.write(full_markdown)

        epub_file = os.path.join(tmpdir, 'book.epub')
        print(f"Converting {len(chapter_files)} chapters via ebook-convert...")
        subprocess.run([
            'ebook-convert', md_file, epub_file,
            '--title', title,
            '--authors', author,
            '--language', 'en',
            '--chapter-mark', 'pagebreak',
            '--chapter', '//h:h1',
            '--level1-toc', '//h:h1',
            '--level2-toc', '//h:h2',
            '--level3-toc', '//h:h3',
            *(['--cover', COVER] if COVER else []),
        ], check=True, capture_output=True)

        # Polish: pretty-print only
        # IMPORTANT: Do NOT call from_xpaths() here — it overwrites
        # ebook-convert's working TOC/NCX
        from calibre.ebooks.oeb.polish.container import get_container
        from calibre.ebooks.oeb.polish.pretty import pretty_all

        container = get_container(epub_file, tweak_mode=True)
        pretty_all(container)
        container.commit(output_file)

        info = {
            'message': f'EPUB created: {output_file}',
            'output': output_file,
            'version': version,
            'chapters': len(chapter_files),
            'file_size': os.path.getsize(output_file),
        }
        print('JSON_RESULT:' + json.dumps(info))
        return info
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


if __name__ == '__main__':
    # Example usage
    build_epub(
        files_dir=r'G:\Other computers\My Computer (1)\machinegeorge\levelupharem\ice labyrinth book 4\files',
        output_dir=r'G:\Other computers\My Computer (1)\machinegeorge\levelupharem\ice labyrinth book 4',
        title='Ice Labyrinth',
        author='George Saoulidis',
        ending_text='End of Book 4',
    )
