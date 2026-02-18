import { addNodeDialog, addEdgeDialog, editSelectedDialog, confirmDialog, exclusionDialog } from './dialogs.js';
import { serializeTag as pathSerializeTag, formatPathTag as pathFormatTag } from '../graph/path-tracking.js';
import {
  copyFromPanel,
  pasteToPanel,
  copyBranch,
  pasteBranchToNode,
  clearClipboard,
  getClipboardState,
} from './clipboard.js';

let menuEl = null;

function getMenu() {
  if (!menuEl) {
    menuEl = document.createElement('div');
    menuEl.className = 'context-menu';
    menuEl.style.display = 'none';
    document.body.appendChild(menuEl);

    // Close on click outside
    document.addEventListener('click', e => {
      if (!menuEl.contains(e.target)) hide();
    });
    // Close on tap outside (touch)
    document.addEventListener('touchstart', e => {
      if (!menuEl.contains(e.target)) hide();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hide();
    });
  }
  return menuEl;
}

function show(x, y, items) {
  const menu = getMenu();
  menu.innerHTML = '';

  for (const item of items) {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'context-menu-separator';
      menu.appendChild(sep);
      continue;
    }

    const btn = document.createElement('button');
    btn.className = 'context-menu-item';
    if (item.disabled) btn.className += ' context-menu-item-disabled';
    btn.textContent = item.label;
    if (!item.disabled) {
      btn.onclick = () => {
        hide();
        item.action();
      };
    }
    menu.appendChild(btn);
  }

  menu.style.display = 'block';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  // Keep menu within viewport
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  });
}

function hide() {
  if (menuEl) menuEl.style.display = 'none';
}

