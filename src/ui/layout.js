/**
 * LayoutManager - Recursive split tree for dynamic panel layout.
 *
 * LayoutNode =
 *   | { type: "panel", id: string, name?: string }
 *   | { type: "split", direction: "h" | "v", children: [LayoutNode, LayoutNode], sizes: [number, number] }
 */

import { renameDialog } from './dialogs.js';

const MIN_PANEL_SIZE_PX = 200;

export class LayoutManager {
  constructor(rootEl, { onPanelCreate, onPanelDestroy, onMerge, getState, setState, confirmClose, onResizeEnd }) {
    this.rootEl = rootEl;
    this.onPanelCreate = onPanelCreate;
    this.onPanelDestroy = onPanelDestroy;
    this.onMerge = onMerge;
    this._getState = getState || null;
    this._setState = setState || null;
    this._confirmClose = confirmClose || null;
    this._onResizeEnd = onResizeEnd || null;
    this.nextId = 1;
    this.tree = null;
    this._zoomedPanelId = null;
  }

  /** Initialize with default 2-panel vertical split */
  init() {
    this.tree = {
      type: 'split',
      direction: 'v',
      children: [
        { type: 'panel', id: String(this.nextId++) },
        { type: 'panel', id: String(this.nextId++) },
      ],
      sizes: [50, 50],
    };
    this.render();
  }

  /** Get layout for serialization */
  getLayout() {
    return { tree: this.tree, nextId: this.nextId };
  }

  /** Restore layout from saved data */
  setLayout(layout) {
    this.tree = layout.tree;
    this.nextId = layout.nextId;
    this.render();
  }

  /** Get all panel IDs in the tree */
  getAllPanelIds() {
    const ids = [];
    const walk = node => {
      if (node.type === 'panel') ids.push(node.id);
      else node.children.forEach(walk);
    };
    if (this.tree) walk(this.tree);
    return ids;
  }

  /** Split a panel into two */
  splitPanel(panelId, direction) {
    const newId = String(this.nextId++);
    const oldNode = this._findPanelNode(this.tree, panelId);
    this.tree = this._mapTree(this.tree, node => {
      if (node.type === 'panel' && node.id === panelId) {
        return {
          type: 'split',
          direction,
          children: [
            { type: 'panel', id: panelId, name: oldNode?.name },
            { type: 'panel', id: newId },
          ],
          sizes: [50, 50],
        };
      }
      return node;
    });
    this.render();
    return newId;
  }

  /** Close a panel — promote its sibling */
  closePanel(panelId) {
    if (this.getAllPanelIds().length <= 1) return;

    if (this._zoomedPanelId === panelId) {
      this._zoomedPanelId = null;
    }

    this.tree = this._removePanel(this.tree, panelId);
    this.render();
  }

  /** Add a new panel to the right of the root split */
  addPanel() {
    const newId = String(this.nextId++);
    this.tree = {
      type: 'split',
      direction: 'v',
      children: [this.tree, { type: 'panel', id: newId }],
      sizes: [70, 30],
    };
    this.render();
    return newId;
  }

  /** Toggle zoom on a panel (tmux-style) */
  toggleZoom(panelId) {
    if (this._zoomedPanelId === panelId) {
      this._zoomedPanelId = null;
    } else {
      this._zoomedPanelId = panelId;
    }
    this.render();
  }

