import { test, expect } from '@playwright/test';

test('debug page content', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  const content = await page.content();
  console.log('--- PAGE CONTENT ---');
  console.log(content);
  console.log('--- END PAGE CONTENT ---');
});
