/**
 * inspector.js — content script running in the isolated world.
 * Injects ng-bridge.js into the page context and bridges messages
 * between the page and the DevTools panel via the background service worker.
 */
(function () {
  'use strict';

  const NAMESPACE = '__AngularInspector__';
  const CMD_NS    = '__AngularInspectorCmd__';

  // ── Inject ng-bridge.js into page context ─────────────────────────────────

  function relayLog(level, message) {
    browser.runtime.sendMessage({
      from: 'content',
      type: 'LOG',
      payload: { level, message: '[content] ' + message }
    }).catch(() => {});
  }

  function injectBridge() {
    try {
      const url = browser.runtime.getURL('inject/ng-bridge.js');
      relayLog('info', `Injecting ng-bridge from ${url} — readyState: ${document.readyState}`);
      const script = document.createElement('script');
      script.src = url;
      script.onload  = () => { relayLog('success', 'ng-bridge.js loaded and executing'); script.remove(); };
      script.onerror = (e) => relayLog('error', 'Failed to load ng-bridge.js — check web_accessible_resources in manifest');
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      relayLog('error', 'Injection error: ' + e.message);
    }
  }

  // ── Forward page → background ──────────────────────────────────────────────

  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    if (!e.data || e.data[NAMESPACE] !== true) return;
    // Relay to background
    browser.runtime.sendMessage({
      from: 'content',
      tabId: null, // background will use sender.tab.id
      ...e.data
    }).catch(() => { /* panel not yet open */ });
  });

  // ── Forward background → page ──────────────────────────────────────────────

  browser.runtime.onMessage.addListener((message) => {
    if (message.to !== 'page') return;
    window.postMessage({ [CMD_NS]: true, cmd: message.cmd, payload: message.payload }, '*');
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectBridge);
  } else {
    injectBridge();
  }

})();
