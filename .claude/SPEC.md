# Graph Merge Visualizer — Specification

**Repo:** https://github.com/jakubtyniecki/graph-merge-viz
**Last Updated:** 2026-02-18
**Purpose:** Educational web tool for learning graph merge algorithms through interactive visualization.

---

## 1. Quick Start

```bash
npm install          # Install dependencies
npm run dev          # Dev server: http://localhost:5173 (HMR enabled)
npm run build        # Production build → dist/
npm start            # Serve dist/ on :3000
npm test             # Vitest unit tests
npm run test:coverage # Coverage (must stay >70% on src/graph/)
npm run test:e2e     # Playwright E2E
```

---

## 2. Feature Inventory

### Panels & Layout
- Default: 2 panels side-by-side (vertical split)
- Split any panel horizontally (≡) or vertically (⬒)
- Close a panel (promote sibling), with confirmation
- Add a new panel (70/30 split right)
- Rename panels (click name → dialog)
- Zoom panel tmux-style (⤢ or Escape) — only zoomed panel renders
- Resize panels via drag handle in gutter
- Per-panel layout algorithm: fcose / level-by-level / circle / concentric / breadthfirst / grid
- Panel header: name · undo (←) · redo (→) · refresh (↻) · merge direction · approval time

### Graph Editing
- Add nodes (unique label per panel, optional type if template has nodeTypes)
- Add edges (source → target; directed or undirected per graph type, optional edge type)
- Edit node/edge: label, type, properties (key-value string pairs)
- Delete selected nodes/edges (with warning for connectivity-breaking deletes in UTree)
- Clear entire graph
- Multi-select via click+drag
- Undo (up to 50 entries per panel) / Redo
- Processing indicator (spinning) during layout computation

### Templates & Graph Types
- 5 graph types: UCG (undirected cyclic), UTree (undirected tree), DAG (directed acyclic), DG (directed graph), Forest (directed acyclic forest)
- Templates define: name, graphType, nodeTypes `[{id, label, color}]`, edgeTypes `[{id, label, color}]`, specialTypes `[typeId, ...]`
- Global templates: stored in `localStorage['graph-merge-templates']`, managed via Templates button in header
- Session template: embedded deep-copy per session (travels with session on import/export)
- Template operations: create, copy, edit (label/color picker per type), import/export JSON, delete
- Node/edge colors in Cytoscape set from template type definitions
- Adding node/edge with types shows dropdown (no `(no type)` option when types exist)

### Graph Constraints (enforced per graph type)
- Self-loops blocked for all types
- Duplicate directed edge blocked (same source+target)
- Duplicate undirected edge blocked (both directions, for UCG/UTree/Forest)
- Cycle creation blocked for DAG, UTree, Forest
- Post-merge cycle warning toast (not blocked) for acyclic types
- Disconnect warning (warn-but-allow) when deleting bridge node/edge in UTree
- isConnected checked for UTree; hasCycle for directed graphs

### Merge
- Push graph: source panel → target panel (merge button in gutter)
- Pull graph: target pulls from source (reverse direction button)
- Source must be clean (approved) to merge; blocked with modal if dirty
- Target can be dirty; merge diffs against target's last approved state
- Case 1 (empty target): auto-approve, no diff
- Case 2 (normal merge): apply incoming, diff against target's baseline
- Incoming props win on conflict; deletions detected via source-vs-baseline comparison

### Merge Strategies (per merge button)
- **Mirror**: full replacement (target becomes source copy)
- **Push**: standard merge (incoming additions + deletions)
- **Scoped**: only merge upstream subgraph of selected "special" nodes
- **None**: disabled (button visible but no-op)
- Strategy set via right-click → strategy picker on merge button
- Default: push strategy

### Merge Button Customization
- Per-gutter button list stored as `mergeButtonLists[gutterKey] = [{source, target}, ...]`
- Defaults auto-generated from panel adjacency (push + pull per panel pair)
- Drag-and-drop to reorder buttons (HTML5 DnD, draggable rows with ⠿ handle)
- Right-click → strategy picker with Delete option to remove button
- `+` button at bottom of gutter to add arbitrary panel-pair merge button
- Persisted in session `layout.mergeButtonLists`
- Panel deletion cleans up all buttons referencing that panel

