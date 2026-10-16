const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './scripts/smoke',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  // The github reporter turns a failing test into a public annotation, so a CI failure says which test and why.
  reporter: process.env.GITHUB_ACTIONS ? [['list'], ['github']] : [['list']],
  outputDir: 'test-results',
});
