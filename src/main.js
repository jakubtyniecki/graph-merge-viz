import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Panel } from './ui/panel.js';
import { LayoutManager } from './ui/layout.js';
import { addNodeDialog, addEdgeDialog, importGraphDialog, confirmDialog, infoDialog, changelogDialog, changesetSummaryDialog, panelOptionsDialog } from './ui/dialogs.js';
import { setupSession, getSessionTemplate } from './ui/session.js';
import { setupClipboard } from './ui/clipboard.js';
import { setupContextMenu } from './ui/context-menu.js';
import { showToast } from './ui/toast.js';
import { setupStatusBar } from './ui/status-bar.js';
import { setupTemplateUI } from './ui/template-ui.js';

cytoscape.use(fcose);

const panels = new Map();

/** Propagate current session template to all panels */
function propagateTemplate(template) {
  for (const panel of panels.values()) {
    panel.setTemplate(template);
  }
}

const layoutManager = new LayoutManager(document.getElementById('app'), {
  onPanelCreate(id, canvasEl) {
    const template = getSessionTemplate();
    const panel = new Panel(id, canvasEl, template);
    panels.set(id, panel);
    setupContextMenu(panel);
  },

  onPanelDestroy(id) {
    const panel = panels.get(id);
    if (panel) {
      panel.cy.destroy();
      panels.delete(id);
    }
  },

  async onMerge(sourceId, targetId) {
    const source = panels.get(sourceId);
    const target = panels.get(targetId);
    if (!source || !target) return;

    if (source.baseGraph && !source.isClean()) {
      await infoDialog(
        'Merge Blocked',
        `Panel ${sourceId} has unapproved changes. Approve Panel ${sourceId} first, then merge.`,
        document.querySelector(`.panel[data-panel-id="${targetId}"]`)
      );
      return;
    }

    const direction = `${sourceId} → ${targetId}`;
    const strategy = layoutManager.mergeStrategies[`${sourceId}→${targetId}`] || 'mirror';
    const result = target.receiveMerge(source.getGraph(), direction, source.exclusions, source.pathTrackingEnabled, strategy);
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

  async confirmClose(id) {
    return await confirmDialog(
      'Close Panel?',
      `Close Panel ${id}? Graph data will be lost.`,
      document.querySelector(`.panel[data-panel-id="${id}"]`)
    );
  },

  onResizeEnd(splitNode) {
    const leftIds = layoutManager._allPanelIds(splitNode.children[0]);
    const rightIds = layoutManager._allPanelIds(splitNode.children[1]);
    for (const id of [...leftIds, ...rightIds]) {
      const panel = panels.get(id);
      if (panel && panel.cy) {
        panel.cy.resize();
        panel.cy.fit();
      }
    }
  },
});

// Wire action buttons via event delegation on #app
document.getElementById('app').addEventListener('click', async e => {
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
    case 'clear': {
      const confirmed = await confirmDialog(
        'Clear Panel?',
        `Reset Panel ${panelId} to empty state? This clears the graph, approval history, and all diffs.`,
        panelEl
      );
      if (confirmed) panel.clearGraph();
      break;
    }
    case 'approve': {
      const confirmed = await confirmDialog(
        'Approve Panel?',
        `This will set the current state of Panel ${panelId} as the baseline and clear all diffs.`,
        panelEl
      );
      if (confirmed) panel.approve();
      break;
    }
    case 'undo': panel.undo(); break;
    case 'redo': panel.redo(); break;
    case 'changeset': changesetSummaryDialog(panel); break;
    case 'changelog': changelogDialog(panel); break;
    case 'refresh':
      panel.cy.resize();
      panel._runLayout();
      panel._recomputePathTracking();
      break;
    case 'restore': {
      const confirmed = await confirmDialog(
        'Restore Panel?',
        `Restore Panel ${panelId} to last approved state? Current changes will be lost.`,
        panelEl
      );
      if (confirmed) panel.restoreFromApproved();
      break;
    }
    case 'import': importGraphDialog(panel); break;
    case 'export': panel.exportGraph(); break;
    case 'panel-options': panelOptionsDialog(panel); break;
  }
});

// Initialize default layout
layoutManager.init();

// Setup template UI (global templates in header)
setupTemplateUI();

// Setup session management with template change callback
setupSession(panels, layoutManager, (template) => {
  propagateTemplate(template);
});

setupClipboard(() => panels);
setupStatusBar();

// Initial merge button state update
requestAnimationFrame(() => layoutManager.updateMergeButtonStates(panels));

// Keyboard shortcuts
document.addEventListener('keydown', async e => {
  // Escape: un-zoom panel
  if (e.key === 'Escape' && layoutManager._zoomedPanelId) {
    layoutManager.toggleZoom(layoutManager._zoomedPanelId);
    return;
  }
  // Ctrl+Z / Cmd+Z: Undo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    const activePanel = Array.from(panels.values()).find(p => p.cy.container() === document.activeElement || p.cy.container().contains(document.activeElement));
    if (activePanel) {
      activePanel.undo();
    } else if (panels.size > 0) {
      panels.values().next().value.undo();
    }
  }
  // Ctrl+Shift+Z / Cmd+Shift+Z: Redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    const activePanel = Array.from(panels.values()).find(p => p.cy.container() === document.activeElement || p.cy.container().contains(document.activeElement));
    if (activePanel) {
      activePanel.redo();
    } else if (panels.size > 0) {
      panels.values().next().value.redo();
    }
  }
});

// Update merge button states on panel changes
const updateMergeStates = () => layoutManager.updateMergeButtonStates(panels);
window.addEventListener('panel-change', updateMergeStates);

// Expose for debugging
window.__panels = panels;
window.__layout = layoutManager;
