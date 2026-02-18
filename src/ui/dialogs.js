import { showToast } from './toast.js';
import { importFromFile } from '../graph/serializer.js';
import { computeDiff } from '../graph/diff.js';
import { formatDiffSummary, formatGroupedDiffSummary } from './panel.js';
import cytoscape from 'cytoscape';
import { baseStyles } from '../cytoscape/styles.js';
import { GRAPH_TYPES, defaultTemplate } from '../graph/template.js';
import { deepClone } from '../graph/model.js';
import { serializeTag as pathSerializeTag, formatPathTag as pathFormatTag } from '../graph/path-tracking.js';

// Remember last-used types across dialogs
let _lastNodeType = null;
let _lastEdgeType = null;

/** Parse batch node label input: "A, B, C" or "P1-5" or mixed */
function expandNodeLabels(input) {
  const labels = [];
  for (const part of input.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(.+?)(\d+)-(\d+)$/);
    if (rangeMatch) {
      const [, prefix, startStr, endStr] = rangeMatch;
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (start <= end && end - start < 100) {
        for (let i = start; i <= end; i++) labels.push(`${prefix}${i}`);
        continue;
      }
    }
    labels.push(trimmed);
  }
  return labels;
}

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

export function openDialog(html, panelEl = null) {
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
    // Full-page modal with native backdrop — clear any leftover panel-scoped styles first
    dlg.style.position = '';
    dlg.style.left = '';
    dlg.style.top = '';
    dlg.style.transform = '';
    dlg.style.margin = '';
    dlg.showModal();
  }

  return dlg;
}

