/**
 * LayoutManager - Recursive split tree for dynamic panel layout.
 *
 * LayoutNode =
 *   | { type: "panel", id: string, name?: string }
 *   | { type: "split", direction: "h" | "v", children: [LayoutNode, LayoutNode], sizes: [number, number] }
 */

import { renameDialog, infoDialog, scopeNodePickerDialog, addMergeButtonDialog, openDialog, closeDialog } from './dialogs.js';

const MIN_PANEL_SIZE_PX = 200;

export class LayoutManager {
  constructor(rootEl, { onPanelCreate, onPanelDestroy, onMerge, getState, setState, confirmClose, onResizeEnd, getPanels }) {
    this.rootEl = rootEl;
    this.onPanelCreate = onPanelCreate;
    this.onPanelDestroy = onPanelDestroy;
    this.onMerge = onMerge;
    this._getState = getState || null;
    this._setState = setState || null;
    this._confirmClose = confirmClose || null;
    this._onResizeEnd = onResizeEnd || null;
    this._getPanels = getPanels || null;
    this.nextId = 1;
    this.tree = null;
    this._zoomedPanelId = null;
    this._zoomSavedStates = new Map();
    this.mergeStrategies = {};
    this.mergeButtonLists = {};      // { gutterKey: [{source, target}, ...] }
    this._gutterSplitNodes = {};     // { gutterKey: splitNode } — runtime cache for targeted re-renders
  }

  /** Get strategy object for a key, with backward compat for string values */
  _getStrategy(key) {
    const val = this.mergeStrategies[key];
    if (!val) return { strategy: 'mirror', scopeNodes: [] };
    if (typeof val === 'string') return { strategy: val, scopeNodes: [] };
    return val;
  }

  /** Get badge text for a strategy name */
  _strategyBadge(strategy) {
    switch (strategy) {
      case 'push': return '(P)';
      case 'scoped': return '(S)';
      case 'none': return '(N)';
      default: return '(M)';
    }
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
    return { tree: this.tree, nextId: this.nextId, mergeStrategies: this.mergeStrategies, mergeButtonLists: this.mergeButtonLists };
  }

  /** Restore layout from saved data */
  setLayout(layout) {
    this.tree = layout.tree;
    this.nextId = layout.nextId;
    this.mergeStrategies = layout.mergeStrategies || {};
    this.mergeButtonLists = layout.mergeButtonLists || {};
    this.render();
  }

  getMergeStrategies() { return this.mergeStrategies; }
  setMergeStrategies(map) { this.mergeStrategies = map || {}; }

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

