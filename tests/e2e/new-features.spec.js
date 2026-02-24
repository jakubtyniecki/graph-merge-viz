import { test, expect } from '@playwright/test';

test.describe('Consolidated Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('gear button opens unified dialog with name and colors', async ({ page }) => {
    // Click gear button in the first panel
    await page.locator('button[data-action="panel-options"]').first().click();
    
    // Check for dialog and title
    await expect(page.locator('dialog[open]')).toBeVisible();
    const h3 = page.locator('dialog h3');
    await expect(h3).toBeVisible();
    await expect(h3).toContainText('Panel Options');
    
    // Check for Name input (note the ID is #dlg-name in dialogs.js)
    await expect(page.locator('input#dlg-name')).toBeVisible();
  });

  test('name overlay is display-only', async ({ page }) => {
    const overlay = page.locator('.panel-name-overlay').first();
    await expect(overlay).toBeVisible();
    const cursor = await overlay.evaluate(el => window.getComputedStyle(el).cursor);
    expect(cursor).not.toBe('pointer');
  });
});

test.describe('Test Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('toggle in footer works', async ({ page }) => {
    const checkbox = page.locator('#test-mode-toggle');
    await expect(page.locator('footer#status-bar')).toBeVisible();
    
    await checkbox.check();
    
    const dropdown = page.locator('#test-scenario-select');
    await expect(dropdown).toBeVisible();
    await expect(dropdown).toBeEnabled();
  });
});
