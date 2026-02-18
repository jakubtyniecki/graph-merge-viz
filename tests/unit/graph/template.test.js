import { describe, it, expect } from 'vitest';
import {
  GRAPH_TYPES, defaultTemplate, createTemplate, setSpecialTypes,
  addNodeType, addEdgeType, removeNodeType, removeEdgeType,
  updateNodeType, updateEdgeType,
} from '../../../src/graph/template.js';

describe('GRAPH_TYPES', () => {
  it('has all 5 graph types', () => {
    expect(Object.keys(GRAPH_TYPES)).toEqual(['UCG', 'UTree', 'DAG', 'DG', 'Forest']);
  });

  it('DAG is directed and acyclic', () => {
    expect(GRAPH_TYPES.DAG.directed).toBe(true);
    expect(GRAPH_TYPES.DAG.acyclic).toBe(true);
  });

  it('UCG is undirected and cyclic', () => {
    expect(GRAPH_TYPES.UCG.directed).toBe(false);
    expect(GRAPH_TYPES.UCG.acyclic).toBe(false);
  });

  it('DG is directed and cyclic', () => {
    expect(GRAPH_TYPES.DG.directed).toBe(true);
    expect(GRAPH_TYPES.DG.acyclic).toBe(false);
  });

  it('UTree is undirected and acyclic', () => {
    expect(GRAPH_TYPES.UTree.directed).toBe(false);
    expect(GRAPH_TYPES.UTree.acyclic).toBe(true);
  });
});

describe('defaultTemplate', () => {
  it('has expected shape', () => {
    const t = defaultTemplate();
    expect(t.name).toBe('Default');
    expect(t.graphType).toBe('UCG');
    expect(t.nodeTypes).toEqual([]);
    expect(t.edgeTypes).toEqual([]);
    expect(t.specialTypes).toEqual([]);
  });

  it('returns new object each call (not singleton)', () => {
    const t1 = defaultTemplate();
    const t2 = defaultTemplate();
    expect(t1).not.toBe(t2);
  });

  it('mutating returned template does not affect next call', () => {
    const t1 = defaultTemplate();
    t1.nodeTypes.push({ id: 'n1', label: 'Test', color: '#fff' });
    const t2 = defaultTemplate();
    expect(t2.nodeTypes).toHaveLength(0);
  });
});

describe('createTemplate', () => {
  it('uses provided name and graphType', () => {
    const t = createTemplate('MyGraph', 'DAG');
    expect(t.name).toBe('MyGraph');
    expect(t.graphType).toBe('DAG');
  });

  it('defaults to UCG if no graphType provided', () => {
    expect(createTemplate('T').graphType).toBe('UCG');
  });

  it('has empty arrays for nodeTypes, edgeTypes, specialTypes', () => {
    const t = createTemplate('T', 'DG');
    expect(t.nodeTypes).toEqual([]);
    expect(t.edgeTypes).toEqual([]);
    expect(t.specialTypes).toEqual([]);
  });
});

describe('addNodeType / removeNodeType', () => {
  it('addNodeType appends and does not mutate', () => {
    const t = defaultTemplate();
    const nt = { id: 'n1', label: 'Root', color: '#fff' };
    const t2 = addNodeType(t, nt);
    expect(t2.nodeTypes).toHaveLength(1);
    expect(t.nodeTypes).toHaveLength(0); // original unchanged
  });

  it('addNodeType preserves existing types', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'A', color: '#fff' });
    t = addNodeType(t, { id: 'n2', label: 'B', color: '#aaa' });
    expect(t.nodeTypes).toHaveLength(2);
  });

  it('removeNodeType removes by id', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'Root', color: '#fff' });
    t = addNodeType(t, { id: 'n2', label: 'Child', color: '#aaa' });
    const t2 = removeNodeType(t, 'n1');
    expect(t2.nodeTypes).toHaveLength(1);
    expect(t2.nodeTypes[0].id).toBe('n2');
  });

  it('removeNodeType does not mutate original', () => {
    const t = addNodeType(defaultTemplate(), { id: 'n1', label: 'A', color: '#fff' });
    removeNodeType(t, 'n1');
    expect(t.nodeTypes).toHaveLength(1);
  });
});

describe('updateNodeType', () => {
  it('updates label of matching type', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'Old', color: '#fff' });
    t = updateNodeType(t, 'n1', { label: 'New' });
    expect(t.nodeTypes[0].label).toBe('New');
    expect(t.nodeTypes[0].color).toBe('#fff'); // unchanged
  });

  it('does not mutate original template', () => {
    const t = addNodeType(defaultTemplate(), { id: 'n1', label: 'Old', color: '#fff' });
    updateNodeType(t, 'n1', { label: 'New' });
    expect(t.nodeTypes[0].label).toBe('Old');
  });
});

describe('addEdgeType / removeEdgeType / updateEdgeType', () => {
  it('addEdgeType appends and does not mutate', () => {
    const t = defaultTemplate();
    const t2 = addEdgeType(t, { id: 'e1', label: 'Link', color: '#999' });
    expect(t2.edgeTypes).toHaveLength(1);
    expect(t.edgeTypes).toHaveLength(0);
  });

  it('removeEdgeType removes by id', () => {
    let t = addEdgeType(defaultTemplate(), { id: 'e1', label: 'Link', color: '#999' });
    t = addEdgeType(t, { id: 'e2', label: 'Ref', color: '#666' });
    const t2 = removeEdgeType(t, 'e1');
    expect(t2.edgeTypes).toHaveLength(1);
    expect(t2.edgeTypes[0].id).toBe('e2');
  });

  it('updateEdgeType updates color', () => {
    let t = addEdgeType(defaultTemplate(), { id: 'e1', label: 'Link', color: '#999' });
    t = updateEdgeType(t, 'e1', { color: '#fff' });
    expect(t.edgeTypes[0].color).toBe('#fff');
    expect(t.edgeTypes[0].label).toBe('Link');
  });
});

describe('setSpecialTypes', () => {
  it('replaces specialTypes array', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'T', color: '#fff' });
    const t2 = setSpecialTypes(t, ['n1']);
    expect(t2.specialTypes).toEqual(['n1']);
    expect(t.specialTypes).toEqual([]); // original unchanged
  });

  it('accepts empty array', () => {
    let t = setSpecialTypes(defaultTemplate(), ['n1']);
    const t2 = setSpecialTypes(t, []);
    expect(t2.specialTypes).toEqual([]);
  });

  it('preserves order', () => {
    const t = setSpecialTypes(defaultTemplate(), ['c', 'a', 'b']);
    expect(t.specialTypes).toEqual(['c', 'a', 'b']);
  });
});
