window.mergeData = function(existing, imported) {
  if (!existing || Object.keys(existing).length === 0) return imported;
  if (!imported || Object.keys(imported).length === 0) return existing;
  const dayMap = new Map();
  [...(existing.dailyHistory||[]), ...(imported.dailyHistory||[])].forEach(d => {
    const k = d.date;
    const e = dayMap.get(k);
    if (e) { e.royalties=Math.max(e.royalties||0,d.royalties||0); e.units=Math.max(e.units||0,d.units||0); e.pageReads=Math.max(e.pageReads||0,d.pageReads||0); }
    else dayMap.set(k, {...d});
  });
  const bookMap = new Map();
  [...(existing.books||[]), ...(imported.books||[])].forEach(b => {
    const k = b.asin||b.title;
    const e = bookMap.get(k);
    if (e) { e.royalties=Math.max(e.royalties||0,b.royalties||0); e.units=Math.max(e.units||0,b.units||0); e.pageReads=Math.max(e.pageReads||0,b.pageReads||0); }
    else bookMap.set(k, {...b});
  });
  return {
    books: Array.from(bookMap.values()).sort((a,b)=>(b.royalties||0)-(a.royalties||0)),
    dailyHistory: Array.from(dayMap.values()).sort((a,b)=>(a.date||'').localeCompare(b.date||'')),
    today: imported.today || existing.today,
    thisMonth: imported.thisMonth || existing.thisMonth,
    last30Days: imported.last30Days || existing.last30Days,
    lastUpdated: new Date().toISOString()
  };
};
