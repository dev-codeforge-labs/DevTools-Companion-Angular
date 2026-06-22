# Privacy Policy — DevTools Companion for Angular

**Last updated: 2026-06-19**

## Summary

DevTools Companion for Angular does **not** collect, transmit, or store any personal data on external servers. All processing occurs locally in your browser.

---

## Data collected and where it stays

| Data | Where it lives | Transmitted externally? |
|---|---|---|
| Angular component state | Browser memory (DevTools panel) | **Never** |
| HTTP request/response bodies | Browser memory (HTTP Monitor tab, up to configured limit) | **Never** |
| Router navigation history | Browser memory (Router tab) | **Never** |
| Store actions and state | Browser memory (Store tab) | **Never** |
| Extension settings (theme, thresholds) | `browser.storage.local` on your device | **Never** |

## What the extension accesses

- **Page content** — DevTools Companion for Angular reads Angular runtime globals (`ng.*`), intercepts `XMLHttpRequest` and `fetch()` calls, and observes DOM mutations, solely to display debug information in the DevTools panel.
- **DevTools panel** — All data displayed in the panel exists only in your browser tab and is discarded when you close the tab or navigate away (unless you explicitly copy it to the clipboard).
- **Extension storage** — User preferences (theme, alert thresholds, etc.) are stored locally via the Web Extensions `storage.local` API and never leave your device.

## Browser compatibility

DevTools Companion for Angular is available for:

- **Firefox 115+** — distributed as a signed `.xpi` via Firefox Add-ons (AMO)
- **Chrome 120+** — distributed as a `.zip` via the Chrome Web Store

Both versions use the same source code. The Chrome build is produced by
`node build.js chrome` and includes a compatibility shim (`compat/browser-shim.js`)
that maps Chrome's `chrome.*` API to `browser.*`. No behaviour differs between
the two builds from a privacy perspective.

## Permissions justification

| Permission | Reason |
|---|---|
| `activeTab` | Required to inspect the currently open tab |
| `devtools` | Required to register the DevTools panel |
| `storage` | Persists user settings locally |
| `scripting` | Injects `ng-bridge.js` into the inspected page |
| `webRequest` | Monitors HTTP requests for the HTTP Monitor tab (read-only, local only) |
| `<all_urls>` | Needed so the extension activates on any Angular app URL |

## Third-party services

DevTools Companion for Angular uses **no external APIs, analytics services, crash reporters, or telemetry** of any kind.

## Contact

To report a privacy concern or request data deletion (there is nothing to delete — no server ever receives your data), please open an issue at:
https://github.com/angular-inspector/angular-inspector/issues
