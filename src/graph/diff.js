import { nodeKey, edgeKey } from './model.js';

/**
 * Compare baseGraph vs currentGraph → DiffEntry[]
 *
 * DiffEntry: { type, action, key, oldProps, newProps }
 *   type: "node" | "edge"
 *   action: "added" | "removed" | "modified"
 *   key: label (nodes) or "source→target" (edges)
 */
export function computeDiff(baseGraph, currentGraph) {
  if (!baseGraph) return [];

  const diffs = [];

  // Build lookup maps
  const baseNodes = new Map(baseGraph.nodes.map(n => [nodeKey(n), n]));
  const currNodes = new Map(currentGraph.nodes.map(n => [nodeKey(n), n]));
  const baseEdges = new Map(baseGraph.edges.map(e => [edgeKey(e), e]));
  const currEdges = new Map(currentGraph.edges.map(e => [edgeKey(e), e]));

  // Node diffs
  for (const [key, node] of currNodes) {
    if (!baseNodes.has(key)) {
      diffs.push({ type: 'node', action: 'added', key, oldProps: null, newProps: node.props });
    } else {
      const base = baseNodes.get(key);
      if (!propsEqual(base.props, node.props)) {
        diffs.push({ type: 'node', action: 'modified', key, oldProps: base.props, newProps: node.props });
      }
    }
  }
  for (const [key, node] of baseNodes) {
    if (!currNodes.has(key)) {
      diffs.push({ type: 'node', action: 'removed', key, oldProps: node.props, newProps: null });
    }
  }

  // Edge diffs
  for (const [key, edge] of currEdges) {
    if (!baseEdges.has(key)) {
      diffs.push({ type: 'edge', action: 'added', key, oldProps: null, newProps: edge.props });
    } else {
      const base = baseEdges.get(key);
      if (!propsEqual(base.props, edge.props)) {
        diffs.push({ type: 'edge', action: 'modified', key, oldProps: base.props, newProps: edge.props });
      }
    }
  }
  for (const [key, edge] of baseEdges) {
    if (!currEdges.has(key)) {
      diffs.push({ type: 'edge', action: 'removed', key, oldProps: edge.props, newProps: null });
    }
  }

  return diffs;
}

function propsEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(k => a[k] === b[k]);
}
