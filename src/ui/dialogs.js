import { showToast } from './toast.js';
import { importFromFile } from '../graph/serializer.js';
import { computeDiff } from '../graph/diff.js';
import { formatDiffSummary, formatGroupedDiffSummary } from './panel.js';
import cytoscape from 'cytoscape';
import { baseStyles } from '../cytoscape/styles.js';
import { GRAPH_TYPES, defaultTemplate } from '../graph/template.js';
import { deepClone } from '../graph/model.js';

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
    dlg.style.transform = 'translate(-50%, -50%)';
    dlg.style.margin = '0';
    // Center on panel, clamped so dialog stays within viewport
    // Must set position first so offsetWidth/Height are valid
    dlg.style.left = `${rect.left + rect.width / 2}px`;
    dlg.style.top = `${rect.top + rect.height / 2}px`;
    requestAnimationFrame(() => {
      const dlgW = dlg.offsetWidth;
      const dlgH = dlg.offsetHeight;
      const rawLeft = rect.left + rect.width / 2;
      const rawTop = rect.top + rect.height / 2;
      const margin = 8;
      dlg.style.left = `${Math.max(dlgW / 2 + margin, Math.min(rawLeft, window.innerWidth - dlgW / 2 - margin))}px`;
      dlg.style.top = `${Math.max(dlgH / 2 + margin, Math.min(rawTop, window.innerHeight - dlgH / 2 - margin))}px`;
    });
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

