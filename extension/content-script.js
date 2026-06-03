(function() {
  'use strict';

  const STORAGE_KEY = 'tomos_data';

  // Inject page script synchronously to avoid race conditions with KDP's API calls
  function injectPageScript() {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', chrome.runtime.getURL('page-script.js'), false);
    xhr.send();
    if (xhr.status === 200) {
      const script = document.createElement('script');
      script.textContent = xhr.responseText;
      document.documentElement.appendChild(script);
      script.remove();
    }
  }

  // Listen for data from page script
  window.addEventListener('message', async function(event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'tomos-page-script') return;

    if (msg.type === 'sales-data' && msg.data) {
      // JSON sales data from KDP API
      await storeData(msg.data, msg.url);
    }

    if (msg.type === 'xlsx-data' && msg.data && msg.data.b64) {
      await processXLSX(msg.data.b64, msg.data.url);
    }
  });

  async function processXLSX(b64, url) {
    try {
      const mod = await import(chrome.runtime.getURL('lib/xlsx-parser.js'));
      const ParserClass = mod.default;
      const parser = new ParserClass();
      const binaryStr = atob(b64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const parsed = await parser.parse(bytes.buffer);
      const appData = parser.toAppData(parsed);
      await storeData(appData, url);
    } catch (e) {
      showToast('Import: ' + e.message);
    }
  }

  async function storeData(appData, url) {
    if (!appData || (!appData.books && !appData.dailyHistory)) return;
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] || {};
    try {
      const mergeMod = await import(chrome.runtime.getURL('lib/merge-helper.js'));
      const merged = mergeMod.mergeData(stored, appData);
      merged.lastUpdated = new Date().toISOString();
      merged.lastSource = url;
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });
      chrome.runtime.sendMessage({ type: 'tomos-data-updated', data: merged }).catch(() => {});
      showToast('Tomos: data captured ✓');
    } catch {
      appData.lastUpdated = new Date().toISOString();
      appData.lastSource = url;
      await chrome.storage.local.set({ [STORAGE_KEY]: appData });
    }
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#48bb78;color:#fff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  injectPageScript();
})();
