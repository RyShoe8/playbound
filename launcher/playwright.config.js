const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './scripts/smoke',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
});
