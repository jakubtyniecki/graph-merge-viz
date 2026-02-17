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
    this._zoomSavedStates = new Map();
  }

  /** Initialize with default 2-panel split (vertical on wide, horizontal on narrow) */
  init() {
    const direction = window.innerWidth <= 600 ? 'h' : 'v';
    this.tree = {
      type: 'split',
      direction,
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

  /** Add a new panel (to the right on wide screens, below on narrow) */
  addPanel() {
    const newId = String(this.nextId++);
    const direction = window.innerWidth <= 600 ? 'h' : 'v';
    this.tree = {
      type: 'split',
      direction,
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
        // Save non-zoomed panel states for later restoration
        for (const id of oldPanelIds) {
          if (id !== this._zoomedPanelId && savedStates.has(id)) {
            this._zoomSavedStates.set(id, savedStates.get(id));
          }
        }

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

    // Normal mode: restore any previously saved zoom states
    for (const [id, state] of this._zoomSavedStates) {
      if (!savedStates.has(id)) {
        savedStates.set(id, state);
      }
    }
    this._zoomSavedStates.clear();

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
        <span class="panel-split-group">
          <button class="panel-split-btn" data-split="v" title="Split this panel into two side-by-side panels">&#x2194;</button>
          <button class="panel-split-btn" data-split="h" title="Split this panel into two stacked panels">&#x2195;</button>
        </span>
        <span class="panel-window-group">
          <button class="panel-zoom-btn" title="Toggle full-screen zoom on this panel (Escape to exit)">&#x2922;</button>
          <button class="panel-close-btn" title="Close this panel and remove it from the layout">&#x2715;</button>
        </span>
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

    // Diff overlay (summary of changes)
    const diffOverlay = document.createElement('div');
    diffOverlay.className = 'diff-overlay';
    diffOverlay.dataset.panelDiff = node.id;
    canvas.appendChild(diffOverlay);

    panel.appendChild(canvas);

    // Action bar
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    actions.innerHTML = `
      <span class="panel-actions-left">
        <button data-action="add-node" class="btn-add" title="Add a new labeled node to the graph"><span class="btn-label">+ Node</span><span class="btn-icon-only">+N</span></button>
        <button data-action="add-edge" class="btn-add" title="Add a new directed edge between two existing nodes"><span class="btn-label">+ Edge</span><span class="btn-icon-only">+E</span></button>
        <span class="action-separator"></span>
        <button data-action="approve" class="btn-approve" title="Snapshot current state as baseline and clear all diffs"><span class="btn-label">Approve</span><span class="btn-icon-only">&#x2713;</span></button>
        <button data-action="restore" class="btn-restore" title="Revert graph to last approved state (undo all changes since approval)"><span class="btn-label">Restore</span><span class="btn-icon-only">&#x238C;</span></button>
        <span class="action-separator"></span>
        <button data-action="clear" class="btn-clear" title="Reset panel to empty state (clears graph, approval history, and diffs)"><span class="btn-label">Clear</span><span class="btn-icon-only">&#x232B;</span></button>
      </span>
      <span class="panel-actions-right">
        <button data-action="changeset" class="btn-icon" title="View pending changeset summary">&#x24D8;</button>
        <button data-action="changelog" class="btn-icon" title="View approval history">&#x2630;</button>
        <button data-action="refresh" class="btn-icon" title="Re-layout and resize the graph canvas">&#x21BB;</button>
        <span class="action-separator"></span>
        <button data-action="undo" class="btn-icon" title="Undo last graph operation (Ctrl+Z)">&#x21B6;</button>
        <button data-action="redo" class="btn-icon" title="Redo last undone operation (Ctrl+Shift+Z)">&#x21B7;</button>
        <span class="action-separator"></span>
        <button data-action="import" class="btn-icon" title="Import graph from a JSON file">&#x21A5;</button>
        <button data-action="export" class="btn-icon" title="Export current graph as a JSON file">&#x21A7;</button>
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

    // Apply sizes via flex-grow (proportional distribution)
    child0.style.flex = `${node.sizes[0]} 1 0`;
    child0.style.overflow = 'hidden';
    child0.style.display = 'flex';
    child0.style.minWidth = '0';
    child0.style.minHeight = '0';

    child1.style.flex = `${node.sizes[1]} 1 0`;
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

  /** Build merge gutter with zone-overlap buttons and resize handle */
  _renderMergeGutter(splitNode) {
    const isVertical = splitNode.direction === 'v';
    const gutter = document.createElement('div');
    gutter.className = 'merge-gutter';

    const leftZones = this._getZones(splitNode.children[0], splitNode.direction, 'first');
    const rightZones = this._getZones(splitNode.children[1], splitNode.direction, 'second');

    // Convert zones to offset ranges
    const toRanges = zones => {
      let offset = 0;
      return zones.map(z => {
        const range = { start: offset, end: offset + z.size, panels: z.panels, slot: z.slot };
        offset += z.size;
        return range;
      });
    };

    const leftRanges = toRanges(leftZones);
    const rightRanges = toRanges(rightZones);

    // Collect all breakpoints and create segments
    const breakpoints = new Set([0, 100]);
    for (const r of [...leftRanges, ...rightRanges]) {
      breakpoints.add(r.start);
      breakpoints.add(r.end);
    }
    const sorted = [...breakpoints].sort((a, b) => a - b);

    const findZone = (ranges, mid) => ranges.find(r => r.start <= mid && mid < r.end);

    const pushArrow = isVertical ? '\u25B6\u25B6' : '\u25BC\u25BC';
    const pullArrow = isVertical ? '\u25C0\u25C0' : '\u25B2\u25B2';

    for (let i = 0; i < sorted.length - 1; i++) {
      const segStart = sorted[i];
      const segEnd = sorted[i + 1];
      const segMid = (segStart + segEnd) / 2;

      const leftZone = findZone(leftRanges, segMid);
      const rightZone = findZone(rightRanges, segMid);
      if (!leftZone || !rightZone) continue;

      // Skip corner pairings: if both zones have non-null slots that don't match
      if (leftZone.slot !== null && rightZone.slot !== null && leftZone.slot !== rightZone.slot) {
        continue;
      }

      const zoneEl = document.createElement('div');
      zoneEl.className = 'merge-zone';
      if (isVertical) {
        zoneEl.style.top = `${segStart}%`;
        zoneEl.style.height = `${segEnd - segStart}%`;
      } else {
        zoneEl.style.left = `${segStart}%`;
        zoneEl.style.width = `${segEnd - segStart}%`;
      }

      // Only pair panels from overlapping zones
      for (const leftPanel of leftZone.panels) {
        for (const rightPanel of rightZone.panels) {
          // Push: left → right
          const pushBtn = document.createElement('button');
          pushBtn.className = 'merge-btn';
          pushBtn.textContent = `${leftPanel.name} ${pushArrow} ${rightPanel.name}`;
          pushBtn.title = `Push ${leftPanel.name} graph into ${rightPanel.name}. Source must be approved first.`;
          pushBtn.dataset.mergeSource = leftPanel.id;
          pushBtn.dataset.mergeTarget = rightPanel.id;
          pushBtn.onclick = () => this.onMerge(leftPanel.id, rightPanel.id);
          zoneEl.appendChild(pushBtn);

          // Pull: right → left
          const pullBtn = document.createElement('button');
          pullBtn.className = 'merge-btn';
          pullBtn.textContent = `${leftPanel.name} ${pullArrow} ${rightPanel.name}`;
          pullBtn.title = `Pull ${rightPanel.name} graph into ${leftPanel.name}. Source must be approved first.`;
          pullBtn.dataset.mergeSource = rightPanel.id;
          pullBtn.dataset.mergeTarget = leftPanel.id;
          pullBtn.onclick = () => this.onMerge(rightPanel.id, leftPanel.id);
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
   *  Returns array of { panels: [{id, name}], size: number, slot: number|null }
   *  @param {LayoutNode} childNode - The node to get zones from
   *  @param {string} gutterDirection - Direction of the gutter ('v' or 'h')
   *  @param {string} side - Which side of the gutter this node is on ('first' or 'second')
   */
  _getZones(childNode, gutterDirection, side) {
    if (childNode.type === 'panel') {
      return [{ panels: [{ id: childNode.id, name: this._panelName(childNode) }], size: 100, slot: null }];
    }

    const perpendicularDir = gutterDirection === 'v' ? 'h' : 'v';

    if (childNode.direction === perpendicularDir) {
      // Children split perpendicular to gutter → separate zones, scaled by split ratios
      // Assign slots to prevent corner pairings
      const zone0 = this._getZones(childNode.children[0], gutterDirection, side);
      const zone1 = this._getZones(childNode.children[1], gutterDirection, side);
      return [
        ...zone0.map(z => ({ panels: z.panels, size: z.size * childNode.sizes[0] / 100, slot: z.slot !== null ? z.slot : 0 })),
        ...zone1.map(z => ({ panels: z.panels, size: z.size * childNode.sizes[1] / 100, slot: z.slot !== null ? z.slot : 1 })),
      ];
    }

    // Children split parallel to gutter → only boundary child is adjacent
    const boundaryChild = side === 'first' ? childNode.children[1] : childNode.children[0];
    return this._getZones(boundaryChild, gutterDirection, side);
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

    // Shared resize logic for both mouse and touch
    const startResize = (initialClientPos) => {
      const parent = gutterEl.parentElement;
      if (!parent) return null;

      const parentRect = parent.getBoundingClientRect();
      const totalSize = isVertical ? parentRect.width : parentRect.height;
      const gutterSize = isVertical ? gutterEl.offsetWidth : gutterEl.offsetHeight;

      const onMove = (clientPos) => {
        const pos = isVertical
          ? clientPos.x - parentRect.left
          : clientPos.y - parentRect.top;

        const available = totalSize - gutterSize;
        let ratio = pos / totalSize;
        ratio = Math.max(MIN_PANEL_SIZE_PX / totalSize, Math.min(1 - MIN_PANEL_SIZE_PX / totalSize, ratio));

        splitNode.sizes[0] = ratio * 100;
        splitNode.sizes[1] = (1 - ratio) * 100;

        // Update flex-grow of children
        const children = parent.querySelectorAll(':scope > .panel, :scope > .split-v, :scope > .split-h');
        if (children.length >= 2) {
          children[0].style.flex = `${splitNode.sizes[0]} 1 0`;
          children[children.length - 1].style.flex = `${splitNode.sizes[1]} 1 0`;
        }
      };

      const onEnd = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        // Refresh layouts for affected panels after resize
        if (this._onResizeEnd) {
          this._onResizeEnd(splitNode);
        }
      };

      document.body.style.cursor = isVertical ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      return { onMove, onEnd };
    };

    // Mouse events
    handle.addEventListener('mousedown', e => {
      e.preventDefault();
      const resize = startResize({ x: e.clientX, y: e.clientY });
      if (!resize) return;

      const onMouseMove = ev => resize.onMove({ x: ev.clientX, y: ev.clientY });
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        resize.onEnd();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Touch events
    handle.addEventListener('touchstart', e => {
      e.preventDefault();
      const touch = e.touches[0];
      const resize = startResize({ x: touch.clientX, y: touch.clientY });
      if (!resize) return;

      const onTouchMove = ev => {
        ev.preventDefault();
        const t = ev.touches[0];
        resize.onMove({ x: t.clientX, y: t.clientY });
      };

      const onTouchEnd = () => {
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchEnd);
        resize.onEnd();
      };

      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
      document.addEventListener('touchcancel', onTouchEnd);
    });
  }

  /** Update merge button colors based on source panel clean/dirty state */
  updateMergeButtonStates(panels) {
    this.rootEl.querySelectorAll('.merge-btn[data-merge-source]').forEach(btn => {
      const sourceId = btn.dataset.mergeSource;
      const panel = panels.get(sourceId);
      const isAllowed = panel ? panel.isClean() : true;
      btn.classList.toggle('merge-btn-allowed', isAllowed);
      btn.classList.toggle('merge-btn-blocked', !isAllowed);
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
