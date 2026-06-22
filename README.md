# DevTools Companion for Angular

Deep introspection for Angular applications directly inside Firefox (and Chrome) DevTools — no build changes, no instrumentation, no external servers required.

**Features at a glance:** Component Tree · HTTP Monitor · Store Inspector · Router Inspector · DI Inspector · Performance Profiler · Source Map Viewer

---

## Table of Contents

1. [Requirements](#requirements)
2. [Building from source](#building-from-source)
3. [Installing in Firefox](#installing-in-firefox)
4. [Installing in Chrome](#installing-in-chrome)
5. [Opening the panel](#opening-the-panel)
6. [Component Tree](#component-tree)
7. [HTTP Monitor](#http-monitor)
8. [Store Inspector](#store-inspector)
9. [Router Inspector](#router-inspector)
10. [DI Inspector](#di-inspector)
11. [Performance Profiler](#performance-profiler)
12. [Source Map Viewer](#source-map-viewer)
13. [Settings](#settings)
14. [Debug Console](#debug-console)
15. [Supported Angular versions](#supported-angular-versions)
16. [Privacy](#privacy)
17. [License](#license)

---

## Requirements

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS or newer |
| Firefox | 140 or newer |
| Chrome / Edge | 112 or newer |

---

## Building from source

The build script has **no external runtime dependencies** — it uses only Node.js built-ins to generate the extension icons and package the XPI/ZIP.

### 1. Clone the repository

```bash
git clone https://github.com/angular-inspector/angular-inspector.git
cd angular-inspector
```

### 2. Install dev dependencies

The `devDependencies` are only needed for linting (`web-ext lint`). The build itself (`node build.js`) requires nothing beyond Node.js.

```bash
npm install
```

### 3. Build

**Using npm scripts (recommended)**

```bash
# Firefox XPI (default)
npm run build

# Chrome ZIP
node build.js chrome
```

**Using the platform helper scripts**

| Platform | Firefox | Chrome |
|----------|---------|--------|
| Windows (cmd) | `build_firefox.cmd` | `build_chrome.cmd` |
| Windows (PowerShell) | `build_firefox.ps1` | `build_chrome.ps1` |
| Linux / macOS | `./build_firefox.sh` | `./build_chrome.sh` |

**Manual invocation**

```bash
node build.js                  # Firefox XPI + icons (default)
node build.js firefox          # same, explicit
node build.js chrome           # Chrome ZIP + icons
node build.js icons            # only regenerate PNG icons
node build.js package          # only package (icons must already exist)
node build.js chrome package   # Chrome package only (icons must exist)
```

### 4. Output files

After a successful build the `dist/` directory contains:

```
dist/
  devtools-companion-angular-1.1.4.xpi       ← Firefox extension
  devtools-companion-angular.xpi.sha256      ← SHA-256 checksum
  devtools-companion-angular-chrome-1.1.4.zip ← Chrome extension
  devtools-companion-angular-chrome.zip.sha256
```

### 5. Lint (optional)

```bash
npm run lint
```

This runs `web-ext lint` against the source directory and reports any manifest or code warnings.

---

## Installing in Firefox

### Option A — Install from a local XPI (recommended for development)

1. Open Firefox and navigate to `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**.
4. Navigate to the `dist/` folder and select `devtools-companion-angular-1.1.4.xpi`.
5. The extension loads immediately — no restart required.

> **Note:** Temporary add-ons are removed when Firefox restarts. Repeat this step after each browser session, or install it permanently (see Option B).

### Option B — Install permanently from AMO

Install the extension directly from the Firefox Add-ons site:

[addons.mozilla.org — DevTools Companion for Angular](https://addons.mozilla.org/firefox/addon/devtools-companion-for-angular/)

Click **Add to Firefox** and confirm the permissions prompt.

### Option C — Install a signed XPI permanently

If you have a self-signed XPI (via `npm run sign`), open it from the filesystem:

1. In Firefox, go to **File → Open File** (or press `Ctrl+O`).
2. Select the `.xpi` file.
3. Firefox will prompt you to add the extension — click **Add**.

---

## Installing in Chrome

1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the **root of the source directory** (not the `dist/` folder).

Alternatively, drag-and-drop the `devtools-companion-angular-chrome-1.1.4.zip` file onto the `chrome://extensions` page.

---

## Opening the panel

1. Navigate to any page running an Angular application.
2. Open DevTools: press `F12` (Windows/Linux) or `Cmd+Option+I` (macOS), or right-click anywhere and select **Inspect**.
3. Look for the **Angular** tab in the DevTools tab bar. Click it to open the extension panel.

> If the Angular tab is not visible, click the `»` overflow button at the right end of the DevTools tab bar to find it.

The panel automatically detects whether Angular is present on the page. If no Angular application is found, a banner will inform you. Navigate to an Angular page and the panel updates in real time.

---

## Component Tree

The **Component Tree** tab is the primary view of the extension. It displays the full hierarchy of Angular components rendered on the current page, mirroring the structure of the DOM as Angular sees it.

### What is shown

Each node in the tree represents one Angular component and displays:

- **Component class name** (e.g., `AppComponent`, `HeaderComponent`)
- **Host element selector** (e.g., `<app-root>`, `<mat-toolbar>`) shown in a dimmer colour next to the name
- **Change detection strategy** badge (`OnPush`) when the component uses `ChangeDetectionStrategy.OnPush`
- Expand/collapse arrows for components that have child components

### Selecting a component

Click any node in the tree to select it. The selected component is highlighted with a blue left border, and a detail pane opens on the right side of the panel showing:

| Section | Description |
|---------|-------------|
| **Component** | Class name, selector, change-detection strategy, host element tag, and source file name / path |
| **@Input() Bindings** | All `@Input()` properties with their current values. Values are editable in-place (see below) |
| **@Output() Events** | All `@Output()` EventEmitters with subscriber count and whether they are async |
| **Properties** | All other public properties of the component instance that are not inputs |
| **Injected Services** | Services injected into the component (links to the DI tab) |

### Live editing inputs

In the **@Input() Bindings** section, every value field is a `contenteditable` cell. Click a value, type a new JSON-serialisable value, and press `Enter` or click elsewhere. The extension sends the new value to the component instance immediately; Angular's change detection picks it up and the page updates without a full reload.

A **toggle** (▶) button next to each editable value lets you flip boolean properties between `true` and `false` with a single click.

### Highlighting in the page

When you select a component in the tree, the extension sends a highlight signal to the page that briefly outlines the component's host element with a coloured overlay, making it easy to locate in the viewport.

### Tree refresh

The tree refreshes automatically whenever Angular runs change detection. You can also force a refresh at any time using the **Refresh** button (↺) in the toolbar.

---

## HTTP Monitor

The **HTTP Monitor** tab intercepts all HTTP requests made by Angular's `HttpClient`. It does not intercept `fetch()` or `XMLHttpRequest` calls made outside of `HttpClient`.

### Request list

Each row in the list shows:

| Column | Description |
|--------|-------------|
| Method | HTTP method badge (`GET`, `POST`, `PUT`, `DELETE`, …) |
| Status | HTTP status code with colour coding: green (2xx), blue (3xx), orange (4xx), red (5xx) |
| URL | Full request URL, truncated with ellipsis; hover to see the full URL in a tooltip |
| Duration | Time from request initiation to response completion in milliseconds |
| Time | Clock time when the request was initiated |

Slow requests (exceeding the configurable threshold, default 1000 ms) are highlighted with an amber background.

### Filtering

Use the toolbar above the list to filter requests:

- **Method dropdown** — filter by HTTP method (`ALL`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`)
- **Status dropdown** — filter by status class (`ALL`, `2xx`, `3xx`, `4xx`, `5xx`)
- **URL search box** — free-text filter applied to the full URL (case-insensitive)

### Request detail

Click any row to open its detail drawer. The drawer has four tabs:

- **Headers** — Request headers and response headers, displayed in a two-column table. All header names and values are shown; none are redacted.
- **Request** — Request body payload. JSON bodies are pretty-printed with indentation. Non-JSON bodies are shown as plain text.
- **Response** — Response body payload, pretty-printed if JSON.
- **Timing** — Start time, end time, total duration, and status code in a table.

### Clearing the log

Click the **✕** button in the toolbar to clear all captured requests. The badge count on the HTTP tab resets to zero.

---

## Store Inspector

The **Store Inspector** tab connects to state management libraries used by the application and shows a live view of the store state alongside an action log.

### Supported libraries

| Library | Detection method |
|---------|-----------------|
| NgRx | `Store` service dispatch hook |
| NGXS | `Store` action stream |
| Akita | `akitaDevtools` / entity stores |
| Elf | `Store` write hooks |
| MiniRx | `Store` action stream |
| Angular services fallback | Manual scan via the **Scan Services** button |

If no formal store library is detected, the tab switches to **Services Mode** and lists all injectable services registered at the root injector, letting you inspect their internal state directly.

### Left pane — Action log

Every dispatched action is appended to the action list with:

- Action **type** string (e.g., `[Auth API] Login Success`)
- **Timestamp** (relative, e.g., `2s ago`)
- **Payload preview** (first 80 characters of the JSON payload)

Click an action in the list to see its full payload and the resulting state snapshot in the right pane.

### Right pane — State tree

The state tree displays the current store state as an expandable JSON tree. Nodes can be expanded and collapsed by clicking their keys. Arrays show their element count.

**Toolbar buttons:**

| Button | Action |
|--------|--------|
| **Current** | Jump to the most recent state snapshot |
| **Diff** | Compare the two most recent snapshots side-by-side (added keys in green, removed in red, changed in amber) |
| **Export** | Copy the current state JSON to the clipboard |
| **Scan Services** | (services mode only) Re-scan the root injector for Angular services |

**State search:** Use the **Search keys** input on the right to filter the state tree to only keys matching the search term (recursive, case-insensitive).

### Clearing the log

Click **✕** in the action list toolbar to clear all captured actions.

---

## Router Inspector

The **Router Inspector** tab shows the current state of Angular's `Router` and a history of all navigation events since the panel was opened.

### Current route

A table displays the active route at a glance:

| Field | Description |
|-------|-------------|
| URL | Full URL including query string |
| Path | Matched path segment |
| Component | Name of the component rendered at this route |
| Params | Route parameters (e.g., `{ id: "42" }`) |
| Query Params | Query string parameters |
| Fragment | URL fragment (`#…`) if present |
| Data | Static data object defined in the route configuration |

### Navigation history

Each navigation event (successful or failed) is appended to the history list. Each entry shows:

- Navigation **ID** (sequential integer assigned by Angular)
- **Direction** indicator (forward or back browser navigation)
- **From URL → To URL**
- **Timestamp**
- **Status** badge: `Navigated` (success) or `Cancelled` / `Error` (failure) with the reason

Click **Clear** to reset the history list.

### Route configuration tree

Below the history, the extension renders the full route configuration tree defined in the application's `RouterModule.forRoot(routes)` call. Each route node shows its path, any lazy-loaded module, and its child routes indented recursively.

---

## DI Inspector

The **DI Inspector** tab shows the dependency injection graph for the currently selected component and the global root providers.

### Component services (left pane)

When you select a component in the Component Tree tab, the DI Inspector updates automatically to list all services that component has injected. Each entry shows:

| Column | Description |
|--------|-------------|
| Service name | Class name of the injected service |
| Scope | Where the service is provided: `Root` (providedIn: 'root'), `Module`, or `Component` |
| Override | Whether the service is overridden at a lower injector level |

Click a service in the list to see its full public API (properties and methods) in the right pane.

### Root providers (bottom of left pane)

A scrollable list of all services registered at the root injector (`Environment Injector`). This gives a global overview of every singleton service available in the application.

### Service detail (right pane)

When a service is selected, the right pane shows:

- **Instance properties** with their current values (deep JSON representation)
- **Prototype methods** (method names, not invocable from the panel)

---

## Performance Profiler

The **Performance Profiler** tab tracks Angular change-detection cycles in real time, helping identify components that trigger unnecessary or excessive checks.

### Summary metrics

Four metric cards at the top update live:

| Metric | Description |
|--------|-------------|
| CD Cycles | Total number of change-detection cycles recorded |
| Avg time | Average duration per cycle in milliseconds |
| Min / Max | Fastest and slowest cycle durations |

### Timeline chart

A bar chart displays the last 60 change-detection cycles. Each bar represents one cycle; its height is proportional to its duration. Bars that exceed the slow threshold (default 16 ms, one frame at 60 fps) are shown in amber or red.

Hover over a bar to see the exact duration and a timestamp in a tooltip.

### Top components

A ranked table lists the 10 components most frequently involved in change-detection cycles, with their hit count and average duration. Components at the top of this list are the primary candidates for applying `ChangeDetectionStrategy.OnPush` or `trackBy` optimisations.

### Potential memory leaks

The profiler also tracks subscription lifetimes. If it detects an `Observable` subscription that was created but never unsubscribed when its host component was destroyed, the component appears in the **Potential Leaks** list.

### Recording controls

| Button | Action |
|--------|--------|
| **Record** | Start recording. A red ● REC indicator appears while recording is active |
| **Stop** | Stop recording (same button, toggled) |
| **Clear** | Discard all recorded cycles and reset all metrics |
| **Export** | Download a JSON file containing all recorded cycles for offline analysis |

---

## Source Map Viewer

The **Source Map Viewer** tab discovers JavaScript source maps loaded by the page and lets you browse the original TypeScript (or other) source files with syntax highlighting, without needing a running source-map server or IDE.

### How source map discovery works

When the inspected page finishes loading, the extension scans:

1. All `<script src="…">` tags in the document
2. All resources reported by `performance.getEntriesByType('resource')` with `.js` extension

For each JavaScript file found, the extension checks for a `sourceMappingURL` comment at the end of the file. If one is present, it fetches the source map, decodes it, and extracts the original source file paths and contents.

### File tree (left pane)

The left pane shows a collapsible directory tree of all original source files recovered from the source maps. Files are grouped by their directory path.

Use the **filter** input at the top to narrow the tree by file name or path (case-insensitive, live filter).

Click any file to open it in the viewer.

### Source viewer (right pane)

The right pane displays the selected file's source with:

- **Syntax highlighting** for TypeScript / JavaScript (keywords, strings, numbers, decorators, comments each in a distinct colour matching VS Code's dark theme palette)
- **Line numbers** in the gutter
- **Horizontal and vertical scrolling** for wide or long files
- A **file path header** showing the full original path from the source map

> Source map viewer is read-only. It displays the source as recovered from the map; it does not reflect live edits.

### No source maps detected

If no source maps are found (common in production builds where `sourceRoot` is stripped or `sourceMappingURL` is omitted), the left pane shows a notice. Production Angular builds built with `--source-map=false` will not have any maps available.

---

## Settings

Click the **gear icon** (⚙) in the top-right corner of the panel to open Settings.

| Setting | Default | Description |
|---------|---------|-------------|
| Language | Auto (browser locale) | Panel UI language. Supported: English, Spanish, French, German, Japanese |
| Theme | Dark | Panel colour scheme: Dark or Light |
| Slow request threshold | 1000 ms | HTTP requests exceeding this duration are highlighted in amber in the HTTP Monitor |
| Auto-refresh tree | On | Automatically re-render the Component Tree on each change-detection cycle |
| Show OnPush badge | On | Display the `OnPush` badge on components using `ChangeDetectionStrategy.OnPush` |

Settings are persisted with `browser.storage.local` and survive browser restarts.

---

## Debug Console

The **Debug** tab (last icon in the tab bar) provides a log of all internal messages exchanged between the extension's execution contexts:

- `[bridge]` — messages from `ng-bridge.js` running in the page context
- `[content]` — messages relayed by the content script in the isolated world
- `[panel]` — messages processed by the DevTools panel
- `[background]` — routing events from the service worker

Each entry shows its severity (info / success / warn / error), source context, timestamp, and full message text.

This tab is primarily useful when troubleshooting why the extension is not detecting Angular on a particular page, or when reporting issues.

Use the **Copy** button to copy the full log to the clipboard. Use **Clear** to reset it.

---

## Supported Angular versions

| Angular version | Support level |
|----------------|--------------|
| 2 – 8 | Detection + Component Tree (limited) |
| 9 – 11 | Full (Ivy renderer, all tabs) |
| 12 – 19+ | Full |

The extension detects Angular via the `__ngContext__` property on DOM nodes (Ivy, Angular 9+) and falls back to the legacy `ng` global for older versions. Production builds (with `enableProdMode()` active) are supported; some runtime introspection data may be less detailed than in development mode.

---

## Privacy

This extension collects **no data whatsoever**.

All inspection is performed entirely within your local browser. Data read from the inspected page (component tree, HTTP requests, router state, store state) is displayed only inside the DevTools panel and is never sent to any server, third party, or external service.

No analytics, telemetry, crash reports, or usage statistics are collected. No personal information is processed. No network requests are made by the extension itself.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

---

## License

MIT — see [LICENSE](LICENSE) for details.
