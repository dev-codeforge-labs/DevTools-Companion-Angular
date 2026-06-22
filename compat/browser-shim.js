/**
 * browser-shim.js — Chrome compatibility layer.
 * Makes Chrome's `chrome.*` API available as `browser.*` (with Promise support).
 * Loaded as the first content script on Chrome builds.
 * Also prepended to background.js and panel.js during the Chrome build.
 */
(function () {
  'use strict';
  if (typeof browser !== 'undefined') return; // already defined (Firefox)
  if (typeof chrome === 'undefined') return;  // neither available

  // Chrome's Manifest V3 already returns Promises from most APIs,
  // so a simple alias is sufficient for our usage patterns.
  // eslint-disable-next-line no-global-assign
  browser = chrome;
})();
