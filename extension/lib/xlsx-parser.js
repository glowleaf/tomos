export class KDPXLSXParser {
  constructor() {
    this.sheetParsers = {
      'Summary': this.parseSummary.bind(this),
      'Combined Sales': this.parseCombinedSales.bind(this),
      'Orders Processed': this.parseOrdersProcessed.bind(this),
      'KENP': this.parseKENP.bind(this),
      'eBook Royalty': this.parseEbookRoyalty.bind(this),
      'Audiobook Royalty': this.parseAudiobookRoyalty.bind(this)
    };
  }

  async parseFromFile(file) {
    const buffer = await file.arrayBuffer();
    return this.parse(buffer);
  }

  async parseFromUrl(url) {
    const resp = await fetch(url, { credentials: 'include' });
    const buffer = await resp.arrayBuffer();
    return this.parse(buffer);
  }

  async parse(buffer) {
    const files = await this.readZip(buffer);
    const sheets = this.parseWorkbook(files['xl/workbook.xml']);
    const sharedStrings = this.parseSharedStrings(files['xl/sharedStrings.xml']);

    const result = {};
    for (const sheet of sheets) {
      const sheetXml = files[`xl/worksheets/sheet${sheet.id}.xml`];
      if (sheetXml) {
        const rows = this.parseSheetRows(sheetXml, sharedStrings);
        result[sheet.name] = rows;
      }
    }
    return result;
  }

  parseSummary(rows) {
    if (rows.length < 2) return null;
    const data = { months: [], totalRoyalties: 0, totalUnits: 0, totalKENP: 0 };
    rows.slice(1).forEach(row => {
      if (!row[0]) return;
      const month = {
        date: row[0],
        paidEbooks: parseFloat(row[1]) || 0,
        freeEbooks: parseFloat(row[2]) || 0,
        paperbacks: parseFloat(row[3]) || 0,
        hardcovers: parseFloat(row[4]) || 0,
        audiobooks: parseFloat(row[5]) || 0,
        kollBorrows: row[6],
        kenp: parseFloat(row[7]) || 0,
        royaltyUSD: parseFloat(row[8]) || 0,
        royaltyGBP: parseFloat(row[9]) || 0,
        royaltyEUR: parseFloat(row[10]) || 0,
        royaltyJPY: parseFloat(row[11]) || 0,
        royaltyCAD: parseFloat(row[12]) || 0,
        royaltyINR: parseFloat(row[13]) || 0
      };
      month.totalUnits = month.paidEbooks + month.freeEbooks + month.paperbacks + month.hardcovers + month.audiobooks;
      month.royaltyTotal = month.royaltyUSD + month.royaltyGBP + month.royaltyEUR;
      data.months.push(month);
      data.totalRoyalties += month.royaltyTotal;
      data.totalUnits += month.totalUnits;
      data.totalKENP += month.kenp;
    });
    return data;
  }

  parseCombinedSales(rows) {
    if (rows.length < 2) return [];
    const sales = {};
    rows.slice(1).forEach(row => {
      if (!row[0]) return;
      const asin = row[3] || 'unknown';
      const date = row[0];
      const unitsSold = parseFloat(row[7]) || 0;
      const unitsRefunded = parseFloat(row[8]) || 0;
      const netUnits = parseFloat(row[9]) || 0;
      const royalty = parseFloat(row[13]) || 0;
      const title = row[1] || 'Unknown';
      const marketplace = row[4] || '';
      const currency = row[14] || '';

      const key = `${asin}_${date}`;
      if (!sales[key]) {
        sales[key] = {
          asin, title, date, marketplace, currency,
          unitsSold: 0, unitsRefunded: 0, netUnits: 0, royalty: 0,
          transactions: []
        };
      }
      sales[key].unitsSold += unitsSold;
      sales[key].unitsRefunded += unitsRefunded;
      sales[key].netUnits += netUnits;
      sales[key].royalty += royalty;
      sales[key].transactions.push({
        type: row[5], transactionType: row[6], unitsSold, unitsRefunded, netUnits, royalty, currency
      });
    });
    return Object.values(sales);
  }

  parseOrdersProcessed(rows) {
    if (rows.length < 2) return [];
    const orders = {};
    rows.slice(1).forEach(row => {
      if (!row[0]) return;
      const key = `${row[3]}_${row[0]}`;
      if (!orders[key]) {
        orders[key] = {
          date: row[0], title: row[1] || 'Unknown', author: row[2] || '',
          asin: row[3] || '', marketplace: row[4] || '',
          paidUnits: 0, freeUnits: 0
        };
      }
      orders[key].paidUnits += parseFloat(row[5]) || 0;
      orders[key].freeUnits += parseFloat(row[6]) || 0;
    });
    return Object.values(orders);
  }

  parseKENP(rows) {
    if (rows.length < 2) return [];
    const kenpData = {};
    rows.slice(1).forEach(row => {
      if (!row[0] || !row[7]) return;
      const date = row[0];
      const title = row[1] || 'Unknown';
      const asin = row[3] || '';
      const marketplace = row[6] || '';
      const pages = parseFloat(row[7]) || 0;

      const key = `${asin}_${date}_${marketplace}`;
      if (!kenpData[key]) {
        kenpData[key] = { date, title, asin, marketplace, pages: 0 };
      }
      kenpData[key].pages += pages;
    });
    return Object.values(kenpData);
  }

  parseEbookRoyalty(rows) {
    if (rows.length < 2) return [];
    return rows.slice(1).filter(r => r[0]).map(row => ({
      date: row[0], title: row[1] || 'Unknown', author: row[2] || '',
      asin: row[3] || '', marketplace: row[4] || '',
      royaltyType: row[5] || '', transactionType: row[6] || '',
      unitsSold: parseFloat(row[7]) || 0, unitsRefunded: parseFloat(row[8]) || 0,
      netUnits: parseFloat(row[9]) || 0,
      listPrice: parseFloat(row[10]) || 0, offerPrice: parseFloat(row[11]) || 0,
      deliveryCost: row[12], royalty: parseFloat(row[14]) || 0, currency: row[15] || ''
    }));
  }

  parseAudiobookRoyalty(rows) {
    if (rows.length < 2) return [];
    return rows.slice(1).filter(r => r[0]).map(row => ({
      date: row[0], title: row[1] || 'Unknown', author: row[2] || '',
      asin: row[3] || '', marketplace: row[4] || '',
      royaltyType: row[5] || '', transactionType: row[6] || '',
      unitsSold: parseFloat(row[7]) || 0, unitsRefunded: parseFloat(row[8]) || 0,
      netUnits: parseFloat(row[9]) || 0,
      listPrice: parseFloat(row[10]) || 0, offerPrice: parseFloat(row[11]) || 0,
      royalty: parseFloat(row[12]) || 0, currency: row[13] || ''
    }));
  }

  toAppData(parsed) {
    const appData = { today: null, thisMonth: null, last30Days: null, dailyHistory: [], books: [], lastUpdated: new Date().toISOString() };

    if (parsed['Summary']) {
      const summary = this.parseSummary(parsed['Summary']);
      if (summary && summary.months.length > 0) {
        const latest = summary.months[0];
        appData.thisMonth = {
          date: latest.date, totalRoyalties: latest.royaltyTotal,
          totalUnits: latest.totalUnits, totalPageReads: latest.kenp,
          books: []
        };
      }
    }

    const bookMap = new Map();
    const dailyMap = new Map();

    if (parsed['Combined Sales']) {
      const sales = this.parseCombinedSales(parsed['Combined Sales']);
      sales.forEach(s => {
        const asinKey = s.asin || s.title;
        if (!bookMap.has(asinKey)) {
          bookMap.set(asinKey, { asin: s.asin, title: s.title, royalties: 0, units: 0, pageReads: 0 });
        }
        const b = bookMap.get(asinKey);
        b.royalties += s.royalty;
        b.units += s.netUnits;

        const dayKey = s.date;
        if (!dailyMap.has(dayKey)) {
          dailyMap.set(dayKey, { date: dayKey, royalties: 0, units: 0, pageReads: 0 });
        }
        const d = dailyMap.get(dayKey);
        d.royalties += s.royalty;
        d.units += s.netUnits;
      });
    }

    if (parsed['KENP']) {
      const kenp = this.parseKENP(parsed['KENP']);
      kenp.forEach(k => {
        const asinKey = k.asin || k.title;
        if (bookMap.has(asinKey)) {
          bookMap.get(asinKey).pageReads += k.pages;
        } else {
          bookMap.set(asinKey, { asin: k.asin, title: k.title, royalties: 0, units: 0, pageReads: k.pages });
        }
        const dayKey = k.date;
        if (dailyMap.has(dayKey)) {
          dailyMap.get(dayKey).pageReads += k.pages;
        } else {
          dailyMap.set(dayKey, { date: dayKey, royalties: 0, units: 0, pageReads: k.pages });
        }
      });
    }

    if (parsed['Orders Processed']) {
      const orders = this.parseOrdersProcessed(parsed['Orders Processed']);
      orders.forEach(o => {
        const asinKey = o.asin || o.title;
        if (!bookMap.has(asinKey)) {
          bookMap.set(asinKey, { asin: o.asin, title: o.title, royalties: 0, units: 0, pageReads: 0 });
        }
      });
    }

    appData.books = Array.from(bookMap.values()).sort((a, b) => b.royalties - a.royalties);
    appData.dailyHistory = Array.from(dailyMap.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (appData.dailyHistory.length > 0) {
      const latest = appData.dailyHistory[appData.dailyHistory.length - 1];
      appData.today = {
        date: latest.date, totalRoyalties: latest.royalties,
        totalUnits: latest.units, totalPageReads: latest.pageReads,
        books: appData.books.slice(0, 20)
      };
    }

    if (appData.dailyHistory.length > 0) {
      const thirtyDays = appData.dailyHistory.slice(-30);
      appData.last30Days = {
        totalRoyalties: thirtyDays.reduce((s, d) => s + d.royalties, 0),
        totalUnits: thirtyDays.reduce((s, d) => s + d.units, 0),
        totalPageReads: thirtyDays.reduce((s, d) => s + d.pageReads, 0),
        books: appData.books.slice(0, 20)
      };
    }

    return appData;
  }

  // ZIP reader
  async readZip(buffer) {
    const u8 = new Uint8Array(buffer);
    const files = {};

    const eocd = this.findEOCD(u8);
    const cdOffset = this.readU32(u8, eocd + 16);
    const cdEntries = this.readU16(u8, eocd + 10);
    const cdSize = this.readU32(u8, eocd + 12);
    const cdEnd = cdOffset + cdSize;

    let pos = cdOffset;
    for (let i = 0; i < cdEntries && pos < cdEnd; i++) {
      if (this.readU32(u8, pos) !== 0x02014b50) break;
      const fileNameLen = this.readU16(u8, pos + 28);
      const extraLen = this.readU16(u8, pos + 30);
      const commentLen = this.readU16(u8, pos + 32);
      const localOffset = this.readU32(u8, pos + 42);
      const compMethod = this.readU16(u8, pos + 10);
      const compSize = this.readU32(u8, pos + 20);
      const uncompSize = this.readU32(u8, pos + 24);

      const fileNameBytes = u8.slice(pos + 46, pos + 46 + fileNameLen);
      const fileName = new TextDecoder().decode(fileNameBytes).replace(/\\/g, '/');

      if (fileName.includes('/') && !fileName.endsWith('/')) {
        const fileData = this.readLocalFile(u8, localOffset, compMethod, compSize, uncompSize);
        if (fileData) {
          files[fileName] = fileData;
        }
      }

      pos += 46 + fileNameLen + extraLen + commentLen;
    }

    return files;
  }

  findEOCD(u8) {
    const sig = 0x06054b50;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    for (let i = u8.length - 22; i >= 0; i--) {
      if (view.getUint32(i, true) === sig) return i;
    }
    throw new Error('EOCD not found');
  }

  readLocalFile(u8, offset, method, compSize, uncompSize) {
    if (this.readU32(u8, offset) !== 0x04034b50) return null;
    const fileNameLen = this.readU16(u8, offset + 26);
    const extraLen = this.readU16(u8, offset + 28);
    const dataStart = offset + 30 + fileNameLen + extraLen;

    if (method === 0) {
      return u8.slice(dataStart, dataStart + uncompSize);
    } else if (method === 8) {
      return this.inflate(u8.slice(dataStart, dataStart + compSize), uncompSize);
    }
    return null;
  }

  async inflate(data, uncompSize) {
    try {
      const cs = new DecompressionStream('deflate-raw');
      const writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();
      const reader = cs.readable.getReader();
      const chunks = [];
      let total = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      const result = new Uint8Array(total);
      let pos = 0;
      for (const chunk of chunks) {
        result.set(chunk, pos);
        pos += chunk.length;
      }
      return result;
    } catch (e) {
      return null;
    }
  }

  parseWorkbook(xmlData) {
    if (!xmlData) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(new TextDecoder().decode(xmlData), 'text/xml');
    const sheets = [];
    doc.querySelectorAll('sheet').forEach(el => {
      sheets.push({
        id: parseInt(el.getAttribute('sheetId')),
        name: el.getAttribute('name')
      });
    });
    return sheets;
  }

  parseSharedStrings(xmlData) {
    if (!xmlData) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(new TextDecoder().decode(xmlData), 'text/xml');
    const strs = [];
    doc.querySelectorAll('si').forEach(si => {
      const t = si.querySelector('t');
      strs.push(t ? t.textContent : '');
    });
    return strs;
  }

  parseSheetRows(xmlData, sharedStrings) {
    if (!xmlData) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(new TextDecoder().decode(xmlData), 'text/xml');
    const rows = [];
    doc.querySelectorAll('row').forEach(rowEl => {
      const cells = [];
      rowEl.querySelectorAll('c').forEach(cell => {
        const v = cell.querySelector('v');
        const type = cell.getAttribute('t');
        const ref = cell.getAttribute('r');
        let value = v ? v.textContent : '';
        if (type === 's' && value) {
          value = sharedStrings[parseInt(value)] || value;
        }
        const colMatch = ref ? ref.match(/^([A-Z]+)/) : null;
        const colIndex = colMatch ? this.colToIndex(colMatch[1]) : cells.length;
        cells[colIndex] = value;
      });
      rows.push(cells);
    });
    return rows;
  }

  colToIndex(col) {
    let result = 0;
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result - 1;
  }

  readU16(u8, pos) {
    return (u8[pos] | (u8[pos + 1] << 8));
  }

  readU32(u8, pos) {
    return u8[pos] | (u8[pos + 1] << 8) | (u8[pos + 2] << 16) | (u8[pos + 3] << 24);
  }
}

export default KDPXLSXParser;
