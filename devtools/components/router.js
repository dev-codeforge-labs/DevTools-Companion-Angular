/**
 * router.js — Router Inspector tab
 */
window.RouterTab = (function () {
  'use strict';

  let container;
  let currentRoute = null;
  let navHistory   = [];
  let routeConfig  = null;

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'overflow-y:auto;padding:14px;';
    refresh();
  }

  function refresh() {
    if (!container || !document.body.contains(container)) return;

    container.innerHTML = `
      <div class="detail-section">
        <h3>${t('router_current')}</h3>
        ${renderCurrentRoute()}
      </div>

      <div class="detail-section">
        <h3 style="display:flex;align-items:center;gap:8px">
          ${t('router_history')}
          <button class="btn" id="router-clear-btn" style="font-size:10px">${t('router_clear')}</button>
        </h3>
        <div id="nav-history-list">
          ${navHistory.length
            ? [...navHistory].reverse().map(renderNavEvent).join('')
            : `<div class="empty-state" style="height:60px"><p>${t('router_no_events')}</p></div>`}
        </div>
      </div>

      <div class="detail-section">
        <h3>${t('router_config')}</h3>
        ${routeConfig
          ? `<div class="source-tree">${renderRouteTree(routeConfig, 0)}</div>`
          : `<div style="color:var(--ai-text-muted);font-size:12px">${t('router_config_na')}</div>`}
      </div>
    `;

    const clearBtn = document.getElementById('router-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', clearHistory);
  }

  function renderCurrentRoute() {
    if (!currentRoute) {
      return `<div style="color:var(--ai-text-muted);font-size:12px">${t('router_navigate_hint')}</div>`;
    }
    const rows = [
      ['URL',          currentRoute.url || '—'],
      ['Path',         currentRoute.path || '—'],
      ['Component',    currentRoute.component || '—'],
      ['Params',       JSON.stringify(currentRoute.params || {})],
      ['Query Params', JSON.stringify(currentRoute.queryParams || {})],
      ['Data',         JSON.stringify(currentRoute.data || {})],
    ];
    return `<table class="prop-table">${rows.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="prop-value">${esc(v)}</td></tr>`).join('')}</table>`;
  }

  function renderNavEvent(e) {
    const cls = e.type === 'error' ? 'error' : e.type === 'cancel' ? 'cancel' : '';
    return `<div class="nav-event ${cls}">
      <span style="color:var(--ai-text-muted);font-size:10px">${formatTime(e.time)}</span>
      <span style="font-family:var(--font-code);font-size:12px">${esc(e.url)}</span>
      ${e.error ? `<span style="color:var(--ai-error);font-size:11px">✕ ${esc(e.error)}</span>` : ''}
    </div>`;
  }

  function renderRouteTree(routes, depth) {
    if (!Array.isArray(routes)) return '';
    return routes.map(r => {
      const indent   = depth * 14;
      const children = r.children ? renderRouteTree(r.children, depth + 1) : '';
      const active   = currentRoute && currentRoute.path && currentRoute.path.includes(r.path || '') ? 'active-route' : '';
      return `
        <div class="route-segment ${active}" style="padding-left:${8 + indent}px">
          <span style="color:var(--ai-primary)">/${esc(r.path || '')}</span>
          ${r.component ? `<span style="color:var(--ai-text-muted);font-size:11px"> → ${esc(r.component)}</span>` : ''}
          ${r.loadChildren ? '<span class="badge badge-detecting" style="font-size:9px">lazy</span>' : ''}
          ${(r.canActivate || []).length ? '<span style="color:var(--ai-warning);font-size:11px"> guard</span>' : ''}
        </div>
        ${children}
      `;
    }).join('');
  }

  function setCurrentRoute(route) {
    currentRoute = route;
    navHistory.push({ url: route.url, time: Date.now(), type: 'end' });
    if (navHistory.length > 200) navHistory.shift();
    refresh();
  }

  function addNavEvent(event) {
    navHistory.push(event);
    if (navHistory.length > 200) navHistory.shift();
    refresh();
  }

  function setRouteConfig(config) {
    routeConfig = config;
    refresh();
  }

  function clearHistory() {
    navHistory = [];
    refresh();
  }

  function formatTime(ts) { return ts ? new Date(ts).toLocaleTimeString() : ''; }
  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, setCurrentRoute, addNavEvent, setRouteConfig, clearHistory };
})();