### Diff Visualization
- Added: green nodes/edges
- Removed: red, dashed, semi-transparent ghost elements
- Modified properties: orange border
- Diffs computed against last approved baseline (baseGraph)
- Diffs clear on approval

### Approval Workflow
- Approve button: snapshots current graph as new baseline, clears diffs
- Approval history: view past approved states with timestamps
- Preview approved state in history dialog
- Changeset view: see what was added/removed per approval
- Changelog: full history of all approvals for a panel

### Path Tracking (DAG panels with specialTypes)
- Enabled per-panel via gear → panel options → Path Tracking toggle
- `computePathTags(graph, specialTypes)` → Map<edgeKey, PathTag[]>
- PathTag: `{ [typeId]: nodeLabel, ... }` for each special type node the edge leads to
- Edge exclusions: right-click edge → exclude by specific path tag (or all tags)
- `propagateExclusions(graph, directExclusions, pathTags, specialTypes)` → propagates upstream
- `isNodeFullyExcluded(nodeLabel, effectiveExclusions, pathTags)` → bool
- Visual overlays: excluded edges dashed, fully-excluded nodes dotted; `.tracking-hidden` hides fully excluded
- "Show exclusions" checkbox in bottom-left tracking overlay
- Exclusions persisted in panel state; merged via `mergeExclusions()` on graph merge

### Session Management
- Named sessions, multiple per browser
- Auto-save on `panel-change` event (debounced)
- Session selector dropdown in header controls
- New session dialog: name + starting template selector
- Import/export session as JSON
- Session names deduplicated via `uniqueName()`
- Backward-compatible migration: old `1.1/2.1` IDs → new numeric IDs; old sessions without template get default

### Clipboard (Copy/Paste)
- Ctrl+C: copy selected subgraph (nodes + edges)
- Ctrl+V: paste into focused panel (additive-only, no deletions)
- Right-click node → Copy Branch from X (selects + copies all ancestors + edges)
- Right-click node → Paste Branch onto Y (paste with linking edge Y→clipboard root if Y ≠ root)
- Right-click node → Select Branch from X (highlights ancestors, no copy)

### Context Menu
- Right-click node: Edit, Delete, Copy Branch, Paste Branch onto X, Select Branch from X, Include All Paths (when tracking)
- Right-click edge: Edit, Delete, Exclude/Include up to 3 individual tags, "Manage Exclusions..." for 4+ tags

### Import / Export
- Import graph JSON into panel (validates + rejects invalid)
- Export panel graph as JSON file (download)
- Import/export global template list as JSON
- Import/export full session as JSON

### Status Bar & UI
- Compact status: `15n 12e 4p 2s` (nodes / edges / pending changes / sessions)
- Toast notifications for errors/success
- Help dialog (`?` button in header)
- Templates button in header (opens template management modal)
- Session controls: dropdown + new/save/delete/import/export + `?`

---

## 3. Architecture

### Stack
- **Frontend:** Vanilla JS ES modules, Cytoscape.js v3.33.1, cytoscape-fcose v2.2.0
- **Build:** Vite v7.3.1 (dev server + HMR + production bundler)
- **Backend:** Express.js v5.2.1 (15-line server, serves dist/)
- **State:** Browser localStorage (no database)
- **Testing:** Vitest (unit), Playwright (E2E)
- **Runtime:** Node.js v20+, Raspberry Pi 5 (ARM64)

### Patterns
- **Functional core / imperative shell** — `src/graph/` = pure functions; `src/ui/` = DOM + state
- **Immutable graph ops** — every graph function returns a new object, never mutates input
- **Event delegation** — all panel action buttons wired in `main.js` via `#app` listener
- **Single `<dialog>` per panel** — `openDialog(panelEl)` / `closeDialog()` in `dialogs.js` reuse one element
- **Recursive split tree** — layout is a binary tree; split/close are tree mutations + full re-render
- **State round-trip** — `render()` calls `getState()` before destroy, `setState()` after recreate
- **`panel-change` event** — dispatched after any state mutation; session.js auto-saves on it

