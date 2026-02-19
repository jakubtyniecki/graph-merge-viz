# Graph Merge Visualizer

An interactive visual learning tool for understanding graph merge algorithms. Create, edit, and merge graphs across multiple panels with real-time diff visualization.

## Features

- **Dynamic Panel Layouts**: Split panels horizontally or vertically; zoom to focus; close when done
- **Typed Graphs**: Nodes and edges have types with configurable colors; supports directed, acyclic, undirected, forest, and connected-undirected graph types
- **Visual Diffs**: See what changed (green = added, red/dashed = removed, orange = modified)
- **Merge Strategies**: Mirror, Push, Scoped, or None — configurable per merge button
- **Merge Button Customization**: Add/delete/reorder merge buttons per gutter; right-click for options
- **Approval System**: Approve changes to establish new baselines
- **Path Tracking**: Exclude specific paths from DAG graphs with tag-based propagation
- **Templates**: Define node/edge types and graph constraints; global templates or per-session
- **Sessions**: Named sessions auto-saved to browser storage; save/restore full layout + state
- **Copy/Paste**: Clone subgraphs between panels (Ctrl+C / Ctrl+V)
- **Import/Export**: Save and load graphs as JSON
- **Undo/Redo**: Per-panel history with Ctrl+Z / Ctrl+Shift+Z

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

### Creating a Graph

1. Click **"+ Node"** in a panel's action bar
2. Enter a label and optional properties (key=value)
3. Repeat; then click **"+ Edge"** to connect nodes
4. Select source and target from dropdowns

### Understanding Diffs

Every change shows color until you **Approve**:

- **Green** = Newly added
- **Red/Dashed** = Removed (ghost element)
- **Orange border** = Modified properties

Click **Approve** to accept changes and clear colors.

### Merging Graphs

1. Create graphs in two panels
2. Click a merge button in the gutter between them to push one graph into the other
3. See the diff in the target panel
4. Right-click a merge button to choose a strategy: Mirror, Push, Scoped, or None
5. Click `+` in the gutter to add merge buttons for arbitrary panel pairs

### Templates

Templates define node/edge types (label + color) and graph constraints (directed/acyclic/undirected).

- Click **Templates** in the header to manage global templates
- Session template: use the session menu (☰) → **Edit Template**
- Templates travel with exported sessions

### Sessions

- Sessions auto-save every few seconds
- Create new sessions via the session controls
- Switch between sessions using the dropdown
- Export/import sessions as JSON

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo last change |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` | Copy selected nodes/edges |
| `Ctrl+V` | Paste to focused panel |
| `Delete` | Delete selected elements |
| `Escape` | Deselect all / exit zoom mode |

## Production Deployment

```bash
npm run build
npm start
```

Available at http://0.0.0.0:3000

```bash
HOST=localhost PORT=8080 npm start
```

## Graph JSON Format

```json
{
  "nodes": [
    { "label": "A", "props": {}, "type": "nt1" },
    { "label": "B", "props": { "weight": "5" } }
  ],
  "edges": [
    { "source": "A", "target": "B", "props": {}, "type": "et1" }
  ]
}
```

**Rules**: unique node labels, source/target must exist, properties are flat key-value strings.

## Architecture

- **Pure functional core** (`src/graph/`): immutable graph operations
- **Cytoscape.js**: graph rendering with force-directed (fCoSE) layout
- **LocalStorage**: session persistence (5–10 MB limit)
- **Vite**: dev server with HMR; Express for production

See `.claude/SPEC.md` for detailed specification.

## Testing

```bash
npm test              # Vitest unit tests (src/graph/)
npm run test:coverage # Unit tests with coverage report
npm run test:e2e      # Playwright E2E tests (starts dev server)
```

## File Structure

```
src/
├── graph/             # Pure data layer
│   ├── model.js       # Graph CRUD
│   ├── diff.js        # Diff algorithm
│   ├── merge.js       # Merge algorithm
│   ├── serializer.js  # JSON import/export
│   ├── template.js    # Template + type definitions
│   ├── constraints.js # Graph constraint validation
│   └── path-tracking.js  # Path tag computation + exclusion propagation
├── ui/                # Impure UI layer
│   ├── layout.js      # LayoutManager: split tree + gutters + merge buttons
│   ├── panel.js       # Panel class (Cytoscape wrapper, state, merge)
│   ├── dialogs.js     # Modal dialogs
│   ├── session.js     # Session management
│   ├── template-ui.js # Global template CRUD
│   ├── clipboard.js   # Copy/paste subgraph
│   └── toast.js       # Notifications
└── cytoscape/
    └── styles.js      # Base styles + template-driven styling
```

## Browser Support

Chrome/Edge/Firefox/Safari 90+ with native `<dialog>` support.

## License

MIT
