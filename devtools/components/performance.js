/**
 * performance.js — Performance Profiler tab
 */
window.PerformanceTab = (function () {
  'use strict';

  let container;
  let cdCycles = [];
  let componentFreq = {};
  let leaks = [];
  let isRecording = false;
  const MAX_BARS = 60;

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'overflow-y:auto;padding:14px;';
    refresh();
  }

  function refresh() {
    if (!container || !document.body.contains(container)) return;

    const total    = cdCycles.length;
    const durations = cdCycles.map(c => c.duration).filter(Boolean);
    const avg      = durations.length ? Math.round(durations.reduce((a,b)=>a+b,0)/durations.length) : 0;
    const min      = durations.length ? Math.min(...durations) : 0;
    const max      = durations.length ? Math.max(...durations) : 0;
    const recentBars = cdCycles.slice(-MAX_BARS);
    const topComponents = Object.entries(componentFreq).sort((a,b)=>b[1]-a[1]).slice(0, 10);

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-size:13px;font-weight:700">${t('perf_title')}</h3>
        <div style="display:flex;gap:8px;align-items:center">
          ${isRecording
            ? '<span style="color:var(--ai-error);font-size:11px;font-weight:600;animation:blink 1s step-end infinite">● REC</span>'
            : ''}
          <button class="btn${isRecording ? ' danger' : ''}" id="perf-record">${isRecording ? t('perf_stop') : t('perf_record')}</button>
          <button class="btn danger" id="perf-clear">${t('perf_clear')}</button>
          <button class="btn" id="perf-export">${t('perf_export')}</button>
        </div>
      </div>

      <div class="metrics-grid">
        <div class="metric-card">
          <div class="metric-value">${total}</div>
          <div class="metric-label">${t('perf_total')}</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${avg}ms</div>
          <div class="metric-label">${t('perf_avg')}</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${min}/${max}ms</div>
          <div class="metric-label">${t('perf_minmax')}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>${t('perf_timeline', { n: MAX_BARS })}</h3>
        <div class="cd-chart" id="cd-chart">
          ${!recentBars.length
            ? `<span style="color:var(--ai-text-muted);font-size:12px">${t('perf_no_cycles')}</span>`
            : recentBars.map(c => renderBar(c, max || 1)).join('')}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ai-text-muted);margin-top:2px">
          <span>${t('perf_oldest')}</span><span>${t('perf_newest')}</span>
        </div>
      </div>

      ${topComponents.length ? `
      <div class="detail-section">
        <h3>${t('perf_most_checked')}</h3>
        <table class="prop-table">
          <tr style="color:var(--ai-text-muted);font-size:11px"><td>${t('perf_component')}</td><td>${t('perf_checks')}</td><td>${t('perf_strategy')}</td></tr>
          ${topComponents.map(([name, count]) => `
            <tr>
              <td style="font-family:var(--font-code)">${esc(name)}</td>
              <td class="prop-value">${count}</td>
              <td><span class="badge badge-detecting" style="font-size:9px">${componentFreq[name + '__onpush'] ? 'OnPush' : 'Default'}</span></td>
            </tr>
          `).join('')}
        </table>
      </div>` : ''}

      ${leaks.length ? `
      <div class="detail-section">
        <h3>⚠ ${t('perf_leaks')}</h3>
        ${leaks.map(l => `
          <div style="background:rgba(220,53,69,.1);border:1px solid var(--ai-error);border-radius:4px;margin-bottom:6px;padding:8px;font-size:12px">
            <div style="font-weight:600;color:var(--ai-error)">${esc(l.component)}</div>
            <div style="color:var(--ai-text-muted);font-size:11px">${l.count} subscription(s) not unsubscribed on destroy</div>
          </div>
        `).join('')}
      </div>` : ''}
    `;

    // Attach bar tooltips
    container.querySelectorAll('.cd-bar').forEach((bar, i) => {
      const cycle = recentBars[i];
      if (!cycle) return;
      bar.title = `${cycle.duration}ms — ${cycle.trigger || 'unknown trigger'} — ${new Date(cycle.time).toLocaleTimeString()}`;
    });

    // Attach button handlers after innerHTML rebuild
    const recordBtn = document.getElementById('perf-record');
    const clearBtn  = document.getElementById('perf-clear');
    const exportBtn = document.getElementById('perf-export');
    if (recordBtn) recordBtn.addEventListener('click', startRecording);
    if (clearBtn)  clearBtn.addEventListener('click', clearData);
    if (exportBtn) exportBtn.addEventListener('click', exportData);
  }

  function renderBar(cycle, maxDur) {
    const height  = Math.max(4, Math.round((cycle.duration / maxDur) * 56));
    const isSlow  = cycle.duration > 16;
    const isAlert = cycle.duration > 50;
    const cls = isAlert ? 'alert' : isSlow ? 'slow' : '';
    return `<div class="cd-bar ${cls}" style="height:${height}px"></div>`;
  }

  function addCycle(cycle) {
    cdCycles.push(cycle);
    if (cdCycles.length > 1000) cdCycles.shift();
    if (cycle.components) {
      for (const c of cycle.components) {
        componentFreq[c] = (componentFreq[c] || 0) + 1;
      }
    }
    refresh();
  }

  function addLeak(leak) {
    leaks.push(leak);
    refresh();
  }

  function startRecording() {
    if (typeof Panel === 'undefined') return;
    if (isRecording) {
      Panel.sendToPage('STOP_PROFILING', {});
    } else {
      Panel.sendToPage('START_PROFILING', {});
    }
  }

  function onProfilingStarted() {
    isRecording = true;
    refresh();
  }

  function onProfilingStopped() {
    isRecording = false;
    refresh();
  }

  function clearData() {
    cdCycles = [];
    componentFreq = {};
    leaks = [];
    refresh();
  }

  function exportData() {
    if (!cdCycles.length && !leaks.length) {
      showToast(t('perf_nothing_export'), true);
      return;
    }
    const data = {
      exportedAt: new Date().toISOString(),
      summary: {
        totalCycles: cdCycles.length,
        avgDurationMs: cdCycles.length
          ? Math.round(cdCycles.map(c => c.duration).reduce((a,b)=>a+b,0) / cdCycles.length)
          : 0,
      },
      cdCycles,
      componentFreq,
      leaks
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `angular-inspector-perf-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${t('perf_exported')} ${cdCycles.length} cycle(s)`);
  }

  function showToast(msg, isError = false) {
    let toast = document.getElementById('perf-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'perf-toast';
      toast.style.cssText = [
        'position:fixed;bottom:16px;right:16px;z-index:9999',
        'padding:7px 14px;border-radius:4px;font-size:12px;pointer-events:none',
        'transition:opacity .3s',
      ].join(';');
      document.body.appendChild(toast);
    }
    toast.textContent  = msg;
    toast.style.background = isError ? 'var(--ai-error)' : 'var(--ai-primary)';
    toast.style.color  = '#fff';
    toast.style.opacity = '1';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
  }

  function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, addCycle, addLeak, startRecording, clearData, exportData, onProfilingStarted, onProfilingStopped };
})();
