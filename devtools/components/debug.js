/**
 * debug.js — Internal extension log viewer tab
 */
window.DebugTab = (function () {
  'use strict';

  let container, listEl;
  const MAX_ENTRIES = 500;

  // Public log store — populated by panel.js before render is called
  const entries = [];

  const LEVELS = {
    info:    { color: 'var(--ai-text)',       icon: 'ℹ' },
    warn:    { color: 'var(--ai-warning)',     icon: '⚠' },
    error:   { color: 'var(--ai-error)',       icon: '✕' },
    success: { color: 'var(--ai-success)',     icon: '✓' },
    debug:   { color: 'var(--ai-text-muted)', icon: '·' },
    bridge:  { color: '#79B8FF',              icon: '⇄' },
  };

  const SOURCE_COLORS = {
    bridge:  '#BB9AF7',
    content: '#9ECE6A',
    panel:   '#F78C6C',
    background: '#E0AF68',
    user:    'var(--ai-text-muted)',
  };

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.overflow = 'hidden';

    container.innerHTML = `
      <div class="toolbar" style="gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;font-weight:600;color:var(--ai-text-muted)">Extension Debug Log</span>
        <select id="dbg-level-filter" class="search-input" style="width:100px;flex:none">
          <option value="">All levels</option>
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
          <option value="bridge">Bridge</option>
        </select>
        <select id="dbg-src-filter" class="search-input" style="width:110px;flex:none">
          <option value="">All sources</option>
          <option value="bridge">ng-bridge</option>
          <option value="content">content script</option>
          <option value="panel">panel</option>
          <option value="background">background</option>
        </select>
        <input class="search-input" id="dbg-text-filter" placeholder="Filter text…" style="flex:1;min-width:120px" />
        <button class="btn" id="dbg-copy">⬇ Copy log</button>
        <button class="btn danger" id="dbg-clear">✕ Clear</button>
        <button class="btn" id="dbg-inject-test">▶ Test injection</button>
      </div>
      <div style="flex:1;overflow-y:auto;font-family:var(--font-code);font-size:11px;overflow-x:hidden" id="dbg-list"></div>
      <div id="dbg-status-bar" style="
        border-top:1px solid var(--ai-border);
        color:var(--ai-text-muted);
        font-size:11px;
        padding:4px 10px;
        display:flex;
        gap:16px;
        flex-shrink:0
      "></div>
    `;

    listEl = document.getElementById('dbg-list');

    document.getElementById('dbg-level-filter').addEventListener('change', renderList);
    document.getElementById('dbg-src-filter').addEventListener('change', renderList);
    document.getElementById('dbg-text-filter').addEventListener('input', renderList);
    document.getElementById('dbg-clear').addEventListener('click', () => {
      entries.length = 0;
      renderList();
    });
    document.getElementById('dbg-copy').addEventListener('click', copyLog);
    document.getElementById('dbg-inject-test').addEventListener('click', runInjectionTest);

    renderList();
  }

  function addEntry(entry) {
    entries.push({ ...entry, time: Date.now() });
    if (entries.length > MAX_ENTRIES) entries.shift();
    if (listEl && isVisible()) {
      appendRow(entries[entries.length - 1]);
      updateStatusBar();
      // Auto-scroll to bottom
      listEl.scrollTop = listEl.scrollHeight;
    }
  }

  function isVisible() {
    return container && container.classList.contains('active');
  }

  function renderList() {
    if (!listEl) return;
    const levelFilter = document.getElementById('dbg-level-filter')?.value || '';
    const srcFilter   = document.getElementById('dbg-src-filter')?.value   || '';
    const textFilter  = (document.getElementById('dbg-text-filter')?.value || '').toLowerCase();

    const visible = entries.filter(e => {
      if (levelFilter && e.level !== levelFilter) return false;
      if (srcFilter   && e.source !== srcFilter)   return false;
      if (textFilter  && !e.message.toLowerCase().includes(textFilter)) return false;
      return true;
    });

    listEl.innerHTML = '';
    if (!visible.length) {
      listEl.innerHTML = `<div class="empty-state" style="height:120px">
        <div class="icon">🐛</div>
        <p>${entries.length ? 'No entries match the current filter.' : 'Waiting for extension events…'}</p>
      </div>`;
      updateStatusBar();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const e of visible) {
      frag.appendChild(buildRow(e));
    }
    listEl.appendChild(frag);
    listEl.scrollTop = listEl.scrollHeight;
    updateStatusBar();
  }

  function appendRow(entry) {
    const levelFilter = document.getElementById('dbg-level-filter')?.value || '';
    const srcFilter   = document.getElementById('dbg-src-filter')?.value   || '';
    const textFilter  = (document.getElementById('dbg-text-filter')?.value || '').toLowerCase();
    if (levelFilter && entry.level  !== levelFilter) return;
    if (srcFilter   && entry.source !== srcFilter)   return;
    if (textFilter  && !entry.message.toLowerCase().includes(textFilter)) return;
    listEl.appendChild(buildRow(entry));
    updateStatusBar();
  }

  function buildRow(e) {
    const lvl = LEVELS[e.level] || LEVELS.info;
    const srcColor = SOURCE_COLORS[e.source] || 'var(--ai-text-muted)';
    const row = document.createElement('div');
    row.style.cssText = `
      align-items:baseline;
      border-bottom:1px solid var(--ai-border);
      color:${lvl.color};
      display:flex;
      gap:8px;
      padding:3px 10px;
      word-break:break-all;
      line-height:1.5;
    `;
    row.innerHTML = `
      <span style="color:var(--ai-text-muted);white-space:nowrap;flex-shrink:0">${formatTime(e.time)}</span>
      <span style="flex-shrink:0;width:10px;text-align:center">${lvl.icon}</span>
      <span style="color:${srcColor};white-space:nowrap;flex-shrink:0;min-width:70px">[${e.source || '?'}]</span>
      <span style="flex:1">${escHtml(e.message)}</span>
      ${e.data ? `<span style="color:var(--ai-text-muted);flex-shrink:0;cursor:pointer" onclick="this.nextSibling.style.display=this.nextSibling.style.display?'':'block'" title="Toggle data">▸</span>
        <pre style="display:none;background:var(--ai-code-bg);border-radius:4px;margin-top:4px;padding:6px;width:100%;font-size:10px;overflow-x:auto">${escHtml(JSON.stringify(e.data, null, 2))}</pre>` : ''}
    `;
    return row;
  }

  function updateStatusBar() {
    const bar = document.getElementById('dbg-status-bar');
    if (!bar) return;
    const errors   = entries.filter(e => e.level === 'error').length;
    const warnings = entries.filter(e => e.level === 'warn').length;
    bar.innerHTML = `
      <span>Total: <strong>${entries.length}</strong></span>
      ${errors   ? `<span style="color:var(--ai-error)">Errors: <strong>${errors}</strong></span>`     : ''}
      ${warnings ? `<span style="color:var(--ai-warning)">Warnings: <strong>${warnings}</strong></span>` : ''}
      <span style="margin-left:auto">Max: ${MAX_ENTRIES} entries</span>
    `;
  }

  function copyLog() {
    const text = entries.map(e =>
      `${formatTime(e.time)} [${e.level?.toUpperCase()}] [${e.source}] ${e.message}${e.data ? '\n' + JSON.stringify(e.data, null, 2) : ''}`
    ).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('dbg-copy');
      if (btn) { btn.textContent = '✓ Copied'; setTimeout(() => btn.textContent = '⬇ Copy log', 1500); }
    });
  }

  function runInjectionTest() {
    Panel.log('panel', 'info', 'Running manual injection test…');
    Panel.sendToPage('PING', {});
    // Also ask the inspected window to report globals directly
    try {
      browser.devtools.inspectedWindow.eval(`
        (function() {
          var r = {
            hasNg:         typeof window.ng !== 'undefined',
            hasGetComp:    !!(window.ng && typeof window.ng.getComponent === 'function'),
            hasGetAllRoots:typeof window.getAllAngularRootElements === 'function',
            ngVersion:     document.querySelector('[ng-version]')
                             ? document.querySelector('[ng-version]').getAttribute('ng-version')
                             : null,
            hasNgContext:  !!document.querySelector('[__ngContext__]'),
            bodyChildren:  document.body ? document.body.children.length : -1,
            readyState:    document.readyState,
            title:         document.title,
            url:           location.href,
          };
          return JSON.stringify(r);
        })()
      `, (result, err) => {
        if (err) {
          Panel.log('panel', 'error', 'inspectedWindow.eval error: ' + JSON.stringify(err));
          return;
        }
        try {
          const data = JSON.parse(result);
          Panel.log('panel', 'info', 'Page environment snapshot', data);
          // Analyse results
          if (!data.hasNg && !data.hasGetAllRoots && !data.ngVersion && !data.hasNgContext) {
            Panel.log('panel', 'warn', 'No Angular signals found in page. Is this an Angular app? readyState: ' + data.readyState);
          } else if (data.hasGetComp) {
            // ng.getComponent only exists in development builds
            Panel.log('panel', 'success', `Angular ${data.ngVersion || '(version unknown)'} — development mode (ng.getComponent available)`);
          } else if (data.ngVersion) {
            Panel.log('panel', 'success', `Angular ${data.ngVersion} — production mode ([ng-version] attribute present, ng.getComponent not available)`);
          } else if (data.hasNgContext) {
            Panel.log('panel', 'success', 'Angular detected via __ngContext__ on DOM nodes — production mode');
          }
        } catch (parseErr) {
          Panel.log('panel', 'error', 'Failed to parse eval result: ' + result);
        }
      });
    } catch (e) {
      Panel.log('panel', 'error', 'inspectedWindow.eval not available: ' + e.message);
    }
  }

  function formatTime(ts) {
    if (!ts) return '--:--:--.---';
    const d = new Date(ts);
    return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  function escHtml(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { render, addEntry };
})();
