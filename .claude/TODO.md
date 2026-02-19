# TODO — Graph Merge Visualizer

*Bugs, refactoring opportunities, and next-version backlog found during code review.*

---

## Bugs / Correctness Issues

1. **README.md references stale panel IDs** (`1.1`, `2.1`) — update to match current dynamic layout where panel IDs are simple numbers (`1`, `2`, `3`...)

2. **`main.js:193,200` — undo/redo with no focused panel silently operates on first panel** — should do nothing when no panel is focused; currently picks `panels.values().next().value` as fallback which is surprising behavior

3. **`merge.js:filterUpstreamSubgraph` returns original graph reference when scope is empty** — returns `g` (not a copy) which could cause downstream mutation if caller mutates the result; should return `deepClone(g)` or callers must be aware of this

4. **`dialogs.js` — single shared `<dialog>` element prevents nested dialogs** — e.g., a confirm dialog inside changelog preview is not possible; architecture limitation noted in SPEC.md constraints

5. **`path-tracking.js:topoSort` — cycle members appended unordered at end** — may produce non-deterministic path tags on cyclic graphs; tags should be deterministic regardless of input order

6. **Keyboard shortcut `?` help button** — check whether the help dialog is actually wired in `main.js`; button exists in `index.html` but handler may be missing

---

## Refactoring Opportunities

1. **`panel.js` is ~1000+ lines** — candidate for splitting: `panel-history.js` (undo/redo, approval history, changelog) and `panel-tracking.js` (path tracking state + visuals); would improve readability

2. **`layout.js:_allPanelIds` and `_allPanelNodes` both traverse the same tree** — minor DRY opportunity; `_allPanelNodes` could derive from `_allPanelIds` or vice versa

3. **`mergeStrategies` and `mergeButtonLists` are co-stored in `getLayout()`** — consider consolidating into a single `gutterConfig` object; strategy is currently stored separately from button list but logically belongs with each button: `{ source, target, strategy, scopeNodes }`

4. **Keyboard shortcut handler in `main.js`** — the growing `keydown` handler should be extracted to a `setupKeyboard(panels, layout)` function for clarity

5. **`panelEl.querySelectorAll('.panel-overlay')` cleanup pattern** — repeated across several dialog functions; a shared `removeOverlay(panelEl)` utility in `dialogs.js` would remove duplication (partially done, complete it)

6. **Add `type` field to `DiffEntry`** — would allow template-aware diff display to color/label changes by node/edge type; currently diffs lose type information

---

## Approval History — Path Tracking Preview + Level-by-Level Layout

*(Deferred from UI/UX Sprint 2 — Tasks 1–9 shipped in 1.4.0)*

Two sub-issues to fix in `approvalPreviewDialog`:

### 1. Store `pathTrackingEnabled` in approval entries

**File:** `src/ui/panel.js` — `approve()` method

The `_approvalHistory` entries currently do **not** store `pathTrackingEnabled`. Add it:

```js
this._approvalHistory.push({
  graph: deepClone(this.graph),
  baseGraph: this.baseGraph ? deepClone(this.baseGraph) : null,
  timestamp: new Date().toISOString(),
  diffSummary,
  exclusions: deepClone(this.exclusions),
  pathTrackingEnabled: this.pathTrackingEnabled,   // ADD THIS
});
```

Also update `setState` to preserve it when loading history entries (line ~200):

```js
this._approvalHistory = state._approvalHistory ? state._approvalHistory.map(entry => ({
  ...
  pathTrackingEnabled: entry.pathTrackingEnabled || false,   // ADD THIS
})) : [];
```

### 2. Show path tracking styles in approval preview

**File:** `src/ui/dialogs.js` — `approvalPreviewDialog` (around line 715)

After creating the Cytoscape preview instance, apply tracking styles if `entry.pathTrackingEnabled`:

