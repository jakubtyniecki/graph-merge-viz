import { nodeKey, edgeKey, deepClone } from './model.js';

/**
 * Merge incoming graph into target graph.
 * Incoming wins on conflicts (property overwrites).
 * If incomingBaseGraph is provided, deletions are also applied:
 *   - Elements in incomingBaseGraph but not in incomingGraph are deleted from target.
 * Returns new merged graph.
 */
export function mergeGraphs(targetGraph, incomingGraph, incomingBaseGraph = null) {
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

  // Apply deletions if baseGraph provided
  if (incomingBaseGraph) {
    const incomingNodeKeys = new Set(incomingGraph.nodes.map(n => nodeKey(n)));
    const incomingEdgeKeys = new Set(incomingGraph.edges.map(e => edgeKey(e)));

    // Nodes deleted in source (in base but not current)
    for (const node of incomingBaseGraph.nodes) {
      const key = nodeKey(node);
      if (!incomingNodeKeys.has(key)) {
        targetNodes.delete(key);
      }
    }

    // Edges deleted in source
    for (const edge of incomingBaseGraph.edges) {
      const key = edgeKey(edge);
      if (!incomingEdgeKeys.has(key)) {
        targetEdges.delete(key);
      }
    }

    // Clean up orphan edges (edges pointing to deleted nodes)
    const finalNodeKeys = new Set(targetNodes.keys());
    for (const [key, edge] of targetEdges) {
      if (!finalNodeKeys.has(edge.source) || !finalNodeKeys.has(edge.target)) {
        targetEdges.delete(key);
      }
    }
  }

  return {
    nodes: [...targetNodes.values()],
    edges: [...targetEdges.values()],
  };
}
