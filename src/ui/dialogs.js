import { showToast } from './toast.js';
import { importFromFile } from '../graph/serializer.js';
import { computeDiff } from '../graph/diff.js';
import { formatDiffSummary } from './panel.js';
import cytoscape from 'cytoscape';
import { baseStyles } from '../cytoscape/styles.js';

// Shared dialog element
let dialogEl = null;

function getDialog() {
  if (!dialogEl) {
    dialogEl = document.createElement('dialog');
    document.body.appendChild(dialogEl);
  }
  return dialogEl;
}

let overlayEl = null;

function openDialog(html, panelEl = null) {
  const dlg = getDialog();
  dlg.innerHTML = html;

  // Position relative to panel if provided
  if (panelEl) {
    // Create and insert custom overlay into panel
    overlayEl = document.createElement('div');
    overlayEl.className = 'panel-overlay';
    panelEl.insertBefore(overlayEl, panelEl.firstChild);

    // Use show() instead of showModal() for scoped overlay
    dlg.show();

    const rect = panelEl.getBoundingClientRect();
    dlg.style.position = 'fixed';
    dlg.style.left = `${rect.left + rect.width / 2}px`;
    dlg.style.top = `${rect.top + rect.height / 2}px`;
    dlg.style.transform = 'translate(-50%, -50%)';
    dlg.style.margin = '0';
  } else {
    // Full-page modal with native backdrop
    dlg.showModal();
    // Reset to default centering
    dlg.style.position = '';
    dlg.style.left = '';
    dlg.style.top = '';
    dlg.style.transform = '';
    dlg.style.margin = '';
  }

  return dlg;
}

function closeDialog() {
  getDialog().close();
  // Remove custom overlay if it exists
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

/** Show a confirmation dialog, returns Promise<boolean> */
export function confirmDialog(title, message, panelEl = null) {
  return new Promise(resolve => {
    const dlg = openDialog(`
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Confirm</button>
      </div>
    `, panelEl);
    dlg.querySelector('#dlg-cancel').onclick = () => { closeDialog(); resolve(false); };
    dlg.querySelector('#dlg-ok').onclick = () => { closeDialog(); resolve(true); };
  });
}

/** Show an info dialog (OK button only), returns Promise<void> */
export function infoDialog(title, message, panelEl = null) {
  return new Promise(resolve => {
    const dlg = openDialog(`
      <h3>${title}</h3>
      <p>${message}</p>
      <div class="dialog-actions">
        <button id="dlg-ok" class="btn-primary">OK</button>
      </div>
    `, panelEl);
    dlg.querySelector('#dlg-ok').onclick = () => { closeDialog(); resolve(); };
  });
}

/** Show a rename dialog, returns Promise<string|null> */
export function renameDialog(currentName, panelEl = null) {
  return new Promise(resolve => {
    const dlg = openDialog(`
      <h3>Rename Panel</h3>
      <label>Name</label>
      <input id="dlg-name" type="text" value="${currentName}" autofocus>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Rename</button>
      </div>
    `, panelEl);
    dlg.querySelector('#dlg-cancel').onclick = () => { closeDialog(); resolve(null); };
    dlg.querySelector('#dlg-ok').onclick = () => {
      closeDialog();
      resolve(dlg.querySelector('#dlg-name').value.trim());
    };
    dlg.querySelector('#dlg-name').onkeydown = e => {
      if (e.key === 'Enter') dlg.querySelector('#dlg-ok').click();
    };
  });
}

/** Format props as "key=value" lines for textarea */
function propsToText(props) {
  return Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
}

/** Parse "key=value" lines from textarea */
function textToProps(text) {
  const props = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key) props[key] = val;
  }
  return props;
}

export function addNodeDialog(panel) {
  const dlg = openDialog(`
    <h3>Add Node</h3>
    <label>Label</label>
    <input id="dlg-label" type="text" placeholder="Node label" autofocus>
    <label>Properties (key=value per line)</label>
    <textarea id="dlg-props" placeholder="color=blue&#10;weight=5"></textarea>
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Add</button>
    </div>
  `, panel.panelEl);
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-ok').onclick = () => {
    const label = dlg.querySelector('#dlg-label').value.trim();
    if (!label) { showToast('Label required', 'error'); return; }
    const props = textToProps(dlg.querySelector('#dlg-props').value);
    panel.addNode(label, props);
    closeDialog();
  };
  dlg.querySelector('#dlg-label').onkeydown = e => {
    if (e.key === 'Enter') dlg.querySelector('#dlg-ok').click();
  };
}

