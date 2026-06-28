# DevTools Companion for Angular — Installation guide and user manual

## Table of contents

1. [Requirements](#1-requirements)
2. [Installation](#2-installation)
   - [Firefox — Option A: Permanent XPI (personal use)](#option-a--permanent-xpi-personal-use)
   - [Firefox — Option B: Temporary installation (developers)](#option-b--temporary-installation-developers)
   - [Firefox — Option C: Firefox Developer Edition / Nightly](#option-c--firefox-developer-edition--nightly)
   - [Firefox — Option D: AMO (public distribution)](#option-d--amo-public-distribution)
   - [Chrome — Option E: Chrome Web Store](#option-e--chrome-web-store)
   - [Chrome — Option F: Unpacked extension (developers)](#option-f--unpacked-extension-developers)
3. [Getting started](#3-getting-started)
4. [User manual](#4-user-manual)
   - [🌲 Components — Component tree](#-components--component-tree)
   - [📡 HTTP — Request monitor](#-http--request-monitor)
   - [🗄️ Store — State management](#️-store--state-management)
   - [🛣️ Router — Route inspector](#️-router--route-inspector)
   - [💉 DI — Dependency injection](#-di--dependency-injection)
   - [⚡ Performance — Profiler](#-performance--profiler)
   - [🗺️ Sources — Source maps](#️-sources--source-maps)
   - [⚙️ Settings](#️-settings)
5. [Known limitations](#5-known-limitations)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Requirements

| Requirement | Firefox | Chrome |
|---|---|---|
| Minimum browser version | 140+ | 112+ |
| Angular (inspected app) | 9 — 18+ | 9 — 18+ |
| Node.js (build only) | 18+ | 18+ |

DevTools Companion for Angular is compatible with **Firefox** and **Chrome**. The Firefox build produces an `.xpi` file; the Chrome build produces a `.zip` ready to upload to the Chrome Web Store or load as an unpacked extension.

---

## 2. Installation

### Firefox

#### Option A — Permanent XPI (personal use)

This option installs the extension permanently without going through AMO. It requires disabling signature verification, which is only possible on Firefox ESR, Developer Edition, or Nightly — **or** using a pre-signed `.xpi` file.

**Step 1 — Build the XPI**

```bash
# From the project folder
npm run build:firefox
# Output: dist/devtools-companion-angular-<version>.xpi
```

**Step 2 — Allow installation from local files**

1. Open Firefox and type in the address bar:
   ```
   about:config
   ```
2. Accept the warning and search for:
   ```
   xpinstall.signatures.required
   ```
3. Toggle the value to **`false`**.

   > This preference only takes effect on **Firefox Developer Edition**, **Firefox Nightly**, and **Firefox ESR**. It has no effect on Firefox Stable.

**Step 3 — Install the XPI**

1. Open the Firefox menu (☰) → **Add-ons and Themes** (or `about:addons`).
2. Click the gear icon ⚙ → **Install Add-on From File…**
3. Select `dist/devtools-companion-angular-<version>.xpi`.
4. Confirm the installation in the dialog.

The extension is installed permanently and survives browser restarts.

---

#### Option B — Temporary installation (developers)

No signature or preference changes required. The extension is removed when Firefox closes, but this is the fastest way to test changes during development.

1. Open Firefox and navigate to:
   ```
   about:debugging#/runtime/this-firefox
   ```
2. Click **Load Temporary Add-on…**
3. Navigate to the project folder and select the **`manifest.firefox.json`** file.
4. The extension appears in the list with a session lifetime indicator.

> Whenever you modify source code, click **Reload** next to the extension name to apply changes without reinstalling.

---

#### Option C — Firefox Developer Edition / Nightly

Firefox Developer Edition and Nightly have signature verification disabled by default, so the XPI can be installed directly:

1. Download [Firefox Developer Edition](https://www.mozilla.org/firefox/developer/) or [Firefox Nightly](https://www.mozilla.org/firefox/channel/desktop/#nightly).
2. Follow **Steps 2 and 3 of Option A** (no need to change `xpinstall.signatures.required`).

---

#### Option D — AMO (public distribution)

To let any user install DevTools Companion for Angular from `addons.mozilla.org`:

**Prerequisites**

- Developer account at [addons.mozilla.org](https://addons.mozilla.org/developers/)
- `npm install` run in the project folder (installs `web-ext`)
- AMO API credentials (obtained at `addons.mozilla.org/developers/addon/api/key/`)

**Sign and submit**

```bash
# 1. Validate the extension
npm run lint

# 2a. Automatic signing (unlisted channel — does not appear in AMO search)
#     The signed .xpi is downloaded automatically into dist/
AMO_API_KEY=user:xxxxx AMO_API_SECRET=xxxxxx npm run sign

# 2b. Alternatively, upload manually:
#     addons.mozilla.org → Developer Hub → Submit a New Add-on
#     → Upload your add-on → select dist/devtools-companion-angular-<version>.xpi
```

Once approved (automatic review takes minutes for low-risk extensions), users can install it with one click from AMO and will receive automatic updates.

---

### Chrome

#### Option E — Chrome Web Store

1. Visit the [DevTools Companion for Angular](https://chromewebstore.google.com) page on the Chrome Web Store.
2. Click **Add to Chrome**.
3. Confirm the permissions dialog.

The extension installs permanently and updates automatically.

---

#### Option F — Unpacked extension (developers)

**Step 1 — Build the extension**

```bash
npm run build:chrome
# Output: dist/devtools-companion-angular-chrome-<version>.zip
```

Unzip the output file into a local folder (e.g. `dist/chrome-unpacked/`).

**Step 2 — Load the unpacked extension**

1. Open Chrome and navigate to:
   ```
   chrome://extensions
   ```
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the unzipped folder.

The extension appears in the list. To apply source code changes, click the refresh icon on the extension card.

---

## 3. Getting started

1. **Open an Angular application** in any browser tab — local (`localhost`) or remote.
2. **Open DevTools** with `F12` or `Ctrl+Shift+I` (Mac: `Cmd+Option+I`).
3. Look for the **Angular** tab in the DevTools tab bar. If it is not visible, click the `»` overflow button to find it.
4. If the Angular app is running in **development mode**, you will see a green **Angular (Ivy)** badge in the top-right corner of the panel.
5. If the app is in **production mode**, a yellow notice appears with an **Enable Debug Tools** button. Click it to activate the inspection APIs (requires confirmation in the page context).

> **Tip:** If the badge shows "Detecting Angular…" for more than 10 seconds, reload the page with the DevTools tab already open. Some SPAs complete their bootstrap after the content script has been injected.

---

## 4. User manual

### 🌲 Components — Component tree

The main tab. Displays the full Angular component hierarchy rendered on the page.

#### Tree view (left panel)

| Element | Description |
|---|---|
| Bold name | Component class (`AppComponent`, `HeroListComponent`…) |
| `<selector>` in gray | HTML selector used in the template |
| `OnPush` badge | Indicates the component uses the `OnPush` change detection strategy |
| ▸ / ▾ | Expand or collapse child nodes |

**Available actions:**

- **Click a node** — selects the component and shows its details in the right panel. A red overlay highlights the corresponding DOM element on the page.
- **Search field** — filters the tree by class name or selector. The tree updates in real time.
- **⊕ (picker) button** — activates pick mode: click any element on the page to jump directly to the matching component in the tree.
- **↺ button** — forces a fresh tree scan (useful when the app modifies the DOM dynamically).

#### Details panel (right panel)

When a component is selected, four sections are shown:

**Component** — basic information:

| Field | Content |
|---|---|
| Class | TypeScript class name |
| Selector | Component CSS selector |
| CD Strategy | `Default` or `OnPush` |
| Element | Host HTML tag |

**@Input() Bindings** — all `@Input()` properties with their current values.

- Values are editable: click a value (blue field), type a new value in valid JSON, and press `Tab` or click away. The change is applied to the live page immediately.

**@Output() Events** — list of all `EventEmitter` properties declared as `@Output()`.

**Properties** — remaining public properties of the component that are not `@Input()`.

**Action buttons:**

- **Copy JSON** — copies the full component state to the clipboard as JSON.
- **Clear Highlight** — removes the red overlay from the page.

---

### 📡 HTTP — Request monitor

Captures all HTTP requests made by the application via `XMLHttpRequest` and `fetch()`, including those generated by Angular's `HttpClient` and direct calls.

> Capture starts when the extension injects the bridge into the page. Requests made before DevTools was opened may not appear.

#### Request list (left panel)

Each row shows:

| Column | Description |
|---|---|
| Method | Color-coded badge: `GET` green, `POST` blue, `PUT` amber, `DELETE` red, `PATCH` gray |
| Status | HTTP code: green (2xx), amber (3xx), red (4xx/5xx) |
| URL | Full URL (truncated; hover for the full URL) |
| Duration | Response time in milliseconds |
| Time | Local time of the request |

A red bar on the left edge of a row means the request exceeded the **slow request threshold** (configurable in Settings; default 1000 ms).

The red number badge on the **HTTP** tab counts failed requests (4xx / 5xx) since the last log clear.

**Toolbar filters:**

- **URL** — free text, filters by URL substring.
- **Method** — dropdown: All / GET / POST / PUT / DELETE / PATCH.
- **Status** — dropdown: All / 2xx / 3xx / 4xx / 5xx.
- **✕ button** — clears the entire log.

#### Request detail (right panel)

Click any row to see four sub-tabs:

| Tab | Content |
|---|---|
| **Headers** | Request and response headers |
| **Request** | Request body (JSON auto-formatted) |
| **Response** | Response body (JSON auto-formatted, up to 50 KB) |
| **Timing** | Start time, end time, duration, and status code |

---

### 🗄️ Store — State management

Inspects active NgRx, Akita, and NGXS stores in the application. Detection is automatic on page load.

The badge in the toolbar shows the detected store type (`NGRX`, `AKITA`, `NGXS`).

#### Action log (left panel)

Lists all dispatched actions in reverse chronological order (most recent first).

- **Click an action** — the state tree in the right panel reverts to the snapshot at that moment (time-travel debugging).
- **Search field** — filters actions by type.
- **✕ button** — clears the log and all snapshots.

If your app uses plain Angular services instead of a dedicated state library, click **Scan Services** to snapshot and browse injectable service state directly.

#### State tree (right panel)

Shows the full store state as an interactive JSON tree:

- Click `▾` / `▸` to expand or collapse nodes.
- **Search keys** — filters the tree by key name or value.
- **Current State** — jumps to the latest snapshot.
- **Export JSON** — copies the current state to the clipboard.

---

### 🛣️ Router — Route inspector

Displays Angular Router state: active route, navigation history, and route configuration.

#### Current Route

| Field | Description |
|---|---|
| URL | Full active URL in the browser |
| Path | Normalized route segment |
| Component | Component associated with the active route |
| Params | Route parameters (`:id`, `:slug`…) |
| Query Params | Query parameters (`?search=…&page=…`) |
| Data | Static data defined in the route configuration |

#### Navigation History

Chronological list of all navigation events. Red rows indicate a `NavigationError`; amber rows indicate a `NavigationCancel` (e.g. rejected by a guard).

- **Clear button** — clears the navigation history.

#### Route Configuration

Collapsible tree showing the full route structure registered in the application:

- Lazy-loaded routes show a **lazy** badge.
- Routes with `canActivate` show a **guard** indicator.
- The active branch is highlighted in red.

---

### 💉 DI — Dependency injection

Explore the services injected into the component selected in the **Components** tab.

#### Service list (left panel)

Shows all services resolved by the injector of the selected component.

| Column | Description |
|---|---|
| Name | Service class name |
| Scope | `root`, `module`, or `component` depending on the injector level |
| ⚠ Circular | Warning badge if a circular dependency is detected |

The **Root Providers** section at the bottom lists all providers registered at the root level.

#### Service detail (right panel)

Click a service to see its public properties with their current runtime values.

---

### ⚡ Performance — Profiler

Monitors Angular change detection cycles and detects potential subscription leaks.

#### Summary cards (top)

| Metric | Description |
|---|---|
| Total CD Cycles | Total number of change detection cycles since the panel was opened |
| Avg Duration | Average cycle duration in ms |
| Min / Max | Minimum and maximum recorded duration |

#### CD Timeline

Bar chart showing the last 60 change detection cycles:

| Color | Meaning |
|---|---|
| Red (normal) | Cycle within normal duration |
| Amber | Slow cycle (> 16 ms, more than one frame at 60 fps) |
Bright red | Critical cycle (> 50 ms) |

Hover over a bar to see the exact duration, trigger, and timestamp.

#### Most Checked Components

Table ranking the 10 most frequently checked components. Components with the **Default** strategy that appear at the top are candidates for migrating to **OnPush** to improve rendering performance.

#### Subscription Leaks

If DevTools Companion for Angular detects Observable subscriptions that were not unsubscribed when the component was destroyed, an alert section appears listing the component name and the number of leaked subscriptions.

**Buttons:**

- **▶ Record** — starts cycle instrumentation on the page.
- **✕ Clear** — discards all recorded data.
- **⬇ Export** — copies the recorded data as JSON to the clipboard.

---

### 🗺️ Sources — Source maps

Browse and read the original TypeScript source of the application when the server serves `.js.map` files alongside the bundles.

#### File explorer (left panel)

Tree of all original `.ts` files discovered from the source maps of loaded bundles. Files are grouped by directory.

- **Click a file** to view its content with TypeScript syntax highlighting in the right panel.
- **Search field** — filters the file list by path or name.

#### Code viewer (right panel)

Displays the selected file with syntax coloring (keywords, decorators, strings, numbers, and comments).

From the **Components** tab, when source maps are available, the context menu of a component includes a **Jump to source** option that opens the component's `.ts` file here and scrolls to the matching line.

> If no source maps are available, the panel shows a notice. Most production deployments do not serve `.map` files.

---

### ⚙️ Settings

| Setting | Description | Default |
|---|---|---|
| **Theme** | Dark / Light / System | Dark |
| **Capture request/response bodies** | Store HTTP bodies in the monitor log | Enabled |
| **Max HTTP history** | Maximum number of requests to keep in memory | 500 |
| **Slow request threshold** | Threshold in ms above which a request is flagged as slow | 1000 ms |
| **CD cycle alert threshold** | Cycles per second above which a performance warning is triggered | 60 |
| **Auto-clear on navigation** | Clears the HTTP log and CD data on route change | Disabled |
| **Angular detection timeout** | Seconds to wait for Angular detection on page load | 10 s |
| **Prompt to enable debug mode** | Shows the button to activate debug tools when a production build is detected | Enabled |

Click **Save Settings** to persist your changes. Settings are stored in `browser.storage.local` and survive browser restarts.

Click **Reset Defaults** to restore all settings to their original values.

---

## 5. Known limitations

| Limitation | Detail |
|---|---|
| **Production mode** | Production builds remove Angular's `ng.*` debug APIs. The component tree and DI inspector are unavailable. The HTTP Monitor, Router, and Sources tabs remain fully functional. |
| **Source maps in production** | Most production deployments do not serve `.map` files. The Sources viewer only works when source maps are actively served. |
| **Zoneless Angular (Angular 18+)** | Apps running Angular 18+ without Zone.js may not trigger change detection hooks. The Performance profiler may not record cycles in that case. |
| **Minified class names** | If the bundle is minified without source maps, class names will appear obfuscated (`t`, `n`, `e`…). |
| **Cross-origin iframes** | Angular components inside a cross-origin `<iframe>` cannot be inspected. |
| **Requests before panel open** | The HTTP interceptor is installed when the page loads. Requests made before DevTools was opened do not appear in the log. |

---

## 6. Troubleshooting

### The Angular tab does not appear in DevTools

- Verify the extension is installed and enabled (`about:addons` in Firefox, `chrome://extensions` in Chrome).
- Close and reopen DevTools (`F12` twice).
- In Firefox, check `about:debugging` to confirm the extension appears without errors.

### The badge shows "No Angular" on an Angular app

- The app may still be bootstrapping. Reload the page with DevTools already open.
- In SPAs with deferred loading, wait for the app to complete initialization.
- Check the browser console for JavaScript errors that might prevent Angular from bootstrapping.

### The component tree is empty in production mode

- Click **Enable Debug Tools** in the yellow banner. This calls `enableDebugTools()` in the page context, which reactivates the `ng.*` APIs.
- On some production bundles this is not possible. In that case, use the HTTP Monitor and Router tabs, which do not depend on `ng.*`.

### HTTP requests do not appear in the monitor

- Make sure the page was loaded **after** the extension was installed (the interceptor is injected at document load).
- Some libraries that wrap `fetch` or `XMLHttpRequest` before the bridge is injected may not be intercepted. Reload the page with DevTools open.

### The build fails with Node.js errors

```bash
# Check Node.js version (requires 18+)
node --version

# If the dist/ folder has permission issues
rm -rf dist/
npm run build:firefox   # or build:chrome
```

### The extension is removed when Firefox closes (Option B)

This is the expected behavior for a temporary installation. For persistence, use **Option A** (permanent XPI) or **Option D** (AMO).
