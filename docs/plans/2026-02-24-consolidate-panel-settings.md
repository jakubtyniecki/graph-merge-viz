# Consolidate Panel Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge panel name and color settings into the main panel options (gear button) dialog for a cleaner UI.

**Architecture:** Expand `panelOptionsDialog` in `src/ui/dialogs.js` to handle both panel-specific settings (algorithm, tracking) and layout-specific settings (name, colors). The `LayoutManager` provides the layout node, and a callback handles persisting the layout changes and re-rendering.

**Tech Stack:** JavaScript (ES6), DOM API

---

### Task 1: Update LayoutManager and Clean up layout.js

**Files:**
- Modify: `src/ui/layout.js`

**Step 1: Add getLayoutNode and remove panelSettingsDialog usage**
- Add `getLayoutNode(panelId)` public method.
- Remove `panelSettingsDialog` from imports.
- Remove `onclick` and `title` from `nameOverlay`.

**Step 2: Commit**
```bash
git add src/ui/layout.js
git commit -m "refactor: add getLayoutNode and remove name overlay click in layout.js"
```

### Task 2: Expand panelOptionsDialog and Remove panelSettingsDialog

**Files:**
- Modify: `src/ui/dialogs.js`

**Step 1: Update panelOptionsDialog signature and template**
- Change signature to `panelOptionsDialog(panel, layoutNode, onLayoutChange)`.
- Add Name input field.
- Add Border and Background color palettes (reusing `colorPaletteHtml`).

**Step 2: Implement Apply logic in panelOptionsDialog**
- In `dlg.querySelector('#dlg-ok').onclick`:
    - Get name, selected border, and selected background.
    - Call `onLayoutChange({ name, borderColor, bgColor })`.

**Step 3: Delete panelSettingsDialog**
- Remove the `panelSettingsDialog` function entirely.

**Step 4: Commit**
```bash
git add src/ui/dialogs.js
git commit -m "feat: consolidate panel settings into panelOptionsDialog"
```

### Task 3: Update main.js to use the new panelOptionsDialog

**Files:**
- Modify: `src/main.js`

**Step 1: Update panel-options action**
- Retrieve `layoutNode` using `layout.getLayoutNode(panel.id)`.
- Call `panelOptionsDialog` with the new arguments.
- Handle `onLayoutChange` by updating `layoutNode` and triggering re-render.

**Step 2: Commit**
```bash
git add src/main.js
git commit -m "feat: connect panel options dialog with layout manager in main.js"
```

### Task 4: Verification

- Verify that clicking the gear button now shows Name, Border Color, and Background Color.
- Verify that changing these values and clicking Apply updates the panel.
- Verify that clicking the panel name no longer triggers a dialog.