export function addEdgeDialog(panel) {
  const labels = panel.graph.nodes.map(n => n.label);
  if (labels.length < 2) {
    showToast('Need at least 2 nodes to create an edge', 'error');
    return;
  }
  const options = labels.map(l => `<option value="${l}">${l}</option>`).join('');
  const dlg = openDialog(`
    <h3>Add Edge</h3>
    <label>Source</label>
    <select id="dlg-source">${options}</select>
    <label>Target</label>
    <select id="dlg-target">${options}</select>
    <label>Properties (key=value per line)</label>
    <textarea id="dlg-props" placeholder="weight=1"></textarea>
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Add</button>
    </div>
  `, panel.panelEl);
  if (labels.length > 1) dlg.querySelector('#dlg-target').value = labels[1];
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-ok').onclick = () => {
    const source = dlg.querySelector('#dlg-source').value;
    const target = dlg.querySelector('#dlg-target').value;
    if (source === target) { showToast('Source and target must differ', 'error'); return; }
    const props = textToProps(dlg.querySelector('#dlg-props').value);
    panel.addEdge(source, target, props);
    closeDialog();
  };
}

export function editSelectedDialog(panel) {
  const selected = panel.cy.$(':selected');
  if (selected.empty()) {
    showToast('Nothing selected', 'info');
    return;
  }
  const ele = selected[0];

  if (ele.isNode()) {
    const label = ele.data('label');
    const node = panel.graph.nodes.find(n => n.label === label);
    if (!node) return;

    const dlg = openDialog(`
      <h3>Edit Node: ${label}</h3>
      <label>Properties (key=value per line)</label>
      <textarea id="dlg-props">${propsToText(node.props)}</textarea>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Save</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-cancel').onclick = closeDialog;
    dlg.querySelector('#dlg-ok').onclick = () => {
      panel.updateNodeProps(label, textToProps(dlg.querySelector('#dlg-props').value));
      closeDialog();
    };
  } else {
    const source = ele.data('source');
    const target = ele.data('target');
    const edge = panel.graph.edges.find(e => e.source === source && e.target === target);
    if (!edge) return;

    const dlg = openDialog(`
      <h3>Edit Edge: ${source} → ${target}</h3>
      <label>Properties (key=value per line)</label>
      <textarea id="dlg-props">${propsToText(edge.props)}</textarea>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Save</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-cancel').onclick = closeDialog;
    dlg.querySelector('#dlg-ok').onclick = () => {
      panel.updateEdgeProps(source, target, textToProps(dlg.querySelector('#dlg-props').value));
      closeDialog();
    };
  }
}

export async function importGraphDialog(panel) {
  const result = await importFromFile();
  if (!result.ok) {
    showToast(result.error, 'error');
    return;
  }
  const direction = `import → ${panel.id}`;
  const mergeResult = panel.receiveMerge(result.graph, direction);
  if (mergeResult.ok) {
    showToast('Graph imported', 'success');
  } else {
    showToast(mergeResult.error, 'error');
  }
}

/** Show changelog dialog - pending changes or approval history */
export function changelogDialog(panel) {
  // Mode A: Pending Changes (panel has baseGraph and is not clean)
  if (panel.baseGraph && !panel.isClean()) {
    const diffs = computeDiff(panel.baseGraph, panel.graph);

    let diffListHtml = '<div class="changelog-list">';
    for (const diff of diffs) {
      const actionSymbol = diff.action === 'added' ? '+' : diff.action === 'removed' ? '-' : '~';
      const actionClass = `diff-${diff.action}`;
      const typeLabel = diff.type === 'node' ? 'Node' : 'Edge';
      const itemLabel = diff.type === 'node' ? `"${diff.key}"` : `"${diff.key}"`;

      let detailsHtml = '';
      if (diff.action === 'modified' && diff.changes) {
        const changes = diff.changes.map(c => `${c.key}: ${c.oldValue} → ${c.newValue}`).join(', ');
        detailsHtml = `<div style="font-size: 10px; color: var(--text-muted); margin-left: 20px;">${changes}</div>`;
      }

      diffListHtml += `
        <div class="changelog-entry ${actionClass}">
          <span style="font-weight: bold;">${actionSymbol}</span>
          <span>${typeLabel} ${itemLabel}</span>
        </div>
        ${detailsHtml}
      `;
    }
    diffListHtml += '</div>';

    const dlg = openDialog(`
      <h3>Pending Changes</h3>
      ${diffListHtml}
      <div class="dialog-actions">
        <button id="dlg-close" class="btn-primary">Close</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-close').onclick = closeDialog;
    return;
  }

  // Mode B: Approval History
  const history = panel._approvalHistory || [];

  if (history.length === 0) {
    const dlg = openDialog(`
      <h3>Approval History</h3>
      <p style="color: var(--text-muted); text-align: center; padding: 20px;">No history yet.</p>
      <div class="dialog-actions">
        <button id="dlg-close" class="btn-primary">Close</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-close').onclick = closeDialog;
    return;
  }

  let historyListHtml = '<div class="changelog-list">';
  // Show newest first
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const timestamp = new Date(entry.timestamp);
    const timeStr = timestamp.toLocaleTimeString();
    const num = i + 1;

    historyListHtml += `
      <div class="changelog-entry" style="display: flex; align-items: center; justify-content: space-between; padding: 8px;">
        <span style="font-family: 'Courier New', monospace; font-size: 11px;">
          #${num} ${timeStr} <span style="color: var(--text-muted);">${entry.diffSummary}</span>
        </span>
        <button class="btn-preview" data-index="${i}" style="font-size: 11px; padding: 4px 8px;">Preview</button>
      </div>
    `;
  }
  historyListHtml += '</div>';

  const dlg = openDialog(`
    <h3>Approval History</h3>
    ${historyListHtml}
    <div class="dialog-actions">
      <button id="dlg-close" class="btn-primary">Close</button>
    </div>
  `, panel.panelEl);

  // Wire preview buttons
  dlg.querySelectorAll('.btn-preview').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      const entry = history[index];
      const timestamp = new Date(entry.timestamp);
      const title = `Approval #${index + 1} — ${timestamp.toLocaleTimeString()}`;
      closeDialog();
      graphPreviewDialog(entry.graph, title, panel.panelEl);
    };
  });

  dlg.querySelector('#dlg-close').onclick = closeDialog;
}

