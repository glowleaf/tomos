export class KDPParser {
  static parseDateRangeResponse(data) {
    try {
      return {
        date: data.date || data.reportDate || null,
        totalRoyalties: data.totalRoyalties || data.totalEarnings || data.royalties || 0,
        totalUnits: data.totalUnits || data.units || data.sales || 0,
        totalPageReads: data.totalPageReads || data.kenp || data.pageReads || 0,
        books: (data.books || data.titles || data.items || []).map(KDPParser.parseBookData)
      };
    } catch (e) {
      return null;
    }
  }

  static parseBookData(book) {
    return {
      asin: book.asin || book.id || '',
      title: book.title || book.name || 'Unknown',
      royalties: parseFloat(book.royalties || book.earnings || book.royalty || 0),
      units: parseInt(book.units || book.sales || book.quantity || 0, 10),
      pageReads: parseInt(book.pageReads || book.kenp || book.pages || 0, 10),
      returns: parseInt(book.returns || book.refunds || 0, 10),
      avgRoyalty: parseFloat(book.avgRoyalty || book.averageRoyalty || 0),
      kuBorrows: parseInt(book.kuBorrows || book.borrows || 0, 10)
    };
  }

  static parseSummaryResponse(data) {
    try {
      return {
        today: data.today ? KDPParser.parseDateRangeResponse(data.today) : null,
        thisMonth: data.thisMonth ? KDPParser.parseDateRangeResponse(data.thisMonth) : null,
        last30Days: data.last30Days ? KDPParser.parseDateRangeResponse(data.last30Days) : null,
        lifetime: data.lifetime ? KDPParser.parseDateRangeResponse(data.lifetime) : null,
        lastUpdated: new Date().toISOString()
      };
    } catch (e) {
      return null;
    }
  }

  static tryParseAny(json, url) {
    if (KDPParser.looksLikeSalesData(json)) {
      return KDPParser.parseDateRangeResponse(json);
    }
    if (KDPParser.looksLikeSummaryData(json)) {
      return KDPParser.parseSummaryResponse(json);
    }
    return null;
  }

  static looksLikeSalesData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj).map(k => k.toLowerCase());
    return (keys.some(k => ['royalties', 'earnings', 'royalty'].includes(k)) &&
            keys.some(k => ['units', 'sales', 'quantity'].includes(k))) ||
           (Array.isArray(obj.books) || Array.isArray(obj.titles) || Array.isArray(obj.items));
  }

  static looksLikeSummaryData(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return !!(obj.today || obj.thisMonth || obj.last30Days);
  }

  static mergeWithStored(newData, stored) {
    if (!stored) return newData;
    return {
      today: newData.today || stored.today,
      thisMonth: newData.thisMonth || stored.thisMonth,
      last30Days: newData.last30Days || stored.last30Days,
      lifetime: KDPParser.mergeTimeSeries(stored.lifetime, newData.lifetime),
      dailyHistory: KDPParser.mergeDailyHistory(stored.dailyHistory || [], newData),
      lastUpdated: new Date().toISOString()
    };
  }

  static mergeTimeSeries(existing, incoming) {
    if (!existing) return incoming;
    if (!incoming) return existing;
    return {
      royalties: (existing.royalties || 0) + (incoming.royalties || 0),
      units: (existing.units || 0) + (incoming.units || 0),
      pageReads: (existing.pageReads || 0) + (incoming.pageReads || 0)
    };
  }

  static mergeDailyHistory(history, newData) {
    const map = new Map();
    history.forEach(h => {
      const key = h.date || h.day;
      if (key) map.set(key, h);
    });
    if (newData.today && newData.today.date) {
      map.set(newData.today.date, {
        date: newData.today.date,
        royalties: newData.today.totalRoyalties,
        units: newData.today.totalUnits,
        pageReads: newData.today.totalPageReads
      });
    }
    return Array.from(map.values()).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }
}

export default KDPParser;
