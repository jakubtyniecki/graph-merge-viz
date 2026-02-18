import { describe, it, expect } from 'vitest';
import { validateGraph, fromJSON, toJSON } from '../../../src/graph/serializer.js';

const validGraph = {
  nodes: [
    { label: 'A', props: { x: '1' } },
    { label: 'B', props: {} },
  ],
  edges: [
    { source: 'A', target: 'B', props: {} },
  ],
};

describe('validateGraph', () => {
  it('accepts valid graph', () => {
    const result = validateGraph(validGraph);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(1);
  });

  it('normalizes missing props to {}', () => {
    const data = { nodes: [{ label: 'A' }], edges: [] };
    const result = validateGraph(data);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes[0].props).toEqual({});
  });

  it('normalizes missing type to null', () => {
    const data = { nodes: [{ label: 'A' }], edges: [] };
    const result = validateGraph(data);
    expect(result.graph.nodes[0].type).toBeNull();
  });

  it('rejects missing nodes array', () => {
    expect(validateGraph({ edges: [] }).ok).toBe(false);
  });

  it('rejects missing edges array', () => {
    expect(validateGraph({ nodes: [] }).ok).toBe(false);
  });

  it('rejects null input', () => {
    expect(validateGraph(null).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateGraph('string').ok).toBe(false);
    expect(validateGraph(42).ok).toBe(false);
  });

  it('rejects duplicate node labels', () => {
    const data = { nodes: [{ label: 'A' }, { label: 'A' }], edges: [] };
    expect(validateGraph(data).ok).toBe(false);
  });

  it('rejects node with missing label', () => {
    const data = { nodes: [{ props: {} }], edges: [] };
    expect(validateGraph(data).ok).toBe(false);
  });

  it('rejects edge referencing unknown source', () => {
    const data = {
      nodes: [{ label: 'A' }],
      edges: [{ source: 'X', target: 'A', props: {} }],
    };
    expect(validateGraph(data).ok).toBe(false);
  });

  it('rejects edge referencing unknown target', () => {
    const data = {
      nodes: [{ label: 'A' }],
      edges: [{ source: 'A', target: 'X', props: {} }],
    };
    expect(validateGraph(data).ok).toBe(false);
  });

  it('preserves type field on nodes and edges', () => {
    const data = {
      nodes: [{ label: 'A', type: 'myType' }, { label: 'B' }],
      edges: [{ source: 'A', target: 'B', type: 'edgeType' }],
    };
    const result = validateGraph(data);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes[0].type).toBe('myType');
    expect(result.graph.edges[0].type).toBe('edgeType');
  });

  it('accepts graph with no edges', () => {
    const data = { nodes: [{ label: 'A' }, { label: 'B' }], edges: [] };
    expect(validateGraph(data).ok).toBe(true);
  });

  it('accepts graph with no nodes or edges', () => {
    expect(validateGraph({ nodes: [], edges: [] }).ok).toBe(true);
  });
});

describe('toJSON / fromJSON roundtrip', () => {
  it('roundtrips a valid graph', () => {
    const json = toJSON(validGraph);
    const result = fromJSON(json);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes).toHaveLength(2);
    expect(result.graph.edges).toHaveLength(1);
  });

  it('roundtrip preserves node labels and props', () => {
    const json = toJSON(validGraph);
    const result = fromJSON(json);
    expect(result.graph.nodes.find(n => n.label === 'A').props.x).toBe('1');
  });

  it('fromJSON rejects malformed JSON string', () => {
    expect(fromJSON('not json {{{').ok).toBe(false);
  });

  it('fromJSON rejects valid JSON with invalid graph', () => {
    expect(fromJSON(JSON.stringify({ nodes: 'bad' })).ok).toBe(false);
  });

  it('toJSON produces pretty-printed JSON string', () => {
    const json = toJSON({ nodes: [], edges: [] });
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toBeTruthy();
  });

  it('toJSON output is valid JSON', () => {
    const json = toJSON(validGraph);
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