/** Show a readonly graph preview in a modal */
export function graphPreviewDialog(graph, title, panelEl) {
  const dlg = openDialog(`
    <h3>${title}</h3>
    <div class="preview-canvas" id="preview-canvas"></div>
    <div class="dialog-actions">
      <button id="dlg-close" class="btn-primary">Close</button>
    </div>
  `, panelEl);

  // Set larger dialog size
  dlg.style.minWidth = '400px';
  dlg.style.minHeight = '350px';
  dlg.style.maxWidth = '80vw';
  dlg.style.maxHeight = '80vh';

  const canvasEl = dlg.querySelector('#preview-canvas');

  // Create temporary Cytoscape instance
  const elements = [];
  for (const node of graph.nodes) {
    elements.push({
      group: 'nodes',
      data: { id: node.label, label: node.label },
    });
  }
  for (const edge of graph.edges) {
    elements.push({
      group: 'edges',
      data: { id: `${edge.source}→${edge.target}`, source: edge.source, target: edge.target },
    });
  }

  const cy = cytoscape({
    container: canvasEl,
    elements,
    style: baseStyles,
    layout: { name: 'fcose', animate: false, fit: true, padding: 20 },
    autoungrabify: true, // Readonly: nodes can't be dragged
    userZoomingEnabled: true,
    userPanningEnabled: true,
  });

  dlg.querySelector('#dlg-close').onclick = () => {
    cy.destroy();
    closeDialog();
  };
}
