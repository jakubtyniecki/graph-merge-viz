import { nodeKey, edgeKey, deepClone } from './model.js';

/**
 * Merge incoming graph into target graph.
 * Incoming wins on conflicts (property overwrites).
 * Returns new merged graph.
 */
export function mergeGraphs(targetGraph, incomingGraph) {
  const targetNodes = new Map(targetGraph.nodes.map(n => [nodeKey(n), deepClone(n)]));
  const targetEdges = new Map(targetGraph.edges.map(e => [edgeKey(e), deepClone(e)]));

  // Merge nodes: incoming wins
  for (const node of incomingGraph.nodes) {
    const key = nodeKey(node);
    if (targetNodes.has(key)) {
      // Overwrite props
      targetNodes.get(key).props = { ...node.props };
    } else {
      targetNodes.set(key, deepClone(node));
    }
  }

  // Merge edges: incoming wins
  for (const edge of incomingGraph.edges) {
    const key = edgeKey(edge);
    if (targetEdges.has(key)) {
      targetEdges.get(key).props = { ...edge.props };
    } else {
      targetEdges.set(key, deepClone(edge));
    }
  }

  return {
    nodes: [...targetNodes.values()],
    edges: [...targetEdges.values()],
  };
}