  /** Render the full layout tree into rootEl.
   *  Saves panel states, destroys all panels, rebuilds DOM, re-creates panels. */
  render() {
    // Save states of existing panels before destroying
    const savedStates = new Map();
    const oldPanelIds = new Set();
    this.rootEl.querySelectorAll('.panel-canvas').forEach(el => {
      oldPanelIds.add(el.dataset.panel);
    });

    // Collect states before destroy
    for (const id of oldPanelIds) {
      if (this._getState) {
        const state = this._getState(id);
        if (state) savedStates.set(id, state);
      }
    }

    // Destroy all existing panels
    for (const id of oldPanelIds) {
      this.onPanelDestroy(id);
    }

    this.rootEl.innerHTML = '';
    if (!this.tree) return;

    // Zoomed mode: render only the zoomed panel
    if (this._zoomedPanelId) {
      const zoomedNode = this._findPanelNode(this.tree, this._zoomedPanelId);
      if (zoomedNode) {
        const panelDom = this._renderPanel(zoomedNode);
        panelDom.style.flex = '1';
        panelDom.classList.add('zoomed');
        this.rootEl.appendChild(panelDom);

        // Create only the zoomed panel
        const canvasEl = panelDom.querySelector('.panel-canvas');
        this.onPanelCreate(this._zoomedPanelId, canvasEl);
        if (savedStates.has(this._zoomedPanelId) && this._setState) {
          this._setState(this._zoomedPanelId, savedStates.get(this._zoomedPanelId));
        }
        return;
      }
      // Zoomed panel not found — fall through to normal render
      this._zoomedPanelId = null;
    }

    const rootDom = this._renderNode(this.tree);
    rootDom.style.flex = '1';
    rootDom.style.display = 'flex';
    rootDom.style.minWidth = '0';
    rootDom.style.minHeight = '0';
    this.rootEl.appendChild(rootDom);

    // Create all panels
    for (const id of this.getAllPanelIds()) {
      const canvasEl = this.rootEl.querySelector(`.panel-canvas[data-panel="${id}"]`);
      if (canvasEl) {
        this.onPanelCreate(id, canvasEl);
        if (savedStates.has(id) && this._setState) {
          this._setState(id, savedStates.get(id));
        }
      }
    }
  }

  /** Build DOM for a tree node */
  _renderNode(node) {
    if (node.type === 'panel') return this._renderPanel(node);
    return this._renderSplit(node);
  }