/** Show an info dialog (✕ close only), returns Promise<void> */
export function infoDialog(title, message, panelEl = null) {
  return new Promise(resolve => {
    const dlg = openDialog(`
      <div class="dialog-header">
        <h3>${title}</h3>
        <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
      </div>
      <p>${message}</p>
    `, panelEl);
    dlg.querySelector('#dlg-close-x').onclick = () => { closeDialog(); resolve(); };
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
  const template = panel.template;
  const hasTypes = template?.nodeTypes?.length > 0;
  const typeSelect = hasTypes
    ? `<label>Type</label>
    <select id="dlg-type">
      <option value="">(no type)</option>
      ${template.nodeTypes.map(nt => `<option value="${nt.id}">${nt.label}</option>`).join('')}
    </select>`
    : '';
  const dlg = openDialog(`
    <h3>Add Node</h3>
    <label>Label</label>
    <input id="dlg-label" type="text" placeholder="Node label" autofocus>
    ${typeSelect}
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
    const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : null;
    panel.addNode(label, props, type);
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
  const template = panel.template;
  const typeInfo = GRAPH_TYPES[template?.graphType || 'DG'];
  const isUndirected = typeInfo && !typeInfo.directed;
  const sourceLabel = isUndirected ? 'Node A' : 'Source';
  const targetLabel = isUndirected ? 'Node B' : 'Target';
  const hasTypes = template?.edgeTypes?.length > 0;
  const typeSelect = hasTypes
    ? `<label>Type</label>
    <select id="dlg-type">
      <option value="">(no type)</option>
      ${template.edgeTypes.map(et => `<option value="${et.id}">${et.label}</option>`).join('')}
    </select>`
    : '';
  const options = labels.map(l => `<option value="${l}">${l}</option>`).join('');
  const dlg = openDialog(`
    <h3>Add Edge</h3>
    <label>${sourceLabel}</label>
    <select id="dlg-source">${options}</select>
    <label>${targetLabel}</label>
    <select id="dlg-target">${options}</select>
    ${typeSelect}
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
    const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : null;
    panel.addEdge(source, target, props, type);
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
  const template = panel.template;

  if (ele.isNode()) {
    const label = ele.data('label');
    const node = panel.graph.nodes.find(n => n.label === label);
    if (!node) return;

    const hasTypes = template?.nodeTypes?.length > 0;
    const typeSelect = hasTypes
      ? `<label>Type</label>
      <select id="dlg-type">
        <option value="">(no type)</option>
        ${template.nodeTypes.map(nt => `<option value="${nt.id}" ${node.type === nt.id ? 'selected' : ''}>${nt.label}</option>`).join('')}
      </select>`
      : '';
    const dlg = openDialog(`
      <h3>Edit Node: ${label}</h3>
      ${typeSelect}
      <label>Properties (key=value per line)</label>
      <textarea id="dlg-props">${propsToText(node.props)}</textarea>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Save</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-cancel').onclick = closeDialog;
    dlg.querySelector('#dlg-ok').onclick = () => {
      const props = textToProps(dlg.querySelector('#dlg-props').value);
      const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : undefined;
      panel.updateNodeProps(label, props, type);
      closeDialog();
    };
  } else {
    const source = ele.data('source');
    const target = ele.data('target');
    const edge = panel.graph.edges.find(e => e.source === source && e.target === target);
    if (!edge) return;

    const hasTypes = template?.edgeTypes?.length > 0;
    const typeSelect = hasTypes
      ? `<label>Type</label>
      <select id="dlg-type">
        <option value="">(no type)</option>
        ${template.edgeTypes.map(et => `<option value="${et.id}" ${edge.type === et.id ? 'selected' : ''}>${et.label}</option>`).join('')}
      </select>`
      : '';
    const dlg = openDialog(`
      <h3>Edit Edge: ${source} → ${target}</h3>
      ${typeSelect}
      <label>Properties (key=value per line)</label>
      <textarea id="dlg-props">${propsToText(edge.props)}</textarea>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Save</button>
      </div>
    `, panel.panelEl);
    dlg.querySelector('#dlg-cancel').onclick = closeDialog;
    dlg.querySelector('#dlg-ok').onclick = () => {
      const props = textToProps(dlg.querySelector('#dlg-props').value);
      const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : undefined;
      panel.updateEdgeProps(source, target, props, type);
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

/** Show changeset summary dialog — grouped summary of pending changes */
export function changesetSummaryDialog(panel) {
  if (!panel.baseGraph) {
    openDialog(`
      <div class="dialog-header">
        <h3>Changeset Summary</h3>
        <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
      </div>
      <p style="color: var(--text-muted); text-align: center; padding: 20px;">No baseline — approve first to track changes.</p>
    `, panel.panelEl).querySelector('#dlg-close-x').onclick = closeDialog;
    return;
  }

  const diffs = computeDiff(panel.baseGraph, panel.graph);
  const summaryText = formatGroupedDiffSummary(diffs);

  openDialog(`
    <div class="dialog-header">
      <h3>Changeset Summary</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    <p class="changeset-summary-text">${summaryText}</p>
  `, panel.panelEl).querySelector('#dlg-close-x').onclick = closeDialog;
}

/** Show changelog dialog — always shows approval history */
export function changelogDialog(panel) {
  const history = panel._approvalHistory || [];

  if (history.length === 0) {
    const dlg = openDialog(`
      <div class="dialog-header">
        <h3>Approval History</h3>
        <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
      </div>
      <p style="color: var(--text-muted); text-align: center; padding: 20px;">No approvals yet.</p>
    `, panel.panelEl);
    dlg.querySelector('#dlg-close-x').onclick = closeDialog;
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
    <div class="dialog-header">
      <h3>Approval History</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    ${historyListHtml}
  `, panel.panelEl);

  // Wire preview buttons
  dlg.querySelectorAll('.btn-preview').forEach(btn => {
    btn.onclick = () => {
      const index = parseInt(btn.dataset.index);
      const entry = history[index];
      closeDialog();
      approvalPreviewDialog(entry, index, panel);
    };
  });

  dlg.querySelector('#dlg-close-x').onclick = closeDialog;
}

/** Show enhanced approval preview with maximize/minimize and diff toggle */
export function approvalPreviewDialog(entry, index, panel) {
  const panelEl = panel.panelEl;
  const hasBaseline = entry.baseGraph !== null && entry.baseGraph !== undefined;
  const title = `Approval #${index + 1} — ${new Date(entry.timestamp).toLocaleTimeString()}`;

  const toggleDisabledAttr = hasBaseline ? '' : 'disabled title="No baseline available for this entry"';

  const dlg = openDialog(`
    <div class="preview-header">
      <h3 style="margin:0">${title}</h3>
      <div style="display:flex;gap:4px;align-items:center">
        <button id="preview-maximize" class="btn-icon" title="Maximize/minimize preview">&#x2922;</button>
        <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
      </div>
    </div>
    <div class="preview-canvas" id="preview-canvas"></div>
    <div class="preview-info-panel" id="preview-info-panel"></div>
    <div class="preview-footer">
      <button id="preview-info" class="btn-icon" title="Show grouped changeset summary for this approval">&#x24D8;</button>
      <div class="preview-toggle">
        <button id="toggle-approved" class="preview-toggle-btn active">Approved State</button>
        <button id="toggle-changeset" class="preview-toggle-btn" ${toggleDisabledAttr}>Changeset View</button>
      </div>
    </div>
  `, panelEl);

  // Default size
  dlg.style.minWidth = '420px';
  dlg.style.minHeight = '380px';
  dlg.style.maxWidth = '80vw';
  dlg.style.maxHeight = '80vh';

  const canvasEl = dlg.querySelector('#preview-canvas');
  const infoPanelEl = dlg.querySelector('#preview-info-panel');

  // Maximize toggle
  let maximized = false;
  dlg.querySelector('#preview-maximize').onclick = () => {
    maximized = !maximized;
    if (maximized) {
      dlg.style.width = 'calc(100vw - 40px)';
      dlg.style.height = 'calc(100vh - 40px)';
      dlg.style.maxWidth = 'none';
      dlg.style.maxHeight = 'none';
    } else {
      dlg.style.width = '';
      dlg.style.height = '';
      dlg.style.maxWidth = '80vw';
      dlg.style.maxHeight = '80vh';
    }
    if (!infoPanelEl.classList.contains('visible')) {
      cy.resize();
      cy.fit(undefined, 20);
    }
  };

  // Build elements for approved state (plain)
  const buildApprovedElements = () => {
    const elements = [];
    for (const node of entry.graph.nodes) {
      elements.push({ group: 'nodes', data: { id: node.label, label: node.label } });
    }
    for (const edge of entry.graph.edges) {
      elements.push({ group: 'edges', data: { id: `${edge.source}→${edge.target}`, source: edge.source, target: edge.target } });
    }
    return elements;
  };

  // Build elements for changeset view (diff-highlighted)
  const buildChangesetElements = () => {
    if (!hasBaseline) return buildApprovedElements();
    const diffs = computeDiff(entry.baseGraph, entry.graph);
    const diffMap = new Map(diffs.map(d => [d.key, d.action]));

    const elements = [];
    for (const node of entry.graph.nodes) {
      const action = diffMap.get(node.label) || null;
      elements.push({
        group: 'nodes',
        data: { id: node.label, label: node.label },
        classes: action ? `diff-${action}` : '',
      });
    }
    for (const edge of entry.graph.edges) {
      const key = `${edge.source}→${edge.target}`;
      const action = diffMap.get(key) || null;
      elements.push({
        group: 'edges',
        data: { id: key, source: edge.source, target: edge.target },
        classes: action ? `diff-${action}` : '',
      });
    }
    // Add ghost nodes/edges for removed elements
    if (entry.baseGraph) {
      const currentNodeLabels = new Set(entry.graph.nodes.map(n => n.label));
      const currentEdgeKeys = new Set(entry.graph.edges.map(e => `${e.source}→${e.target}`));
      for (const node of entry.baseGraph.nodes) {
        if (!currentNodeLabels.has(node.label)) {
          elements.push({ group: 'nodes', data: { id: node.label, label: node.label }, classes: 'diff-removed' });
        }
      }
      for (const edge of entry.baseGraph.edges) {
        const key = `${edge.source}→${edge.target}`;
        if (!currentEdgeKeys.has(key)) {
          const allNodes = new Set([...currentNodeLabels, ...entry.baseGraph.nodes.map(n => n.label)]);
          if (allNodes.has(edge.source) && allNodes.has(edge.target)) {
            elements.push({ group: 'edges', data: { id: key, source: edge.source, target: edge.target }, classes: 'diff-removed' });
          }
        }
      }
    }
    return elements;
  };

  const cy = cytoscape({
    container: canvasEl,
    elements: buildApprovedElements(),
    style: baseStyles,
    layout: { name: 'fcose', animate: false, fit: true, padding: 20 },
    autoungrabify: true,
    userZoomingEnabled: true,
    userPanningEnabled: true,
  });

  // Toggle buttons
  let currentMode = 'approved';
  const btnApproved = dlg.querySelector('#toggle-approved');
  const btnChangeset = dlg.querySelector('#toggle-changeset');

  const switchMode = (mode) => {
    if (mode === currentMode) return;
    currentMode = mode;
    btnApproved.classList.toggle('active', mode === 'approved');
    btnChangeset.classList.toggle('active', mode === 'changeset');

    cy.elements().remove();
    const newElements = mode === 'changeset' ? buildChangesetElements() : buildApprovedElements();
    cy.add(newElements);
    cy.layout({ name: 'fcose', animate: false, fit: true, padding: 20 }).run();
  };

  btnApproved.onclick = () => switchMode('approved');
  if (hasBaseline) {
    btnChangeset.onclick = () => switchMode('changeset');
  }

  // Footer info button — toggle inline info panel (avoids nested dialog layering bug)
  const infoBtn = dlg.querySelector('#preview-info');
  let infoVisible = false;
  infoBtn.onclick = () => {
    infoVisible = !infoVisible;
    if (infoVisible) {
      if (!hasBaseline) {
        infoPanelEl.innerHTML = `
          <p style="color: var(--text-muted); padding: 8px;">No baseline available for this approval entry.</p>
          <button id="info-back" style="margin-top:8px">&#x2190; Back</button>
        `;
      } else {
        const diffs = computeDiff(entry.baseGraph, entry.graph);
        const summaryText = formatGroupedDiffSummary(diffs);
        infoPanelEl.innerHTML = `
          <p class="changeset-summary-text">${summaryText}</p>
          <button id="info-back" style="margin-top:8px">&#x2190; Back</button>
        `;
      }
      infoPanelEl.classList.add('visible');
      canvasEl.style.display = 'none';
      infoPanelEl.querySelector('#info-back').onclick = () => {
        infoVisible = false;
        infoPanelEl.classList.remove('visible');
        canvasEl.style.display = '';
        cy.resize();
        cy.fit(undefined, 20);
      };
    } else {
      infoPanelEl.classList.remove('visible');
      canvasEl.style.display = '';
      cy.resize();
      cy.fit(undefined, 20);
    }
  };

  dlg.querySelector('#dlg-close-x').onclick = () => {
    cy.destroy();
    closeDialog();
  };
}

/** Generate a unique ID for node/edge types */
function genId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Edit the session template (node types + edge types). Calls onSave(newTemplate) on confirm. */
export function editTemplateDialog(template, onSave) {
  // Work on a local clone so Cancel does nothing
  let local = deepClone(template);

  const renderRows = (types, kind) => types.map(t => `
    <div class="type-row" data-id="${t.id}" data-kind="${kind}">
      <input type="text" class="type-label-input" value="${t.label}" placeholder="Type label">
      <input type="color" class="type-color-input" value="${t.color || '#4fc3f7'}">
      <button class="btn-delete-type" data-id="${t.id}" data-kind="${kind}" title="Delete">✕</button>
    </div>
  `).join('');

  const buildHtml = () => `
    <div class="dialog-header">
      <h3>Edit Template</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    <div class="template-graph-type-label">
      Graph Type: <strong>${GRAPH_TYPES[local.graphType]?.label || local.graphType}</strong>
    </div>
    <div class="template-section-label">Node Types</div>
    <div id="node-types-list">${renderRows(local.nodeTypes, 'node')}</div>
    <button id="add-node-type" class="btn-secondary btn-add-type">+ Add Node Type</button>
    <div class="template-section-label">Edge Types</div>
    <div id="edge-types-list">${renderRows(local.edgeTypes, 'edge')}</div>
    <button id="add-edge-type" class="btn-secondary btn-add-type">+ Add Edge Type</button>
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Save</button>
    </div>
  `;

  const dlg = openDialog(buildHtml());

  const rerender = () => {
    // Collect current input values before re-render
    dlg.querySelectorAll('.type-row').forEach(row => {
      const id = row.dataset.id;
      const kind = row.dataset.kind;
      const label = row.querySelector('.type-label-input')?.value ?? '';
      const color = row.querySelector('.type-color-input')?.value ?? '#4fc3f7';
      if (kind === 'node') {
        const t = local.nodeTypes.find(t => t.id === id);
        if (t) { t.label = label; t.color = color; }
      } else {
        const t = local.edgeTypes.find(t => t.id === id);
        if (t) { t.label = label; t.color = color; }
      }
    });
    dlg.querySelector('#node-types-list').innerHTML = renderRows(local.nodeTypes, 'node');
    dlg.querySelector('#edge-types-list').innerHTML = renderRows(local.edgeTypes, 'edge');
    wireDeleteBtns();
  };

  const wireDeleteBtns = () => {
    dlg.querySelectorAll('.btn-delete-type').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const kind = btn.dataset.kind;
        if (kind === 'node') local.nodeTypes = local.nodeTypes.filter(t => t.id !== id);
        else local.edgeTypes = local.edgeTypes.filter(t => t.id !== id);
        rerender();
      };
    });
  };

  wireDeleteBtns();

  dlg.querySelector('#add-node-type').onclick = () => {
    rerender();
    local.nodeTypes.push({ id: genId(), label: 'New Type', color: '#4fc3f7' });
    rerender();
  };

  dlg.querySelector('#add-edge-type').onclick = () => {
    rerender();
    local.edgeTypes.push({ id: genId(), label: 'New Type', color: '#5a6a8c' });
    rerender();
  };

  const collectAndSave = () => {
    dlg.querySelectorAll('.type-row').forEach(row => {
      const id = row.dataset.id;
      const kind = row.dataset.kind;
      const label = row.querySelector('.type-label-input')?.value?.trim() || 'Unnamed';
      const color = row.querySelector('.type-color-input')?.value ?? '#4fc3f7';
      if (kind === 'node') {
        const t = local.nodeTypes.find(t => t.id === id);
        if (t) { t.label = label; t.color = color; }
      } else {
        const t = local.edgeTypes.find(t => t.id === id);
        if (t) { t.label = label; t.color = color; }
      }
    });
    closeDialog();
    onSave(local);
  };

  dlg.querySelector('#dlg-ok').onclick = collectAndSave;
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-close-x').onclick = closeDialog;
}

/** Show a "New Session" dialog with name + template selection.
 *  Returns Promise<{ name: string, templateName: string } | null> */
export function newSessionDialog(globalTemplates) {
  const templateNames = Object.keys(globalTemplates);
  const templateOptions = templateNames.map(n => `<option value="${n}">${n}</option>`).join('');
  return new Promise(resolve => {
    const dlg = openDialog(`
      <h3>New Session</h3>
      <label>Session Name</label>
      <input id="dlg-name" type="text" placeholder="Session name" autofocus>
      <label>Template</label>
      <select id="dlg-template">${templateOptions}</select>
      <div class="dialog-actions">
        <button id="dlg-cancel">Cancel</button>
        <button id="dlg-ok" class="btn-primary">Create</button>
      </div>
    `);
    dlg.querySelector('#dlg-cancel').onclick = () => { closeDialog(); resolve(null); };
    dlg.querySelector('#dlg-ok').onclick = () => {
      const name = dlg.querySelector('#dlg-name').value.trim();
      if (!name) { showToast('Session name required', 'error'); return; }
      const templateName = dlg.querySelector('#dlg-template').value;
      closeDialog();
      resolve({ name, templateName });
    };
    dlg.querySelector('#dlg-name').onkeydown = e => {
      if (e.key === 'Enter') dlg.querySelector('#dlg-ok').click();
    };
  });
}
