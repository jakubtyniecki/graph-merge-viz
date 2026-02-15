# Graph Merge Visualizer — Project CLAUDE.md

**GitHub Repo:** https://github.com/jakubtyniecki/graph-merge-viz (private)
**Branch:** master (single branch, keep clean)
**Last Updated:** 2026-02-13

---

## Project Overview

**Purpose:** Educational web tool for learning graph merge algorithms through interactive visualization.

**Platform:** Raspberry Pi 5, hobby project
**Stack:** Vanilla JS (ES modules) + Cytoscape.js + Vite + Express.js + LocalStorage

---

## Key Architecture

### Recent Changes (2026-02-13)

Implemented **Dynamic Layout & Merge Button Redesign**:

1. **Recursive Split Tree Layout** (`src/ui/layout.js`)
   - Replaces static 3-col/4-panel grid with dynamic split tree
   - Default: 2 panels side-by-side (vertical split)
   - Users can split (h/v) and close panels
   - Panel IDs: simple numbers (1, 2, 3...) instead of 1.1, 2.1

2. **Merge Buttons Between Adjacent Panels**
   - In resize gutter: `1 >> 2` / `1 << 2` (push/pull for vertical)
   - For horizontal splits: `1 ▼▼ 2` / `1 ▲▲ 2`
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
├── main.js                 # Entry: init LayoutManager, wire events
├── style.css               # Dark theme, split containers, merge gutters
│
├── graph/                  # Pure data layer (no DOM/side effects)
│   ├── model.js           # Graph CRUD: createGraph, addNode, etc.
│   ├── diff.js            # computeDiff(base, current) → DiffEntry[]
│   ├── merge.js           # mergeGraphs(target, incoming) → Graph
│   └── serializer.js      # JSON import/export + validation
│
├── ui/                    # Impure UI layer (DOM, Cytoscape, localStorage)
│   ├── layout.js          # LayoutManager: recursive split tree + render
│   ├── panel.js           # Panel class: Cytoscape instance + state
│   ├── dialogs.js         # Modal dialogs: add node/edge, edit, import
│   ├── session.js         # LocalStorage: save/restore layout + panels
│   ├── clipboard.js       # Ctrl+C/V: copy/paste subgraph
│   └── toast.js           # Notifications: showToast()
│
└── cytoscape/
    └── styles.js          # Cytoscape stylesheet + diff colors
```

---

## Critical Implementation Details

### LayoutManager (src/ui/layout.js)

**Data Structure:**
```javascript
LayoutNode =
  | { type: "panel", id: string }
  | { type: "split", direction: "h"|"v", children: [LayoutNode, LayoutNode], sizes: [num, num] }
```

**Key Methods:**
- `init()` — Create default 2-panel layout
- `splitPanel(id, dir)` — Replace panel with split node + new panel
- `closePanel(id)` — Remove panel, promote sibling
- `render()` — Destroy all panels, rebuild DOM, recreate panels (preserves state via getState/setState callbacks)
- `getLayout() / setLayout()` — Serialize/restore for sessions

**State Preservation:**
- When rendering, LayoutManager calls `getState(id)` before destroying old panels
- After creating new panels, calls `setState(id, state)` to restore
- Passed as callbacks in constructor from main.js

### Panel Class (src/ui/panel.js)

**Key Lifecycle:**
1. `new Panel(id, canvasEl)` — Create Cytoscape instance in container
2. `getState()` — Return { graph, baseGraph, mergeDirection, lastApproval }
3. `setState(state)` — Restore state + re-sync Cytoscape + re-apply diffs
4. `receiveMerge(graph, direction)` — Apply merge logic (5 cases per spec)
5. `approve()` — Clear diffs, snapshot baseGraph

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

1. **Always update this file** when making significant changes (new features, architecture shifts, bug fixes affecting behavior)

2. **Keep SPEC.md separate** — it's the original requirements. This file is project-specific working notes.

3. **Test layout changes thoroughly** — split tree is core. Any render changes can break state preservation.

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

Last worked on: **2026-02-13** — Dynamic layout implementation complete, repo cleaned.
