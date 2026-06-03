(function() {
  'use strict';
  const STORAGE_KEY = 'tomos_data';
  const INJECTED = {};

  function fetchAndInject(url) {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.runtime.getURL(url), false);
    xhr.send();
    if (xhr.status === 200) {
      const s = document.createElement('script');
      s.textContent = xhr.responseText;
      document.documentElement.appendChild(s);
      s.remove();
      return true;
    }
    return false;
  }

  // Inject all required scripts into page context
  fetchAndInject('page-script.js');
  fetchAndInject('lib/xlsx-parser.js');
  fetchAndInject('lib/merge-helper.js');

  window.addEventListener('message', async function(event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'tomos-page-script') return;

    if (msg.type === 'sales-data' && msg.data) {
      await storeData(msg.data, msg.url);
    }

    if (msg.type === 'xlsx-parsed' && msg.data) {
      await storeData(msg.data, msg.url);
    }
  });

  async function storeData(appData, url) {
    if (!appData || (!appData.books && !appData.dailyHistory)) return;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] || {};

    const dayMap = new Map();
    [...(stored.dailyHistory||[]), ...(appData.dailyHistory||[])].forEach(d => {
      const k = d.date;
      const e = dayMap.get(k);
      if (e) { e.royalties=Math.max(e.royalties||0,d.royalties||0); e.units=Math.max(e.units||0,d.units||0); e.pageReads=Math.max(e.pageReads||0,d.pageReads||0); }
      else dayMap.set(k, {...d});
    });

    const bookMap = new Map();
    [...(stored.books||[]), ...(appData.books||[])].forEach(b => {
      const k = b.asin||b.title;
      const e = bookMap.get(k);
      if (e) { e.royalties=Math.max(e.royalties||0,b.royalties||0); e.units=Math.max(e.units||0,b.units||0); e.pageReads=Math.max(e.pageReads||0,b.pageReads||0); }
      else bookMap.set(k, {...b});
    });

    const merged = {
      books: Array.from(bookMap.values()).sort((a,b)=>(b.royalties||0)-(a.royalties||0)),
      dailyHistory: Array.from(dayMap.values()).sort((a,b)=>(a.date||'').localeCompare(b.date||'')),
      today: appData.today || stored.today,
      thisMonth: appData.thisMonth || stored.thisMonth,
      last30Days: appData.last30Days || stored.last30Days,
      lastUpdated: new Date().toISOString(),
      lastSource: url
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    chrome.runtime.sendMessage({ type: 'tomos-data-updated', data: merged }).catch(() => {});
  }
})();