### File Structure
```
src/
├── index.html               # Minimal shell: header + #app + toast
├── main.js                  # Entry: init, event wiring, keyboard handlers
├── style.css                # Dark theme, all component CSS
├── graph/                   # Pure functions — no DOM, no side effects
│   ├── model.js             # Graph CRUD primitives
│   ├── diff.js              # computeDiff(base, current) → DiffEntry[]
│   ├── merge.js             # mergeGraphs(target, incoming, base?)
│   ├── serializer.js        # JSON import/export + validateGraph()
│   ├── template.js          # GRAPH_TYPES, template CRUD, setSpecialTypes()
│   ├── constraints.js       # validateEdgeAdd, hasCycle, isConnected, etc.
│   └── path-tracking.js     # computePathTags, propagateExclusions, mergeExclusions
├── ui/                      # Impure — DOM, Cytoscape, localStorage
│   ├── layout.js            # LayoutManager: split tree, render, merge gutters
│   ├── panel.js             # Panel: Cytoscape wrapper, merge/approve/history/tracking
│   ├── dialogs.js           # All modals (openDialog pattern + standalone exports)
│   ├── session.js           # LocalStorage sessions + migration
│   ├── template-ui.js       # Template management modal (global templates)
│   ├── clipboard.js         # Copy/paste subgraph + branch operations
│   └── toast.js             # showToast(message, type)
└── cytoscape/
    └── styles.js            # baseStyles + buildStylesForTemplate(template)
tests/
├── unit/graph/              # Vitest tests (one file per graph/ module)
└── e2e/                     # Playwright tests
docs/plans/                  # Implementation plans (historical record)
```

---

## 4. Data Models

```
Node = {
  label: string                    // unique per graph
  type: string | null              // nodeType id from template, or null
  props: Record<string, string>    // arbitrary key-value properties
}

Edge = {
  source: string                   // node label
  target: string                   // node label
  type: string | null              // edgeType id from template, or null
  props: Record<string, string>
}

Graph = {
  nodes: Node[]
  edges: Edge[]
}

DiffEntry = {
  type: 'node' | 'edge'
  action: 'added' | 'removed' | 'modified'
  key: string                      // node label or 'source→target'
  oldProps: object | null
  newProps: object | null
}

Template = {
  name: string
  graphType: 'UCG' | 'UTree' | 'DAG' | 'DG' | 'Forest'
  nodeTypes: Array<{ id: string, label: string, color: string }>
  edgeTypes: Array<{ id: string, label: string, color: string }>
  specialTypes: string[]           // ordered node type IDs for path tracking
}

PanelState = {
  graph: Graph
  baseGraph: Graph | null          // last approved snapshot (diff baseline)
  mergeDirection: string | null    // e.g. '1 → 2'
  lastApproval: string | null      // ISO timestamp
  layoutAlgorithm: string          // 'fcose' | 'circle' | 'grid' | etc.
  pathTrackingEnabled: boolean
  showExclusions: boolean
  exclusions: Record<string, string[]>  // edgeKey → serialized tag list
}

LayoutNode =
  | { type: 'panel', id: string, name?: string }
  | { type: 'split', direction: 'h'|'v', children: [LayoutNode, LayoutNode], sizes: [number, number] }

MergeButton = { source: string, target: string }

Session = {
  layout: {
    tree: LayoutNode
    nextId: number
    mergeStrategies: Record<string, string>    // 'source→target' → strategy name
    mergeButtonLists: Record<string, MergeButton[]>  // gutterKey → button list
  }
  panels: Record<string, PanelState>
  template: Template
  savedAt: string
}
```

---

## 5. Key Algorithms

### Merge Logic (`merge.js`)
1. Collect all node/edge keys from target + incoming
2. For each incoming node: add or update props (incoming wins)
3. If `base` provided: find nodes in base but NOT in incoming → delete from result
4. Remove edges whose source or target was deleted
5. Returns new Graph (no mutation)

`filterUpstreamSubgraph(graph, scopeNodeLabels)`: For scoped merge — BFS/DFS backward from scope nodes, returns subgraph of all ancestors + scope nodes.

### Diff (`diff.js`)
`computeDiff(base, current)`:
- Returns `[]` if `base` is null (nothing to diff against)
- Compare node sets: added = in current not in base; removed = in base not in current; modified = same key, different props
- Same for edges by `source→target` key

