export function mergeData(existing, imported) {
  if (!existing || Object.keys(existing).length === 0) return imported;
  if (!imported || Object.keys(imported).length === 0) return existing;

  const dailyMap = new Map();

  (existing.dailyHistory || []).forEach(d => {
    const key = d.date || d.day;
    if (key) dailyMap.set(key, d);
  });

  (imported.dailyHistory || []).forEach(d => {
    const key = d.date || d.day;
    if (key) {
      const existingEntry = dailyMap.get(key);
      if (existingEntry) {
        dailyMap.set(key, {
          date: key,
          royalties: Math.max(existingEntry.royalties || 0, d.royalties || 0),
          units: Math.max(existingEntry.units || 0, d.units || 0),
          pageReads: Math.max(existingEntry.pageReads || 0, d.pageReads || 0)
        });
      } else {
        dailyMap.set(key, d);
      }
    }
  });

  const bookMap = new Map();
  const collectBooks = (source) => {
    if (!source || !source.books) return;
    source.books.forEach(b => {
      const key = b.asin || b.title || Math.random().toString();
      const existing = bookMap.get(key);
      if (existing) {
        existing.royalties = Math.max(existing.royalties, b.royalties || 0);
        existing.units = Math.max(existing.units, b.units || 0);
        existing.pageReads = Math.max(existing.pageReads, b.pageReads || 0);
      } else {
        bookMap.set(key, { ...b });
      }
    });
  };

  collectBooks(existing);
  collectBooks(imported);

  const books = Array.from(bookMap.values());

  return {
    today: imported.today || existing.today,
    thisMonth: imported.thisMonth || existing.thisMonth,
    last30Days: imported.last30Days || existing.last30Days,
    lifetime: imported.lifetime || existing.lifetime,
    dailyHistory: Array.from(dailyMap.values()).sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    lastUpdated: new Date().toISOString()
  };
}
