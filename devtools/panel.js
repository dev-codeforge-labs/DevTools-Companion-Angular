/**
 * panel.js — Main DevTools panel orchestrator.
 * Manages tab routing, background port connection, and message dispatch.
 */
(function () {
  'use strict';

  // ── Settings ───────────────────────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    theme:                   'dark',
    httpCaptureBody:         true,
    maxHttpHistory:          500,
    slowRequestThreshold:    1000,
    cdCycleAlertThreshold:   60,
    autoClearOnNavigation:   false,
    angularDetectionTimeout: 10,
    enableDebugModePrompt:   true,
  };

  let settings = { ...DEFAULT_SETTINGS };

  function loadSettings(cb) {
    browser.storage.local.get('ai_settings').then(result => {
      if (result.ai_settings) settings = { ...DEFAULT_SETTINGS, ...result.ai_settings };
      applyTheme();
      cb && cb();
    });
  }

  // ── Language ───────────────────────────────────────────────────────────────

  function initLang() {
    const sel = document.getElementById('lang-selector');

    loadLang(code => {
      if (sel) sel.value = code;
      if (code !== 'en') {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
          const label = t('tab_' + btn.dataset.tab);
          if (label) btn.textContent = label;
        });
      }
    });

    if (sel) {
      sel.addEventListener('change', () => {
        setLang(sel.value);
        activateTab(activeTab);
      });
    }

    window._i18nLangChangeCallback = () => activateTab(activeTab);
  }

  function saveSettings() {
    browser.storage.local.set({ ai_settings: settings });
    applyTheme();
  }

  function applyTheme() {
    document.body.className = settings.theme === 'light' ? 'theme-light' : '';
  }

  // ── Internal logger ────────────────────────────────────────────────────────

  /**
   * log(source, level, message, data?)
   * source: 'panel' | 'bridge' | 'content' | 'background' | 'user'
   * level:  'info' | 'warn' | 'error' | 'success' | 'debug' | 'bridge'
   */
  function log(source, level, message, data) {
    const entry = { source, level, message, data, time: Date.now() };
    // Forward to Debug tab (always, even when not active — it buffers internally)
    if (window.DebugTab) DebugTab.addEntry(entry);
  }

  // ── Background port ────────────────────────────────────────────────────────

  let port = null;
  let portTabId = null;

  function connectToBackground() {
    portTabId = browser.devtools.inspectedWindow.tabId;
    log('panel', 'info', `Connecting to background for tab ${portTabId}…`);
    try {
      port = browser.runtime.connect({ name: 'panel-' + portTabId });
      log('panel', 'success', 'Port connected to background service worker');
      port.onMessage.addListener(handleMessage);
      // Ask bridge to re-send its current state (panel may have opened after detection)
      setTimeout(() => sendToPage('REQUEST_STATUS', {}), 300);
      port.onDisconnect.addListener(() => {
        const err = browser.runtime.lastError;
        log('panel', 'warn', 'Port disconnected' + (err ? ': ' + err.message : '') + ' — reconnecting in 1s');
        port = null;
        setTimeout(connectToBackground, 1000);
      });
    } catch (e) {
      log('panel', 'error', 'Failed to connect port: ' + e.message);
      setTimeout(connectToBackground, 2000);
    }
  }

  function sendToPage(cmd, payload) {
    if (!port) {
      log('panel', 'warn', `sendToPage(${cmd}) — port not connected, message dropped`);
      return;
    }
    log('panel', 'bridge', `→ page: ${cmd}`, payload && Object.keys(payload).length ? payload : undefined);
    port.postMessage({ to: 'page', cmd, payload });
  }

  // ── Message dispatcher ─────────────────────────────────────────────────────

  function handleMessage(msg) {
    const type = msg.type || '(unknown)';
    log('panel', 'bridge', `← page: ${type}`, summarise(msg.payload));

    switch (type) {
      case 'ANGULAR_DETECTED':    onAngularDetected(msg.payload);      break;
      case 'ANGULAR_NOT_FOUND':   onAngularNotFound();                  break;
      case 'COMPONENT_TREE':      onComponentTree(msg.payload);         break;
      case 'HTTP_REQUEST':        onHttpRequest(msg.payload);           break;
      case 'HTTP_LOG':            onHttpLog(msg.payload);               break;
      case 'STORE_DETECTED':      onStoreDetected(msg.payload);         break;
      case 'STORE_ACTION':        onStoreAction(msg.payload);           break;
      case 'NG_SERVICES_STATE':   onNgServicesState(msg.payload);       break;
      case 'NAVIGATION':          onNavigation(msg.payload);            break;
      case 'SOURCE_MAPS_FOUND':   onSourceMapsFound(msg.payload);       break;
      case 'SOURCE_FILES':        onSourceFiles(msg.payload);           break;
      case 'CD_CYCLE':            PerformanceTab.addCycle(msg.payload);          break;
      case 'SUBSCRIPTION_LEAK':   PerformanceTab.addLeak(msg.payload);           break;
      case 'PROFILING_STARTED':   PerformanceTab.onProfilingStarted();           break;
      case 'PROFILING_STOPPED':   PerformanceTab.onProfilingStopped();           break;
      case 'STORE_NOT_FOUND':     onStoreNotFound();                             break;
      case 'LOG':                 onBridgeLog(msg.payload);             break;
      case 'PONG':                log('panel', 'success', 'Bridge is alive — PONG received'); break;
      case 'PROP_UPDATED':        log('panel', 'success', `Property updated: ${msg.payload?.propPath}`); break;
      case 'PROP_UPDATE_ERROR':   log('panel', 'error',   `Property update failed: ${msg.payload?.error}`); break;
      default:
        log('panel', 'debug', `Unhandled message type: ${type}`);
    }
  }

  function summarise(payload) {
    if (!payload) return undefined;
    if (payload.tree)    return { nodeCount: countNodes(payload.tree) };
    if (payload.entries) return { count: payload.entries.length };
    if (payload.entry)   return { method: payload.entry.method, url: payload.entry.url, status: payload.entry.status };
    return payload;
  }

  function countNodes(nodes, n = 0) {
    if (!nodes) return n;
    for (const node of nodes) n = countNodes(node.children, n + 1);
    return n;
  }

  // ── Bridge log relay ───────────────────────────────────────────────────────

  function onBridgeLog({ level, message, data }) {
    log('bridge', level || 'debug', message, data);
  }

  // ── Angular events ─────────────────────────────────────────────────────────

  function onAngularDetected({ version, mode }) {
    log('panel', 'success', `Angular detected — version tag: "${version}", mode: "${mode}"`);
    const badge = document.getElementById('angular-badge');
    if (badge) {
      if (mode === 'production') {
        badge.textContent = t('badge_production');
        badge.className = 'badge badge-prod';
        showBanner('warn',
          t('banner_production') +
          (settings.enableDebugModePrompt
            ? ` <button class="btn" id="check-apis-btn" style="margin-left:8px">${t('banner_check_apis')}</button>`
            : ''));
        const checkBtn = document.getElementById('check-apis-btn');
        if (checkBtn) checkBtn.addEventListener('click', runApiDiagnostic);
      } else {
        const label = version === 'ivy' ? t('badge_ivy') :
                      version === 'legacy' ? t('badge_legacy') : t('badge_angular');
        badge.textContent = label;
        badge.className = 'badge badge-angular';
        hideBanner();
      }
    }
    sendToPage('REFRESH_TREE', {});
  }

  function onAngularNotFound() {
    log('panel', 'warn', 'Angular not found after all detection retries exhausted');
    const badge = document.getElementById('angular-badge');
    if (badge) { badge.textContent = t('badge_no_angular'); badge.className = 'badge badge-none'; }
    showBanner('error', t('banner_no_angular'));
  }

  function onComponentTree({ tree, error }) {
    if (error) {
      log('panel', 'error', 'Component tree error: ' + error);
    } else {
      log('panel', 'debug', `Component tree received — ${countNodes(tree)} node(s)`);
    }
    TreeTab.setData(tree || []);
  }

  function onHttpRequest({ entry }) {
    if (HttpTab) HttpTab.addEntry(entry);
  }

  function onHttpLog({ entries }) {
    log('panel', 'debug', `HTTP log snapshot received — ${entries.length} entries`);
    if (HttpTab) HttpTab.setEntries(entries);
  }

  function onStoreDetected({ type }) {
    log('panel', 'info', `Store detected: ${type}`);
    if (StoreTab) StoreTab.setStoreType(type);
  }

  function onStoreAction({ action, state }) {
    if (StoreTab) StoreTab.addAction(action, state);
  }

  function onStoreNotFound() {
    log('panel', 'info', 'No compatible store detected (NgRx / NGXS / Akita not found)');
    if (StoreTab) StoreTab.setStoreNotFound();
  }

  function onNgServicesState(payload) {
    if (payload.error) {
      log('panel', 'warn', 'Service scan error: ' + payload.error);
      if (StoreTab) StoreTab.setServicesError(payload.error);
    } else {
      const count = Object.keys(payload.services || {}).length;
      log('panel', 'info', `Angular services snapshot — ${count} service(s)`);
      if (StoreTab) StoreTab.setServicesSnapshot(payload.services, payload.timestamp);
    }
  }

  function onNavigation({ url, time }) {
    log('panel', 'info', `Navigation → ${url}`);
    RouterTab.addNavEvent({ url, time, type: 'end' });
    if (settings.autoClearOnNavigation) {
      log('panel', 'debug', 'Auto-clear on navigation triggered');
    }
  }

  function onSourceMapsFound({ count, scripts }) {
    if (!count) {
      log('panel', 'warn', 'No source maps found on this page');
      SourcesTab.setNoSourceMaps();
    } else {
      log('panel', 'info', `Source maps found: ${count} script(s) — fetching…`, scripts);
    }
  }

  function onSourceFiles({ files }) {
    const count = Object.keys(files || {}).length;
    if (count) {
      log('panel', 'success', `Source files loaded: ${count} file(s)`);
      SourcesTab.setSourceFiles(files);
    } else {
      log('panel', 'warn', 'Source maps found but contained no inline source content (sourcesContent missing)');
      SourcesTab.setNoSourceMaps();
    }
  }

  function runApiDiagnostic() {
    log('panel', 'info', 'Running production API diagnostic…');
    // Navigate to Debug tab so the user sees the results
    activateTab('debug');

    const script = `(function() {
      var ng = window.ng || {};
      var ngVersion = document.querySelector('[ng-version]');
      return JSON.stringify({
        version:           ngVersion ? ngVersion.getAttribute('ng-version') : null,
        hasNg:             typeof window.ng !== 'undefined',
        getComponent:      typeof ng.getComponent    === 'function',
        applyChanges:      typeof ng.applyChanges    === 'function',
        getOwningComponent:typeof ng.getOwningComponent === 'function',
        getDirectives:     typeof ng.getDirectives   === 'function',
        getInjector:       typeof ng.getInjector     === 'function',
        getHostElement:    typeof ng.getHostElement  === 'function',
        profiler:          typeof ng.profiler        === 'object' && ng.profiler !== null,
        ngContextType:     (function(){
          var el = document.querySelector('[ng-version]') || document.body;
          var ctx = el && el.__ngContext__;
          return ctx === undefined ? 'absent' : Array.isArray(ctx) ? 'LView (Angular 9-13)' : typeof ctx;
        })(),
        ngHostAttrs:  document.querySelectorAll('[class*=_nghost]').length,
        ngContentAttrs: document.querySelectorAll('[class*=_ngcontent]').length,
        ngHostAttrStyle: (function(){
          var el = document.querySelector('*');
          var found = null;
          document.querySelectorAll('*').forEach(function(e){
            if (found) return;
            for (var i = 0; i < e.attributes.length; i++) {
              if (e.attributes[i].name.startsWith('_nghost')) { found = e.attributes[i].name; break; }
            }
          });
          return found;
        })()
      });
    })()`;

    try {
      browser.devtools.inspectedWindow.eval(script, (result, err) => {
        if (err) {
          log('panel', 'error', 'API diagnostic eval failed: ' + JSON.stringify(err));
          return;
        }
        try {
          const d = JSON.parse(result);
          log('panel', 'info', `Angular ${d.version || '?'} — API availability`, d);

          // Summarise what works
          const available = [];
          const unavailable = [];

          if (d.getComponent)       available.push('ng.getComponent (full component inspection)');
          else                      unavailable.push('ng.getComponent — not in production build');

          if (d.applyChanges)       available.push('ng.applyChanges (trigger CD on component)');
          else                      unavailable.push('ng.applyChanges — not in production build');

          if (d.getOwningComponent) available.push('ng.getOwningComponent');
          if (d.getDirectives)      available.push('ng.getDirectives');
          if (d.getInjector)        available.push('ng.getInjector');
          if (d.getHostElement)     available.push('ng.getHostElement');
          if (d.profiler)           available.push('ng.profiler (performance timing)');

          if (available.length) {
            log('panel', 'success', 'APIs available in this build:\n  • ' + available.join('\n  • '));
          }
          if (unavailable.length) {
            log('panel', 'warn', 'APIs NOT available (removed by production build):\n  • ' + unavailable.join('\n  • '));
          }

          // Structural detection capability
          if (d.ngContextType === 'LView (Angular 9-13)') {
            log('panel', 'success', 'LView arrays detected on DOM nodes — full production tree extraction available (Angular 9-13 path)');
          } else if (d.ngContextType === 'number') {
            log('panel', 'info', `__ngContext__ is a number on DOM nodes (Angular 14+). Tree extraction uses _nghost-* attributes (${d.ngHostAttrStyle || 'none found'}) and custom element tags`);
          } else {
            log('panel', 'warn', '__ngContext__ absent — Angular may not have bootstrapped yet, or ViewEncapsulation.None is used');
          }

          // Actionable guidance
          if (!d.getComponent) {
            log('panel', 'warn',
              'To unlock full component inspection, serve the app in development mode:\n' +
              '  ng serve                          (default = development)\n' +
              '  ng serve --configuration=development\n' +
              'Production builds remove debug APIs at compile time — they cannot be re-enabled at runtime.');
          }
        } catch (parseErr) {
          log('panel', 'error', 'Failed to parse diagnostic result: ' + result);
        }
      });
    } catch (e) {
      log('panel', 'error', 'inspectedWindow.eval not available: ' + e.message);
    }
  }

  // ── Banner ─────────────────────────────────────────────────────────────────

  function showBanner(type, html) {
    const b = document.getElementById('status-banner');
    if (!b) return;
    b.className = type;
    b.innerHTML = html;
  }

  function hideBanner() {
    const b = document.getElementById('status-banner');
    if (b) b.className = 'hidden';
  }

  // ── Tab routing ────────────────────────────────────────────────────────────

  let activeTab = 'tree';

  const tabComponents = {
    tree:        TreeTab,
    http:        HttpTab,
    store:       StoreTab,
    router:      RouterTab,
    di:          DiTab,
    performance: PerformanceTab,
    sources:     SourcesTab,
    debug:       DebugTab,
    settings:    null,
  };

  function activateTab(name) {
    activeTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));

    // Clear inline styles AND active class from every panel so CSS display:none takes effect
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.remove('active');
      p.removeAttribute('style');
      p.innerHTML = '';          // release previous render memory
    });

    const panel = document.getElementById('tab-' + name);
    if (!panel) { log('panel', 'error', `Tab panel #tab-${name} not found in DOM`); return; }
    panel.classList.add('active');

    if (name === 'settings') {
      renderSettings(panel);
    } else {
      const comp = tabComponents[name];
      if (comp && comp.render) {
        comp.render(panel);
      } else {
        log('panel', 'warn', `No component registered for tab: ${name}`);
      }
    }
  }

  // ── Settings tab ───────────────────────────────────────────────────────────

  function renderSettings(parent) {
    parent.style.overflowY = 'auto';
    parent.innerHTML = `
      <div class="settings-form">
        <h2 style="margin-bottom:16px;font-size:15px">${t('settings_title')}</h2>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_theme')}</strong><span>${t('settings_theme_desc')}</span></div>
          <div class="setting-control">
            <select id="s-theme">
              <option value="dark"   ${settings.theme==='dark'  ?'selected':''}>${t('settings_dark')}</option>
              <option value="light"  ${settings.theme==='light' ?'selected':''}>${t('settings_light')}</option>
              <option value="system" ${settings.theme==='system'?'selected':''}>${t('settings_system')}</option>
            </select>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_capture_body')}</strong><span>${t('settings_capture_body_desc')}</span></div>
          <div class="setting-control">${toggle('s-capture-body', settings.httpCaptureBody)}</div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_max_http')}</strong><span>${t('settings_max_http_desc')}</span></div>
          <div class="setting-control"><input type="number" id="s-max-http" value="${settings.maxHttpHistory}" min="10" max="5000" /></div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_slow_req')}</strong><span>${t('settings_slow_req_desc')}</span></div>
          <div class="setting-control"><input type="number" id="s-slow-req" value="${settings.slowRequestThreshold}" min="100" max="30000" /></div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_cd_alert')}</strong><span>${t('settings_cd_alert_desc')}</span></div>
          <div class="setting-control"><input type="number" id="s-cd-alert" value="${settings.cdCycleAlertThreshold}" min="1" max="300" /></div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_auto_clear')}</strong><span>${t('settings_auto_clear_desc')}</span></div>
          <div class="setting-control">${toggle('s-auto-clear', settings.autoClearOnNavigation)}</div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_detect_timeout')}</strong><span>${t('settings_detect_timeout_desc')}</span></div>
          <div class="setting-control"><input type="number" id="s-detect-timeout" value="${settings.angularDetectionTimeout}" min="1" max="60" /></div>
        </div>

        <div class="setting-row">
          <div class="setting-label"><strong>${t('settings_debug_prompt')}</strong><span>${t('settings_debug_prompt_desc')}</span></div>
          <div class="setting-control">${toggle('s-debug-prompt', settings.enableDebugModePrompt)}</div>
        </div>

        <div style="margin-top:16px">
          <button class="btn primary" id="s-save">${t('settings_save')}</button>
          <button class="btn" style="margin-left:8px" id="s-reset">${t('settings_reset')}</button>
        </div>

        <div style="margin-top:24px;color:var(--ai-text-muted);font-size:11px">
          DevTools Companion for Angular v1.1.4 — MIT License — Firefox 115+ / Chrome 120+ / Angular 12–18+
        </div>
      </div>
    `;

    document.getElementById('s-theme')?.addEventListener('change', e => {
      settings.theme = e.target.value === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : e.target.value;
      applyTheme();
    });
    document.getElementById('s-save')?.addEventListener('click', applySettings);
    document.getElementById('s-reset')?.addEventListener('click', resetSettings);
  }

  function toggle(id, checked) {
    return `<label class="toggle"><input type="checkbox" id="${id}" ${checked?'checked':''}><div class="toggle-track"></div><div class="toggle-thumb"></div></label>`;
  }

  function applySettings() {
    settings.theme                   = document.getElementById('s-theme')?.value || 'dark';
    settings.httpCaptureBody         = document.getElementById('s-capture-body')?.checked ?? true;
    settings.maxHttpHistory          = parseInt(document.getElementById('s-max-http')?.value)     || 500;
    settings.slowRequestThreshold    = parseInt(document.getElementById('s-slow-req')?.value)     || 1000;
    settings.cdCycleAlertThreshold   = parseInt(document.getElementById('s-cd-alert')?.value)     || 60;
    settings.autoClearOnNavigation   = document.getElementById('s-auto-clear')?.checked ?? false;
    settings.angularDetectionTimeout = parseInt(document.getElementById('s-detect-timeout')?.value) || 10;
    settings.enableDebugModePrompt   = document.getElementById('s-debug-prompt')?.checked ?? true;
    saveSettings();
    log('panel', 'success', 'Settings saved');
    showBanner('info', t('banner_settings_saved'));
    setTimeout(hideBanner, 2000);
  }

  function resetSettings() {
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
    log('panel', 'info', 'Settings reset to defaults');
    renderSettings(document.getElementById('tab-settings'));
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    log('panel', 'info', 'Panel initialising — tab: ' + browser.devtools.inspectedWindow.tabId);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      log('panel', 'info', 'Manual refresh requested');
      sendToPage('REFRESH_TREE', {});
    });

    loadSettings(() => {
      log('panel', 'info', 'Settings loaded — theme: ' + settings.theme);
      initLang();
      connectToBackground();
      activateTab('tree');
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  window.Panel = {
    sendToPage,
    getSettings:    () => settings,
    applySettings,
    resetSettings,
    runApiDiagnostic,
    log,
  };

  document.addEventListener('DOMContentLoaded', init);

})();
