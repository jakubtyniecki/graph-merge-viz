# Graph Merge Visualizer — Technical Specification

**Project:** Graph Merge Visualizer
**Purpose:** Educational web tool for learning graph merge algorithms through interactive visualization
**Target Platform:** Raspberry Pi 5
**Project Type:** Hobby project (not enterprise-grade)
**Repository:** https://github.com/jakubtyniecki/graph-merge-viz (private)

---

## Functional Requirements

### Core Features

1. **Multi-Panel Layout**
   - Dynamic, user-controllable panel layout (not fixed grid)
   - Default: 2 panels side-by-side
   - Users can split panels horizontally (`↕`) or vertically (`↔`)
   - Users can close panels (promote sibling) with confirmation dialog
   - Users can add new panels (appends to right with 70/30 split)
   - Users can rename panels (click panel name → dialog)
   - Users can zoom panels (tmux-style: `⤢` button or Escape key)
   - Minimum panel size: 200px

2. **Graph Editing**
   - Create nodes with labels (unique per graph)
   - Create directed edges (source → target)
   - Add arbitrary key-value properties to nodes and edges (string values)
   - Edit existing properties
   - Delete selected nodes/edges
   - Clear entire graph

3. **Graph Merging**
   - Push graph from one panel to another (unidirectional)
   - Source must be clean (approved) before merging — blocked with modal if dirty
   - Target can be dirty — merge always diffs against target's last approved state
   - Incoming graph wins on property conflicts
   - Deletions detected using target's baseline (not incoming baseline)
   - 2 merge cases:
     1. Target empty → auto-approve, no diff
     2. Normal merge → apply incoming to target, diff against target's last approved state
   - No directional lock — target can receive merges from any direction when dirty

4. **Visual Diff Feedback**
   - Added nodes: green
   - Removed nodes: red, dashed, semi-transparent (ghost elements)
   - Modified properties: orange border
   - Diff clears on approval
   - Visual feedback via colors, not text-only

5. **Approval Workflow**
   - Every change creates diffs against last-approved baseline
   - Approve button snapshots current state, clears diffs
   - Allows users to track what changed and when

6. **Session Management**
   - Save/restore multiple sessions with names
   - Session includes: layout tree + all panel states
   - Auto-save on changes (debounced)
   - Session switching without data loss
   - Backward compatibility: auto-migrate old session format

7. **Import/Export**
   - Import graph from JSON file (modal file picker)
   - Export single graph as JSON file (download)
   - Copy selected subgraph (Ctrl+C)
   - Paste subgraph into panel (Ctrl+V, triggers merge)

8. **Merge Button UI**
   - Merge buttons in resize gutter between adjacent panels
   - Zone-based alignment: buttons align to each panel's vertical/horizontal midpoint
   - Vertical split: `Name >> Name` (push) / `Name << Name` (pull)
   - Horizontal split: `Name ▼▼ Name` (push) / `Name ▲▲ Name` (pull)
   - Uses panel names (or "Panel {id}" if unnamed)
   - Only between sibling panels

9. **Keyboard Shortcuts**
   - Ctrl+C: Copy selected subgraph
   - Ctrl+V: Paste into focused panel
   - Ctrl+Z: Undo last operation
   - Ctrl+Shift+Z: Redo last undone operation
   - Delete/Backspace: Delete selected elements
   - Escape: Un-zoom panel / deselect all / close dialog

---

## Non-Functional Requirements

### Performance
- Handle graphs up to ~500 nodes without degradation
- Layout computation < 500ms for typical graphs
- Smooth resizing (60fps ideally)
- Session save/load < 1s

### Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Raspberry Pi 5 hardware (ARM64, Node.js v20+)
- No external API calls or cloud dependencies
- Works offline

### Reliability
- Data persistence via LocalStorage (~5-10 MB limit per site)
- No data loss on browser refresh or session switch
- Graceful error handling for invalid JSON imports
- Prevent invalid graph states (e.g., edges to non-existent nodes)

### Maintainability
- Pure functions for all graph operations (testable, deterministic)
- Clear separation: pure data layer (`graph/`) vs impure UI layer (`ui/`)
- Immutable data structures (no in-place mutations)
- Documented architecture decisions
- No external database needed

