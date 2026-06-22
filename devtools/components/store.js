/**
 * store.js — State Management Inspector tab (NgRx / Akita / NGXS + Angular Services fallback)
 */
window.StoreTab = (function () {
  'use strict';

  let container, actionListEl, stateEl, scanBtn;
  let actions      = [];
  let snapshots    = [];   // { label, state, timestamp }
  let currentSnapshot = null;
  let selectedActionIdx = null;
  let storeType    = null;
  let servicesMode = false; // true when no formal store found

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:row;overflow:hidden;';

    const left = document.createElement('div');
    left.className = 'pane-left';
    left.innerHTML = `
      <div class="toolbar">
        <span id="store-type-badge" class="badge badge-detecting">${t('store_detecting')}</span>
        <input class="search-input" id="store-search" placeholder="${t('store_filter')}" style="flex:1" />
        <button class="btn danger" id="store-clear" title="Clear log">✕</button>
      </div>
      <div class="scroll-list" id="action-list">
        <div class="empty-state"><div class="icon">🗄️</div><p>${t('store_waiting')}</p></div>
      </div>
    `;

    const right = document.createElement('div');
    right.className = 'pane-right';
    right.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
        <button class="btn" id="store-current" title="Show current state snapshot">${t('store_current')}</button>
        <button class="btn" id="store-diff"    title="Diff two latest snapshots" disabled>${t('store_diff')}</button>
        <button class="btn" id="store-export"  title="Copy state JSON to clipboard">${t('store_export')}</button>
        <button class="btn" id="store-scan"    title="Scan Angular services" style="display:none">${t('store_scan')}</button>
        <input class="search-input" id="state-search" placeholder="${t('store_search_keys')}" style="width:130px;flex:none" />
      </div>
      <div id="state-tree" class="json-tree"></div>
      <div id="store-toast" style="display:none;position:absolute;bottom:12px;right:12px;
        background:var(--ai-primary);color:#fff;padding:6px 12px;border-radius:4px;
        font-size:12px;pointer-events:none;transition:opacity .3s"></div>
    `;
    right.style.position = 'relative';

    container.appendChild(left);
    container.appendChild(right);

    actionListEl = document.getElementById('action-list');
    stateEl      = document.getElementById('state-tree');
    scanBtn      = document.getElementById('store-scan');

    document.getElementById('store-clear').addEventListener('click', clearAll);
    document.getElementById('store-current').addEventListener('click', showCurrent);
    document.getElementById('store-diff').addEventListener('click', showDiff);
    document.getElementById('store-export').addEventListener('click', exportJson);
    document.getElementById('store-search').addEventListener('input', e => renderActions(e.target.value.toLowerCase()));
    document.getElementById('state-search').addEventListener('input', e => {
      if (currentSnapshot != null) renderState(currentSnapshot, e.target.value.toLowerCase());
    });
    scanBtn.addEventListener('click', () => {
      if (typeof Panel !== 'undefined') Panel.sendToPage('SCAN_SERVICES', {});
      scanBtn.textContent = t('store_scanning');
      scanBtn.disabled = true;
      setTimeout(() => { scanBtn.textContent = t('store_scan'); scanBtn.disabled = false; }, 3000);
    });

    // Restore data already in memory when switching back to this tab
    if (storeType)        setStoreType(storeType);
    else if (servicesMode) _showServicesModeUI();
    if (actions.length)   renderActions();
    if (currentSnapshot != null) renderState(currentSnapshot);
  }

  // ── Store type / mode ───────────────────────────────────────────────────────

  function setStoreType(type) {
    storeType    = type;
    servicesMode = false;
    const badge = document.getElementById('store-type-badge');
    if (badge) { badge.textContent = type.toUpperCase(); badge.className = 'badge badge-angular'; }
    if (scanBtn) scanBtn.style.display = 'none';
  }

  function setStoreNotFound() {
    servicesMode = true;
    const badge = document.getElementById('store-type-badge');
    if (badge) { badge.textContent = t('store_no_store'); badge.className = 'badge badge-none'; }
    _showServicesModeUI();
  }

  function _showServicesModeUI() {
    if (actionListEl && !actions.length) {
      actionListEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">🗄️</div>
          <p>${t('store_no_store_msg')}</p>
          <p style="font-size:11px;color:var(--ai-text-muted);margin-top:6px">
            ${t('store_scan_hint')}
          </p>
        </div>`;
    }
    if (scanBtn) scanBtn.style.display = '';
  }

  // ── Services state (Angular DI fallback) ────────────────────────────────────

  function setServicesState(services, timestamp) {
    servicesMode = true;
    if (scanBtn) { scanBtn.style.display = ''; scanBtn.textContent = t('store_scan'); scanBtn.disabled = false; }

    const label = `Services @ ${new Date(timestamp).toLocaleTimeString()}`;
    snapshots.push({ label, state: services, timestamp });
    currentSnapshot = services;

    // Add an entry to the action list so the user can select past snapshots
    if (actionListEl) {
      const idx = snapshots.length - 1;
      const div = document.createElement('div');
      div.className = 'action-row';
      div.innerHTML = `<span class="action-type">📸 ${escHtml(label)}</span>`;
      div.addEventListener('click', () => {
        currentSnapshot = snapshots[idx].state;
        renderState(currentSnapshot);
        actionListEl.querySelectorAll('.action-row').forEach(r => r.classList.remove('selected'));
        div.classList.add('selected');
      });
      // Replace empty-state if present
      const empty = actionListEl.querySelector('.empty-state');
      if (empty) empty.remove();
      actionListEl.insertBefore(div, actionListEl.firstChild);
    }

    renderState(services);
    updateButtons();
    toast(t('store_captured'));
  }

  function setServicesError(msg) {
    if (scanBtn) { scanBtn.style.display = ''; scanBtn.textContent = t('store_scan'); scanBtn.disabled = false; }
    if (stateEl) {
      stateEl.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div>
        <p style="color:var(--ai-error)">${escHtml(msg)}</p>
        <p style="font-size:11px;color:var(--ai-text-muted)">ng.getInjector() is only available in development builds.</p>
      </div>`;
    }
  }

  // ── NgRx / NGXS / Akita action dispatch ────────────────────────────────────

  function addAction(action, state) {
    const idx = actions.length;
    actions.push({ ...action, index: idx, time: Date.now() });
    const label = `[${idx}] ${action.type || '(action)'}`;
    snapshots.push({ label, state, timestamp: Date.now() });
    currentSnapshot = state;
    if (actionListEl && document.body.contains(actionListEl)) {
      renderActions();
      renderState(state);
    }
    updateButtons();
  }

  // ── Button actions ──────────────────────────────────────────────────────────

  function clearAll() {
    actions = []; snapshots = []; currentSnapshot = null; selectedActionIdx = null;
    if (actionListEl) actionListEl.innerHTML = `<div class="empty-state"><div class="icon">🗄️</div><p>${t('store_cleared')}</p></div>`;
    if (stateEl)      stateEl.innerHTML = '';
    updateButtons();
  }

  function showCurrent() {
    if (!snapshots.length) {
      if (stateEl) stateEl.innerHTML = `<div class="empty-state"><div class="icon">ℹ️</div><p>${t('store_no_snapshot')}<br><span style="font-size:11px;color:var(--ai-text-muted)">${servicesMode ? t('store_hint_services') : t('store_hint_actions')}</span></p></div>`;
      return;
    }
    currentSnapshot = snapshots[snapshots.length - 1].state;
    renderState(currentSnapshot);
  }

  function showDiff() {
    if (snapshots.length < 2) return;
    const a = snapshots[snapshots.length - 2].state;
    const b = snapshots[snapshots.length - 1].state;
    const diff = computeDiff(a, b);
    if (stateEl) {
      stateEl.innerHTML = `<div style="padding:4px 0 8px;font-size:11px;color:var(--ai-text-muted)">
        Diff: <strong>${snapshots[snapshots.length - 2].label}</strong> → <strong>${snapshots[snapshots.length - 1].label}</strong>
      </div>`;
      stateEl.appendChild(buildDiffTree(diff, 0));
    }
  }

  function exportJson() {
    if (!snapshots.length) {
      toast(t('store_nothing_export'), true);
      return;
    }
    const state = snapshots[snapshots.length - 1].state;
    navigator.clipboard.writeText(JSON.stringify(state, null, 2))
      .then(() => toast(t('store_copied')))
      .catch(() => toast(t('store_copy_failed'), true));
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderActions(filter = '') {
    if (!actionListEl) return;
    const visible = filter ? actions.filter(a => (a.type || '').toLowerCase().includes(filter)) : actions;
    if (!visible.length) {
      if (!servicesMode) {
        actionListEl.innerHTML = `<div class="empty-state"><div class="icon">🗄️</div><p>${t('store_no_actions')}</p></div>`;
      }
      return;
    }
    actionListEl.innerHTML = '';
    for (const a of [...visible].reverse()) {
      const div = document.createElement('div');
      div.className = 'action-row' + (a.index === selectedActionIdx ? ' selected' : '');
      div.innerHTML = `<span class="action-type">${escHtml(a.type)}</span><span class="action-time">${formatTime(a.time)}</span>`;
      div.addEventListener('click', () => {
        selectedActionIdx = a.index;
        const snap = snapshots[a.index];
        if (snap) { currentSnapshot = snap.state; renderState(snap.state); }
        renderActions(filter);
      });
      actionListEl.appendChild(div);
    }
  }

  function renderState(state, filter = '') {
    currentSnapshot = state;
    if (!stateEl) return;
    stateEl.innerHTML = '';
    stateEl.appendChild(buildJsonTree(state, filter, 0));
  }

  function updateButtons() {
    const diffBtn = document.getElementById('store-diff');
    if (diffBtn) diffBtn.disabled = snapshots.length < 2;
  }

  // ── Diff logic ──────────────────────────────────────────────────────────────

  function computeDiff(a, b, path = '') {
    const result = {};
    const keysA = a && typeof a === 'object' ? Object.keys(a) : [];
    const keysB = b && typeof b === 'object' ? Object.keys(b) : [];
    const allKeys = new Set([...keysA, ...keysB]);
    for (const k of allKeys) {
      const va = a ? a[k] : undefined;
      const vb = b ? b[k] : undefined;
      if (JSON.stringify(va) !== JSON.stringify(vb)) {
        result[k] = { from: va, to: vb };
      }
    }
    return result;
  }

  function buildDiffTree(diff, depth) {
    const el = document.createElement('div');
    el.style.paddingLeft = depth > 0 ? '14px' : '0';
    const keys = Object.keys(diff);
    if (!keys.length) {
      el.innerHTML = '<span style="color:var(--ai-text-muted)">No differences</span>';
      return el;
    }
    for (const k of keys) {
      const row = document.createElement('div');
      row.style.marginBottom = '4px';
      const { from, to } = diff[k];
      row.innerHTML = `
        <span class="json-key">${escHtml(k)}</span>
        <span style="color:var(--ai-error);font-size:11px"> − ${escHtml(JSON.stringify(from))}</span><br>
        <span style="padding-left:${String(k).length * 7 + 4}px;color:var(--ai-success);font-size:11px"> + ${escHtml(JSON.stringify(to))}</span>
      `;
      el.appendChild(row);
    }
    return el;
  }

  // ── JSON tree ───────────────────────────────────────────────────────────────

  function buildJsonTree(value, filter, depth) {
    const el = document.createElement('div');
    el.style.paddingLeft = depth > 0 ? '14px' : '0';

    if (value === null || value === undefined) {
      el.innerHTML = `<span class="json-null">${value}</span>`; return el;
    }
    if (typeof value === 'boolean') { el.innerHTML = `<span class="json-bool">${value}</span>`; return el; }
    if (typeof value === 'number')  { el.innerHTML = `<span class="json-num">${value}</span>`;  return el; }
    if (typeof value === 'string')  { el.innerHTML = `<span class="json-str">"${escHtml(value)}"</span>`; return el; }

    if (Array.isArray(value)) {
      if (!value.length) { el.innerHTML = '<span style="color:var(--ai-text-muted)">[]</span>'; return el; }
      const summary  = mkSummary(`▾ Array[${value.length}]`);
      const children = document.createElement('div');
      value.forEach((v, i) => {
        const row = document.createElement('div');
        const keyEl = document.createElement('span'); keyEl.className = 'json-key'; keyEl.textContent = i + ': ';
        row.appendChild(keyEl); row.appendChild(buildJsonTree(v, filter, depth + 1));
        children.appendChild(row);
      });
      summary.addEventListener('click', () => toggleNode(summary, children, `Array[${value.length}]`));
      el.appendChild(summary); el.appendChild(children); return el;
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value).filter(k =>
        !filter || k.toLowerCase().includes(filter) || JSON.stringify(value[k]).toLowerCase().includes(filter)
      );
      if (!keys.length) {
        el.innerHTML = filter ? '<span style="color:var(--ai-text-muted)">No matches</span>' : '<span style="color:var(--ai-text-muted)">{}</span>';
        return el;
      }
      const summary  = mkSummary(`▾ {${keys.length} keys}`);
      const children = document.createElement('div');
      for (const k of keys) {
        const row = document.createElement('div');
        const keyEl = document.createElement('span'); keyEl.className = 'json-key'; keyEl.textContent = k + ': ';
        row.appendChild(keyEl); row.appendChild(buildJsonTree(value[k], '', depth + 1));
        children.appendChild(row);
      }
      summary.addEventListener('click', () => toggleNode(summary, children, `{${keys.length} keys}`));
      el.appendChild(summary); el.appendChild(children); return el;
    }

    el.textContent = String(value);
    return el;
  }

  function mkSummary(text) {
    const s = document.createElement('span');
    s.style.cssText = 'cursor:pointer;user-select:none;color:var(--ai-text-muted)';
    s.textContent = text;
    return s;
  }

  function toggleNode(summary, children, label) {
    const collapsed = children.style.display === 'none';
    children.style.display = collapsed ? '' : 'none';
    summary.textContent = (collapsed ? '▾ ' : '▸ ') + label;
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  function toast(msg, error = false) {
    const el = document.getElementById('store-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = error ? 'var(--ai-error)' : 'var(--ai-primary)';
    el.style.display = 'block';
    el.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; }, 300); }, 2000);
  }

  // ── Utils ───────────────────────────────────────────────────────────────────

  function formatTime(ts) { return new Date(ts).toLocaleTimeString(); }
  function escHtml(s)     { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, setStoreType, setStoreNotFound, addAction, setServicesState, setServicesError };
})();