/** Extract client coordinates from mouse or touch event */
function getEventCoords(e) {
  // Unwrap Cytoscape event wrapper first
  const ev = e.originalEvent || e;
  // Touch event (touches for ongoing, changedTouches for touchend)
  if (ev.touches && ev.touches.length > 0) {
    return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  if (ev.changedTouches && ev.changedTouches.length > 0) {
    return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
  }
  // Mouse event
  return { x: ev.clientX || 0, y: ev.clientY || 0 };
}

/** Build menu items for canvas (empty) context */
function buildCanvasMenu(panel) {
  const items = [
    { label: 'Add Node', action: () => addNodeDialog(panel) },
    { label: 'Add Edge', action: () => addEdgeDialog(panel) },
  ];

  const selected = panel.cy.$(':selected');
  const clipState = getClipboardState();

  // Copy/Paste section
  if (!selected.empty() || clipState.hasContent) {
    items.push({ separator: true });
    if (!selected.empty()) {
      items.push({
        label: `Copy Selected (${selected.length})`,
        action: () => copyFromPanel(panel.id),
      });
    }
    if (clipState.hasContent) {
      items.push({
        label: `Paste (${clipState.nodeCount}n, ${clipState.edgeCount}e)`,
        action: async () => {
          const confirmed = await confirmDialog(
            'Paste Confirmation',
            `Paste ${clipState.nodeCount} node(s) and ${clipState.edgeCount} edge(s)?${clipState.mode === 'branch' ? `\nBranch root: "${clipState.branchRoot}"` : ''}`,
            panel.panelEl
          );
          if (confirmed) pasteToPanel(panel.id);
        },
      });
      items.push({
        label: 'Cancel Copy',
        action: () => clearClipboard(),
      });
    }
  }

  // Delete section
  if (!selected.empty()) {
    items.push({ separator: true });
    items.push({
      label: `Delete Selected (${selected.length})`,
      action: () => panel.deleteSelected((title, msg) => confirmDialog(title, msg, panel.panelEl)),
    });
  }

  // Select section
  items.push({ separator: true });
  items.push({
    label: 'Select All',
    action: () => panel.cy.elements().select(),
  });
  if (!selected.empty()) {
    items.push({
      label: 'Deselect All',
      action: () => panel.cy.elements().unselect(),
    });
  }

  return items;
}

/** Build menu items for node context */
function buildNodeMenu(panel, node) {
  const label = node.data('label');
  const clipState = getClipboardState();

  const items = [
    {
      label: `Edit Node "${label}"`,
      action: () => {
        panel.cy.elements().unselect();
        node.select();
        editSelectedDialog(panel);
      },
    },
    {
      label: `Delete Node "${label}"`,
      action: () => {
        panel.cy.elements().unselect();
        node.select();
        panel.deleteSelected((title, msg) => confirmDialog(title, msg, panel.panelEl));
      },
    },
  ];

  // Path tracking: "Include All Paths" for fully excluded nodes
  if (panel.pathTrackingEnabled && node.hasClass('node-fully-excluded')) {
    items.push({ separator: true });
    items.push({
      label: 'Include All Paths',
      action: () => {
        // Remove exclusions from all outgoing edges of this node
        const outgoing = panel.graph.edges.filter(e => e.source === label);
        for (const edge of outgoing) {
          const key = `${edge.source}→${edge.target}`;
          if (panel.exclusions[key]) {
            const tags = [...(panel.exclusions[key] || [])];
            for (const tag of tags) panel.includePathTag(key, tag);
          }
        }
      },
    });
  }

  // Branch copy/paste section
  items.push({ separator: true });
  items.push({
    label: `Select Branch from "${label}"`,
    action: () => panel.selectBranch(label),
  });
  items.push({
    label: `Copy Branch from "${label}"`,
    action: () => copyBranch(panel.id, label),
  });
  if (clipState.hasContent && clipState.mode === 'branch') {
    items.push({
      label: `Paste Branch onto "${label}"`,
      action: async () => {
        const linkingEdge = clipState.branchRoot !== label ? `\nWill create edge: ${clipState.branchRoot} → ${label}` : '';
        const confirmed = await confirmDialog(
          'Paste Branch Confirmation',
          `Paste branch from "${clipState.branchRoot}" (${clipState.nodeCount}n, ${clipState.edgeCount}e)?${linkingEdge}`,
          panel.panelEl
        );
        if (confirmed) pasteBranchToNode(panel.id, label);
      },
    });
  }
  if (clipState.hasContent) {
    items.push({
      label: 'Cancel Copy',
      action: () => clearClipboard(),
    });
  }

  return items;
}

/** Build menu items for edge context */
function buildEdgeMenu(panel, edge) {
  const src = edge.data('source');
  const tgt = edge.data('target');
  const edgeKey = `${src}→${tgt}`;

  const items = [
    {
      label: `Edit Edge "${src} -> ${tgt}"`,
      action: () => {
        panel.cy.elements().unselect();
        edge.select();
        editSelectedDialog(panel);
      },
    },
    {
      label: `Delete Edge "${src} -> ${tgt}"`,
      action: () => {
        panel.cy.elements().unselect();
        edge.select();
        panel.deleteSelected((title, msg) => confirmDialog(title, msg, panel.panelEl));
      },
    },
  ];

  // Path tracking exclusion toggles
  if (panel.pathTrackingEnabled && panel._pathTags) {
    const specialTypes = panel.template?.specialTypes || [];
    const tags = panel._pathTags.get(edgeKey) || [];
    const effectiveExcluded = panel._effectiveExclusions?.get(edgeKey) || new Set();
    const directExcluded = new Set(panel.exclusions[edgeKey] || []);

    if (tags.length > 0) {
      items.push({ separator: true });

      const serTag = (tag) => pathSerializeTag(tag, specialTypes);
      const fmtTag = (tag) => pathFormatTag(tag, specialTypes, panel.template?.nodeTypes || []);

      // Show up to 3 individual tag toggles; if more, show dialog
      if (tags.length <= 3) {
        for (const tag of tags) {
          const serialized = serTag(tag);
          const isDirect = directExcluded.has(serialized);
          const isPropagated = effectiveExcluded.has(serialized) && !isDirect;
          const label = fmtTag(tag);
          if (isDirect) {
            items.push({
              label: `Include ${label}`,
              action: () => panel.includePathTag(edgeKey, serialized),
            });
          } else if (isPropagated) {
            items.push({
              label: `Excluded ${label} ↑ (from source edge)`,
              disabled: true,
              action: () => {},
            });
          } else {
            items.push({
              label: `Exclude ${label}`,
              action: () => panel.excludePathTag(edgeKey, serialized),
            });
          }
        }
      } else {
        items.push({
          label: 'Manage Exclusions...',
          action: () => exclusionDialog(panel, edgeKey),
        });
      }
    }
  }

  return items;
}

/** Wire context menu onto a Panel instance */
export function setupContextMenu(panel) {
  // Prevent native context menu on canvas
  panel.container.addEventListener('contextmenu', e => e.preventDefault());

  // Canvas context menu (right-click or long-press)
  const onCanvasContext = e => {
    if (e.target !== panel.cy) return;
    const coords = getEventCoords(e);
    show(coords.x, coords.y, buildCanvasMenu(panel));
  };

  panel.cy.on('cxttap', onCanvasContext);
  panel.cy.on('taphold', onCanvasContext);

  // Node context menu (right-click or long-press)
  const onNodeContext = e => {
    const node = e.target;
    if (node.hasClass('diff-removed')) return;
    const coords = getEventCoords(e);
    show(coords.x, coords.y, buildNodeMenu(panel, node));
  };

  panel.cy.on('cxttap', 'node', onNodeContext);
  panel.cy.on('taphold', 'node', onNodeContext);

  // Edge context menu (right-click or long-press)
  const onEdgeContext = e => {
    const edge = e.target;
    if (edge.hasClass('diff-removed')) return;
    const coords = getEventCoords(e);
    show(coords.x, coords.y, buildEdgeMenu(panel, edge));
  };

  panel.cy.on('cxttap', 'edge', onEdgeContext);
  panel.cy.on('taphold', 'edge', onEdgeContext);
}
