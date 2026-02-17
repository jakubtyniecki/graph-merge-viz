import cytoscape from 'cytoscape';
import { baseStyles } from '../cytoscape/styles.js';
import { computeDiff } from '../graph/diff.js';
import { mergeGraphs } from '../graph/merge.js';
import { createGraph, deepClone, isEmpty, nodeKey, edgeKey, getAncestorSubgraph } from '../graph/model.js';
import { exportToFile } from '../graph/serializer.js';
import { showToast } from './toast.js';

/** Format diff summary as compact string: "+3n ~1n -2n +1e" */
export function formatDiffSummary(diffs) {
  const c = { an: 0, mn: 0, rn: 0, ae: 0, me: 0, re: 0 };
  for (const d of diffs) {
    const isNode = d.type === 'node';
    if (d.action === 'added') isNode ? c.an++ : c.ae++;
    else if (d.action === 'modified') isNode ? c.mn++ : c.me++;
    else if (d.action === 'removed') isNode ? c.rn++ : c.re++;
  }
  const parts = [];
  if (c.an) parts.push(`+${c.an}n`);
  if (c.mn) parts.push(`~${c.mn}n`);
  if (c.rn) parts.push(`-${c.rn}n`);
  if (c.ae) parts.push(`+${c.ae}e`);
  if (c.me) parts.push(`~${c.me}e`);
  if (c.re) parts.push(`-${c.re}e`);
  return parts.join(' ');
}

export class Panel {
  constructor(id, container) {
    this.id = id;
    this.graph = createGraph();
    this.baseGraph = null;
    this.mergeDirection = null;
    this.lastApproval = null;
    this.container = container;
    this._history = [];
    this._redoStack = [];
    this._maxHistory = 10;
    this._approvalHistory = [];
    this._maxApprovalHistory = 20;

    this.cy = cytoscape({
      container,
      elements: [],
      style: baseStyles,
      layout: { name: 'grid' },
      selectionType: 'additive',
    });

    this._updateHeader();
  }

  /** Get the panel element (parent of canvas) */
  get panelEl() {
    return this.container.closest('[data-panel-id]');
  }

  /** Get current graph data */
  getGraph() {
    return deepClone(this.graph);
  }

  /** Get base graph data */
  getBaseGraph() {
    return this.baseGraph ? deepClone(this.baseGraph) : null;
  }

  /** Get current state for serialization */
  getState() {
    return {
      id: this.id,
      graph: deepClone(this.graph),
      baseGraph: this.baseGraph ? deepClone(this.baseGraph) : null,
      mergeDirection: this.mergeDirection,
      lastApproval: this.lastApproval,
      _history: this._history.map(g => deepClone(g)),
      _redoStack: this._redoStack.map(g => deepClone(g)),
      _approvalHistory: this._approvalHistory.map(entry => ({
        graph: deepClone(entry.graph),
        timestamp: entry.timestamp,
        diffSummary: entry.diffSummary,
      })),
    };
  }

  /** Restore state from serialized data */
  setState(state) {
    this.graph = state.graph || createGraph();
    this.baseGraph = state.baseGraph || null;
    this.mergeDirection = state.mergeDirection || null;
    this.lastApproval = state.lastApproval || null;
    this._history = state._history ? state._history.map(g => deepClone(g)) : [];
    this._redoStack = state._redoStack ? state._redoStack.map(g => deepClone(g)) : [];
    this._approvalHistory = state._approvalHistory ? state._approvalHistory.map(entry => ({
      graph: deepClone(entry.graph),
      timestamp: entry.timestamp,
      diffSummary: entry.diffSummary,
    })) : [];
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
  }

  /** Load a graph into the panel (replaces current) */
  loadGraph(graph) {
    this.graph = deepClone(graph);
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
  }