### Path Tracking (`path-tracking.js`)
`computePathTags(graph, specialTypeIds)`:
- Topological sort of graph (appends cycle members at end)
- For each edge, compute set of PathTags (combinations of special type nodes reachable downstream)
- Returns `Map<edgeKey, PathTag[]>`

`propagateExclusions(graph, directExclusions, pathTags, specialTypes)`:
- For each directly excluded edge tag, mark all upstream edges that carry that tag as also excluded
- Returns `Map<edgeKey, Set<serializedTag>>`

`mergeExclusions(target, source, sourceTracked)`:
- If !sourceTracked: return target exclusions unchanged
- If sourceTracked: union of tags per edge key (new object, no mutation)

### Constraints (`constraints.js`)
- `validateEdgeAdd(graph, src, tgt, graphType)`: self-loop → reject; dup directed → reject; dup undirected (UCG/UTree/Forest) → reject; cycle (DAG/UTree/Forest) → reject via `wouldCreateCycle()`
- `wouldCreateCycle(graph, src, tgt)`: add hypothetical edge, run DFS to detect cycle
- `hasCycle(graph, directed)`: DFS cycle detection (directed = colored DFS; undirected = parent-tracking DFS)
- `isConnected(graph)`: BFS from first node, check all nodes reached
- `wouldDisconnectOnNodeRemove(graph, nodeLabel)`: remove node+edges, check isConnected
- `wouldDisconnectOnEdgeRemove(graph, src, tgt)`: remove edge, check isConnected

---

## 6. User Workflows

### Learn the Merge Algorithm
1. Add nodes + edges in panel 1 → see green diffs → Approve → baseline set
2. Create different graph in panel 2
3. Click `1 >> 2` merge button → merged result appears with diff colors
4. Approve panel 2 → merge from panel 1 again with edits → see delta

### Work with Templates
1. Click Templates → Create "My DAG" with graphType=DAG
2. Add nodeTypes: "reporter" (red), "category" (blue)
3. New Session → choose "My DAG" → panels now enforce DAG constraints
4. Add nodes with typed colors; adding a cycle is blocked

### Path Tracking
1. Session with DAG template, specialTypes = ["reporter", "category"]
2. Panel options (gear) → enable Path Tracking
3. Hover edges → tooltip shows path tags (R1|C1 format)
4. Right-click edge → Exclude path → upstream edges auto-exclude
5. Toggle "Show exclusions" checkbox → excluded paths hidden

### Merge Customization
1. Right-click merge button → strategy → Scoped → pick special nodes
2. `+` button in gutter → add "3 >> 1" merge button
3. Drag buttons to reorder
4. Right-click → Delete to remove a button

### Multi-Session Workflow
1. Save session "v1", switch to new session "v2"
2. Export "v1" as JSON → import on different browser → layout restored

---

## 7. Constraints & Limitations

- Performance: ~500 nodes max (Cytoscape rendering limit)
- LocalStorage: ~5-10 MB per site (limits very large sessions)
- No multi-user / real-time collaboration
- Mobile layout not optimized (no responsive breakpoints)
- Properties are strings only (no nested objects/arrays)
- Single shared `<dialog>` per panel prevents nested modals
- `path-tracking.js` topoSort appends cycle members unordered (non-deterministic tags on cyclic input)

---

## 8. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Vanilla JS | Zero framework overhead on RPi5; simpler bundle; full DOM control |
| Cytoscape.js | Best JS graph lib; rich layout algorithms; CSS-like style API |
| LocalStorage | Zero setup, offline, no server infrastructure for hobby scope |
| Immutable data | Predictable state; testable pure functions; foundation for undo/redo |
| Single master branch | Hobby project; direct commits; clean simple history |
| dist/ gitignored | Build artifacts shouldn't be tracked; always build from source |
| Template embedded in session | Sessions are self-contained; template changes don't break old sessions |

---

## 9. Deployment

```bash
# Development
npm run dev      # Vite on :5173 with HMR, accessible on 0.0.0.0

# Production
npm run build    # Generates dist/
npm start        # Express serves dist/ on :3000

# Tailscale remote access: malina.tail5985a4.ts.net:3000
```

Sessions backed by browser localStorage only. Export graphs as JSON for manual backup. No server-side persistence.