```js
import { computePathTags, propagateExclusions } from '../graph/path-tracking.js';
// (check if already imported — likely is)

if (entry.pathTrackingEnabled && panel.template?.specialTypes?.length > 0) {
  const specialTypes = panel.template.specialTypes;
  const pathTags = computePathTags(entry.graph, specialTypes);
  const effectiveExclusions = propagateExclusions(
    entry.graph, entry.exclusions || {}, pathTags, specialTypes
  );

  for (const [edgeKey, tags] of pathTags) {
    if (tags.length === 0) continue;
    const excluded = effectiveExclusions.get(edgeKey) || new Set();
    const allExcluded = tags.every(t => excluded.has(pathSerializeTag(t, specialTypes)));
    const cyEdge = cy.$id(edgeKey);
    if (cyEdge.length) {
      cyEdge.addClass(allExcluded ? 'path-excluded' : 'path-tracked');
    }
  }

  cy.style()
    .selector('.path-tracked').style({ 'line-color': '#4fc3f7', 'width': 3 })
    .selector('.path-excluded').style({ 'line-color': '#666', 'line-style': 'dashed' })
    .update();
}
```

Check what's already imported at the top of `dialogs.js` — `computePathTags`, `propagateExclusions`, `pathSerializeTag` may already be there.

### 3. Support `level-by-level` in preview layout

**File:** `src/ui/dialogs.js` — `approvalPreviewDialog`, layout section (~line 715)

Currently falls back to `fcose` for unknown algos. Replace the layout call with:

```js
const runPreviewLayout = (cyInstance) => {
  const algo = panel.layoutAlgorithm || 'fcose';
  if (algo === 'level-by-level') {
    // BFS from sinks, assign y positions by level
    const allNodes = cyInstance.nodes();
    if (allNodes.length === 0) return;
    const sinks = allNodes.filter(n => n.outgoers('edge').length === 0);
    const startNodes = sinks.length > 0 ? sinks : allNodes;
    const levels = new Map();
    const queue = [];
    startNodes.forEach(n => { levels.set(n.id(), 0); queue.push(n.id()); });
    while (queue.length > 0) {
      const id = queue.shift();
      const level = levels.get(id);
      cyInstance.$id(id).incomers('edge').forEach(edge => {
        const srcId = edge.source().id();
        if (!levels.has(srcId) || levels.get(srcId) < level + 1) {
          levels.set(srcId, level + 1);
          queue.push(srcId);
        }
      });
    }
    const maxLevel = Math.max(...levels.values(), 0);
    const containerH = cyInstance.container()?.clientHeight || 400;
    const step = containerH / (maxLevel + 2);
    cyInstance.nodes().forEach(n => {
      const level = levels.get(n.id()) ?? maxLevel + 1;
      n.position({ x: n.position('x'), y: (maxLevel - level) * step + step });
    });
    cyInstance.fit(undefined, 20);
  } else {
    cyInstance.layout({ name: algo, animate: false, fit: true, padding: 20 }).run();
  }
};
```

Call `runPreviewLayout(cy)` instead of the current `cy.layout(...).run()` call.

### Tests to write (TDD — write first)

1. Unit test: `approval entry stores pathTrackingEnabled`:
   ```js
   // In E2E: call panel.approve() via page.evaluate, check entry has pathTrackingEnabled field
   ```
2. E2E: open approval preview for a panel with path-tracking-enabled snapshot → edges should have `.path-tracked` or `.path-excluded` class applied.
3. E2E: level-by-level layout in preview — check that nodes have varying y positions (not all on same row).

---

## Next Version Features

1. **Graph search/filter** — find node by label substring; highlight matching nodes in Cytoscape

2. **Export to SVG/PNG** — via Cytoscape's `cy.png()` / `cy.svg()` export API; already supported by Cytoscape

3. **Session export/import as full JSON** — currently possible but not prominently exposed in UI; add dedicated Export Session / Import Session buttons

4. **Keyboard shortcuts help dialog** — the `?` button exists; wire it to show a readable list of all shortcuts

5. **Better mobile UX** — current layout breaks below ~768px; responsive CSS breakpoints needed

6. **Undo/redo for edge property changes** — history currently tracks graph mutations (add/remove node/edge) but not property edits; `updateNodeProps`/`updateEdgeProps` calls should also push to history

7. **`isNodeFullyExcluded` performance** — called per node on every tracking visual update; could be memoized per `exclusions` snapshot

8. **Merge conflict UI** — when a merge produces changes (case 2), highlight conflicting nodes/edges more clearly; current diff colors are good but a summary count would help

---

## Technical Debt

- `SPEC.md` at repo root was stale — moved to `.claude/SPEC.md` (done)
- `CLAUDE.md` was implementation notes dump — rewritten as lean working guide (done)
- No automated tests — Vitest + Playwright added (done)
