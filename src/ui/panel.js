import cytoscape from 'cytoscape';
import { buildStylesForTemplate } from '../cytoscape/styles.js';
import { computeDiff } from '../graph/diff.js';
import { mergeGraphs, filterUpstreamSubgraph } from '../graph/merge.js';
import { createGraph, deepClone, isEmpty, nodeKey, edgeKey, getAncestorSubgraph } from '../graph/model.js';
import { exportToFile } from '../graph/serializer.js';
import { showToast } from './toast.js';
import { defaultTemplate, GRAPH_TYPES } from '../graph/template.js';
import { validateEdgeAdd, hasCycle, wouldDisconnectOnNodeRemove, wouldDisconnectOnEdgeRemove } from '../graph/constraints.js';
import { computePathTags, propagateExclusions, isNodeFullyExcluded, mergeExclusions, formatPathTag, serializeTag } from '../graph/path-tracking.js';

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

/** Format grouped diff summary as human-readable text.
 *  "Added 3 nodes: A, B, C. Removed 1 edge: X→Y. Modified 1 node: Z (prop changed)" */
export function formatGroupedDiffSummary(diffs) {
  if (diffs.length === 0) return 'No changes.';

  const groups = {
    addedNodes: [],
    removedNodes: [],
    modifiedNodes: [],
    addedEdges: [],
    removedEdges: [],
    modifiedEdges: [],
  };

  for (const d of diffs) {
    if (d.type === 'node') {
      if (d.action === 'added') groups.addedNodes.push(d.key);
      else if (d.action === 'removed') groups.removedNodes.push(d.key);
      else if (d.action === 'modified') groups.modifiedNodes.push({ key: d.key, changes: d.changes });
    } else {
      if (d.action === 'added') groups.addedEdges.push(d.key);
      else if (d.action === 'removed') groups.removedEdges.push(d.key);
      else if (d.action === 'modified') groups.modifiedEdges.push({ key: d.key, changes: d.changes });
    }
  }

  const sentences = [];

  if (groups.addedNodes.length) {
    const n = groups.addedNodes.length;
    sentences.push(`Added ${n} node${n > 1 ? 's' : ''}: ${groups.addedNodes.join(', ')}`);
  }
  if (groups.removedNodes.length) {
    const n = groups.removedNodes.length;
    sentences.push(`Removed ${n} node${n > 1 ? 's' : ''}: ${groups.removedNodes.join(', ')}`);
  }
  if (groups.modifiedNodes.length) {
    const items = groups.modifiedNodes.map(({ key, changes }) => {
      const detail = changes && changes.length ? `(${changes.map(c => c.key).join(', ')} changed)` : '';
      return detail ? `${key} ${detail}` : key;
    });
    const n = groups.modifiedNodes.length;
    sentences.push(`Modified ${n} node${n > 1 ? 's' : ''}: ${items.join(', ')}`);
  }
  if (groups.addedEdges.length) {
    const n = groups.addedEdges.length;
    sentences.push(`Added ${n} edge${n > 1 ? 's' : ''}: ${groups.addedEdges.join(', ')}`);
  }
  if (groups.removedEdges.length) {
    const n = groups.removedEdges.length;
    sentences.push(`Removed ${n} edge${n > 1 ? 's' : ''}: ${groups.removedEdges.join(', ')}`);
  }
  if (groups.modifiedEdges.length) {
    const items = groups.modifiedEdges.map(({ key, changes }) => {
      const detail = changes && changes.length ? `(${changes.map(c => c.key).join(', ')} changed)` : '';
      return detail ? `${key} ${detail}` : key;
    });
    const n = groups.modifiedEdges.length;
    sentences.push(`Modified ${n} edge${n > 1 ? 's' : ''}: ${items.join(', ')}`);
  }

  return sentences.join('. ') + '.';
}

