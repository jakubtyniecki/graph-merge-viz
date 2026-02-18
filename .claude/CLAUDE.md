# Graph Merge Visualizer — Project CLAUDE.md

**GitHub Repo:** https://github.com/jakubtyniecki/graph-merge-viz (private)
**Branch:** master (single branch, keep clean)
**Last Updated:** 2026-02-18 (template system: typed nodes/edges + graph constraints)

---

## Project Overview

**Purpose:** Educational web tool for learning graph merge algorithms through interactive visualization.

**Platform:** Raspberry Pi 5, hobby project
**Stack:** Vanilla JS (ES modules) + Cytoscape.js + Vite + Express.js + LocalStorage

---

## Key Architecture

### Recent Changes

**2026-02-18: Template System — Typed Nodes/Edges + Graph Constraints**

1. **New Files**
   - `src/graph/template.js` — `GRAPH_TYPES` constant, `defaultTemplate()`, `createTemplate()`, add/remove/update type functions
   - `src/graph/constraints.js` — `validateEdgeAdd()`, `wouldCreateCycle()`, `hasCycle()`, `isConnected()`, disconnect checks, undirected duplicate edge check
   - `src/ui/template-ui.js` — Global template CRUD in header (localStorage key: `graph-merge-templates`), `uniqueName()` utility

2. **Data Model Changes**
   - Node: `{ label, type: "nt1" | null, props }` — `type` preserved by deepClone/merge/serializer
   - Edge: `{ source, target, type: "et1" | null, props }`
   - Session now has `template: { name, graphType, nodeTypes: [{id, label, color}], edgeTypes: [...] }`
   - Template storage: global templates in `localStorage['graph-merge-templates']`, session template embedded in session data

3. **Template System Architecture**
   - Global templates: managed in header via `template-ui.js`, selecting applies to current panels
   - Session template: embedded deep-copy; "New Session" dialog picks starting template; "Edit Template" in session menu
   - `Panel.setTemplate(template)` rebuilds Cytoscape styles via `cy.style().fromJson(...).update()`
   - `buildStylesForTemplate(template)` in `styles.js`: appends undirected arrow removal + node/edge type colors to `baseStyles`
   - Migration: old sessions without `template` get `{ graphType: 'DG', ... }` to preserve directed arrows

4. **Constraint Enforcement**
   - `addEdge()` in Panel calls `validateEdgeAdd()` — blocks cycles in acyclic types, undirected duplicate edges, self-loops
   - Post-merge: `hasCycle()` check in `receiveMerge()` → warning toast (not blocked)
   - UTree deletes: `deleteSelected(confirmFn)` checks `wouldDisconnectOnNodeRemove/EdgeRemove` → warn-but-allow dialog
   - `confirmFn` passed from `main.js`, `context-menu.js`, and `clipboard.js` key handler

5. **UI Changes**
   - `addNodeDialog`: type `<select>` if template has nodeTypes
   - `addEdgeDialog`: type `<select>` if edgeTypes; "Node A/B" labels for undirected types
   - `editSelectedDialog`: type dropdown (pre-selected to current type) for nodes and edges
   - `editTemplateDialog(template, onSave)`: interactive editor for node/edge types (label + color picker + delete + add)
   - `newSessionDialog(globalTemplates)`: name + template selection (replaces `prompt`)

6. **Session Changes**
   - `setupSession(panels, layoutManager, onTemplateChange)` — new third param callback
   - "Edit Template" in session ☰ menu → calls `editTemplateDialog` → propagates via `onTemplateChange`
   - Import: template travels with session; session names use `uniqueName()` to avoid collisions

**2026-02-16: Bug Fixes + Branch Selection Feature**

1. **Fixed Paste Deleting Existing Nodes** (`src/ui/panel.js`, `src/ui/clipboard.js`)
   - Added `pasteSubgraph()` method — additive-only merge by passing `null` base graph to `mergeGraphs()`
   - Changed `pasteToPanel()` and `pasteBranchToNode()` to use `pasteSubgraph()` instead of `receiveMerge()`
   - Fixes deletion logic that treated clipboard subgraph as complete panel state

