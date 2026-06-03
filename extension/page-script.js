(function() {
  'use strict';

  function send(type, data, url) {
    window.postMessage({ source: 'tomos-page-script', type, data, url }, '*');
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
    if (json && looksLikeSales(json)) {
      send('sales-data', json, url);
    }
  }

  // Override fetch
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    return origFetch.apply(this, arguments).then(function(resp) {
      const ct = (resp.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('json')) {
        resp.clone().text().then(function(text) {
          if (text && text.length < 500000) sendIfSales(tryParseJSON(text), url);
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
          }
        }
        if (origRSC) origRSC.apply(xhr, arguments);
      };
      return origSend.apply(this, arguments);
    };
  }

  send('ready', {});
})();
