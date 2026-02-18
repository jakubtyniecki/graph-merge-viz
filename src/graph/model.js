/** Deep clone a plain object */
export const deepClone = obj => JSON.parse(JSON.stringify(obj));

/** Create an empty graph */
export const createGraph = () => ({ nodes: [], edges: [] });

/** Node identity key */
export const nodeKey = node => node.label;

/** Edge identity key */
export const edgeKey = edge => `${edge.source}→${edge.target}`;

/** Create a node */
export const createNode = (label, props = {}, type = null) => ({ label, type, props: { ...props } });

/** Create an edge */
export const createEdge = (source, target, props = {}, type = null) => ({ source, target, type, props: { ...props } });

/** Find node by label */
export const findNode = (graph, label) => graph.nodes.find(n => n.label === label);

/** Find edge by source+target */
export const findEdge = (graph, source, target) =>
  graph.edges.find(e => e.source === source && e.target === target);

/** Add node to graph (returns new graph) */
export const addNode = (graph, node) => ({
  nodes: [...graph.nodes, { ...node, props: { ...node.props } }],
  edges: [...graph.edges],
});

/** Add edge to graph (returns new graph) */
export const addEdge = (graph, edge) => ({
  nodes: [...graph.nodes],
  edges: [...graph.edges, { ...edge, props: { ...edge.props } }],
});

/** Remove node and its connected edges (returns new graph) */
export const removeNode = (graph, label) => ({
  nodes: graph.nodes.filter(n => n.label !== label),
  edges: graph.edges.filter(e => e.source !== label && e.target !== label),
});

/** Remove edge (returns new graph) */
export const removeEdge = (graph, source, target) => ({
  nodes: [...graph.nodes],
  edges: graph.edges.filter(e => !(e.source === source && e.target === target)),
});

/** Update node props (returns new graph) */
export const updateNodeProps = (graph, label, props) => ({
  nodes: graph.nodes.map(n => n.label === label ? { ...n, props: { ...props } } : n),
  edges: [...graph.edges],
});

/** Update edge props (returns new graph) */
export const updateEdgeProps = (graph, source, target, props) => ({
  nodes: [...graph.nodes],
  edges: graph.edges.map(e =>
    (e.source === source && e.target === target) ? { ...e, props: { ...props } } : e
  ),
});

/** Get all node labels */
export const nodeLabels = graph => graph.nodes.map(n => n.label);

/** Check if graph is empty */
export const isEmpty = graph => graph.nodes.length === 0 && graph.edges.length === 0;

/** Check if two graphs are structurally equal */
export const graphsEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Get subgraph of root node and all its ancestors (BFS backwards from root) */
export const getAncestorSubgraph = (graph, rootLabel) => {
  const collected = new Set();
  const queue = [rootLabel];

  while (queue.length > 0) {
    const current = queue.shift();
    if (collected.has(current)) continue;
    collected.add(current);

    // Follow edges backwards (target → source)
    for (const edge of graph.edges) {
      if (edge.target === current && !collected.has(edge.source)) {
        queue.push(edge.source);
      }
    }
  }

  return {
    nodes: graph.nodes.filter(n => collected.has(n.label)).map(n => deepClone(n)),
    edges: graph.edges.filter(e => collected.has(e.source) && collected.has(e.target)).map(e => deepClone(e)),
  };
};
