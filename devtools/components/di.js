/**
 * di.js — Dependency Injection Inspector tab
 */
window.DiTab = (function () {
  'use strict';

  let container;
  let services = [];     // services for selected component
  let rootProviders = [];
  let selectedService = null;

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:row;overflow:hidden;';

    const left = document.createElement('div');
    left.className = 'pane-left';
    left.innerHTML = `
      <div class="toolbar">
        <span style="font-size:12px;color:var(--ai-text-muted)">${t('di_services_for')}</span>
      </div>
      <div class="scroll-list" id="di-service-list">
        <div class="empty-state"><div class="icon">💉</div><p>${t('di_select_comp')}</p></div>
      </div>
      <div style="border-top:1px solid var(--ai-border);padding:8px">
        <div style="font-size:11px;color:var(--ai-text-muted);margin-bottom:4px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase">${t('di_root_providers')}</div>
        <div id="root-providers-list" style="font-family:var(--font-code);font-size:11px;color:var(--ai-text-muted);max-height:120px;overflow-y:auto"></div>
      </div>
    `;

    const right = document.createElement('div');
    right.className = 'pane-right';
    right.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>${t('di_select_service')}</p></div>`;

    container.appendChild(left);
    container.appendChild(right);
  }

  function setServices(serviceList) {
    services = serviceList || [];
    renderServiceList();
  }

  function setRootProviders(providers) {
    rootProviders = providers || [];
    const el = document.getElementById('root-providers-list');
    if (!el) return;
    if (!rootProviders.length) {
      el.textContent = t('di_none_detected');
      return;
    }
    el.innerHTML = rootProviders.map(p => `<div style="padding:2px 0">${escHtml(p)}</div>`).join('');
  }

  function renderServiceList() {
    const list = document.getElementById('di-service-list');
    if (!list) return;
    if (!services.length) {
      list.innerHTML = `<div class="empty-state"><div class="icon">💉</div><p>${t('di_no_services')}</p></div>`;
      return;
    }
    list.innerHTML = '';
    for (const svc of services) {
      const div = document.createElement('div');
      div.className = 'action-row' + (svc === selectedService ? ' selected' : '');
      div.innerHTML = `
        <div>
          <div style="font-size:12px;font-weight:600">${escHtml(svc.name)}</div>
          <div style="font-size:11px;color:var(--ai-text-muted)">${escHtml(svc.scope || 'root')}</div>
        </div>
        ${svc.circular ? `<span style="color:var(--ai-error);font-size:11px" title="${t('di_circular')}">⚠ Circular</span>` : ''}
      `;
      div.addEventListener('click', () => { selectedService = svc; renderServiceList(); renderServiceDetail(svc); });
      list.appendChild(div);
    }
  }

  function renderServiceDetail(svc) {
    const right = container.querySelector('.pane-right');
    if (!right) return;
    const props = Object.entries(svc.properties || {});
    right.innerHTML = `
      <div class="detail-section">
        <h3>${t('di_service')}</h3>
        <table class="prop-table">
          <tr><td>${t('di_name')}</td><td class="prop-value">${escHtml(svc.name)}</td></tr>
          <tr><td>${t('di_scope')}</td><td class="prop-value">${escHtml(svc.scope || 'root')}</td></tr>
          ${svc.circular ? `<tr><td>${t('di_warning')}</td><td class="prop-value" style="color:var(--ai-error)">${t('di_circular')}</td></tr>` : ''}
        </table>
      </div>
      ${props.length ? `
      <div class="detail-section">
        <h3>${t('di_properties')}</h3>
        <table class="prop-table">
          ${props.map(([k,v])=>`<tr><td>${escHtml(k)}</td><td class="prop-value">${escHtml(JSON.stringify(v))}</td></tr>`).join('')}
        </table>
      </div>` : ''}
    `;
  }

  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, setServices, setRootProviders };
})();
