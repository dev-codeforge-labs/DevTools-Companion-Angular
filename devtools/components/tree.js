/**
 * tree.js — Component Tree Inspector tab
 */
window.TreeTab = (function () {
  'use strict';

  let container, treePane, detailPane;
  let allComponents = [];
  let selectedId = null;
  let expandedIds = new Set();
  let searchQuery = '';

  // ── Render ─────────────────────────────────────────────────────────────────

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:row;overflow:hidden;';

    treePane = el('div', 'pane-left');
    treePane.innerHTML = `
      <div class="toolbar">
        <input class="search-input" id="tree-search" placeholder="Filter components…" />
        <button class="btn" id="tree-picker" title="Pick element on page">⊕</button>
        <button class="btn" id="tree-refresh" title="Refresh tree">↺</button>
      </div>
      <div class="scroll-list" id="tree-list"></div>
    `;

    detailPane = el('div', 'pane-right');
    showDetailEmpty();

    container.appendChild(treePane);
    container.appendChild(detailPane);

    document.getElementById('tree-search').addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      renderTree();
    });
    document.getElementById('tree-refresh').addEventListener('click', () => {
      Panel.sendToPage('REFRESH_TREE', {});
    });
    document.getElementById('tree-picker').addEventListener('click', togglePicker);

    renderTree();
  }

  function showDetailEmpty() {
    detailPane.innerHTML = `<div class="empty-state"><div class="icon">🌲</div><p>Select a component to inspect its properties.</p></div>`;
  }

  // ── Tree rendering ─────────────────────────────────────────────────────────

  function setData(tree) {
    allComponents = tree;
    renderTree();
  }

  function renderTree() {
    const list = document.getElementById('tree-list');
    if (!list) return;
    if (!allComponents.length) {
      list.innerHTML = `<div class="empty-state"><div class="icon">🌲</div><p>No Angular components found.</p></div>`;
      return;
    }
    list.innerHTML = '';
    for (const node of allComponents) {
      const nodeEl = renderNode(node, 0);
      if (nodeEl) list.appendChild(nodeEl);
    }
  }

  function matchesSearch(node) {
    if (!searchQuery) return true;
    return node.name.toLowerCase().includes(searchQuery) ||
           (node.selector || '').toLowerCase().includes(searchQuery);
  }

  function subtreeMatches(node) {
    if (matchesSearch(node)) return true;
    return (node.children || []).some(subtreeMatches);
  }

  function renderNode(node, depth) {
    if (!subtreeMatches(node)) return null;

    const hasChildren = node.children && node.children.length > 0;
    const isExpanded  = expandedIds.has(node.id);

    const wrapper = el('div', 'tree-node');

    const header = el('div', 'tree-node-header' + (node.id === selectedId ? ' selected' : ''));
    header.style.paddingLeft = (8 + depth * 14) + 'px';
    header.innerHTML = `
      <span class="tree-toggle">${hasChildren ? (isExpanded ? '▾' : '▸') : ' '}</span>
      <span class="tree-name">${esc(node.name)}</span>
      ${node.selector ? `<span class="tree-selector">&lt;${esc(node.selector)}&gt;</span>` : ''}
      ${node.cdStrategy === 'OnPush' ? '<span class="badge badge-detecting" style="font-size:9px;margin-left:4px">OnPush</span>' : ''}
    `;

    header.addEventListener('click', () => {
      if (hasChildren) {
        isExpanded ? expandedIds.delete(node.id) : expandedIds.add(node.id);
      }
      selectComponent(node);
    });

    wrapper.appendChild(header);

    if (hasChildren && isExpanded) {
      const childrenEl = el('div', 'tree-children');
      for (const child of node.children) {
        const childEl = renderNode(child, depth + 1);
        if (childEl) childrenEl.appendChild(childEl);
      }
      wrapper.appendChild(childrenEl);
    }

    return wrapper;
  }

  // ── Selection & detail ─────────────────────────────────────────────────────

  function selectComponent(node) {
    selectedId = node.id;
    Panel.sendToPage('HIGHLIGHT', { id: node.id });
    renderTree();
    renderDetail(node);
  }

  function renderDetail(node) {
    if (!detailPane) return;
    const inputs  = Object.entries(node.inputs  || {});
    const outputs = node.outputs || [];
    const inputKeys = new Set(Object.keys(node.inputs || {}));
    const props   = Object.entries(node.props || {}).filter(([k]) => !inputKeys.has(k));

    detailPane.innerHTML = '';

    // — Component info —
    const fileRow = node.fileName
      ? `<tr>
           <td>File</td>
           <td class="prop-value" style="font-family:var(--font-code);font-size:11px" title="${esc(node.filePath || node.fileName)}">
             ${esc(node.fileName)}
             ${node.filePath && node.filePath !== node.fileName
               ? `<div style="color:var(--ai-text-muted);font-size:10px;margin-top:2px">${esc(node.filePath)}</div>`
               : ''}
           </td>
         </tr>`
      : '';

    const infoSection = makeSection('Component');
    const infoTable = document.createElement('table');
    infoTable.className = 'prop-table';
    infoTable.innerHTML = `
      <tr><td>Class</td><td class="prop-value">${esc(node.name)}</td></tr>
      <tr><td>Selector</td><td class="prop-value">${esc(node.selector || '—')}</td></tr>
      <tr><td>CD Strategy</td><td class="prop-value">${esc(node.cdStrategy || 'Default')}</td></tr>
      <tr><td>Element</td><td class="prop-value">${esc(node.tagName || '—')}</td></tr>
      ${fileRow}
    `;
    infoSection.appendChild(infoTable);
    detailPane.appendChild(infoSection);

    // — Inputs —
    if (inputs.length) {
      const section = makeSection('@Input() Bindings');
      const table = document.createElement('table');
      table.className = 'prop-table';
      inputs.forEach(([k, v]) => {
        const tr = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.textContent = k;
        const tdVal = document.createElement('td');
        const span = document.createElement('span');
        span.className = 'prop-value editable';
        span.contentEditable = 'true';
        span.dataset.prop = k;
        span.dataset.cid  = node.id;
        span.textContent   = JSON.stringify(v);
        tdVal.appendChild(span);
        const tog = makePropToggle(span, JSON.stringify(v));
        if (tog) tdVal.appendChild(tog);
        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        table.appendChild(tr);
      });
      section.appendChild(table);
      detailPane.appendChild(section);
    }

    // — Outputs —
    if (outputs.length) {
      const section = makeSection('@Output() Events');
      const table = document.createElement('table');
      table.className = 'prop-table';
      outputs.forEach(o => {
        const tr = document.createElement('tr');
        if (typeof o === 'string') {
          tr.innerHTML = `<td>${esc(o)}</td><td class="prop-value" style="color:var(--ai-text-muted)">EventEmitter</td>`;
        } else {
          const subBadge = o.subscribers > 0
            ? `<span class="badge badge-angular" style="font-size:9px;margin-left:4px" title="${o.subscribers} active subscriber(s)">${o.subscribers} sub</span>`
            : `<span style="color:var(--ai-text-muted);font-size:10px;margin-left:4px">no subs</span>`;
          const asyncBadge = o.isAsync
            ? `<span class="badge badge-detecting" style="font-size:9px;margin-left:4px" title="async EventEmitter">async</span>`
            : '';
          const aliasBadge = o.aliased
            ? `<span style="color:var(--ai-text-muted);font-size:10px;margin-left:4px" title="aliased output">≠</span>`
            : '';
          tr.innerHTML = `
            <td>${esc(o.name)}${aliasBadge}</td>
            <td class="prop-value" style="color:var(--ai-text-muted)">
              ${esc(o.type)}${subBadge}${asyncBadge}
            </td>`;
        }
        table.appendChild(tr);
      });
      section.appendChild(table);
      detailPane.appendChild(section);
    }

    // — Properties —
    if (props.length) {
      const section = makeSection('Properties');

      // Expand All / Collapse All toolbar
      const toolbar = document.createElement('div');
      toolbar.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
      const expandAllBtn  = btn('Expand All');
      const collapseAllBtn = btn('Collapse All');
      expandAllBtn.style.fontSize  = '10px';
      expandAllBtn.style.padding   = '2px 7px';
      collapseAllBtn.style.fontSize = '10px';
      collapseAllBtn.style.padding  = '2px 7px';
      toolbar.appendChild(expandAllBtn);
      toolbar.appendChild(collapseAllBtn);
      section.appendChild(toolbar);

      const table = document.createElement('table');
      table.className = 'prop-table';
      const allToggles = [];

      props.forEach(([k, v]) => {
        const raw = JSON.stringify(v);
        const tr  = document.createElement('tr');
        const tdKey = document.createElement('td');
        tdKey.textContent = k;
        const tdVal = document.createElement('td');
        const span = document.createElement('span');
        span.className   = 'prop-value';
        span.textContent  = raw;
        tdVal.appendChild(span);
        const tog = makePropToggle(span, raw);
        if (tog) { tdVal.appendChild(tog); allToggles.push(tog); }
        tr.appendChild(tdKey);
        tr.appendChild(tdVal);
        table.appendChild(tr);
      });

      expandAllBtn.addEventListener('click',  () => allToggles.forEach(t => { if (t._expand)  t._expand();  }));
      collapseAllBtn.addEventListener('click', () => allToggles.forEach(t => { if (t._collapse) t._collapse(); }));

      section.appendChild(table);
      detailPane.appendChild(section);
    }

    // — Actions —
    const actions = el('div', '');
    actions.style.cssText = 'display:flex;gap:8px;margin:8px 12px 12px;flex-wrap:wrap;';

    const copyBtn = btn('Copy JSON');
    copyBtn.addEventListener('click', () => copyState(node.id));

    const clearBtn = btn('Clear Highlight');
    clearBtn.addEventListener('click', () => Panel.sendToPage('HIDE_HIGHLIGHT', {}));

    actions.appendChild(copyBtn);
    actions.appendChild(clearBtn);
    detailPane.appendChild(actions);

    // — Inline editing —
    detailPane.querySelectorAll('[contenteditable]').forEach(editable => {
      editable.addEventListener('blur', () => {
        try {
          const val = JSON.parse(editable.textContent);
          Panel.sendToPage('SET_PROPERTY', {
            componentId: editable.dataset.cid,
            propPath:    editable.dataset.prop,
            value:       val
          });
        } catch { /* invalid JSON */ }
      });
    });
  }

  function copyState(id) {
    const node = findNode(id, allComponents);
    if (node) navigator.clipboard.writeText(JSON.stringify(node, null, 2));
  }

  function findNode(id, nodes) {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findNode(id, n.children || []);
      if (found) return found;
    }
    return null;
  }

  let pickerActive = false;
  function togglePicker() {
    pickerActive = !pickerActive;
    const pickerBtn = document.getElementById('tree-picker');
    if (pickerBtn) pickerBtn.style.color = pickerActive ? 'var(--ai-primary)' : '';
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  function btn(label) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    return b;
  }

  function makeSection(title) {
    const s = el('div', 'detail-section');
    s.style.margin = '0 12px 12px';
    const h = document.createElement('h3');
    h.textContent = title;
    s.appendChild(h);
    return s;
  }

  // Creates an expand/collapse toggle for a prop-value span when the value is long.
  // Returns the toggle button element (with ._expand / ._collapse callbacks), or null.
  const COLLAPSE_LEN = 80; // chars before we truncate
  function makePropToggle(span, raw) {
    if (raw.length <= COLLAPSE_LEN) return null; // short enough — no toggle needed

    const truncated = raw.slice(0, COLLAPSE_LEN) + '…';
    let expanded = false;
    span.textContent = truncated;
    span.title = 'Click to expand';
    span.style.cursor = 'pointer';
    span.style.wordBreak = 'break-all';

    const togBtn = document.createElement('button');
    togBtn.className = 'btn prop-expand-btn';
    togBtn.textContent = '▼ expand';
    togBtn.title = 'Expand value';

    function expand() {
      expanded = true;
      span.textContent = raw;
      span.title = 'Click to collapse';
      togBtn.textContent = '▲ collapse';
      togBtn.title = 'Collapse value';
    }
    function collapse() {
      expanded = false;
      span.textContent = truncated;
      span.title = 'Click to expand';
      togBtn.textContent = '▼ expand';
      togBtn.title = 'Expand value';
    }

    span.addEventListener('click', () => expanded ? collapse() : expand());
    togBtn.addEventListener('click', () => expanded ? collapse() : expand());
    togBtn._expand   = expand;
    togBtn._collapse = collapse;

    return togBtn;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, setData };
})();
