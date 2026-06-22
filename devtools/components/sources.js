/**
 * sources.js — Source Map Viewer tab
 */
window.SourcesTab = (function () {
  'use strict';

  let container, fileTree, viewer;
  let sourceFiles = {};   // path → source content
  let selectedFile = null;

  function render(parent) {
    container = parent;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:row;overflow:hidden;';

    const left = document.createElement('div');
    left.className = 'pane-left';
    left.innerHTML = `
      <div class="toolbar">
        <input class="search-input" id="source-search" placeholder="${t('sources_filter')}" />
      </div>
      <div class="scroll-list source-tree" id="source-file-tree">
        <div class="empty-state"><div class="icon">🗺️</div><p>${t('sources_no_maps')}</p></div>
      </div>
    `;

    const right = document.createElement('div');
    right.className = 'pane-right';
    right.style.padding = '0';
    right.innerHTML = `<div class="empty-state"><div class="icon">📄</div><p>${t('sources_select')}</p></div>`;
    viewer = right;

    container.appendChild(left);
    container.appendChild(right);

    fileTree = document.getElementById('source-file-tree');
    document.getElementById('source-search').addEventListener('input', e => renderFileTree(e.target.value.toLowerCase()));

    // If source files were received before this tab was opened, render them now
    if (Object.keys(sourceFiles).length) {
      renderFileTree('');
    }
  }

  function setSourceFiles(files) {
    sourceFiles = files || {};
    renderFileTree('');
  }

  function setNoSourceMaps() {
    if (!fileTree) return;
    fileTree.innerHTML = `
      <div class="empty-state">
        <div class="icon">🚫</div>
        <p>${t('sources_no_maps_msg')}</p>
      </div>
    `;
  }

  function renderFileTree(filter) {
    if (!fileTree) return;
    const paths = Object.keys(sourceFiles).filter(p => !filter || p.toLowerCase().includes(filter));
    if (!paths.length) {
      fileTree.innerHTML = '<div class="empty-state"><div class="icon">🗺️</div><p>No files match.</p></div>';
      return;
    }
    fileTree.innerHTML = '';
    // Group by directory
    const dirs = {};
    for (const p of paths.sort()) {
      const parts = p.split('/');
      const dir   = parts.slice(0, -1).join('/') || '/';
      if (!dirs[dir]) dirs[dir] = [];
      dirs[dir].push({ path: p, name: parts[parts.length - 1] });
    }
    for (const [dir, files] of Object.entries(dirs)) {
      if (Object.keys(dirs).length > 1) {
        const dirEl = document.createElement('div');
        dirEl.style.cssText = 'color:var(--ai-text-muted);font-size:11px;padding:4px 8px;font-weight:600;margin-top:4px';
        dirEl.textContent = dir;
        fileTree.appendChild(dirEl);
      }
      for (const file of files) {
        const el = document.createElement('div');
        el.className = 'source-file' + (file.path === selectedFile ? ' selected' : '');
        el.textContent = file.name;
        el.title = file.path;
        el.addEventListener('click', () => { selectedFile = file.path; renderFileTree(filter); showSource(file.path); });
        fileTree.appendChild(el);
      }
    }
  }

  function showSource(path) {
    if (!viewer) return;
    const content = sourceFiles[path] || '';
    viewer.innerHTML = `
      <div style="padding:6px 10px;border-bottom:1px solid var(--ai-border);font-size:11px;color:var(--ai-text-muted);font-family:var(--font-code)">${escHtml(path)}</div>
      <pre class="source-viewer">${highlight(content)}</pre>
    `;
  }

  /** Minimal TypeScript syntax highlighting — single-pass to avoid regex feedback loops */
  function highlight(code) {
    return escHtml(code).replace(
      /(\/\/[^\n]*)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`)|(@\w+)|\b(\d+)\b|\b(class|interface|type|enum|extends|implements|import|export|from|return|if|else|for|while|const|let|var|function|async|await|new|this|super|public|private|protected|readonly|static|get|set|null|undefined|true|false)\b/g,
      (_, comment, str, decorator, num, kw) => {
        if (comment)   return `<span style="color:#6A9955">${comment}</span>`;
        if (str)       return `<span style="color:#CE9178">${str}</span>`;
        if (decorator) return `<span style="color:#DCDCAA">${decorator}</span>`;
        if (num)       return `<span style="color:#B5CEA8">${num}</span>`;
        if (kw)        return `<span style="color:#C586C0">${kw}</span>`;
        return _;
      }
    );
  }

  function jumpToLine(path, line) {
    selectedFile = path;
    showSource(path);
    requestAnimationFrame(() => {
      const pre = viewer.querySelector('pre');
      if (!pre) return;
      const lineHeight = 18;
      pre.scrollTop = (line - 1) * lineHeight;
    });
  }

  function escHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return { render, setSourceFiles, setNoSourceMaps, jumpToLine };
})();
