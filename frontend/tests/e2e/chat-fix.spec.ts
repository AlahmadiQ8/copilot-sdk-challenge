import { test, expect } from './fixtures';
import { mockResponses } from './mocks/responses';

test.describe('Chat Fix Panel (Tool Call Spinner)', () => {
  async function connectAndAnalyze(page: import('@playwright/test').Page) {
    await page.goto('/');
    await page.click('button[aria-label="Connect to selected instance"]');
    await expect(page.getByText('Connected to AdventureWorks')).toBeVisible();
    await page.getByRole('button', { name: /Run Analysis/i }).click();
    await expect(page.getByText('Avoid inactive relationships')).toBeVisible({ timeout: 5000 });
  }

  test('should show Fix with Copilot button for non-autofix rule groups', async ({ page }) => {
    await connectAndAnalyze(page);

    // AVOID_INACTIVE_RELATIONSHIPS has hasAutoFix: false, so "Fix with Copilot" should appear
    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await expect(groupHeader.getByRole('button', { name: /Fix with Copilot/ })).toBeVisible();
  });

  test('should open ChatFixPanel when Fix with Copilot is clicked', async ({ page }) => {
    await connectAndAnalyze(page);

    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await groupHeader.getByRole('button', { name: /Fix with Copilot/ }).click();

    // Chat panel should open
    await expect(page.getByRole('dialog', { name: 'Fix with Copilot' })).toBeVisible({ timeout: 5000 });
  });

  test('should stop showing spinner on tool_executing after tool_result arrives', async ({ page }) => {
    await connectAndAnalyze(page);

    // Open chat fix panel
    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await groupHeader.getByRole('button', { name: /Fix with Copilot/ }).click();

    // Wait for the chat panel to appear
    await expect(page.getByRole('dialog', { name: 'Fix with Copilot' })).toBeVisible({ timeout: 5000 });

    // Wait for the tool result card to appear (✓ Result)
    const toolResultCard = page.locator('text=✓').first();
    await expect(toolResultCard).toBeVisible({ timeout: 10000 });

    // After tool_result arrives, the preceding tool_executing card should NOT have a spinner
    // The spinner is an element with animate-spin class inside a tool_executing card
    const toolExecutingCards = page.locator('[role="log"] >> div:has-text("🔧")');
    const spinners = toolExecutingCards.locator('.animate-spin');
    
    // There should be NO active spinners on tool_executing cards after results arrive
    await expect(spinners).toHaveCount(0);
  });

  test('should show completed assistant message after tool calls finish', async ({ page }) => {
    await connectAndAnalyze(page);

    // Open chat fix panel
    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await groupHeader.getByRole('button', { name: /Fix with Copilot/ }).click();

    // Wait for the chat panel
    await expect(page.getByRole('dialog', { name: 'Fix with Copilot' })).toBeVisible({ timeout: 5000 });

    // After all SSE events (including session_idle), the final assistant message should show
    await expect(page.getByText('I analyzed the model and found the inactive relationship to remove.')).toBeVisible({ timeout: 10000 });

    // Input should be enabled (not processing) after session_idle
    const input = page.locator('textarea[placeholder="Send a message…"]');
    await expect(input).toBeEnabled({ timeout: 5000 });
  });

  test('should show restored messages for resumed sessions', async ({ page }) => {
    await connectAndAnalyze(page);

    // Override the chat-fix session endpoint to return a resumed session with messages
    await page.route('**/api/chat-fix/sessions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ json: mockResponses.chatFixResumedSession });
      }
      return route.fulfill({ json: [] });
    });

    // Also mock a SSE that just sends session_idle (session is already complete)
    await page.route(/\/api\/chat-fix\/sessions\/[^/]+\/stream/, (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: `data: ${JSON.stringify({ type: 'session_idle' })}\n\n`,
      }),
    );

    // Open chat fix panel
    const groupHeader = page.locator('[role="listitem"]', { hasText: 'Avoid inactive relationships' });
    await groupHeader.getByRole('button', { name: /Fix with Copilot/ }).click();

    // Chat panel should open with "Resumed session" badge
    await expect(page.getByRole('dialog', { name: 'Fix with Copilot' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Resumed session')).toBeVisible();

    // The restored assistant message should be visible
    await expect(page.getByText('I found an inactive relationship between Sales[OrderDate] and Calendar[Date].')).toBeVisible({ timeout: 5000 });

    // Input should be enabled after session_idle
    const input = page.locator('textarea[placeholder="Send a message…"]');
    await expect(input).toBeEnabled({ timeout: 5000 });
  });
});