export function closeDialog() {
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
  const validLastType = hasTypes && template.nodeTypes.some(nt => nt.id === _lastNodeType) ? _lastNodeType : null;
  const typeSelect = hasTypes
    ? `<label>Type</label>
    <select id="dlg-type">
      ${template.nodeTypes.map(nt => `<option value="${nt.id}" ${(validLastType || template.nodeTypes[0]?.id) === nt.id ? 'selected' : ''}>${nt.label}</option>`).join('')}
    </select>`
    : '';
  const dlg = openDialog(`
    <h3>Add Node</h3>
    <label>Label</label>
    <input id="dlg-label" type="text" placeholder="Node label (or A,B,C or P1-5)" autofocus>
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
    const raw = dlg.querySelector('#dlg-label').value;
    const nodeLabels = expandNodeLabels(raw);
    if (nodeLabels.length === 0) { showToast('Label required', 'error'); return; }
    const props = textToProps(dlg.querySelector('#dlg-props').value);
    const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : null;
    if (hasTypes) _lastNodeType = type;
    for (const label of nodeLabels) panel.addNode(label, props, type);
    if (nodeLabels.length > 1) showToast(`Added ${nodeLabels.length} nodes`, 'success');
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
  const validLastEdgeType = hasTypes && template.edgeTypes.some(et => et.id === _lastEdgeType) ? _lastEdgeType : null;
  const typeSelect = hasTypes
    ? `<label>Type</label>
    <select id="dlg-type">
      ${template.edgeTypes.map(et => `<option value="${et.id}" ${(validLastEdgeType || template.edgeTypes[0]?.id) === et.id ? 'selected' : ''}>${et.label}</option>`).join('')}
    </select>`
    : '';
  const datalistOptions = labels.map(l => `<option value="${l}">`).join('');
  const dlg = openDialog(`
    <h3>Add Edge</h3>
    <datalist id="dlg-node-list">${datalistOptions}</datalist>
    <label>${sourceLabel}</label>
    <input id="dlg-source" list="dlg-node-list" placeholder="Start typing..." autocomplete="off">
    <label>${targetLabel}</label>
    <input id="dlg-target" list="dlg-node-list" placeholder="Start typing..." autocomplete="off">
    ${typeSelect}
    <label>Properties (key=value per line)</label>
    <textarea id="dlg-props" placeholder="weight=1"></textarea>
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Add</button>
    </div>
  `, panel.panelEl);
  dlg.querySelector('#dlg-source').value = labels[0];
  if (labels.length > 1) dlg.querySelector('#dlg-target').value = labels[1];
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-ok').onclick = () => {
    const source = dlg.querySelector('#dlg-source').value.trim();
    const target = dlg.querySelector('#dlg-target').value.trim();
    if (!labels.includes(source)) { showToast(`Node "${source}" not found`, 'error'); return; }
    if (!labels.includes(target)) { showToast(`Node "${target}" not found`, 'error'); return; }
    if (source === target) { showToast('Source and target must differ', 'error'); return; }
    const props = textToProps(dlg.querySelector('#dlg-props').value);
    const type = hasTypes ? (dlg.querySelector('#dlg-type').value || null) : null;
    if (hasTypes) _lastEdgeType = type;
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

/** Edit the session template (node types + edge types + specialTypes). Calls onSave(newTemplate) on confirm. */
export function editTemplateDialog(template, onSave, isSessionTemplate = false) {
  // Work on a local clone so Cancel does nothing
  let local = deepClone(template);
  if (!local.specialTypes) local.specialTypes = [];

  const isDAG = local.graphType === 'DAG';

  const renderRows = (types, kind) => types.map(t => {
    const placeholder = kind === 'node' ? 'Node Type' : 'Edge Type';
    const deleteBtn = isSessionTemplate ? '' : `<button class="btn-delete-type" data-id="${t.id}" data-kind="${kind}" title="Delete">✕</button>`;
    return `
    <div class="type-row" data-id="${t.id}" data-kind="${kind}">
      <input type="text" class="type-label-input" value="${t.label}" placeholder="${placeholder}">
      <input type="color" class="type-color-input" value="${t.color || '#4fc3f7'}">
      ${deleteBtn}
    </div>
  `;
  }).join('');

  const renderSpecialTypes = () => {
    if (!isDAG || local.nodeTypes.length === 0) return '';
    const locked = isSessionTemplate;
    const lockedNote = locked ? '<em style="font-size:10px;color:var(--text-muted)">Cannot change for active session</em>' : '';
    const items = local.nodeTypes.map((nt, idx) => {
      const isSelected = local.specialTypes.includes(nt.id);
      const upDisabled = (idx === 0 || !isSelected || locked) ? 'disabled' : '';
      const downDisabled = (idx === local.nodeTypes.length - 1 || !isSelected || locked) ? 'disabled' : '';
      return `
        <div class="special-type-item">
          <input type="checkbox" class="special-type-cb" data-id="${nt.id}" ${isSelected ? 'checked' : ''} ${locked ? 'disabled' : ''}>
          <span style="flex:1">${nt.label}</span>
          <button class="st-up" data-id="${nt.id}" ${upDisabled} title="Move up in order">↑</button>
          <button class="st-down" data-id="${nt.id}" ${downDisabled} title="Move down in order">↓</button>
        </div>
      `;
    }).join('');
    return `
      <div class="special-types-section">
        <div class="template-section-label">Path Tracking Types ${lockedNote}</div>
        <p style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Select node types used as anchors for path tracking (order matters).</p>
        <div id="special-types-list">${items}</div>
      </div>
    `;
  };

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
    ${isSessionTemplate ? '' : '<button id="add-node-type" class="btn-secondary btn-add-type">+ Add Node Type</button>'}
    <div class="template-section-label">Edge Types</div>
    <div id="edge-types-list">${renderRows(local.edgeTypes, 'edge')}</div>
    ${isSessionTemplate ? '' : '<button id="add-edge-type" class="btn-secondary btn-add-type">+ Add Edge Type</button>'}
    ${renderSpecialTypes()}
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Save</button>
    </div>
  `;

  const wireFocusSelect = () => {
    dlg.querySelectorAll('.type-label-input').forEach(input => {
      input.addEventListener('focus', () => input.select());
    });
  };

  const dlg = openDialog(buildHtml());
  dlg.classList.add('dialog-wide');
  wireFocusSelect();

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
    // Collect special type selections before re-render
    if (isDAG && !isSessionTemplate) {
      local.specialTypes = [];
      dlg.querySelectorAll('.special-type-cb:checked').forEach(cb => {
        local.specialTypes.push(cb.dataset.id);
      });
    }
    dlg.querySelector('#node-types-list').innerHTML = renderRows(local.nodeTypes, 'node');
    dlg.querySelector('#edge-types-list').innerHTML = renderRows(local.edgeTypes, 'edge');
    const stSection = dlg.querySelector('.special-types-section');
    if (stSection) stSection.outerHTML = renderSpecialTypes();
    wireDeleteBtns();
    wireSpecialTypeBtns();
    wireFocusSelect();
  };

  const wireDeleteBtns = () => {
    dlg.querySelectorAll('.btn-delete-type').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const kind = btn.dataset.kind;
        if (kind === 'node') {
          local.nodeTypes = local.nodeTypes.filter(t => t.id !== id);
          local.specialTypes = local.specialTypes.filter(stId => stId !== id);
        } else {
          local.edgeTypes = local.edgeTypes.filter(t => t.id !== id);
        }
        rerender();
      };
    });
  };

  const wireSpecialTypeBtns = () => {
    if (!isDAG || isSessionTemplate) return;
    dlg.querySelectorAll('.st-up').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const idx = local.specialTypes.indexOf(id);
        if (idx > 0) {
          [local.specialTypes[idx - 1], local.specialTypes[idx]] = [local.specialTypes[idx], local.specialTypes[idx - 1]];
          rerender();
        }
      };
    });
    dlg.querySelectorAll('.st-down').forEach(btn => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        const idx = local.specialTypes.indexOf(id);
        if (idx !== -1 && idx < local.specialTypes.length - 1) {
          [local.specialTypes[idx], local.specialTypes[idx + 1]] = [local.specialTypes[idx + 1], local.specialTypes[idx]];
          rerender();
        }
      };
    });
    dlg.querySelectorAll('.special-type-cb').forEach(cb => {
      cb.onchange = () => {
        const id = cb.dataset.id;
        if (cb.checked) {
          if (!local.specialTypes.includes(id)) local.specialTypes.push(id);
        } else {
          local.specialTypes = local.specialTypes.filter(stId => stId !== id);
        }
        rerender();
      };
    });
  };

  wireDeleteBtns();
  wireSpecialTypeBtns();

  if (!isSessionTemplate) {
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
  }

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
    // Collect special type selections
    if (isDAG && !isSessionTemplate) {
      local.specialTypes = [];
      dlg.querySelectorAll('.special-type-cb:checked').forEach(cb => {
        local.specialTypes.push(cb.dataset.id);
      });
    }
    onSave(local);
    showToast('Template saved', 'success');
  };

  dlg.querySelector('#dlg-ok').onclick = collectAndSave;
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-close-x').onclick = closeDialog;
}

