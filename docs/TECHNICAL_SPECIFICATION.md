# DevTools Companion for Angular — Technical Specification

**Version:** 1.1.4
**Last updated:** 2026-06-22
**License:** MIT
**Status:** Production

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Extension Identity & Manifest](#2-extension-identity--manifest)
3. [Execution Context Architecture](#3-execution-context-architecture)
4. [Inter-Context Communication Protocol](#4-inter-context-communication-protocol)
5. [Module Specifications](#5-module-specifications)
   - 5.1 [ng-bridge.js — Page Context Agent](#51-ng-bridgejs--page-context-agent)
   - 5.2 [inspector.js — Content Script](#52-inspectorjs--content-script)
   - 5.3 [background.js — Service Worker Broker](#53-backgroundjs--service-worker-broker)
   - 5.4 [panel.js — DevTools Panel Orchestrator](#54-paneljs--devtools-panel-orchestrator)
   - 5.5 [Tab Components](#55-tab-components)
   - 5.6 [i18n.js — Internationalisation Module](#56-i18njs--internationalisation-module)
   - 5.7 [panel.css — Design System](#57-panelcss--design-system)
6. [Angular Introspection Engine](#6-angular-introspection-engine)
   - 6.1 [Detection Algorithm](#61-detection-algorithm)
   - 6.2 [Component Tree Walk — Development Mode](#62-component-tree-walk--development-mode)
   - 6.3 [Component Tree Walk — Production Mode](#63-component-tree-walk--production-mode)
   - 6.4 [Object Serialisation](#64-object-serialisation)
   - 6.5 [Angular Signals Support](#65-angular-signals-support)
   - 6.6 [Inline Property Editing](#66-inline-property-editing)
   - 6.7 [DOM Observer](#67-dom-observer)
7. [HTTP Interception Engine](#7-http-interception-engine)
   - 7.1 [XHR Patch](#71-xhr-patch)
   - 7.2 [Fetch Patch](#72-fetch-patch)
8. [Source Map Discovery](#8-source-map-discovery)
9. [Store Detection & Monitoring](#9-store-detection--monitoring)
10. [Router Monitoring](#10-router-monitoring)
11. [Performance Profiler](#11-performance-profiler)
12. [Data Models](#12-data-models)
13. [Security Model](#13-security-model)
14. [Build System](#14-build-system)
15. [File Layout](#15-file-layout)
16. [Browser & Angular Compatibility](#16-browser--angular-compatibility)
17. [Performance Constraints & Limits](#17-performance-constraints--limits)
18. [Known Technical Limitations](#18-known-technical-limitations)

---

## 1. System Overview

DevTools Companion for Angular is a browser extension (WebExtension Manifest V3) that provides deep runtime introspection of Angular applications without requiring any changes to the inspected application. It operates across four isolated browser execution contexts simultaneously and covers Angular versions 12 through 18+.

### Design goals

| Goal | Implementation |
|---|---|
| **Zero-setup** | Works on any Angular page with no configuration |
| **Non-intrusive** | Read-only by default; writes only on explicit user action |
| **Privacy-first** | No data leaves the browser; no telemetry |
| **Graceful degradation** | All features degrade with a clear message in production mode or when APIs are absent |
| **Zero npm runtime dependencies** | Extension runtime is 100% vanilla JavaScript |

---

## 2. Extension Identity & Manifest

### Manifest summary

```json
{
  "manifest_version": 3,
  "name": "DevTools Companion for Angular",
  "version": "1.1.4",
  "browser_specific_settings": {
    "gecko": {
      "id": "devtools-companion-angular@devtools-companion.dev",
      "strict_min_version": "115.0"
    }
  }
}
```

### Permissions

| Permission | Purpose |
|---|---|
| `activeTab` | Identify and target the currently inspected browser tab |
| `devtools` | Register the DevTools panel via `browser.devtools.panels.create` |
| `storage` | Persist user settings in `browser.storage.local` |
| `scripting` | Inject `ng-bridge.js` into the page JavaScript context |
| `webRequest` | Fetch source map (`.js.map`) files from the page's origin |
| `<all_urls>` (host_permissions) | Operate on any URL an Angular app might run at |

**Permissions not requested** (minimum-permission principle): `tabs`, `cookies`, `history`, `bookmarks`, `downloads`, `notifications`, `clipboardRead`.

### Web-Accessible Resources

```json
"web_accessible_resources": [{
  "resources": ["inject/ng-bridge.js"],
  "matches": ["<all_urls>"]
}]
```

`ng-bridge.js` must be accessible so the isolated-world content script can construct its `browser.runtime.getURL(...)` URL and inject it via a `<script src="...">` element.

### Content Security Policy

```json
"content_security_policy": {
  "extension_pages": "script-src 'self' 'unsafe-inline'; object-src 'self'"
}
```

`'unsafe-inline'` is required for the DevTools panel HTML which uses inline `<script>` blocks. No `eval()` or `new Function()` is used anywhere in the extension.

---

## 3. Execution Context Architecture

The extension spans four distinct JavaScript execution contexts. Each has a different security boundary, DOM access level, and lifecycle.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER TAB (inspected page)                                           │
│                                                                         │
│  ┌─────────────────────────────┐   ┌────────────────────────────────┐  │
│  │  PAGE CONTEXT               │   │  ISOLATED WORLD                │  │
│  │  inject/ng-bridge.js        │   │  content_scripts/inspector.js  │  │
│  │                             │   │                                │  │
│  │  • Shares JS heap with app  │   │  • Separate JS heap            │  │
│  │  • window.ng.* available    │   │  • Same DOM as page            │  │
│  │  • XMLHttpRequest patched   │   │  • browser.runtime.* available │  │
│  │  • fetch() patched          │   │  • Injects ng-bridge.js        │  │
│  └──────────────┬──────────────┘   └───────────────┬────────────────┘  │
│                 │ window.postMessage                │ browser.runtime   │
│                 │ (__AngularInspector__: true)      │ .sendMessage      │
└─────────────────┼─────────────────────────────────┼───────────────────┘
                  │                                  │
         ┌────────▼──────────────────────────────────▼────────┐
         │  SERVICE WORKER                                     │
         │  background/background.js                           │
         │                                                     │
         │  • Map<tabId, Port>                                 │
         │  • Routes content → panel (port.postMessage)        │
         │  • Routes panel → content (browser.tabs.sendMessage)│
         └─────────────────────────────┬───────────────────────┘
                                       │ named Port: "panel-{tabId}"
                              ┌────────▼──────────────┐
                              │  DEVTOOLS PANEL       │
                              │  devtools/panel.js    │
                              │  + components/*.js    │
                              │                       │
                              │  • Tab routing        │
                              │  • Message dispatch   │
                              │  • UI rendering       │
                              └───────────────────────┘
```

### Context comparison table

| Property | Page Context | Isolated World | Service Worker | DevTools Panel |
|---|---|---|---|---|
| Script | `ng-bridge.js` | `inspector.js` | `background.js` | `panel.js` + components |
| `window` access | Shared with page | Isolated | None | DevTools frame |
| DOM access | Full | Full (DOM only) | None | None |
| `window.ng.*` | **Yes** | No | No | No |
| `browser.runtime.*` | No | **Yes** | **Yes** | **Yes** |
| Lifecycle | Per page load | Per page load | Persistent (MV3 idle) | While DevTools open |
| Run-at | `document_start` (injected) | `document_start` | Always | On DevTools open |

---

## 4. Inter-Context Communication Protocol

All message passing uses native browser WebExtension APIs. No shared memory, `localStorage`, `IndexedDB`, or `BroadcastChannel` is used for cross-context communication.

### 4.1 Full Message Flow

```
Angular page runtime (window.ng, fetch, XHR)
  │
  │  window.postMessage({ __AngularInspector__: true, type, payload })
  ▼
content_scripts/inspector.js  [isolated world]
  │
  │  browser.runtime.sendMessage({ from: 'content', type, payload })
  ▼
background/background.js  [service worker]
  │
  │  port.postMessage({ type, payload, tabId })
  ▼
devtools/panel.js  [DevTools panel]


Panel → Page (reverse path):
  panel.js
  │  port.postMessage({ to: 'page', cmd, payload })
  ▼
background.js
  │  browser.tabs.sendMessage(tabId, { to: 'page', cmd, payload })
  ▼
inspector.js
  │  window.postMessage({ __AngularInspectorCmd__: true, cmd, payload })
  ▼
ng-bridge.js  [page context]
  │  window.addEventListener('message', ...)
```

### 4.2 Port Naming Convention

When the DevTools panel opens it connects to the service worker with a named port:

```
panel-{tabId}
```

Example: `panel-42`. The background maintains `Map<number, Port>` (`panelPorts`). Multiple tabs are independently supported.

### 4.3 Message Envelopes

**Page → Background** (via content script relay):

```js
{
  __AngularInspector__: true,   // namespace discriminator
  from: 'content',              // added by content script
  type: string,                 // event name (see §4.4)
  payload: object
}
```

**Background → Panel** (via named Port):

```js
{
  type: string,
  payload: object,
  tabId: number                 // sender.tab.id, attached by background
}
```

**Panel → Background** (via Port):

```js
{
  to: 'page',                   // routing discriminator
  cmd: string,                  // command name (see §4.5)
  payload: object
}
```

**Page command envelope** (received by `ng-bridge.js`):

```js
{
  __AngularInspectorCmd__: true,
  cmd: string,
  payload: object
}
```

### 4.4 Event Catalogue — Page → Panel

| Event type | Trigger condition | Key payload fields |
|---|---|---|
| `ANGULAR_DETECTED` | Angular globals or DOM markers found | `version`, `mode: 'development'|'production'` |
| `ANGULAR_NOT_FOUND` | All 5 detection retries exhausted | — |
| `COMPONENT_TREE` | `refreshTree()` completes | `tree: ComponentNode[]` |
| `HTTP_REQUEST` | Single XHR or fetch completes | `entry: HttpEntry` |
| `HTTP_LOG` | Full log requested | `entries: HttpEntry[]` |
| `STORE_DETECTED` | Store library found | `type: 'ngrx'|'akita'|'ngxs'` |
| `STORE_NOT_FOUND` | No store globals after 3 s retry | — |
| `STORE_ACTION` | Redux DevTools action intercepted | `action: object`, `state: object` |
| `NG_SERVICES_STATE` | `SCAN_SERVICES` command completed | `services: Record<string, object>`, `timestamp` |
| `NAVIGATION` | URL polling detects a change | `url: string`, `time: number` |
| `SOURCE_MAPS_FOUND` | Source map discovery resolves | `count: number`, `scripts: string[]` |
| `SOURCE_FILES` | Source map content parsed | `files: Record<string, string>` (path → source) |
| `CD_CYCLE` | A CD cycle is recorded | `time`, `duration`, `trigger`, `components` |
| `SUBSCRIPTION_LEAK` | Leaked RxJS subscription detected | `component: string`, `count: number` |
| `PROFILING_STARTED` | `START_PROFILING` acknowledged | — |
| `PROFILING_STOPPED` | `STOP_PROFILING` acknowledged | — |
| `PROP_UPDATED` | `SET_PROPERTY` applied | `componentId`, `propPath`, `value` |
| `PROP_UPDATE_ERROR` | `SET_PROPERTY` threw | `error: string` |
| `PONG` | `PING` answered | `time: number` |
| `LOG` | Internal debug log from bridge | `level`, `message`, `data?` |

### 4.5 Command Catalogue — Panel → Page

| Command | Effect on `ng-bridge.js` |
|---|---|
| `REQUEST_STATUS` | Re-emit `ANGULAR_DETECTED`, `COMPONENT_TREE`, `HTTP_LOG`, `SOURCE_MAPS_FOUND`, `SOURCE_FILES` if already resolved |
| `REFRESH_TREE` | Force a full `buildTree()` → `refreshTree()` cycle |
| `HIGHLIGHT` | Render red overlay on the component's host element |
| `HIDE_HIGHLIGHT` | Remove overlay from DOM |
| `SET_PROPERTY` | Navigate `propPath`, assign new value, call `ng.applyChanges()` |
| `GET_HTTP_LOG` | Post `HTTP_LOG` with current in-memory `httpLog` array |
| `PING` | Post `PONG` with `Date.now()` |
| `START_PROFILING` | Begin recording CD cycles via `MutationObserver` |
| `STOP_PROFILING` | Stop CD recording and detach observer |
| `SCAN_SERVICES` | Walk root injector and post `NG_SERVICES_STATE` |

---

## 5. Module Specifications

### 5.1 `ng-bridge.js` — Page Context Agent

**Execution context:** Page JavaScript context (shared heap with Angular application)
**Run-at:** Injected by content script at `document_start`
**Scope:** IIFE — no globals leaked

#### Module-level state

| Variable | Type | Purpose |
|---|---|---|
| `detectionAttempts` | `number` | Retry counter for Angular detection (max 5) |
| `detectedVersion` | `string|null` | Detection method that succeeded |
| `componentTree` | `ComponentNode[]` | Last built tree; re-delivered on `REQUEST_STATUS` |
| `httpLog` | `HttpEntry[]` | In-memory HTTP request log |
| `cachedSourceFiles` | `Record<string,string>|null` | Resolved source map files; `null` = not yet run |
| `cachedSourceMapCount` | `number` | Number of source files in the cache |
| `profilingMO` | `MutationObserver|null` | Observer for CD cycle detection |
| `profilingActive` | `boolean` | Whether profiling is currently running |
| `overlay` | `HTMLElement|null` | Red highlight div injected into the page DOM |

All outgoing messages use:

```js
function post(type, payload) {
  window.postMessage({ __AngularInspector__: true, type, payload }, '*');
}
```

---

### 5.2 `inspector.js` — Content Script

**Execution context:** Isolated world
**Run-at:** `document_start`; `all_frames: false` (top frame only)

**Three responsibilities:**

1. **Bridge injection** — creates `<script src="browser.runtime.getURL('inject/ng-bridge.js')">`, appends to `<head>` (or `<html>`). Script self-removes from DOM after loading.

2. **Page → Background relay** — `window.addEventListener('message')` validates `e.source === window` and `e.data.__AngularInspector__ === true`, then calls `browser.runtime.sendMessage({ from: 'content', ...e.data })`.

3. **Background → Page relay** — `browser.runtime.onMessage` validates `message.to === 'page'`, then calls `window.postMessage({ __AngularInspectorCmd__: true, cmd, payload }, '*')`.

**Injection timing:** Checks `document.readyState` — if `'loading'`, waits for `DOMContentLoaded`; otherwise injects immediately.

---

### 5.3 `background.js` — Service Worker Broker

**Execution context:** Extension service worker (MV3)
**State:** `const panelPorts = new Map();` — `tabId → Port`

```
browser.runtime.onConnect
  → port.name starts with 'panel-'?
      → tabId = parseInt(port.name.replace('panel-', ''), 10)
      → panelPorts.set(tabId, port)
      → port.onMessage  → if msg.to === 'page': browser.tabs.sendMessage(tabId, msg)
      → port.onDisconnect → panelPorts.delete(tabId)

browser.runtime.onMessage (from content script)
  → msg.from === 'content'?
      → tabId = sender.tab?.id
      → panelPorts.get(tabId)?.postMessage({ ...msg, tabId })
```

Both routing paths use `.catch(() => {})` / `try/catch` because the tab may be navigating.

---

### 5.4 `panel.js` — DevTools Panel Orchestrator

#### Settings subsystem

```js
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
```

Loaded from `browser.storage.local` under key `'ai_settings'` on every panel init. Written back only on explicit **Save Settings**.

#### Background Port management

```
connectToBackground()
  → portTabId = browser.devtools.inspectedWindow.tabId
  → port = browser.runtime.connect({ name: 'panel-' + portTabId })
  → port.onMessage → handleMessage(msg)
  → port.onDisconnect → setTimeout(connectToBackground, 1000)  // auto-reconnect
  → setTimeout(() => sendToPage('REQUEST_STATUS', {}), 300)    // request bridge state
```

The 300 ms delay before `REQUEST_STATUS` allows the content script to finish injecting `ng-bridge.js`.

#### Tab routing

```js
const tabComponents = {
  tree: TreeTab, http: HttpTab, store: StoreTab, router: RouterTab,
  di: DiTab, performance: PerformanceTab, sources: SourcesTab,
  debug: DebugTab, settings: null,
};
```

`activateTab(name)`:
1. Updates `activeTab`.
2. Removes `active` class and **clears `innerHTML`** on all `.tab-panel` elements (releases memory from previous render).
3. Adds `active` to `#tab-{name}`.
4. Calls `tabComponents[name].render(panel)`.

#### Message dispatcher `handleMessage(msg)`

| `msg.type` | Routed to |
|---|---|
| `ANGULAR_DETECTED` | Updates badge, shows/hides production banner, sends `REFRESH_TREE` |
| `ANGULAR_NOT_FOUND` | Sets badge to "No Angular", shows error banner |
| `COMPONENT_TREE` | `TreeTab.setData(tree)` |
| `HTTP_REQUEST` | `HttpTab.addEntry(entry)` |
| `HTTP_LOG` | `HttpTab.setEntries(entries)` |
| `STORE_DETECTED` | `StoreTab.setStoreType(type)` |
| `STORE_ACTION` | `StoreTab.addAction(action, state)` |
| `STORE_NOT_FOUND` | `StoreTab.setStoreNotFound()` |
| `NG_SERVICES_STATE` | `StoreTab.setServicesSnapshot(services, ts)` |
| `NAVIGATION` | `RouterTab.addNavEvent(...)` |
| `SOURCE_MAPS_FOUND` | `SourcesTab.setNoSourceMaps()` if count=0 |
| `SOURCE_FILES` | `SourcesTab.setSourceFiles(files)` |
| `CD_CYCLE` | `PerformanceTab.addCycle(payload)` |
| `SUBSCRIPTION_LEAK` | `PerformanceTab.addLeak(payload)` |
| `LOG` | `DebugTab.addEntry(entry)` |

The `summarise(payload)` helper compresses large payloads before logging: tree → node count, entries → count, HTTP entry → method/url/status.

---

### 5.5 Tab Components

Each tab component is a plain JavaScript object exported on `window`. Components manage their own internal state and render their own DOM. The panel calls `render(containerEl)` on every tab activation, passing an empty `<div>`.

**Lifecycle contract:**
- `render(el)` — called on every tab activation; populates `el`. May reuse cached data.
- State-update methods (`setData`, `addEntry`, etc.) — may arrive at any time, whether or not the tab is active. Must store data for the next `render` call.

| Module | Export | Key methods |
|---|---|---|
| `tree.js` | `window.TreeTab` | `render`, `setData`, `copyState` |
| `http.js` | `window.HttpTab` | `render`, `addEntry`, `setEntries` |
| `store.js` | `window.StoreTab` | `render`, `setStoreType`, `addAction`, `setStoreNotFound`, `setServicesSnapshot`, `setServicesError` |
| `router.js` | `window.RouterTab` | `render`, `setCurrentRoute`, `addNavEvent`, `setRouteConfig`, `clearHistory` |
| `di.js` | `window.DiTab` | `render`, `setServices`, `setRootProviders` |
| `performance.js` | `window.PerformanceTab` | `render`, `addCycle`, `addLeak`, `clearData`, `exportData`, `onProfilingStarted`, `onProfilingStopped` |
| `sources.js` | `window.SourcesTab` | `render`, `setSourceFiles`, `setNoSourceMaps`, `jumpToLine` |
| `debug.js` | `window.DebugTab` | `render`, `addEntry` |

**`SourcesTab` render-on-activate pattern:** `setSourceFiles(files)` stores the map and calls `renderFileTree('')`; if `fileTree` is `null` (tab not yet activated), the call is a no-op. When `render(el)` is finally called, it checks `Object.keys(sourceFiles).length` and calls `renderFileTree('')` if data is already available. This resolves the race condition where source map data arrives before the user opens the Sources tab.

---

### 5.6 `i18n.js` — Internationalisation Module

Loaded before all tab component scripts. Exposes:

```js
window.t(key)           // returns translated string for the current language
window.setLang(code)    // switches language, triggers re-render
window.loadLang(cb)     // loads saved language from storage.local
```

**Supported languages:** `en`, `es`, `fr`, `de`, `pt`, `it`

All translations are bundled inline in a single `TRANSLATIONS` object (no network requests). Active language is persisted to `browser.storage.local` under key `'ai_lang'`.

---

### 5.7 `panel.css` — Design System

Implemented with CSS custom properties (design tokens).

**Dark theme (default):**

```css
--ai-primary:    #DD0031;   /* Angular red */
--ai-dark:       #1A1A2E;   /* Header / sidebar background */
--ai-accent:     #E94560;   /* Badges, alerts */
--ai-bg:         #0F0F1A;   /* Panel background */
--ai-surface:    #16213E;   /* Card / list item surfaces */
--ai-border:     #2A2A4A;   /* Borders, dividers */
--ai-text:       #E8E8F0;   /* Primary text */
--ai-text-muted: #8888AA;   /* Secondary / placeholder text */
--ai-code-bg:    #0D1117;   /* Code blocks */
--ai-success:    #28A745;
--ai-warning:    #FFC107;
--ai-error:      #DC3545;
--ai-info:       #17A2B8;
```

**Light theme** (activated by `body.theme-light`):

```css
--ai-bg:         #FFFFFF;
--ai-surface:    #F5F5F5;
--ai-border:     #DDDDDD;
--ai-text:       #1A1A2E;
--ai-text-muted: #666688;
```

The two-pane layout (Components, HTTP, Store, DI) uses a flex row with a `<div class="pane-divider">` that receives a `mousedown` listener for drag-to-resize.

---

## 6. Angular Introspection Engine

### 6.1 Detection Algorithm

Runs in the page context. Up to `MAX_ATTEMPTS = 5` retries with a 2-second interval (10 seconds total).

```
tryDetect()
  ├─ Method 1: window.ng && typeof window.ng.getComponent === 'function'
  │    → returns 'ivy'              (Ivy debug API, development mode)
  │
  ├─ Method 2: typeof window.getAllAngularRootElements === 'function'
  │    → returns 'legacy'           (Angular 2–8 global, dev mode)
  │
  ├─ Method 3: document.querySelector('[ng-version]')
  │    → returns 'production-dom'   (present in all builds, even minified)
  │
  ├─ Method 4: any DOM element with el.__ngContext__ !== undefined
  │    → returns 'production-ctx'   (Angular renderer always sets this)
  │
  └─ None found → retry in 2 s → after 5 failures → post('ANGULAR_NOT_FOUND')
```

**Mode derivation:**
- `'production-dom'` and `'production-ctx'` → `mode: 'production'`
- `'ivy'` and `'legacy'` → `mode: 'development'` (debug APIs present)

### 6.2 Component Tree Walk — Development Mode

Requires `window.ng.getComponent` (Ivy development build).

#### Entry point

```js
buildTreeDev()
  → roots = window.getAllAngularRootElements()
          || [document.querySelector('[ng-version]') || document.body]
  → for each rootEl: walkDevComponents(rootEl, null, tree, depth=0)
```

#### `walkDevComponents(el, parentId, list, depth)`

```
if depth > 60 or el is null: return  [cycle/infinite-DOM guard]

comp = window.ng.getComponent(el)

if comp is null:
  → walk el.children at SAME depth/parentId  [transparent non-component elements]
  return

id = el.__aiId || (el.__aiId = uid())   [stable base-36 ID, persists across re-scans]
compDef = comp.constructor['ɵcmp'] || comp.constructor['ɵdir']

if compDef:
  selector   = compDef.selectors.flat().filter(Boolean).join(', ')
  cdStrategy = compDef.onPush ? 'OnPush' : 'Default'
  inputs     = extractInputs(comp, compDef.inputs)
  outputs    = extractOutputs(comp, compDef.outputs)   [rich metadata]
  filePath   = compDef.debugInfo?.filePath             [Angular 17+ only]

props = getPublicProps(comp)  [own keys not starting with __ or ɵ]

node = { id, parentId, name, selector, inputs, outputs, props,
         cdStrategy, fileName, filePath, children: [], tagName }

→ recurse: el.children → walkDevComponents(child, id, node.children, depth+1)
```

#### `@Output()` metadata extraction

For each output in `compDef.outputs`:
- `propDef` format: `string` (Angular <15) or `[privateName, flags]` (Angular 15+)
- Reads the live `EventEmitter` instance from the component
- Extracts: `type` (constructor name), `subscribers` (via `emitter.observed` for RxJS 7+, `emitter.observers.length` for RxJS 6), `isAsync` flag, `aliased` flag (private name ≠ public name)

### 6.3 Component Tree Walk — Production Mode

When `ng.getComponent` is unavailable, `buildTreeProduction()` runs three sequential passes, stopping at the first that yields results.

#### Pre-scan diagnostics

A full `document.querySelectorAll('*')` scan logs counts and samples of `__ngContext__` types, `_nghost-*` attributes, custom element tags, etc. to the Debug tab.

#### Pass 1 — LView array scan (Angular 9–13)

In Angular 9–13, `el.__ngContext__` is an LView array directly on DOM elements:

```
walkDOMByLView(el, parentId, list, depth)
  ctx = el.__ngContext__
  if Array.isArray(ctx):
    instance = getInstanceFromLView(ctx)
    if instance has ɵcmp or ɵdir:
      node = extractProductionNode(el, instance, ctx, parentId)
      recurse into el.children with node.id
  else:
    recurse at same parentId
```

`getInstanceFromLView` probes slots `[8, 7, 9, 6, 10]` first (canonical `LVIEW_CONTEXT=8`), then scans all slots up to index 30.

#### Pass 2 — `_nghost-*` attribute scan (Angular 14+)

In Angular 14+, `__ngContext__` is a numeric node index. The extension uses `_nghost-xxx` attributes as component host markers:

```
TreeWalker over document.body (SHOW_ELEMENT)
  → collect elements with any attribute starting with '_nghost'
  → sort by DOM order (TreeWalker guarantees document order)
  → build parent-child relationships via DOM ancestor check
  → extractProductionNode with best-effort metadata
```

Metadata is limited at this level: class name is inferred from the element tag (`app-hero-list` → `HeroListComponent`), property values unavailable.

#### Pass 3 — Custom element tag scan

For `ViewEncapsulation.None` / `ShadowDom` apps (no `_nghost-*` attributes):

```
document.querySelectorAll('*')
  → tag contains '-' AND el.__ngContext__ !== undefined
  → build flat list in DOM order
  → infer parent-child from DOM containment
```

### 6.4 Object Serialisation

`safeStringify(value, depth = 0)` converts runtime values to JSON-safe structures for `postMessage` transfer.

| Value type | Output |
|---|---|
| `null` / `undefined` | Passed as-is |
| Primitive | Passed as-is |
| Angular signal (heuristic) | `{ '[Signal]': resolvedValue }` or `'signal(name): value'` |
| Function (non-signal) | `'[Function: name(N args)]'` |
| `HTMLElement` | `'[tagname]'` |
| `Date` | ISO 8601 string |
| `RegExp` | String representation |
| `Array` | First 20 items recursively; `…+N` sentinel for overflow |
| `object` | First 30 own keys not starting with `__` or `ɵ`; overflow sentinel |
| Depth > 4 | `'[…]'` |
| Access throws | `'[Error]'` |
| Uncatchable | `'[Unserializable]'` |

### 6.5 Angular Signals Support

Signal detection uses three heuristics applied to function values:

```js
function isAngularSignal(fn) {
  if (typeof fn !== 'function') return false;
  // 1. ɵ-prefixed or __brand__ own properties
  if (Object.keys(fn).some(k => k.startsWith('ɵ') || k === '__brand__')) return true;
  // 2. Symbol properties containing 'signal' or 'SIGNAL'
  if (Object.getOwnPropertySymbols(fn).some(s => /signal/i.test(s.toString()))) return true;
  // 3. Zero-arg function with own enumerable properties (signal/computed shape)
  if (fn.length === 0 && Object.keys(fn).length > 0) return true;
  return false;
}
```

Detected signals are called (`value()`) to retrieve the current snapshot, then serialised as `{ '[Signal]': resolvedValue }`.

### 6.6 Inline Property Editing

Triggered by panel command `SET_PROPERTY { componentId, propPath, value }`:

```js
function setProperty(componentId, propPath, value) {
  // Locate the host element by the stable __aiId assignment
  const el = [...document.querySelectorAll('*')].find(e => e.__aiId === componentId);
  const comp = window.ng.getComponent(el);

  // Navigate nested path: 'a.b.c' sets comp.a.b.c = value
  const parts = propPath.split('.');
  let target = comp;
  for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
  target[parts[parts.length - 1]] = value;

  window.ng.applyChanges(comp);  // trigger CD on this subtree only
  post('PROP_UPDATED', { componentId, propPath, value });
}
```

Errors are caught and posted as `PROP_UPDATE_ERROR`.

### 6.7 DOM Observer

```js
const mo = new MutationObserver(() => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refreshTree, 150);  // 150 ms debounce
});
mo.observe(document.body, { childList: true, subtree: true });
```

The 150 ms debounce prevents flooding during rapid Angular renders (e.g. `*ngFor` over a large list triggers hundreds of mutations in quick succession).

---

## 7. HTTP Interception Engine

Both patches are applied in `interceptHTTP()`, called from `init()` **before Angular bootstraps**, ensuring even `HttpClient` calls during app initialisation are captured.

### 7.1 XHR Patch

Wraps the **constructor** (not the prototype) so each new `XHR` instance has its own closure over its `entry` object:

```js
const OrigXHR = window.XMLHttpRequest;
function PatchedXHR() {
  const xhr = new OrigXHR();
  const entry = { id, method, url, startTime, endTime, duration,
                  status, requestHeaders, responseHeaders,
                  requestBody: null, responseBody: null };

  xhr.open  = (method, url, ...args) => {
    entry.method = method; entry.url = url;
    return origOpen(method, url, ...args);
  };
  xhr.setRequestHeader = (name, val) => {
    entry.requestHeaders[name] = val;
    return origSetRH(name, val);
  };
  xhr.send = (body) => {
    entry.startTime   = Date.now();
    entry.requestBody = safeStringify(body);
    xhr.addEventListener('loadend', () => {
      entry.endTime      = Date.now();
      entry.duration     = entry.endTime - entry.startTime;
      entry.status       = xhr.status;
      entry.responseBody = xhr.responseText.slice(0, 50_000);
      httpLog.push(entry);
      post('HTTP_REQUEST', { entry });
    });
    return origSend(body);
  };
  return xhr;
}
PatchedXHR.prototype = OrigXHR.prototype;
window.XMLHttpRequest = PatchedXHR;
```

### 7.2 Fetch Patch

```js
const origFetch = window.fetch;
window.fetch = async function (input, init = {}) {
  const entry = {
    id, method, url,
    requestBody:    safeStringify(init.body ?? null),
    requestHeaders: Object.fromEntries(new Headers(init.headers || {})),
    startTime:      Date.now(),
  };

  const response = await origFetch(input, init);    // let original fetch proceed
  entry.status   = response.status;
  entry.endTime  = Date.now();
  response.headers.forEach((v, k) => { entry.responseHeaders[k] = v; });

  const clone = response.clone();                   // must clone before consuming body
  clone.text().then(text => {
    entry.responseBody = text.slice(0, 50_000);
    httpLog.push(entry);
    post('HTTP_REQUEST', { entry });
  });

  return response;                                  // caller receives the original
};
```

The `response.clone()` is essential: reading the body of the original `Response` object would consume the stream and break the caller's `.json()` / `.text()` calls.

**Error handling:** if `origFetch` throws (network failure, CORS abort), the `catch` block captures the error message, records timing, and still posts `HTTP_REQUEST` with `entry.error` set.

`HTTP_REQUEST` is posted *after* the response body is read, not immediately on response receipt — introducing a small lag relative to the actual network completion. This is an acceptable trade-off to provide body content.

---

## 8. Source Map Discovery

`discoverSourceMaps()` runs once during `init()` and caches results for re-delivery.

### Discovery pipeline

```
Step 1: performance.getEntriesByType('resource')
  → filter: name.endsWith('.js.map') || '.ts.map' || '.map'
  → dev servers automatically fetch these alongside compiled bundles

Step 2: document.querySelectorAll('script[src]')
  → for each <script src="bundle.js">: probe "bundle.js.map" (sibling convention)
  → add if not already in step-1 list

Step 3: deduplicate via Set

Step 4: fetch each candidate with { cache: 'force-cache' }
  → r.ok ? r.json() : null          (silent skip on 404)
  → map.sources[] × map.sourcesContent[]
  → for each (src, content): allFiles[src] = content

Step 5: when all fetches resolve:
  → cachedSourceMapCount = Object.keys(allFiles).length
  → cachedSourceFiles    = allFiles
  → post('SOURCE_MAPS_FOUND', { count, scripts })
  → count > 0: post('SOURCE_FILES', { files: allFiles })
```

### Re-delivery on `REQUEST_STATUS`

```js
case 'REQUEST_STATUS':
  if (cachedSourceFiles !== null) {
    // Data already resolved — re-deliver to the newly opened panel
    post('SOURCE_MAPS_FOUND', { count: cachedSourceMapCount, scripts: [] });
    if (cachedSourceMapCount) post('SOURCE_FILES', { files: cachedSourceFiles });
  } else {
    discoverSourceMaps();   // not yet run — trigger discovery now
  }
```

This handles the common case where DevTools is opened after the page loaded: source maps were already fetched but the panel was not open to receive the initial `SOURCE_FILES` event.

### `SourcesTab` render-on-activate guard

```js
// In SourcesTab.render(el):
fileTree = document.getElementById('source-file-tree');
if (Object.keys(sourceFiles).length) {
  renderFileTree('');   // data arrived before tab was opened — render now
}
```

### TypeScript syntax highlighting (single-pass)

The viewer uses a single-pass regex to avoid feedback loops between sequential replacements:

```js
function highlight(code) {
  return escHtml(code).replace(
    /(//[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|[`](?:[^`\\]|\\.)*[`])|(@\w+)|\b(\d+)\b|\b(class|interface|import|export|...)\b/g,
    (_, comment, str, decorator, num, kw) => {
      if (comment)   return `<span style="color:#6A9955">${comment}</span>`;
      if (str)       return `<span style="color:#CE9178">${str}</span>`;
      if (decorator) return `<span style="color:#DCDCAA">${decorator}</span>`;
      if (num)       return `<span style="color:#B5CEA8">${num}</span>`;
      if (kw)        return `<span style="color:#C586C0">${kw}</span>`;
      return _;
    }
  );
}
```

Sequential regex replacement is avoided because later patterns would match the `"color:#...")` strings already inserted inside `<span style="...">` attributes by earlier patterns.

---

## 9. Store Detection & Monitoring

```js
function detectAndMonitorStore() {
  let type = null;

  if (window.__REDUX_DEVTOOLS_EXTENSION__) { type = 'ngrx'; monitorNgRx(); }
  else if (window.ngxs)                    { type = 'ngxs'; }
  else if (window.akita)                   { type = 'akita'; }

  if (type) {
    post('STORE_DETECTED', { type });
  } else {
    // Retry once — stores may bootstrap after Angular
    setTimeout(() => {
      if (!window.__REDUX_DEVTOOLS_EXTENSION__ && !window.ngxs && !window.akita)
        post('STORE_NOT_FOUND', {});
    }, 3000);
  }
}
```

**NgRx detection** relies on `window.__REDUX_DEVTOOLS_EXTENSION__`, which NgRx registers when it wires up to Redux DevTools. `monitorNgRx()` hooks into `devtools.__stores` for action interception.

**Akita / NGXS** detection relies on the libraries exposing globals — a best-effort approach that fails for apps that do not expose them.

---

## 10. Router Monitoring

```js
function monitorRouter() {
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      post('NAVIGATION', { url: lastUrl, time: Date.now() });
      setTimeout(refreshTree, 300);   // allow Angular to complete route activation
    }
  }, 500);
}
```

URL polling is used instead of `Router.events` subscription because:
1. The Angular `Router` object is not accessible without `ng.getInjector()` (unavailable in production builds).
2. URL polling works in both development and production mode.
3. 500 ms polling is imperceptible to users and has negligible CPU overhead.

The 300 ms delay before `refreshTree()` after navigation allows Angular to mount components for the new route.

---

## 11. Performance Profiler

The profiler uses a `MutationObserver` with `performance.now()` to approximate change detection cycle boundaries:

```js
function startProfiling() {
  profilingActive = true;
  post('PROFILING_STARTED', {});
  let cycleStart = null;
  let cycleEndTimer = null;

  profilingMO = new MutationObserver(() => {
    const now = performance.now();
    if (!cycleStart) cycleStart = now;
    clearTimeout(cycleEndTimer);
    cycleEndTimer = setTimeout(() => {
      const duration = performance.now() - cycleStart;
      post('CD_CYCLE', {
        time:      Date.now(),
        duration:  Math.round(duration * 100) / 100,
        trigger:   'dom-mutation',
        components: []
      });
      cycleStart = null;
    }, 10);   // 10 ms quiet window = end of current CD cycle
  });

  profilingMO.observe(document.body, {
    childList: true, subtree: true,
    attributes: true, characterData: true
  });
}
```

A "quiet window" of 10 ms after the last observed mutation is used as the cycle boundary. This means one logical Angular CD cycle (which may trigger many DOM mutations) is reported as a single `CD_CYCLE` event.

**Limitation:** This approach measures DOM mutation activity as a proxy for CD cycles. In zoneless Angular 18+ apps where mutations may not be synchronous with all CD passes, cycle boundaries may be inaccurate.

---

## 12. Data Models

### 12.1 `ComponentNode`

```typescript
interface ComponentNode {
  id:          string;           // Random base-36 ID; stable across re-scans (el.__aiId)
  parentId:    string | null;
  name:        string;           // Constructor class name
  selector:    string;           // CSS selector from ɵcmp.selectors
  inputs:      Record<string, unknown>;   // @Input() current values (safeStringified)
  outputs:     OutputInfo[];              // @Output() rich metadata
  props:       Record<string, unknown>;   // Other public properties (safeStringified)
  cdStrategy:  'Default' | 'OnPush';
  fileName:    string | null;    // e.g. 'hero-list.component.ts'
  filePath:    string | null;    // e.g. 'src/app/hero/hero-list.component.ts'
  children:    ComponentNode[];
  tagName:     string;           // lowercase host element tag
}

interface OutputInfo {
  name:        string;    // Public name from compDef.outputs
  type:        string;    // 'EventEmitter' | 'Subject' | 'BehaviorSubject' | …
  subscribers: number;    // Active subscriber count
  isAsync:     boolean;   // Angular EventEmitter.__isAsync flag
  aliased:     boolean;   // privateName !== publicName
}
```

### 12.2 `HttpEntry`

```typescript
interface HttpEntry {
  id:              string;
  method:          string;       // 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | …
  url:             string;
  startTime:       number;       // Date.now() ms at request start
  endTime:         number;
  duration:        number;       // endTime - startTime
  status:          number;       // HTTP status code; 0 on network error
  requestHeaders:  Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody:     unknown;      // safeStringify result
  responseBody:    string | null;// First 50 000 chars; null if body capture disabled
  error?:          string;       // Network error message
}
```

### 12.3 `CdCycle`

```typescript
interface CdCycle {
  time:        number;   // Date.now() ms when cycle started
  duration:    number;   // ms via performance.now() for sub-millisecond precision
  trigger:     string;   // 'dom-mutation' | 'user-event' | 'timer' | 'unknown'
  components:  string[]; // Component names checked (empty in current implementation)
}
```

### 12.4 `NavigationEvent`

```typescript
interface NavigationEvent {
  url:    string;
  time:   number;
  type:   'start' | 'end' | 'error' | 'cancel';
  error?: string;
}
```

### 12.5 `ExtensionSettings`

```typescript
interface ExtensionSettings {
  theme:                    'dark' | 'light' | 'system'; // default: 'dark'
  httpCaptureBody:          boolean;  // default: true
  maxHttpHistory:           number;   // default: 500
  slowRequestThreshold:     number;   // ms, default: 1000
  cdCycleAlertThreshold:    number;   // cycles/s, default: 60
  autoClearOnNavigation:    boolean;  // default: false
  angularDetectionTimeout:  number;   // seconds, default: 10
  enableDebugModePrompt:    boolean;  // default: true
}
// Persisted to browser.storage.local under key 'ai_settings'
```

### 12.6 `DebugEntry`

```typescript
interface DebugEntry {
  source:  'panel' | 'bridge' | 'content' | 'background' | 'user';
  level:   'info' | 'warn' | 'error' | 'success' | 'debug' | 'bridge';
  message: string;
  data?:   unknown;
  time:    number;   // Date.now()
}
```

---

## 13. Security Model

### 13.1 Namespace isolation

| Direction | Discriminator property |
|---|---|
| Page → content script | `e.data.__AngularInspector__ === true` |
| Content script → page | `e.data.__AngularInspectorCmd__ === true` |

Content script listener additionally validates `e.source === window` before relaying.

### 13.2 Script injection method

`ng-bridge.js` is injected via `<script src="browser.runtime.getURL('inject/ng-bridge.js')">`. This is the only safe injection method because:
- It runs in the **page context** (required for `window.ng.*` access)
- It does not require `eval()` or inline `<script>` (which would violate strict-CSP pages)
- The script URL is extension-origin, satisfying `script-src 'self'` on the extension's own pages

### 13.3 Data boundaries

| Data category | Storage | Persistence |
|---|---|---|
| HTTP request/response bodies | `httpLog` array + `HttpTab` state | Session only |
| Component state snapshots | `componentTree` + `TreeTab` | Session only |
| Store action log | `StoreTab` internal array | Session only |
| Source file contents | `cachedSourceFiles` + `SourcesTab` | Session only |
| Extension settings | `browser.storage.local` key `'ai_settings'` | Persisted on device |
| Language preference | `browser.storage.local` key `'ai_lang'` | Persisted on device |

**Nothing is ever transmitted to an external server.**

### 13.4 Response body cap

HTTP response bodies are capped at **50 000 characters** (`responseText.slice(0, 50_000)`) to prevent memory exhaustion from large responses.

### 13.5 Serialisation guard

`safeStringify` enforces:
- Maximum object depth: **4 levels**
- Maximum array items: **20**
- Maximum object keys: **30**

These limits prevent infinite recursion and stack overflow when serialising Angular's internal object graph (which contains many circular references).

### 13.6 Minimum-permission principle

Permissions not requested: `tabs`, `cookies`, `history`, `bookmarks`, `downloads`, `notifications`, `clipboardRead`. Only the minimum set needed for the stated functionality is declared.

---

## 14. Build System

### 14.1 `build.js`

A **zero-dependency** Node.js 18+ script. No npm packages used at runtime.

#### Icon generation (pure JS, no native libs)

1. **Rasterisation** — allocates a `Uint8Array` of RGBA pixels:
   - Rounded-rectangle **clip mask** (corner radius = 18% of icon size)
   - Outer equilateral **triangle** in Angular red `#DD0031` (circumradius = 36%)
   - Inner triangle **cutout** in dark blue `#1A1A2E` (54% of outer) — the hole in the Angular logo

2. **PNG encoding** — builds a valid PNG binary from scratch:
   - 8-byte PNG signature
   - IHDR chunk (width, height, bit depth=8, colour type=2 RGB)
   - IDAT chunk: filter type 0 (None) per scanline, compressed with Node.js `zlib.deflateSync`
   - IEND chunk
   - CRC-32 checksums via a 256-entry pure-JS lookup table

#### XPI/ZIP packaging

Collects all extension files recursively, **excluding**:
`build.js`, `package.json`, `package-lock.json`, `dist/`, `.git/`, `.claude/`, `node_modules/`, `icons/generate-icons.html`

Writes a valid ZIP archive using a pure-JS writer:
- **Compression: Stored (method 0)** — no compression. Browsers load extensions from an in-memory cache, so compression yields no real-world benefit.
- File names **UTF-8 encoded**, flag `0x0800`
- Local file headers + central directory + end-of-central-directory record

Outputs:
- `dist/angular-inspector.xpi` + `dist/angular-inspector.xpi.sha256`
- `dist/angular-inspector-chrome.zip` + SHA-256

#### npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `node build.js` | Generate icons + package XPI |
| `npm run icons` | `node build.js icons` | Regenerate icons only |
| `npm run package` | `node build.js package` | Package XPI without regenerating icons |
| `npm run lint` | `web-ext lint` | Mozilla extension linter |
| `npm run sign` | `web-ext sign` | AMO API submission |

### 14.2 Development dependency

`web-ext` (Mozilla's official extension toolchain) is the **only dev dependency**. Extension runtime code has zero npm dependencies.

---

## 15. File Layout

```
angular-inspector/
├── manifest.json                   WebExtension MV3 manifest (Firefox + Chrome)
├── build.js                        Zero-dependency build script (icons + XPI/ZIP)
├── package.json                    npm scripts + web-ext dev dependency
├── PRIVACY.md                      Privacy policy (required by AMO / Chrome Store)
├── USAGE.md                        Installation guide + user manual (Spanish)
│
├── background/
│   └── background.js               Service worker — stateless message broker
│
├── content_scripts/
│   └── inspector.js                Isolated-world bridge + ng-bridge injector
│
├── inject/
│   └── ng-bridge.js                Page-context agent:
│                                   • Angular detection & tree walk
│                                   • HTTP interception (XHR + fetch)
│                                   • Source map discovery
│                                   • Store detection
│                                   • Router URL polling
│                                   • Performance profiler
│                                   • Inline property editing
│                                   • DOM overlay
│
├── devtools/
│   ├── devtools.html               Registers the DevTools panel (minimal HTML)
│   ├── devtools.js                 browser.devtools.panels.create() call
│   ├── panel.html                  Main panel shell: tab bar, containers
│   ├── panel.js                    Orchestrator: tab routing, port, message dispatch
│   ├── i18n.js                     t(), setLang(), loadLang()
│   └── components/
│       ├── tree.js                 Component Tree tab
│       ├── http.js                 HTTP Monitor tab
│       ├── store.js                Store Inspector + Service Scanner tab
│       ├── router.js               Router Inspector tab
│       ├── di.js                   DI Inspector tab
│       ├── performance.js          Performance Profiler tab
│       ├── sources.js              Source Map Viewer tab
│       └── debug.js                Debug log tab
│
├── styles/
│   └── panel.css                   Design system (CSS custom properties + components)
│
├── compat/
│   └── browser-shim.js             Firefox/Chrome compatibility shim (browser vs chrome)
│
├── icons/
│   ├── icon-48.png                 Generated by build.js
│   ├── icon-96.png                 Generated by build.js
│   └── generate-icons.html         Browser-based icon generator (not packaged)
│
└── dist/
    ├── angular-inspector.xpi
    ├── angular-inspector.xpi.sha256
    ├── devtools-companion-angular.xpi     (AMO release name)
    ├── devtools-companion-angular.xpi.sha256
    ├── angular-inspector-chrome.zip
    └── angular-inspector-chrome.zip.sha256
```

---

## 16. Browser & Angular Compatibility

### 16.1 Browser support

| Browser | Version | Status |
|---|---|---|
| Firefox Stable | 115+ | Primary target — fully supported |
| Firefox ESR | 115+ | Fully supported |
| Firefox Developer Edition | Any | Fully supported |
| Firefox Nightly | Any | Fully supported |
| Google Chrome | 120+ | Supported via Chrome build |
| Microsoft Edge | 120+ | Compatible (Chromium-based, same Chrome build) |
| Safari | Any | Not supported (WebExtension MV3 deviations) |

### 16.2 WebExtension APIs used

| API | Min Firefox |
|---|---|
| `browser.devtools.panels.create` | 54 |
| `browser.devtools.inspectedWindow.tabId` | 54 |
| `browser.devtools.inspectedWindow.eval` | 54 |
| `browser.runtime.connect` / `Port` | 45 |
| `browser.runtime.sendMessage` | 45 |
| `browser.runtime.getURL` | 45 |
| `browser.storage.local` | 45 |
| `browser.tabs.sendMessage` | 45 |
| `MutationObserver` | Baseline Web API |
| `performance.getEntriesByType('resource')` | Baseline Web API |
| `fetch` + `Response.clone()` | 65 |

All APIs available in Firefox 115+, satisfying `strict_min_version: "115.0"`.

### 16.3 Angular version matrix

| Angular version | Ivy | Dev `ng.*` | Tree walk | HTTP | Router | Source Maps | Notes |
|---|---|---|---|---|---|---|---|
| 2–8 (View Engine) | No | `getAllAngularRootElements` | Limited | Yes | URL only | Yes | No `__ngContext__` on DOM |
| 9–13 (Ivy) | Yes | Dev only | Pass 1 (LView) | Yes | Yes | Yes | LView arrays on DOM |
| 14–17 (Ivy) | Yes | Dev only | Pass 2 (_nghost) | Yes | Yes | Yes | `__ngContext__` is numeric |
| 18+ (Zone.js) | Yes | Dev only | Pass 1 or 2 | Yes | Yes | Yes | Fully supported |
| 18+ (Zoneless) | Yes | Dev only | Pass 1 or 2 | Yes | Yes | Yes | CD profiler limited |

---

## 17. Performance Constraints & Limits

| Constraint | Limit | Enforcement point |
|---|---|---|
| Component tree depth | 60 levels | `depth` parameter guard in `walkDevComponents` / `walkDOMByLView` |
| Object serialisation depth | 4 levels | `safeStringify(value, depth)` |
| Array serialisation max items | 20 | `value.slice(0, 20)` in `safeStringify` |
| Object key serialisation max | 30 per object | Counter in `safeStringify` key loop |
| HTTP response body capture | 50 000 chars | `responseText.slice(0, 50_000)` / `text.slice(0, 50_000)` |
| HTTP log max entries | 500 (configurable) | `maxHttpHistory` setting; oldest entry dropped on overflow |
| CD cycle history in panel | 1 000 entries | Module-level array with `shift()` on overflow |
| CD timeline chart visible bars | 60 | `cycles.slice(-60)` before render |
| DOM mutation debounce | 150 ms | `clearTimeout` / `setTimeout` in `MutationObserver` callback |
| Angular detection retries | 5 × 2 s = 10 s max | `MAX_ATTEMPTS` constant |
| Source map fetch cache | `force-cache` | Avoids re-downloading already-cached `.map` files |
| Port auto-reconnect delay | 1 s | `setTimeout(connectToBackground, 1000)` in `onDisconnect` |
| `REQUEST_STATUS` send delay | 300 ms | Allows content script to inject bridge before panel polls |
| Post-navigation tree rescan delay | 300 ms | Allows Angular to complete route activation |

---

## 18. Known Technical Limitations

### 18.1 Production mode — `ng.*` unavailability

Angular 9+ tree-shakes all `ng.*` debug globals in production builds. Without them:
- **Component tree:** falls back to DOM heuristics (Passes 1–3); no `@Input()` values, no property state, no CD strategy.
- **DI inspector:** completely unavailable.
- **Inline property editing:** unavailable (`ng.applyChanges` missing).

`enableDebugTools()` can partially restore `ng.*` at runtime if it was included in the production bundle (typically via a conditional call in `main.ts`).

### 18.2 Zoneless Angular (18+)

The CD profiler uses DOM mutations as a proxy. In zoneless apps, Angular does not automatically trigger synchronous DOM updates on every reactive change, so the profiler may miss cycles or report inaccurate durations. Direct `ApplicationRef.tick` patching was evaluated but rejected as too fragile across minor Angular versions.

### 18.3 Cross-origin iframes

`content_scripts: { all_frames: false }` means the content script is injected into the top frame only. Angular components in cross-origin `<iframe>` elements are invisible to the extension due to browser security restrictions.

### 18.4 Minified bundles without source maps

Component class names appear as single-character mangled identifiers (`t`, `n`, `e`). Selector inference from DOM tags is still possible; property values are inaccessible. The Sources tab is unavailable.

### 18.5 WebSocket and SSE traffic

The HTTP Monitor intercepts only `XMLHttpRequest` and `fetch`. WebSocket connections (`new WebSocket(...)`) and Server-Sent Events (`new EventSource(...)`) are not captured.

### 18.6 Pre-injection HTTP requests

XHR and fetch patches are installed at `document_start` (before Angular bootstraps). HTTP requests fired from Web Workers, Service Workers, or very early `<script>` tags loaded before the content script executes are not captured.

### 18.7 Store detection reliability

| Store | Detection signal | Failure mode |
|---|---|---|
| NgRx | `window.__REDUX_DEVTOOLS_EXTENSION__` | App disabled Redux DevTools bridge |
| Akita | `window.akita` | Library version doesn't expose this global |
| NGXS | `window.ngxs` | Library version doesn't expose this global |

### 18.8 Angular Signals — heuristic false positives/negatives

Signal detection is heuristic. False positives are possible on non-signal zero-arg functions with own enumerable properties. False negatives are possible on custom signal implementations that don't use Angular's internal `ɵ` naming or `Symbol(SIGNAL)`.

### 18.9 Service worker lifecycle (MV3)

The `panelPorts` map is in-memory state that is lost if the service worker is idle-terminated by the browser (an inherent MV3 behaviour). The panel's `port.onDisconnect` handler detects this and reconnects with a 1 s delay, but messages posted during the reconnect window are dropped.
