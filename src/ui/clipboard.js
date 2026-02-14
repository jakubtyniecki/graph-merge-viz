import { showToast } from './toast.js';

let _getPanels = null;
let _clipboard = null; // { nodes: [], edges: [] }
let _focusedPanelId = null;

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
        if (panel) panel.deleteSelected();
      }
    } else if (e.key === 'Escape') {
      if (_focusedPanelId) {
        const panel = _getPanels().get(_focusedPanelId);
        if (panel) panel.cy.elements().unselect();
      }
    }
  });
}

function copySelected() {
  if (!_focusedPanelId) {
    showToast('Click a panel first', 'info');
    return;
  }
  const panel = _getPanels().get(_focusedPanelId);
  if (!panel) return;

  const subgraph = panel.getSelectedSubgraph();
  if (!subgraph || (subgraph.nodes.length === 0 && subgraph.edges.length === 0)) {
    showToast('Nothing selected to copy', 'info');
    return;
  }

  _clipboard = subgraph;
  showToast(`Copied ${subgraph.nodes.length} node(s), ${subgraph.edges.length} edge(s)`, 'success');
}

function pasteToFocused() {
  if (!_clipboard) {
    showToast('Clipboard is empty', 'info');
    return;
  }
  if (!_focusedPanelId) {
    showToast('Click a panel first', 'info');
    return;
  }

  const panel = _getPanels().get(_focusedPanelId);
  if (!panel) return;

  const direction = `paste → ${panel.id}`;
  const result = panel.receiveMerge(_clipboard, direction);
  if (result.ok) {
    showToast('Pasted subgraph', 'success');
  } else {
    showToast(result.error, 'error');
  }
}