### User Experience
- Intuitive UI with dark theme
- Clear visual feedback (diffs, toasts, status info)
- Responsive to all interactions
- Help modal with keyboard shortcuts
- Panel header shows: panel name, merge direction, approval time, change count

---

## Architecture

### Technology Stack

**Frontend:**
- **Framework:** Vanilla JavaScript (ES modules)
- **Graph Rendering:** Cytoscape.js v3.33.1
- **Layout Algorithm:** cytoscape-fcose v2.2.0 (force-directed)
- **Build Tool:** Vite v7.3.1
- **Styling:** CSS3 with CSS variables (dark theme)

**Backend:**
- **Server:** Express.js v5.2.1 (minimal, ~15 lines)
- **Runtime:** Node.js v20+
- **State:** LocalStorage (no database)

**Development:**
- **Package Manager:** npm
- **Module System:** ES modules
- **Testing:** Manual (no automated tests yet)

### Architectural Patterns

1. **Functional Core, Imperative Shell**
   - Pure functions: `graph/` layer (model, diff, merge, serializer)
   - Impure operations: `ui/` layer (DOM, Cytoscape, localStorage)

2. **Immutability**
   - All graph operations return new objects
   - No mutations of input data
   - Enables undo/redo in future

3. **Event-Driven UI**
   - Custom 'panel-change' event for debounced auto-save
   - Event delegation for action buttons
   - Keyboard handlers for shortcuts

4. **Recursive Layout Tree**
   - Layout represented as recursive binary tree
   - Split nodes: `{ type: "split", direction, children, sizes }`
   - Panel nodes: `{ type: "panel", id }`
   - Enables flexible, user-controlled layouts

5. **State Preservation During Render**
   - LayoutManager saves panel states before destroying
   - After DOM rebuild, restores states to new panels
   - Ensures no data loss during layout changes

### Data Model

```
Node = {
  label: string           // Unique identifier
  props: Record<string, string>  // Key-value properties
}

Edge = {
  source: string          // Node label
  target: string          // Node label
  props: Record<string, string>
}

Graph = {
  nodes: Node[]
  edges: Edge[]
}

PanelState = {
  id: string              // Simple number: "1", "2", "3"...
  graph: Graph
  baseGraph: Graph | null // Snapshot at last approval (diff baseline)
  mergeDirection: string | null  // e.g., "1 → 2"
  lastApproval: string | null    // ISO 8601 timestamp
}

DiffEntry = {
  type: "node" | "edge"
  action: "added" | "removed" | "modified"
  key: string             // node label or "source→target"
  oldProps: object | null
  newProps: object | null
}

LayoutNode =
  | { type: "panel", id: string }
  | { type: "split", direction: "h" | "v", children: [LayoutNode, LayoutNode], sizes: [number, number] }

Session = {
  layout: { tree: LayoutNode, nextId: number }
  panels: Record<string, PanelState>
  savedAt: string         // ISO 8601 timestamp
}
```

---

## Key Design Decisions

### Why Vanilla JavaScript?
- Minimal overhead on Raspberry Pi 5
- No framework complexity for educational tool
- Direct DOM control for custom layout rendering
- Smaller bundle size

### Why Cytoscape.js?
- Industry-standard graph visualization library
- Excellent performance for typical graph sizes
- Rich styling API (CSS-like selectors)
- Force-directed layouts out of box (fcose)

### Why LocalStorage (not Database)?
- Zero setup, works offline
- Sufficient for hobby project scope (~5-10 MB)
- No server infrastructure needed
- Simple JSON serialization

### Why Immutable Data?
- Predictable state changes
- Easier reasoning about diffs
- Foundation for undo/redo in future
- Testable pure functions

### Why Event Delegation?
- Dynamic panels don't exist at startup
- Centralized event handling (main.js)
- Scalable to many panels without per-panel listeners

### Why Recursive Split Tree?
- Flexible layout (not constrained to grid)
- Preservable as JSON (for session persistence)
- Composable: tree structure mirrors UI hierarchy
- Elegant split/close operations

---

