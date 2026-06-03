# Tomos Book Sales

A standalone HTML dashboard for Amazon KDP sales data. Drop your KDP export files (XLSX) and Amazon Ads CSV — everything parses locally in your browser. No data is ever uploaded to any server.

## Features

- **Today tab**: Latest day (or latest month for monthly exports) with hero stats, pie chart, bar chart, and top 30-day books
- **History tab**: Same layout with 30 Day / Lifetime toggle — recalculates all charts and book rankings based on selected period
- **Ads tab**: Import Amazon Campaign CSV with 30 Day / Lifetime toggle — shows spend, sales, ROAS, net profit, and a comparison with book sales for the same period
- **Books tab**: Full lifetime book catalog with search and sort
- **Import tab**: Drop KDP XLSX, CSV, or JSON files — auto-routes to the right parser
- **30-day calendar filter**: Calculates cutoff date (30 days before latest data) and filters all entries — works with any mix of daily and monthly data
- **Monthly detection**: Handles both ISO dates (`2026-05`) and named months (`May 2026`) — aggregates daily KENP into monthly entries for correct per-month totals
- **Privacy**: All processing is client-side via the File API. Data persists only in browser localStorage. Download the HTML to run fully offline.

## File Structure

```
tomos.html              - Main dashboard (all HTML/CSS/JS inline)
extension/
  lib/
    xlsx.full.min.js    - SheetJS (Excel parsing)
    xlsx-parser.js      - KDP XLSX → app data converter
  icons/
    icon128.png         - Logo
```

## Usage

1. Go to https://kdpreports.amazon.com/dashboard and click "Download Report"
2. Open `tomos.html` in Chrome
3. Drop the `.xlsx` file(s) on the Import tab

Or upload to any static host (Netlify, GitHub Pages, S3, etc.) — no backend needed.

## Data Parsing

- **Combined Sales sheet**: Per-transaction royalties and units — aggregated by date and by ASIN
- **KENP sheet**: Daily page reads — aggregated into monthly totals when monthly Combined Sales data is detected
- **Summary sheet**: Monthly totals used for "This Month" stat
- **Ads CSV**: Per-campaign spend, sales, purchases — filtered by start date for 30-day view

## Version

v1.1.0
