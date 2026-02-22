import { test, expect } from './fixtures';

test.describe('AI Fix Flow (US2)', () => {
  async function connectAndAnalyze(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.click('button[aria-label="Connect to selected instance"]');
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();
    await page.getByRole('button', { name: /Run Analysis/i }).click();
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });
  }

  test('should show AI Fix All button on rule group header with unfixed findings', async ({ page }) => {
    await connectAndAnalyze(page);

    // The rule group header should have AI Fix All button
    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await expect(groupHeader.getByRole('button', { name: /AI Fix All/ })).toBeVisible();
  });

  test('should not show AI Fix All button when all findings are fixed', async ({ page }) => {
    await connectAndAnalyze(page);

    // The fixed finding compact row should show "Fixed" status and Inspect button
    const fixedRow = page.locator('[role="row"]', { hasText: "'Sales'[ProductKey]" });
    await expect(fixedRow.getByText('Fixed')).toBeVisible();
    await expect(fixedRow.getByRole('button', { name: /Inspect/ })).toBeVisible();
    // Individual rows should NOT have an AI Fix button
    await expect(fixedRow.getByRole('button', { name: /AI Fix/ })).not.toBeVisible();
  });

  test('should trigger bulk fix when AI Fix All is clicked', async ({ page }) => {
    await connectAndAnalyze(page);

    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    const fixAllButton = groupHeader.getByRole('button', { name: /AI Fix All/ });

    // Click the bulk fix button
    await fixAllButton.click();

    // Should show fixing state
    await expect(groupHeader.getByText(/Fixing/)).toBeVisible();
  });

  test('should open session inspector for fixed findings', async ({ page }) => {
    await connectAndAnalyze(page);

    // Click Inspect on the fixed finding compact row
    const fixedRow = page.locator('[role="row"]', { hasText: "'Sales'[ProductKey]" });
    await fixedRow.getByRole('button', { name: /Inspect/ }).click();

    // Session inspector should appear with steps
    await expect(page.getByText('Analyzing the inactive relationship')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Successfully removed the inactive relationship')).toBeVisible();
  });

  test('should close session inspector', async ({ page }) => {
    await connectAndAnalyze(page);

    // Open inspector
    const fixedRow = page.locator('[role="row"]', { hasText: "'Sales'[ProductKey]" });
    await fixedRow.getByRole('button', { name: /Inspect/ }).click();
    await expect(page.getByText('Analyzing the inactive relationship')).toBeVisible({ timeout: 3000 });

    // Close it
    await page.getByRole('button', { name: /Close/i }).click();

    // Inspector should be gone
    await expect(page.getByText('Analyzing the inactive relationship')).not.toBeVisible();
  });
});
