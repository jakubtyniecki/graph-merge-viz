import { nodeKey, edgeKey, deepClone } from './model.js';

/**
 * Filter a graph to only nodes upstream of (and including) the given scope node IDs.
 * "Upstream" means nodes reachable by traversing edges in reverse direction.
 * Returns a new subgraph containing only visited nodes and edges between them.
 */
export function filterUpstreamSubgraph(graph, scopeNodeIds) {
  if (!scopeNodeIds || scopeNodeIds.length === 0) return graph;

  const visited = new Set(scopeNodeIds);
  const queue = [...scopeNodeIds];

  // BFS backward (against edge direction) from scope nodes
  while (queue.length > 0) {
    const nodeId = queue.shift();
    for (const edge of graph.edges) {
      if (edge.target === nodeId && !visited.has(edge.source)) {
        visited.add(edge.source);
        queue.push(edge.source);
      }
    }
  }

  return {
    nodes: graph.nodes.filter(n => visited.has(n.label)),
    edges: graph.edges.filter(e => visited.has(e.source) && visited.has(e.target)),
  };
}

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
