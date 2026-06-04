# Tomos

AI-powered book production tools. Built for [OpenCode](https://georgesaoulidis.com/opencodedownload).

[**tomos.georgesaoulidis.com**](https://tomos.georgesaoulidis.com/)

## What's in this repo

- **Tomos Writing** — EPUB production, GitHub backups, and publishing tools for OpenCode ([opencode.json](opencode.json))
- **Tomos Sales Dashboard** — A standalone HTML dashboard for Amazon KDP sales data ([sales.html](sales.html))

---

## Sales Dashboard

Drop your KDP export files — everything parses locally. No data uploaded.

**[Open Dashboard →](https://tomos.georgesaoulidis.com/sales.html)**

### Features

- **Today tab**: Latest sales with pie chart, bar chart, top books
- **History tab**: 30-day / 90-day / Lifetime views with KU estimates
- **Ads tab**: Amazon Campaign CSV import with ROAS and profit
- **Books tab**: Full book catalog with search and sort
- **KU estimates** at ~$0.00335/page, combined with confirmed sales
- **Privacy**: All client-side via File API. Data stays in your browser. [Download the HTML](https://raw.githubusercontent.com/glowleaf/tomos/master/tomos.html) to run offline.

### Usage

1. Go to [KDP Reports](https://kdpreports.amazon.com/dashboard)
2. Download **Orders** report (90-day) and **KENP Read** report (90-day)
3. Open `sales.html` in Chrome
4. Drop both files on Import tab

Upload `sales.html` and the `extension/` folder to any static host — no backend needed.

---

## Writing Tools

The [opencode.json](opencode.json) file adds Tomos skills to [OpenCode](https://georgesaoulidis.com/opencodedownload):

- **EPUB production** — Build EPUBs from chapter files with proper metadata and TOC
- **Smashwords-compliant** — Passes Premium Catalog requirements
- **GitHub backup** — One-command backup to GitHub
- **Facebook community**: [facebook.com/groups/1297149265881814](https://www.facebook.com/groups/1297149265881814)

### Install

Download `opencode.json` and place it in your book folder. Open OpenCode and point it to that folder.

---

Built by [George Saoulidis](https://georgesaoulidis.com)
