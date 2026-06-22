# DevTools Companion for Angular — Functional Specification

**Version:** 1.1.3  
**Platform:** Firefox DevTools Extension  
**Audience:** Developers working on Angular 12–18+ applications

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Installation & Entry Point](#2-installation--entry-point)
3. [Global Chrome](#3-global-chrome)
4. [Angular Detection & Status Badge](#4-angular-detection--status-badge)
5. [Tab: Components](#5-tab-components)
6. [Tab: HTTP Monitor](#6-tab-http-monitor)
7. [Tab: Store](#7-tab-store)
8. [Tab: Router](#8-tab-router)
9. [Tab: DI (Dependency Injection)](#9-tab-di-dependency-injection)
10. [Tab: Performance](#10-tab-performance)
11. [Tab: Sources](#11-tab-sources)
12. [Tab: Debug](#12-tab-debug)
13. [Tab: Settings](#13-tab-settings)
14. [Production Mode Behaviour](#14-production-mode-behaviour)
15. [Settings Reference](#15-settings-reference)
16. [Behaviour on Navigation](#16-behaviour-on-navigation)
17. [Error & Edge Cases](#17-error--edge-cases)

---

## 1. Product Overview

**DevTools Companion for Angular** is a Firefox DevTools panel that provides deep runtime introspection of Angular applications without modifying application source code. It injects a lightweight bridge script into the inspected page that reads Angular's internal state and relays it to the DevTools panel in real time.

### Primary use cases

- Inspect the live component tree and its input/output bindings
- Monitor all HTTP traffic made by the application
- Track state management actions (NgRx / NGXS / Akita) or inspect Angular service state
- Trace Angular Router navigation events
- Profile change detection cycles and identify performance bottlenecks
- Inspect source map availability
- Diagnose extension injection and Angular API availability

### Supported Angular modes

| Angular mode | Detection | Component tree | Inputs/Outputs | HTTP | Router | Store |
|---|---|---|---|---|---|---|
| Development (Ivy) | ✓ Full | ✓ Full | ✓ Full | ✓ | ✓ | ✓ |
| Production (Angular 14+) | ✓ Structural | Partial (names only) | ✗ | ✓ | ✓ | ✓ |
| Production (Angular 9–13) | ✓ Structural | Partial | ✗ | ✓ | ✓ | ✓ |
| Legacy (Angular 2–8) | ✓ Limited | Inferred | ✗ | ✓ | ✓ | ✓ |

---

## 2. Installation & Entry Point

### Temporary installation (development / testing)

1. Open Firefox and navigate to `about:debugging`.
2. Click **This Firefox** in the left sidebar.
3. Click **Load Temporary Add-on…**.
4. Select the `angular-inspector-{version}.xpi` file.
5. The extension loads immediately — no browser restart required.

### Opening the panel

1. Open the browser DevTools (`F12` or right-click → Inspect).
2. An **DevTools Companion for Angular** tab appears in the DevTools toolbar between existing tabs.
3. Click it to activate the panel.

The panel initialises, connects to the background service worker, and requests the current Angular state from the inspected page. If the page was already loaded before the panel opened, previously captured state (component tree, HTTP log) is recovered immediately.

---

## 3. Global Chrome

### Tab bar

The tab bar runs horizontally at the top of the panel:

```
△ DevTools Companion for Angular  | Components | HTTP | Store | Router | DI | ⚡ Performance | Sources | Debug | ⚙ Settings |  [Badge]  [↺]
```

- Tabs are mutually exclusive; clicking a tab renders its content below.
- The active tab is underlined in red.
- The panel remembers the active tab within the same DevTools session.

### Status badge

Located at the top-right corner. Shows the current Angular detection state:

| State | Badge text | Colour |
|---|---|---|
| Detecting | `Detecting Angular…` | Yellow |
| Development / Ivy | `Angular (Ivy)` | Green (Angular red) |
| Development / Legacy | `Angular (Legacy)` | Green |
| Production | `Angular — Production` | Amber/gold |
| Not found | `No Angular` | Grey |

### Refresh button (↺)

Forces a manual re-scan of the component tree and retries Angular detection.

### Status banner

A full-width banner appears below the tab bar in certain conditions:

- **Production mode detected** — amber/warn banner with a "Check Available APIs" button.
- **Angular not found** — red/error banner with guidance to retry or open the Debug tab.
- **Settings saved** — info banner that auto-dismisses after 2 s.

---

## 4. Angular Detection & Status Badge

On page load, the extension attempts to detect Angular automatically. Detection retries up to 5 times at 2-second intervals (10 seconds total) to accommodate lazy-loaded applications.

### Detection results

**If Angular is found in development mode:**
- Badge turns green: `Angular (Ivy)` or `Angular (Legacy)`.
- No banner is shown.
- The component tree is requested and rendered immediately.

**If Angular is found in production mode:**
- Badge turns amber: `Angular — Production`.
- A warning banner appears explaining which features are limited and which remain available.
- A "Check Available APIs" button appears in the banner (can be disabled in Settings).

**If Angular is not found after 10 s:**
- Badge turns grey: `No Angular`.
- An error banner appears with instructions.
- The user can click ↺ to retry detection manually.

---

## 5. Tab: Components

**Purpose:** Visualise and inspect the live Angular component tree.

### Layout

The tab is split into two panes:

- **Left pane** — scrollable component tree with filter toolbar.
- **Right pane** — property inspector for the selected component.

### Left pane — Component tree

#### Toolbar

| Control | Function |
|---|---|
| Filter input | Live filter; matches component name or selector |
| ⊕ Picker button | (Reserved for element-picker feature) |
| ↺ Refresh button | Triggers an immediate tree re-scan |

#### Tree nodes

Each node displays:
- Component class name (e.g., `AppComponent`)
- Element selector (e.g., `<app-root>`)
- `OnPush` badge — shown when the component uses `ChangeDetectionStrategy.OnPush`

Nodes with children show a collapse/expand toggle (`▸` / `▾`). Clicking any node selects it and highlights its host element on the page with a red outline.

#### Filtering

Typing in the filter box hides nodes whose name and selector do not match the query. Parent nodes are preserved if any descendant matches.

### Right pane — Component inspector

Selecting a node shows structured information in collapsible sections.

#### Section: Component

| Field | Value |
|---|---|
| Class | Component class name |
| Selector | Angular element selector |
| CD Strategy | `Default` or `OnPush` |
| Element | Actual DOM tag name |
| File | Source file name (dev builds only), with full path on hover |

#### Section: @Input() Bindings

A table of all `@Input()` decorated properties with their current live values. Values are **inline-editable**: clicking a value cell makes it editable; on blur the new value is parsed as JSON and applied to the component instance. Angular's `ng.applyChanges()` is called to trigger re-render.

#### Section: @Output() Events

A table of all `@Output()` decorated EventEmitters with enriched metadata:

| Column | Description |
|---|---|
| Name | Public binding name; `≠` marker if the internal field name differs (alias) |
| Type | Constructor name of the emitter (typically `EventEmitter`) |
| Subscribers badge | `N sub` in green if active subscribers exist; `no subs` in muted if none |
| Async badge | `async` badge shown if the emitter was constructed with `async: true` |

#### Section: Properties

All other public, enumerable own properties of the component instance that are not already listed as `@Input()` bindings.

**Long values** (serialised JSON > 80 characters) are truncated with `…` and a `▼ expand` button appears to the right. Clicking the button or the value itself toggles between truncated and full display.

**Expand All / Collapse All buttons** appear in the section header when at least one property has an expandable value, allowing one-click expansion or collapse of all rows simultaneously.

#### Bottom actions

| Button | Function |
|---|---|
| Copy JSON | Copies the full node JSON (including all properties) to the clipboard |
| Clear Highlight | Removes the red outline from the selected component's host element |

### Tree auto-refresh

The tree automatically refreshes when DOM mutations are detected, with an 800 ms debounce and a minimum 3-second interval between refreshes. This prevents excessive updates caused by frameworks like Angular Material that generate frequent micro-mutations.

---

## 6. Tab: HTTP Monitor

**Purpose:** Capture and inspect all HTTP requests made by the application.

### Layout

Split pane:
- **Left:** scrollable request list
- **Right:** request detail view

### Request list

Each row shows:
- HTTP method badge (GET green, POST blue, PUT/PATCH orange, DELETE red)
- Request URL
- Status code badge (2xx green, 3xx yellow, 4xx/5xx red)
- Duration in ms

#### Toolbar

| Control | Function |
|---|---|
| Filter input | Live filter on URL and method |
| ✕ Clear button | Clears all captured entries |

### Request detail

When a request is selected, the right pane shows four sub-sections:

**Request**
- Method, URL, timestamp
- Request body (formatted as indented JSON if parseable, otherwise raw text)
- `(no body)` shown for requests without a body (e.g., GET)

**Response**
- Status code and text
- Response body (formatted JSON or raw)

**Headers**
- Request headers
- Response headers

**Timing**
- Duration from send to last byte

### Slow request highlighting

Requests exceeding the configured slow threshold (default 1000 ms) are highlighted in the list. The threshold is configurable in Settings.

### Buffer limit

A maximum of 500 requests are retained (configurable in Settings). When the limit is reached, the oldest entries are dropped.

---

## 7. Tab: Store

**Purpose:** Inspect state management libraries (NgRx, NGXS, Akita) or Angular injectable services when no formal store is present.

### Store detection modes

The tab automatically detects which store library is in use and adapts its UI:

#### Mode 1: Formal store detected (NgRx / NGXS / Akita)

The store type badge (`NGRX`, `NGXS`, or `AKITA`) appears in the toolbar.

**Left pane — Action log:**
- Each dispatched action is listed chronologically (newest at top).
- Clicking an action loads the resulting state snapshot in the right pane.
- Search bar filters actions by type name.
- ✕ Clear button empties the log.

**Right pane — State viewer:**
- Collapsible JSON tree rendered from the state snapshot.
- Search input filters keys and values within the tree.
- Collapsible array and object nodes (▾ / ▸ toggle).

#### Mode 2: No store detected

After 3 seconds without detecting a store, the badge changes to `No Store` and an informational message appears with guidance.

A **"Scan Services"** button becomes visible. Clicking it scans Angular's DI injector for all user-defined injectable services and captures their current public property values as a snapshot.

#### Actions when in Services mode

Each completed scan adds a timestamped entry to the left pane (e.g., `📸 Services @ 14:32:01`). Clicking a past entry restores that snapshot in the right pane.

### Buttons (right pane toolbar)

| Button | Behaviour |
|---|---|
| **Current State** | Shows the most recent snapshot; shows an informational message if none exists yet |
| **Diff** | Disabled until 2+ snapshots exist; when enabled, shows key-level diff between the two most recent snapshots (red = old value, green = new value) |
| **Export JSON** | Downloads a `.json` file of the most recent snapshot; shows a toast confirmation; shows an error toast if nothing is available |
| **Scan Services** | Visible in Services mode; triggers a DI scan; shows a loading state for 3 s |

### Toast notifications

Short overlay badges appear at the bottom-right of the right pane to confirm actions (e.g., "Copied to clipboard ✓", "Nothing to export yet").

---

## 8. Tab: Router

**Purpose:** Display a log of Angular Router navigation events.

Each entry shows:
- Navigation type (`start`, `end`, `cancel`, `error`)
- Target URL
- Timestamp

Navigation events are appended as they occur. The panel starts capturing from the moment it opens; events before the panel opened are not available unless Angular replays them.

---

## 9. Tab: DI (Dependency Injection)

**Purpose:** Browse the Angular dependency injection tree.

> **Note:** This tab is most useful in development mode. In production mode, the DI internals are not accessible.

Shows the injector hierarchy with provided tokens and their resolved instances. Allows inspection of service instances in the same way as component properties in the Components tab.

---

## 10. Tab: Performance

**Purpose:** Profile Angular change detection cycles in real time.

### Controls

| Button | Function |
|---|---|
| **▶ Record** | Starts the CD profiler; button changes to **■ Stop** with a blinking red REC indicator |
| **■ Stop** | Stops the profiler |
| **✕ Clear** | Resets all collected data |
| **⬇ Export** | Downloads a `.json` file of all recorded cycles |

The REC indicator (● REC in red) blinks while recording is active to make the state obvious.

### Metrics cards

Three summary cards appear below the toolbar:

| Card | Value |
|---|---|
| Total CD Cycles | Count of all recorded cycles since recording started |
| Avg Duration | Average duration of all cycles in milliseconds |
| Min / Max | Shortest and longest single cycle duration |

Metric values are displayed in red when they indicate a problem (high cycle counts or long durations).

### CD Timeline bar chart

A bar chart shows the last 60 change detection cycles as vertical bars. Bar height is proportional to duration relative to the session maximum.

**Colour coding:**
- Green — < 16 ms (within one animation frame)
- Amber — 16–49 ms (slow, may cause jank)
- Red — ≥ 50 ms (alert, likely causing visible frame drops)

Hovering over a bar shows a tooltip: `{duration}ms — {trigger} — {time}`.

### Most Checked Components table

After recording, a ranked table shows which components appeared most frequently in change detection batches:

| Column | Description |
|---|---|
| Component | Class name |
| Checks | Number of times seen in CD batches |
| Strategy | `OnPush` or `Default` badge |

### Subscription Leaks section

If the bridge detects component subscriptions that were not unsubscribed on destroy, they are listed here with the component name and count.

### Export

Clicking **⬇ Export** with data present triggers a direct file download named:
```
angular-inspector-perf-{timestamp}.json
```

Content:
```json
{
  "exportedAt": "ISO timestamp",
  "summary": { "totalCycles": N, "avgDurationMs": N },
  "cdCycles": [ … ],
  "componentFreq": { … },
  "leaks": [ … ]
}
```

If no data has been recorded, clicking Export shows a toast: *"Nothing to export — record some cycles first."*

---

## 11. Tab: Sources

**Purpose:** Check whether source maps are available in the inspected application.

Shows:
- Count of scripts with `//# sourceMappingURL` comments detected
- List of affected scripts

If no source maps are found, a message is shown explaining how to enable them (`sourceMap: true` in `angular.json` build configuration).

Source maps enable other tools (e.g., browser debugger) to show original TypeScript source. This tab is informational only — DevTools Companion for Angular does not parse or use the source maps itself.

---

## 12. Tab: Debug

**Purpose:** Provide a real-time internal log of all extension activity. Intended for troubleshooting injection issues, Angular detection failures, or unexpected behaviour.

### Log entries

Every action taken by the extension is logged here with:
- **Source** — which execution context produced the entry (`panel`, `bridge`, `content`, `background`, `user`)
- **Level** — `info`, `success`, `warn`, `error`, `debug`, `bridge`
- **Message** — human-readable description
- **Timestamp**
- **Data** — optional structured payload (shown as collapsed JSON)

Log entries are colour-coded by level (green = success, amber = warn, red = error, etc.).

### Test Injection button

Runs a diagnostic that:
1. Uses `browser.devtools.inspectedWindow.eval()` to execute JavaScript in the page context.
2. Checks the availability of all relevant Angular debug APIs: `ng.getComponent`, `ng.applyChanges`, `ng.getOwningComponent`, `ng.getDirectives`, `ng.getInjector`, `ng.getHostElement`, `ng.profiler`.
3. Checks `__ngContext__` type on DOM nodes (number = Angular 14+, LView array = Angular 9–13).
4. Checks for `_nghost-*` and `_ngcontent-*` attribute patterns.
5. Logs a structured summary of available and unavailable APIs.
6. Provides actionable guidance (e.g., "serve the app in development mode to enable full inspection").

This is the same diagnostic triggered by the "Check Available APIs" button in the production mode banner.

### Clear Log button

Removes all log entries.

---

## 13. Tab: Settings

**Purpose:** Persist user preferences for the panel across browser sessions.

All settings are stored in browser local storage and survive tab/window/browser restarts.

### Controls

| Setting | Control type | Description |
|---|---|---|
| Theme | Dropdown | `Dark`, `Light`, `System` |
| Capture request/response bodies | Toggle | Whether HTTP bodies are stored |
| Max HTTP history | Number input | Max entries retained in the HTTP log |
| Slow request threshold | Number input | Duration (ms) to flag a request as slow |
| CD cycle alert threshold | Number input | Cycles/s above which a performance alert fires |
| Auto-clear on navigation | Toggle | Clear HTTP + CD logs on Angular Router navigation |
| Angular detection timeout | Number input | Seconds to keep retrying Angular detection |
| Prompt to enable debug mode | Toggle | Show "Check Available APIs" button in production banner |

### Buttons

| Button | Function |
|---|---|
| Save Settings | Applies and persists the current form values immediately |
| Reset Defaults | Restores all settings to their factory defaults and re-renders the form |

A "Settings saved." confirmation banner appears for 2 seconds after saving.

---

## 14. Production Mode Behaviour

When Angular runs in production mode (compiled with `--configuration=production`), several debug APIs are removed by the Angular compiler. This affects DevTools Companion for Angular as follows:

### What works in production

| Feature | Available |
|---|---|
| Angular detection | ✓ |
| Component tree (names only, structural) | ✓ (limited) |
| HTTP Monitor | ✓ (full) |
| Router tab | ✓ (full) |
| Store tab | ✓ (full) |
| Performance Profiler | ✓ (full) |
| Sources tab | ✓ (full) |
| Debug tab | ✓ (full) |

### What does NOT work in production

| Feature | Reason |
|---|---|
| @Input() / @Output() values | `ng.getComponent` removed |
| Component property inspection | `ng.getComponent` removed |
| Inline property editing | `ng.applyChanges` removed |
| DI service scanner | `ng.getInjector._records` removed |
| Source file name in component info | Debug info stripped by build |

### Production banner and API diagnostic

When production mode is detected:
1. A warning banner appears at the top of the panel.
2. A "Check Available APIs" button opens the Debug tab and runs a full API diagnostic.
3. The diagnostic reports exactly which APIs are present (some apps ship `enableDebugMode()` or use partial production builds that retain some APIs).
4. Actionable guidance is shown: `ng serve` (default development) unlocks all features.

---

## 15. Settings Reference

See [Tab: Settings](#13-tab-settings) for the UI. Below is the full settings schema with defaults:

| Key | Default | Range | Effect |
|---|---|---|---|
| `theme` | `dark` | `dark` / `light` / `system` | Panel colour scheme |
| `httpCaptureBody` | `true` | boolean | Capture HTTP request/response bodies |
| `maxHttpHistory` | `500` | 10 – 5000 | Max HTTP entries retained |
| `slowRequestThreshold` | `1000` | 100 – 30000 ms | Threshold for slow request highlighting |
| `cdCycleAlertThreshold` | `60` | 1 – 300 | CD cycles/s above which an alert is raised |
| `autoClearOnNavigation` | `false` | boolean | Auto-clear logs on route change |
| `angularDetectionTimeout` | `10` | 1 – 60 s | Total time to spend retrying Angular detection |
| `enableDebugModePrompt` | `true` | boolean | Show "Check Available APIs" button in production banner |

---

## 16. Behaviour on Navigation

### Angular Router navigation

When the Angular application navigates to a new route:
- A navigation event is appended to the Router tab.
- If **Auto-clear on navigation** is enabled in Settings, the HTTP log and CD profiler data are cleared.

### Full page reload

On a full page reload, the bridge script is re-injected automatically. Angular detection restarts from scratch. The HTTP log is cleared. The component tree is refreshed once Angular is re-detected.

### Panel opened after page load

If the DevTools panel is opened after the page has already loaded and Angular has bootstrapped, the panel sends a `REQUEST_STATUS` command within 300 ms of connecting. The bridge responds with:
- The detected Angular version and mode
- The current component tree
- The full HTTP log buffer (all requests captured since the bridge injected)

The panel therefore shows correct state immediately without requiring a page reload.

---

## 17. Error & Edge Cases

| Scenario | Behaviour |
|---|---|
| Angular not found after 10 s | `No Angular` badge; error banner with retry instructions |
| Panel opened before Angular bootstraps | Detection retries continue; state delivered when ready |
| Background service worker killed by Firefox | Panel and content script reconnect automatically (1–2 s delay) |
| `ng.getInjector` unavailable (production) | Services scan shows error message with guidance |
| Store scan returns 0 services | Right pane shows "No injectable services found" |
| Export with no data | Toast: "Nothing to export" (no file download attempted) |
| Clipboard API fails (DevTools context) | Not used — all exports use file download instead |
| Property edit — invalid JSON | Change ignored silently; no server-side call made |
| Property edit — runtime error | `PROP_UPDATE_ERROR` logged in Debug tab |
| Component tree too large (> 1000 nodes) | Rendered with virtual scrolling; search/filter recommended |
| HTTP response body > 50 KB | Body truncated before transmission to panel |
| XPI file locked by Firefox on rebuild | Version number incremented to produce a new output filename |
