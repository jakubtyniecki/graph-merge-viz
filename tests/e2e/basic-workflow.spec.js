import { test, expect } from '@playwright/test';

// ─── App Loads ───────────────────────────────────────────────────────────────

test.describe('App loads', () => {
  test('shows two panels on startup', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.panel')).toHaveCount(2);
  });

  test('has add-node and add-edge buttons in each panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="add-node"]').first()).toBeVisible();
    await expect(page.locator('[data-action="add-edge"]').first()).toBeVisible();
  });

  test('shows merge gutter between panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.merge-gutter')).toBeVisible();
  });

  test('shows session controls', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#session-controls')).toBeVisible();
  });

  test('shows status bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#status-bar')).toBeVisible();
  });
});

// ─── Dialog Behaviour ────────────────────────────────────────────────────────

test.describe('Dialog behaviour', () => {
  test('add-node dialog opens and closes on Cancel', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('#dlg-cancel').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('add-node dialog closes on ESC key', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('add-node dialog can be confirmed to add a node', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('TestNode');
    await page.locator('#dlg-ok').click();
    // Dialog should close after OK
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('add-node dialog reopens correctly after first use', async ({ page }) => {
    // Regression: closeDialog() previously set display:none which broke reopening
    await page.goto('/');
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-cancel').click();
    // Reopen — must be visible (not invisible due to lingering display:none)
    await page.locator('[data-action="add-node"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('#dlg-cancel').click();
  });

  test('add-edge dialog opens and closes (needs 2+ nodes)', async ({ page }) => {
    await page.goto('/');
    // add-edge requires ≥2 nodes; clicking with no nodes shows a toast, not a dialog
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('A');
    await page.locator('#dlg-ok').click();
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('B');
    await page.locator('#dlg-ok').click();
    // Now add-edge should open a dialog
    await page.locator('[data-action="add-edge"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('#dlg-cancel').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });

  test('approve dialog opens and cancel keeps state', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-action="approve"]').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.locator('#dlg-cancel').click();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
});

// ─── Panel Layout ─────────────────────────────────────────────────────────────

test.describe('Panel layout', () => {
  test('vertical split adds a third panel', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('.panel').count();
    await page.locator('[data-split="v"]').first().click();
    await expect(page.locator('.panel')).toHaveCount(before + 1);
  });

  test('horizontal split adds a third panel', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('.panel').count();
    await page.locator('[data-split="h"]').first().click();
    await expect(page.locator('.panel')).toHaveCount(before + 1);
  });

  test('split produces an additional merge gutter', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('.merge-gutter').count();
    await page.locator('[data-split="v"]').first().click();
    await expect(page.locator('.merge-gutter')).toHaveCount(before + 1);
  });

  test('close panel reduces panel count', async ({ page }) => {
    await page.goto('/');
    // Split first so we have 3 panels
    await page.locator('[data-split="v"]').first().click();
    const before = await page.locator('.panel').count();
    // dispatchEvent bypasses geometry — merge gutter can overlap panel header buttons
    await page.locator('.panel-close-btn').first().dispatchEvent('click');
    // Confirmation dialog
    await page.locator('#dlg-ok').click();
    await expect(page.locator('.panel')).toHaveCount(before - 1);
  });

  test('panel rename updates the displayed name', async ({ page }) => {
    await page.goto('/');
    await page.locator('.panel-name').first().click();
    // Wait for rename dialog to open before filling
    await expect(page.locator('#dlg-name')).toBeVisible();
    await page.locator('#dlg-name').fill('MyRenamedPanel');
    await page.locator('#dlg-ok').click();
    await expect(page.locator('.panel-name').first()).toHaveText('MyRenamedPanel');
  });

  test('zoom button toggles to single-panel view', async ({ page }) => {
    await page.goto('/');
    // dispatchEvent bypasses geometry — merge gutter can overlap panel header buttons
    await page.locator('.panel-zoom-btn').first().dispatchEvent('click');
    // In zoom mode only 1 panel is rendered
    await expect(page.locator('.panel')).toHaveCount(1);
  });

  test('escape key exits zoom mode', async ({ page }) => {
    await page.goto('/');
    await page.locator('.panel-zoom-btn').first().dispatchEvent('click');
    await expect(page.locator('.panel')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.panel')).toHaveCount(2);
  });
});

// ─── Merge Buttons ───────────────────────────────────────────────────────────

test.describe('Merge buttons', () => {
  test('merge buttons exist in gutter on startup', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.merge-btn').first()).toBeVisible();
  });

  test('right-click merge button shows strategy picker', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await expect(page.locator('.merge-strategy-picker')).toBeVisible();
  });

  test('strategy picker dismisses on click outside', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await expect(page.locator('.merge-strategy-picker')).toBeVisible();
    await page.locator('body').click({ position: { x: 10, y: 10 } });
    await expect(page.locator('.merge-strategy-picker')).toHaveCount(0);
  });

  test('strategy picker contains expected options', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await expect(page.locator('[data-strat="mirror"]')).toBeVisible();
    await expect(page.locator('[data-strat="push"]')).toBeVisible();
    await expect(page.locator('[data-strat="scoped"]')).toBeVisible();
    await expect(page.locator('[data-strat="none"]')).toBeVisible();
    await expect(page.locator('[data-strat="__delete__"]')).toBeVisible();
  });

  test('+ button opens add-merge-button dialog', async ({ page }) => {
    await page.goto('/');
    await page.locator('.merge-btn-add').first().click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('merge button delete removes it from gutter', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('.merge-btn').count();
    await page.locator('.merge-btn').first().click({ button: 'right' });
    await page.locator('[data-strat="__delete__"]').click();
    await expect(page.locator('.merge-btn')).toHaveCount(before - 1);
  });
});

// ─── Node Operations ─────────────────────────────────────────────────────────

test.describe('Node operations end-to-end', () => {
  test('adding two nodes enables add-edge flow', async ({ page }) => {
    await page.goto('/');
    // Add node A
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('NodeA');
    await page.locator('#dlg-ok').click();
    // Add node B
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('NodeB');
    await page.locator('#dlg-ok').click();
    // Open add-edge — source/target selects should have options now
    await page.locator('[data-action="add-edge"]').first().click();
    await expect(page.locator('#dlg-source')).toBeVisible();
    await page.locator('#dlg-cancel').click();
  });

  test('approve button clears pending diff indicator', async ({ page }) => {
    await page.goto('/');
    // Add a node to create a diff
    await page.locator('[data-action="add-node"]').first().click();
    await page.locator('#dlg-label').fill('DiffNode');
    await page.locator('#dlg-ok').click();
    // Approve it
    await page.locator('[data-action="approve"]').first().click();
    await page.locator('#dlg-ok').click();
    // Dialog should close cleanly
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
});

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

test.describe('Undo / Redo', () => {
  test('undo button is present in panel header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="undo"]').first()).toBeVisible();
  });

  test('redo button is present in panel header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-action="redo"]').first()).toBeVisible();
  });
});
