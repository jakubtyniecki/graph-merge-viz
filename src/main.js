import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Panel } from './ui/panel.js';
import { LayoutManager } from './ui/layout.js';
import { addNodeDialog, addEdgeDialog, editSelectedDialog, importGraphDialog } from './ui/dialogs.js';
import { setupSession } from './ui/session.js';
import { setupClipboard } from './ui/clipboard.js';
import { showToast } from './ui/toast.js';

cytoscape.use(fcose);

const panels = new Map();

const layoutManager = new LayoutManager(document.getElementById('app'), {
  onPanelCreate(id, canvasEl) {
    const panel = new Panel(id, canvasEl);
    panels.set(id, panel);
  },

  onPanelDestroy(id) {
    const panel = panels.get(id);
    if (panel) {
      panel.cy.destroy();
      panels.delete(id);
    }
  },

  onMerge(sourceId, targetId) {
    const source = panels.get(sourceId);
    const target = panels.get(targetId);
    if (!source || !target) return;

    const direction = `${sourceId} → ${targetId}`;
    const result = target.receiveMerge(source.getGraph(), direction);
    if (result.ok) {
      showToast(`Pushed ${direction}`, 'success');
    } else {
      showToast(result.error, 'error');
    }
  },

  getState(id) {
    const panel = panels.get(id);
    return panel ? panel.getState() : null;
  },

  setState(id, state) {
    const panel = panels.get(id);
    if (panel) panel.setState(state);
  },
});

// Wire action buttons via event delegation on #app
document.getElementById('app').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const panelEl = btn.closest('.panel');
  if (!panelEl) return;

  const panelId = panelEl.dataset.panelId;
  const panel = panels.get(panelId);
  if (!panel) return;

  switch (btn.dataset.action) {
    case 'add-node': addNodeDialog(panel); break;
    case 'add-edge': addEdgeDialog(panel); break;
    case 'edit': editSelectedDialog(panel); break;
    case 'delete': panel.deleteSelected(); break;
    case 'clear': panel.clearGraph(); break;
    case 'approve': panel.approve(); break;
    case 'import': importGraphDialog(panel); break;
    case 'export': panel.exportGraph(); break;
  }
});

// Initialize default layout
layoutManager.init();

// Setup session management and clipboard
setupSession(panels, layoutManager);
setupClipboard(() => panels);

// Expose for debugging
window.__panels = panels;
window.__layout = layoutManager;