## User Workflows

### Workflow 1: Explore Merge Algorithm
1. Create graph in panel 1 (add nodes A, B, C; add edges A→B, B→C)
2. Modify panel 1 (change properties, see green diffs)
3. Approve panel 1 (diffs clear, baseline set)
4. Create different graph in panel 2
5. Merge panel 1 into panel 2 (click `1 >> 2`)
6. See merged result + diff colors showing what came from panel 1
7. Modify merged result (new diffs appear)
8. Try merging from different direction (blocked if dirty)
9. Approve, then try merging from new direction (now allowed)

### Workflow 2: Manage Multiple Layouts
1. Create session "experiment-1" with 2 panels
2. Split panel 1 vertically (now 3 panels: 1, 3, 2)
3. Add graphs to all panels
4. Save (auto-saves via debounce)
5. Create new session "experiment-2" (fresh 2 panels)
6. Switch back to "experiment-1" (layout + graphs restored)

### Workflow 3: Copy Subgraph
1. In panel 1, select node A and edge A→B (select multiple with click+drag)
2. Press Ctrl+C (subgraph copied)
3. Click in panel 2
4. Press Ctrl+V (paste triggers merge logic)
5. See diff colors for added elements

---

## Testing Requirements

### Manual Test Coverage
- All 5 merge cases execute correctly
- Directional lock prevents invalid merges
- Diffs visualize correctly (green/red/orange)
- Approval clears diffs
- Session save/restore preserves layout and graphs
- Old session format migrates to new format
- Split/close panels preserve graph states
- Resize handles resize smoothly without losing data
- Keyboard shortcuts work (Ctrl+C/V, Delete, Escape)
- Import JSON validates and merges correctly
- Export produces valid JSON

### Known Limitations (Acceptable)
- No automated test suite
- No undo/redo
- Properties are strings only (no nested objects)
- Performance degrades >500 nodes
- Mobile layout not optimized
- No accessibility improvements yet
- No multi-user collaboration

---

## Deployment & Operations

### Development
```bash
npm install              # Install dependencies
npm run dev              # Vite dev server (port 5173 + HMR)
npm run build            # Build for production → dist/
```

### Production
```bash
npm start                # Express server (port 3000, serves dist/)
HOST=0.0.0.0 PORT=3000  # Configurable via environment
```

### Environment Setup
- **Node.js:** v20+ required
- **Platform:** Raspberry Pi 5 (ARM64)
- **Network:** Tailscale configured for remote access (malina.tail5985a4.ts.net)
- **Hosting:** Local network only (no cloud)

### Session Backup
- Sessions stored in browser LocalStorage
- Export graphs as JSON for manual backup
- No automatic server-side persistence

---

## Success Criteria

✅ **Implemented**
1. Dynamic multi-panel layout with split/close
2. Graph editing (nodes, edges, properties)
3. All 5 merge cases with directional lock
4. Visual diff feedback (colors, ghost elements)
5. Approval workflow
6. Session management (save, restore, migrate old format)
7. Import/export
8. Copy/paste subgraph
9. Merge buttons with correct formatting
10. Keyboard shortcuts

⏳ **Future**
1. Automated test suite
2. Undo/redo
3. Better error UI for merge conflicts
4. Search/filter nodes
5. Graph templates
6. Collaborative editing

---

## Glossary

- **Panel:** One graph canvas with Cytoscape instance
- **Graph:** Collection of nodes and edges
- **Node:** Vertex with unique label and properties
- **Edge:** Directed connection (source → target) with properties
- **Merge:** Combine two graphs; incoming wins on conflicts
- **Push:** Merge from source panel to target panel
- **Baseline (baseGraph):** Snapshot at last approval; used to compute diff
- **Diff:** Changes between baseline and current graph
- **Clean:** No pending changes (graph === baseGraph)
- **Dirty:** Pending changes exist (diff not empty)
- **Directional Lock:** Panel only accepts merges from same source direction until approved
- **Ghost Element:** Removed node/edge still visible (red, dashed) for diff visualization
- **Split Tree:** Recursive binary tree representing panel layout
- **Session:** Named snapshot of layout + all panel states
