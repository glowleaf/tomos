const STORAGE_KEY = 'tomos_data';

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupActions();
});

async function loadData() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const data = result[STORAGE_KEY] || {};
    try { render(data); } catch (e) { console.error(e); }
  } catch {
    try { render({}); } catch {}
  }
}

function render(data) {
  const hasData = data.dailyHistory && data.dailyHistory.length > 0;
  const guide = document.getElementById('stepGuide');
  if (hasData) guide.style.display = 'none';
  else guide.style.display = 'block';

  const history = data.dailyHistory || [];
  const latest = history.length > 0 ? history[history.length - 1] : null;

  document.getElementById('heroAmount').textContent = latest ? fmt$(latest.royalties) : '$0.00';
  document.getElementById('heroSub').textContent = latest
    ? `from ${(data.books || []).length} books on ${fmtD(latest.date)}`
    : 'Import KDP reports to get started';

  const last30 = history.slice(-30);
  const monthR = last30.reduce((s, d) => s + (d.royalties || 0), 0);
  const last30R = last30.reduce((s, d) => s + (d.royalties || 0), 0);
  const last30P = last30.reduce((s, d) => s + (d.pageReads || 0), 0);

  document.getElementById('miniMonth').textContent = fmt$(monthR);
  document.getElementById('mini30').textContent = fmt$(last30R);
  document.getElementById('miniKU').textContent = fmt(last30P);

  const books = data.books || [];
  const recentEl = document.getElementById('recentBooks');
  if (books.length === 0) {
    recentEl.innerHTML = '<div class="recent-item dim">Data appears here after import</div>';
  } else {
    const top = [...books].sort((a, b) => (b.royalties || 0) - (a.royalties || 0)).slice(0, 5);
    recentEl.innerHTML = top.map(b => `
      <div class="recent-item">
        <span class="recent-title">${esc(b.title)}</span>
        <span class="recent-earnings">${fmt$(b.royalties)}</span>
      </div>
    `).join('');
  }

  document.getElementById('footerSync').textContent = data.lastUpdated
    ? 'Updated ' + timeAgo(new Date(data.lastUpdated))
    : 'Click "Open KDP Reports" to start';
}

function setupActions() {
  document.getElementById('openDashboardBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  });
  document.getElementById('openKdpBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://kdpreports.amazon.com/dashboard' });
  });
}

function fmt$(n) {
  if (n == null || isNaN(n)) return '$0.00';
  return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function fmtD(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  catch { return d; }
}

function timeAgo(date) {
  const sec = Math.floor((Date.now() - date) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  return Math.floor(sec / 86400) + 'd ago';
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
