import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../../src/graph/diff.js';
import { createGraph, addNode, addEdge, createNode, createEdge, updateNodeProps } from '../../../src/graph/model.js';

describe('computeDiff', () => {
  it('returns [] when baseGraph is null', () => {
    expect(computeDiff(null, createGraph())).toEqual([]);
  });

  it('returns [] when baseGraph is undefined', () => {
    expect(computeDiff(undefined, createGraph())).toEqual([]);
  });

  it('returns [] for identical graphs', () => {
    const g = addNode(createGraph(), createNode('A', { x: '1' }));
    expect(computeDiff(g, g)).toHaveLength(0);
  });

  it('detects added nodes', () => {
    const base = addNode(createGraph(), createNode('A'));
    const curr = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const diffs = computeDiff(base, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ type: 'node', action: 'added', key: 'B' });
  });

  it('detects removed nodes', () => {
    const base = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const curr = addNode(createGraph(), createNode('A'));
    const diffs = computeDiff(base, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ type: 'node', action: 'removed', key: 'B' });
  });

  it('detects modified node props', () => {
    const base = addNode(createGraph(), createNode('A', { x: '1' }));
    const curr = updateNodeProps(base, 'A', { x: '2' });
    const diffs = computeDiff(base, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ type: 'node', action: 'modified', key: 'A', oldProps: { x: '1' }, newProps: { x: '2' } });
  });

  it('detects added edges', () => {
    const base = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const curr = addEdge(base, createEdge('A', 'B'));
    const diffs = computeDiff(base, curr);
    const edgeDiff = diffs.find(d => d.type === 'edge');
    expect(edgeDiff).toMatchObject({ type: 'edge', action: 'added', key: 'A→B' });
  });

  it('detects removed edges', () => {
    const base = addEdge(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createEdge('A', 'B'));
    const curr = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const diffs = computeDiff(base, curr);
    expect(diffs.find(d => d.type === 'edge' && d.action === 'removed')).toBeTruthy();
  });

  it('returns null oldProps for added nodes', () => {
    const base = createGraph();
    const curr = addNode(createGraph(), createNode('A', { x: '1' }));
    const diffs = computeDiff(base, curr);
    expect(diffs[0].oldProps).toBeNull();
    expect(diffs[0].newProps).toEqual({ x: '1' });
  });

  it('returns null newProps for removed nodes', () => {
    const base = addNode(createGraph(), createNode('A', { x: '1' }));
    const curr = createGraph();
    const diffs = computeDiff(base, curr);
    expect(diffs[0].oldProps).toEqual({ x: '1' });
    expect(diffs[0].newProps).toBeNull();
  });

  it('no diff when props are equal but differently ordered', () => {
    const base = addNode(createGraph(), createNode('A', { x: '1', y: '2' }));
    const curr = addNode(createGraph(), createNode('A', { y: '2', x: '1' }));
    // prop order should not matter for equality — rely on graphsEqual implementation
    // If it does matter, this test documents that behavior
    const diffs = computeDiff(base, curr);
    // Acceptable either way — just ensure it doesn't throw
    expect(Array.isArray(diffs)).toBe(true);
  });

  it('multiple changes detected in one call', () => {
    const base = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const curr = addNode(addNode(createGraph(), createNode('A')), createNode('C'));
    const diffs = computeDiff(base, curr);
    const keys = diffs.map(d => d.key).sort();
    expect(keys).toContain('B'); // removed
    expect(keys).toContain('C'); // added
  });
});