/** Show exclusion management dialog for a specific edge */
export function exclusionDialog(panel, edgeKey) {
  const panelEl = panel.panelEl;
  if (!panel.pathTrackingEnabled || !panel._pathTags) return;

  const template = panel.template;
  const specialTypes = template?.specialTypes || [];
  const tags = panel._pathTags.get(edgeKey) || [];
  const effectiveExcluded = panel._effectiveExclusions?.get(edgeKey) || new Set();
  const directExcluded = new Set(panel.exclusions[edgeKey] || []);

  if (tags.length === 0) {
    showToast('No path tags on this edge', 'info');
    return;
  }

  const _serializeTag = (tag) => pathSerializeTag(tag, specialTypes);
  const _formatPathTag = (tag) => pathFormatTag(tag, specialTypes, template?.nodeTypes || []);

  const rows = tags.map(tag => {
    const serialized = _serializeTag(tag);
    const isDirectExcluded = directExcluded.has(serialized);
    const isPropagated = effectiveExcluded.has(serialized) && !isDirectExcluded;
    const isExcluded = isDirectExcluded || isPropagated;
    const label = _formatPathTag(tag);
    const propagatedNote = isPropagated ? ' <em style="font-size:10px;color:var(--text-muted)">(inherited)</em>' : '';
    return `
      <div class="exclusion-item ${isPropagated ? 'propagated' : ''}">
        <input type="checkbox" class="excl-cb" data-tag="${serialized}" data-propagated="${isPropagated}" ${isExcluded ? '' : 'checked'} title="${isPropagated ? 'Propagated from downstream — uncheck to add direct exclusion' : ''}">
        <span>${label}${propagatedNote}</span>
      </div>
    `;
  }).join('');

  const [src, tgt] = edgeKey.split('→');
  const dlg = openDialog(`
    <div class="dialog-header">
      <h3>Exclusions: ${src} → ${tgt}</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Checked = included in tracking. Uncheck to exclude a path.</p>
    <div class="exclusion-list">${rows}</div>
    <div class="dialog-actions">
      <button id="dlg-cancel">Cancel</button>
      <button id="dlg-ok" class="btn-primary">Apply</button>
    </div>
  `, panelEl);

  dlg.querySelector('#dlg-ok').onclick = () => {
    const checkboxes = dlg.querySelectorAll('.excl-cb');
    checkboxes.forEach(cb => {
      const serialized = cb.dataset.tag;
      const included = cb.checked;
      const wasDirectExcluded = directExcluded.has(serialized);
      if (!included && !wasDirectExcluded) {
        panel.excludePathTag(edgeKey, serialized);
      } else if (included && wasDirectExcluded) {
        panel.includePathTag(edgeKey, serialized);
      }
    });
    closeDialog();
  };
  dlg.querySelector('#dlg-cancel').onclick = closeDialog;
  dlg.querySelector('#dlg-close-x').onclick = closeDialog;
}