  /** Build DOM for a panel leaf */
  _renderPanel(node) {
    const displayName = node.name || `Panel ${node.id}`;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset.panelId = node.id;

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <span class="panel-name" title="Click to rename">${displayName}</span>
      <span class="panel-info"></span>
      <span class="panel-header-btns">
        <button class="panel-zoom-btn" title="Zoom (toggle)">&#x2922;</button>
        <button class="panel-split-btn" data-split="v" title="Split side by side">&#x2194;</button>
        <button class="panel-split-btn" data-split="h" title="Split top/bottom">&#x2195;</button>
        <button class="panel-close-btn" title="Close panel">&#x2715;</button>
      </span>
    `;
    panel.appendChild(header);

    // Wire header buttons
    const nameEl = header.querySelector('.panel-name');
    nameEl.style.cursor = 'pointer';
    nameEl.onclick = () => {
      renameDialog(displayName, panel).then(newName => {
        if (newName !== null) {
          node.name = newName || undefined;
          nameEl.textContent = newName || `Panel ${node.id}`;
          // Update merge gutter labels by re-rendering
          this.render();
        }
      });
    };

    header.querySelector('.panel-zoom-btn').onclick = () => this.toggleZoom(node.id);
    header.querySelector('[data-split="v"]').onclick = () => this.splitPanel(node.id, 'v');
    header.querySelector('[data-split="h"]').onclick = () => this.splitPanel(node.id, 'h');
    header.querySelector('.panel-close-btn').onclick = async () => {
      if (this._confirmClose) {
        const confirmed = await this._confirmClose(node.id);
        if (!confirmed) return;
      }
      this.closePanel(node.id);
    };

    // Canvas
    const canvas = document.createElement('div');
    canvas.className = 'panel-canvas';
    canvas.dataset.panel = node.id;
    panel.appendChild(canvas);

    // Action bar
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    actions.innerHTML = `
      <button data-action="add-node" class="btn-add">+ Node</button>
      <button data-action="add-edge" class="btn-add">+ Edge</button>
      <button data-action="edit" class="btn-edit">Edit</button>
      <button data-action="delete" class="btn-delete">Delete</button>
      <button data-action="clear" class="btn-clear">Clear</button>
      <button data-action="approve" class="btn-approve">Approve</button>
      <span class="panel-actions-right">
        <button data-action="undo" class="btn-icon" title="Undo (Ctrl+Z)">&#x21B6;</button>
        <button data-action="redo" class="btn-icon" title="Redo (Ctrl+Shift+Z)">&#x21B7;</button>
        <button data-action="restore" class="btn-restore" title="Restore to approved state">Restore</button>
        <button data-action="import" class="btn-icon" title="Import graph">&#x1F4E5;</button>
        <button data-action="export" class="btn-icon" title="Export graph">&#x1F4E4;</button>
      </span>
    `;
    panel.appendChild(actions);

    return panel;
  }

  /** Build DOM for a split node */
  _renderSplit(node) {
    const isVertical = node.direction === 'v';
    const container = document.createElement('div');
    container.className = isVertical ? 'split-v' : 'split-h';

    const child0 = this._renderNode(node.children[0]);
    const child1 = this._renderNode(node.children[1]);

    // Apply sizes via flex-basis
    child0.style.flex = `0 0 calc(${node.sizes[0]}% - 28px)`;
    child0.style.overflow = 'hidden';
    child0.style.display = 'flex';
    child0.style.minWidth = '0';
    child0.style.minHeight = '0';

    child1.style.flex = `0 0 calc(${node.sizes[1]}% - 28px)`;
    child1.style.overflow = 'hidden';
    child1.style.display = 'flex';
    child1.style.minWidth = '0';
    child1.style.minHeight = '0';

    // Merge gutter between children
    const gutter = this._renderMergeGutter(node);

    container.appendChild(child0);
    container.appendChild(gutter);
    container.appendChild(child1);

    return container;
  }

  /** Get the display name for a panel node */
  _panelName(node) {
    return node.name || `Panel ${node.id}`;
  }

  /** Build merge gutter with zone-based directional buttons and resize handle */
  _renderMergeGutter(splitNode) {
    const isVertical = splitNode.direction === 'v';
    const gutter = document.createElement('div');
    gutter.className = 'merge-gutter';

    const leftZones = this._getZones(splitNode.children[0], splitNode.direction);
    const rightZones = this._getZones(splitNode.children[1], splitNode.direction);

    // Use the side with more zones to drive the layout
    const useLeftZones = leftZones.length >= rightZones.length;
    const primaryZones = useLeftZones ? leftZones : rightZones;
    const otherChild = useLeftZones ? splitNode.children[1] : splitNode.children[0];
    const otherIds = this._allPanelIds(otherChild);

    const pushArrow = isVertical ? '>>' : '\u25BC\u25BC';
    const pullArrow = isVertical ? '<<' : '\u25B2\u25B2';

    for (const zone of primaryZones) {
      const zoneEl = document.createElement('div');
      zoneEl.className = 'merge-zone';
      zoneEl.style.flex = `0 0 ${zone.size}%`;

      for (const primary of zone.panels) {
        for (const otherId of otherIds) {
          const otherNode = this._findPanelNode(this.tree, otherId);
          const [leftId, rightId] = useLeftZones
            ? [primary.id, otherId]
            : [otherId, primary.id];
          const [leftName, rightName] = useLeftZones
            ? [primary.name, this._panelName(otherNode)]
            : [this._panelName(otherNode), primary.name];

          // Push button: left → right
          const pushBtn = document.createElement('button');
          pushBtn.className = 'merge-btn merge-btn-push';
          pushBtn.textContent = `${leftName} ${pushArrow} ${rightName}`;
          pushBtn.title = `Push ${leftName} \u2192 ${rightName}`;
          pushBtn.onclick = () => this.onMerge(leftId, rightId);
          zoneEl.appendChild(pushBtn);

          // Pull button: right → left
          const pullBtn = document.createElement('button');
          pullBtn.className = 'merge-btn merge-btn-pull';
          pullBtn.textContent = `${leftName} ${pullArrow} ${rightName}`;
          pullBtn.title = `Pull ${rightName} \u2192 ${leftName}`;
          pullBtn.onclick = () => this.onMerge(rightId, leftId);
          zoneEl.appendChild(pullBtn);
        }
      }

      gutter.appendChild(zoneEl);
    }

    // Resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    this._setupResize(handle, splitNode, gutter);
    gutter.appendChild(handle);

    return gutter;
  }

  /** Get zones for merge button alignment.
   *  Returns array of { panels: [{id, name}], size: number } */
  _getZones(childNode, gutterDirection) {
    if (childNode.type === 'panel') {
      return [{ panels: [{ id: childNode.id, name: this._panelName(childNode) }], size: 100 }];
    }

    const perpendicularDir = gutterDirection === 'v' ? 'h' : 'v';

    if (childNode.direction === perpendicularDir) {
      // Children split perpendicular to gutter → separate zones
      return [
        {
          panels: this._allPanelNodes(childNode.children[0]),
          size: childNode.sizes[0],
        },
        {
          panels: this._allPanelNodes(childNode.children[1]),
          size: childNode.sizes[1],
        },
      ];
    }

    // Children split parallel to gutter → one zone with all panels
    return [{ panels: this._allPanelNodes(childNode), size: 100 }];
  }

  /** Get all panel nodes from a subtree as [{id, name}] */
  _allPanelNodes(node) {
    if (node.type === 'panel') return [{ id: node.id, name: this._panelName(node) }];
    return [...this._allPanelNodes(node.children[0]), ...this._allPanelNodes(node.children[1])];
  }

  /** Find a panel node in the tree by id */
  _findPanelNode(node, panelId) {
    if (!node) return null;
    if (node.type === 'panel') return node.id === panelId ? node : null;
    return this._findPanelNode(node.children[0], panelId)
      || this._findPanelNode(node.children[1], panelId);
  }

  /** Get the first (leftmost/topmost) panel ID from a subtree */
  _firstPanelId(node) {
    if (node.type === 'panel') return node.id;
    return this._firstPanelId(node.children[0]);
  }

  /** Get all panel IDs from a subtree */
  _allPanelIds(node) {
    if (node.type === 'panel') return [node.id];
    return [...this._allPanelIds(node.children[0]), ...this._allPanelIds(node.children[1])];
  }

  /** Setup resize drag on a gutter handle */
  _setupResize(handle, splitNode, gutterEl) {
    const isVertical = splitNode.direction === 'v';

    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const parent = gutterEl.parentElement;
      if (!parent) return;

      const parentRect = parent.getBoundingClientRect();
      const totalSize = isVertical ? parentRect.width : parentRect.height;
      const gutterSize = isVertical ? gutterEl.offsetWidth : gutterEl.offsetHeight;

      const onMouseMove = ev => {
        const pos = isVertical
          ? ev.clientX - parentRect.left
          : ev.clientY - parentRect.top;

        const available = totalSize - gutterSize;
        let ratio = pos / totalSize;
        ratio = Math.max(MIN_PANEL_SIZE_PX / totalSize, Math.min(1 - MIN_PANEL_SIZE_PX / totalSize, ratio));

        splitNode.sizes[0] = ratio * 100;
        splitNode.sizes[1] = (1 - ratio) * 100;

        // Update flex-basis of children
        const children = parent.querySelectorAll(':scope > .panel, :scope > .split-v, :scope > .split-h');
        if (children.length >= 2) {
          children[0].style.flex = `0 0 calc(${splitNode.sizes[0]}% - 28px)`;
          children[children.length - 1].style.flex = `0 0 calc(${splitNode.sizes[1]}% - 28px)`;
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Refresh layouts for affected panels after resize
        if (this._onResizeEnd) {
          this._onResizeEnd(splitNode);
        }
      };

      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  /** Map over tree nodes, replacing matching ones */
  _mapTree(node, fn) {
    const mapped = fn(node);
    if (mapped !== node) return mapped;
    if (node.type === 'panel') return node;
    return {
      ...node,
      children: [
        this._mapTree(node.children[0], fn),
        this._mapTree(node.children[1], fn),
      ],
    };
  }

  /** Remove a panel from tree, returning promoted sibling.
   *  Does NOT call onPanelDestroy — render() handles that. */
  _removePanel(node, panelId) {
    if (node.type === 'panel') return node;

    // If one of our direct children is the target panel, promote the other
    if (node.children[0].type === 'panel' && node.children[0].id === panelId) {
      return node.children[1];
    }
    if (node.children[1].type === 'panel' && node.children[1].id === panelId) {
      return node.children[0];
    }

    // Recurse into children
    return {
      ...node,
      children: [
        this._removePanel(node.children[0], panelId),
        this._removePanel(node.children[1], panelId),
      ],
    };
  }
}
