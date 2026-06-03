(function() {
  'use strict';

  function sendToExtension(type, data, url) {
    window.postMessage({ source: 'tomos-page-script', type, data, url, timestamp: new Date().toISOString() }, '*');
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function showToast(msg, type) {
    const el = document.createElement('div');
    const bg = type === 'warning' ? '#d69e2e' : type === 'error' ? '#e53e3e' : '#48bb78';
    el.style.cssText = `position:fixed;bottom:70px;right:20px;z-index:99999;background:${bg};color:#fff;padding:12px 18px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,0.2);max-width:360px;line-height:1.4;font-family:system-ui,sans-serif;`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), type === 'warning' ? 8000 : 4000);
  }

  // Inject instruction button
  function injectButton() {
    if (document.getElementById('tomos-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'tomos-btn';
    btn.innerHTML = '⬇ Tomos Import';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;background:#2b6cb0;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(43,108,176,0.5);transition:all 0.2s;font-family:system-ui,sans-serif;';
    btn.addEventListener('mouseenter', () => { btn.style.background = '#1a365d'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#2b6cb0'; });
    btn.addEventListener('click', () => {
      btn.textContent = '⏳ Trying auto-import...';
      btn.disabled = true;
      tryAutoImport(btn);
    });
    document.body.appendChild(btn);
  }

  async function tryAutoImport(btn) {
    let found = false;

    // Method 1: Look for existing download links on the page
    const urls = findDownloadURLs();
    for (const url of urls) {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (resp.ok) {
          const ct = resp.headers.get('content-type') || '';
          const buffer = await resp.arrayBuffer();
          if (buffer.byteLength > 1000) {
            const b64 = arrayBufferToBase64(buffer);
            sendToExtension('xlsx-data', { b64, url, contentType: ct, size: buffer.byteLength }, url);
            found = true;
          }
        }
      } catch {}
    }

    if (found) {
      showToast('Import started! Data will appear in the dashboard.', 'success');
      btn.textContent = '✓ Import sent';
      btn.style.background = '#48bb78';
      setTimeout(() => { btn.textContent = '⬇ Tomos Import'; btn.style.background = '#2b6cb0'; btn.disabled = false; }, 3000);
    } else {
      showToast('No report URL found. Click KDP\'s "Download Report" button — the file will import automatically when downloaded. Or drag the .xlsx file into the Tomos dashboard.', 'warning');
      btn.textContent = '⬇ Tomos Import';
      btn.disabled = false;
    }
  }

  function findDownloadURLs() {
    const urls = new Set();

    // Check <a> tags with download or xlsx href
    document.querySelectorAll('a[download], a[href*=".xlsx"], a[href*="/download"], a[href*="/report"]').forEach(a => {
      if (a.href) urls.add(a.href);
    });

    // Check data attributes on any element
    document.querySelectorAll('[data-download-url], [data-report-url], [data-href*=".xlsx"]').forEach(el => {
      const v = el.getAttribute('data-download-url') || el.getAttribute('data-report-url') || el.getAttribute('data-href');
      if (v) urls.add(v.startsWith('http') ? v : new URL(v, location.origin).href);
    });

    // Check forms
    document.querySelectorAll('form[action*="download"], form[action*="report"], form[action*=".xlsx"]').forEach(f => {
      if (f.action) urls.add(f.action);
    });

    return Array.from(urls);
  }

  // Auto-capture: Intercept fetch for XLSX downloads
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    return originalFetch.apply(this, arguments).then(function(response) {
      if (url && response.ok) {
        const ct = (response.headers.get('content-type') || '').toLowerCase();
        const cd = (response.headers.get('content-disposition') || '').toLowerCase();
        if (ct.includes('vnd.openxmlformats') || ct.includes('spreadsheetml') || cd.includes('.xlsx') || url.includes('.xlsx')) {
          response.clone().arrayBuffer().then(function(buffer) {
            if (buffer.byteLength > 1000) {
              sendToExtension('xlsx-data', {
                b64: arrayBufferToBase64(buffer), url, contentType: ct, size: buffer.byteLength
              }, url);
              const btn = document.getElementById('tomos-btn');
              if (btn) { btn.textContent = '✓ Captured!'; btn.style.background = '#48bb78'; }
              showToast('KDP report captured! Open Tomos dashboard to view.', 'success');
            }
          }).catch(() => {});
        }
      }
      return response;
    }).catch(function(err) { throw err; });
  };

  // Auto-capture: Intercept XHR for XLSX downloads
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    XHR.prototype.open = function(method, url) {
      this._tUrl = typeof url === 'string' ? url : (url ? url.toString() : '');
      return origOpen.apply(this, arguments);
    };
    XHR.prototype.send = function(body) {
      const xhr = this;
      const url = xhr._tUrl || '';
      const origRSC = xhr.onreadystatechange;
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && url && xhr.status >= 200) {
          const ct = (xhr.getResponseHeader('content-type') || '').toLowerCase();
          if (ct.includes('vnd.openxmlformats') || ct.includes('spreadsheetml') || url.includes('.xlsx')) {
            const data = xhr.response;
            if (data instanceof ArrayBuffer && data.byteLength > 1000) {
              sendToExtension('xlsx-data', { b64: arrayBufferToBase64(data), url, contentType: ct, size: data.byteLength }, url);
            } else if (data instanceof Blob && data.size > 1000) {
              const r = new FileReader();
              r.onload = () => sendToExtension('xlsx-data', { b64: r.result.split(',')[1], url, contentType: ct, size: data.size }, url);
              r.readAsDataURL(data);
            }
          }
        }
        if (origRSC) origRSC.apply(xhr, arguments);
      };
      return origSend.apply(this, arguments);
    };
  }

  // Watch for dynamically created download links (common in SPAs)
  const observer = new MutationObserver(function(mutations) {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (node.tagName === 'A' && (node.download || (node.href && node.href.includes('.xlsx')))) {
            node.addEventListener('click', function(e) {
              if (this.href && this.download) {
                e.preventDefault();
                fetch(this.href, { credentials: 'include' }).then(r => {
                  if (r.ok) {
                    const ct = r.headers.get('content-type') || '';
                    r.arrayBuffer().then(buf => {
                      sendToExtension('xlsx-data', { b64: arrayBufferToBase64(buf), url: this.href, contentType: ct, size: buf.byteLength }, this.href);
                      showToast('KDP report captured!', 'success');
                    });
                  }
                }).catch(() => {});
              }
            }, true);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('a[download], a[href*=".xlsx"]').forEach(a => {
              a.addEventListener('click', function(e) {
                if (this.href && this.download) {
                  e.preventDefault();
                  fetch(this.href, { credentials: 'include' }).then(r => {
                    if (r.ok) {
                      r.arrayBuffer().then(buf => {
                        sendToExtension('xlsx-data', { b64: arrayBufferToBase64(buf), url: this.href, contentType: r.headers.get('content-type') || '', size: buf.byteLength }, this.href);
                        showToast('KDP report captured!', 'success');
                      });
                    }
                  }).catch(() => {});
                }
              }, true);
            });
          }
        }
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Inject button when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }

  sendToExtension('page-script-ready', {});
})();
