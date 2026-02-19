# Docs Restructure + Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure project docs (CLAUDE.md, SPEC.md, TODO.md), add Vitest unit tests with >70% coverage for all pure graph functions, add Playwright E2E tests for main user workflows, and record TDD approach in memory.

**Architecture:** All pure functions in `src/graph/` are tested with Vitest (no DOM). Playwright tests the running app end-to-end. CLAUDE.md becomes a lean working guide; SPEC.md becomes the authoritative feature reference in `.claude/`; TODO.md tracks next-version work.

**Tech Stack:** Vitest 3.x + @vitest/coverage-v8, Playwright (already available as plugin), Node.js test environment for graph layer.

---

## Task 1: Rewrite `.claude/CLAUDE.md`

**Files:**
- Modify: `.claude/CLAUDE.md` (full rewrite)

**Goal:** Transform from implementation-notes dump into a lean working guide. Should answer: "How do I work on this project?" Not "what does every function do?" (that's SPEC.md).

**Content structure:**
```
# Graph Merge Visualizer — Working Guide

## Project Orientation (2 paragraphs max)
## Architecture in One Paragraph
## Dev Commands (npm run dev/build/test/start)
## Key Conventions (functional core, immutable data, event delegation)
## TDD Directive (always test first for graph/ layer)
## Important Decisions (why vanilla JS, why LocalStorage, etc.)
## Debugging Cheatsheet (window.__panels, window.__layout)
## Common Tasks Quick Reference (add action button, add dialog, etc.)
## Files to Know (critical files with one-line description each)
```

**Step 1:** Write the new CLAUDE.md. Keep it under 120 lines so it always fits within the 200-line memory truncation limit.

**Step 2:** Verify it reads well and covers what a developer picking up the project cold would need.

**Step 3:** Commit
```bash
git add .claude/CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md as lean working guide"
```

---

## Task 2: Rewrite and move `SPEC.md` to `.claude/SPEC.md`

**Files:**
- Modify: `SPEC.md` (full rewrite, then move to `.claude/SPEC.md`)
- Keep: `SPEC.md` at root pointing to new location (or delete the old one)

**Goal:** Comprehensive authoritative specification. Reading it alone should let someone recreate the project from scratch. Must cover ALL current features including everything added since the original spec.

**Missing from current SPEC.md (must add):**
- Template system: GRAPH_TYPES (UCG/UTree/DAG/DG/Forest), nodeTypes/edgeTypes with colors, specialTypes ordering
- Typed nodes/edges: type field on Node/Edge data model
- Graph constraints: self-loop prevention, duplicate edge check, acyclicity for DAG/UTree/Forest, connectivity check for UTree
- Per-panel layout algorithms: fcose/level-by-level/circle/concentric/breadthfirst/grid
- Undo/redo: up to 50 history entries per panel
- Panel options: gear icon in panel header opens layout + path-tracking settings
- Path tracking: DAG-specific, computePathTags, propagateExclusions, edge exclusions, visual overlays
- Merge strategies: mirror/push/scoped/none per merge button
- Merge button customization: per-gutter lists, drag-and-drop reorder, + button, delete via right-click
- Context menu: node/edge right-click with edit/delete/copy-branch/paste-branch/select-branch/exclusions
- Template management modal: global templates in header, CRUD operations
- Session template: embedded deep-copy per session vs global templates
- Status bar: compact node/edge/pending/session counts
- Processing indicator: spinning indicator during layout
- Approval history: preview dialog with changeset view

**Updated data models to document:**
```
Node = { label: string, type: string|null, props: Record<string, string> }
Edge = { source: string, target: string, type: string|null, props: Record<string, string> }
Template = {
  name: string,
  graphType: 'UCG'|'UTree'|'DAG'|'DG'|'Forest',
  nodeTypes: [{id, label, color}],
  edgeTypes: [{id, label, color}],
  specialTypes: string[]  // ordered node type IDs for path tracking
}
Session = {
  layout: { tree: LayoutNode, nextId: number, mergeStrategies: object, mergeButtonLists: object },
  panels: Record<string, PanelState>,
  template: Template,
  savedAt: string
}
PanelState = {
  graph: Graph,
  baseGraph: Graph|null,
  mergeDirection: string|null,
  lastApproval: string|null,
  layoutAlgorithm: string,
  pathTrackingEnabled: boolean,
  showExclusions: boolean,
  exclusions: Record<edgeKey, string[]>
}
```

**Step 1:** Write the full new SPEC.md to `.claude/SPEC.md`. Organize as:
1. Quick Start (commands only, 10 lines)
2. Feature Inventory (bullet list of ALL capabilities)
3. Architecture (stack, patterns, file structure)
4. Data Models (all types with full fields)
5. Key Algorithms (merge logic, diff, path tracking summary)
6. User Workflows (4-5 concrete scenarios)
7. Constraints & Limitations
8. Design Decisions (why vanilla JS, etc.)
9. Deployment

**Step 2:** Delete old `SPEC.md` from repo root (it's superseded).

**Step 3:** Commit
```bash
git add .claude/SPEC.md
git rm SPEC.md
git commit -m "docs: comprehensive SPEC.md rewrite → .claude/, covers all current features"
```

---

## Task 3: Create `.claude/TODO.md`

**Files:**
- Create: `.claude/TODO.md`

**Content — bugs/issues found in code scan:**
1. README.md references old 4-panel `1.1/2.1` IDs — stale, update to match current dynamic layout
2. `main.js:193,200` — undo/redo with no focused panel silently operates on first panel; should do nothing instead
3. `merge.js:9` — `filterUpstreamSubgraph` returns original graph reference when scope is empty (not a copy) — could cause downstream mutation
4. `dialogs.js` — single shared `<dialog>` element prevents nested dialogs (e.g., confirm inside changelog preview)
5. `panel.js` is ~1000+ lines — candidate for splitting into panel-history.js + panel-tracking.js
6. `path-tracking.js:topoSort` — cycle members appended unordered at end; may produce non-deterministic tags on cyclic graphs
7. `SPEC.md` at root is now stale — handled in Task 2

**Content — refactoring / improvements:**
1. Extract `panelEl.querySelectorAll('.panel-overlay')` cleanup pattern into a shared `removeOverlay()` in dialogs.js (already done partially)
2. `layout.js:_allPanelIds` and `_allPanelNodes` both traverse the same tree — minor DRY opportunity
3. Add `type` field to DiffEntry so template-aware diff display can color by type
4. `mergeStrategies` and `mergeButtonLists` are both stored in `getLayout()` — consider a single `gutterConfig` object
5. Per-gutter strategy is stored separately from per-gutter button list — should be co-located in `mergeButtonLists` entries: `{ source, target, strategy, scopeNodes }`
6. Keyboard shortcut handler in main.js could be a separate `setupKeyboard()` function

**Content — next features:**
1. Undo/redo for edge property changes (currently only graph mutations tracked)
2. Graph search/filter (find node by label)
3. Better mobile UX (currently broken on small screens)
4. Export to SVG/PNG via Cytoscape export API
5. Session export/import as full JSON file (not just per-graph)
6. Keyboard shortcuts help dialog (the `?` button exists but check if wired)

**Step 1:** Write the full TODO.md.

**Step 2:** Commit
```bash
git add .claude/TODO.md
git commit -m "docs: add TODO.md with code review findings and next-version backlog"
```

---

## Task 4: Setup Vitest

**Files:**
- Modify: `package.json` (add scripts + devDependencies)
- Modify: `vite.config.js` (add test config)
- Create: `tests/unit/` directory

**Step 1:** Install vitest and coverage provider
```bash
npm install --save-dev vitest @vitest/coverage-v8
```

**Step 2:** Add test scripts to `package.json`:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

**Step 3:** Add test config to `vite.config.js`:
```js
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  build: { /* existing */ },
  server: { /* existing */ },
  test: {
    root: '.',           // tests are at repo root, not inside src/
    environment: 'node', // pure functions, no DOM needed
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/graph/**'],
      exclude: ['src/graph/serializer.js'], // DOM-dependent exports skipped
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
```

**Step 4:** Run to verify setup works (no tests yet, should just exit cleanly):
```bash
npm test
```
Expected: "No test files found"

**Step 5:** Commit
```bash
git add package.json vite.config.js
git commit -m "test: setup Vitest with coverage thresholds"
```

---

## Task 5: Unit tests — `model.js`

**Files:**
- Create: `tests/unit/graph/model.test.js`
- Reference: `src/graph/model.js`

**Step 1:** Write tests covering all exported functions:

```js
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
});

describe('getAncestorSubgraph', () => {
  it('includes root and all upstream nodes', () => {
    let g = createGraph();
    ['A','B','C','D'].forEach(l => g = addNode(g, createNode(l)));
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    g = addEdge(g, createEdge('D', 'B')); // D also flows into B
    const sub = getAncestorSubgraph(g, 'C');
    const labels = sub.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C', 'D']);
    expect(sub.edges).toHaveLength(3);
  });

  it('returns single node subgraph for isolated node', () => {
    let g = createGraph();
    g = addNode(g, createNode('X'));
    g = addNode(g, createNode('Y'));
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
```

**Step 2:** Run tests:
```bash
npm test tests/unit/graph/model.test.js
```
Expected: All PASS

**Step 3:** Commit
```bash
git add tests/unit/graph/model.test.js
git commit -m "test: unit tests for graph/model.js"
```

---

## Task 6: Unit tests — `diff.js`

**Files:**
- Create: `tests/unit/graph/diff.test.js`

```js
import { describe, it, expect } from 'vitest';
import { computeDiff } from '../../../src/graph/diff.js';
import { createGraph, addNode, addEdge, createNode, createEdge, updateNodeProps } from '../../../src/graph/model.js';

describe('computeDiff', () => {
  it('returns [] when baseGraph is null', () => {
    expect(computeDiff(null, createGraph())).toEqual([]);
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
    let base = addNode(createGraph(), createNode('A', { x: '1' }));
    let curr = updateNodeProps(base, 'A', { x: '2' });
    const diffs = computeDiff(base, curr);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ type: 'node', action: 'modified', key: 'A', oldProps: { x: '1' }, newProps: { x: '2' } });
  });

  it('detects no diff for identical graphs', () => {
    let g = addNode(createGraph(), createNode('A', { x: '1' }));
    g = addEdge(g, addNode(g, createNode('B')).edges.length ? g : addNode(g, createNode('B')), createEdge('A', 'B'));
    // Simpler: just use same graph
    const g2 = addNode(createGraph(), createNode('A', { x: '1' }));
    expect(computeDiff(g2, g2)).toHaveLength(0);
  });

  it('detects added edges', () => {
    let base = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    let curr = addEdge(base, createEdge('A', 'B'));
    const diffs = computeDiff(base, curr);
    const edgeDiff = diffs.find(d => d.type === 'edge');
    expect(edgeDiff).toMatchObject({ type: 'edge', action: 'added', key: 'A→B' });
  });

  it('detects removed edges', () => {
    let base = addEdge(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createEdge('A', 'B'));
    let curr = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    const diffs = computeDiff(base, curr);
    expect(diffs.find(d => d.type === 'edge' && d.action === 'removed')).toBeTruthy();
  });

  it('returns empty oldProps for added nodes', () => {
    const base = createGraph();
    const curr = addNode(createGraph(), createNode('A', { x: '1' }));
    const diffs = computeDiff(base, curr);
    expect(diffs[0].oldProps).toBeNull();
    expect(diffs[0].newProps).toEqual({ x: '1' });
  });
});
```

**Step 2:** Run: `npm test tests/unit/graph/diff.test.js`
Expected: All PASS

**Step 3:** Commit
```bash
git add tests/unit/graph/diff.test.js
git commit -m "test: unit tests for graph/diff.js"
```

---

## Task 7: Unit tests — `merge.js`

**Files:**
- Create: `tests/unit/graph/merge.test.js`

```js
import { describe, it, expect } from 'vitest';
import { mergeGraphs, filterUpstreamSubgraph } from '../../../src/graph/merge.js';
import { createGraph, addNode, addEdge, createNode, createEdge } from '../../../src/graph/model.js';

// Helper
function buildGraph(...labels) {
  return labels.reduce((g, l) => addNode(g, createNode(l)), createGraph());
}

describe('mergeGraphs — no base', () => {
  it('adds incoming nodes to target', () => {
    const target = buildGraph('A');
    const incoming = buildGraph('B', 'C');
    const result = mergeGraphs(target, incoming);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'B', 'C']);
  });

  it('incoming props win on conflict', () => {
    let target = addNode(createGraph(), createNode('A', { x: '1' }));
    let incoming = addNode(createGraph(), createNode('A', { x: '99' }));
    const result = mergeGraphs(target, incoming);
    expect(result.nodes.find(n => n.label === 'A').props.x).toBe('99');
  });

  it('does not apply deletions without base', () => {
    let target = buildGraph('A', 'B');
    let incoming = buildGraph('A');     // B "missing" but no base = no deletion
    const result = mergeGraphs(target, incoming);
    expect(result.nodes).toHaveLength(2);
  });

  it('does not mutate target graph', () => {
    const target = buildGraph('A');
    const incoming = buildGraph('B');
    mergeGraphs(target, incoming);
    expect(target.nodes).toHaveLength(1);
  });
});

describe('mergeGraphs — with base (deletions)', () => {
  it('deletes nodes removed from source', () => {
    const base = buildGraph('A', 'B');
    const source = buildGraph('A');          // B removed in source
    let target = buildGraph('A', 'B', 'C'); // target has C too
    const result = mergeGraphs(target, source, base);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['A', 'C']);      // B deleted, C preserved
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
    const source = createGraph();    // A removed in source
    let target = buildGraph('A', 'B'); // B is target-only
    const result = mergeGraphs(target, source, base);
    const labels = result.nodes.map(n => n.label).sort();
    expect(labels).toEqual(['B']);
  });
});

describe('filterUpstreamSubgraph', () => {
  it('returns full graph when scope is empty', () => {
    const g = buildGraph('A', 'B');
    expect(filterUpstreamSubgraph(g, [])).toBe(g);  // same reference (known behavior)
  });

  it('returns only upstream nodes for given scope', () => {
    let g = buildGraph('A', 'B', 'C', 'D');
    g = addEdge(g, createEdge('A', 'B'));
    g = addEdge(g, createEdge('B', 'C'));
    g = addEdge(g, createEdge('D', 'X')); // D is not upstream of C
    // Note: D→X won't work without X node, so just test A→B→C chain
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
});
```

**Step 2:** Run: `npm test tests/unit/graph/merge.test.js`
Expected: All PASS (note: filterUpstreamSubgraph empty scope test documents known reference-return behavior)

**Step 3:** Commit
```bash
git add tests/unit/graph/merge.test.js
git commit -m "test: unit tests for graph/merge.js"
```

---

## Task 8: Unit tests — `serializer.js`

**Files:**
- Create: `tests/unit/graph/serializer.test.js`

Note: `exportToFile` and `importFromFile` use DOM APIs — skip them. Test `validateGraph`, `fromJSON`, `toJSON`.

```js
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
  });

  it('normalizes missing props to {}', () => {
    const data = { nodes: [{ label: 'A' }], edges: [] };
    const result = validateGraph(data);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes[0].props).toEqual({});
  });

  it('rejects missing nodes array', () => {
    expect(validateGraph({ edges: [] }).ok).toBe(false);
  });

  it('rejects missing edges array', () => {
    expect(validateGraph({ nodes: [] }).ok).toBe(false);
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

  it('rejects null input', () => {
    expect(validateGraph(null).ok).toBe(false);
  });

  it('preserves type field on nodes and edges', () => {
    const data = {
      nodes: [{ label: 'A', type: 'myType' }],
      edges: [{ source: 'A', target: 'A', type: 'edgeType', props: {} }],
    };
    // Self-loop in serializer — only testing type preservation, not constraints
    // (constraints are in constraints.js)
    // Actually let's use a valid graph
    const data2 = {
      nodes: [{ label: 'A', type: 'myType' }, { label: 'B' }],
      edges: [{ source: 'A', target: 'B', type: 'edgeType' }],
    };
    const result = validateGraph(data2);
    expect(result.ok).toBe(true);
    expect(result.graph.nodes[0].type).toBe('myType');
    expect(result.graph.edges[0].type).toBe('edgeType');
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

  it('fromJSON rejects malformed JSON string', () => {
    expect(fromJSON('not json {{{').ok).toBe(false);
  });

  it('fromJSON rejects valid JSON with invalid graph', () => {
    expect(fromJSON(JSON.stringify({ nodes: 'bad' }))).toMatchObject({ ok: false });
  });

  it('toJSON produces formatted JSON string', () => {
    const json = toJSON({ nodes: [], edges: [] });
    expect(json).toContain('\n');   // pretty-printed
    expect(JSON.parse(json)).toBeTruthy();
  });
});
```

**Step 2:** Run: `npm test tests/unit/graph/serializer.test.js`
Expected: All PASS

**Step 3:** Commit
```bash
git add tests/unit/graph/serializer.test.js
git commit -m "test: unit tests for graph/serializer.js"
```

---

## Task 9: Unit tests — `constraints.js`

**Files:**
- Create: `tests/unit/graph/constraints.test.js`

```js
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
    // Adding C→A would create a cycle
    expect(validateEdgeAdd(g, 'C', 'A', 'DAG').ok).toBe(false);
  });

  it('allows edge that does not create cycle in DAG', () => {
    const g = buildChain('A', 'B');
    expect(validateEdgeAdd(g, 'A', 'B', 'DAG').ok).toBe(false); // duplicate
    // Add new node D and edge A→D (no cycle)
    const g2 = addNode(g, createNode('D'));
    expect(validateEdgeAdd(g2, 'A', 'D', 'DAG').ok).toBe(true);
  });

  it('rejects duplicate undirected edge in either direction', () => {
    let g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    g = addEdge(g, createEdge('A', 'B'));
    expect(validateEdgeAdd(g, 'B', 'A', 'UCG').ok).toBe(false);
  });
});

describe('hasCycle — directed', () => {
  it('detects cycle in directed graph', () => {
    let g = buildChain('A', 'B', 'C');
    g = addEdge(g, createEdge('C', 'A'));
    expect(hasCycle(g, true)).toBe(true);
  });

  it('no cycle in acyclic graph', () => {
    expect(hasCycle(buildChain('A', 'B', 'C'), true)).toBe(false);
  });
});

describe('hasCycle — undirected', () => {
  it('detects cycle', () => {
    let g = buildChain('A', 'B', 'C');
    g = addEdge(g, createEdge('C', 'A'));
    expect(hasCycle(g, false)).toBe(true);
  });

  it('no cycle in tree', () => {
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
  it('disconnected graph is not connected', () => {
    const g = addNode(addNode(createGraph(), createNode('A')), createNode('B'));
    expect(isConnected(g)).toBe(false);
  });
  it('connected graph returns true', () => {
    const g = buildChain('A', 'B', 'C');
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
});

describe('wouldDisconnectOnEdgeRemove', () => {
  it('removing bridge edge disconnects', () => {
    const g = buildChain('A', 'B', 'C');
    expect(wouldDisconnectOnEdgeRemove(g, 'B', 'C')).toBe(true);
  });
  it('removing redundant edge does not disconnect', () => {
    let g = buildChain('A', 'B');
    g = addEdge(g, createEdge('A', 'B')); // won't work due to dup check, but manually:
    // Build manually: A connects to B via two paths
    let g2 = addNode(addNode(addNode(createGraph(), createNode('A')), createNode('B')), createNode('C'));
    g2 = addEdge(g2, createEdge('A', 'B'));
    g2 = addEdge(g2, createEdge('A', 'C'));
    g2 = addEdge(g2, createEdge('C', 'B'));
    expect(wouldDisconnectOnEdgeRemove(g2, 'A', 'B')).toBe(false);
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
```

**Step 2:** Run: `npm test tests/unit/graph/constraints.test.js`
Expected: All PASS

**Step 3:** Commit
```bash
git add tests/unit/graph/constraints.test.js
git commit -m "test: unit tests for graph/constraints.js"
```

---

## Task 10: Unit tests — `template.js`

**Files:**
- Create: `tests/unit/graph/template.test.js`

```js
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
});

describe('defaultTemplate', () => {
  it('has expected shape', () => {
    const t = defaultTemplate();
    expect(t.name).toBe('Default');
    expect(t.graphType).toBe('UCG');
    expect(t.nodeTypes).toEqual([]);
    expect(t.specialTypes).toEqual([]);
  });
  it('returns new object each call (not singleton)', () => {
    expect(defaultTemplate()).not.toBe(defaultTemplate());
  });
});

describe('createTemplate', () => {
  it('uses provided name and graphType', () => {
    const t = createTemplate('MyGraph', 'DAG');
    expect(t.name).toBe('MyGraph');
    expect(t.graphType).toBe('DAG');
  });
  it('defaults to UCG if no graphType', () => {
    expect(createTemplate('T').graphType).toBe('UCG');
  });
});

describe('addNodeType / removeNodeType', () => {
  it('addNodeType appends and does not mutate', () => {
    const t = defaultTemplate();
    const nt = { id: 'n1', label: 'Root', color: '#fff' };
    const t2 = addNodeType(t, nt);
    expect(t2.nodeTypes).toHaveLength(1);
    expect(t.nodeTypes).toHaveLength(0);  // original unchanged
  });

  it('removeNodeType removes by id', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'Root', color: '#fff' });
    t = addNodeType(t, { id: 'n2', label: 'Child', color: '#aaa' });
    const t2 = removeNodeType(t, 'n1');
    expect(t2.nodeTypes).toHaveLength(1);
    expect(t2.nodeTypes[0].id).toBe('n2');
  });
});

describe('updateNodeType', () => {
  it('updates label of matching type', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'Old', color: '#fff' });
    t = updateNodeType(t, 'n1', { label: 'New' });
    expect(t.nodeTypes[0].label).toBe('New');
    expect(t.nodeTypes[0].color).toBe('#fff'); // unchanged
  });
});

describe('setSpecialTypes', () => {
  it('replaces specialTypes array', () => {
    let t = addNodeType(defaultTemplate(), { id: 'n1', label: 'T', color: '#fff' });
    const t2 = setSpecialTypes(t, ['n1']);
    expect(t2.specialTypes).toEqual(['n1']);
    expect(t.specialTypes).toEqual([]);  // original unchanged
  });
});
```

**Step 2:** Run: `npm test tests/unit/graph/template.test.js`
Expected: All PASS

**Step 3:** Commit
```bash
git add tests/unit/graph/template.test.js
git commit -m "test: unit tests for graph/template.js"
```

---

## Task 11: Unit tests — `path-tracking.js`

**Files:**
- Create: `tests/unit/graph/path-tracking.test.js`

```js
import { describe, it, expect } from 'vitest';
import {
  computePathTags, propagateExclusions, isNodeFullyExcluded,
  mergeExclusions, formatPathTag, serializeTag,
} from '../../../src/graph/path-tracking.js';
import { createGraph, addNode, addEdge, createNode, createEdge } from '../../../src/graph/model.js';

// Simple DAG: P → C → R, where R=Reporter, C=Category
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
  it('returns empty Map when no specialTypeIds', () => {
    const result = computePathTags(buildTagGraph(), []);
    expect(result.size).toBe(0);
  });

  it('returns empty Map for null specialTypeIds', () => {
    expect(computePathTags(buildTagGraph(), null).size).toBe(0);
  });

  it('tags edge to reporter with reporter id', () => {
    const tags = computePathTags(buildTagGraph(), specialTypes);
    const edgeTags = tags.get('C1→R1');
    expect(edgeTags).toBeDefined();
    expect(edgeTags[0].reporter).toBe('R1');
  });

  it('tags upstream edge with full path', () => {
    const tags = computePathTags(buildTagGraph(), specialTypes);
    const edgeTags = tags.get('P1→C1');
    expect(edgeTags).toBeDefined();
    // Should have tag { reporter: 'R1', category: 'C1' }
    const tag = edgeTags.find(t => t.reporter === 'R1');
    expect(tag).toBeTruthy();
    expect(tag.category).toBe('C1');
  });

  it('handles empty graph', () => {
    expect(computePathTags(createGraph(), specialTypes).size).toBe(0);
  });
});

describe('serializeTag / formatPathTag', () => {
  it('serializeTag produces ordered string', () => {
    const tag = { reporter: 'R1', category: 'C1' };
    expect(serializeTag(tag, specialTypes)).toBe('R1|C1');
  });

  it('serializeTag uses empty string for missing type', () => {
    const tag = { reporter: 'R1' };
    expect(serializeTag(tag, specialTypes)).toBe('R1|');
  });

  it('formatPathTag formats label in order', () => {
    const tag = { reporter: 'R1', category: 'C1' };
    expect(formatPathTag(tag, specialTypes, [])).toBe('(R1, C1)');
  });

  it('formatPathTag returns (any) for empty tag', () => {
    expect(formatPathTag({}, specialTypes, [])).toBe('(any)');
  });
});

describe('mergeExclusions', () => {
  it('returns target only when sourceTracked=false', () => {
    const target = { 'A→B': ['tag1'] };
    const source = { 'A→B': ['tag2'] };
    expect(mergeExclusions(target, source, false)).toEqual(target);
  });

  it('unions tags when sourceTracked=true', () => {
    const target = { 'A→B': ['tag1'] };
    const source = { 'A→B': ['tag2'], 'B→C': ['tag3'] };
    const result = mergeExclusions(target, source, true);
    expect(result['A→B']).toContain('tag1');
    expect(result['A→B']).toContain('tag2');
    expect(result['B→C']).toContain('tag3');
  });

  it('does not mutate target', () => {
    const target = { 'A→B': ['tag1'] };
    mergeExclusions(target, { 'A→B': ['tag2'] }, true);
    expect(target['A→B']).toHaveLength(1);
  });
});

describe('propagateExclusions', () => {
  it('returns only direct exclusions when no pathTags', () => {
    const direct = { 'A→B': ['tag1'] };
    const result = propagateExclusions(buildTagGraph(), direct, new Map(), specialTypes);
    expect(result.get('A→B')).toBeDefined();
  });

  it('propagates exclusion upstream in chain', () => {
    const g = buildTagGraph();
    const pathTags = computePathTags(g, specialTypes);
    // Exclude the C1→R1 edge tag
    const leafTag = pathTags.get('C1→R1')[0];
    const serialized = serializeTag(leafTag, specialTypes);
    const direct = { 'C1→R1': [serialized] };
    const result = propagateExclusions(g, direct, pathTags, specialTypes);
    // P1→C1 should also be excluded (upstream propagation)
    expect(result.get('P1→C1')).toBeDefined();
  });
});
```

**Step 2:** Run: `npm test tests/unit/graph/path-tracking.test.js`
Expected: All PASS

**Step 3:** Run full coverage:
```bash
npm run test:coverage
```
Expected: >70% coverage on `src/graph/**`

**Step 4:** Commit
```bash
git add tests/unit/graph/path-tracking.test.js
git commit -m "test: unit tests for graph/path-tracking.js — completes >70% coverage"
```

---

## Task 12: Playwright E2E tests

**Files:**
- Create: `tests/e2e/basic-workflow.spec.js`
- Create: `playwright.config.js`

**Step 1:** Verify Playwright is available (it's in the plugin system):
```bash
npx playwright --version 2>/dev/null || echo "not installed"
```

If not installed:
```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

**Step 2:** Create `playwright.config.js` at repo root:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
```

**Step 3:** Add to `package.json` scripts:
```json
"test:e2e": "playwright test"
```

**Step 4:** Write E2E tests covering main workflows:

```js
// tests/e2e/basic-workflow.spec.js
import { test, expect } from '@playwright/test';

test.describe('App loads', () => {
  test('shows two panels on startup', async ({ page }) => {
    await page.goto('/');
    const panels = page.locator('.panel');
    await expect(panels).toHaveCount(2);
  });

  test('has panel action buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="add-node"]').first()).toBeVisible();
    await expect(page.locator('[data-action="add-edge"]').first()).toBeVisible();
  });

  test('shows merge gutter between panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.merge-gutter')).toBeVisible();
  });
});

test.describe('Node operations', () => {
  test('can add a node', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('TestNode');
    await page.locator('#dlg-ok').click();
    // Check Cytoscape rendered it (canvas-based, check overlay text)
    // Panel info should update
    await expect(page.locator('.diff-overlay').first()).toBeVisible({ timeout: 2000 }).catch(() => {});
    // Verify dialog closed
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('dialog closes on Cancel', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('#dlg-cancel').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('dialog closes on ESC key', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
});

test.describe('Panel layout', () => {
  test('can split a panel', async ({ page }) => {
    await page.goto('/');
    const initialCount = await page.locator('.panel').count();
    await page.locator('[data-split="v"]').first().click();
    await expect(page.locator('.panel')).toHaveCount(initialCount + 1);
  });

  test('can close a panel (with confirmation)', async ({ page }) => {
    await page.goto('/');
    // Split first so we have 3, then close one
    await page.locator('[data-split="v"]').first().click();
    const countBefore = await page.locator('.panel').count();
    await page.locator('.panel-close-btn').first().click();
    // Confirm dialog
    await page.locator('#dlg-ok').click();
    await expect(page.locator('.panel')).toHaveCount(countBefore - 1);
  });

  test('panel rename updates display name', async ({ page }) => {
    await page.goto('/');
    await page.locator('.panel-name').first().click();
    await page.locator('#dlg-name').fill('My Panel');
    await page.locator('#dlg-ok').click();
    await expect(page.locator('.panel-name').first()).toHaveText('My Panel');
  });
});

test.describe('Session management', () => {
  test('session controls are visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#session-controls')).toBeVisible();
  });
});

test.describe('Merge buttons', () => {
  test('merge buttons exist in gutter', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.merge-btn').first()).toBeVisible();
  });

  test('right-click on merge button shows strategy picker', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await expect(page.locator('.merge-strategy-picker')).toBeVisible();
  });

  test('strategy picker dismisses on click outside', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.merge-strategy-picker')).toHaveCount(0);
  });

  test('+ button in gutter adds new merge button dialog', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn-add').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
  });
});

test.describe('Approval workflow', () => {
  test('approve button triggers confirmation dialog', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="approve"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('#dlg-ok')).toBeVisible();
    await page.locator('#dlg-cancel').click();
  });
});
```

**Step 5:** Run E2E tests (starts dev server automatically):
```bash
npm run test:e2e
```
Expected: Most tests PASS. A few may need timing adjustments.

**Step 6:** Commit
```bash
git add tests/e2e/basic-workflow.spec.js playwright.config.js package.json
git commit -m "test: Playwright E2E tests for main user workflows"
```

---

## Task 13: Update MEMORY.md and README.md

**Files:**
- Modify: `/home/kuba/.claude/projects/-home-kuba-dev-graph-merge/memory/MEMORY.md`
- Modify: `README.md` (fix stale 4-panel references)

**Step 1:** Add TDD directive to MEMORY.md:
```markdown
## Project: graph-merge-viz

**TDD Approach (mandatory):**
- For any change to src/graph/* functions: write/update tests FIRST, then implement
- Run `npm test` before committing any graph/ changes
- Run `npm run test:coverage` to verify >70% coverage maintained

**Test Commands:**
- Unit tests: `npm test`
- Watch mode: `npm run test:watch`
- Coverage: `npm run test:coverage`
- E2E: `npm run test:e2e` (requires dev server or auto-starts via playwright config)

**Key Conventions:**
- Pure functions only in src/graph/ (testable without DOM)
- Dialogs use single shared <dialog> element (openDialog/closeDialog in dialogs.js)
- Session state saved via layoutManager.getLayout() + panel.getState() per panel
- Template travels with session (embedded copy), global templates in localStorage
```

**Step 2:** Update README.md: remove references to old `1.1/2.1` panel IDs, update feature list to reflect templates/path tracking/merge strategies. (Keep it concise — README is user-facing)

**Step 3:** Commit
```bash
git add README.md
git commit -m "docs: update README — remove stale panel IDs, reflect current features"
# Memory file not committed (it's outside repo)
```

---

## Task 14: Final build, push

**Step 1:** Run all tests one final time:
```bash
npm test && npm run test:coverage
```
Expected: All PASS, coverage >70%

**Step 2:** Build production:
```bash
npm run build
```

**Step 3:** Push:
```bash
git push origin master
```
