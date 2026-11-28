import { createRequire } from 'node:module';
const require = createRequire(new URL('../../../../apps/web/package.json', import.meta.url));
const { defineConfig } = require('@playwright/test');
// No webServer, database, default web config or listening port. Practice-only route fixtures.
export default defineConfig({
  testDir: '.', testMatch: 'rt07-rendering.spec.mjs', workers: 2,
  outputDir: '/tmp/jobguard-rt07-rendering', reporter: 'list',
  use: { browserName: 'chromium', headless: true, viewport: { width: 360, height: 800 } },
});
