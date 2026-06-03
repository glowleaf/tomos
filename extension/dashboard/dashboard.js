const STORAGE_KEY = 'tomos_data';
let data = {};
let allBooks = [];
let dailyHistory = [];

document.addEventListener('DOMContentLoaded', () => {
  loadData().then(() => {
    setupTabs();
    setupActions();
    setupDropZone();
  });
});

async function loadData() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    data = result[STORAGE_KEY] || {};
  } catch { data = {}; }
  allBooks = data.books || [];
  dailyHistory = data.dailyHistory || [];
  try { renderAll(); } catch (e) { console.error('Tomos render error:', e); }
}

async function saveData() {
  data.books = allBooks;
  data.dailyHistory = dailyHistory;
  data.lastUpdated = new Date().toISOString();
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

function safe(fn) { try { fn(); } catch (e) { console.error('Tomos:', e); } }
function renderAll() {
  safe(renderToday);
  safe(renderStats);
  safe(() => renderTopBooks(10));
  safe(() => renderTrendChart('trendChart', dailyHistory, '#4299e1'));
  safe(renderHistoryTable);
  safe(renderHistoricalChart);
  safe(renderAllBooks);
  safe(renderSeries);
  safe(renderSettings);
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
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}

function renderToday() {
  const hAmt = document.getElementById('todayAmount');
  const hDate = document.getElementById('todayDate');
  const hCount = document.getElementById('todayBookCount');
  const hExtra = document.getElementById('todayExtra');

  const latest = dailyHistory.length > 0 ? dailyHistory[dailyHistory.length - 1] : null;
  if (latest) {
    hAmt.textContent = fmt$(latest.royalties);
    hDate.textContent = fmtD(latest.date);
    hCount.textContent = latest.books ? latest.books.length : allBooks.length;
    hExtra.textContent = `${fmt(latest.units)} units · ${fmt(latest.pageReads)} KU pages`;
  } else {
    hAmt.textContent = '$0.00';
    hDate.textContent = 'No data';
    hCount.textContent = '0';
    hExtra.textContent = 'Import KDP reports to start';
  }
}

function renderStats() {
  const mE = document.getElementById('monthEarnings');
  const mU = document.getElementById('monthUnits');
  const lE = document.getElementById('last30Earnings');
  const lU = document.getElementById('last30Units');
  const pR = document.getElementById('totalPageReads');
  const tB = document.getElementById('totalBorrows');
  const aR = document.getElementById('avgRoyalty');
  const aI = document.getElementById('avgUnitInfo');

  if (data.thisMonth) {
    mE.textContent = fmt$(data.thisMonth.totalRoyalties);
    mU.textContent = fmt(data.thisMonth.totalUnits) + ' units';
  }

  const last30 = dailyHistory.slice(-30);
  const lRoy = last30.reduce((s, d) => s + (d.royalties || 0), 0);
  const lUnits = last30.reduce((s, d) => s + (d.units || 0), 0);
  const lPages = last30.reduce((s, d) => s + (d.pageReads || 0), 0);
  lE.textContent = fmt$(lRoy);
  lU.textContent = fmt(lUnits) + ' units';
  pR.textContent = fmt(lPages);
  tB.textContent = fmt(lUnits) + ' units sold';
  aR.textContent = fmt$(lUnits > 0 ? lRoy / lUnits : 0);
  aI.textContent = 'per unit (' + fmt(lUnits) + ' total)';
}

function getTopBooks(n) {
  const sorted = [...allBooks].sort((a, b) => (b.royalties || 0) - (a.royalties || 0));
  return sorted.slice(0, n || sorted.length);
}

function renderTopBooks(n) {
  const container = document.getElementById('topBooks');
  const books = getTopBooks(n);
  if (books.length === 0) {
    container.innerHTML = '<div class="empty-state">No books yet. Import your KDP reports to get started.</div>';
    return;
  }
  container.innerHTML = books.map((b, i) => `
    <div class="book-item">
      <div class="book-rank">${i + 1}</div>
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-meta">${fmt(b.units)} units · ${fmt(b.pageReads)} KU pages${b.asin ? ' · ' + b.asin : ''}</div>
      </div>
      <div class="book-stats">
        <div class="book-earnings">${fmt$(b.royalties)}</div>
        <div class="book-units">${fmt(b.units)} sold</div>
      </div>
    </div>
  `).join('');
}

function renderTrendChart(canvasId, history, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { t: 15, b: 25, l: 50, r: 15 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  ctx.clearRect(0, 0, w, h);

  const sorted = [...history].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const days = sorted.slice(-7);
  if (days.length < 2) {
    ctx.fillStyle = '#a0aec0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Collect more data to see trends', w / 2, h / 2);
    return;
  }

  const vals = days.map(d => d.royalties || 0);
  const max = Math.max(...vals, 1) * 1.1;
  const labels = days.map(d => {
    try { return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return d.date || ''; }
  });

  ctx.fillStyle = '#a0aec0';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    const y = pad.t + ch - (ch * i) / 4;
    ctx.fillText(fmt$(v), pad.l - 6, y + 3);
    ctx.strokeStyle = '#edf2f7';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  const gap = cw / (days.length - 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  days.forEach((d, i) => {
    const x = pad.l + gap * i;
    const y = pad.t + ch - (vals[i] / max) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.lineTo(pad.l + gap * (days.length - 1), pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = 'rgba(66,153,225,0.1)';
  ctx.fill();

  // dots
  days.forEach((d, i) => {
    const x = pad.l + gap * i;
    const y = pad.t + ch - (vals[i] / max) * ch;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = '#a0aec0';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  days.forEach((d, i) => {
    const x = pad.l + gap * i;
    ctx.fillText(labels[i], x, pad.t + ch + 16);
  });
}

function renderHistoryTable() {
  const body = document.getElementById('historyBody');
  if (dailyHistory.length === 0) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">No daily history yet. Import KDP reports.</td></tr>';
    return;
  }
  const sorted = [...dailyHistory].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  body.innerHTML = sorted.map(d => `
    <tr><td>${fmtD(d.date)}</td><td><strong>${fmt$(d.royalties)}</strong></td>
    <td>${fmt(d.units)}</td><td>${fmt(d.pageReads)}</td>
    <td>${fmt$((d.units || 1) > 0 ? (d.royalties || 0) / (d.units || 1) : 0)}</td></tr>
  `).join('');

  const totalR = sorted.reduce((s, d) => s + (d.royalties || 0), 0);
  const totalU = sorted.reduce((s, d) => s + (d.units || 0), 0);
  const totalP = sorted.reduce((s, d) => s + (d.pageReads || 0), 0);
  document.getElementById('periodEarnings').textContent = fmt$(totalR);
  document.getElementById('periodUnits').textContent = fmt(totalU);
  document.getElementById('periodPageReads').textContent = fmt(totalP);
  document.getElementById('periodAvgDaily').textContent = fmt$(totalR / (sorted.length || 1));
}

function renderHistoricalChart() {
  const canvas = document.getElementById('historicalChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { t: 15, b: 25, l: 50, r: 15 };
  const cw = w - pad.l - pad.r;
  const ch = h - pad.t - pad.b;
  ctx.clearRect(0, 0, w, h);

  const sorted = [...dailyHistory].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (sorted.length < 2) {
    ctx.fillStyle = '#a0aec0';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Need more daily data', w / 2, h / 2);
    return;
  }

  const vals = sorted.map(d => d.royalties || 0);
  const max = Math.max(...vals, 1) * 1.1;
  const labels = sorted.map(d => {
    try { return new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
    catch { return d.date || ''; }
  });

  ctx.fillStyle = '#a0aec0';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4;
    const y = pad.t + ch - (ch * i) / 4;
    ctx.fillText(fmt$(v), pad.l - 6, y + 3);
    ctx.strokeStyle = '#edf2f7';
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  const gap = cw / (sorted.length - 1);
  ctx.strokeStyle = '#48bb78';
  ctx.lineWidth = 2;
  ctx.beginPath();
  sorted.forEach((d, i) => {
    const x = pad.l + gap * i;
    const y = pad.t + ch - (vals[i] / max) * ch;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineTo(pad.l + gap * (sorted.length - 1), pad.t + ch);
  ctx.lineTo(pad.l, pad.t + ch);
  ctx.closePath();
  ctx.fillStyle = 'rgba(72,187,120,0.1)';
  ctx.fill();

  sorted.forEach((d, i) => {
    if (i % Math.max(1, Math.floor(sorted.length / 10)) === 0 || i === sorted.length - 1) {
      const x = pad.l + gap * i;
      ctx.fillStyle = '#a0aec0';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(x, pad.t + ch + 16);
      ctx.rotate(-Math.PI / 4);
      ctx.fillText(labels[i], 0, 0);
      ctx.restore();
    }
  });
}

function renderAllBooks() {
  const container = document.getElementById('allBooks');
  const countEl = document.getElementById('allBooksCount');
  const q = (document.getElementById('bookSearch').value || '').toLowerCase();
  const sortBy = document.getElementById('bookSort').value;

  let books = [...allBooks];
  if (q) books = books.filter(b => (b.title || '').toLowerCase().includes(q));
  if (sortBy === 'earnings') books.sort((a, b) => (b.royalties || 0) - (a.royalties || 0));
  else if (sortBy === 'units') books.sort((a, b) => (b.units || 0) - (a.units || 0));
  else if (sortBy === 'title') books.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  countEl.textContent = allBooks.length;
  if (books.length === 0) {
    container.innerHTML = '<div class="empty-state">No books found.</div>';
    return;
  }
  container.innerHTML = books.map((b, i) => `
    <div class="book-item">
      <div class="book-rank">${i + 1}</div>
      <div class="book-info">
        <div class="book-title">${esc(b.title)}</div>
        <div class="book-meta">${b.asin ? 'ASIN: ' + b.asin + ' · ' : ''}${fmt(b.units)} units · ${fmt(b.pageReads)} KU pages</div>
      </div>
      <div class="book-stats">
        <div class="book-earnings">${fmt$(b.royalties)}</div>
        <div class="book-units">${fmt(b.units)} sold</div>
      </div>
    </div>
  `).join('');
}

function renderSeries() {
  const container = document.getElementById('seriesList');
  const seriesMap = new Map();

  allBooks.forEach(b => {
    const s = inferSeries(b.title) || 'Uncategorized';
    const existing = seriesMap.get(s) || { name: s, royalties: 0, units: 0, pageReads: 0, bookCount: 0 };
    existing.royalties += b.royalties || 0;
    existing.units += b.units || 0;
    existing.pageReads += b.pageReads || 0;
    existing.bookCount++;
    seriesMap.set(s, existing);
  });

  if (seriesMap.size <= 1) {
    container.innerHTML = '<div class="empty-state">Series data is inferred from book titles.</div>';
    return;
  }

  const series = Array.from(seriesMap.values()).sort((a, b) => (b.royalties || 0) - (a.royalties || 0));
  container.innerHTML = series.map(s => `
    <div class="series-item">
      <div>
        <div class="series-name">${esc(s.name)}</div>
        <div class="series-meta">${s.bookCount} books · ${fmt(s.units)} units · ${fmt(s.pageReads)} KU pages</div>
      </div>
      <div class="series-earnings">${fmt$(s.royalties)}</div>
    </div>
  `).join('');
}

function renderSettings() {
  document.getElementById('sLastUpdated').textContent = data.lastUpdated ? new Date(data.lastUpdated).toLocaleString() : 'Never';
  document.getElementById('sDataDays').textContent = dailyHistory.length;
  document.getElementById('sTrackedBooks').textContent = allBooks.length;
  document.getElementById('sTotalRoyalties').textContent = fmt$(dailyHistory.reduce((s, d) => s + (d.royalties || 0), 0));
  document.getElementById('debugOutput').textContent = JSON.stringify({ books: allBooks.length, days: dailyHistory.length, lastUpdated: data.lastUpdated }, null, 2);
}

function inferSeries(title) {
  if (!title) return null;
  const m = title.match(/^(.+?)\s*[#:]\s*(?:\d+|[Vv]ol\.?\s*\d+)/);
  return m ? m[1].trim() : null;
}

async function importXLSX(file) {
  try {
    const mod = await import(chrome.runtime.getURL('lib/xlsx-parser.js'));
    const XLSXParser = mod.default || mod.KDPXLSXParser;
    const parser = new XLSXParser();
    const parsed = await parser.parseFromFile(file);
    const appData = parser.toAppData(parsed);

    if (!appData || (!appData.books || appData.books.length === 0) && (!appData.dailyHistory || appData.dailyHistory.length === 0)) {
      throw new Error('Could not parse sales data from this file.');
    }

    const result = await chrome.storage.local.get(STORAGE_KEY);
    const stored = result[STORAGE_KEY] || {};

    const mergeMod = await import(chrome.runtime.getURL('lib/merge-helper.js'));
    const merged = mergeMod.mergeData(stored, appData);

    await chrome.storage.local.set({ [STORAGE_KEY]: merged });
    data = merged;
    allBooks = data.books || [];
    dailyHistory = data.dailyHistory || [];
    renderAll();
    showNotification(`Imported ${appData.books.length} books, ${appData.dailyHistory.length} days`);
  } catch (e) {
    showNotification('Import error: ' + e.message);
    throw e;
  }
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const imported = JSON.parse(e.target.result);
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored = result[STORAGE_KEY] || {};
      const mod = await import(chrome.runtime.getURL('lib/merge-helper.js'));
      const merged = mod.mergeData(stored, imported);
      await chrome.storage.local.set({ [STORAGE_KEY]: merged });
      data = merged;
      allBooks = data.books || [];
      dailyHistory = data.dailyHistory || [];
      renderAll();
      showNotification('JSON data imported');
    } catch(e) {
      showNotification('Import error: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const pane = document.getElementById('tab-' + tab.dataset.tab);
      if (pane) pane.classList.add('active');
    });
  });
}

function setupDropZone() {
  const dz = document.getElementById('dropZone');
  const fi = dz.querySelector('.file-input');

  dz.addEventListener('click', () => fi.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', async e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    for (const f of files) {
      if (f.name.endsWith('.xlsx')) await importXLSX(f);
      else if (f.name.endsWith('.json')) importJSON(f);
      else showNotification('Unsupported file: ' + f.name);
    }
  });

  fi.addEventListener('change', async e => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      if (f.name.endsWith('.xlsx')) await importXLSX(f);
      else if (f.name.endsWith('.json')) importJSON(f);
    }
    e.target.value = '';
  });
}

function setupActions() {
  document.getElementById('applyRange').addEventListener('click', () => {
    showNotification('All dates shown');
  });
  const now = new Date();
  const from = new Date(now); from.setDate(from.getDate() - 30);
  document.getElementById('histFrom').value = from.toISOString().split('T')[0];
  document.getElementById('histTo').value = now.toISOString().split('T')[0];

  document.getElementById('refreshBtn').addEventListener('click', () => loadData().then(() => showNotification('Refreshed')));
  document.getElementById('exportBtn').addEventListener('click', doExport);
  document.getElementById('exportDataBtn').addEventListener('click', doExport);
  document.getElementById('clearDataBtn').addEventListener('click', doClear);
  document.getElementById('importDataBtn').addEventListener('click', () => document.querySelector('.file-input').click());
  document.getElementById('copyDebugInfo').addEventListener('click', () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    showNotification('Debug info copied');
  });
  document.getElementById('bookSearch').addEventListener('input', renderAllBooks);
  document.getElementById('bookSort').addEventListener('change', renderAllBooks);
}

function doExport() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tomos-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showNotification('Data exported');
}

async function doClear() {
  if (!confirm('Delete all Book Report data?')) return;
  await chrome.storage.local.remove(STORAGE_KEY);
  data = {}; allBooks = []; dailyHistory = [];
  renderAll();
  showNotification('Data cleared');
}

function showNotification(text) {
  const el = document.getElementById('notification');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