2. **Fixed Dialog Positioning** (`src/ui/dialogs.js`, `src/ui/context-menu.js`, `src/main.js`)
   - All dialog functions now receive `panelEl` as parameter for proper centering
   - Updated: `addNodeDialog`, `addEdgeDialog`, `editSelectedDialog`, paste confirmations, `confirmClose`
   - Dialogs now center on affected panel instead of viewport

3. **Added "Select Branch" Feature** (`src/ui/panel.js`, `src/ui/clipboard.js`, `src/ui/context-menu.js`)
   - New `selectBranch()` method in Panel — selects all ancestors + connecting edges
   - Context menu: "Select Branch from X" option for each node
   - Auto-select on Copy Branch — branch is highlighted when copied

**2026-02-16: Merge Strategy Overhaul + Panel Features**

1. **Simplified Merge Strategy** (`src/ui/panel.js`)
   - Removed incoming baseline param from `receiveMerge()` — now uses target's own `baseGraph` for deletion detection
   - Simplified from 5 cases to 2: empty target (auto-approve) vs normal merge
   - Source must be clean (approved) before merging — blocked with modal if dirty
   - Target can receive merges when dirty (no directional lock)
   - Always diffs against target's last approved state, not incoming baseline

2. **Panel Management Features** (`src/ui/layout.js`)
   - **Rename panels**: Click panel name → dialog → updates in header & merge buttons
   - **Add panel**: `+ Panel` button in header → appends new panel to right (70/30 split)
   - **Zoom panel**: Click `⤢` button or press Escape → tmux-style zoom (only renders zoomed panel)
   - **Split icons**: Changed to `↔` (side-by-side) and `↕` (top/bottom)
   - **Zone-based merge gutters**: Buttons align to panel midpoints in complex layouts

3. **Data Model Changes**
   - Panel nodes now have optional `name` field: `{ type: "panel", id: "1", name: "My Graph" }`
   - Merge buttons use panel names instead of IDs
   - Layout tree serialization includes panel names

**2026-02-13: Dynamic Layout & Merge Button Redesign**

1. **Recursive Split Tree Layout** (`src/ui/layout.js`)
   - Replaces static 3-col/4-panel grid with dynamic split tree
   - Default: 2 panels side-by-side (vertical split)
   - Users can split (h/v) and close panels
   - Panel IDs: simple numbers (1, 2, 3...) instead of 1.1, 2.1

2. **Merge Buttons Between Adjacent Panels**
   - In resize gutter: push/pull buttons between sibling panels
   - Only appears between sibling panels in tree
   - Draggable resize handle in same gutter

3. **Session Persistence**
   - Layout tree saved with each session
   - Old format (X.Y panel IDs) auto-migrated to new (1, 2, 3...)
   - Full state restoration on session switch

### Architecture Decisions

- **Functional Core**: Pure functions in `src/graph/` (model, diff, merge, serializer)
- **Imperative Shell**: UI layer (`src/ui/`) handles DOM, Cytoscape, localStorage
- **Immutability**: All graph operations return new objects (no mutations)
- **Event Delegation**: Panel action buttons wired via `#app` delegation
- **State Preservation**: Layout manager saves/restores panel states during resize

---

## File Structure

```
src/
├── index.html              # Minimal: header + empty #app + toast
├── main.js                 # Entry: init LayoutManager, wire events, propagateTemplate()
├── style.css               # Dark theme, split containers, merge gutters, template UI
│
├── graph/                  # Pure data layer (no DOM/side effects)
│   ├── model.js           # Graph CRUD: createGraph, addNode(label, props, type), etc.
│   ├── diff.js            # computeDiff(base, current) → DiffEntry[]
│   ├── merge.js           # mergeGraphs(target, incoming) → Graph
│   ├── serializer.js      # JSON import/export + validation (preserves type field)
│   ├── template.js        # GRAPH_TYPES, defaultTemplate(), createTemplate(), type CRUD
│   └── constraints.js     # validateEdgeAdd(), wouldCreateCycle(), hasCycle(), isConnected()
│
├── ui/                    # Impure UI layer (DOM, Cytoscape, localStorage)
│   ├── layout.js          # LayoutManager: recursive split tree + render
│   ├── panel.js           # Panel class: template property, setTemplate(), constraint-aware addEdge/deleteSelected
│   ├── dialogs.js         # Modal dialogs + editTemplateDialog() + newSessionDialog()
│   ├── session.js         # LocalStorage: sessions + template, setupSession(panels, lm, onTemplateChange)
│   ├── template-ui.js     # Global template CRUD in header (localStorage: graph-merge-templates)
│   ├── clipboard.js       # Ctrl+C/V: copy/paste subgraph
│   └── toast.js           # Notifications: showToast()
│
└── cytoscape/
    └── styles.js          # baseStyles + buildStylesForTemplate(template)
```

