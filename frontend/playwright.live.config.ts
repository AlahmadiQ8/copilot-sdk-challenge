import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

process.env.USE_MOCK_API = 'false';

export default defineConfig({
  ...baseConfig,
});
