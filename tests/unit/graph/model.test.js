import { describe, it, expect } from 'vitest';
import {
  createGraph, createNode, createEdge, addNode, addEdge,
  removeNode, removeEdge, updateNodeProps, updateEdgeProps,
  findNode, findEdge, nodeLabels, isEmpty, graphsEqual,
  deepClone, nodeKey, edgeKey, getAncestorSubgraph,
} from '../../../src/graph/model.js';

describe('createGraph', () => {
  it('returns empty nodes and edges arrays', () => {
    const g = createGraph();
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });
});

describe('createNode', () => {
  it('has label, props, type', () => {
    const n = createNode('A', { x: '1' }, 'myType');
    expect(n.label).toBe('A');
    expect(n.props).toEqual({ x: '1' });
    expect(n.type).toBe('myType');
  });

  it('defaults props to {} and type to null', () => {
    const n = createNode('A');
    expect(n.props).toEqual({});
    expect(n.type).toBeNull();
  });
});

describe('createEdge', () => {
  it('has source, target, props, type', () => {
    const e = createEdge('A', 'B', { w: '5' }, 'eType');
    expect(e.source).toBe('A');
    expect(e.target).toBe('B');
    expect(e.props).toEqual({ w: '5' });
    expect(e.type).toBe('eType');
  });

  it('defaults props to {} and type to null', () => {
    const e = createEdge('A', 'B');
    expect(e.props).toEqual({});
    expect(e.type).toBeNull();
  });
});

describe('addNode', () => {
  it('returns new graph with node appended', () => {
    const g = createGraph();
    const node = createNode('A', { color: 'red' });
    const g2 = addNode(g, node);
    expect(g2.nodes).toHaveLength(1);
    expect(g2.nodes[0].label).toBe('A');
    expect(g.nodes).toHaveLength(0); // original unchanged
  });

  it('deep copies props to prevent mutation', () => {
    const props = { x: '1' };
    const node = createNode('A', props);
    const g = addNode(createGraph(), node);
    props.x = 'mutated';
    expect(g.nodes[0].props.x).toBe('1');
  });
});

describe('removeNode', () => {
  it('removes node and its connected edges', () => {
    let g = createGraph();
    g = addNode(g, createNode('A'));
    g = addNode(g, createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    const g2 = removeNode(g, 'A');
    expect(g2.nodes.map(n => n.label)).toEqual(['B']);
    expect(g2.edges).toHaveLength(0);
  });

  it('does not mutate original graph', () => {
    let g = addNode(createGraph(), createNode('A'));
    removeNode(g, 'A');
    expect(g.nodes).toHaveLength(1);
  });
});

describe('removeEdge', () => {
  it('removes only the specified edge', () => {
    let g = createGraph();
    g = addNode(g, createNode('A'));
    g = addNode(g, createNode('B'));
    g = addNode(g, createNode('C'));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    const g2 = removeEdge(g, 'A', 'B');
    expect(g2.edges).toHaveLength(1);
    expect(g2.edges[0].source).toBe('B');
  });
});

describe('updateNodeProps', () => {
  it('replaces props on matching node only', () => {
    let g = createGraph();
    g = addNode(g, createNode('A', { x: '1' }));
    g = addNode(g, createNode('B', { y: '2' }));
    const g2 = updateNodeProps(g, 'A', { x: '99' });
    expect(g2.nodes.find(n => n.label === 'A').props.x).toBe('99');
    expect(g2.nodes.find(n => n.label === 'B').props.y).toBe('2');
  });

  it('does not mutate original graph', () => {
    let g = addNode(createGraph(), createNode('A', { x: '1' }));
    updateNodeProps(g, 'A', { x: '99' });
    expect(g.nodes[0].props.x).toBe('1');
  });
});

describe('updateEdgeProps', () => {
  it('replaces props on matching edge only', () => {
    let g = createGraph();
    g = addNode(g, createNode('A'));
    g = addNode(g, createNode('B'));
    g = addEdge(g, createEdge('A', 'B', { w: '1' }));
    const g2 = updateEdgeProps(g, 'A', 'B', { w: '5' });
    expect(g2.edges[0].props.w).toBe('5');
  });
});

describe('findNode / findEdge', () => {
  it('findNode returns node by label', () => {
    let g = addNode(createGraph(), createNode('X'));
    expect(findNode(g, 'X').label).toBe('X');
  });

  it('findNode returns undefined for missing label', () => {
    expect(findNode(createGraph(), 'Z')).toBeUndefined();
  });

  it('findEdge returns edge by source+target', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(findEdge(g, 'A', 'B').source).toBe('A');
  });
});

describe('nodeLabels', () => {
  it('returns array of all labels', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    expect(nodeLabels(g).sort()).toEqual(['A', 'B']);
  });
});

describe('isEmpty', () => {
  it('true for empty graph', () => expect(isEmpty(createGraph())).toBe(true));
  it('false when nodes exist', () => {
    expect(isEmpty(addNode(createGraph(), createNode('A')))).toBe(false);
  });
});

describe('graphsEqual', () => {
  it('true for structurally identical graphs', () => {
    const a = addNode(createGraph(), createNode('A'));
    const b = addNode(createGraph(), createNode('A'));
    expect(graphsEqual(a, b)).toBe(true);
  });
  it('false when nodes differ', () => {
    const a = addNode(createGraph(), createNode('A'));
    const b = addNode(createGraph(), createNode('B'));
    expect(graphsEqual(a, b)).toBe(false);
  });
  it('false when edge props differ', () => {
    let a = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    let b = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    a = addEdge(a, createEdge('A', 'B', { w: '1' }));
    b = addEdge(b, createEdge('A', 'B', { w: '2' }));
    expect(graphsEqual(a, b)).toBe(false);
  });
});

describe('getAncestorSubgraph', () => {
  it('includes root and all upstream nodes', () => {
    let g = createGraph();
    ['A', 'B', 'C', 'D'].forEach(l => { g = addNode(g, createNode(l)); });
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    g = addEdge(g, createEdge('D', 'B')); // D also flows into B
    const sub = getAncestorSubgraph(g, 'C');
    const labels = sub.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
    expect(sub.edges).toHaveLength(3);
  });

  it('returns single node subgraph for isolated node', () => {
    let g = addNode(addNode(createGraph(), createNode('X')), createNode('Y'));
    const sub = getAncestorSubgraph(g, 'X');
    expect(sub.nodes).toHaveLength(1);
    expect(sub.edges).toHaveLength(0);
  });
});

describe('nodeKey / edgeKey', () => {
  it('nodeKey returns label', () => expect(nodeKey({ label: 'A' })).toBe('A'));
  it('edgeKey returns source→target', () => {
    expect(edgeKey({ source: 'A', target: 'B' })).toBe('A→B');
  });
});

describe('deepClone', () => {
  it('produces a value-equal but reference-distinct copy', () => {
    const obj = { a: { b: 1 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    clone.a.b = 99;
    expect(obj.a.b).toBe(1);
  });
});
