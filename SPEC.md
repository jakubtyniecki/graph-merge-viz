# Graph Merge Visualizer - Technical Specification

## Original Prompt & Context

**Problem Statement**: Build a web-based visual learning tool for understanding graph merge algorithms. The app displays 4 panels in 3 columns where users can create, edit, and merge directed graphs. Every change (edit or merge) creates a visual diff against the last-approved baseline, teaching users how graph merges work through interactive exploration.

**Use Case**: Educational tool for understanding how graph merge algorithms work, particularly focusing on:
- How merges combine two graphs
- What happens when there are conflicts (property overwrites)
- How directional locking prevents inconsistent merge states
- Visual feedback through diff coloring (added/removed/modified)

**Target Environment**: Raspberry Pi 5, hobby project (not enterprise-grade)

---

## Architecture Overview

### Technology Stack

- **Frontend Framework**: Vanilla JavaScript (ES modules, no framework overhead)
- **Graph Rendering**: Cytoscape.js v3.33.1
- **Layout Engine**: cytoscape-fcose v2.2.0 (force-directed layout)
- **Build Tool**: Vite v7.3.1
- **Server**: Express.js v5.2.1 (~15 lines, minimal)
- **Runtime**: Node.js v20
- **State Management**: LocalStorage for sessions, in-memory for panels

### Architecture Decisions

1. **No Framework Choice**: Vanilla JS chosen for simplicity and minimal overhead on Raspberry Pi 5
2. **Cytoscape.js**: Industry-standard graph visualization library with excellent performance
3. **Force-Directed Layout**: fcose algorithm provides natural graph layouts automatically
4. **LocalStorage Sessions**: Simple persistence without database overhead
5. **Express 5.x**: Latest version, minimal production server

---

## Layout & UI Structure

```
┌────────────────────────────────────────────────────────────────┐
│  App Header: Title + Session Controls (dropdown, new, rename)  │
├──────────────┬────┬──────────────┬────┬──────────────┬─────────┤
│  Panel 1.1   │    │              │    │              │         │
│  (half)      │ ⇄  │  Panel 2.1   │ ⇄  │  Panel 3.1   │         │
├──────────────┤    │  (full)      │    │  (full)      │         │
│  Panel 1.2   │ ⇄  │              │ ⇄  │              │         │
│  (half)      │    │              │    │              │         │
├──────────────┤    ├──────────────┤    ├──────────────┤─────────┤
│  [Actions]   │    │  [Actions]   │    │  [Actions]   │         │
└──────────────┴────┴──────────────┴────┴──────────────┴─────────┘
```

**Gutter Buttons** (between columns):
- 1.1 → 2.1, 1.2 → 2.1, 2.1 → 1.1, 2.1 → 1.2 (between columns 1-2)
- 2.1 → 3.1, 3.1 → 2.1 (between columns 2-3)

**Panel Action Bar**:
- `+ Node`, `+ Edge`, `Edit`, `Delete`, `Clear`, `Approve`, `Import`, `Export`

**Panel Header**:
- Name (e.g., "Panel 1.1")
- Status info: merge direction, last approval time, change count

---

## Data Model

### Core Types

```javascript
// Node identity: label (unique string)
Node = {
  label: string,          // Unique identifier
  props: Record<string, string>  // Arbitrary key-value properties
}

// Edge identity: source + target pair
Edge = {
  source: string,         // Node label
  target: string,         // Node label
  props: Record<string, string>
}

// Graph: collection of nodes and edges
Graph = {
  nodes: Node[],
  edges: Edge[]
}

// Panel state: graph + metadata
PanelState = {
  id: "1.1" | "1.2" | "2.1" | "3.1",
  graph: Graph,           // Current working state
  baseGraph: Graph | null, // Snapshot at last approval (diff baseline)
  mergeDirection: string | null, // e.g., "1.1 → 2.1" (locks further merges)
  lastApproval: string | null    // ISO 8601 timestamp
}

// Diff entry: describes a single change
DiffEntry = {
  type: "node" | "edge",
  action: "added" | "removed" | "modified",
  key: string,            // node label or "source→target"
  oldProps: object | null,
  newProps: object | null
}
```