    // Clean up any merge button lists referencing the removed panel
    for (const key of Object.keys(this.mergeButtonLists)) {
      this.mergeButtonLists[key] = this.mergeButtonLists[key].filter(
        b => b.source !== panelId && b.target !== panelId
      );
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
      <span class="panel-header-left">
        <button data-action="panel-options" class="btn-icon btn-header-icon" title="Panel options">&#x2699;</button>
        <button data-action="refresh" class="btn-icon btn-header-icon" title="Re-layout">&#x21BB;</button>
        <span class="panel-header-sep"></span>
        <button data-action="undo" class="btn-icon btn-header-icon" title="Undo (Ctrl+Z)">&#x21B6;</button>
        <button data-action="redo" class="btn-icon btn-header-icon" title="Redo (Ctrl+Shift+Z)">&#x21B7;</button>
        <span class="processing-indicator" title="Processing...">&#x27F3;</span>
      </span>
      <span class="panel-info"></span>
      <span class="panel-header-right">
        <button class="panel-split-btn" data-split="v" title="Split this panel into two side-by-side panels">&#x2194;</button>
        <button class="panel-split-btn" data-split="h" title="Split this panel into two stacked panels">&#x2195;</button>
        <span class="panel-header-sep"></span>
        <button class="panel-zoom-btn" title="Toggle full-screen zoom on this panel (Escape to exit)">&#x2922;</button>
        <span class="panel-header-sep"></span>
        <button class="panel-close-btn" title="Close this panel and remove it from the layout">&#x2715;</button>
      </span>
    `;
    panel.appendChild(header);

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

    // Panel name overlay (top-left of canvas)
    const nameOverlay = document.createElement('div');
    nameOverlay.className = 'panel-name-overlay';
    nameOverlay.title = 'Click to rename';
    nameOverlay.textContent = displayName;
    nameOverlay.onclick = () => {
      renameDialog(displayName, panel).then(newName => {
        if (newName !== null) {
          node.name = newName || undefined;
          const newDisplay = newName || `Panel ${node.id}`;
          nameOverlay.textContent = newDisplay;
          // Update merge gutter labels by re-rendering
          this.render();
        }
      });
    };
    canvas.appendChild(nameOverlay);

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
        <button data-action="add-node" class="btn-add" title="Add a new labeled node to the graph">+N</button>
        <button data-action="add-edge" class="btn-add" title="Add a new directed edge between two existing nodes">+E</button>
        <span class="action-separator"></span>
        <button data-action="approve" class="btn-approve" title="Snapshot current state as baseline and clear all diffs">&#x2713;</button>
        <button data-action="restore" class="btn-restore" title="Revert graph to last approved state (undo all changes since approval)">&#x21BA;</button>
        <span class="action-separator"></span>
        <button data-action="clear" class="btn-clear" title="Reset panel to empty state (clears graph, approval history, and diffs)">&#x232B;</button>
      </span>
      <span class="panel-actions-right">
        <button data-action="changeset" class="btn-icon" title="View pending changeset summary">&#x24D8;</button>
        <button data-action="changelog" class="btn-icon" title="View approval history">&#x2630;</button>
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

  /** Get display name for a panel by ID (looks up tree at call time) */
  _getPanelName(id) {
    const node = this._findPanelNode(this.tree, id);
    return node ? this._panelName(node) : `Panel ${id}`;
  }

  /** Compute a stable key for a gutter based on panel IDs on each side */
  _gutterKey(splitNode) {
    const left = this._allPanelNodes(splitNode.children[0]).map(p => p.id).sort().join(',');
    const right = this._allPanelNodes(splitNode.children[1]).map(p => p.id).sort().join(',');
    return `${left}|${right}`;
  }

  /** Compute the default merge button list for a split node (push + pull for each adjacent zone pair) */
  _defaultButtons(splitNode) {
    const leftZones = this._getZones(splitNode.children[0], splitNode.direction, 'first');
    const rightZones = this._getZones(splitNode.children[1], splitNode.direction, 'second');

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

    const breakpoints = new Set([0, 100]);
    for (const r of [...leftRanges, ...rightRanges]) {
      breakpoints.add(r.start);
      breakpoints.add(r.end);
    }
    const sorted = [...breakpoints].sort((a, b) => a - b);
    const findZone = (ranges, mid) => ranges.find(r => r.start <= mid && mid < r.end);

    const buttons = [];
    const seen = new Set();

    for (let i = 0; i < sorted.length - 1; i++) {
      const segMid = (sorted[i] + sorted[i + 1]) / 2;
      const leftZone = findZone(leftRanges, segMid);
      const rightZone = findZone(rightRanges, segMid);
      if (!leftZone || !rightZone) continue;
      if (leftZone.slot !== null && rightZone.slot !== null && leftZone.slot !== rightZone.slot) continue;

      for (const leftPanel of leftZone.panels) {
        for (const rightPanel of rightZone.panels) {
          const pushKey = `${leftPanel.id}→${rightPanel.id}`;
          const pullKey = `${rightPanel.id}→${leftPanel.id}`;
          if (!seen.has(pushKey)) { seen.add(pushKey); buttons.push({ source: leftPanel.id, target: rightPanel.id }); }
          if (!seen.has(pullKey)) { seen.add(pullKey); buttons.push({ source: rightPanel.id, target: leftPanel.id }); }
        }
      }
    }

    return buttons;
  }

  /** Get button list for a gutter — initializes from defaults if not yet customized */
  _getButtonList(splitNode) {
    const key = this._gutterKey(splitNode);
    if (!this.mergeButtonLists[key]) {
      this.mergeButtonLists[key] = this._defaultButtons(splitNode);
    }
    return this.mergeButtonLists[key];
  }

  /** Replace just the gutter DOM element without re-creating panels */
  _rerenderGutter(gutterKey) {
    const splitNode = this._gutterSplitNodes[gutterKey];
    if (!splitNode) return;
    const old = this.rootEl.querySelector(`.merge-gutter[data-gutter-key="${CSS.escape(gutterKey)}"]`);
    if (old) old.replaceWith(this._renderMergeGutter(splitNode));
  }

  _renderMergeGutter(splitNode) {
    const isVertical = splitNode.direction === 'v';
    const gutter = document.createElement('div');
    gutter.className = 'merge-gutter';

    // Store key + node for targeted re-renders
    const gutterKey = this._gutterKey(splitNode);
    gutter.dataset.gutterKey = gutterKey;
    this._gutterSplitNodes[gutterKey] = splitNode;

    const list = this._getButtonList(splitNode);
    const leftPanelIds = new Set(this._allPanelNodes(splitNode.children[0]).map(p => p.id));

    const zoneEl = document.createElement('div');
    zoneEl.className = 'merge-zone merge-zone-flat';

    list.forEach((btn, idx) => {
      const { source: sourceId, target: targetId } = btn;
      const key = `${sourceId}→${targetId}`;
      const stratObj = this._getStrategy(key);
      const sourceName = this._getPanelName(sourceId);
      const targetName = this._getPanelName(targetId);
      const btnText = leftPanelIds.has(sourceId)
        ? `${sourceName} \u00BB ${targetName}`
        : `${targetName} \u00AB ${sourceName}`;

      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'merge-btn';
      if (stratObj.strategy === 'none') mergeBtn.classList.add('merge-btn-disabled');
      mergeBtn.innerHTML = `<span class="merge-btn-text">${btnText}</span><span class="merge-strategy-badge">${this._strategyBadge(stratObj.strategy)}</span>`;
      mergeBtn.title = `Merge ${sourceName} into ${targetName}`;
      mergeBtn.dataset.mergeSource = sourceId;
      mergeBtn.dataset.mergeTarget = targetId;
      mergeBtn.onclick = () => {
        if (this._getStrategy(key).strategy === 'none') {
          infoDialog('Merge Disabled', 'This merge direction is set to None.');
          return;
        }
        this.onMerge(sourceId, targetId);
      };
      const btnRow = document.createElement('div');
      btnRow.className = 'merge-btn-row';
      btnRow.appendChild(mergeBtn);

      zoneEl.appendChild(btnRow);
    });

    // Persistent settings icon — always visible
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'merge-gutter-settings';
    settingsBtn.innerHTML = '&#x2699;';
    settingsBtn.title = 'Manage merge buttons';
    settingsBtn.onclick = () => this._showMergeManagementModal(gutterKey, splitNode);
    zoneEl.appendChild(settingsBtn);

    gutter.appendChild(zoneEl);

    // Resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    this._setupResize(handle, splitNode, gutter);
    gutter.appendChild(handle);

    // Set up ResizeObserver to position zone relative to smaller adjacent panel
    const leftFirstId = this._firstPanelId(splitNode.children[0]);
    const rightFirstId = this._firstPanelId(splitNode.children[1]);
    requestAnimationFrame(() => {
      if (!gutter.isConnected) return;
      const leftPanelEl = this.rootEl.querySelector(`.panel[data-panel-id="${leftFirstId}"]`);
      const rightPanelEl = this.rootEl.querySelector(`.panel[data-panel-id="${rightFirstId}"]`);
      if (!leftPanelEl || !rightPanelEl) return;

      const reposition = () => {
        if (!gutter.isConnected) { ro.disconnect(); return; }
        const gutterRect = gutter.getBoundingClientRect();
        const leftRect = leftPanelEl.getBoundingClientRect();
        const rightRect = rightPanelEl.getBoundingClientRect();
        if (isVertical) {
          const smallerH = Math.min(leftRect.height, rightRect.height);
          const topOffset = Math.max(leftRect.top, rightRect.top) - gutterRect.top;
          zoneEl.style.top = `${Math.max(0, topOffset)}px`;
          zoneEl.style.height = `${smallerH}px`;
        } else {
          const smallerW = Math.min(leftRect.width, rightRect.width);
          const leftOffset = Math.max(leftRect.left, rightRect.left) - gutterRect.left;
          zoneEl.style.left = `${Math.max(0, leftOffset)}px`;
          zoneEl.style.width = `${smallerW}px`;
        }
      };

      const ro = new ResizeObserver(reposition);
      ro.observe(leftPanelEl);
      ro.observe(rightPanelEl);
      reposition();
      gutter._resizeObserver = ro;
    });

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

  /** Show a floating strategy picker near the given merge button.
   *  gutterKey is required for the Delete option to work. */
  _showStrategyPicker(key, anchorBtn, gutterKey) {
    document.querySelector('.merge-strategy-picker')?.remove();
    const currentObj = this._getStrategy(key);
    const current = currentObj.strategy;

    const picker = document.createElement('div');
    picker.className = 'merge-strategy-picker';
    const rect = anchorBtn.getBoundingClientRect();
    picker.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom + 4}px;z-index:10000`;

    const options = [
      { strat: 'mirror', label: 'Mirror (M)' },
      { strat: 'push',   label: 'Push (P)' },
      { strat: 'scoped', label: 'Scoped (S)' },
      { strat: 'none',   label: 'None (N)' },
    ];
    picker.innerHTML = options.map(o =>
      `<div class="strategy-option${current === o.strat ? ' active' : ''}" data-strat="${o.strat}">${current === o.strat ? '✓ ' : ''}${o.label}</div>`
    ).join('') + `
      <hr class="strategy-separator">
      <div class="strategy-option strategy-delete" data-strat="__delete__">&#x2715; Delete</div>
    `;

    document.body.appendChild(picker);

    const updateBtn = () => {
      const stratObj = this._getStrategy(key);
      const badge = anchorBtn.querySelector('.merge-strategy-badge');
      if (badge) badge.textContent = this._strategyBadge(stratObj.strategy);
      anchorBtn.classList.toggle('merge-btn-disabled', stratObj.strategy === 'none');
    };

    const dismiss = e => {
      if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('mousedown', dismiss); }
    };