  /** Add a node */
  addNode(label, props = {}) {
    if (this.graph.nodes.some(n => n.label === label)) {
      showToast(`Node "${label}" already exists`, 'error');
      return false;
    }
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes, { label, props: { ...props } }],
      edges: [...this.graph.edges],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
    return true;
  }

  /** Add an edge */
  addEdge(source, target, props = {}) {
    if (!this.graph.nodes.some(n => n.label === source)) {
      showToast(`Source node "${source}" not found`, 'error');
      return false;
    }
    if (!this.graph.nodes.some(n => n.label === target)) {
      showToast(`Target node "${target}" not found`, 'error');
      return false;
    }
    if (this.graph.edges.some(e => e.source === source && e.target === target)) {
      showToast(`Edge "${source}→${target}" already exists`, 'error');
      return false;
    }
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes],
      edges: [...this.graph.edges, { source, target, props: { ...props } }],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
    return true;
  }

  /** Update node props */
  updateNodeProps(label, props) {
    this._pushHistory();
    this.graph = {
      nodes: this.graph.nodes.map(n => n.label === label ? { ...n, props: { ...props } } : n),
      edges: [...this.graph.edges],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
  }

  /** Update edge props */
  updateEdgeProps(source, target, props) {
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes],
      edges: this.graph.edges.map(e =>
        (e.source === source && e.target === target) ? { ...e, props: { ...props } } : e
      ),
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
  }

  /** Delete selected elements */
  deleteSelected() {
    const selected = this.cy.$(':selected');
    if (selected.empty()) {
      showToast('Nothing selected', 'info');
      return;
    }

    this._pushHistory();
    const nodeLabels = new Set();
    selected.nodes().forEach(n => nodeLabels.add(n.data('label')));

    const edgeKeys = new Set();
    selected.edges().forEach(e => {
      edgeKeys.add(`${e.data('source')}→${e.data('target')}`);
    });

    this.graph = {
      nodes: this.graph.nodes.filter(n => !nodeLabels.has(n.label)),
      edges: this.graph.edges.filter(e => {
        if (edgeKeys.has(`${e.source}→${e.target}`)) return false;
        if (nodeLabels.has(e.source) || nodeLabels.has(e.target)) return false;
        return true;
      }),
    };

    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
  }

  /** Clear graph entirely — total reset including approval state */
  clearGraph() {
    this._pushHistory();
    this.graph = createGraph();
    this.baseGraph = null;
    this.mergeDirection = null;
    this.lastApproval = null;
    this._approvalHistory = [];
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
  }

  /** Approve: snapshot current as base, clear diff */
  approve() {
    // Compute diff summary before overwriting baseGraph
    let diffSummary = '(initial)';
    if (this.baseGraph) {
      const diffs = computeDiff(this.baseGraph, this.graph);
      diffSummary = diffs.length > 0 ? formatDiffSummary(diffs) : '(no changes)';
    }

    // Push to approval history
    this._approvalHistory.push({
      graph: deepClone(this.graph),
      timestamp: new Date().toISOString(),
      diffSummary,
    });

    // Cap history at max size
    if (this._approvalHistory.length > this._maxApprovalHistory) {
      this._approvalHistory.shift();
    }

    this.baseGraph = deepClone(this.graph);
    this.mergeDirection = null;
    this.lastApproval = new Date().toISOString();
    this._syncCytoscape();      // Re-sync with new baseGraph to remove ghost nodes
    this._clearDiffClasses();
    this._updateHeader();
    this._emitChange();
    showToast(`Panel ${this.id} approved`, 'success');
  }

  /** Receive a merge/push from another panel */
  receiveMerge(incomingGraph, direction) {
    // Case 1: Target empty → copy graph, auto-approve
    if (isEmpty(this.graph) && !this.baseGraph) {
      this.graph = deepClone(incomingGraph);
      this.baseGraph = deepClone(incomingGraph);
      this.lastApproval = new Date().toISOString();
      this.mergeDirection = null;
      this._syncCytoscape();
      this._updateHeader();
      this._emitChange();
      return { ok: true };
    }

    // Case 2: Normal merge — use target's baseGraph for deletion detection
    this._pushHistory();
    this.graph = mergeGraphs(this.graph, incomingGraph, this.baseGraph);
    this.mergeDirection = direction;
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
    return { ok: true };
  }

  /** Paste a subgraph (clipboard content) — additive-only merge with no deletions */
  pasteSubgraph(incomingGraph, direction) {
    if (isEmpty(this.graph) && !this.baseGraph) {
      // Same as receiveMerge Case 1: empty target → copy + auto-approve
      this.graph = deepClone(incomingGraph);
      this.baseGraph = deepClone(incomingGraph);
      this.lastApproval = new Date().toISOString();
      this.mergeDirection = null;
      this._syncCytoscape();
      this._updateHeader();
      this._emitChange();
    } else {
      this._pushHistory();
      this.graph = mergeGraphs(this.graph, incomingGraph, null); // null = no deletions
      this.mergeDirection = direction;
      this._syncCytoscape();
      this._applyDiffClasses();
      this._updateHeader();
      this._emitChange();
    }
    return { ok: true };
  }

  /** Select all nodes/edges in a branch (ancestors of a node) */
  selectBranch(nodeLabel) {
    const subgraph = getAncestorSubgraph(this.graph, nodeLabel);
    this.cy.elements().unselect();
    for (const node of subgraph.nodes) {
      this.cy.$id(node.label).select();
    }
    for (const edge of subgraph.edges) {
      this.cy.$id(`${edge.source}→${edge.target}`).select();
    }
  }

  /** Export graph as JSON file */
  exportGraph() {
    exportToFile(this.graph, `panel-${this.id}.json`);
  }

  /** Undo last operation */
  undo() {
    if (this._history.length === 0) {
      showToast('Nothing to undo', 'info');
      return false;
    }
    this._redoStack.push(deepClone(this.graph));
    this.graph = this._history.pop();
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
    showToast('Undo', 'info');
    return true;
  }

  /** Redo last undone operation */
  redo() {
    if (this._redoStack.length === 0) {
      showToast('Nothing to redo', 'info');
      return false;
    }
    this._history.push(deepClone(this.graph));
    if (this._history.length > this._maxHistory) this._history.shift();
    this.graph = this._redoStack.pop();
    this._syncCytoscape();
    this._applyDiffClasses();
    this._updateHeader();
    this._emitChange();
    showToast('Redo', 'info');
    return true;
  }

  /** Restore from last approved state */
  restoreFromApproved() {
    if (!this.baseGraph) {
      showToast('No approved state to restore', 'info');
      return false;
    }
    this._pushHistory();
    this.graph = deepClone(this.baseGraph);
    this._syncCytoscape();
    this._applyDiffClasses();  // Will show no diffs (graph === baseGraph)
    this._updateHeader();
    this._emitChange();
    showToast(`Panel ${this.id} restored to approved state`, 'success');
    return true;
  }

  /** Get selected nodes/edges as a subgraph */
  getSelectedSubgraph() {
    const selected = this.cy.$(':selected');
    if (selected.empty()) return null;

    const nodeLabels = new Set();
    const nodes = [];
    selected.nodes().forEach(n => {
      nodeLabels.add(n.data('label'));
      const gNode = this.graph.nodes.find(gn => gn.label === n.data('label'));
      if (gNode) nodes.push(deepClone(gNode));
    });

    const edges = [];
    selected.edges().forEach(e => {
      const src = e.data('source');
      const tgt = e.data('target');
      if (nodeLabels.has(src) && nodeLabels.has(tgt)) {
        const gEdge = this.graph.edges.find(ge => ge.source === src && ge.target === tgt);
        if (gEdge) edges.push(deepClone(gEdge));
      }
    });

    return { nodes, edges };
  }

  /** Check if panel has no pending changes */
  isClean() {
    if (!this.baseGraph) return true;
    return computeDiff(this.baseGraph, this.graph).length === 0;
  }

  /** Push current graph to history before mutation */
  _pushHistory() {
    this._history.push(deepClone(this.graph));
    if (this._history.length > this._maxHistory) this._history.shift();
    this._redoStack = [];  // Clear redo stack on new mutation
  }

  /** Sync Cytoscape instance from graph data */
  _syncCytoscape() {
    const elements = [];

    for (const node of this.graph.nodes) {
      elements.push({
        group: 'nodes',
        data: { id: node.label, label: node.label, ...this._flattenProps(node.props, 'p_') },
      });
    }

    for (const edge of this.graph.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `${edge.source}→${edge.target}`,
          source: edge.source,
          target: edge.target,
          ...this._flattenProps(edge.props, 'p_'),
        },
      });
    }

    // Add removed elements from base (for diff visualization)
    if (this.baseGraph) {
      const currentNodeLabels = new Set(this.graph.nodes.map(n => n.label));
      const currentEdgeKeys = new Set(this.graph.edges.map(e => `${e.source}→${e.target}`));

      for (const node of this.baseGraph.nodes) {
        if (!currentNodeLabels.has(node.label)) {
          elements.push({
            group: 'nodes',
            data: { id: node.label, label: node.label },
            classes: 'diff-removed',
          });
        }
      }

      for (const edge of this.baseGraph.edges) {
        const key = `${edge.source}→${edge.target}`;
        if (!currentEdgeKeys.has(key)) {
          // Only add removed edge if both nodes exist (either current or removed)
          const allNodeIds = new Set([...currentNodeLabels, ...this.baseGraph.nodes.map(n => n.label)]);
          if (allNodeIds.has(edge.source) && allNodeIds.has(edge.target)) {
            elements.push({
              group: 'edges',
              data: { id: key, source: edge.source, target: edge.target },
              classes: 'diff-removed',
            });
          }
        }
      }
    }

    this.cy.elements().remove();
    this.cy.add(elements);
    this._runLayout();
  }

  /** Apply diff CSS classes to Cytoscape elements */
  _applyDiffClasses() {
    if (!this.baseGraph) return;

    const diffs = computeDiff(this.baseGraph, this.graph);

    // Clear existing diff classes (except removed which are set during sync)
    this.cy.elements().removeClass('diff-added diff-modified');

    for (const diff of diffs) {
      if (diff.action === 'removed') continue; // handled in _syncCytoscape

      const id = diff.type === 'node' ? diff.key : diff.key;
      const ele = this.cy.$id(id);
      if (ele.length) {
        ele.addClass(`diff-${diff.action}`);
      }
    }

    this._updateDiffOverlay();
  }

  /** Clear all diff classes */
  _clearDiffClasses() {
    this.cy.elements().removeClass('diff-added diff-removed diff-modified');
    // Remove ghost removed elements
    this.cy.$('.diff-removed').remove();
    this._updateDiffOverlay();
  }

  /** Update panel header with state info */
  _updateHeader() {
    const infoEl = this.panelEl?.querySelector('.panel-info');
    if (!infoEl) return;

    const parts = [];

    if (this.mergeDirection) {
      parts.push(`<span class="merge-direction">${this.mergeDirection}</span>`);
    }

    if (this.lastApproval) {
      const time = new Date(this.lastApproval).toLocaleTimeString();
      parts.push(`Approved: ${time}`);
    }

    if (this.baseGraph && !this.isClean()) {
      const diffCount = computeDiff(this.baseGraph, this.graph).length;
      parts.push(`${diffCount} change${diffCount !== 1 ? 's' : ''}`);
    }

    infoEl.innerHTML = parts.join(' · ');
  }

  /** Flatten props to data attributes with prefix */
  _flattenProps(props, prefix) {
    const result = {};
    for (const [k, v] of Object.entries(props)) {
      result[`${prefix}${k}`] = v;
    }
    return result;
  }

  /** Run layout */
  _runLayout() {
    if (this.cy.elements().length === 0) return;
    const algo = window.__layoutAlgorithm || 'fcose';
    this.cy.layout({
      name: this.cy.nodes().length > 1 ? algo : 'grid',
      animate: false,
      fit: true,
      padding: 20,
    }).run();
  }

  /** Update diff overlay with compact summary */
  _updateDiffOverlay() {
    const overlayEl = this.container.parentElement?.querySelector(`.diff-overlay[data-panel-diff="${this.id}"]`);
    if (!overlayEl) return;

    if (!this.baseGraph) {
      overlayEl.classList.remove('visible');
      return;
    }

    const diffs = computeDiff(this.baseGraph, this.graph);
    if (diffs.length === 0) {
      overlayEl.classList.remove('visible');
      return;
    }

    overlayEl.textContent = formatDiffSummary(diffs);
    overlayEl.classList.add('visible');
  }

  /** Emit a change event for session auto-save */
  _emitChange() {
    window.dispatchEvent(new CustomEvent('panel-change', { detail: { panelId: this.id } }));
  }
}
