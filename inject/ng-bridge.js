/**
 * ng-bridge.js — runs in the PAGE context (not isolated world).
 * Accesses ng.*, Zone.js, and store globals directly.
 * Communicates back via window.postMessage.
 */
(function () {
  'use strict';

  const NAMESPACE = '__AngularInspector__';
  let detectionAttempts = 0;
  const MAX_ATTEMPTS = 5; // 2s × 5 = 10s

  // ── Utilities ──────────────────────────────────────────────────────────────

  function post(type, payload) {
    window.postMessage({ [NAMESPACE]: true, type, payload }, '*');
  }

  // Recognise Angular signal functions by their internal markers
  function isAngularSignal(fn) {
    if (typeof fn !== 'function') return false;
    // Angular signals have Symbol(SIGNAL) or ɵ-prefixed properties
    const keys = Object.keys(fn);
    if (keys.some(k => k.startsWith('ɵ') || k === '__brand__')) return true;
    // Check Symbol properties for Angular's internal SIGNAL symbol
    const syms = Object.getOwnPropertySymbols(fn);
    if (syms.some(s => s.toString().includes('signal') || s.toString().includes('SIGNAL'))) return true;
    // Heuristic: zero-arg function with no prototype methods (signal/computed shape)
    if (fn.length === 0 && Object.keys(fn).length > 0) return true;
    return false;
  }

  function safeStringify(value, depth = 0) {
    if (depth > 4) return '[…]';
    try {
      if (value === null)      return null;
      if (value === undefined) return undefined;
      if (typeof value === 'function') {
        // Try Angular Signal / Computed — call it to get the current value
        if (isAngularSignal(value)) {
          try {
            const signalValue = value();
            const label = value.name ? `signal(${value.name})` : 'signal';
            if (signalValue === null || signalValue === undefined || typeof signalValue !== 'object') {
              return `${label}: ${safeStringify(signalValue, depth + 1)}`;
            }
            return { '[Signal]': safeStringify(signalValue, depth + 1) };
          } catch { /* not a callable signal */ }
        }
        // Named function — show its signature
        const fname = value.name || '(anonymous)';
        const args  = value.length > 0 ? `(${value.length} arg${value.length > 1 ? 's' : ''})` : '()';
        return `[Function: ${fname}${args}]`;
      }
      if (typeof value !== 'object') return value;
      if (value instanceof HTMLElement) return `[${value.tagName.toLowerCase()}]`;
      if (value instanceof Date)        return value.toISOString();
      if (value instanceof RegExp)      return value.toString();
      if (Array.isArray(value)) {
        const items = value.slice(0, 20).map(v => safeStringify(v, depth + 1));
        return value.length > 20 ? [...items, `…+${value.length - 20}`] : items;
      }
      const out = {};
      let count = 0;
      for (const k of Object.keys(value)) {
        if (k.startsWith('ɵ') || k.startsWith('__')) continue; // skip Angular internals
        if (count++ > 30) { out['…'] = `(+${Object.keys(value).length - 30} more)`; break; }
        try { out[k] = safeStringify(value[k], depth + 1); } catch { out[k] = '[Error]'; }
      }
      return out;
    } catch {
      return '[Unserializable]';
    }
  }

  function getPublicProps(instance) {
    const props = {};
    try {
      for (const key of Object.keys(instance)) {
        if (key.startsWith('__') || key.startsWith('ɵ')) continue;
        props[key] = safeStringify(instance[key]);
      }
    } catch { /* ignore */ }
    return props;
  }

  // ── Angular detection ──────────────────────────────────────────────────────

  function detectAngular() {
    // Method 1: Ivy debug API (development mode)
    if (window.ng && typeof window.ng.getComponent === 'function') return 'ivy';
    // Method 2: Legacy API (Angular 2–8)
    if (typeof window.getAllAngularRootElements === 'function')      return 'legacy';
    // Method 3: ng-version attribute — present even in production builds
    if (document.querySelector('[ng-version]'))                      return 'production-dom';
    // Method 4: __ngContext__ on any DOM node — set by Angular renderer in all modes
    const anyNgEl = document.querySelector('[__ngContext__]') ||
                    findNgContextEl(document.body, 0);
    if (anyNgEl) return 'production-ctx';
    return null;
  }

  function findNgContextEl(el, depth) {
    if (depth > 5 || !el) return null;
    if (el.__ngContext__ !== undefined) return el;
    for (const child of el.children) {
      const found = findNgContextEl(child, depth + 1);
      if (found) return found;
    }
    return null;
  }

  function tryDetect() {
    dbg('debug', `Detection attempt ${detectionAttempts + 1}/${MAX_ATTEMPTS} — ` +
      `window.ng=${typeof window.ng} ` +
      `ng.getComponent=${!!(window.ng && window.ng.getComponent)} ` +
      `getAllAngularRootElements=${typeof window.getAllAngularRootElements} ` +
      `[ng-version]=${!!document.querySelector('[ng-version]')} ` +
      `__ngContext__=${!!document.querySelector('[__ngContext__]')} ` +
      `readyState=${document.readyState}`);

    const version = detectAngular();
    if (version) {
      detectedVersion = version;
      const mode = detectMode(version);
      dbg('success', `Angular detected — method: "${version}", mode: "${mode}"`);
      post('ANGULAR_DETECTED', { version, mode });
      init(version);
      return;
    }
    if (++detectionAttempts < MAX_ATTEMPTS) {
      dbg('debug', `Not found yet — retrying in 2s (attempt ${detectionAttempts}/${MAX_ATTEMPTS})`);
      setTimeout(tryDetect, 2000);
    } else {
      dbg('warn', 'Angular not found after all attempts. Page may not be an Angular app, or it loaded before injection.');
      post('ANGULAR_NOT_FOUND', {});
    }
  }

  function detectMode(version) {
    // production-dom / production-ctx → ng.getComponent not available → production build
    if (version === 'production-dom' || version === 'production-ctx') return 'production';
    // 'ivy'    → detectAngular() only returns this when window.ng.getComponent exists → dev build
    // 'legacy' → getAllAngularRootElements exists → dev build
    return 'development';
  }

  // ── Component Tree ─────────────────────────────────────────────────────────

  let componentTree = [];
  let detectedVersion = null; // set by init()
  let cachedSourceFiles = null;  // set by discoverSourceMaps() once resolved
  let cachedSourceMapCount = 0;

  // LView slot constants (Angular Ivy internal — stable since v9)
  const LVIEW_CONTEXT = 8;  // component instance
  const LVIEW_TVIEW   = 1;  // TView metadata

  function buildTree() {
    // Development mode: use the public debug API (ng.getComponent)
    if (window.ng && typeof window.ng.getComponent === 'function') {
      return buildTreeDev();
    }
    // Production / legacy: walk DOM for __ngContext__ (LView)
    return buildTreeProduction();
  }

  // --- Development mode tree ------------------------------------------------

  function getRoots() {
    try {
      if (window.getAllAngularRootElements) return window.getAllAngularRootElements();
      return [document.querySelector('[ng-version]') || document.body];
    } catch { return []; }
  }

  function buildTreeDev() {
    const roots = getRoots();
    const tree = [];
    for (const rootEl of roots) {
      // Walk the entire DOM from the root, collecting only actual Angular components
      walkDevComponents(rootEl, null, tree, 0);
    }
    return tree;
  }

  /**
   * Extract rich metadata for each @Output() from the live component instance.
   * Returns an array of objects: { name, type, subscribers, isAsync, aliased }
   */
  function extractOutputs(comp, outputsDef) {
    return Object.entries(outputsDef).map(([pubName, propDef]) => {
      // propDef can be a string (Angular <15) or [privateName, flags] (Angular 15+)
      const privateName = typeof propDef === 'string' ? propDef
                        : Array.isArray(propDef)      ? propDef[0]
                        : pubName;
      const info = { name: pubName, type: 'EventEmitter', subscribers: 0, isAsync: false, aliased: privateName !== pubName };
      try {
        const emitter = comp[privateName];
        if (!emitter) return info;
        // Constructor name: 'EventEmitter', 'Subject', 'BehaviorSubject', etc.
        info.type = emitter.constructor?.name || 'EventEmitter';
        // RxJS 7+: emitter.observed (boolean)
        // RxJS 6:  emitter.observers (array)
        if (typeof emitter.observed === 'boolean') {
          info.subscribers = emitter.observed ? (emitter.observers?.length ?? 1) : 0;
        } else if (Array.isArray(emitter.observers)) {
          info.subscribers = emitter.observers.length;
        }
        // Angular EventEmitter async flag
        if (typeof emitter.__isAsync === 'boolean') info.isAsync = emitter.__isAsync;
      } catch { /* ignore */ }
      return info;
    });
  }

  /**
   * Walk every DOM element; create a tree node only when ng.getComponent()
   * returns a component instance. Non-component elements are transparent —
   * their children are promoted to the current parent level.
   */
  function walkDevComponents(el, parentId, list, depth) {
    if (depth > 60 || !el) return;

    let comp = null;
    try { comp = window.ng.getComponent(el); } catch { /* not a component */ }

    if (comp) {
      const id = el.__aiId || (el.__aiId = uid());
      let name = comp.constructor.name || 'Component';
      let selector = '', inputs = {}, outputs = [], props = {}, cdStrategy = 'Default';

      const compDef = comp.constructor['ɵcmp'] || comp.constructor['ɵdir'];
      let fileName = null, filePath = null;
      if (compDef) {
        selector   = compDef.selectors ? compDef.selectors.flat().filter(Boolean).join(', ') : el.tagName?.toLowerCase() || '';
        cdStrategy = compDef.onPush ? 'OnPush' : 'Default';
        for (const [pub, prop] of Object.entries(compDef.inputs || {})) {
          try { inputs[pub] = safeStringify(comp[typeof prop === 'string' ? prop : prop[0]]); } catch { inputs[pub] = null; }
        }
        outputs = extractOutputs(comp, compDef.outputs || {});
        // Angular 17+ exposes debugInfo on the component definition
        if (compDef.debugInfo) {
          name     = compDef.debugInfo.className || name;
          filePath = compDef.debugInfo.filePath  || null;
          fileName = filePath ? filePath.split('/').pop() : null;
        }
      }
      // Fallback: infer filename from class name using Angular naming convention
      if (!fileName) {
        fileName = classNameToFileName(name);
        filePath = filePath || fileName; // no full path without source maps
      }
      props = getPublicProps(comp);

      const node = { id, parentId, name, selector, inputs, outputs, props, cdStrategy, fileName, filePath, children: [], tagName: el.tagName?.toLowerCase() };
      list.push(node);

      // Children of this component go into node.children
      for (const child of el.children) {
        walkDevComponents(child, id, node.children, depth + 1);
      }
    } else {
      // Not a component — keep walking children at the same parent level
      for (const child of el.children) {
        walkDevComponents(child, parentId, list, depth + 1);
      }
    }
  }

  // --- Production mode tree ------------------------------------------------
  // In Angular 14+, __ngContext__ is always a number (node index) on all DOM
  // elements — LViews are never directly attached to DOM nodes. We use two
  // alternative signals instead:
  //   1. _nghost-* attribute  → Emulated ViewEncapsulation host marker
  //   2. Custom element tags  → components with hyphenated selectors
  // We also still try the LView array path for Angular 9-13 as a first pass.

  function buildTreeProduction() {
    dbg('info', '══ buildTreeProduction() START ══');
    dbg('info', `  Angular version attr: ${document.querySelector('[ng-version]')?.getAttribute('ng-version') || 'not found'}`);
    dbg('info', `  window.ng: ${typeof window.ng} | ng.getComponent: ${!!(window.ng && window.ng.getComponent)}`);
    dbg('info', `  window.Zone: ${typeof window.Zone} | getAllAngularRootElements: ${typeof window.getAllAngularRootElements}`);

    // --- Full DOM scan for diagnostics ---
    let cntNum = 0, cntArr = 0, cntObj = 0, cntNghost = 0, cntNgcontent = 0;
    let cntCustomEl = 0, cntNgVersion = 0, cntNgContext = 0;
    const sampleNghosts = [], sampleCustomEls = [], sampleNgContextNums = [];

    document.querySelectorAll('*').forEach(el => {
      const tag = el.tagName.toLowerCase();
      const ctx = el.__ngContext__;

      if (ctx !== undefined && ctx !== null) {
        cntNgContext++;
        if (typeof ctx === 'number') {
          cntNum++;
          if (sampleNgContextNums.length < 5) sampleNgContextNums.push(`<${tag}> → ${ctx}`);
        } else if (Array.isArray(ctx)) {
          cntArr++;
        } else if (typeof ctx === 'object') {
          cntObj++;
        }
      }

      for (const attr of el.attributes) {
        if (attr.name.startsWith('_nghost')) {
          cntNghost++;
          if (sampleNghosts.length < 8) sampleNghosts.push(`<${tag} ${attr.name}>`);
          break;
        }
        if (attr.name.startsWith('_ngcontent')) { cntNgcontent++; break; }
      }

      if (el.hasAttribute('ng-version')) cntNgVersion++;
      if (tag.includes('-') && ctx !== undefined) {
        cntCustomEl++;
        if (sampleCustomEls.length < 8) sampleCustomEls.push(`<${tag}>`);
      }
    });

    dbg('info', `  DOM totals — elements with __ngContext__: ${cntNgContext} (${cntNum} numbers, ${cntArr} arrays, ${cntObj} objects)`);
    dbg('info', `  DOM totals — _nghost: ${cntNghost} | _ngcontent: ${cntNgcontent} | [ng-version]: ${cntNgVersion} | custom-el with ctx: ${cntCustomEl}`);
    if (sampleNgContextNums.length) dbg('info', `  Sample __ngContext__ numbers: ${sampleNgContextNums.join(' | ')}`);
    if (sampleNghosts.length)       dbg('info', `  Sample _nghost elements: ${sampleNghosts.join(' | ')}`);
    if (sampleCustomEls.length)     dbg('info', `  Sample custom elements: ${sampleCustomEls.join(' | ')}`);

    // --- Pass 1: LView arrays directly on DOM elements (Angular 9-13) ---
    dbg('info', '  → Pass 1: LView array scan (Angular 9-13)…');
    const lviewRoots = [];
    walkDOMByLView(document.querySelector('[ng-version]') || document.body, null, lviewRoots, 0);
    dbg('info', `  Pass 1 result: ${countNodes(lviewRoots)} component(s)`);
    if (lviewRoots.length) return lviewRoots;

    // --- Pass 2: _nghost-* attribute (Angular 14+, ViewEncapsulation.Emulated) ---
    dbg('info', `  → Pass 2: _nghost attribute scan (${cntNghost} candidates)…`);
    if (cntNghost > 0) {
      const hostRoots = buildTreeByNghost();
      dbg('info', `  Pass 2 result: ${countNodes(hostRoots)} component(s) in ${hostRoots.length} root(s)`);
      if (hostRoots.length) return hostRoots;
      dbg('warn', '  Pass 2: _nghost elements found but tree building produced 0 roots — check idMap logic');
    } else {
      dbg('warn', '  Pass 2 skipped: no _nghost elements (app may use ViewEncapsulation.None or ShadowDom)');
    }

    // --- Pass 3: custom element tags ---
    dbg('info', `  → Pass 3: custom element scan (${cntCustomEl} candidates)…`);
    const ceRoots = buildTreeByCustomElements();
    dbg('info', `  Pass 3 result: ${countNodes(ceRoots)} component(s) in ${ceRoots.length} root(s)`);

    if (!ceRoots.length) {
      dbg('warn', '  ALL PASSES FAILED — possible causes:');
      dbg('warn', '    • ViewEncapsulation.None + no custom element tags');
      dbg('warn', '    • ng-bridge injected before Angular bootstrapped (race condition)');
      dbg('warn', '    • Angular compiled with non-standard output (Nx, custom webpack, etc.)');
      dbg('warn', `    • Try clicking "Test injection" in this Debug tab after page fully loads`);
    }

    dbg('info', '══ buildTreeProduction() END ══');
    return ceRoots;
  }

  // Pass 1 — LView arrays attached to DOM elements (Angular 9-13)
  function walkDOMByLView(el, parentId, list, depth) {
    if (depth > 60 || !el) return;
    const ctx = el.__ngContext__;
    if (Array.isArray(ctx)) {
      const instance = getInstanceFromLView(ctx);
      if (instance) {
        const node = extractProductionNode(el, instance, ctx, parentId);
        list.push(node);
        for (const child of el.children) walkDOMByLView(child, node.id, node.children, depth + 1);
        return;
      }
    }
    for (const child of el.children) walkDOMByLView(child, parentId, list, depth + 1);
  }

  function getInstanceFromLView(lView) {
    const candidates = [8, 7, 9, 6, 10];
    for (const i of candidates) {
      const v = lView[i];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor &&
          (v.constructor['ɵcmp'] || v.constructor['ɵdir'])) return v;
    }
    for (let i = 0; i < Math.min(lView.length, 30); i++) {
      const v = lView[i];
      if (v && typeof v === 'object' && !Array.isArray(v) && v.constructor &&
          (v.constructor['ɵcmp'] || v.constructor['ɵdir'])) return v;
    }
    return null;
  }

  // Pass 2 — _nghost-* attribute markers (Angular 14+, ViewEncapsulation.Emulated)
  function buildTreeByNghost() {
    // Collect all host elements, ordered by DOM position
    const hosts = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      for (const attr of node.attributes) {
        if (attr.name.startsWith('_nghost')) {
          hosts.push({ el: node, hostAttr: attr.name, contentAttr: attr.name.replace('_nghost', '_ngcontent') });
          break;
        }
      }
      node = walker.nextNode();
    }

    // Also include [ng-version] root even if it has no _nghost
    const ngRoot = document.querySelector('[ng-version]');
    if (ngRoot && !hosts.find(h => h.el === ngRoot)) {
      hosts.unshift({ el: ngRoot, hostAttr: 'ng-version', contentAttr: null });
    }

    // Build tree: a host is a child of the nearest ancestor that is also a host
    const idMap = new Map(); // el → node
    const roots = [];

    for (const { el, hostAttr } of hosts) {
      const id = el.__aiId || (el.__aiId = uid());
      const name = tagToComponentName(el.tagName.toLowerCase());
      const treeNode = {
        id, parentId: null, name,
        selector: el.tagName.toLowerCase(),
        inputs: extractAttributeInputs(el),
        outputs: [], props: {}, cdStrategy: 'Default',
        children: [], tagName: el.tagName.toLowerCase()
      };
      idMap.set(el, treeNode);

      // Find nearest ancestor that is also a host
      let parent = el.parentElement;
      let parentNode = null;
      while (parent) {
        parentNode = idMap.get(parent);
        if (parentNode) break;
        parent = parent.parentElement;
      }

      if (parentNode) {
        treeNode.parentId = parentNode.id;
        parentNode.children.push(treeNode);
      } else {
        roots.push(treeNode);
      }
    }
    return roots;
  }

  // Pass 3 — custom element heuristic (fallback when no _nghost)
  function buildTreeByCustomElements() {
    const roots = [];
    walkDOMByCustomEl(document.querySelector('[ng-version]') || document.body, null, roots, 0);
    return roots;
  }

  function walkDOMByCustomEl(el, parentId, list, depth) {
    if (depth > 60 || !el) return;
    if (isLikelyAngularComponent(el)) {
      const id = el.__aiId || (el.__aiId = uid());
      const node = {
        id, parentId,
        name: tagToComponentName(el.tagName.toLowerCase()),
        selector: el.tagName.toLowerCase(),
        inputs: extractAttributeInputs(el),
        outputs: [], props: {}, cdStrategy: 'Default',
        children: [], tagName: el.tagName.toLowerCase()
      };
      list.push(node);
      for (const child of el.children) walkDOMByCustomEl(child, id, node.children, depth + 1);
      return;
    }
    for (const child of el.children) walkDOMByCustomEl(child, parentId, list, depth + 1);
  }

  function isLikelyAngularComponent(el) {
    const tag = el.tagName.toLowerCase();
    if (isAngularBuiltin(el)) return false;
    // Custom elements always have a hyphen
    if (tag.includes('-')) return true;
    // Root component has ng-version
    if (el.hasAttribute('ng-version')) return true;
    return false;
  }

  function extractAttributeInputs(el) {
    const inputs = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('_ng') || attr.name === 'ng-version') continue;
      // Angular passes inputs as attributes (kebab or camelCase)
      if (!attr.name.includes(':') && attr.value !== '') {
        inputs[attr.name] = attr.value;
      }
    }
    return inputs;
  }

  function extractProductionNode(el, instance, lView, parentId) {
    const id  = el.__aiId || (el.__aiId = uid());
    const def = instance.constructor['ɵcmp'] || instance.constructor['ɵdir'];

    let name       = instance.constructor.name || 'Component';
    // Minified names are typically short (1-2 chars); try to recover from selector
    if (name.length <= 2 && def && def.selectors) name = selectorToName(def.selectors) || name;

    let selector   = '';
    let cdStrategy = 'Default';
    let inputs     = {};
    let outputs    = [];

    if (def) {
      selector   = def.selectors ? def.selectors.flat().filter(Boolean).join(', ') : (el.tagName?.toLowerCase() || '');
      cdStrategy = def.onPush ? 'OnPush' : 'Default';
      for (const [pub, prop] of Object.entries(def.inputs || {})) {
        try {
          const key = typeof prop === 'string' ? prop : (Array.isArray(prop) ? prop[0] : pub);
          inputs[pub] = safeStringify(instance[key]);
        } catch { inputs[pub] = null; }
      }
      outputs = Object.keys(def.outputs || {});
    }

    const props = getPublicProps(instance);

    return {
      id, parentId, name, selector, inputs, outputs, props, cdStrategy,
      children: [], tagName: el.tagName?.toLowerCase()
    };
  }

  // Angular built-in elements that are NOT user components
  const ANGULAR_BUILTINS = new Set([
    'router-outlet', 'ng-container', 'ng-content', 'ng-template',
    'ng-component', 'ng-element', 'ng-transclude'
  ]);

  function classNameToFileName(className) {
    if (!className || className === 'Unknown') return null;
    // Strip leading underscore (Angular sometimes prefixes minified names)
    let base = className.replace(/^_+/, '');
    // Identify Angular suffix to use as file type segment
    const suffixes = ['Component','Directive','Pipe','Guard','Resolver','Service','Interceptor','Module'];
    let typeSuffix = '';
    for (const s of suffixes) {
      if (base.endsWith(s)) { typeSuffix = '.' + s.toLowerCase(); base = base.slice(0, -s.length); break; }
    }
    if (!typeSuffix) typeSuffix = '.component'; // assume component if no suffix
    // PascalCase → kebab-case
    const kebab = base.replace(/([A-Z])/g, (_, c, i) => (i > 0 ? '-' : '') + c.toLowerCase());
    return kebab + typeSuffix + '.ts';
  }

  function tagToComponentName(tag) {
    if (!tag) return 'UnknownComponent';
    // kebab-case → PascalCase + "Component"
    return tag.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())
              .replace(/^(.)/, c => c.toUpperCase()) + 'Component';
  }

  function selectorToName(selectors) {
    try {
      const flat = selectors.flat().filter(s => typeof s === 'string' && s.length > 2);
      if (!flat.length) return '';
      return tagToComponentName(flat[0]);
    } catch { return ''; }
  }

  function isAngularBuiltin(el) {
    return ANGULAR_BUILTINS.has(el.tagName.toLowerCase());
  }

  function countNodes(nodes) {
    return nodes.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0);
  }

  // --- Refresh --------------------------------------------------------------

  function refreshTree() {
    dbg('info', `refreshTree() called — readyState: ${document.readyState} — DOM nodes: ${document.querySelectorAll('*').length}`);
    try {
      componentTree = buildTree();
      const total = countNodes(componentTree);
      dbg(total > 0 ? 'success' : 'warn', `refreshTree() → ${total} node(s) in ${componentTree.length} root(s)`);
      if (total > 0) {
        const names = flattenNames(componentTree).slice(0, 10);
        dbg('info', `  Components found: ${names.join(', ')}${total > 10 ? ` … +${total - 10} more` : ''}`);
      }
      post('COMPONENT_TREE', { tree: componentTree });
    } catch (e) {
      dbg('warn', `refreshTree() ERROR: ${e.message}\n${e.stack}`);
      post('COMPONENT_TREE', { tree: [], error: e.message });
    }
  }

  function flattenNames(nodes) {
    const names = [];
    for (const n of nodes) {
      names.push(n.name);
      names.push(...flattenNames(n.children || []));
    }
    return names;
  }

  // ── Component highlight overlay ────────────────────────────────────────────

  let overlay = null;

  function showOverlay(id) {
    const el = findElementById(id);
    if (!el) return;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ai-highlight-overlay';
      document.body.appendChild(overlay);
    }
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      top: (r.top + window.scrollY) + 'px',
      left: (r.left + window.scrollX) + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
      display: 'block'
    });
  }

  function hideOverlay() {
    if (overlay) overlay.style.display = 'none';
  }

  function findElementById(id) {
    return document.querySelector(`[data-ai-id="${id}"]`) || findElByWalking(id, document.body);
  }

  function findElByWalking(id, el) {
    if (el.__aiId === id) return el;
    for (const child of el.children) {
      const found = findElByWalking(id, child);
      if (found) return found;
    }
    return null;
  }

  // ── Inline property editing ────────────────────────────────────────────────

  function setProperty(componentId, propPath, value) {
    try {
      const el = findElByWalking(componentId, document.body);
      if (!el) return;
      const comp = window.ng.getComponent(el);
      if (!comp) return;
      const parts = propPath.split('.');
      let target = comp;
      for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
      target[parts[parts.length - 1]] = value;
      window.ng.applyChanges(comp);
      post('PROP_UPDATED', { componentId, propPath, value });
    } catch (e) {
      post('PROP_UPDATE_ERROR', { error: e.message });
    }
  }

  // ── HTTP interception ──────────────────────────────────────────────────────

  const httpLog = [];

  function interceptHTTP() {
    interceptXHR();
    interceptFetch();
  }

  function interceptXHR() {
    const OrigXHR = window.XMLHttpRequest;
    function PatchedXHR() {
      const xhr = new OrigXHR();
      const entry = { id: uid(), method: '', url: '', startTime: 0, endTime: 0, status: 0, duration: 0, requestHeaders: {}, responseHeaders: {}, requestBody: null, responseBody: null };

      const origOpen  = xhr.open.bind(xhr);
      const origSend  = xhr.send.bind(xhr);
      const origSetRH = xhr.setRequestHeader.bind(xhr);

      xhr.open = function (method, url, ...args) {
        entry.method = method;
        entry.url    = url;
        return origOpen(method, url, ...args);
      };
      xhr.setRequestHeader = function (name, value) {
        entry.requestHeaders[name] = value;
        return origSetRH(name, value);
      };
      xhr.send = function (body) {
        entry.startTime = Date.now();
        entry.requestBody = safeStringify(body);
        xhr.addEventListener('loadend', () => {
          entry.endTime  = Date.now();
          entry.duration = entry.endTime - entry.startTime;
          entry.status   = xhr.status;
          try { entry.responseBody = xhr.responseText.slice(0, 50000); } catch { /* ignore */ }
          httpLog.push(entry);
          post('HTTP_REQUEST', { entry });
        });
        return origSend(body);
      };
      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;
  }

  function interceptFetch() {
    const origFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
      const entry = {
        id: uid(),
        method: (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase(),
        url: input instanceof Request ? input.url : String(input),
        startTime: Date.now(),
        endTime: 0, duration: 0, status: 0,
        requestHeaders: {}, responseHeaders: {},
        requestBody: safeStringify(init.body ?? null),
        responseBody: null
      };
      try {
        if (init.headers) {
          const h = new Headers(init.headers);
          h.forEach((v, k) => { entry.requestHeaders[k] = v; });
        }
        const response = await origFetch(input, init);
        entry.status   = response.status;
        entry.endTime  = Date.now();
        entry.duration = entry.endTime - entry.startTime;
        response.headers.forEach((v, k) => { entry.responseHeaders[k] = v; });
        const clone = response.clone();
        clone.text().then(text => {
          entry.responseBody = text.slice(0, 50000);
          httpLog.push(entry);
          post('HTTP_REQUEST', { entry });
        });
        return response;
      } catch (err) {
        entry.endTime  = Date.now();
        entry.duration = entry.endTime - entry.startTime;
        entry.error    = err.message;
        httpLog.push(entry);
        post('HTTP_REQUEST', { entry });
        throw err;
      }
    };
  }

  // ── Router monitoring ──────────────────────────────────────────────────────

  function monitorRouter() {
    // Poll URL for simple navigation detection; Angular router events handled via ng globals
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        post('NAVIGATION', { url: lastUrl, time: Date.now() });
        setTimeout(refreshTree, 300);
      }
    }, 500);
  }

  // ── Change Detection hooks ─────────────────────────────────────────────────

  function hookChangeDetection() {
    try {
      const appRef = window.ng.getComponent(getRoots()[0]);
      if (!appRef) return;
      // Wrap Zone.js if available
      if (window.Zone && Zone.current) {
        const orig = Zone.current.__zone_symbol__forkInnerZone || null;
      }
      // Hook ApplicationRef.tick via prototype monkey-patch (best effort)
      const proto = Object.getPrototypeOf(window.ng);
      // We'll rely on MutationObserver + polling for CD cycle detection
    } catch { /* ignore */ }
  }

  // ── Store detection ────────────────────────────────────────────────────────

  function detectAndMonitorStore() {
    let type = null;
    // NgRx
    if (window.__REDUX_DEVTOOLS_EXTENSION__) { type = 'ngrx'; monitorNgRx(); }
    // NGXS
    else if (window.ngxs) { type = 'ngxs'; }
    // Akita
    else if (window.akita) { type = 'akita'; }

    if (type) {
      post('STORE_DETECTED', { type });
    } else {
      // Retry once after 3s to allow late-bootstrapped stores
      setTimeout(() => {
        if (!window.__REDUX_DEVTOOLS_EXTENSION__ && !window.ngxs && !window.akita) {
          post('STORE_NOT_FOUND', {});
        }
      }, 3000);
    }
  }

  function monitorNgRx() {
    try {
      const devtools = window.__REDUX_DEVTOOLS_EXTENSION__;
      if (devtools && devtools.__stores) {
        // Subscribe to redux devtools messages
      }
    } catch { /* ignore */ }
  }

  // ── Source map discovery ───────────────────────────────────────────────────

  function discoverSourceMaps() {
    // Find .map files the browser already loaded (dev builds trigger these automatically)
    const mapEntries = performance.getEntriesByType('resource')
      .map(e => e.name)
      .filter(n => n.endsWith('.js.map') || n.endsWith('.ts.map') || n.endsWith('.map'));

    // Also scan <script src> tags and probe for a sibling .map file
    const scriptUrls = [];
    document.querySelectorAll('script[src]').forEach(s => {
      const url = s.src;
      if (url && !mapEntries.includes(url + '.map')) {
        scriptUrls.push(url + '.map');
      }
    });

    const candidates = [...new Set([...mapEntries, ...scriptUrls])];

    if (!candidates.length) {
      cachedSourceMapCount = 0;
      cachedSourceFiles = {};
      post('SOURCE_MAPS_FOUND', { count: 0, scripts: [] });
      return;
    }

    // Fetch each candidate; skip 404s
    let resolved = 0;
    const allFiles = {};

    function done() {
      resolved++;
      if (resolved === candidates.length) {
        const count = Object.keys(allFiles).length;
        cachedSourceMapCount = count;
        cachedSourceFiles = allFiles;
        post('SOURCE_MAPS_FOUND', { count, scripts: candidates });
        if (count) post('SOURCE_FILES', { files: allFiles });
      }
    }

    candidates.forEach(url => {
      fetch(url, { cache: 'force-cache' })
        .then(r => r.ok ? r.json() : null)
        .then(map => {
          if (map && Array.isArray(map.sources)) {
            map.sources.forEach((src, i) => {
              const content = map.sourcesContent && map.sourcesContent[i];
              if (content && src) allFiles[src] = content;
            });
          }
          done();
        })
        .catch(() => done());
    });
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  function uid() { return Math.random().toString(36).slice(2); }

  // ── Debug log relay ────────────────────────────────────────────────────────

  function dbg(level, message, data) {
    post('LOG', { level, message, data });
  }

  // ── Message handler (from content script) ─────────────────────────────────

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__AngularInspectorCmd__ !== true) return;
    const { cmd, payload } = e.data;
    switch (cmd) {
      case 'REFRESH_TREE':   refreshTree(); break;
      case 'HIGHLIGHT':      showOverlay(payload.id); break;
      case 'HIDE_HIGHLIGHT': hideOverlay(); break;
      case 'SET_PROPERTY':   setProperty(payload.componentId, payload.propPath, payload.value); break;
      case 'GET_HTTP_LOG':    post('HTTP_LOG', { entries: httpLog }); break;
      case 'PING':            post('PONG', { time: Date.now() }); break;
      case 'START_PROFILING':  startProfiling();         break;
      case 'STOP_PROFILING':   stopProfiling();          break;
      case 'SCAN_SERVICES':    postNgServicesState();    break;
      case 'REQUEST_STATUS':
        // Panel opened after detection already ran — re-deliver current state
        if (detectedVersion) {
          post('ANGULAR_DETECTED', { version: detectedVersion, mode: detectMode(detectedVersion) });
          post('COMPONENT_TREE',   { tree: componentTree });
          post('HTTP_LOG',         { entries: httpLog });
        }
        // Re-deliver source maps if already discovered
        if (cachedSourceFiles !== null) {
          post('SOURCE_MAPS_FOUND', { count: cachedSourceMapCount, scripts: [] });
          if (cachedSourceMapCount) post('SOURCE_FILES', { files: cachedSourceFiles });
        } else {
          // Maps not yet resolved — trigger discovery now
          discoverSourceMaps();
        }
        break;
    }
  });

  // ── Angular Services state scanner ────────────────────────────────────────

  function postNgServicesState() {
    if (!window.ng || typeof window.ng.getInjector !== 'function') {
      post('NG_SERVICES_STATE', { error: 'ng.getInjector not available (production build or Angular < 14)' });
      return;
    }
    try {
      const rootEl = document.querySelector('[ng-version]') || document.body;
      const injector = window.ng.getInjector(rootEl);
      if (!injector) {
        post('NG_SERVICES_STATE', { error: 'Could not obtain root injector' });
        return;
      }

      const services = {};
      const seen = new WeakSet();

      function readInjector(inj) {
        if (!inj || seen.has(inj)) return;
        seen.add(inj);

        // Angular keeps provider records in _records (Map<token, record>) in dev mode
        const records = inj._records;
        if (records instanceof Map) {
          records.forEach((record, token) => {
            // Skip Angular-internal tokens (no name, or ɵ-prefixed, or primitive)
            if (!token || typeof token !== 'function') return;
            const name = token.name || '';
            if (!name || name.startsWith('ɵ') || name === 'InjectionToken') return;
            // Skip known Angular framework classes that aren't user services
            const SKIP = new Set(['ApplicationRef','NgZone','ChangeDetectorRef','ElementRef',
              'Renderer2','TemplateRef','ViewContainerRef','ComponentFactoryResolver',
              'Injector','DOCUMENT','PLATFORM_ID','APP_ID','ErrorHandler']);
            if (SKIP.has(name)) return;

            try {
              // Use cached value if present, otherwise get() from injector
              const instance = record.value !== undefined && record.value !== null
                ? record.value
                : inj.get(token, null, { optional: true });
              if (!instance || typeof instance !== 'object' || Array.isArray(instance)) return;

              // Build state snapshot from public properties
              const state = {};
              for (const key of Object.keys(instance)) {
                if (key.startsWith('_') || key.startsWith('ɵ')) continue;
                try { state[key] = safeStringify(instance[key]); } catch { /* skip */ }
              }
              if (Object.keys(state).length > 0) {
                services[name] = state;
              }
            } catch { /* token not injectable or throws */ }
          });
        }

        // Walk parent injector chain
        try { readInjector(inj.parent); } catch { /* no parent */ }
      }

      readInjector(injector);

      const count = Object.keys(services).length;
      dbg('info', `Service scan complete — ${count} service(s) with public state found`);
      post('NG_SERVICES_STATE', { services, timestamp: Date.now() });
    } catch (e) {
      post('NG_SERVICES_STATE', { error: e.message });
    }
  }

  // ── Change Detection Profiler ──────────────────────────────────────────────

  let profilingMO  = null;
  let profilingActive = false;

  function startProfiling() {
    if (profilingActive) { dbg('warn', 'Profiler already active'); return; }
    profilingActive = true;
    dbg('info', 'CD profiler started — using MutationObserver batch timing');

    let batchStart = null;
    let batchTimer = null;

    profilingMO = new MutationObserver(() => {
      if (!batchStart) batchStart = Date.now();
      clearTimeout(batchTimer);
      batchTimer = setTimeout(() => {
        const duration = Date.now() - batchStart;
        // Only report if there was meaningful work (> 0ms, < 2s to filter noise)
        if (duration >= 0 && duration < 2000) {
          const comps = componentTree.slice(0, 5).map(n => n.name);
          post('CD_CYCLE', { time: batchStart, duration, trigger: 'DOM batch', components: comps });
        }
        batchStart = null;
      }, 16); // one animation frame — batch end marker
    });

    profilingMO.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, characterData: true
    });
    post('PROFILING_STARTED', {});
  }

  function stopProfiling() {
    profilingActive = false;
    if (profilingMO) { profilingMO.disconnect(); profilingMO = null; }
    dbg('info', 'CD profiler stopped');
    post('PROFILING_STOPPED', {});
  }

  // ── MutationObserver for live tree updates ─────────────────────────────────

  function observeDOM() {
    let lastRefresh = 0;
    const mo = new MutationObserver(() => {
      clearTimeout(observeDOM._timer);
      observeDOM._timer = setTimeout(() => {
        const now = Date.now();
        if (now - lastRefresh >= 3000) { // max once every 3 seconds
          lastRefresh = now;
          refreshTree();
        }
      }, 800); // wait for DOM to settle before walking the tree
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function init(version) {
    dbg('info', `init(${version}) — readyState: ${document.readyState} — t=${Date.now()}`);
    interceptHTTP();
    monitorRouter();
    detectAndMonitorStore();
    discoverSourceMaps();
    // Wait 800ms to let Angular finish bootstrapping before first tree scan
    dbg('info', 'Scheduling first refreshTree in 800ms…');
    setTimeout(() => {
      dbg('info', `First refreshTree — readyState: ${document.readyState} — DOM nodes: ${document.querySelectorAll('*').length}`);
      refreshTree();
      observeDOM();
    }, 800);
    // Second attempt at 2.5s in case Angular bootstraps late (lazy routes, etc.)
    setTimeout(() => {
      if (!componentTree.length) {
        dbg('warn', 'Tree still empty at 2.5s — retrying refreshTree…');
        refreshTree();
      }
    }, 2500);
  }

  // ── Start detection ────────────────────────────────────────────────────────

  dbg('info', 'ng-bridge.js injected — readyState: ' + document.readyState + ' — url: ' + location.href);

  if (document.readyState === 'complete') {
    tryDetect();
  } else {
    window.addEventListener('load', () => {
      dbg('info', 'window load event fired — starting detection');
      tryDetect();
    });
    // Also try early for SPA apps that finish bootstrapping before window.load
    setTimeout(tryDetect, 500);
  }

})();
