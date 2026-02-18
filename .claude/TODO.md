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
