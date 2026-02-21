import { test, expect } from './fixtures';

test.describe('DAX Query Flow (US5)', () => {
  test('should navigate to DAX Queries tab', async ({ page }) => {
    await page.goto('/');
    await page.click('text=DAX Queries');
    await expect(page).toHaveURL('/dax');
  });

  test('should show DAX editor with default query', async ({ page }) => {
    await page.goto('/dax');

    // The editor section should be visible
    const editorSection = page.locator('section[aria-label="DAX query editor"]');
    await expect(editorSection).toBeVisible();

    // Run Query button should be visible
    await expect(page.getByRole('button', { name: /Run Query/i })).toBeVisible();
  });

  test('should execute a DAX query and show results', async ({ page }) => {
    await page.goto('/dax');

    // Click Run Query
    await page.getByRole('button', { name: /Run Query/i }).click();

    // Results table should appear with columns and data
    const editorSection = page.locator('section[aria-label="DAX query editor"]');
    await expect(editorSection.getByText('Sales[OrderDate]')).toBeVisible({ timeout: 3000 });
    await expect(editorSection.getByText('Sales[Amount]')).toBeVisible();
    await expect(editorSection.getByText('3 rows')).toBeVisible();
    await expect(editorSection.getByText('42ms')).toBeVisible();
  });

  test('should generate DAX from natural language', async ({ page }) => {
    await page.goto('/dax');

    // Fill in the natural language input
    const nlInput = page.getByPlaceholder(/describe/i);
    await nlInput.fill('Show total sales by year');

    // Click Generate DAX
    await page.getByRole('button', { name: /Generate DAX/i }).click();

    // Explanation should appear
    await expect(page.getByText('summarizes total sales by year')).toBeVisible({ timeout: 3000 });
  });

  test('should show query history', async ({ page }) => {
    await page.goto('/dax');

    // History sidebar should show entries from mock
    const historySidebar = page.locator('aside[aria-label="Query history"]');
    await expect(historySidebar).toBeVisible();

    await expect(historySidebar.getByText("EVALUATE 'Sales'")).toBeVisible({ timeout: 3000 });
    await expect(historySidebar.getByText('Show total sales by year')).toBeVisible();
  });

  test('should load history item into editor when clicked', async ({ page }) => {
    await page.goto('/dax');

    // Wait for history to load
    const historySidebar = page.locator('aside[aria-label="Query history"]');
    await expect(historySidebar.getByText('Show total sales by year')).toBeVisible({ timeout: 3000 });

    // Click the history item
    await historySidebar.getByText('Show total sales by year').click();

    // The error panel should be cleared (no error visible)
    await expect(page.locator('[role="alert"]')).not.toBeVisible();
  });

  test('should show error for failed query', async ({ page }) => {
    // Override the mock to return a failed query
    await page.route('**/api/dax/execute', (route) =>
      route.fulfill({
        json: {
          id: 'dax-fail',
          query: 'INVALID DAX',
          status: 'FAILED',
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: 0,
          errorMessage: 'Syntax error in DAX expression',
        },
      }),
    );

    await page.goto('/dax');

    await page.getByRole('button', { name: /Run Query/i }).click();

    // Error message should appear
    await expect(page.getByText('Syntax error in DAX expression')).toBeVisible({ timeout: 3000 });
  });
});