export class Panel {
  constructor(id, container, template = null) {
    this.id = id;
    this.graph = createGraph();
    this.baseGraph = null;
    this.mergeDirection = null;
    this.lastApproval = null;
    this.container = container;
    this.template = template || defaultTemplate();
    this.layoutAlgorithm = template?.defaultLayoutAlgorithm || 'fcose';
    this.pathTrackingEnabled = false;
    this.showExclusions = true;
    this.exclusions = {};  // { "edgeKey": ["serializedTag1", ...] }
    this._pathTags = null;          // computed, not serialized
    this._effectiveExclusions = null; // computed, not serialized
    this._history = [];
    this._redoStack = [];
    this._maxHistory = 10;
    this._approvalHistory = [];
    this._maxApprovalHistory = 20;
    this._processingCount = 0;

    this.cy = cytoscape({
      container,
      elements: [],
      style: buildStylesForTemplate(this.template),
      layout: { name: 'grid' },
      selectionType: 'additive',
    });

    // Tooltip element (appended to panel-canvas parent)
    this._tooltip = null;
    this._trackingOverlay = null;

    // Set up edge hover tooltip
    this.cy.on('mouseover', 'edge', (e) => {
      const edge = e.target;
      const tooltip = edge.data('pathTagsTooltip');
      if (!tooltip || !this.pathTrackingEnabled) return;
      this._showTooltip(e.originalEvent, tooltip);
    });
    this.cy.on('mouseout', 'edge', () => this._hideTooltip());
    this.cy.on('pan zoom', () => this._hideTooltip());

    this._updateHeader();
  }

