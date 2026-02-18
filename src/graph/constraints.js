import { GRAPH_TYPES } from './template.js';

/** BFS from target following directed edges; returns true if source is reachable (cycle would form) */
function wouldCreateDirectedCycle(graph, source, target) {
  const visited = new Set();
  const queue = [target];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }
  return false;
}

/** BFS treating all edges as bidirectional; returns true if source and target are already connected */
function wouldCreateUndirectedCycle(graph, source, target) {
  const visited = new Set();
  const queue = [source];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
      if (edge.target === current && !visited.has(edge.source)) queue.push(edge.source);
    }
  }
  return false;
}

export function wouldCreateCycle(graph, source, target, directed) {
  return directed
    ? wouldCreateDirectedCycle(graph, source, target)
    : wouldCreateUndirectedCycle(graph, source, target);
}

/** Check if an undirected graph is connected */
export function isConnected(graph) {
  if (graph.nodes.length === 0) return true;
  const visited = new Set();
  const queue = [graph.nodes[0].label];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of graph.edges) {
      if (edge.source === current && !visited.has(edge.target)) queue.push(edge.target);
      if (edge.target === current && !visited.has(edge.source)) queue.push(edge.source);
    }
  }
  return visited.size === graph.nodes.length;
}

/** Check if removing a node would disconnect the undirected graph */
export function wouldDisconnectOnNodeRemove(graph, nodeLabel) {
  const reduced = {
    nodes: graph.nodes.filter(n => n.label !== nodeLabel),
    edges: graph.edges.filter(e => e.source !== nodeLabel && e.target !== nodeLabel),
  };
  return reduced.nodes.length > 1 && !isConnected(reduced);
}

/** Check if removing an edge would disconnect the undirected graph */
export function wouldDisconnectOnEdgeRemove(graph, source, target) {
  const reduced = {
    nodes: [...graph.nodes],
    edges: graph.edges.filter(e => !(e.source === source && e.target === target)),
  };
  return !isConnected(reduced);
}

/** Check if undirected edge already exists in either direction */
export function hasDuplicateUndirectedEdge(graph, source, target) {
  return graph.edges.some(e =>
    (e.source === source && e.target === target) ||
    (e.source === target && e.target === source)
  );
}

/** Validate an edge addition against graph type constraints.
 *  Returns { ok: true } or { ok: false, error: string } */
export function validateEdgeAdd(graph, source, target, graphType) {
  const typeInfo = GRAPH_TYPES[graphType];
  if (!typeInfo) return { ok: true };

  if (source === target) return { ok: false, error: 'Self-loops are not allowed' };

  if (!typeInfo.directed && hasDuplicateUndirectedEdge(graph, source, target)) {
    return { ok: false, error: `Edge ${source}–${target} already exists` };
  }

  if (typeInfo.directed && graph.edges.some(e => e.source === source && e.target === target)) {
    return { ok: false, error: `Edge ${source}→${target} already exists` };
  }

  if (typeInfo.acyclic && wouldCreateCycle(graph, source, target, typeInfo.directed)) {
    return { ok: false, error: `Adding this edge would create a cycle (${typeInfo.label} must be acyclic)` };
  }

  return { ok: true };
}

/** DFS/Union-Find cycle detection on a complete graph (for post-merge validation) */
export function hasCycle(graph, directed) {
  if (directed) {
    const visited = new Set();
    const inStack = new Set();

    const dfs = (node) => {
      visited.add(node);
      inStack.add(node);
      for (const edge of graph.edges) {
        if (edge.source !== node) continue;
        if (inStack.has(edge.target)) return true;
        if (!visited.has(edge.target) && dfs(edge.target)) return true;
      }
      inStack.delete(node);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.label) && dfs(node.label)) return true;
    }
    return false;
  } else {
    const parent = {};
    for (const node of graph.nodes) parent[node.label] = node.label;

    const find = (x) => {
      if (parent[x] !== x) parent[x] = find(parent[x]);
      return parent[x];
    };

    for (const edge of graph.edges) {
      const rootA = find(edge.source);
      const rootB = find(edge.target);
      if (rootA === rootB) return true;
      parent[rootA] = rootB;
    }
    return false;
  }
}
