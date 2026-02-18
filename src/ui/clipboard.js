import { showToast } from './toast.js';
import { getAncestorSubgraph, createEdge } from '../graph/model.js';
import { confirmDialog } from './dialogs.js';

let _getPanels = null;
let _clipboard = null; // { nodes: [], edges: [] }
let _clipboardExclusions = {}; // { edgeKey: string[] }
let _focusedPanelId = null;
let _copyMode = null; // 'elements' | 'branch'
let _branchRoot = null; // label of root node for branch paste

export function setupClipboard(getPanels) {
  _getPanels = getPanels;

  // Track which panel is focused via event delegation on #app
  document.getElementById('app').addEventListener('mousedown', e => {
    const panelEl = e.target.closest('[data-panel-id]');
    if (panelEl) _focusedPanelId = panelEl.dataset.panelId;
  });

  document.addEventListener('keydown', e => {
    // Ignore if typing in input/textarea/dialog
    if (e.target.matches('input, textarea, select')) return;

    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      copySelected();
    } else if (e.ctrlKey && e.key === 'v') {
      e.preventDefault();
      pasteToFocused();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (_focusedPanelId) {
        const panel = _getPanels().get(_focusedPanelId);
        if (panel) panel.deleteSelected((title, msg) => confirmDialog(title, msg, panel.panelEl));
      }
    } else if (e.key === 'Escape') {
      if (_focusedPanelId) {
        const panel = _getPanels().get(_focusedPanelId);
        if (panel) panel.cy.elements().unselect();
      }
    }
  });
}

// === Exported functions (called by context-menu and keyboard shortcuts) ===

/** Copy selected elements from a panel */
export function copyFromPanel(panelId) {
  const panel = _getPanels().get(panelId);
  if (!panel) return;

  const subgraph = panel.getSelectedSubgraph();
  if (!subgraph || (subgraph.nodes.length === 0 && subgraph.edges.length === 0)) {
    showToast('Nothing selected to copy', 'info');
    return;
  }

  _clipboard = subgraph;
  _clipboardExclusions = panel.getRelevantExclusions(subgraph);
  _copyMode = 'elements';
  _branchRoot = null;
  showToast(`Copied ${subgraph.nodes.length} node(s), ${subgraph.edges.length} edge(s)`, 'success');
}

/** Paste clipboard to a panel */
export function pasteToPanel(panelId) {
  if (!_clipboard) {
    showToast('Clipboard is empty', 'info');
    return;
  }

  const panel = _getPanels().get(panelId);
  if (!panel) return;

  const sourcePanel = _getPanels().get(_focusedPanelId);
  const sourceTracked = sourcePanel ? sourcePanel.pathTrackingEnabled : false;
  const direction = `paste → ${panel.id}`;
  const result = panel.pasteSubgraph(_clipboard, direction, _clipboardExclusions, sourceTracked);
  if (result.ok) {
    showToast('Pasted subgraph', 'success');
  } else {
    showToast(result.error, 'error');
  }
}

/** Copy branch (root + ancestors) from a node */
export function copyBranch(panelId, nodeLabel) {
  const panel = _getPanels().get(panelId);
  if (!panel) return;

  const subgraph = getAncestorSubgraph(panel.graph, nodeLabel);
  if (subgraph.nodes.length === 0) {
    showToast('No ancestors found', 'info');
    return;
  }

  _clipboard = subgraph;
  _clipboardExclusions = panel.getRelevantExclusions(subgraph);
  _copyMode = 'branch';
  _branchRoot = nodeLabel;

  // Auto-select the branch to show what's being copied
  panel.selectBranch(nodeLabel);

  showToast(`Copied branch from "${nodeLabel}" (${subgraph.nodes.length} node(s), ${subgraph.edges.length} edge(s))`, 'success');
}

/** Paste branch onto a target node */
export function pasteBranchToNode(panelId, targetLabel) {
  if (!_clipboard || _copyMode !== 'branch' || !_branchRoot) {
    showToast('No branch in clipboard', 'info');
    return;
  }

  const panel = _getPanels().get(panelId);
  if (!panel) return;

  let mergeGraph = _clipboard;

  // If target is different from branch root, add linking edge
  if (targetLabel !== _branchRoot) {
    mergeGraph = {
      nodes: [..._clipboard.nodes],
      edges: [..._clipboard.edges, createEdge(_branchRoot, targetLabel)],
    };
  }

  const sourcePanel = _getPanels().get(_focusedPanelId);
  const sourceTracked = sourcePanel ? sourcePanel.pathTrackingEnabled : false;
  const direction = `branch paste → ${targetLabel}`;
  const result = panel.pasteSubgraph(mergeGraph, direction, _clipboardExclusions, sourceTracked);
  if (result.ok) {
    if (targetLabel === _branchRoot) {
      showToast('Pasted branch (no linking edge)', 'success');
    } else {
      showToast(`Pasted branch with edge ${_branchRoot} → ${targetLabel}`, 'success');
    }
  } else {
    showToast(result.error, 'error');
  }
}

/** Clear clipboard */
export function clearClipboard() {
  _clipboard = null;
  _clipboardExclusions = {};
  _copyMode = null;
  _branchRoot = null;
  showToast('Clipboard cleared', 'info');
}

/** Get clipboard state for UI decisions */
export function getClipboardState() {
  if (!_clipboard) {
    return { hasContent: false };
  }
  return {
    hasContent: true,
    mode: _copyMode,
    branchRoot: _branchRoot,
    nodeCount: _clipboard.nodes.length,
    edgeCount: _clipboard.edges.length,
  };
}

// === Internal functions (for keyboard shortcuts) ===

function copySelected() {
  if (!_focusedPanelId) {
    showToast('Click a panel first', 'info');
    return;
  }
  copyFromPanel(_focusedPanelId);
}

function pasteToFocused() {
  if (!_focusedPanelId) {
    showToast('Click a panel first', 'info');
    return;
  }
  pasteToPanel(_focusedPanelId);
}
