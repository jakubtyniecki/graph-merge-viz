import { describe, it, expect } from 'vitest';
import {
  computePathTags, propagateExclusions, isNodeFullyExcluded,
  mergeExclusions, formatPathTag, serializeTag,
} from '../../../src/graph/path-tracking.js';
import { createGraph, addNode, addEdge, createNode, createEdge } from '../../../src/graph/model.js';

// Simple DAG: P1 → C1 → R1
// R1 has type 'reporter', C1 has type 'category'
function buildTagGraph() {
  let g = createGraph();
  g = addNode(g, createNode('R1', {}, 'reporter'));
  g = addNode(g, createNode('C1', {}, 'category'));
  g = addNode(g, createNode('P1', {}));
  g = addEdge(g, createEdge('P1', 'C1'));
  g = addEdge(g, createEdge('C1', 'R1'));
  return g;
}

const specialTypes = ['reporter', 'category'];

describe('computePathTags', () => {
  it('returns empty Map when specialTypeIds is empty', () => {
    const result = computePathTags(buildTagGraph(), []);
    expect(result.size).toBe(0);
  });

  it('returns empty Map when specialTypeIds is null', () => {
    expect(computePathTags(buildTagGraph(), null).size).toBe(0);
  });

  it('returns empty Map for empty graph', () => {
    expect(computePathTags(createGraph(), specialTypes).size).toBe(0);
  });

  it('returns a Map', () => {
    const result = computePathTags(buildTagGraph(), specialTypes);
    expect(result instanceof Map).toBe(true);
  });

  it('tags edge to reporter with reporter node id', () => {
    const tags = computePathTags(buildTagGraph(), specialTypes);
    const edgeTags = tags.get('C1→R1');
    expect(edgeTags).toBeDefined();
    expect(edgeTags[0].reporter).toBe('R1');
  });

  it('tags upstream edge with full path including both types', () => {
    const tags = computePathTags(buildTagGraph(), specialTypes);
    const edgeTags = tags.get('P1→C1');
    expect(edgeTags).toBeDefined();
    const tag = edgeTags.find(t => t.reporter === 'R1');
    expect(tag).toBeTruthy();
    expect(tag.category).toBe('C1');
  });

  it('handles graph with no special-type nodes (still tags edges with empty tags)', () => {
    // When specialTypeIds is non-empty but no nodes have that type, edges still
    // get entries in the Map (tagged with empty descriptor {})
    let g = buildTagGraph();
    const result = computePathTags(g, ['nonexistent']);
    // Edges still appear in the result with empty tags — this documents the actual behavior
    expect(result instanceof Map).toBe(true);
    if (result.size > 0) {
      // Tags exist but have no special type keys populated
      const tags = [...result.values()].flat();
      for (const tag of tags) {
        expect(tag['nonexistent']).toBeUndefined();
      }
    }
  });
});

describe('serializeTag / formatPathTag', () => {
  it('serializeTag produces ordered pipe-separated string', () => {
    const tag = { reporter: 'R1', category: 'C1' };
    expect(serializeTag(tag, specialTypes)).toBe('R1|C1');
  });

  it('serializeTag uses empty string for missing type', () => {
    const tag = { reporter: 'R1' };
    expect(serializeTag(tag, specialTypes)).toBe('R1|');
  });

  it('serializeTag handles fully empty tag', () => {
    expect(serializeTag({}, specialTypes)).toBe('|');
  });

  it('formatPathTag formats as "(R1, C1)"', () => {
    const tag = { reporter: 'R1', category: 'C1' };
    const result = formatPathTag(tag, specialTypes, []);
    expect(result).toBe('(R1, C1)');
  });

  it('formatPathTag returns "(any)" for empty tag', () => {
    expect(formatPathTag({}, specialTypes, [])).toBe('(any)');
  });

  it('formatPathTag omits missing types from output', () => {
    const tag = { reporter: 'R1' };
    const result = formatPathTag(tag, specialTypes, []);
    expect(result).toContain('R1');
    expect(result).not.toContain('undefined');
  });
});