  /** Update the template and rebuild Cytoscape styles */
  setTemplate(template) {
    this.template = template;
    this.cy.style().fromJson(buildStylesForTemplate(template)).update();
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
      layoutAlgorithm: this.layoutAlgorithm,
      pathTrackingEnabled: this.pathTrackingEnabled,
      showExclusions: this.showExclusions,
      exclusions: deepClone(this.exclusions),
      _history: this._history.map(h => deepClone(h)),
      _redoStack: this._redoStack.map(h => deepClone(h)),
      _approvalHistory: this._approvalHistory.map(entry => ({
        graph: deepClone(entry.graph),
        baseGraph: entry.baseGraph ? deepClone(entry.baseGraph) : null,
        timestamp: entry.timestamp,
        diffSummary: entry.diffSummary,
        exclusions: deepClone(entry.exclusions || {}),
      })),
    };
  }

  /** Restore state from serialized data */
  setState(state) {
    this.graph = state.graph || createGraph();
    this.baseGraph = state.baseGraph || null;
    this.mergeDirection = state.mergeDirection || null;
    this.lastApproval = state.lastApproval || null;
    const _algoMigration = { cose: 'fcose', dagre: 'level-by-level' };
    const storedAlgo = state.layoutAlgorithm || 'fcose';
    this.layoutAlgorithm = _algoMigration[storedAlgo] || storedAlgo;
    this.pathTrackingEnabled = state.pathTrackingEnabled || false;
    this.showExclusions = state.showExclusions ?? true;
    this.exclusions = deepClone(state.exclusions || {});
    // History entries may be plain graphs (old format) or { graph, exclusions } (new format)
    this._history = state._history ? state._history.map(h => deepClone(h)) : [];
    this._redoStack = state._redoStack ? state._redoStack.map(h => deepClone(h)) : [];
    this._approvalHistory = state._approvalHistory ? state._approvalHistory.map(entry => ({
      graph: deepClone(entry.graph),
      baseGraph: entry.baseGraph ? deepClone(entry.baseGraph) : null,
      timestamp: entry.timestamp,
      diffSummary: entry.diffSummary,
      exclusions: deepClone(entry.exclusions || {}),
    })) : [];
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
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
  addNode(label, props = {}, type = null) {
    if (this.graph.nodes.some(n => n.label === label)) {
      showToast(`Node "${label}" already exists`, 'error');
      return false;
    }
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes, { label, type, props: { ...props } }],
      edges: [...this.graph.edges],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
    this._updateHeader();
    this._emitChange();
    return true;
  }

  /** Add an edge */
  addEdge(source, target, props = {}, type = null) {
    if (!this.graph.nodes.some(n => n.label === source)) {
      showToast(`Source node "${source}" not found`, 'error');
      return false;
    }
    if (!this.graph.nodes.some(n => n.label === target)) {
      showToast(`Target node "${target}" not found`, 'error');
      return false;
    }
    const graphType = this.template?.graphType || 'DG';
    const check = validateEdgeAdd(this.graph, source, target, graphType);
    if (!check.ok) {
      showToast(check.error, 'error');
      return false;
    }
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes],
      edges: [...this.graph.edges, { source, target, type, props: { ...props } }],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
    this._updateHeader();
    this._emitChange();
    return true;
  }

  /** Update node props (and optionally type) */
  updateNodeProps(label, props, type = undefined) {
    this._pushHistory();
    this.graph = {
      nodes: this.graph.nodes.map(n => {
        if (n.label !== label) return n;
        return type !== undefined ? { ...n, props: { ...props }, type } : { ...n, props: { ...props } };
      }),
      edges: [...this.graph.edges],
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
    this._updateHeader();
    this._emitChange();
  }

  /** Update edge props (and optionally type) */
  updateEdgeProps(source, target, props, type = undefined) {
    this._pushHistory();
    this.graph = {
      nodes: [...this.graph.nodes],
      edges: this.graph.edges.map(e => {
        if (!(e.source === source && e.target === target)) return e;
        return type !== undefined ? { ...e, props: { ...props }, type } : { ...e, props: { ...props } };
      }),
    };
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
    this._updateHeader();
    this._emitChange();
  }

  /** Delete selected elements. Returns Promise (may show confirm dialog for UTree) */
  async deleteSelected(confirmFn = null) {
    const selected = this.cy.$(':selected');
    if (selected.empty()) {
      showToast('Nothing selected', 'info');
      return;
    }

    const graphType = this.template?.graphType || 'DG';
    const typeInfo = GRAPH_TYPES[graphType];

    const nodeLabels = new Set();
    selected.nodes().forEach(n => nodeLabels.add(n.data('label')));
    const edgeKeys = new Set();
    selected.edges().forEach(e => edgeKeys.add(`${e.data('source')}→${e.data('target')}`));

    // UTree connectivity warning
    if (typeInfo?.mustBeConnected && confirmFn) {
      let wouldDisconnect = false;
      for (const label of nodeLabels) {
        if (wouldDisconnectOnNodeRemove(this.graph, label)) { wouldDisconnect = true; break; }
      }
      if (!wouldDisconnect) {
        for (const key of edgeKeys) {
          const [s, t] = key.split('→');
          if (wouldDisconnectOnEdgeRemove(this.graph, s, t)) { wouldDisconnect = true; break; }
        }
      }
      if (wouldDisconnect) {
        const ok = await confirmFn('Disconnect Warning', 'Deleting this would disconnect the tree. Proceed anyway?');
        if (!ok) return;
      }
    }

    this._pushHistory();
    const deletedEdgeKeys = new Set([...edgeKeys]);
    this.graph.edges.forEach(e => {
      if (nodeLabels.has(e.source) || nodeLabels.has(e.target)) {
        deletedEdgeKeys.add(`${e.source}→${e.target}`);
      }
    });

    this.graph = {
      nodes: this.graph.nodes.filter(n => !nodeLabels.has(n.label)),
      edges: this.graph.edges.filter(e => {
        if (edgeKeys.has(`${e.source}→${e.target}`)) return false;
        if (nodeLabels.has(e.source) || nodeLabels.has(e.target)) return false;
        return true;
      }),
    };

    // Clean up exclusions for deleted edges
    const newExclusions = { ...this.exclusions };
    for (const key of deletedEdgeKeys) delete newExclusions[key];
    this.exclusions = newExclusions;

    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
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
    this.exclusions = {};
    this._approvalHistory = [];
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
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
      baseGraph: this.baseGraph ? deepClone(this.baseGraph) : null,
      timestamp: new Date().toISOString(),
      diffSummary,
      exclusions: deepClone(this.exclusions),
    });

    // Cap history at max size
    if (this._approvalHistory.length > this._maxApprovalHistory) {
      this._approvalHistory.shift();
    }

    this.baseGraph = deepClone(this.graph);
    this.mergeDirection = null;
    this.lastApproval = new Date().toISOString();
    this._syncCytoscape();      // Re-sync with new baseGraph to remove ghost nodes
    this._recomputePathTrackingAsync();
    this._clearDiffClasses();
    this._updateHeader();
    this._emitChange();
    showToast(`Panel ${this.id} approved`, 'success');
  }

  /** Receive a merge/push from another panel */
  receiveMerge(incomingGraph, direction, incomingExclusions = null, sourceTracked = false, strategy = 'mirror', scopeNodes = []) {
    // Case 1: Target empty → copy graph, auto-approve
    if (isEmpty(this.graph) && !this.baseGraph) {
      this.graph = deepClone(incomingGraph);
      this.baseGraph = deepClone(incomingGraph);
      this.lastApproval = new Date().toISOString();
      this.mergeDirection = null;
      if (incomingExclusions) {
        this.exclusions = mergeExclusions(this.exclusions, incomingExclusions, sourceTracked);
      }
      this._syncCytoscape();
      this._recomputePathTrackingAsync();
      this._updateHeader();
      this._emitChange();
      return { ok: true };
    }

    // Case 2: Normal merge
    this._pushHistory();
    // Scoped: filter source to upstream of scope nodes, then use mirror logic
    const sourceGraph = (strategy === 'scoped' && scopeNodes.length > 0)
      ? filterUpstreamSubgraph(incomingGraph, scopeNodes)
      : incomingGraph;
    // push/sync = additive only (null base); mirror/scoped use target's baseGraph for deletions
    const baseForDiff = (strategy === 'push' || strategy === 'sync') ? null : this.baseGraph;
    this.graph = mergeGraphs(this.graph, sourceGraph, baseForDiff);
    this.mergeDirection = direction;
    if (incomingExclusions) {
      this.exclusions = mergeExclusions(this.exclusions, incomingExclusions, sourceTracked);
    }
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
    this._updateHeader();
    this._emitChange();

    // Post-merge cycle warning for acyclic graph types
    const typeInfo = GRAPH_TYPES[this.template?.graphType];
    if (typeInfo?.acyclic && hasCycle(this.graph, typeInfo.directed)) {
      showToast(`Warning: merge introduced a cycle in ${typeInfo.label}`, 'warning');
    }

    return { ok: true };
  }

  /** Paste a subgraph (clipboard content) — additive-only merge with no deletions */
  pasteSubgraph(incomingGraph, direction, incomingExclusions = null, sourceTracked = false) {
    if (isEmpty(this.graph) && !this.baseGraph) {
      // Same as receiveMerge Case 1: empty target → copy + auto-approve
      this.graph = deepClone(incomingGraph);
      this.baseGraph = deepClone(incomingGraph);
      this.lastApproval = new Date().toISOString();
      this.mergeDirection = null;
      if (incomingExclusions) {
        this.exclusions = mergeExclusions(this.exclusions, incomingExclusions, sourceTracked);
      }
      this._syncCytoscape();
      this._recomputePathTrackingAsync();
      this._updateHeader();
      this._emitChange();
    } else {
      this._pushHistory();
      this.graph = mergeGraphs(this.graph, incomingGraph, null); // null = no deletions
      this.mergeDirection = direction;
      if (incomingExclusions) {
        this.exclusions = mergeExclusions(this.exclusions, incomingExclusions, sourceTracked);
      }
      this._syncCytoscape();
      this._applyDiffClasses();
      this._recomputePathTrackingAsync();
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
    this._redoStack.push({ graph: deepClone(this.graph), exclusions: deepClone(this.exclusions) });
    const entry = this._history.pop();
    this.graph = this._historyGraph(entry);
    this.exclusions = this._historyExclusions(entry);
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
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
    this._history.push({ graph: deepClone(this.graph), exclusions: deepClone(this.exclusions) });
    if (this._history.length > this._maxHistory) this._history.shift();
    const entry = this._redoStack.pop();
    this.graph = this._historyGraph(entry);
    this.exclusions = this._historyExclusions(entry);
    this._syncCytoscape();
    this._applyDiffClasses();
    this._recomputePathTrackingAsync();
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
    // Restore exclusions from last approval
    const lastApproval = this._approvalHistory[this._approvalHistory.length - 1];
    this.exclusions = lastApproval?.exclusions ? deepClone(lastApproval.exclusions) : {};
    this._syncCytoscape();
    this._applyDiffClasses();  // Will show no diffs (graph === baseGraph)
    this._recomputePathTrackingAsync();
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

  /** Push current graph + exclusions to history before mutation */
  _pushHistory() {
    this._history.push({ graph: deepClone(this.graph), exclusions: deepClone(this.exclusions) });
    if (this._history.length > this._maxHistory) this._history.shift();
    this._redoStack = [];  // Clear redo stack on new mutation
  }

  /** Extract graph from a history entry (supports old plain-graph format) */
  _historyGraph(entry) {
    return entry && entry.graph ? entry.graph : entry;
  }

  /** Extract exclusions from a history entry (supports old plain-graph format) */
  _historyExclusions(entry) {
    return entry && entry.exclusions ? entry.exclusions : {};
  }

  /** Sync Cytoscape instance from graph data */
  _syncCytoscape() {
    const elements = [];

    for (const node of this.graph.nodes) {
      elements.push({
        group: 'nodes',
        data: { id: node.label, label: node.label, type: node.type || null, ...this._flattenProps(node.props, 'p_') },
      });
    }

    for (const edge of this.graph.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `${edge.source}→${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: edge.type || null,
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

    if (this.baseGraph && !this.isClean()) {
      const diffCount = computeDiff(this.baseGraph, this.graph).length;
      parts.push(`${diffCount} change${diffCount !== 1 ? 's' : ''}`);
    }

    infoEl.innerHTML = parts.join(' · ');
    this._updateApprovalOverlay();
  }

  /** Update or create the approval timestamp overlay in the canvas bottom-right */
  _updateApprovalOverlay() {
    let el = this.container.querySelector('.approval-indicator');
    if (!el) {
      el = document.createElement('div');
      el.className = 'approval-indicator';
      this.container.appendChild(el);
    }
    if (this.lastApproval) {
      const time = new Date(this.lastApproval).toLocaleTimeString();
      el.textContent = `✓ ${time}`;
    } else {
      el.textContent = '';
    }
  }

  /** Flatten props to data attributes with prefix */
  _flattenProps(props, prefix) {
    const result = {};
    for (const [k, v] of Object.entries(props)) {
      result[`${prefix}${k}`] = v;
    }
    return result;
  }

  /** Set layout algorithm and re-run layout */
  setLayoutAlgorithm(algo) {
    this.layoutAlgorithm = algo;
    this._runLayout();
    this._emitChange();
  }

  /** Run layout */
  _runLayout() {
    if (this.cy.elements().length === 0) return;
    const algo = this.layoutAlgorithm || 'fcose';

    if (algo === 'level-by-level') {
      this._runLevelLayout();
      return;
    }

    this.cy.layout({
      name: this.cy.nodes().length > 1 ? algo : 'grid',
      animate: false,
      fit: true,
      padding: 20,
    }).run();
  }

  /** Level-by-level layout: sinks at top (level 0), sources at bottom.
   *  Includes ghost (diff-removed) nodes so they land at their correct levels. */
  _runLevelLayout() {
    const allNodes = this.cy.nodes(); // include ghost nodes
    if (allNodes.length === 0) return;

    // Find sinks: nodes with no outgoing edges (real or ghost)
    const sinks = allNodes.filter(n => n.outgoers('edge').length === 0);
    const startNodes = sinks.length > 0 ? sinks : allNodes;

    // BFS upstream from sinks to assign levels — traverse all edges including ghost
    const levels = new Map();
    const queue = [];
    startNodes.forEach(n => { levels.set(n.id(), 0); queue.push(n.id()); });

    while (queue.length > 0) {
      const id = queue.shift();
      const level = levels.get(id);
      this.cy.$id(id).incomers('edge').forEach(edge => {
        const sourceId = edge.source().id();
        if (!levels.has(sourceId) || levels.get(sourceId) < level + 1) {
          levels.set(sourceId, level + 1);
          queue.push(sourceId);
        }
      });
    }

    // Unvisited nodes (disconnected) go to level 0
    allNodes.forEach(n => { if (!levels.has(n.id())) levels.set(n.id(), 0); });

    // Group by level
    const byLevel = new Map();
    for (const [id, level] of levels) {
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(id);
    }

    // Compute positions: level 0 at top, increasing down
    const levelSpacing = 80;
    const nodeSpacing = 80;
    const positions = {};
    for (const [level, ids] of byLevel) {
      const y = level * levelSpacing;
      const totalWidth = (ids.length - 1) * nodeSpacing;
      const startX = -totalWidth / 2;
      ids.forEach((id, i) => { positions[id] = { x: startX + i * nodeSpacing, y }; });
    }

    this.cy.layout({
      name: 'preset',
      positions: node => positions[node.id()] || { x: 0, y: 0 },
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

  /** Toggle path tracking on/off */
  setPathTracking(enabled) {
    this.pathTrackingEnabled = enabled;
    if (enabled) {
      this._recomputePathTrackingAsync();
    } else {
      this._pathTags = null;
      this._effectiveExclusions = null;
      this._clearTrackingVisuals();
    }
    this._updateTrackingOverlay();
    this._emitChange();
  }

  /** Toggle show-exclusions mode */
  setShowExclusions(show) {
    this.showExclusions = show;
    this._applyExclusionVisibility();
    this._emitChange();
  }

  /** Exclude a path tag on an edge */
  excludePathTag(edgeKey, serializedTag) {
    this._pushHistory();
    const current = this.exclusions[edgeKey] || [];
    if (!current.includes(serializedTag)) {
      this.exclusions = { ...this.exclusions, [edgeKey]: [...current, serializedTag] };
    }
    this._recomputePathTrackingAsync();
    this._emitChange();
  }

  /** Include (remove exclusion of) a path tag on an edge */
  includePathTag(edgeKey, serializedTag) {
    this._pushHistory();
    const current = this.exclusions[edgeKey] || [];
    const updated = current.filter(t => t !== serializedTag);
    const newExclusions = { ...this.exclusions };
    if (updated.length === 0) {
      delete newExclusions[edgeKey];
    } else {
      newExclusions[edgeKey] = updated;
    }
    this.exclusions = newExclusions;
    this._recomputePathTrackingAsync();
    this._emitChange();
  }

  /** Get exclusions relevant to a subgraph's edges (for clipboard) */
  getRelevantExclusions(subgraph) {
    const edgeKeys = new Set(subgraph.edges.map(e => `${e.source}→${e.target}`));
    const result = {};
    for (const [key, tags] of Object.entries(this.exclusions)) {
      if (edgeKeys.has(key)) result[key] = tags;
    }
    return result;
  }

  /** Remove exclusion entries for tags that no longer exist in the current graph */
  _cleanupStaleExclusions() {
    if (!this._pathTags) return;
    const specialTypes = this.template?.specialTypes || [];
    const cleaned = {};
    for (const [edgeKey, tags] of Object.entries(this.exclusions)) {
      const edgeTags = this._pathTags.get(edgeKey);
      if (!edgeTags || edgeTags.length === 0) continue;
      const validTagSet = new Set(edgeTags.map(t => serializeTag(t, specialTypes)));
      const validTags = tags.filter(t => validTagSet.has(t));
      if (validTags.length > 0) cleaned[edgeKey] = validTags;
    }
    this.exclusions = cleaned;
  }

  /** Toggle processing indicator on the panel element */
  _setProcessing(on) {
    this._processingCount = on
      ? this._processingCount + 1
      : Math.max(0, this._processingCount - 1);
    this.panelEl?.classList.toggle('processing', this._processingCount > 0);
  }

  /** Async wrapper around _recomputePathTracking — shows processing indicator, yields to paint first */
  async _recomputePathTrackingAsync() {
    if (!this.pathTrackingEnabled) return;
    this._setProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    try { this._recomputePathTracking(); }
    finally { this._setProcessing(false); }
  }

  /** Recompute path tags and effective exclusions, then update visuals */
  _recomputePathTracking() {
    if (!this.pathTrackingEnabled) return;
    const specialTypes = this.template?.specialTypes || [];
    if (specialTypes.length === 0) return;

    this._pathTags = computePathTags(this.graph, specialTypes);
    this._effectiveExclusions = propagateExclusions(this.graph, this.exclusions, this._pathTags, specialTypes);
    this._cleanupStaleExclusions();
    // Re-propagate after cleanup to get accurate effective exclusions
    this._effectiveExclusions = propagateExclusions(this.graph, this.exclusions, this._pathTags, specialTypes);
    this._applyTrackingVisuals();
    this._updateTrackingOverlay();
    this._flashTrackingIndicator();
  }

  /** Briefly flash the panel info element to indicate path tracking was recomputed */
  _flashTrackingIndicator() {
    const el = this.panelEl?.querySelector('.panel-info');
    if (!el) return;
    el.classList.remove('tracking-flash');
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('tracking-flash');
    setTimeout(() => el.classList.remove('tracking-flash'), 300);
  }

  /** Apply tracking visual classes and tooltip data */
  _applyTrackingVisuals() {
    if (!this.pathTrackingEnabled || !this._pathTags) return;

    const specialTypes = this.template?.specialTypes || [];

    // Clear previous tracking classes
    this.cy.edges().removeClass('edge-excluded edge-all-excluded');
    this.cy.nodes().removeClass('node-fully-excluded');

    for (const edge of this.graph.edges) {
      const key = `${edge.source}→${edge.target}`;
      const tags = this._pathTags.get(key) || [];
      const excluded = this._effectiveExclusions?.get(key) || new Set();
      const cyEdge = this.cy.$id(key);
      if (cyEdge.empty()) continue;

      // Format tooltip
      const includedTags = tags.filter(t => !excluded.has(serializeTag(t, specialTypes)));
      const excludedTags = tags.filter(t => excluded.has(serializeTag(t, specialTypes)));
      const parts = [];
      if (includedTags.length) parts.push('Included: ' + includedTags.map(t => formatPathTag(t, specialTypes, this.template?.nodeTypes)).join(', '));
      if (excludedTags.length) parts.push('Excluded: ' + excludedTags.map(t => formatPathTag(t, specialTypes, this.template?.nodeTypes)).join(', '));
      cyEdge.data('pathTagsTooltip', parts.join('\n') || '(no tags)');

      // CSS classes
      if (excluded.size > 0) cyEdge.addClass('edge-excluded');
      if (tags.length > 0 && excludedTags.length === tags.length) cyEdge.addClass('edge-all-excluded');
    }

    // Mark fully excluded nodes
    for (const node of this.graph.nodes) {
      if (isNodeFullyExcluded(this.graph, node.label, this._pathTags, this._effectiveExclusions || new Map(), specialTypes)) {
        this.cy.$id(node.label).addClass('node-fully-excluded');
      }
    }

    this._applyExclusionVisibility();
  }

  /** Show or hide fully excluded elements based on showExclusions flag */
  _applyExclusionVisibility() {
    if (!this.pathTrackingEnabled) return;

    if (this.showExclusions) {
      this.cy.elements().removeClass('tracking-hidden');
    } else {
      // Hide fully excluded nodes
      this.cy.nodes('.node-fully-excluded').addClass('tracking-hidden');
      // Hide fully excluded edges
      this.cy.edges('.edge-all-excluded').addClass('tracking-hidden');
    }
  }

  /** Clear all tracking visual classes */
  _clearTrackingVisuals() {
    this.cy.elements().removeClass('edge-excluded edge-all-excluded node-fully-excluded tracking-hidden');
    this.cy.edges().data('pathTagsTooltip', null);
    this._removeTrackingOverlay();
  }

  /** Show tooltip at mouse position */
  _showTooltip(mouseEvent, text) {
    if (!this._tooltip) {
      this._tooltip = document.createElement('div');
      this._tooltip.className = 'path-tooltip';
      this.container.appendChild(this._tooltip);
    }
    this._tooltip.textContent = text;
    this._tooltip.style.display = 'block';
    const rect = this.container.getBoundingClientRect();
    this._tooltip.style.left = `${mouseEvent.clientX - rect.left + 12}px`;
    this._tooltip.style.top = `${mouseEvent.clientY - rect.top - 8}px`;
  }

  /** Hide tooltip */
  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = 'none';
  }

  /** Ensure tracking overlay (show exclusions checkbox) exists */
  _ensureTrackingOverlay() {
    if (this._trackingOverlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'tracking-overlay';
    overlay.innerHTML = `<label><input type="checkbox" class="show-exclusions-cb"> Show exclusions</label>`;
    this.container.appendChild(overlay);
    overlay.querySelector('.show-exclusions-cb').addEventListener('change', e => {
      this.setShowExclusions(e.target.checked);
    });
    this._trackingOverlay = overlay;
  }

  /** Remove tracking overlay */
  _removeTrackingOverlay() {
    if (this._trackingOverlay) {
      this._trackingOverlay.remove();
      this._trackingOverlay = null;
    }
  }

  /** Update overlay visibility and checkbox state */
  _updateTrackingOverlay() {
    if (this.pathTrackingEnabled) {
      this._ensureTrackingOverlay();
      const cb = this._trackingOverlay?.querySelector('.show-exclusions-cb');
      if (cb) cb.checked = this.showExclusions;
    } else {
      this._removeTrackingOverlay();
    }
  }

  /** Emit a change event for session auto-save */
  _emitChange() {
    window.dispatchEvent(new CustomEvent('panel-change', { detail: { panelId: this.id } }));
  }
}
