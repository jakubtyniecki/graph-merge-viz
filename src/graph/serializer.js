import { createGraph } from './model.js';

/**
 * Validate a graph object has the expected shape.
 * Returns { ok: true, graph } or { ok: false, error: string }
 */
export function validateGraph(data) {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Invalid data: expected an object' };
  }
  if (!Array.isArray(data.nodes)) {
    return { ok: false, error: 'Invalid data: missing nodes array' };
  }
  if (!Array.isArray(data.edges)) {
    return { ok: false, error: 'Invalid data: missing edges array' };
  }

  const labels = new Set();
  for (const node of data.nodes) {
    if (!node.label || typeof node.label !== 'string') {
      return { ok: false, error: `Invalid node: missing or invalid label` };
    }
    if (labels.has(node.label)) {
      return { ok: false, error: `Duplicate node label: "${node.label}"` };
    }
    labels.add(node.label);
    if (node.props && typeof node.props !== 'object') {
      return { ok: false, error: `Invalid props on node "${node.label}"` };
    }
  }

  for (const edge of data.edges) {
    if (!edge.source || !edge.target) {
      return { ok: false, error: 'Invalid edge: missing source or target' };
    }
    if (!labels.has(edge.source)) {
      return { ok: false, error: `Edge references unknown source: "${edge.source}"` };
    }
    if (!labels.has(edge.target)) {
      return { ok: false, error: `Edge references unknown target: "${edge.target}"` };
    }
    if (edge.props && typeof edge.props !== 'object') {
      return { ok: false, error: `Invalid props on edge "${edge.source}→${edge.target}"` };
    }
  }

  // Normalize: ensure props exists, preserve type
  const graph = {
    nodes: data.nodes.map(n => ({ label: n.label, type: n.type || null, props: n.props || {} })),
    edges: data.edges.map(e => ({ source: e.source, target: e.target, type: e.type || null, props: e.props || {} })),
  };

  return { ok: true, graph };
}

/** Serialize graph to JSON string */
export const toJSON = graph => JSON.stringify(graph, null, 2);

/** Parse JSON string to graph with validation */
export function fromJSON(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    return validateGraph(data);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e.message}` };
  }
}

/** Trigger file download of graph as JSON */
export function exportToFile(graph, filename = 'graph.json') {
  const blob = new Blob([toJSON(graph)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Open file picker and read graph JSON. Returns Promise<{ok, graph?, error?}> */
export function importFromFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return resolve({ ok: false, error: 'No file selected' });
      try {
        const text = await file.text();
        resolve(fromJSON(text));
      } catch (e) {
        resolve({ ok: false, error: `Failed to read file: ${e.message}` });
      }
    };
    input.click();
  });
}
