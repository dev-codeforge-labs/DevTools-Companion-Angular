# DevTools Companion for Angular — Functional Specification

**Version:** 1.0.0
**Status:** Released
**Last updated:** 2026-06-15
**Document type:** Product & Functional Requirements

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Target Users](#2-target-users)
3. [Use Cases](#3-use-cases)
4. [Feature Catalogue](#4-feature-catalogue)
5. [User Interface Specification](#5-user-interface-specification)
6. [User Flows](#6-user-flows)
7. [Settings & Personalisation](#7-settings--personalisation)
8. [Accessibility](#8-accessibility)
9. [Internationalisation](#9-internationalisation)
10. [Out of Scope](#10-out-of-scope)
11. [Acceptance Criteria](#11-acceptance-criteria)

---

## 1. Product Vision

### 1.1 Problem Statement

Firefox lacks a first-party Angular DevTools extension. Developers building Angular applications on Firefox are forced to either switch to Chrome during debugging sessions or rely on generic browser DevTools that expose no Angular-specific context — no component state, no change detection metrics, no router introspection, no store visibility.

### 1.2 Product Goal

DevTools Companion for Angular is a Firefox DevTools extension that gives front-end developers complete visibility into a running Angular application from within the browser they already use. It eliminates the need to switch browsers for Angular-specific debugging.

### 1.3 Value Proposition

| Without DevTools Companion for Angular | With DevTools Companion for Angular |
|---|---|
| Switch to Chrome to inspect Angular components | Stay in Firefox |
| Guess component state from DOM attributes | See exact `@Input()` and property values live |
| Add `console.log` to track HTTP calls | See every request in a dedicated panel |
| Install Redux DevTools separately for NgRx | Built-in store viewer with time-travel |
| Read route config from source files | Navigate the route tree live in the panel |
| Manually profile change detection | Automated CD cycle timeline with anomaly alerts |

### 1.4 Design Principles

1. **Zero setup for the user** — the extension works on any Angular page without modifications to the application.
2. **Non-intrusive by default** — the extension observes but does not alter application behaviour unless the user explicitly takes an editing action.
3. **Privacy first** — no data ever leaves the user's browser.
4. **Degrade gracefully** — production-mode and missing-source-map scenarios surface clear notices rather than silent failures.
5. **Native look and feel** — the panel matches the Firefox DevTools visual language while using Angular's brand colours.

---

## 2. Target Users

### 2.1 Primary Persona — Front-End Developer

**Profile:**
- Works daily with Angular (versions 12–18+)
- Uses Firefox as their primary or secondary browser
- Is comfortable with browser DevTools
- Debugs component state, HTTP calls, and router behaviour regularly

**Pain points:**
- Cannot inspect Angular component trees in Firefox without installing Chrome
- Has to rely on `console.log` for HTTP debugging in Angular contexts
- Loses NgRx/Akita state visibility when not using a Chromium-based browser

**Goals:**
- Inspect component inputs and properties without adding debug code
- Monitor all HTTP traffic from Angular's HttpClient in one place
- Navigate the route configuration tree without reading source files

### 2.2 Secondary Persona — QA Engineer

**Profile:**
- Tests Angular applications across browsers including Firefox
- Not a TypeScript developer, but understands component trees and network calls
- Uses DevTools to diagnose failures

**Goals:**
- Reproduce routing issues by inspecting the active route and guard state
- Capture and export HTTP traffic for bug reports
- Identify slow requests and excessive re-renders

### 2.3 Secondary Persona — Tech Lead / Architect

**Profile:**
- Reviews pull requests and code quality
- Cares about performance (change detection cycles, OnPush adoption)
- Audits dependency injection structure

**Goals:**
- Identify components that should be migrated to `OnPush` change detection
- Spot services injected where they should not be
- Detect Observable subscription leaks before they reach production

---

## 3. Use Cases

### UC-01 — Inspect component state during debugging

**Actor:** Front-end developer
**Goal:** See the current value of a component's `@Input()` without adding `console.log`

**Steps:**
1. Developer opens DevTools → DevTools Companion for Angular → Components tab.
2. Clicks the component in the tree.
3. Reads the current `@Input()` values in the detail panel.

**Success:** Exact runtime values are displayed with no code changes required.

---

### UC-02 — Edit an @Input() value live

**Actor:** Front-end developer
**Goal:** Test how a component responds to different input values without reloading

**Steps:**
1. Selects the target component in the tree.
2. Clicks the editable value field next to the `@Input()` property.
3. Types the new value in JSON format and presses Tab.
4. Observes the change reflected immediately in the page.

**Success:** The component re-renders with the new input value applied.

---

### UC-03 — Debug a failing HTTP call

**Actor:** Front-end developer or QA engineer
**Goal:** See the exact request and response of a failed API call

**Steps:**
1. Opens the HTTP tab.
2. Reproduces the action that triggers the HTTP call.
3. Sees the failed request highlighted in red in the list.
4. Clicks the request to open the detail drawer.
5. Reads the Response tab to inspect the error body, and the Headers tab to verify auth tokens.

**Success:** Full request and response details are available without proxying traffic through an external tool.

---

### UC-04 — Diagnose an NgRx state bug

**Actor:** Front-end developer
**Goal:** Identify which action caused an unexpected state change

**Steps:**
1. Opens the Store tab.
2. Reproduces the user flow that leads to the bug.
3. Scrolls the action log to find the suspicious action.
4. Clicks the action to rewind the state tree to that point.
5. Compares the state snapshot before and after the action.

**Success:** The developer pinpoints the exact action and the state keys it affected.

---

### UC-05 — Understand a navigation failure

**Actor:** Front-end developer or QA engineer
**Goal:** Find why a route transition was cancelled or errored

**Steps:**
1. Opens the Router tab.
2. Triggers the problematic navigation.
3. Sees a red row in the Navigation History section.
4. Reads the error or cancellation reason in the row.

**Success:** The guard or resolver responsible for blocking the navigation is identified.

---

### UC-06 — Identify performance regressions

**Actor:** Tech lead
**Goal:** Find components causing excessive change detection cycles

**Steps:**
1. Opens the Performance tab and clicks Record.
2. Interacts with the application for 30 seconds.
3. Reviews the CD Timeline chart for anomalous spikes.
4. Checks the Most Checked Components table to identify candidates for `OnPush`.

**Success:** A ranked list of components with high CD frequency is available to inform a refactoring decision.

---

### UC-07 — Navigate TypeScript source in Firefox

**Actor:** Front-end developer
**Goal:** Read the TypeScript source of a component without opening an IDE

**Steps:**
1. Selects a component in the Components tab.
2. Clicks "Jump to source" from the component's action buttons (only available when source maps are present).
3. DevTools Companion for Angular opens the Sources tab at the exact file and line number of the component class.

**Success:** The `.ts` source file is displayed with syntax highlighting inside the DevTools panel.

---

### UC-08 — Audit dependency injection

**Actor:** Tech lead
**Goal:** Verify that a service is being provided at the correct injector level

**Steps:**
1. Selects a component in the Components tab.
2. Opens the DI tab.
3. Reads the injector scope (root / module / component) next to each service.

**Success:** The injector scope of every service in the component's constructor is visible.

---

## 4. Feature Catalogue

Priority levels: **P0** Critical (must ship), **P1** High (should ship), **P2** Medium (nice to have), **P3** Low (future).

### 4.1 Component Tree Inspector

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-CT-01 | Component tree discovery | P0 | Walk and render the full Angular component hierarchy from root to leaves |
| F-CT-02 | Component metadata display | P0 | Show class name, selector, CD strategy, and host element tag |
| F-CT-03 | @Input() value display | P0 | Show all `@Input()` bindings with current runtime values |
| F-CT-04 | Property display | P0 | Show all public non-Input properties with current values |
| F-CT-05 | @Output() declaration display | P0 | List all `@Output()` EventEmitter names |
| F-CT-06 | Live tree refresh | P0 | Reflect component additions and removals without manual refresh via MutationObserver |
| F-CT-07 | DOM element highlight | P1 | Show a red overlay on the host element of the selected component |
| F-CT-08 | Element picker | P1 | Click any DOM element on the page to auto-select its component in the tree |
| F-CT-09 | Inline @Input() editing | P1 | Edit an `@Input()` value from the panel and apply it live |
| F-CT-10 | Tree search / filter | P1 | Filter tree nodes by class name or selector substring |
| F-CT-11 | Expand / collapse nodes | P1 | Toggle node children; state persists across tab switches |
| F-CT-12 | Copy state as JSON | P2 | Export the full component state snapshot to the clipboard |
| F-CT-13 | OnPush badge | P2 | Visual badge on nodes using `OnPush` change detection strategy |

### 4.2 HTTP Monitor

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-HT-01 | XHR interception | P0 | Capture all `XMLHttpRequest` calls with full metadata |
| F-HT-02 | fetch() interception | P0 | Capture all `fetch()` calls with full metadata |
| F-HT-03 | Request list display | P0 | Chronological list with method badge, status, URL, duration, and time |
| F-HT-04 | Status colour coding | P1 | Green (2xx), amber (3xx), red (4xx / 5xx) |
| F-HT-05 | Request detail drawer | P1 | Per-request Headers, Request, Response, and Timing tabs |
| F-HT-06 | JSON auto-formatting | P1 | Pretty-print JSON bodies in the Request and Response tabs |
| F-HT-07 | Filter by method | P1 | Dropdown: All / GET / POST / PUT / DELETE / PATCH |
| F-HT-08 | Filter by status range | P1 | Dropdown: All / 2xx / 3xx / 4xx / 5xx |
| F-HT-09 | Filter by URL | P1 | Text input: substring match against the full URL |
| F-HT-10 | Slow request highlight | P2 | Left-border accent on requests exceeding the slow threshold |
| F-HT-11 | Failed request badge | P2 | Numeric badge on the HTTP tab counting 4xx / 5xx requests |
| F-HT-12 | Log clear | P1 | Button to discard all captured requests |
| F-HT-13 | Export to HAR | P3 | Save captured requests as an HTTP Archive (HAR) file |

### 4.3 Store Inspector

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-ST-01 | NgRx auto-detection | P0 | Detect NgRx via Redux DevTools extension bridge |
| F-ST-02 | State tree display | P0 | Collapsible JSON tree showing full current store state |
| F-ST-03 | Action log | P0 | Chronological list of dispatched actions with type, payload, and timestamp |
| F-ST-04 | Time-travel | P1 | Click any past action to rewind the state tree view to that snapshot |
| F-ST-05 | Akita detection | P1 | Detect and display Akita entity stores |
| F-ST-06 | NGXS detection | P1 | Detect and display NGXS state classes |
| F-ST-07 | Action filter | P1 | Filter action log by action type substring |
| F-ST-08 | State search | P2 | Filter state tree by key name or value substring |
| F-ST-09 | Export state | P3 | Copy current or historical state snapshot as JSON |

### 4.4 Router Inspector

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-RT-01 | Current route display | P0 | Show active URL, path, component name, params, queryParams, and data |
| F-RT-02 | Navigation history log | P1 | Chronological list of NavigationStart / NavigationEnd events |
| F-RT-03 | Navigation error display | P2 | Flag NavigationError and NavigationCancel events with reason |
| F-RT-04 | Route config tree | P1 | Collapsible tree of the full Routes array |
| F-RT-05 | Active route highlight | P1 | Visually mark the active branch in the route config tree |
| F-RT-06 | Guard indicator | P2 | Show `canActivate` guards on route config nodes |
| F-RT-07 | Lazy-loaded badge | P2 | Mark lazy-loaded route modules in the config tree |
| F-RT-08 | History clear | P1 | Button to clear the navigation history log |

### 4.5 DI Inspector

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-DI-01 | Service list per component | P1 | List all services injected into the selected component's constructor |
| F-DI-02 | Service property display | P1 | Show the current property values of each service instance |
| F-DI-03 | Injector scope display | P2 | Indicate whether a service is provided at root, module, or component level |
| F-DI-04 | Root provider listing | P2 | List all providers registered at the root injector |
| F-DI-05 | Circular dependency alert | P3 | Flag circular injection chains with a warning badge |

### 4.6 Performance Profiler

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-PF-01 | CD cycle recording | P1 | Record every `ApplicationRef.tick()` call with duration and trigger |
| F-PF-02 | Metrics dashboard | P1 | Total cycles, average, min, and max duration cards |
| F-PF-03 | CD timeline chart | P1 | Bar chart of the last 60 CD cycle durations |
| F-PF-04 | Slow cycle highlighting | P1 | Colour bars that exceed 16 ms (amber) or 50 ms (red) |
| F-PF-05 | Most checked components | P2 | Table ranking components by CD check frequency |
| F-PF-06 | OnPush migration hints | P2 | Identify Default-strategy components with high check frequency |
| F-PF-07 | Subscription leak detection | P2 | Alert on Observable subscriptions not cleaned up on component destroy |
| F-PF-08 | Export profiling data | P3 | Copy CD cycle data as JSON to clipboard |

### 4.7 Source Map Viewer

| ID | Feature | Priority | Description |
|---|---|---|---|
| F-SM-01 | Source map auto-discovery | P1 | Scan loaded scripts for `sourceMappingURL` and fetch `.map` files |
| F-SM-02 | File browser | P1 | Collapsible tree of original `.ts` files grouped by directory |
| F-SM-03 | Syntax-highlighted viewer | P1 | Read-only TypeScript source with keyword, decorator, and literal colouring |
| F-SM-04 | File search / filter | P1 | Filter the file browser by path substring |
| F-SM-05 | Jump to source | P2 | Navigate from a component to its `.ts` file and scroll to the line |
| F-SM-06 | No source map notice | P2 | Display a clear message when `.map` files are unavailable |

---

## 5. User Interface Specification

### 5.1 Panel Structure

DevTools Companion for Angular renders as a native Firefox DevTools panel. It consists of three vertical regions:

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER (36px)                                                  │
│  [▲ DevTools Companion for Angular]  [Tabs…]            [badge]  [↺]        │
├─────────────────────────────────────────────────────────────────┤
│  STATUS BANNER (optional, ~30px)                                │
│  Production mode detected — [Enable Debug Tools]                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ACTIVE TAB PANEL (remaining height)                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Tab Bar

The tab bar contains 8 tabs. Labels are 11px, uppercase, letter-spaced. The active tab has a 2px bottom border in `--ai-primary` (#DD0031). Tabs scroll horizontally if the panel is narrower than their combined width.

| Order | Label | Icon | Default |
|---|---|---|---|
| 1 | COMPONENTS | 🌲 | ✅ Active on open |
| 2 | HTTP | 📡 | |
| 3 | STORE | 🗄️ | |
| 4 | ROUTER | 🛣️ | |
| 5 | DI | 💉 | |
| 6 | PERFORMANCE | ⚡ | |
| 7 | SOURCES | 🗺️ | |
| 8 | SETTINGS | ⚙️ | |

The **HTTP** tab shows a numeric red badge when there are unchecked 4xx/5xx responses.

### 5.3 Status Banner

Appears below the tab bar when a notable condition is detected. Hidden by default.

| Condition | Style | Content |
|---|---|---|
| Production mode | Yellow left-border (warn) | "Production mode detected — some features may be limited." + `[Enable Debug Tools]` button |
| No Angular found | Red left-border (error) | "No Angular application detected on this page." |
| Settings saved | Blue left-border (info) | "Settings saved." (auto-dismisses after 2 s) |

### 5.4 Two-Pane Layout

The Components, HTTP, Store, and DI tabs use a two-pane layout: a resizable left pane (list/tree) and a right detail pane. The divider between panes is draggable.

| Tab | Left pane default width | Right pane |
|---|---|---|
| Components | 300 px | Component detail |
| HTTP | 420 px | Request detail drawer |
| Store | 300 px | State tree + diff |
| DI | 300 px | Service property detail |

### 5.5 Design Tokens

```css
--ai-primary:    #DD0031;   /* Angular red */
--ai-dark:       #1A1A2E;   /* Header background */
--ai-accent:     #E94560;   /* Badges, alerts */
--ai-bg:         #0F0F1A;   /* Panel background */
--ai-surface:    #16213E;   /* Card surfaces */
--ai-border:     #2A2A4A;   /* Borders */
--ai-text:       #E8E8F0;   /* Primary text */
--ai-text-muted: #8888AA;   /* Secondary text */
--ai-code-bg:    #0D1117;   /* Code blocks */
--ai-success:    #28A745;
--ai-warning:    #FFC107;
--ai-error:      #DC3545;
--ai-info:       #17A2B8;
```

### 5.6 Typography

| Usage | Font | Size |
|---|---|---|
| UI labels, body | `system-ui, -apple-system, sans-serif` | 13 px |
| Tab labels | Same | 11 px / uppercase / letter-spacing 0.05em |
| Code, property values | `"JetBrains Mono", "Fira Code", monospace` | 11–12 px |

### 5.7 Themes

Two themes are available:

**Dark (default):** Uses the tokens defined in §5.5. Matches the Firefox DevTools dark theme.

**Light:** Overrides background, surface, border, and text tokens to light equivalents:
- Background: `#FFFFFF`
- Surface: `#F5F5F5`
- Border: `#DDDDDD`
- Text: `#1A1A2E`
- Muted text: `#666688`

**System:** Follows `prefers-color-scheme` at the moment the settings are saved.

Theme is applied via a `theme-light` class on `<body>`. Dark mode is the default (no class).

### 5.8 Empty States

Every panel that can be empty must show an empty state with:
- A large emoji icon (opacity 0.4)
- A short explanatory sentence (max 2 lines)

Examples:

| Panel | Empty state message |
|---|---|
| Component tree | "No Angular components found." |
| HTTP list | "No HTTP requests captured yet." |
| Action log | "No actions dispatched yet." |
| Navigation history | "No navigation events yet." |
| DI service list | "Select a component in the Components tab first." |
| CD timeline | "No cycles recorded yet." |
| Source file viewer | "Select a source file to view." |

---

## 6. User Flows

### 6.1 First Open Flow

```
User opens DevTools (F12)
  → Selects "DevTools Companion for Angular" tab
  → Panel loads, status badge shows "Detecting Angular…"
  → [Case A] Angular detected (dev mode)
      → Badge turns green: "Angular (ivy)"
      → Status banner hidden
      → Component tree auto-populates
  → [Case B] Angular detected (production mode)
      → Badge turns amber: "Production Mode"
      → Yellow banner appears with "Enable Debug Tools" button
      → Component tree empty; HTTP + Sources available
  → [Case C] No Angular found after 10 s
      → Badge turns red: "No Angular"
      → Red banner: "No Angular application detected on this page."
```

### 6.2 Component Inspection Flow

```
User clicks a node in the component tree
  → Node highlighted in tree (red selection)
  → Red overlay appears on the host element in the page
  → Detail panel shows: Component / @Input() / @Output() / Properties sections
  → [Optional] User clicks an @Input() value
      → Field becomes editable
      → User types new JSON value + Tab
      → Extension calls SET_PROPERTY → ng.applyChanges()
      → Page re-renders immediately
      → Field updates to reflect the new serialised value
```

### 6.3 HTTP Debugging Flow

```
User opens HTTP tab
  → List is empty (no requests captured before tab was open)
  → User triggers an action in the Angular app
  → Requests appear in real time, newest at top
  → [Optional] User applies filters (method, status, URL)
      → List updates immediately
  → User clicks a row
      → Detail drawer opens on the right
      → User selects "Response" tab
      → JSON body is auto-formatted and displayed
  → [Optional] User clicks "✕" to clear the log
```

### 6.4 Store Time-Travel Flow

```
User opens Store tab
  → Store type badge shows "NGRX" (or AKITA / NGXS)
  → Action log populates as actions are dispatched
  → State tree shows current state
  → User clicks a past action in the log
      → State tree rewinds to the snapshot at that action
      → Selected action row highlighted
  → User clicks "Current State"
      → State tree returns to latest snapshot
```

---

## 7. Settings & Personalisation

All settings are persisted in `browser.storage.local` under the key `ai_settings`. They survive browser restarts and extension updates.

| Setting | Type | Default | Description |
|---|---|---|---|
| `theme` | `'dark' \| 'light' \| 'system'` | `'dark'` | Panel colour scheme |
| `httpCaptureBody` | `boolean` | `true` | Store HTTP request/response bodies in memory |
| `maxHttpHistory` | `number` | `500` | Maximum HTTP log entries retained |
| `slowRequestThreshold` | `number` | `1000` | ms above which a request is flagged as slow |
| `cdCycleAlertThreshold` | `number` | `60` | Cycles/second that triggers a CD rate warning |
| `autoClearOnNavigation` | `boolean` | `false` | Clear HTTP log and CD data on route change |
| `angularDetectionTimeout` | `number` | `10` | Seconds to retry Angular detection on page load |
| `enableDebugModePrompt` | `boolean` | `true` | Show "Enable Debug Tools" button in production mode |

**Save behaviour:** Settings are applied immediately to the UI (theme change is instant) and persisted to `storage.local` when the user clicks **Save Settings**.

**Reset:** **Reset Defaults** restores all values to their defaults and saves immediately.

---

## 8. Accessibility

### 8.1 Keyboard Navigation

- All tab buttons are focusable and activatable via `Enter` or `Space`.
- Tree nodes, HTTP rows, action rows, and source file items are focusable and selectable via `Enter`.
- The Settings form uses native `<input>`, `<select>`, and `<label>` elements, fully accessible by keyboard.
- Editable property value fields use `contenteditable` with focus management.

### 8.2 Colour Contrast

All text / background combinations in both dark and light themes meet WCAG 2.1 AA contrast requirements (4.5:1 for normal text, 3:1 for large text). Status colours (success, warning, error) are never used as the sole indicator — they are always accompanied by text labels or icon symbols.

### 8.3 Screen Reader Considerations

- The panel is not primarily designed for screen-reader use (it is a DevTools panel), but semantic HTML elements (`<button>`, `<input>`, `<table>`, `<nav>`) are used throughout.
- All icon buttons include `title` attributes for tooltip accessibility.
- Status badges and method badges use text content, not only colour.

---

## 9. Internationalisation

Version 1.0.0 ships in **English only**. The extension manifest does not include `_locales`. All user-visible strings are hardcoded in English in the JavaScript source files.

Future localisation can be implemented by:
1. Adding a `_locales/` directory with `messages.json` files per locale.
2. Replacing hardcoded strings with `browser.i18n.getMessage()` calls.
3. Updating `manifest.json` to use `__MSG_<key>__` syntax for `name` and `description`.

---

## 10. Out of Scope

The following features are explicitly excluded from version 1.0.0:

| Feature | Reason |
|---|---|
| Chrome / Edge / Safari support | Different DevTools API; requires separate manifest and testing matrix |
| WebSocket traffic capture | Adds complexity; low priority for Angular HttpClient users |
| Service Worker inspection | Separate execution context; requires dedicated architecture |
| Network throttling | Already provided by Firefox native DevTools |
| Angular test runner integration | Out of DevTools scope |
| Remote debugging (non-localhost) | No additional requirements; already works via Firefox remote debugging |
| AI-assisted debugging | Intentionally out of scope for 1.0.0 |
| HAR export | P3 — deferred to a future release |
| Circular dependency graph visualisation | P3 — requires graph rendering library |
| Angular Signals inspector | Requires Angular 16+ signal internals; planned for 1.1.0 |
| Angular SSR / Hydration status | No stable introspection API in Angular 12–18 |

---

## 11. Acceptance Criteria

The following criteria define the minimum bar for a releasable 1.0.0.

### 11.1 Installation

- [ ] Extension installs without errors from `about:debugging` (temporary load).
- [ ] Extension installs without errors from the XPI file with `xpinstall.signatures.required = false`.
- [ ] `web-ext lint` reports no errors or warnings.
- [ ] Extension icon appears in the Firefox toolbar after installation.
- [ ] DevTools panel "DevTools Companion for Angular" appears in the tab bar of Firefox DevTools.

### 11.2 Angular Detection

- [ ] Badge shows "Angular (ivy)" on a development-mode Angular app within 10 seconds.
- [ ] Badge shows "Production Mode" on a production Angular build.
- [ ] Badge shows "No Angular" on a non-Angular page within 10 seconds.
- [ ] Yellow banner with "Enable Debug Tools" appears in production mode.

### 11.3 Component Tree

- [ ] Component tree populates on a dev-mode Angular app without user action.
- [ ] Tree nodes show class name, selector, and CD strategy.
- [ ] Selecting a node shows `@Input()`, `@Output()`, and property sections.
- [ ] The host element highlight overlay appears on the inspected page.
- [ ] Editing an `@Input()` value updates the page without a reload.
- [ ] Tree search filters nodes correctly.

### 11.4 HTTP Monitor

- [ ] GET, POST, PUT, DELETE, and PATCH requests are captured and displayed.
- [ ] Status colour coding (green/amber/red) is applied correctly.
- [ ] Clicking a request opens the detail drawer.
- [ ] JSON response bodies are auto-formatted.
- [ ] Filtering by method, status range, and URL substring works correctly.
- [ ] Log clear button removes all entries.

### 11.5 Router

- [ ] Current route URL, params, and queryParams are displayed.
- [ ] Navigation events appear in the history log after route changes.

### 11.6 Settings

- [ ] All settings save correctly and persist after a browser restart.
- [ ] Theme toggle switches the panel between dark and light modes instantly.
- [ ] Reset Defaults restores all values to their documented defaults.

### 11.7 Non-Functional

- [ ] The component tree re-scan after a DOM mutation completes in under 500 ms on an app with 100+ components.
- [ ] The HTTP Monitor displays entries in real time with no visible lag on pages that fire more than 20 requests per second.
- [ ] No JavaScript errors appear in the DevTools console from the extension's own scripts during normal use.
- [ ] No data is transmitted to external servers (verifiable by monitoring network traffic in Firefox's Network tab while using the extension).
