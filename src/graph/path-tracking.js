/**
 * Path Tracking — pure functions for DAG path tag computation.
 *
 * A "path tag" is an object mapping specialTypeId → nodeLabel,
 * representing one complete path from the current edge downstream to
 * the leaf-end special-type nodes.
 *
 * Example: specialTypes = ['R_type', 'C_type']
 *   Graph: P1 → C1 → R1
 *   Tags on edge P1→C1: [{ R_type: 'R1', C_type: 'C1' }]
 *   Tags on edge C1→R1: [{ R_type: 'R1' }]
 */

/** Topological sort of nodes (leaves first). Returns node labels in order. */
function topoSort(graph) {
  // Build adjacency: source → [targets]
  const outEdges = new Map();
  const inDegree = new Map();
  for (const node of graph.nodes) {
    outEdges.set(node.label, []);
    inDegree.set(node.label, 0);
  }
  for (const edge of graph.edges) {
    const targets = outEdges.get(edge.source);
    if (targets) targets.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  // Kahn's algorithm — start from leaves (in-degree === 0 means no incoming = leaf in reverse)
  // We want leaves first, so start from nodes with out-degree === 0
  const outDegree = new Map();
  for (const node of graph.nodes) outDegree.set(node.label, 0);
  for (const edge of graph.edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  const queue = [];
  for (const node of graph.nodes) {
    if (outDegree.get(node.label) === 0) queue.push(node.label);
  }

  const order = [];
  const processed = new Set();
  while (queue.length > 0) {
    const label = queue.shift();
    if (processed.has(label)) continue;
    processed.add(label);
    order.push(label);
    // Find nodes that point to this label (parents)
    for (const edge of graph.edges) {
      if (edge.target === label) {
        const parent = edge.source;
        outDegree.set(parent, (outDegree.get(parent) || 1) - 1);
        if (outDegree.get(parent) === 0) queue.push(parent);
      }
    }
  }

  // Add any unprocessed nodes (cycle members) at the end
  for (const node of graph.nodes) {
    if (!processed.has(node.label)) order.push(node.label);
  }

  return order;
}

/**
 * Compute path tags for every edge in a DAG.
 * Returns Map<edgeKey, PathTag[]> where edgeKey = "source→target"
 * and PathTag = { [specialTypeId]: nodeLabel }
 *
 * Algorithm (leaves-first traversal):
 * 1. For each leaf node: if it's a special type, its descriptor is { specialTypeId: label }
 *    Otherwise: one empty descriptor {}
 * 2. For each non-leaf node:
 *    - Union all children's descriptors
 *    - If this node has a special type, inject it into each descriptor
 * 3. Edge source→target: tags = target's descriptors
 */
export function computePathTags(graph, specialTypeIds) {
  if (!specialTypeIds || specialTypeIds.length === 0) {
    return new Map();
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.label, n]));

  // Build children map: label → [child labels]
  const children = new Map(graph.nodes.map(n => [n.label, []]));
  for (const edge of graph.edges) {
    const ch = children.get(edge.source);
    if (ch) ch.push(edge.target);
  }

  const order = topoSort(graph);
  // nodeDescriptors: Map<label, PathTag[]>
  const nodeDescriptors = new Map();

  for (const label of order) {
    const node = nodeMap.get(label);
    if (!node) continue;

    const nodeChildren = children.get(label) || [];
    let descriptors;

    if (nodeChildren.length === 0) {
      // Leaf node
      if (node.type && specialTypeIds.includes(node.type)) {
        descriptors = [{ [node.type]: label }];
      } else {
        descriptors = [{}];
      }
    } else {
      // Union children's descriptors
      descriptors = [];
      for (const childLabel of nodeChildren) {
        const childDesc = nodeDescriptors.get(childLabel) || [{}];
        descriptors.push(...childDesc);
      }
      // Deduplicate descriptors by serialization
      const seen = new Set();
      descriptors = descriptors.filter(d => {
        const key = serializeTag(d, specialTypeIds);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Inject this node's type into each descriptor
      if (node.type && specialTypeIds.includes(node.type)) {
        descriptors = descriptors.map(d => ({ ...d, [node.type]: label }));
      }
    }

    nodeDescriptors.set(label, descriptors);
  }

  // Build edge → tags: tags of target node
  const result = new Map();
  for (const edge of graph.edges) {
    const key = `${edge.source}→${edge.target}`;
    result.set(key, nodeDescriptors.get(edge.target) || [{}]);
  }

  return result;
}

/**
 * Propagate exclusions upstream through the DAG.
 * An exclusion on edge A→B (for tag T) propagates to all edges C→A that also have tag T.
 *
 * @param {object} graph
 * @param {object} directExclusions - { "edgeKey": string[] } serialized tag arrays
 * @param {Map} pathTags - from computePathTags
 * @param {string[]} specialTypeIds - for consistent serialization
 * @returns {Map<edgeKey, Set<serializedTag>>} effective exclusions (direct + propagated)
 */
export function propagateExclusions(graph, directExclusions, pathTags, specialTypeIds = []) {
  const effective = new Map();

  // Initialize with direct exclusions (convert to Sets)
  for (const [key, tags] of Object.entries(directExclusions)) {
    const tagSet = Array.isArray(tags) ? new Set(tags) : new Set(Object.keys(tags).length ? [tags] : []);
    if (tagSet.size > 0) effective.set(key, tagSet);
  }

  if (!pathTags || pathTags.size === 0) return effective;

  // Build parent map: label → [parent edge sources]
  const parents = new Map();
  for (const node of graph.nodes) parents.set(node.label, []);
  for (const edge of graph.edges) {
    const p = parents.get(edge.target);
    if (p) p.push(edge.source);
  }

  // BFS upstream from each excluded edge — seed from SOURCE of excluded edge
  const queue = [];
  for (const [key, tags] of effective) {
    const [source] = key.split('→');
    queue.push({ target: source, tags: new Set(tags) });
  }

  const visited = new Set();
  while (queue.length > 0) {
    const { target, tags } = queue.shift();
    const visitKey = `${target}:${[...tags].sort().join(',')}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);

    // For each parent edge (parent → target), propagate matching tags
    for (const parentLabel of (parents.get(target) || [])) {
      const edgeKey = `${parentLabel}→${target}`;
      const edgeTags = pathTags.get(edgeKey);
      if (!edgeTags) continue;

      // Find tags that appear in this edge's path tags (use same specialTypeIds for consistency)
      const edgeTagsSet = new Set(edgeTags.map(t => serializeTag(t, specialTypeIds)));
      const matchingTags = new Set([...tags].filter(t => edgeTagsSet.has(t)));

      if (matchingTags.size > 0) {
        const existing = effective.get(edgeKey) || new Set();
        const merged = new Set([...existing, ...matchingTags]);
        effective.set(edgeKey, merged);

        // Continue upstream
        queue.push({ target: parentLabel, tags: matchingTags });
      }
    }
  }

  return effective;
}

/**
 * Check if a node is "fully excluded" — all outgoing edges from it
 * have all their tags excluded.
 *
 * @param {object} graph
 * @param {string} nodeLabel
 * @param {Map} pathTags - from computePathTags
 * @param {Map} effectiveExclusions - from propagateExclusions
 * @param {string[]} specialTypeIds - for consistent serialization
 */
export function isNodeFullyExcluded(graph, nodeLabel, pathTags, effectiveExclusions, specialTypeIds = []) {
  const outgoing = graph.edges.filter(e => e.source === nodeLabel);
  if (outgoing.length === 0) return false; // leaf nodes are never "fully excluded"

  for (const edge of outgoing) {
    const key = `${edge.source}→${edge.target}`;
    const tags = pathTags.get(key) || [];
    const excluded = effectiveExclusions.get(key) || new Set();
    // If any tag on this edge is NOT excluded, node is not fully excluded
    for (const tag of tags) {
      const serialized = serializeTag(tag, specialTypeIds);
      if (!excluded.has(serialized)) return false;
    }
  }
  return true;
}

/**
 * Merge exclusions from two sources (for merge/paste).
 * Target exclusions preserved. Source exclusions added for overlapping edges only.
 * If sourceTracked is false, treat as untracked — preserve target only.
 *
 * @param {object} targetExcl - { edgeKey: string[] }
 * @param {object} sourceExcl - { edgeKey: string[] }
 * @param {boolean} sourceTracked
 * @returns {object} merged exclusions
 */
export function mergeExclusions(targetExcl, sourceExcl, sourceTracked) {
  if (!sourceTracked || !sourceExcl) return { ...targetExcl };

  const result = { ...targetExcl };
  for (const [key, tags] of Object.entries(sourceExcl)) {
    if (result[key]) {
      // Merge: union of both
      const merged = new Set([...result[key], ...tags]);
      result[key] = [...merged];
    } else {
      result[key] = [...tags];
    }
  }
  return result;
}

/**
 * Format a path tag for human display: "(R1, C1)" or "(R1)"
 * Uses specialTypeIds for ordering, nodeTypes for type labels.
 */
export function formatPathTag(tag, specialTypeIds, nodeTypes) {
  const parts = [];
  for (const typeId of specialTypeIds) {
    if (tag[typeId]) {
      parts.push(tag[typeId]);
    }
  }
  if (parts.length === 0) return '(any)';
  return `(${parts.join(', ')})`;
}

/**
 * Serialize a path tag to a stable string key: "R1|C1"
 * Uses specialTypeIds for ordering.
 */
export function serializeTag(tag, specialTypeIds) {
  return specialTypeIds.map(id => tag[id] || '').join('|');
}