/** Show panel options dialog (layout algorithm + path tracking) */
export function panelOptionsDialog(panel) {
  const panelEl = panel.panelEl;
  const algos = [
    { value: 'fcose', label: 'Force-Directed (fcose)' },
    { value: 'circle', label: 'Circle' },
    { value: 'concentric', label: 'Concentric' },
    { value: 'breadthfirst', label: 'Breadth-First' },
    { value: 'grid', label: 'Grid' },
  ];
  const options = algos.map(a =>
    `<option value="${a.value}" ${panel.layoutAlgorithm === a.value ? 'selected' : ''}>${a.label}</option>`
  ).join('');

  const template = panel.template;
  const isDAG = template?.graphType === 'DAG';
  const hasSpecialTypes = isDAG && (template?.specialTypes?.length > 0);
  const trackingHtml = isDAG ? `
    <div class="template-section-label" style="margin-top:12px">Path Tracking</div>
    ${!hasSpecialTypes ? '<p style="font-size:11px;color:var(--text-muted)">No special types configured in template. Edit the template to add special types for DAG path tracking.</p>' : `
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
      <input type="checkbox" id="dlg-tracking" ${panel.pathTrackingEnabled ? 'checked' : ''}>
      Enable path tracking
    </label>
    `}
  ` : '';

  const dlg = openDialog(`
    <div class="dialog-header">
      <h3>Panel Options</h3>
      <button id="dlg-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
    </div>
    <label>Layout Algorithm</label>
    <select id="dlg-layout-algo">${options}</select>
    ${trackingHtml}
    <div class="dialog-actions">
      <button id="dlg-ok" class="btn-primary">Apply</button>
    </div>
  `, panelEl);

  dlg.querySelector('#dlg-ok').onclick = () => {
    const algo = dlg.querySelector('#dlg-layout-algo').value;
    panel.setLayoutAlgorithm(algo);
    if (hasSpecialTypes) {
      const enabled = dlg.querySelector('#dlg-tracking')?.checked || false;
      if (enabled !== panel.pathTrackingEnabled) panel.setPathTracking(enabled);
    }
    showToast('Options applied', 'success');
    closeDialog();
  };
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
