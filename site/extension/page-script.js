(function() {
  'use strict';

  function send(type, data, url) {
    window.postMessage({ source: 'tomos-page-script', type, data, url }, '*');
  }

  // Wait for the injected parser to be available
  function waitForParser() {
    return new Promise(function(resolve) {
      function check() {
        if (typeof KDPXLSXParser !== 'undefined') resolve();
        else setTimeout(check, 5);
      }
      check();
    });
  }

  // Handle XLSX binary data: parse inline and send structured data back
  async function processXLSX(buffer, url) {
    try {
      await waitForParser();
      const parser = new KDPXLSXParser();
      const result = await parser.parse(buffer);
      const appData = parser.toAppData(result);
      if (appData && (appData.books || appData.dailyHistory)) {
        send('xlsx-parsed', appData, url);
      }
    } catch(e) {
      console.error('[Tomos] Parse error:', e);
    }
  }

  function tryParseJSON(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function looksLikeSales(obj) {
    if (!obj || typeof obj !== 'object') return false;
    const str = JSON.stringify(obj).toLowerCase();
    return str.includes('royalt') || str.includes('kenp') || str.includes('page read') ||
           (str.includes('unit') && (str.includes('sold') || str.includes('earning')));
  }

  function sendIfSales(json, url) {
    if (json && looksLikeSales(json)) send('sales-data', json, url);
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // Override fetch - captures XLSX AND JSON
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    return origFetch.apply(this, arguments).then(function(resp) {
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('json')) {
        resp.clone().text().then(function(text) {
          if (text && text.length < 500000) sendIfSales(tryParseJSON(text), url);
        }).catch(function() {});
      } else if (ct.includes('vnd.openxmlformats') || ct.includes('octet-stream') || url.includes('.xlsx')) {
        resp.clone().arrayBuffer().then(function(buf) {
          if (buf.byteLength > 100) processXLSX(buf, url);
        }).catch(function() {});
      }
      return resp;
    });
  };

  // Override XHR
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function(method, url) {
      this._tUrl = typeof url === 'string' ? url : (url ? String(url) : '');
      return origOpen.apply(this, arguments);
    };
    OrigXHR.prototype.send = function(body) {
      const xhr = this;
      const url = xhr._tUrl || '';
      const origRSC = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status >= 200 && url) {
          const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
          if (ct.includes('json')) {
            try {
              const text = xhr.responseText;
              if (text && text.length < 500000) sendIfSales(tryParseJSON(text), url);
            } catch(e) {}
          } else if (ct.includes('vnd.openxmlformats') || ct.includes('octet-stream') || url.includes('.xlsx')) {
            const data = xhr.response;
            if (data instanceof ArrayBuffer && data.byteLength > 100) processXLSX(data, url);
            else if (data instanceof Blob && data.size > 100) {
              const r = new FileReader();
              r.onload = function() { processXLSX(r.result, url); };
              r.readAsArrayBuffer(data);
            }
          }
        }
        if (origRSC) origRSC.apply(xhr, arguments);
      };
      return origSend.apply(this, arguments);
    };
  }

  send('ready', {});
})();
