# DevTools Companion for Angular — Technical & Functional Documentation

> Version 1.0.7 · Firefox 115+ · Angular 12–18+

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Execution Contexts](#3-execution-contexts)
4. [File Structure](#4-file-structure)
5. [Message Flow](#5-message-flow)
6. [Angular Detection](#6-angular-detection)
7. [Component Tree](#7-component-tree)
8. [Tabs Reference](#8-tabs-reference)
9. [Permissions](#9-permissions)
10. [Build System](#10-build-system)
11. [Known Limitations](#11-known-limitations)

---

## 1. Overview

**DevTools Companion for Angular** is a Firefox DevTools extension (Manifest V3) that provides deep introspection capabilities for Angular applications running in the browser. It adds a dedicated panel inside Firefox DevTools with nine specialized tabs covering every aspect of an Angular application at runtime: component tree, HTTP traffic, state management, routing, dependency injection, performance profiling, source maps, diagnostics, and configuration.

### Key capabilities

| Capability | Description |
|---|---|
| Component Tree | Live hierarchical view of all Angular components with inputs, outputs, and properties |
| HTTP Monitor | Intercepts XHR and Fetch requests with headers, bodies, timing, and filtering |
| Store Inspector | Monitors NgRx / NGXS / Akita state changes and action history |
| Router Inspector | Tracks Angular Router navigation events and displays active route |
| DI Inspector | Lists injected services for the selected component |
| Performance Profiler | Records and charts Change Detection (CD) cycles with timing statistics |
| Source Maps | Discovers `sourceMappingURL` references in loaded scripts |
| Debug Log | Internal extension log with bridge message relay and injection diagnostics |
| Settings | Configurable thresholds, themes, and behaviour flags |

### Supported Angular versions

| Angular version | Detection method | Component tree |
|---|---|---|
| 12–13 | LView arrays on DOM nodes (`__ngContext__`) | Full (LView walk) |
| 14–18 (dev build) | `window.ng.getComponent` Ivy debug API | Full (ng API walk) |
| 14–18 (prod build) | `[ng-version]` attribute + `_nghost-*` markers | Structural (host elements only) |
| Legacy (2–8) | `getAllAngularRootElements()` | Structural |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Firefox DevTools Panel  (devtools/panel.html + panel.js)       │
│  Nine tab components (tree, http, store, router, di,            │
│  performance, sources, debug, settings)                         │
└────────────────────┬───────────────────────────────────────────┘
                     │  browser.runtime.connect (named port)
                     │  panel-<tabId>
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Background Service Worker  (background/background.js)          │
│  Message broker — routes panel ↔ content script messages        │
└────────────┬───────────────────────────────────────────────────┘
             │  browser.tabs.sendMessage / browser.runtime.onMessage
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Content Script — Isolated World  (content_scripts/inspector.js)│
│  Injects ng-bridge.js into page context                         │
│  Bridges window.postMessage ↔ browser.runtime.sendMessage       │
└────────────┬───────────────────────────────────────────────────┘
             │  window.postMessage (same-page, cross-world)
             ▼
┌─────────────────────────────────────────────────────────────────┐
│  ng-bridge.js — Page Context  (inject/ng-bridge.js)             │
│  Accesses window.ng.*, Zone.js, Angular internals               │
│  Patches XHR / fetch for HTTP monitoring                        │
│  Walks DOM for component tree extraction                        │
└─────────────────────────────────────────────────────────────────┘
```

The four-layer separation is a mandatory consequence of Firefox's MV3 security model:

- **DevTools panel** runs in an extension page with full `browser.*` API access but cannot touch the inspected page DOM.
- **Background service worker** acts as a stateless message router with no DOM access.
- **Content script** runs in an isolated JavaScript world that shares the DOM with the page but has a separate `window` object.
- **ng-bridge.js** runs in the *page context* (injected via `<script src>`) and can access Angular globals (`window.ng`, `Zone`, store globals) directly.

---

## 3. Execution Contexts

### 3.1 DevTools Panel (`devtools/`)

Loaded by `devtools/devtools.html`, which registers the panel via `browser.devtools.panels.create`. The main orchestrator is `panel.js`:

- Connects to the background via a named port (`panel-<tabId>`).
- On connection, sends `REQUEST_STATUS` to recover state if the panel was opened after the page had already loaded.
- Dispatches incoming messages to the appropriate tab component.
- Manages settings (persisted in `browser.storage.local`).
- Controls tab activation: each tab's `render(container)` is called on activation; the container is cleared and rebuilt, but module-level data arrays are preserved, so switching tabs does not lose accumulated data.

### 3.2 Background Service Worker (`background/background.js`)

A minimal broker with two responsibilities:

1. **Panel ports**: stores a `Map<tabId, port>`. When a panel connects via `browser.runtime.connect({ name: 'panel-<tabId>' })`, its port is registered. On disconnect the port is removed.
2. **Content → panel relay**: listens for `browser.runtime.sendMessage({ from: 'content', … })` and forwards to the matching panel port via `port.postMessage`.

The service worker may sleep after ~30 seconds of inactivity (normal Firefox MV3 behaviour). The panel auto-reconnects via `onDisconnect` with a 1-second retry.

### 3.3 Content Script (`content_scripts/inspector.js`)

Runs at `document_start` in the isolated world for all URLs. Responsibilities:

- **Bridge injection**: injects `inject/ng-bridge.js` as a `<script>` element (using `web_accessible_resources`). Injection happens at `DOMContentLoaded` or immediately if the document is already loaded.
- **Page → background relay**: listens for `window.postMessage` from ng-bridge (identified by `__AngularInspector__: true`) and forwards to `browser.runtime.sendMessage`.
- **Background → page relay**: listens for messages from the background (routed from the panel) with `to: 'page'` and forwards to the page via `window.postMessage({ __AngularInspectorCmd__: true, … })`.

### 3.4 ng-bridge.js (`inject/ng-bridge.js`)

Runs in the page context. This is the most complex file, responsible for:

- **Angular detection** (see §6)
- **Component tree extraction** (see §7)
- **HTTP interception**: patches `window.XMLHttpRequest` and `window.fetch` at injection time to capture request/response bodies, headers, timing, and status codes. Entries are stored in `httpLog[]` and forwarded via `HTTP_REQUEST` messages.
- **Router monitoring**: polls `location.href` every 500 ms; posts `NAVIGATION` on change and schedules a tree refresh.
- **Store detection**: checks for `window.__REDUX_DEVTOOLS_EXTENSION__` (NgRx), `window.ngxs`, `window.akita`.
- **Source map discovery**: scans `document.querySelectorAll('script[src]')` and reports script URLs.
- **DOM mutation observer**: debounced 150 ms — triggers `refreshTree()` on subtree mutations.
- **Component highlight overlay**: injects a floating `<div id="ai-highlight-overlay">` to visually identify the selected component on the page.
- **Inline property editing**: handles `SET_PROPERTY` commands by locating the component instance via its `__aiId` and calling `window.ng.applyChanges`.

Communication with the content script is exclusively through `window.postMessage`.

---

## 4. File Structure

```
angular-inspector/
├── manifest.json                   # MV3 manifest
├── package.json                    # Version + npm scripts
├── build.js                        # Pure Node.js build script (no bundler)
│
├── background/
│   └── background.js               # Service worker — message broker
│
├── content_scripts/
│   └── inspector.js                # Isolated-world bridge relay + injection
│
├── devtools/
│   ├── devtools.html               # Registers the DevTools panel
│   ├── devtools.js                 # Calls browser.devtools.panels.create
│   ├── panel.html                  # Main panel shell (tab bar, panels)
│   ├── panel.js                    # Orchestrator — routing, messaging, settings
│   └── components/
│       ├── tree.js                 # Component Tree tab
│       ├── http.js                 # HTTP Monitor tab
│       ├── store.js                # Store Inspector tab
│       ├── router.js               # Router tab
│       ├── di.js                   # DI Inspector tab
│       ├── performance.js          # Performance Profiler tab
│       ├── sources.js              # Source Maps tab
│       ├── debug.js                # Debug Log tab
│       └── (settings rendered inline in panel.js)
│
├── inject/
│   └── ng-bridge.js                # Page-context Angular introspection engine
│
├── icons/
│   ├── icon-48.png                 # Generated by build.js
│   └── icon-96.png                 # Generated by build.js
│
├── styles/
│   └── panel.css                   # DevTools panel styles (CSS variables, dark/light)
│
└── dist/
    └── angular-inspector-1.0.7.xpi # Built extension package
```

---

## 5. Message Flow

### 5.1 Message types (bridge → panel)

| Type | Payload | Description |
|---|---|---|
| `ANGULAR_DETECTED` | `{ version, mode }` | Angular found; version = `'ivy'` / `'legacy'` / `'production-dom'` / `'production-ctx'`; mode = `'development'` / `'production'` |
| `ANGULAR_NOT_FOUND` | — | All detection retries exhausted |
| `COMPONENT_TREE` | `{ tree, error? }` | Serialised component tree array |
| `HTTP_REQUEST` | `{ entry }` | Single intercepted HTTP request |
| `HTTP_LOG` | `{ entries }` | Bulk replay of all captured HTTP requests |
| `STORE_DETECTED` | `{ type }` | Store type: `'ngrx'` / `'ngxs'` / `'akita'` |
| `STORE_ACTION` | `{ action, state }` | Dispatched action + state snapshot |
| `NAVIGATION` | `{ url, time }` | URL changed |
| `SOURCE_MAPS_FOUND` | `{ count, scripts }` | Script URLs found on page |
| `CD_CYCLE` | `{ duration, component }` | Single Change Detection cycle |
| `SUBSCRIPTION_LEAK` | `{ … }` | Unsubscribed observable detected |
| `LOG` | `{ level, message, data? }` | Debug log entry from ng-bridge |
| `PONG` | `{ time }` | Response to panel `PING` |
| `PROP_UPDATED` | `{ componentId, propPath }` | Property edited successfully |
| `PROP_UPDATE_ERROR` | `{ error }` | Property edit failed |

### 5.2 Message types (panel → bridge)

| Command | Payload | Description |
|---|---|---|
| `REFRESH_TREE` | — | Re-extract and post the component tree |
| `REQUEST_STATUS` | — | Re-post current Angular detection + tree + HTTP log |
| `HIGHLIGHT` | `{ id }` | Show overlay on the component's DOM element |
| `HIDE_HIGHLIGHT` | — | Remove the overlay |
| `SET_PROPERTY` | `{ componentId, propPath, value }` | Edit a property on a live component |
| `GET_HTTP_LOG` | — | Request bulk HTTP log replay |
| `PING` | — | Liveness check |

---

## 6. Angular Detection

Detection runs in `ng-bridge.js` on page load, retrying up to 5 times every 2 seconds (10-second window).

### Detection methods (priority order)

```
1. window.ng && ng.getComponent === 'function'  →  'ivy'    (dev build)
2. getAllAngularRootElements()                  →  'legacy' (Angular 2–8)
3. document.querySelector('[ng-version]')       →  'production-dom'
4. DOM walk for .__ngContext__ !== undefined    →  'production-ctx'
```

### Mode determination

| Detected as | Mode |
|---|---|
| `'ivy'` | `development` (ng debug API only available in dev builds) |
| `'legacy'` | `development` |
| `'production-dom'` | `production` |
| `'production-ctx'` | `production` |

### State recovery

When the DevTools panel is opened **after** the page has already loaded, the bridge has already sent `ANGULAR_DETECTED`. To recover this state, the panel sends `REQUEST_STATUS` 300 ms after connecting, and the bridge re-posts `ANGULAR_DETECTED`, the current `COMPONENT_TREE`, and the accumulated `HTTP_LOG`.

---

## 7. Component Tree

### 7.1 Development mode (`window.ng` available)

`walkDevComponents(el, parentId, list, depth)` — recursive DOM walk starting from `[ng-version]` root or `document.body`:

- Calls `window.ng.getComponent(el)` for every element.
- **Only creates a tree node** when a component instance is returned (non-null). Elements without a component are transparent: their children are promoted to the current parent's level.
- For each component instance, extracts:
  - **Class name**: from `comp.constructor.name` or `compDef.debugInfo.className` (Angular 17+)
  - **Selector**: from `compDef.selectors` array
  - **Change Detection strategy**: `compDef.onPush ? 'OnPush' : 'Default'`
  - **Inputs**: iterates `compDef.inputs` map, reads current value via `safeStringify`
  - **Outputs**: keys of `compDef.outputs`
  - **Public properties**: all own non-Angular-internal keys via `getPublicProps`
  - **File name**: from `compDef.debugInfo.filePath` (Angular 17+) or inferred via `classNameToFileName`

### 7.2 Production mode — three-pass strategy

Angular 14+ does not expose LView arrays on DOM elements. Three fallback passes are tried in order:

**Pass 1 — LView arrays (Angular 9-13)**
Walks the DOM looking for `el.__ngContext__` that is an `Array`. If found, extracts the component instance from LView slots 6-10.

**Pass 2 — `_nghost-*` attributes (Angular 14+, ViewEncapsulation.Emulated)**
Collects all elements with `_nghost-*` attributes using a `TreeWalker`. Builds parent–child relationships by walking each element's DOM ancestors. Component name is inferred from the tag name: `app-dashboard` → `AppDashboardComponent`.

**Pass 3 — Custom element tags (fallback)**
Looks for hyphenated tag names (`<app-*>`, `<mat-*>`, etc.) with `__ngContext__` set. Falls back to tag-based name inference.

### 7.3 Angular Signals

`safeStringify` detects Signal functions by checking for:
- Own property keys starting with `ɵ` or named `__brand__`
- `Symbol` properties whose `toString()` includes `"signal"` or `"SIGNAL"`
- Zero-argument functions with own properties (computed shape)

When detected, the Signal is called with no arguments to retrieve its current value, which is then formatted as `signal(name): <value>` or `{ '[Signal]': <value> }` for object values.

### 7.4 File name inference

When `compDef.debugInfo.filePath` is not available (production builds or Angular < 17), `classNameToFileName` infers the TypeScript source file name from the class name using Angular naming conventions:

```
DashboardComponent  →  dashboard.component.ts
AuthGuard           →  auth.guard.ts
UserService         →  user.service.ts
AppModule           →  app.module.ts
```

---

## 8. Tabs Reference

### Components tab (`tree.js`)

**Features:**
- Collapsible tree view with depth indentation (14px per level)
- Filter by component name or selector
- Click to select: shows detail panel with Class, Selector, CD Strategy, Element tag, File, Inputs, Outputs, Properties
- `OnPush` badge on tree nodes
- Inline property editing: `@Input()` values are rendered as `contenteditable` cells; on blur, `SET_PROPERTY` is sent to the bridge
- "Copy JSON" copies the full node object to clipboard
- "Clear Highlight" removes the overlay from the page

### HTTP Monitor tab (`http.js`)

**Features:**
- Real-time list of all XHR and Fetch requests (newest first after filtering)
- Filter by URL substring, HTTP method, and status class (2xx/3xx/4xx/5xx)
- Slow request highlighting (configurable threshold, default 1000 ms)
- Detail drawer with four sub-tabs: Headers (request + response), Request body, Response body, Timing
- GET requests correctly show `(no body)` in the Request tab
- Failed-request badge count on the tab button
- Clear log button
- Data is preserved when switching to another DevTools tab and back

### Store tab (`store.js`)

**Features:**
- Detects NgRx (`__REDUX_DEVTOOLS_EXTENSION__`), NGXS (`window.ngxs`), Akita (`window.akita`)
- Action history list with filter
- State tree for the snapshot associated with the selected action
- "Current State" button jumps to the latest snapshot
- "Export JSON" copies the current state to clipboard
- Data is preserved across tab switches

### Router tab (`router.js`)

**Features:**
- Current active route: URL, path, component, params, query params, data
- Navigation history list (newest first) with timestamps
- Route configuration tree (when available)
- Clear history button

### DI tab (`di.js`)

**Features:**
- Lists injected services for the currently selected component (selected in the Components tab)
- Root providers panel showing app-level provided services
- Service detail view with properties

### Performance tab (`performance.js`)

**Features:**
- Records Angular Change Detection cycles
- Summary metrics: total cycles, average/min/max duration
- Bar chart of the last 60 cycles (coloured by duration)
- Top components by CD trigger frequency
- Record / Clear / Export CSV buttons

### Sources tab (`sources.js`)

**Features:**
- Discovers scripts loaded on the page
- File tree with search filter
- Source viewer for selected file

### Debug tab (`debug.js`)

**Features:**
- Internal extension log with levels: `info`, `warn`, `error`, `success`, `debug`, `bridge`
- Source filter: `ng-bridge`, `content script`, `panel`, `background`
- Text search filter
- Entry count status bar (errors and warnings highlighted)
- "Copy log" copies all entries as plain text
- "Test injection" button: evaluates page globals and reports:
  - Whether `ng.getComponent` is available (development build)
  - Angular version from `[ng-version]` attribute
  - Whether `__ngContext__` exists on any DOM node
  - Page `readyState` and URL

### Settings tab (rendered by `panel.js`)

| Setting | Default | Description |
|---|---|---|
| Theme | `dark` | `dark` or `light` |
| Capture request/response bodies | `true` | Store HTTP bodies |
| Max HTTP history | `500` | Entries to retain |
| Slow request threshold | `1000 ms` | Highlight threshold |
| CD cycle alert threshold | `60 cycles/s` | Performance warning rate |
| Auto-clear on navigation | `false` | Clear HTTP + CD logs on route change |
| Angular detection timeout | `10 s` | Total retry window |
| Prompt to enable debug mode | `true` | Show banner for production builds |

Settings are persisted in `browser.storage.local` under key `ai_settings`.

---

## 9. Permissions

| Permission | Why |
|---|---|
| `activeTab` | Read the currently inspected tab |
| `devtools` | Register the DevTools panel |
| `storage` | Persist settings in `browser.storage.local` |
| `scripting` | Programmatic script injection API (MV3 requirement) |
| `webRequest` | HTTP monitoring hooks (currently used for header capture) |
| `<all_urls>` (host permission) | Inject the content script and bridge into any page |

The content security policy for extension pages is:

```json
"extension_pages": "script-src 'self' 'unsafe-inline'; object-src 'self'"
```

`'unsafe-inline'` is required because the DevTools panel HTML renders dynamic content via `innerHTML` without a nonce. The bridge itself runs in the page context, not the extension CSP.

---

## 10. Build System

The build is a single self-contained Node.js script (`build.js`) with **no external dependencies** — only Node.js built-ins (`fs`, `path`, `zlib`, `crypto`).

### Commands

```sh
node build.js           # generate icons + package XPI
node build.js icons     # only regenerate PNG icons
node build.js package   # only package XPI (icons must exist)
npm run build           # alias for node build.js
npm run lint            # web-ext lint
npm run sign            # web-ext sign --channel unlisted (requires AMO API keys)
```

### XPI packaging

The script writes a minimal, dependency-free ZIP file. All extension files are stored uncompressed (ZIP method 0). Files excluded from the XPI:

```
build.js · package.json · package-lock.json
.gitignore · .git · dist · .claude · node_modules
icons/generate-icons.html
```

Output: `dist/angular-inspector-<version>.xpi`
A SHA-256 hash is written to `dist/angular-inspector.xpi.sha256` for AMO submission verification.

### Icon generation

Icons are generated programmatically as lossless PNG files:
- Background: `#1A1A2E` (dark navy) with rounded corners (18% corner radius)
- Foreground: `#DD0031` (Angular red) equilateral triangle, pointing up
- Inner cutout creates the Angular logo silhouette
- Sizes: 48×48 and 96×96

### Version management

The version string must be kept in sync between `package.json` and `manifest.json`. Increment both before each build to avoid Firefox locking the previous XPI file on disk.

---

## 11. Known Limitations

| Limitation | Notes |
|---|---|
| Component tree in production mode is structural only | Without `window.ng.getComponent`, component instances are not accessible; only element names and attributes are shown |
| Inline property editing only works in development mode | `window.ng.applyChanges` is not available in production builds |
| Angular 14+ production: requires `ViewEncapsulation.Emulated` for Pass 2 | Apps using `ViewEncapsulation.None` or `ShadowDom` may only be detected via Pass 3 (custom element tags) |
| Angular Signals heuristic may produce false positives | Any zero-argument function with own properties is treated as a Signal |
| HTTP interception only captures requests made after injection | Requests sent before `ng-bridge.js` is injected are not captured |
| Store detection requires public globals | Apps that do not expose Redux DevTools or framework-specific globals will not be detected |
| Service worker sleep (Firefox MV3) | The background sleeps after ~30 seconds of inactivity; auto-reconnect is in place but the first message after wake may be dropped |
| Source map viewer is a file list only | Actual source map parsing and content display is not yet implemented |