### Identity Rules

- **Nodes**: Identified by `label` (string)
- **Edges**: Identified by `source + target` pair
- **Props**: Flat key-value strings (no nesting)

---

## Core Behaviors

### 1. Approval Workflow

**Problem**: Without approval, users would lose track of what changed.

**Solution**: Every edit or merge creates diffs against `baseGraph` until user approves:

```javascript
// Initial state
graph = baseGraph = null  // Clean, no colors

// User adds node A
graph = { nodes: [A] }
baseGraph = null
→ Diff: [{ type: "node", action: "added", key: "A" }]
→ Visual: Node A is GREEN

// User clicks Approve
baseGraph = { nodes: [A] }
→ Diff: []
→ Visual: Node A becomes default color (clean)

// User adds node B
graph = { nodes: [A, B] }
baseGraph = { nodes: [A] }
→ Diff: [{ type: "node", action: "added", key: "B" }]
→ Visual: Node B is GREEN, A is default
```

### 2. Merge/Push Logic

**5 Cases**:

1. **Target empty** → Copy graph, auto-approve
   ```javascript
   target.graph = source.graph
   target.baseGraph = source.graph
   target.mergeDirection = null
   // No diff, clean state
   ```

2. **Target clean** → Set baseline, apply merge, show diff
   ```javascript
   target.baseGraph = target.graph  // Snapshot BEFORE merge
   target.graph = merge(target.graph, source.graph)
   target.mergeDirection = "1.1 → 2.1"
   // Diff shows what came from source
   ```

3. **Target dirty + same direction** → Apply merge, keep original baseline
   ```javascript
   // Keep existing baseGraph (original snapshot)
   target.graph = merge(target.graph, source.graph)
   // Diff still computed against ORIGINAL baseGraph
   ```

4. **Target dirty + different direction** → BLOCKED
   ```javascript
   if (target.mergeDirection && target.mergeDirection !== direction) {
     throw Error("Blocked: approve pending changes first")
   }
   ```

5. **Conflicts** → Incoming wins (property overwrite)
   ```javascript
   // If both have node A with different props:
   target.node.A.props = incoming.node.A.props  // Incoming wins
   ```

### 3. Diff Computation

```javascript
function computeDiff(baseGraph, currentGraph) {
  // Node changes
  for (node in currentGraph.nodes) {
    if (!baseGraph.has(node)) → added (green)
    else if (props differ) → modified (orange)
  }
  for (node in baseGraph.nodes) {
    if (!currentGraph.has(node)) → removed (red, dashed, ghost)
  }

  // Edge changes (same logic)
}
```

