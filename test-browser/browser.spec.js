// @ts-check
import { test, expect } from '@playwright/test';

test('schema library works in browser', async ({ page }) => {
  const consoleMessages = [];
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/test-browser/index.html');

  // Wait for tests to complete (up to 30s)
  const results = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (window.__TEST_RESULTS__) {
          resolve(window.__TEST_RESULTS__);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
      setTimeout(() => {
        const output = document.getElementById('output')?.textContent || '(empty)';
        reject(new Error(`Browser tests timed out. Output: ${output}`));
      }, 30000);
    });
  }).catch(async (err) => {
    console.error('Console messages:', consoleMessages.join('\n'));
    console.error('Page errors:', errors.join('\n'));
    console.error('Failed requests:', failedRequests.join('\n'));
    throw err;
  });

  // Log individual results
  for (const r of results.results) {
    if (!r.passed) {
      console.error(`FAIL: ${r.name} - ${r.error}`);
    }
  }

  if (results.fatalError) {
    throw new Error(`Fatal browser error: ${results.fatalError}`);
  }

  expect(results.failed, `${results.failed} browser tests failed`).toBe(0);
  expect(results.passed).toBeGreaterThan(0);
});
