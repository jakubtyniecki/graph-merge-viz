import { createGraph, createNode, createEdge } from '../graph/model.js';

function createSampleGraph() {
  let g = createGraph();
  g.nodes.push(createNode('A', { x: 100, y: 100 }));
  g.nodes.push(createNode('B', { x: 200, y: 100 }));
  g.nodes.push(createNode('C', { x: 150, y: 200 }));
  g.edges.push(createEdge('A', 'B'));
  g.edges.push(createEdge('B', 'C'));
  g.edges.push(createEdge('A', 'C'));
  return g;
}

export const TEST_SCENARIOS = [
  {
    name: 'Mirror',
    description: 'Identical graphs in two panels',
    build: () => {
      const g = createSampleGraph();
      return {
        layout: {
          tree: {
            type: 'split',
            direction: 'v',
            children: [{ type: 'panel', id: '1' }, { type: 'panel', id: '2' }],
            sizes: [50, 50]
          },
          nextId: 3
        },
        panels: {
          '1': { graph: g, pathTrackingEnabled: false, showExclusions: true, exclusions: {} },
          '2': { graph: g, pathTrackingEnabled: false, showExclusions: true, exclusions: {} }
        },
        template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [], specialTypes: [] }
      };
    }
  },
  {
    name: 'Push',
    description: 'Graph in left panel, right panel empty',
    build: () => {
      const g = createSampleGraph();
      return {
        layout: {
          tree: {
            type: 'split',
            direction: 'v',
            children: [{ type: 'panel', id: '1' }, { type: 'panel', id: '2' }],
            sizes: [50, 50]
          },
          nextId: 3
        },
        panels: {
          '1': { graph: g, pathTrackingEnabled: false, showExclusions: true, exclusions: {} },
          '2': { graph: createGraph(), pathTrackingEnabled: false, showExclusions: true, exclusions: {} }
        },
        template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [], specialTypes: [] }
      };
    }
  },
  {
    name: 'Scoped',
    description: 'Left panel has full graph, right panel has subset',
    build: () => {
      const g = createSampleGraph();
      const subset = createGraph();
      subset.nodes.push(createNode('A', { x: 100, y: 100 }));
      subset.nodes.push(createNode('B', { x: 200, y: 100 }));
      subset.edges.push(createEdge('A', 'B'));

      return {
        layout: {
          tree: {
            type: 'split',
            direction: 'v',
            children: [{ type: 'panel', id: '1' }, { type: 'panel', id: '2' }],
            sizes: [50, 50]
          },
          nextId: 3
        },
        panels: {
          '1': { graph: g, pathTrackingEnabled: false, showExclusions: true, exclusions: {} },
          '2': { graph: subset, pathTrackingEnabled: false, showExclusions: true, exclusions: {} }
        },
        template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [], specialTypes: [] }
      };
    }
  },
  {
    name: 'Approval',
    description: 'Single panel with unapproved changes',
    build: () => {
      const base = createSampleGraph();
      const current = JSON.parse(JSON.stringify(base));
      current.nodes.push(createNode('D', { x: 150, y: 300 }));
      current.edges.push(createEdge('C', 'D'));

      return {
        layout: {
          tree: { type: 'panel', id: '1' },
          nextId: 2
        },
        panels: {
          '1': {
            graph: current,
            baseGraph: base,
            pathTrackingEnabled: false,
            showExclusions: true,
            exclusions: {}
          }
        },
        template: { name: 'Default', graphType: 'DG', nodeTypes: [], edgeTypes: [], specialTypes: [] }
      };
    }
  }
];
