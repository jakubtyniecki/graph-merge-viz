export const baseStyles = [
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'background-color': '#4fc3f7',
      'color': '#e0e0e0',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '12px',
      'width': 40,
      'height': 40,
      'border-width': 2,
      'border-color': '#2a3a5c',
      'text-outline-width': 2,
      'text-outline-color': '#1a1a2e',
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#5a6a8c',
      'target-arrow-color': '#5a6a8c',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'arrow-scale': 0.8,
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#fff',
      'border-width': 3,
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#fff',
      'target-arrow-color': '#fff',
      'width': 3,
    },
  },
  // Diff styles
  {
    selector: '.diff-added',
    style: {
      'background-color': '#4CAF50',
      'border-color': '#4CAF50',
      'line-color': '#4CAF50',
      'target-arrow-color': '#4CAF50',
    },
  },
  {
    selector: '.diff-removed',
    style: {
      'background-color': '#F44336',
      'border-color': '#F44336',
      'line-color': '#F44336',
      'target-arrow-color': '#F44336',
      'opacity': 0.5,
      'border-style': 'dashed',
      'line-style': 'dashed',
    },
  },
  {
    selector: '.diff-modified',
    style: {
      'border-color': '#FF9800',
      'border-width': 3,
      'line-color': '#FF9800',
      'target-arrow-color': '#FF9800',
    },
  },
];
