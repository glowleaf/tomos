# Tomos Book Sales

A standalone HTML dashboard for Amazon KDP sales data. Drop your KDP export files — everything parses locally in your browser. No data is ever uploaded to any server.

**[Live Demo](https://tomos.georgesaoulidis.com/sales.html)**

## Features

- **Today tab**: Latest sales with hero stats, pie chart, bar chart, top books
- **History tab**: 30-day / 90-day / Lifetime views with charts and book rankings per period
- **KU estimates**: Estimated KENP royalties at ~$0.00335/page, shown separately and combined with confirmed sales
- **Ads tab**: Import Amazon Campaign CSV with spend, sales, ROAS, net profit
- **Books tab**: Full catalog with search and sort
- **Import tab**: Drop KDP Orders XLSX, KENP Read XLSX, or Ads CSV — auto-routes to the right parser
- **Privacy**: All processing client-side via File API. Data stays in your browser's localStorage. Download the HTML to run fully offline.

## Usage

1. Go to [KDP Reports](https://kdpreports.amazon.com/dashboard)
2. Download the **Orders** report (90-day range) and **KENP Read** report (90-day range)
3. Open `sales.html` in Chrome
4. Drop both `.xlsx` files on the Import tab
5. Also drop your Amazon Ads CSV if you have one

Or upload to any static host (Netlify, GitHub Pages, S3, etc.) — no backend needed. Just upload `sales.html` and the `extension/` folder.

## How It Works

- **Combined Sales** sheet → per-transaction royalties and units, aggregated by date and ASIN
- **KENP Read** sheet → daily page reads, aggregated into monthly totals
- KU estimated royalties at ~$0.00335/page are added to confirmed sales for the total
- Overlapping daily/monthly exports are normalized on import — monthly entries supersede daily entries for the same period

## File Structure

```
sales.html              - Main dashboard
extension/
  lib/
    xlsx.full.min.js    - SheetJS (Excel parsing)
    xlsx-parser.js      - KDP XLSX → app data converter
  icons/
    icon128.png         - Logo
favicon.ico             - Browser tab icon
```

## Version

v1.5.1

Built by [George Saoulidis](https://georgesaoulidis.com)
