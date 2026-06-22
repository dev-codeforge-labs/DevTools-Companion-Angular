/**
 * http.js — HTTP Monitor tab
 */
window.HttpTab = (function () {
  'use strict';

  let container, listEl, detailEl;
  let entries = [];
  let selectedEntry = null;
  let filterMethod = 'ALL';
  let filterStatus = 'ALL';
  let filterUrl = '';
  let activeDrawerTab = 'response';
  let failedCount = 0;

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:row;overflow:hidden;';

    const left = document.createElement('div');
    left.className = 'pane-left';
    left.style.width = '420px';
    left.innerHTML = `
      <div class="toolbar">
        <input class="search-input" id="http-url-filter" placeholder="${t('http_filter_url')}" style="flex:1" />
        <select id="http-method-filter" class="search-input" style="width:80px;flex:none">
          <option value="ALL">All</option>
          <option>GET</option><option>POST</option><option>PUT</option>
          <option>DELETE</option><option>PATCH</option>
        </select>
        <select id="http-status-filter" class="search-input" style="width:75px;flex:none">
          <option value="ALL">All</option>
          <option value="2xx">2xx</option>
          <option value="3xx">3xx</option>
          <option value="4xx">4xx</option>
          <option value="5xx">5xx</option>
        </select>
        <button class="btn danger" id="http-clear" title="Clear log">✕</button>
      </div>
      <div class="http-list scroll-list" id="http-list">
        <div class="empty-state"><div class="icon">📡</div><p>${t('http_empty')}</p></div>
      </div>
    `;

    detailEl = document.createElement('div');
    detailEl.className = 'pane-right';
    detailEl.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>${t('http_select')}</p></div>`;

    container.appendChild(left);
    container.appendChild(detailEl);

    document.getElementById('http-url-filter').addEventListener('input', e => { filterUrl = e.target.value.toLowerCase(); renderList(); });
    document.getElementById('http-method-filter').addEventListener('change', e => { filterMethod = e.target.value; renderList(); });
    document.getElementById('http-status-filter').addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
    document.getElementById('http-clear').addEventListener('click', clearLog);
    listEl = document.getElementById('http-list');

    // Restore any data already received before this render
    if (entries.length) renderList();
    if (selectedEntry) renderDetail(selectedEntry);
  }

  function addEntry(entry) {
    entries.push(entry);
    if (!isSuccess(entry.status)) failedCount++;
    updateBadge();
    if (listEl && document.body.contains(listEl)) renderList();
  }

  function setEntries(list) {
    entries = list;
    failedCount = entries.filter(e => !isSuccess(e.status)).length;
    updateBadge();
    renderList();
  }

  function isSuccess(status) { return status >= 200 && status < 400; }

  function updateBadge() {
    const btn = document.querySelector('.tab-btn[data-tab="http"] .badge-count');
    if (failedCount > 0) {
      if (btn) btn.textContent = failedCount;
      else {
        const tabBtn = document.querySelector('.tab-btn[data-tab="http"]');
        if (tabBtn) tabBtn.innerHTML += `<span class="badge-count">${failedCount}</span>`;
      }
    }
  }

  function filterEntries() {
    return entries.filter(e => {
      if (filterMethod !== 'ALL' && e.method !== filterMethod) return false;
      if (filterStatus !== 'ALL') {
        const s = String(e.status || 0);
        if (!s.startsWith(filterStatus[0])) return false;
      }
      if (filterUrl && !(e.url || '').toLowerCase().includes(filterUrl)) return false;
      return true;
    });
  }

  function renderList() {
    if (!listEl) return;
    const visible = filterEntries();
    if (!visible.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="icon">📡</div><p>${t('http_empty_filter')}</p></div>`;
      return;
    }
    listEl.innerHTML = '';
    for (const e of [...visible].reverse()) {
      listEl.appendChild(renderRow(e));
    }
  }

  function renderRow(e) {
    const div = document.createElement('div');
    const statusClass = statusCls(e.status);
    const isSlow = e.duration > (Panel.getSettings().slowRequestThreshold || 1000);
    div.className = 'http-row' + (e === selectedEntry ? ' selected' : '') + (isSlow ? ' slow' : '');
    div.innerHTML = `
      <span class="method-badge method-${e.method || 'GET'}">${e.method || '?'}</span>
      <span class="status-badge ${statusClass}">${e.status || '…'}</span>
      <span class="http-url" title="${escHtml(e.url)}">${escHtml(e.url)}</span>
      <span class="http-duration">${e.duration ? e.duration + 'ms' : '…'}</span>
      <span class="http-time">${formatTime(e.startTime)}</span>
    `;
    div.addEventListener('click', () => selectEntry(e));
    return div;
  }

  function selectEntry(e) {
    selectedEntry = e;
    renderList();
    renderDetail(e);
  }

  function renderDetail(e) {
    if (!detailEl) return;
    const tabs = ['headers', 'request', 'response', 'timing'];
    detailEl.innerHTML = `
      <div style="font-size:12px;margin-bottom:8px;color:var(--ai-text-muted);word-break:break-all">${escHtml(e.url)}</div>
      <div class="drawer-tabs">
        ${tabs.map(t => `<button class="drawer-tab${activeDrawerTab===t?' active':''}" data-tab="${t}">${capitalize(t)}</button>`).join('')}
      </div>
      <div class="drawer-content" id="http-drawer-content"></div>
    `;
    detailEl.querySelectorAll('.drawer-tab').forEach(btn => {
      btn.addEventListener('click', () => { activeDrawerTab = btn.dataset.tab; renderDetail(e); });
    });
    renderDrawerContent(e, document.getElementById('http-drawer-content'));
  }

  function renderDrawerContent(e, el) {
    switch (activeDrawerTab) {
      case 'headers': {
        const req = Object.entries(e.requestHeaders  || {});
        const res = Object.entries(e.responseHeaders || {});
        el.innerHTML = `
          <h4 style="margin-bottom:6px;font-size:11px;color:var(--ai-text-muted)">${t('http_req_headers')}</h4>
          <table class="prop-table">${req.map(([k,v])=>`<tr><td>${escHtml(k)}</td><td class="prop-value">${escHtml(v)}</td></tr>`).join('') || `<tr><td colspan="2" style="color:var(--ai-text-muted)">${t('http_none')}</td></tr>`}</table>
          <h4 style="margin:12px 0 6px;font-size:11px;color:var(--ai-text-muted)">${t('http_res_headers')}</h4>
          <table class="prop-table">${res.map(([k,v])=>`<tr><td>${escHtml(k)}</td><td class="prop-value">${escHtml(v)}</td></tr>`).join('') || `<tr><td colspan="2" style="color:var(--ai-text-muted)">${t('http_none')}</td></tr>`}</table>
        `;
        break;
      }
      case 'request':
        el.innerHTML = `<pre>${escHtml(e.requestBody != null && e.requestBody !== '' ? prettyJSON(e.requestBody) : t('http_no_body'))}</pre>`;
        break;
      case 'response':
        el.innerHTML = `<pre>${escHtml(prettyJSON(e.responseBody) || t('http_empty_body'))}</pre>`;
        break;
      case 'timing':
        el.innerHTML = `
          <table class="prop-table">
            <tr><td>${t('http_started')}</td><td class="prop-value">${new Date(e.startTime).toISOString()}</td></tr>
            <tr><td>${t('http_ended')}</td><td class="prop-value">${e.endTime ? new Date(e.endTime).toISOString() : '…'}</td></tr>
            <tr><td>${t('http_duration')}</td><td class="prop-value">${e.duration ?? '…'} ms</td></tr>
            <tr><td>${t('http_status')}</td><td class="prop-value">${e.status || '…'}</td></tr>
          </table>
        `;
        break;
    }
  }

  function clearLog() { entries = []; failedCount = 0; selectedEntry = null; renderList(); if (detailEl) detailEl.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>${t('http_cleared')}</p></div>`; }

  function statusCls(s) {
    if (!s) return '';
    if (s >= 200 && s < 300) return 'status-2xx';
    if (s >= 300 && s < 400) return 'status-3xx';
    if (s >= 400 && s < 500) return 'status-4xx';
    if (s >= 500) return 'status-5xx';
    return '';
  }
  function prettyJSON(s) { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } }
  function formatTime(ts) { if (!ts) return ''; const d = new Date(ts); return d.toLocaleTimeString(); }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render, addEntry, setEntries };
})();
