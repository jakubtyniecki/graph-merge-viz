import { describe, it, expect } from 'vitest';
import {
  validateEdgeAdd, wouldCreateCycle, hasCycle,
  isConnected, wouldDisconnectOnNodeRemove, wouldDisconnectOnEdgeRemove,
  hasDuplicateUndirectedEdge,
} from '../../../src/graph/constraints.js';
import { createGraph, addNode, addEdge, createNode, createEdge } from '../../../src/graph/model.js';

function buildChain(...labels) {
  let g = labels.reduce((g, l) => addNode(g, createNode(l)), createGraph());
  for (let i = 0; i < labels.length - 1; i++) {
    g = addEdge(g, createEdge(labels[i], labels[i + 1]));
  }
  return g;
}

describe('validateEdgeAdd', () => {
  it('allows valid edge on DG type', () => {
    const g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    expect(validateEdgeAdd(g, 'A', 'B', 'DG').ok).toBe(true);
  });

  it('rejects self-loop', () => {
    const g = addNode(createGraph(), createNode('A'));
    expect(validateEdgeAdd(g, 'A', 'A', 'DG').ok).toBe(false);
  });

  it('rejects duplicate directed edge', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(validateEdgeAdd(g, 'A', 'B', 'DG').ok).toBe(false);
  });

  it('rejects edge that creates cycle in DAG', () => {
    const g = buildChain('A', 'B', 'C');
    expect(validateEdgeAdd(g, 'C', 'A', 'DAG').ok).toBe(false);
  });

  it('allows edge that does not create cycle in DAG', () => {
    const g = addNode(buildChain('A', 'B'), createNode('D'));
    expect(validateEdgeAdd(g, 'A', 'D', 'DAG').ok).toBe(true);
  });

  it('rejects duplicate undirected edge in same direction (UCG)', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(validateEdgeAdd(g, 'A', 'B', 'UCG').ok).toBe(false);
  });

  it('rejects duplicate undirected edge in reverse direction (UCG)', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(validateEdgeAdd(g, 'B', 'A', 'UCG').ok).toBe(false);
  });

  it('rejects self-loop on UCG', () => {
    const g = addNode(createGraph(), createNode('A'));
    expect(validateEdgeAdd(g, 'A', 'A', 'UCG').ok).toBe(false);
  });

  it('returns error message on failure', () => {
    const g = addNode(createGraph(), createNode('A'));
    const result = validateEdgeAdd(g, 'A', 'A', 'DG');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('hasCycle — directed', () => {
  it('detects cycle in directed graph', () => {
    let g = buildChain('A', 'B', 'C');
    g = addEdge(g, createEdge('C', 'A'));
    expect(hasCycle(g, true)).toBe(true);
  });

  it('no cycle in acyclic directed graph', () => {
    expect(hasCycle(buildChain('A', 'B', 'C'), true)).toBe(false);
  });

  it('empty graph has no cycle', () => {
    expect(hasCycle(createGraph(), true)).toBe(false);
  });
});

describe('hasCycle — undirected', () => {
  it('detects cycle in undirected graph', () => {
    let g = buildChain('A', 'B', 'C');
    g = addEdge(g, createEdge('C', 'A'));
    expect(hasCycle(g, false)).toBe(true);
  });

  it('no cycle in tree (undirected)', () => {
    let g = addNode(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createNode('C'));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('A', 'C'));
    expect(hasCycle(g, false)).toBe(false);
  });
});

describe('isConnected', () => {
  it('empty graph is connected', () => expect(isConnected(createGraph())).toBe(true));

  it('single node is connected', () => {
    expect(isConnected(addNode(createGraph(), createNode('A')))).toBe(true);
  });

  it('two disconnected nodes are not connected', () => {
    const g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    expect(isConnected(g)).toBe(false);
  });

  it('chain A→B→C is connected', () => {
    expect(isConnected(buildChain('A', 'B', 'C'))).toBe(true);
  });

  it('star graph is connected', () => {
    let g = addNode(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createNode('C'));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('A', 'C'));
    expect(isConnected(g)).toBe(true);
  });
});

describe('wouldDisconnectOnNodeRemove', () => {
  it('removing bridge node disconnects', () => {
    const g = buildChain('A', 'B', 'C');
    expect(wouldDisconnectOnNodeRemove(g, 'B')).toBe(true);
  });

  it('removing leaf does not disconnect', () => {
    const g = buildChain('A', 'B', 'C');
    expect(wouldDisconnectOnNodeRemove(g, 'C')).toBe(false);
  });

  it('removing only node does not disconnect (empty is connected)', () => {
    const g = addNode(createGraph(), createNode('A'));
    expect(wouldDisconnectOnNodeRemove(g, 'A')).toBe(false);
  });
});

describe('wouldDisconnectOnEdgeRemove', () => {
  it('removing the only edge between two nodes disconnects', () => {
    const g = buildChain('A', 'B');
    expect(wouldDisconnectOnEdgeRemove(g, 'A', 'B')).toBe(true);
  });

  it('removing redundant edge does not disconnect', () => {
    // A—B—C—A triangle: removing A→B still leaves A reachable via C
    let g = addNode(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createNode('C'));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('A', 'C'));
    g = addEdge(g, createEdge('C', 'B'));
    expect(wouldDisconnectOnEdgeRemove(g, 'A', 'B')).toBe(false);
  });
});

describe('hasDuplicateUndirectedEdge', () => {
  it('finds duplicate in same direction', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(hasDuplicateUndirectedEdge(g, 'A', 'B')).toBe(true);
  });

  it('finds duplicate in reverse direction', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(hasDuplicateUndirectedEdge(g, 'B', 'A')).toBe(true);
  });

  it('returns false when no duplicate', () => {
    const g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    expect(hasDuplicateUndirectedEdge(g, 'A', 'B')).toBe(false);
  });
});

describe('wouldCreateCycle', () => {
  it('detects cycle creation in directed graph', () => {
    const g = buildChain('A', 'B', 'C');
    // Adding C→A would create a cycle
    expect(wouldCreateCycle(g, 'C', 'A', true)).toBe(true);
  });

  it('no cycle for valid new edge', () => {
    const g = buildChain('A', 'B');
    const g2 = addNode(g, createNode('C'));
    expect(wouldCreateCycle(g2, 'A', 'C', true)).toBe(false);
  });
});