---

## Critical Implementation Details

### LayoutManager (src/ui/layout.js)

**Data Structure:**
```javascript
LayoutNode =
  | { type: "panel", id: string, name?: string }
  | { type: "split", direction: "h"|"v", children: [LayoutNode, LayoutNode], sizes: [num, num] }
```

**Key Methods:**
- `init()` — Create default 2-panel layout
- `splitPanel(id, dir)` — Replace panel with split node + new panel (preserves name)
- `closePanel(id)` — Remove panel, promote sibling (clears zoom if closed panel is zoomed)
- `addPanel()` — Wrap tree in new vertical split with 70/30 ratio
- `toggleZoom(id)` — Show only zoomed panel (tmux-style), or restore normal layout
- `render()` — Destroy all panels, rebuild DOM, recreate panels (preserves state via getState/setState callbacks)
  - In zoom mode: only renders zoomed panel (saves memory)
- `getLayout() / setLayout()` — Serialize/restore for sessions (includes panel names)

**Zone-Based Merge Gutters:**
- `_getZones(childNode, gutterDir)` — Returns array of `{ panels: [{id, name}], size: % }` for alignment
- Perpendicular splits create separate zones (buttons align to each panel's midpoint)
- Parallel splits create one zone (all buttons centered)

**State Preservation:**
- When rendering, LayoutManager calls `getState(id)` before destroying old panels
- After creating new panels, calls `setState(id, state)` to restore
- Passed as callbacks in constructor from main.js

### Panel Class (src/ui/panel.js)

**Key Lifecycle:**
1. `new Panel(id, canvasEl)` — Create Cytoscape instance in container
2. `getState()` — Return { graph, baseGraph, mergeDirection, lastApproval }
3. `setState(state)` — Restore state + re-sync Cytoscape + re-apply diffs
4. `receiveMerge(incomingGraph, direction)` — Apply merge logic (2 cases: empty target vs normal merge)
5. `approve()` — Clear diffs, snapshot baseGraph
6. `isClean()` — Public method to check if panel has no pending changes (used by main.js for merge blocking)

**Merge Logic (Simplified):**
- **Case 1**: Target empty → copy incoming, auto-approve (no diff)
- **Case 2**: Normal merge → use target's own `baseGraph` as 3rd arg to `mergeGraphs()` for deletion detection
- Source-dirty check now in `main.js` (blocks with `infoDialog` before calling `receiveMerge`)
- No directional lock — target can receive merges from any direction when dirty

**Diff Visualization:**
- `computeDiff(baseGraph, currentGraph)` creates DiffEntry[] for changes
- `_applyDiffClasses()` adds `.diff-added` / `.diff-removed` / `.diff-modified`
- Removed elements rendered as "ghost" nodes/edges (semi-transparent, dashed)

### Session Management (src/ui/session.js)

**Storage Format:**
```json
{
  "layout": { "tree": LayoutNode, "nextId": 3 },
  "panels": { "1": PanelState, "2": PanelState },
  "savedAt": "ISO timestamp"
}
```

**Migration:**
- Old format (state with X.Y keys) auto-detected and converted
- Converts to 2-panel vertical split with first 2 old panels mapped to 1, 2
- New sessions start with fresh 2-panel layout

---

## Development Workflow

### Setup
```bash
npm install          # Install dependencies
npm run dev          # Start Vite dev server (http://0.0.0.0:5173 + HMR)
npm run build        # Build for production → dist/
npm start            # Serve dist/ via Express (http://0.0.0.0:3000)
```

### Environment
- **Node.js:** v20+
- **Vite HMR:** Enabled for all .js/.css changes
- **Tailscale:** Configured in vite.config.js for allowedHosts

### Git Workflow
- Single `master` branch
- Commit frequently with clear messages
- Always push to origin/master
- `.gitignore`: node_modules/, dist/, package-lock.json, .env, logs

---

## Testing & Verification

### Manual Test Checklist
1. `npm run dev` → 2 panels visible side by side
2. Split panel (click ⬓/⬒) → see new panel + merge gutter
3. Close panel (click ✕) → promote sibling
4. Add nodes/edges in panel → green diff colors
5. Approve → diffs clear
6. Merge button (>> / <<) → push/pull graph
7. Drag resize handle → smooth resize
8. Save session → refresh → layout + state restored
9. Switch session → old layout/state restored
10. New session → fresh 2 panels

### Known Limitations
- Performance: ~500 nodes max (Cytoscape rendering limit)
- No undo/redo yet
- Properties are strings only (no nested objects)
- Mobile layout not optimized
- No multi-user collaboration

---

## Debugging Tips

**Browser Console:**
```javascript
window.__panels      // Map of active panels
window.__layout      // LayoutManager instance
window.__panels.get('1').cy   // Cytoscape instance for panel 1
window.__panels.get('1').graph // Current graph data
```

**Common Issues:**
- **Panels disappear on resize:** Check LayoutManager.render() state preservation
- **Diffs not showing:** Verify _applyDiffClasses() runs after merge
- **Session not restoring:** Check storage format migration in restoreSession()
- **Merge buttons missing:** Ensure merge gutter renders between split siblings only

---

## Future Ideas

### High Priority
1. Undo/redo (leverage immutable graph history)
2. Better error messages for merge conflicts
3. Graph templates (tree, DAG, cycle)
4. Search/filter nodes by property

### Medium Priority
1. Multi-select node operations
2. Export to SVG/PNG
3. Keyboard shortcuts display
4. Accessibility improvements (ARIA, keyboard nav)

### Low Priority
1. Nested properties (JSON objects, not strings)
2. Edge labels on canvas
3. Collaborative editing (WebSocket)
4. Different merge algorithms

---

## Important Reminders for Future You

1. **Always update SPEC.md + CLAUDE.md together** — SPEC.md is the source of truth for requirements; CLAUDE.md is implementation notes
   - **Update SPEC.md when:** Functional requirements change, new features are planned, success criteria shift
   - **Update CLAUDE.md when:** Implementation details change, architecture patterns used, debugging insights discovered

2. **SPEC.md format:**
   - Keep it pure: functional + non-functional requirements, architecture, design decisions
   - No implementation details (file names, function names, code snippets)
   - Document what the app should do, not how it does it
   - Update whenever user intent or application capability changes

3. **CLAUDE.md format:**
   - Project-specific working notes for handover to future sessions
   - File structure, critical methods, debugging tips
   - Document how you implemented things, not what they do
   - Keep this as the "working memory" for quick context when picking up the project

4. **Test layout changes thoroughly** — split tree is core. Any render changes can break state preservation.

4. **Session format is critical** — migrations must be backwards-compatible. Test old sessions still load.

5. **Keep it simple** — resist adding framework/library dependencies. Vanilla JS has worked well.

6. **Push frequently** to https://github.com/jakubtyniecki/graph-merge-viz — single branch keeps it simple.

7. **When stuck** — check browser console, verify DOM structure matches LayoutManager output, trace through render() call stack.

---

## Quick Reference: Common Tasks

### Add New Panel Action Button
1. Add button HTML in LayoutManager._renderPanel()
2. Wire click handler in main.js event delegation
3. Call panel method (e.g., panel.clearGraph())

### Change Default Layout
Edit LayoutManager.init() to modify tree structure (only 2 panels currently)

### Modify Merge Button Format
Edit LayoutManager._renderMergeGutter() arrow symbols/text

### Add Session Auto-Save Trigger
Listen for 'panel-change' custom event (already set up, just emit when needed)

### Resize Gutter Styling
Edit .merge-gutter / .resize-handle / .merge-btn in style.css

---

---

## References

- **SPEC.md** — Requirements specification (what the app should do)
- **README.md** — User-facing documentation
- **GitHub:** https://github.com/jakubtyniecki/graph-merge-viz

---

Last worked on: **2026-02-18** — Template system: typed nodes/edges, graph constraints (DAG/UTree/Forest/UCG/DG), global template management in header, session template editing.