**Visual Mapping**:
- **Added**: Green background/line (#4CAF50)
- **Removed**: Red, dashed, semi-transparent (#F44336, opacity 0.5)
- **Modified**: Orange border/line (#FF9800)

**Ghost Elements**: Removed nodes/edges stay visible (not hidden) until approval.

### 4. Directional Lock

**Problem**: Without locking, users could merge from multiple directions and lose track.

**Solution**: First merge sets `mergeDirection`, subsequent merges must match:

```javascript
// Panel 2.1 is clean
push(1.1 → 2.1)  // OK, sets mergeDirection = "1.1 → 2.1"

// Panel 2.1 now has pending changes (dirty)
push(1.1 → 2.1)  // OK, same direction
push(1.2 → 2.1)  // BLOCKED, different direction (1.2 vs 1.1)
push(3.1 → 2.1)  // BLOCKED, different direction

// User approves
// Panel 2.1 is clean again
push(3.1 → 2.1)  // OK, new direction allowed
```

---

## File Structure

```
graph-merge/
├── package.json              # npm scripts, dependencies
├── vite.config.js            # Vite config (root: src, allowedHosts)
├── server.js                 # Express production server (HOST/PORT env)
├── SPEC.md                   # This file
├── README.md                 # User-facing docs (usage, install)
├── src/
│   ├── index.html            # App shell: header, 3-column grid, panels
│   ├── main.js               # Entry point: init panels, wire events
│   ├── style.css             # Dark theme, CSS grid, dialogs, toasts
│   │
│   ├── graph/                # Pure data layer (no DOM, no side effects)
│   │   ├── model.js          # Graph CRUD: createGraph, addNode, removeNode
│   │   ├── diff.js           # computeDiff(base, current) → DiffEntry[]
│   │   ├── merge.js          # mergeGraphs(target, incoming) → Graph
│   │   └── serializer.js     # JSON import/export, validation
│   │
│   ├── ui/                   # Impure UI layer (DOM, Cytoscape, localStorage)
│   │   ├── panel.js          # Panel class: Cytoscape + state + merge logic
│   │   ├── dialogs.js        # Modal dialogs: add node/edge, edit props
│   │   ├── session.js        # Session management: localStorage CRUD
│   │   ├── clipboard.js      # Copy/paste subgraph (Ctrl+C/V)
│   │   └── toast.js          # Toast notifications
│   │
│   └── cytoscape/
│       └── styles.js         # Cytoscape stylesheet (base + diff classes)
```

### Module Responsibilities

**graph/model.js**: Pure functions for graph manipulation
- `createGraph()`, `addNode()`, `removeNode()`, `addEdge()`, etc.
- All functions return NEW graphs (immutable)
- No Cytoscape, no DOM, no side effects

**graph/diff.js**: Diff algorithm
- `computeDiff(baseGraph, currentGraph) → DiffEntry[]`
- Pure function, deterministic

**graph/merge.js**: Merge algorithm
- `mergeGraphs(target, incoming) → Graph`
- Incoming wins on conflicts
- Pure function

**graph/serializer.js**: JSON import/export
- `toJSON(graph)`, `fromJSON(jsonStr)`, `validateGraph(data)`
- `importFromFile()` → Promise (file picker UI)
- `exportToFile(graph, filename)` → void (download)

**ui/panel.js**: Panel class (stateful)
- Wraps Cytoscape instance
- Manages `graph`, `baseGraph`, `mergeDirection`, `lastApproval`
- Methods: `addNode()`, `approve()`, `receiveMerge()`, `deleteSelected()`
- Syncs Cytoscape elements with graph data
- Applies diff CSS classes

**ui/dialogs.js**: Dialog functions
- `addNodeDialog(panel)`, `addEdgeDialog(panel)`, `editSelectedDialog(panel)`
- Uses native `<dialog>` element
- Parses props from "key=value" textarea

**ui/session.js**: Session management
- `setupSession(panels)` → initializes
- LocalStorage keys: `graph-merge-sessions`, `graph-merge-active-session`
- Auto-save on changes (debounced 2s)
- Session dropdown: create, rename, delete, switch

**ui/clipboard.js**: Copy/paste
- `setupClipboard(panels)` → initializes keyboard shortcuts
- Ctrl+C: copy selected subgraph
- Ctrl+V: paste to focused panel (uses `receiveMerge`)

**ui/toast.js**: Notifications
- `showToast(message, type, duration)`
- Types: info, success, error

**cytoscape/styles.js**: Cytoscape CSS
- Base node/edge styles
- Diff classes: `.diff-added`, `.diff-removed`, `.diff-modified`

---

## Testing & Verification

### Manual Test Cases (from implementation plan)

1. ✅ `npm run dev` → opens in browser, 4 panels visible
2. ✅ Create nodes/edges in panel 1.1 → diff colors appear → approve → clean
3. ✅ Push 1.1 → 2.1 → green additions shown → approve
4. ✅ Edit 2.1, push 2.1 → 3.1 → see merged diff
5. ✅ Try cross-direction merge → blocked with error
6. ✅ Export graph → edit JSON → import → diff shown
7. ✅ Copy/paste between panels → merge logic applies
8. ✅ Save session → refresh → restore → all state preserved
9. ✅ `npm run build && npm start` → serves on configured port

### Known Working State

- Vite dev server: `npm run dev` → http://0.0.0.0:5173
- Production build: `npm run build` → dist/
- Production server: `npm start` → http://0.0.0.0:3000
- Tailscale access: Configured via `allowedHosts: ['all', 'malina.tail5985a4.ts.net']`
- Platform: Raspberry Pi 5, Node v20.19.5

---

## Key Implementation Details

### Graph → Cytoscape Sync

```javascript
// Panel._syncCytoscape()
// 1. Clear Cytoscape elements
// 2. Add current nodes/edges from graph
// 3. Add "ghost" removed elements from baseGraph (for diff viz)
// 4. Run layout (fcose for multi-node, grid for single)
```

**Props Flattening**: Node/edge props stored as `p_key` in Cytoscape data:
```javascript
node.props = { color: "blue", weight: "5" }
→ Cytoscape: { id: "A", label: "A", p_color: "blue", p_weight: "5" }
```

### Diff Class Application

```javascript
// Panel._applyDiffClasses()
const diffs = computeDiff(baseGraph, graph)
for (diff of diffs) {
  if (diff.action === "removed") continue  // handled in _syncCytoscape
  cy.$id(diff.key).addClass(`diff-${diff.action}`)
}
```

**Removed Elements**: Added during sync with `classes: 'diff-removed'` and red/dashed styles.

### Session Auto-Save

```javascript
// ui/session.js
window.addEventListener('panel-change', debouncedSave)

// Panel._emitChange()
window.dispatchEvent(new CustomEvent('panel-change', { detail: { panelId } }))
```

**Debounce**: 2 seconds to avoid excessive localStorage writes.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+C | Copy selected subgraph |
| Ctrl+V | Paste to focused panel |
| Delete | Delete selected elements |
| Escape | Deselect all / close dialog |

---

## Functional Paradigm Choices

### Pure vs Impure Separation

**Pure Layer** (`graph/`):
- All functions return new data (no mutation)
- No DOM access, no Cytoscape, no localStorage
- Deterministic: same input → same output
- Testable in Node.js without browser

**Impure Layer** (`ui/`):
- Panel class manages Cytoscape instance
- Dialogs manipulate DOM
- Session writes to localStorage
- Event listeners, side effects

### Immutability

```javascript
// BAD (mutation)
function addNode(graph, node) {
  graph.nodes.push(node)  // Mutates input
  return graph
}

// GOOD (immutable)
function addNode(graph, node) {
  return {
    nodes: [...graph.nodes, node],  // New array
    edges: [...graph.edges]          // New array
  }
}
```

**Why**: Enables:
- Undo/redo (future feature)
- Time-travel debugging
- Reliable diff computation
- No accidental state corruption

---

## Future Enhancement Ideas

### Potential Features (not implemented)

1. **Undo/Redo**: Leverage immutable graph history
2. **Multi-select operations**: Bulk property edits
3. **Graph templates**: Presets (tree, DAG, cycle)
4. **Export to PNG/SVG**: Save visual representation
5. **Collaborative mode**: Multi-user editing (WebSocket)
6. **Diff algorithms**: Different merge strategies (3-way, recursive)
7. **Property validation**: Schema enforcement
8. **Search/filter**: Find nodes by property
9. **Zoom/pan controls**: Better navigation for large graphs
10. **Nested properties**: JSON objects instead of flat strings

### Technical Debt

1. **No automated tests**: Manual testing only
2. **Bundle size**: Cytoscape is 586 kB (consider code-splitting)
3. **Accessibility**: No ARIA labels, keyboard nav incomplete
4. **Mobile**: Layout not optimized for small screens
5. **Error handling**: Some edge cases not covered (e.g., circular deps)

---

## Development Workflow

### Local Development

```bash
# Install
npm install

# Dev server (HMR enabled)
npm run dev
# → http://0.0.0.0:5173

# Production build
npm run build
# → dist/

# Production server
npm start
# → http://0.0.0.0:3000 (serves dist/)
```

### Environment Variables

**server.js**:
- `HOST`: Default `0.0.0.0`
- `PORT`: Default `3000`

Example:
```bash
HOST=localhost PORT=8080 npm start
```

### Debugging

**Browser Console**:
```javascript
window.__panels  // Map of panel instances
window.__panels.get('1.1').cy  // Cytoscape instance
window.__panels.get('1.1').graph  // Current graph data
```

**Vite HMR**: Hot module replacement works for all `.js`, `.css` changes.

---

## Architectural Trade-offs

### Decisions Made

1. **Vanilla JS vs React/Vue**
   - ✅ Simpler, smaller bundle, less overhead
   - ❌ More manual DOM management, no component model

2. **LocalStorage vs Database**
   - ✅ Zero setup, works offline, simple
   - ❌ Size limit (5-10 MB), no multi-device sync

3. **Cytoscape vs D3/custom**
   - ✅ Batteries-included, excellent layouts
   - ❌ Large bundle size, learning curve

4. **Force-directed layout vs Manual**
   - ✅ Automatic, looks good for most graphs
   - ❌ Can be chaotic for large graphs

5. **Immutable data vs Mutable**
   - ✅ Predictable, easier to reason about
   - ❌ More memory allocations (acceptable for small graphs)

6. **Native `<dialog>` vs Modal library**
   - ✅ No dependencies, native API
   - ❌ Limited styling, browser support (good enough for modern browsers)

---

## Known Limitations

1. **Graph size**: Performance degrades beyond ~500 nodes (Cytoscape rendering)
2. **Session limit**: LocalStorage ~5 MB (thousands of nodes possible)
3. **No conflict resolution UI**: Incoming always wins (by design)
4. **No multi-panel merge**: Can only merge from one source at a time
5. **Properties are strings**: No typed values (numbers, booleans, dates)
6. **No edge labels**: Properties not shown on edges (only in edit dialog)
7. **Layout resets on change**: No position persistence

---

## Design Philosophy

### KISS (Keep It Simple, Stupid)
- No over-engineering: build what's needed now
- Vanilla JS over framework complexity
- LocalStorage over database setup

### DRY (Don't Repeat Yourself)
- Graph operations in `graph/model.js` (reusable)
- Diff algorithm centralized in `diff.js`
- Cytoscape styles in one place

### YAGNI (You Aren't Gonna Need It)
- No backend API (LocalStorage sufficient)
- No authentication (single-user tool)
- No complex state management (plain objects enough)

### Functional Core, Imperative Shell
- Pure functions (`graph/`) → easy to test, reason about
- Impure shell (`ui/`) → handles I/O, DOM, side effects

---

## Glossary

- **Panel**: One of 4 graph canvases (1.1, 1.2, 2.1, 3.1)
- **Graph**: Collection of nodes and edges
- **Node**: Vertex in graph, identified by label
- **Edge**: Directed connection from source to target
- **Baseline**: Snapshot of graph at last approval (stored in `baseGraph`)
- **Diff**: Difference between baseline and current graph
- **Merge**: Combining two graphs (incoming wins on conflicts)
- **Push**: Merging one panel's graph into another
- **Approve**: Accepting pending changes, clearing diff colors
- **Clean**: Panel with no pending changes (graph === baseGraph)
- **Dirty**: Panel with pending changes (diff not empty)
- **Directional Lock**: Once dirty from a merge, panel only accepts merges from same direction
- **Ghost Element**: Removed node/edge still visible for diff visualization

---

## Contact & Maintenance

**Created**: 2026-02-13
**Platform**: Raspberry Pi 5
**Node Version**: v20.19.5
**Purpose**: Educational tool for learning graph merge algorithms

**Maintenance Notes**:
- No external dependencies beyond npm packages
- All state in LocalStorage (no database cleanup needed)
- Vite auto-updates handled by npm
- Express 5.x uses new path syntax: `/{*path}` not `*`
