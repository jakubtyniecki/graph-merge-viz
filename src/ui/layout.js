/**
 * LayoutManager - Recursive split tree for dynamic panel layout.
 *
 * LayoutNode =
 *   | { type: "panel", id: string }
 *   | { type: "split", direction: "h" | "v", children: [LayoutNode, LayoutNode], sizes: [number, number] }
 */

const MIN_PANEL_SIZE_PX = 200;

export class LayoutManager {
  constructor(rootEl, { onPanelCreate, onPanelDestroy, onMerge, getState, setState }) {
    this.rootEl = rootEl;
    this.onPanelCreate = onPanelCreate;
    this.onPanelDestroy = onPanelDestroy;
    this.onMerge = onMerge;
    this._getState = getState || null;
    this._setState = setState || null;
    this.nextId = 1;
    this.tree = null;
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
    this.tree = this._mapTree(this.tree, node => {
      if (node.type === 'panel' && node.id === panelId) {
        return {
          type: 'split',
          direction,
          children: [
            { type: 'panel', id: panelId },
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

    this.tree = this._removePanel(this.tree, panelId);
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
        // Restore state if panel existed before
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
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset.panelId = node.id;

    // Header
    const header = document.createElement('div');
    header.className = 'panel-header';
    header.innerHTML = `
      <span class="panel-name">Panel ${node.id}</span>
      <span class="panel-info"></span>
      <span class="panel-header-btns">
        <button class="panel-split-btn" data-split="v" title="Split vertical">⬓</button>
        <button class="panel-split-btn" data-split="h" title="Split horizontal">⬒</button>
        <button class="panel-close-btn" title="Close panel">✕</button>
      </span>
    `;
    panel.appendChild(header);

    // Wire header buttons
    header.querySelector('[data-split="v"]').onclick = () => this.splitPanel(node.id, 'v');
    header.querySelector('[data-split="h"]').onclick = () => this.splitPanel(node.id, 'h');
    header.querySelector('.panel-close-btn').onclick = () => this.closePanel(node.id);

    // Canvas
    const canvas = document.createElement('div');
    canvas.className = 'panel-canvas';
    canvas.dataset.panel = node.id;
    panel.appendChild(canvas);

    // Action bar
    const actions = document.createElement('div');
    actions.className = 'panel-actions';
    actions.innerHTML = `
      <button data-action="add-node">+ Node</button>
      <button data-action="add-edge">+ Edge</button>
      <button data-action="edit">Edit</button>
      <button data-action="delete">Delete</button>
      <button data-action="clear">Clear</button>
      <button data-action="approve" class="btn-approve">Approve</button>
      <button data-action="import">Import</button>
      <button data-action="export">Export</button>
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

  /** Build merge gutter with directional buttons and resize handle */
  _renderMergeGutter(splitNode) {
    const isVertical = splitNode.direction === 'v';
    const gutter = document.createElement('div');
    gutter.className = 'merge-gutter';

    // Get panel IDs on each side (leftmost/topmost panels)
    const leftId = this._firstPanelId(splitNode.children[0]);
    const rightId = this._firstPanelId(splitNode.children[1]);

    const pushArrow = isVertical ? '>>' : '▼▼';
    const pullArrow = isVertical ? '<<' : '▲▲';

    // Push button: left → right
    const pushBtn = document.createElement('button');
    pushBtn.className = 'merge-btn merge-btn-push';
    pushBtn.textContent = `${leftId} ${pushArrow} ${rightId}`;
    pushBtn.title = `Push Panel ${leftId} → Panel ${rightId}`;
    pushBtn.onclick = () => this.onMerge(leftId, rightId);

    // Pull button: right → left
    const pullBtn = document.createElement('button');
    pullBtn.className = 'merge-btn merge-btn-pull';
    pullBtn.textContent = `${leftId} ${pullArrow} ${rightId}`;
    pullBtn.title = `Pull Panel ${rightId} → Panel ${leftId}`;
    pullBtn.onclick = () => this.onMerge(rightId, leftId);

    // Resize handle
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    this._setupResize(handle, splitNode, gutter);

    gutter.appendChild(pushBtn);
    gutter.appendChild(handle);
    gutter.appendChild(pullBtn);

    return gutter;
  }

  /** Get the first (leftmost/topmost) panel ID from a subtree */
  _firstPanelId(node) {
    if (node.type === 'panel') return node.id;
    return this._firstPanelId(node.children[0]);
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
