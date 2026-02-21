import { test as base, type Page, type Route } from '@playwright/test';
import { mockResponses } from './mocks/responses';

type MockRouteHandler = (route: Route) => Promise<void> | void;

interface MockOptions {
  mockApi?: boolean;
}

export const test = base.extend<MockOptions>({
  mockApi: [true, { option: true }],
  page: async ({ page, mockApi }, use) => {
    if (mockApi) {
      await setupMockRoutes(page);
    }
    await use(page);
  },
});

export { expect } from '@playwright/test';

async function setupMockRoutes(page: Page): Promise<void> {
  const handlers: Array<{ pattern: string | RegExp; handler: MockRouteHandler }> = [
    {
      pattern: '**/api/connection/instances',
      handler: (route) => route.fulfill({ json: mockResponses.instances }),
    },
    {
      pattern: '**/api/connection/connect',
      handler: (route) => route.fulfill({ json: mockResponses.connectionStatus }),
    },
    {
      pattern: '**/api/connection/status',
      handler: (route) => route.fulfill({ json: mockResponses.connectionStatus }),
    },
    {
      pattern: '**/api/connection/health',
      handler: (route) => route.fulfill({ json: { healthy: true } }),
    },
    {
      pattern: '**/api/connection/disconnect',
      handler: (route) => route.fulfill({ json: { success: true } }),
    },
    {
      pattern: '**/api/analysis/run',
      handler: (route) => route.fulfill({ json: mockResponses.analysisRunStarted }),
    },
    {
      pattern: /\/api\/analysis\/runs\/[^/]+\/findings/,
      handler: (route) => route.fulfill({ json: mockResponses.findingsList }),
    },
    {
      pattern: /\/api\/analysis\/runs\/[^/]+\/compare\//,
      handler: (route) => route.fulfill({ json: mockResponses.runComparison }),
    },
    {
      pattern: /\/api\/analysis\/runs\/[^/]+$/,
      handler: (route) => route.fulfill({ json: mockResponses.analysisRunCompleted }),
    },
    {
      pattern: '**/api/analysis/runs',
      handler: (route) => route.fulfill({ json: mockResponses.analysisRuns }),
    },
    {
      pattern: /\/api\/findings\/[^/]+\/fix\/session/,
      handler: (route) => route.fulfill({ json: mockResponses.fixSessionDetail }),
    },
    {
      pattern: /\/api\/findings\/[^/]+\/fix\/stream/,
      handler: (route) =>
        route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
          body: mockResponses.fixStreamBody,
        }),
    },
    {
      pattern: /\/api\/findings\/[^/]+\/fix$/,
      handler: (route) => route.fulfill({ json: mockResponses.fixSession }),
    },
    {
      pattern: '**/api/rules',
      handler: (route) => route.fulfill({ json: mockResponses.rules }),
    },
    {
      pattern: '**/api/dax/execute',
      handler: (route) => route.fulfill({ json: mockResponses.daxResult }),
    },
    {
      pattern: '**/api/dax/generate',
      handler: (route) => route.fulfill({ json: mockResponses.daxGenerate }),
    },
    {
      pattern: '**/api/dax/history*',
      handler: (route) => route.fulfill({ json: mockResponses.daxHistory }),
    },
    {
      pattern: /\/api\/dax\/[^/]+\/cancel/,
      handler: (route) => route.fulfill({ json: { success: true } }),
    },
  ];

  for (const { pattern, handler } of handlers) {
    await page.route(pattern, handler);
  }
}