    picker.querySelectorAll('.strategy-option').forEach(opt => {
      opt.onclick = e => {
        e.stopPropagation();
        const strat = opt.dataset.strat;
        picker.remove();
        document.removeEventListener('mousedown', dismiss);

        if (strat === '__delete__') {
          // Remove this button from the list and re-render gutter
          if (gutterKey && this.mergeButtonLists[gutterKey]) {
            const idx = this.mergeButtonLists[gutterKey].findIndex(b => `${b.source}→${b.target}` === key);
            if (idx !== -1) this.mergeButtonLists[gutterKey].splice(idx, 1);
            this._rerenderGutter(gutterKey);
            window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          }
          return;
        }

        if (strat === 'mirror') {
          delete this.mergeStrategies[key];
        } else {
          this.mergeStrategies[key] = { strategy: strat, scopeNodes: currentObj.scopeNodes || [] };
        }

        if (strat === 'scoped') {
          // Open scope node picker to select scope nodes from both panels
          const [sourceId, targetId] = key.split('\u2192');
          const panelsMap = this._getPanels ? this._getPanels() : null;
          const targetPanel = panelsMap?.get(targetId);
          const sourcePanel = panelsMap?.get(sourceId);
          if (targetPanel) {
            scopeNodePickerDialog(targetPanel, sourcePanel, key, this.mergeStrategies, () => {
              updateBtn();
              window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
            });
          } else {
            updateBtn();
            window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          }
        } else {
          updateBtn();
          window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
        }
      };
    });

    setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
  }

  /** Update merge button colors based on source panel clean/dirty state */
  updateMergeButtonStates(panels) {
    this.rootEl.querySelectorAll('.merge-btn[data-merge-source]').forEach(btn => {
      if (btn.classList.contains('merge-btn-disabled')) return; // none strategy — skip
      const sourceId = btn.dataset.mergeSource;
      const panel = panels.get(sourceId);
      const isAllowed = panel ? panel.isClean() : true;
      btn.classList.toggle('merge-btn-allowed', isAllowed);
      btn.classList.toggle('merge-btn-blocked', !isAllowed);
    });
  }

  /** Show a modal for managing merge buttons for a specific gutter */
  _showMergeManagementModal(gutterKey, splitNode) {
    const list = this.mergeButtonLists[gutterKey] || [];
    const leftPanelIds = new Set(this._allPanelNodes(splitNode.children[0]).map(p => p.id));

    const buildRows = () => list.map((btn, idx) => {
      const { source: sourceId, target: targetId } = btn;
      const key = `${sourceId}→${targetId}`;
      const stratObj = this._getStrategy(key);
      const sourceName = this._getPanelName(sourceId);
      const targetName = this._getPanelName(targetId);
      const btnText = leftPanelIds.has(sourceId)
        ? `${sourceName} \u00BB ${targetName}`
        : `${targetName} \u00AB ${sourceName}`;

      const stratOptions = [
        { value: 'mirror', label: 'Mirror' },
        { value: 'push', label: 'Push' },
        { value: 'scoped', label: 'Scoped' },
        { value: 'none', label: 'None' },
      ].map(o => `<option value="${o.value}" ${stratObj.strategy === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

      return `
        <div class="mgmt-row" data-idx="${idx}">
          <span class="mgmt-btn-label">${btnText}</span>
          <select class="mgmt-strat-select" data-key="${key}" data-idx="${idx}">${stratOptions}</select>
          <button class="mgmt-up-btn btn-icon" data-idx="${idx}" title="Move up" ${idx === 0 ? 'disabled' : ''}>&#x25B2;</button>
          <button class="mgmt-dn-btn btn-icon" data-idx="${idx}" title="Move down" ${idx === list.length - 1 ? 'disabled' : ''}>&#x25BC;</button>
          <button class="mgmt-delete-btn btn-danger" data-idx="${idx}" title="Delete">&#x00D7;</button>
        </div>
      `;
    }).join('');

    const buildHtml = () => `
      <div class="dialog-header">
        <h3>Merge Buttons</h3>
        <button id="mgmt-close-x" class="btn-close-icon" title="Close">&#x2715;</button>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Changes are applied live. Use &#x25B2;&#x25BC; buttons to reorder.</p>
      <div id="mgmt-list">${buildRows() || '<p style="color:var(--text-muted);padding:8px;text-align:center">No merge buttons</p>'}</div>
      <button id="mgmt-add" class="btn-secondary" style="margin-top:8px">+ Add Merge Button</button>
    `;

    const dlg = openDialog(buildHtml());
    dlg.classList.add('dialog-wide');

    const rerender = () => {
      dlg.querySelector('#mgmt-list').innerHTML = buildRows() || '<p style="color:var(--text-muted);padding:8px;text-align:center">No merge buttons</p>';
      wireRows();
    };

    const wireRows = () => {
      dlg.querySelectorAll('.mgmt-delete-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          list.splice(idx, 1);
          this._rerenderGutter(gutterKey);
          window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          rerender();
        };
      });
      dlg.querySelectorAll('.mgmt-up-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          if (idx === 0) return;
          [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
          this._rerenderGutter(gutterKey);
          window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          rerender();
        };
      });
      dlg.querySelectorAll('.mgmt-dn-btn').forEach(btn => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx);
          if (idx === list.length - 1) return;
          [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
          this._rerenderGutter(gutterKey);
          window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          rerender();
        };
      });
      dlg.querySelectorAll('.mgmt-strat-select').forEach(sel => {
        sel.onchange = () => {
          const key = sel.dataset.key;
          const strat = sel.value;
          if (strat === 'mirror') {
            delete this.mergeStrategies[key];
          } else {
            const current = this._getStrategy(key);
            this.mergeStrategies[key] = { strategy: strat, scopeNodes: current.scopeNodes || [] };
          }
          this._rerenderGutter(gutterKey);
          window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
          if (strat === 'scoped') {
            const [sourceId, targetId] = key.split('\u2192');
            const panelsMap = this._getPanels ? this._getPanels() : null;
            const targetPanel = panelsMap?.get(targetId);
            const sourcePanel = panelsMap?.get(sourceId);
            if (targetPanel) {
              scopeNodePickerDialog(targetPanel, sourcePanel, key, this.mergeStrategies, () => {
                this._rerenderGutter(gutterKey);
                window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
              });
            }
          }
        };
      });
    };

    wireRows();

    dlg.querySelector('#mgmt-add').onclick = () => {
      const allPanelInfos = this._allPanelNodes(this.tree);
      const currentList = this.mergeButtonLists[gutterKey] || [];
      closeDialog();
      addMergeButtonDialog(allPanelInfos, currentList, ({ source, target }) => {
        if (!this.mergeButtonLists[gutterKey]) this.mergeButtonLists[gutterKey] = [];
        this.mergeButtonLists[gutterKey].push({ source, target });
        this._rerenderGutter(gutterKey);
        window.dispatchEvent(new CustomEvent('panel-change', { detail: { type: 'layout' } }));
        this._showMergeManagementModal(gutterKey, splitNode);
      });
    };

    dlg.querySelector('#mgmt-close-x').onclick = closeDialog;
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
