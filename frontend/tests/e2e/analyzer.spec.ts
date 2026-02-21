import { test, expect } from './fixtures';

test.describe('Connect & Analyze Flow (US1)', () => {
  test('should show instances in dropdown and connect', async ({ page }) => {
    await page.goto('/');

    // The connection panel should be visible
    const panel = page.locator('section[aria-label="Connection management"]');
    await expect(panel).toBeVisible();

    // Instance dropdown should show options
    const select = page.locator('#instance-select');
    await expect(select).toBeVisible();
    const options = select.locator('option');
    await expect(options).toHaveCount(2);

    // Click connect
    await page.click('button[aria-label="Connect to selected instance"]');

    // Should now show "Connected to AdventureWorks"
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();
  });

  test('should run analysis and display findings', async ({ page }) => {
    await page.goto('/');

    // Connect first
    await page.click('button[aria-label="Connect to selected instance"]');
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();

    // Run Analysis button should appear
    const runButton = page.getByRole('button', { name: /Run Analysis/i });
    await expect(runButton).toBeVisible();
    await runButton.click();

    // Should show findings after analysis completes (mock returns immediately)
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Set SummarizeBy to None')).toBeVisible();
    await expect(page.getByText('Hide foreign keys')).toBeVisible();
  });

  test('should display summary counts', async ({ page }) => {
    await page.goto('/');

    // Connect and run analysis
    await page.click('button[aria-label="Connect to selected instance"]');
    await page.getByRole('button', { name: /Run Analysis/i }).click();

    // Wait for findings to load
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });

    // Summary bar should show counts
    const summaryRegion = page.locator('[aria-label="Analysis summary"]');
    await expect(summaryRegion).toBeVisible();
    await expect(summaryRegion.getByText('1').first()).toBeVisible(); // Errors
  });

  test('should filter findings by severity', async ({ page }) => {
    await page.goto('/');

    // Connect and run analysis
    await page.click('button[aria-label="Connect to selected instance"]');
    await page.getByRole('button', { name: /Run Analysis/i }).click();
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });

    // Use severity filter
    const severityFilter = page.locator('[aria-label="Filter by severity"]');
    await expect(severityFilter).toBeVisible();
    await severityFilter.selectOption('3'); // Error only

    // Findings list should re-fetch (mock returns same data, but we verify the filter UI works)
    await expect(severityFilter).toHaveValue('3');
  });

  test('should show finding details with severity badge', async ({ page }) => {
    await page.goto('/');

    // Connect and run analysis
    await page.click('button[aria-label="Connect to selected instance"]');
    await page.getByRole('button', { name: /Run Analysis/i }).click();
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });

    // Check finding card structure
    const errorFinding = page.locator('article', { hasText: 'Avoid inactive relationships' });
    await expect(errorFinding.getByText('Error')).toBeVisible();
    await expect(errorFinding.getByText('Error Prevention')).toBeVisible();
    await expect(errorFinding.getByText('AI Fix')).toBeVisible();
  });

  test('should navigate between tabs', async ({ page }) => {
    await page.goto('/');

    // Analyzer tab active by default
    await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible();

    // Navigate to DAX Queries tab
    await page.click('text=DAX Queries');
    await expect(page).toHaveURL('/dax');

    // Navigate back to Analyzer
    await page.click('text=Analyzer');
    await expect(page).toHaveURL('/');
  });

  test('should disconnect from model', async ({ page }) => {
    await page.goto('/');

    // Connect
    await page.click('button[aria-label="Connect to selected instance"]');
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();

    // Mock disconnect response returns { connected: false }
    await page.route('**/api/connection/status', (route) =>
      route.fulfill({ json: { connected: false } }),
    );

    // Disconnect
    await page.click('button[aria-label="Disconnect from model"]');

    // Should show disconnected state
    await expect(page.getByText('Not Connected')).toBeVisible();
  });
});
