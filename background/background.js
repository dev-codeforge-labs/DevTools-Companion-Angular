/**
 * background.js — service worker acting as message broker.
 * Routes messages between content scripts and DevTools panels.
 */
'use strict';

// Map of tabId → port (DevTools panel connection)
const panelPorts = new Map();

// ── DevTools panel connections ─────────────────────────────────────────────

browser.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('panel-')) return;

  const tabId = parseInt(port.name.replace('panel-', ''), 10);
  panelPorts.set(tabId, port);

  port.onDisconnect.addListener(() => {
    panelPorts.delete(tabId);
  });

  // Messages from panel → page
  port.onMessage.addListener((message) => {
    if (message.to === 'page') {
      browser.tabs.sendMessage(tabId, message).catch(() => { /* tab may be navigating */ });
    }
  });
});

// ── Messages from content scripts → panel ─────────────────────────────────

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.from !== 'content') return;
  const tabId = sender.tab?.id;
  if (!tabId) return;
  const port = panelPorts.get(tabId);
  if (port) {
    try { port.postMessage({ ...message, tabId }); } catch { /* port disconnected */ }
  }
});
