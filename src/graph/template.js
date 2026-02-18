/** Graph type definitions */
export const GRAPH_TYPES = {
  UCG:    { label: 'Undirected Cyclic Graph', directed: false, acyclic: false },
  UTree:  { label: 'Undirected Tree',         directed: false, acyclic: true, mustBeConnected: true },
  DAG:    { label: 'Directed Acyclic Graph',  directed: true,  acyclic: true },
  DG:     { label: 'Directed Graph',          directed: true,  acyclic: false },
  Forest: { label: 'Forest',                  directed: false, acyclic: true },
};

/** Default template — always exists, cannot be deleted */
export const defaultTemplate = () => ({
  name: 'Default',
  graphType: 'UCG',
  nodeTypes: [],
  edgeTypes: [],
});

/** Create a new named template */
export const createTemplate = (name, graphType = 'UCG') => ({
  name,
  graphType,
  nodeTypes: [],
  edgeTypes: [],
});

export const addNodeType = (template, nodeType) => ({
  ...template,
  nodeTypes: [...template.nodeTypes, nodeType],
});

export const addEdgeType = (template, edgeType) => ({
  ...template,
  edgeTypes: [...template.edgeTypes, edgeType],
});

export const removeNodeType = (template, id) => ({
  ...template,
  nodeTypes: template.nodeTypes.filter(nt => nt.id !== id),
});

export const removeEdgeType = (template, id) => ({
  ...template,
  edgeTypes: template.edgeTypes.filter(et => et.id !== id),
});

export const updateNodeType = (template, id, changes) => ({
  ...template,
  nodeTypes: template.nodeTypes.map(nt => nt.id === id ? { ...nt, ...changes } : nt),
});

export const updateEdgeType = (template, id, changes) => ({
  ...template,
  edgeTypes: template.edgeTypes.map(et => et.id === id ? { ...et, ...changes } : et),
});
