(function() {
  'use strict';

  const STORAGE_KEY = 'tomos_data';
  let XLSXParser = null;

  async function loadXLSXParser() {
    if (XLSXParser) return XLSXParser;
    try {
      const mod = await import(chrome.runtime.getURL('lib/xlsx-parser.js'));
      XLSXParser = mod.default || mod.KDPXLSXParser;
      return XLSXParser;
    } catch {
      return null;
    }
  }

  function injectPageScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page-script.js');
      script.onload = function() { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch {}
  }

  async function processXLSX(b64, url) {
    try {
      const ParserClass = await loadXLSXParser();
      if (!ParserClass) return;
      const parser = new ParserClass();

      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const parsed = await parser.parse(bytes.buffer);
      const appData = parser.toAppData(parsed);

      if (!appData || (!appData.books && !appData.dailyHistory)) return;

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] || {};

      let merged;
      try {
        const mergeMod = await import(chrome.runtime.getURL('lib/merge-helper.js'));
        merged = mergeMod.mergeData(stored, appData);
      } catch {
        merged = appData;
      }

      merged.lastUpdated = new Date().toISOString();
      merged.lastSource = url;
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });

      chrome.runtime.sendMessage({ type: 'tomos-data-updated', data: merged }).catch(() => {});
      window.postMessage({ source: 'tomos-content-script', type: 'import-done', data: { books: (appData.books || []).length } }, '*');
      showToast('Data imported from KDP');
    } catch (e) {
      showToast('Import error: ' + e.message);
    }
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:70px;right:20px;z-index:99999;background:#1a202c;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'tomos-page-script') return;

    if (msg.type === 'xlsx-data') {
      processXLSX(msg.data.b64, msg.data.url);
    }
  });

  injectPageScript();
  loadXLSXParser();
})();