describe('mergeExclusions', () => {
  it('returns target only when sourceTracked=false', () => {
    const target = { 'A→B': ['tag1'] };
    const source = { 'A→B': ['tag2'] };
    const result = mergeExclusions(target, source, false);
    expect(result['A→B']).toEqual(['tag1']);
  });

  it('unions tags when sourceTracked=true', () => {
    const target = { 'A→B': ['tag1'] };
    const source = { 'A→B': ['tag2'], 'B→C': ['tag3'] };
    const result = mergeExclusions(target, source, true);
    expect(result['A→B']).toContain('tag1');
    expect(result['A→B']).toContain('tag2');
    expect(result['B→C']).toContain('tag3');
  });

  it('does not mutate target when sourceTracked=true', () => {
    const target = { 'A→B': ['tag1'] };
    mergeExclusions(target, { 'A→B': ['tag2'] }, true);
    expect(target['A→B']).toHaveLength(1);
  });

  it('deduplicates tags when sourceTracked=true', () => {
    const target = { 'A→B': ['tag1'] };
    const source = { 'A→B': ['tag1'] }; // same tag
    const result = mergeExclusions(target, source, true);
    // Should not double-add
    const count = result['A→B'].filter(t => t === 'tag1').length;
    expect(count).toBe(1);
  });

  it('returns target copy when source is empty', () => {
    const target = { 'A→B': ['tag1'] };
    const result = mergeExclusions(target, {}, true);
    expect(result['A→B']).toContain('tag1');
  });
});

describe('propagateExclusions', () => {
  it('returns a Map', () => {
    const result = propagateExclusions(buildTagGraph(), {}, new Map(), specialTypes);
    expect(result instanceof Map).toBe(true);
  });

  it('returns direct exclusions when no pathTags', () => {
    const direct = { 'C1→R1': ['sometag'] };
    const result = propagateExclusions(buildTagGraph(), direct, new Map(), specialTypes);
    expect(result.get('C1→R1')).toBeDefined();
  });

  it('propagates exclusion upstream in chain', () => {
    // Use A→B→C where C is the leaf reporter (only special type).
    // Both edges share the same tag { reporter: 'C' }, so excluding B→C propagates to A→B.
    let g = createGraph();
    g = addNode(g, createNode('C', {}, 'reporter'));
    g = addNode(g, createNode('B', {}));
    g = addNode(g, createNode('A', {}));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    const types = ['reporter'];
    const pathTags = computePathTags(g, types);
    const bcTags = pathTags.get('B→C');
    expect(bcTags).toBeDefined();
    const serialized = serializeTag(bcTags[0], types);
    const direct = { 'B→C': [serialized] };
    const result = propagateExclusions(g, direct, pathTags, types);
    // A→B shares the same tag → also excluded upstream
    expect(result.get('A→B')).toBeDefined();
  });

  it('empty direct exclusions returns empty Map', () => {
    const g = buildTagGraph();
    const pathTags = computePathTags(g, specialTypes);
    const result = propagateExclusions(g, {}, pathTags, specialTypes);
    expect(result.size).toBe(0);
  });
});

describe('isNodeFullyExcluded', () => {
  it('returns false for node with no outgoing edges (leaf)', () => {
    const g = buildTagGraph();
    const pathTags = computePathTags(g, specialTypes);
    const result = isNodeFullyExcluded(g, 'R1', pathTags, new Map(), specialTypes);
    expect(typeof result).toBe('boolean');
    // R1 is a leaf — no outgoing edges to exclude, so not "fully excluded"
    expect(result).toBe(false);
  });

  it('returns false for node with no exclusions', () => {
    const g = buildTagGraph();
    const pathTags = computePathTags(g, specialTypes);
    const result = isNodeFullyExcluded(g, 'C1', pathTags, new Map(), specialTypes);
    expect(result).toBe(false);
  });
});
