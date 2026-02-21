import { test, expect } from './fixtures';

test.describe('AI Fix Flow (US2)', () => {
  async function connectAndAnalyze(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.click('button[aria-label="Connect to selected instance"]');
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();
    await page.getByRole('button', { name: /Run Analysis/i }).click();
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });
  }

  test('should show AI Fix button on unfixed findings with autofix', async ({ page }) => {
    await connectAndAnalyze(page);

    // The error finding should have AI Fix button
    const errorFinding = page.locator('article', { hasText: 'Avoid inactive relationships' });
    await expect(errorFinding.getByRole('button', { name: /AI Fix/ })).toBeVisible();

    // The warning finding should also have AI Fix button
    const warningFinding = page.locator('article', { hasText: 'Set SummarizeBy to None' });
    await expect(warningFinding.getByRole('button', { name: /AI Fix/ })).toBeVisible();
  });

  test('should not show AI Fix button on already fixed findings', async ({ page }) => {
    await connectAndAnalyze(page);

    // The info finding (already fixed) should show "Fixed" status and Inspect button instead
    const fixedFinding = page.locator('article', { hasText: 'Hide foreign keys' });
    await expect(fixedFinding.getByText('Fixed')).toBeVisible();
    await expect(fixedFinding.getByRole('button', { name: /Inspect/ })).toBeVisible();
    // Should NOT have an AI Fix button
    await expect(fixedFinding.getByRole('button', { name: /AI Fix/ })).not.toBeVisible();
  });

  test('should trigger fix when AI Fix is clicked', async ({ page }) => {
    await connectAndAnalyze(page);

    const errorFinding = page.locator('article', { hasText: 'Avoid inactive relationships' });
    const fixButton = errorFinding.getByRole('button', { name: /AI Fix/ });

    // Click the fix button
    await fixButton.click();

    // Button should show "Fixing…" state
    await expect(errorFinding.getByText('Fixing…')).toBeVisible();
  });

  test('should open session inspector for fixed findings', async ({ page }) => {
    await connectAndAnalyze(page);

    // Click Inspect on the fixed finding
    const fixedFinding = page.locator('article', { hasText: 'Hide foreign keys' });
    await fixedFinding.getByRole('button', { name: /Inspect/ }).click();

    // Session inspector should appear with steps
    await expect(page.getByText('Analyzing the inactive relationship')).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Successfully removed the inactive relationship')).toBeVisible();
  });

  test('should close session inspector', async ({ page }) => {
    await connectAndAnalyze(page);

    // Open inspector
    const fixedFinding = page.locator('article', { hasText: 'Hide foreign keys' });
    await fixedFinding.getByRole('button', { name: /Inspect/ }).click();
    await expect(page.getByText('Analyzing the inactive relationship')).toBeVisible({ timeout: 3000 });

    // Close it
    await page.getByRole('button', { name: /Close/i }).click();

    // Inspector should be gone
    await expect(page.getByText('Analyzing the inactive relationship')).not.toBeVisible();
  });
});
