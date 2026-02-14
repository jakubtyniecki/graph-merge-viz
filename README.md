# Graph Merge Visualizer

An interactive visual learning tool for understanding graph merge algorithms. Create, edit, and merge directed graphs across 4 panels with real-time diff visualization.

![Layout](https://via.placeholder.com/800x400/1a1a2e/4fc3f7?text=Graph+Merge+Visualizer)

## Features

- **4-Panel Workflow**: Work with multiple graphs simultaneously
- **Visual Diffs**: See what changed (green = added, red = removed, orange = modified)
- **Merge Logic**: Push graphs between panels with conflict resolution
- **Approval System**: Approve changes to establish new baselines
- **Session Management**: Named sessions saved in browser storage
- **Copy/Paste**: Clone subgraphs between panels
- **Import/Export**: Save and load graphs as JSON
- **Keyboard Shortcuts**: Efficient workflow with Ctrl+C/V, Delete, Escape

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:5173 in your browser.

## Usage

### Creating a Graph

1. Click **"+ Node"** in any panel
2. Enter a label (e.g., "A") and optional properties (key=value format)
3. Repeat to create more nodes
4. Click **"+ Edge"** to connect nodes
5. Select source and target nodes from dropdowns

### Understanding Diffs

Every change shows up in color until you **Approve**:

- 🟢 **Green** = Newly added
- 🔴 **Red/Dashed** = Removed (ghost element)
- 🟠 **Orange border** = Modified properties

Click **Approve** to accept changes and clear colors.

### Merging Graphs

1. Create a graph in Panel 1.1
2. Click the gutter button **"1.1 → 2.1"** to push it to Panel 2.1
3. See the diff in Panel 2.1 (green additions)
4. Edit Panel 2.1 to make more changes
5. Push to Panel 3.1: **"2.1 → 3.1"**
6. Experiment with different merge paths!

### Directional Locking

Once a panel has pending changes from a merge (e.g., "1.1 → 2.1"), it can only receive more merges from the **same direction** until you **Approve**.

Example:
```
✅ 1.1 → 2.1 (first merge, sets direction)
✅ 1.1 → 2.1 (same direction, allowed)
❌ 1.2 → 2.1 (different direction, BLOCKED)
✅ Approve → Clear → Any direction allowed again
```

### Sessions

**Save your work automatically**:
- Sessions auto-save every 2 seconds
- Create new sessions via header dropdown
- Switch between sessions anytime
- Rename or delete sessions as needed

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+C` | Copy selected nodes/edges |
| `Ctrl+V` | Paste to focused panel |
| `Delete` | Delete selected elements |
| `Escape` | Deselect all |

## Production Deployment

```bash
# Build for production
npm run build

# Serve production build
npm start
```

The app will be available at http://0.0.0.0:3000

### Environment Variables

- `HOST`: Server host (default: `0.0.0.0`)
- `PORT`: Server port (default: `3000`)

Example:
```bash
HOST=localhost PORT=8080 npm start
```

## Graph JSON Format

Import/export graphs in this format:

```json
{
  "nodes": [
    { "label": "A", "props": { "color": "blue", "weight": "5" } },
    { "label": "B", "props": {} }
  ],
  "edges": [
    { "source": "A", "target": "B", "props": { "weight": "1" } }
  ]
}
```

**Rules**:
- Node labels must be unique
- Edge source/target must reference existing nodes
- Properties are flat key-value strings

## Architecture

- **Pure functional core**: Graph operations are immutable
- **Cytoscape.js**: Graph rendering with force-directed layout
- **LocalStorage**: Session persistence (5-10 MB limit)
- **Vite**: Fast dev server with HMR
- **Express**: Minimal production server

See `SPEC.md` for detailed technical documentation.

## Browser Support

- Chrome/Edge 90+
- Firefox 90+
- Safari 15+

Requires native `<dialog>` element support.

## Troubleshooting

### Dev server not accessible from network

Add your hostname to `vite.config.js`:

```javascript
server: {
  host: '0.0.0.0',
  allowedHosts: ['all', 'your-hostname.local'],
}
```

### Session data lost

Sessions are stored in browser LocalStorage. Clearing browser data will delete sessions. Export important graphs as JSON files.

### Layout looks wrong

Force-directed layouts can be chaotic for large graphs. Try:
1. Approve changes to stabilize
2. Reload the panel (import/export)
3. Work with smaller subgraphs

## Development

```bash
# Install dependencies
npm install

# Start dev server (HMR enabled)
npm run dev

# Build for production
npm run build

# Serve production build
npm start
```

**File structure**:
```
src/
├── graph/         # Pure data layer
│   ├── model.js   # Graph CRUD operations
│   ├── diff.js    # Diff algorithm
│   ├── merge.js   # Merge algorithm
│   └── serializer.js  # JSON import/export
├── ui/            # Impure UI layer
│   ├── panel.js   # Panel class (Cytoscape wrapper)
│   ├── dialogs.js # Modal dialogs
│   ├── session.js # Session management
│   ├── clipboard.js  # Copy/paste
│   └── toast.js   # Notifications
└── cytoscape/
    └── styles.js  # Graph styling
```

## License

ISC

## Credits

Built with:
- [Cytoscape.js](https://js.cytoscape.org/) - Graph visualization
- [cytoscape-fcose](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) - Force-directed layout
- [Vite](https://vitejs.dev/) - Build tool
- [Express](https://expressjs.com/) - Web server
