import { describe, it, expect } from 'vitest';
import { mergeGraphs, filterUpstreamSubgraph } from '../../../src/graph/merge.js';
import { createGraph, addNode, addEdge, createNode, createEdge } from '../../../src/graph/model.js';

function buildGraph(...labels) {
  return labels.reduce((g, l) => addNode(g, createNode(l)), createGraph());
}

describe('mergeGraphs — no base (additive only)', () => {
  it('adds incoming nodes to target', () => {
    const target = buildGraph('A');
    const incoming = buildGraph('B', 'C');
    const result = mergeGraphs(target, incoming);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('incoming props win on conflict', () => {
    const target = addNode(createGraph(), createNode('A', { x: '1' }));
    const incoming = addNode(createGraph(), createNode('A', { x: '99' }));
    const result = mergeGraphs(target, incoming);
    expect(result.nodes.find(n => n.label === 'A').props.x).toBe('99');
  });

  it('does not apply deletions without base', () => {
    const target = buildGraph('A', 'B');
    const incoming = buildGraph('A'); // B "missing" but no base = no deletion
    const result = mergeGraphs(target, incoming);
    expect(result.nodes).toHaveLength(2);
  });

  it('does not mutate target graph', () => {
    const target = buildGraph('A');
    const incoming = buildGraph('B');
    mergeGraphs(target, incoming);
    expect(target.nodes).toHaveLength(1);
  });

  it('preserves target-only nodes', () => {
    const target = buildGraph('A', 'B');
    const incoming = buildGraph('C');
    const result = mergeGraphs(target, incoming);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('adds incoming edges', () => {
    const target = buildGraph('A', 'B');
    let incoming = buildGraph('A', 'B');
    incoming = addEdge(incoming, createEdge('A', 'B'));
    const result = mergeGraphs(target, incoming);
    expect(result.edges).toHaveLength(1);
  });

  it('preserves node type on merge', () => {
    const target = buildGraph('A');
    const incoming = addNode(createGraph(), createNode('B', {}, 'myType'));
    const result = mergeGraphs(target, incoming);
    expect(result.nodes.find(n => n.label === 'B').type).toBe('myType');
  });
});

describe('mergeGraphs — with base (deletions)', () => {
  it('deletes nodes removed from source since base', () => {
    const base = buildGraph('A', 'B');
    const source = buildGraph('A');          // B removed in source
    const target = buildGraph('A', 'B', 'C'); // target has C too
    const result = mergeGraphs(target, source, base);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'C']); // B deleted, C preserved
  });

  it('removes orphan edges when source node deleted', () => {
    let base = addEdge(buildGraph('A', 'B'), createEdge('A', 'B'));
    let source = buildGraph('A');            // B and A→B removed in source
    let target = addEdge(buildGraph('A', 'B', 'C'), createEdge('A', 'B'));
    const result = mergeGraphs(target, source, base);
    expect(result.edges).toHaveLength(0);
  });

  it('applies source deletions but preserves target-only nodes', () => {
    const base = buildGraph('A');
    const source = createGraph();            // A removed in source
    const target = buildGraph('A', 'B');     // B is target-only
    const result = mergeGraphs(target, source, base);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['B']);
  });

  it('does not delete target nodes that were never in base', () => {
    const base = buildGraph('A');
    const source = buildGraph('A');          // unchanged
    const target = buildGraph('A', 'B');     // B added after base
    const result = mergeGraphs(target, source, base);
    expect(result.nodes.map(n => n.label).sort()).toEqual(['A', 'B']);
  });
});

describe('scoped merge with filtered base', () => {
  it('scoped merge does not delete non-scope nodes from target', () => {
    // base: A→B + D. source: A→B (D removed from source but D is NOT in scope)
    // target: A→B + D (same as base). scope = ['B'].
    // With filtered base, baseFiltered = {A, B, A→B} (D excluded, not upstream of B)
    // → D should NOT be deleted from target
    let baseGraph = createGraph();
    baseGraph = addNode(addNode(addNode(baseGraph, createNode('A')), createNode('B')), createNode('D'));
    baseGraph = addEdge(baseGraph, createEdge('A', 'B'));

    let source = createGraph();
    source = addNode(addNode(source, createNode('A')), createNode('B'));
    source = addEdge(source, createEdge('A', 'B'));

    let target = createGraph();
    target = addNode(addNode(addNode(target, createNode('A')), createNode('B')), createNode('D'));
    target = addEdge(target, createEdge('A', 'B'));

    const scopeNodes = ['B'];
    const filtered = filterUpstreamSubgraph(source, scopeNodes);
    const baseFiltered = filterUpstreamSubgraph(baseGraph, scopeNodes);
    const result = mergeGraphs(target, filtered, baseFiltered);
    expect(result.nodes.map(n => n.label)).toContain('D');
  });

  it('scoped merge with full base (the bug) deletes non-scope nodes', () => {
    // Same setup, but pass full base — D gets wrongly deleted
    let baseGraph = createGraph();
    baseGraph = addNode(addNode(addNode(baseGraph, createNode('A')), createNode('B')), createNode('D'));
    baseGraph = addEdge(baseGraph, createEdge('A', 'B'));

    let source = createGraph();
    source = addNode(addNode(source, createNode('A')), createNode('B'));
    source = addEdge(source, createEdge('A', 'B'));

    let target = createGraph();
    target = addNode(addNode(addNode(target, createNode('A')), createNode('B')), createNode('D'));
    target = addEdge(target, createEdge('A', 'B'));

    const scopeNodes = ['B'];
    const filtered = filterUpstreamSubgraph(source, scopeNodes);
    // Passing full base (the bug): D is in base but not in filtered → D gets deleted
    const result = mergeGraphs(target, filtered, baseGraph);
    expect(result.nodes.map(n => n.label)).not.toContain('D');
  });
});

describe('filterUpstreamSubgraph', () => {
  it('returns original graph reference when scope is empty', () => {
    const g = buildGraph('A', 'B');
    expect(filterUpstreamSubgraph(g, [])).toBe(g); // documents known reference-return behavior
  });

  it('returns original graph reference when scope is null', () => {
    const g = buildGraph('A');
    expect(filterUpstreamSubgraph(g, null)).toBe(g);
  });

  it('returns only upstream nodes for given scope', () => {
    let g = buildGraph('A', 'B', 'C', 'D');
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    // D has no edges, is not upstream of C
    const sub = filterUpstreamSubgraph(g, ['C']);
    const labels = sub.nodes.map(n => n.label).sort();
    expect(labels).toContain('A');
    expect(labels).toContain('B');
    expect(labels).toContain('C');
    expect(labels).not.toContain('D');
  });

  it('handles multiple scope nodes', () => {
    let g = buildGraph('A', 'B', 'C', 'D');
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('C', 'D'));
    const sub = filterUpstreamSubgraph(g, ['B', 'D']);
    const labels = sub.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
  });

  it('includes scope nodes themselves', () => {
    const g = buildGraph('A');
    const sub = filterUpstreamSubgraph(g, ['A']);
    expect(sub.nodes).toHaveLength(1);
    expect(sub.nodes[0].label).toBe('A');
  });
});
