# Graph Merge Visualizer — Working Guide

**Repo:** https://github.com/jakubtyniecki/graph-merge-viz (private, master only)
**Platform:** Raspberry Pi 5 hobby project — keep it simple, no frameworks.

---

## Project Orientation

Educational web tool for learning graph merge algorithms. Users create graphs in panels, approve changesets, and merge graphs between panels. Think "git diff/merge for graph data structures." The app runs locally; state is in localStorage.

Stack: Vanilla JS ES modules + Cytoscape.js (rendering) + Vite (build/HMR) + Express (prod server).

---

## Architecture

**Functional core / imperative shell.** Everything in `src/graph/` is pure functions returning new objects (no mutation, no DOM). Everything in `src/ui/` handles DOM, Cytoscape, and localStorage. This separation makes graph logic fully unit-testable without a browser.

---

## Dev Commands

```bash
npm run dev          # Vite dev server on :5173 with HMR
npm run build        # Production build → dist/
npm start            # Serve dist/ on :3000 via Express
npm test             # Run Vitest unit tests
npm run test:watch   # Watch mode
npm run test:coverage  # Coverage report (must stay >70%)
npm run test:e2e     # Playwright E2E (auto-starts dev server)
```

---

## Key Conventions

- **Immutable graph ops** — all `src/graph/` functions return new graphs; never mutate inputs
- **Event delegation** — panel action buttons wired in `main.js` via `#app` listener
- **Single dialog element** — `openDialog()/closeDialog()` in `dialogs.js` share one `<dialog>` per panel
- **Panel state round-trip** — `panel.getState()` / `panel.setState()` preserve Cytoscape state across `render()`
- **Templates travel with sessions** — session has embedded template copy; global templates are separate
- **`panel-change` event** — emit this custom event whenever session state should auto-save

---

## Versioning & Releases

**Version bumping:**
- **Patch** (x.y.Z): bump on each commit in package.json
- **Minor** (x.Y.z): bump on push to origin/master, create git tag, run `npm run deploy`
- **Major** (X.y.z): for architectural changes — ask user first

**Workflow:**
```bash
# After code changes, before commit:
npm test && npm run test:e2e  # verify all tests pass

# On commit:
npm version patch             # bumps 1.2.0 → 1.2.1 in package.json + git commit
git push origin master

# On push to origin (after minor bumps):
npm version minor             # 1.2.1 → 1.3.0
git push origin master --tags # pushes master + tag
npm run deploy                # builds dist/ and pushes to gh-pages
```

**gh-pages deployment:** Pushes `dist/` contents to `gh-pages` branch so the app runs at `https://jakubtyniecki.github.io/graph-merge-viz/`. No archives or packaging — plain project files (HTML, JS, CSS from dist/).

---

## TDD Directive (mandatory)

For any change to `src/graph/**`: **write or update tests first**, then implement.

```bash
npm test                    # run before committing graph/ changes
npm run test:coverage       # verify >70% coverage maintained
```

E2E tests catch UI regressions — run `npm run test:e2e` after layout/dialog changes.

---

## Important Decisions

- **No framework** — vanilla JS has zero build complexity and loads instantly on RPi5
- **LocalStorage only** — no backend, no auth; simplicity over durability
- **Cytoscape.js** — best JS graph rendering lib; layout algorithms built-in
- **Single master branch** — no PRs, commit directly, keep history clean
- **dist/ not tracked** — gitignored; deploy from source

---

## Debugging Cheatsheet

```javascript
// Browser console:
window.__panels          // Map<id, Panel> of active panels
window.__layout          // LayoutManager instance
window.__panels.get('1').cy      // Cytoscape instance
window.__panels.get('1').graph   // Current graph data
window.__panels.get('1').baseGraph  // Last approved snapshot
```

Common issues: panels disappear on resize → check `render()` state callbacks; diffs not showing → verify `_applyDiffClasses()`; dialog invisible after reopen → ensure `closeDialog()` never sets `display:none`.

---

## Common Tasks

| Task | Where |
|------|-------|
| Add panel action button | `LayoutManager._renderPanel()` + wire in `main.js` |
| Add new dialog | `src/ui/dialogs.js` using `openDialog(panelEl)` pattern |
| Modify merge button layout | `LayoutManager._renderMergeGutter()` |
| Add session auto-save trigger | Dispatch `panel-change` CustomEvent |
| Change default panel layout | `LayoutManager.init()` |
| Add graph constraint | `src/graph/constraints.js` + call from `panel.addEdge()` |

---

## Files to Know

```
src/main.js              # Entry: wires all events, initializes layout + session
src/ui/layout.js         # LayoutManager: split tree, panel render, merge gutters
src/ui/panel.js          # Panel class: Cytoscape wrapper, merge/approve/history
src/ui/dialogs.js        # All modal dialogs (openDialog/closeDialog pattern)
src/ui/session.js        # LocalStorage: save/load/switch sessions
src/graph/model.js       # createGraph/addNode/addEdge/removeNode... (pure)
src/graph/merge.js       # mergeGraphs(target, incoming, base?) (pure)
src/graph/diff.js        # computeDiff(base, current) → DiffEntry[] (pure)
src/graph/template.js    # GRAPH_TYPES, createTemplate, type CRUD (pure)
src/graph/constraints.js # validateEdgeAdd, hasCycle, isConnected (pure)
src/graph/path-tracking.js # computePathTags, propagateExclusions (pure)
src/style.css            # Dark theme; panel/gutter/dialog/diff/tracking CSS
tests/unit/graph/        # Vitest unit tests (one file per graph/ module)
tests/e2e/               # Playwright E2E tests
docs/plans/              # Implementation plans (historical record)
.claude/SPEC.md          # Full feature specification
.claude/TODO.md          # Bugs + backlog
```

---

*See `.claude/SPEC.md` for full feature specification and data models.*
