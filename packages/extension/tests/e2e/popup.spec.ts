import { test, expect } from '@playwright/test';

// We test the built popup (file://.../dist/popup.html)
// The Playwright config sets baseURL to that file path.

test.beforeEach(async ({ page }) => {
  // Stub minimal chrome.storage API used by popup.ts
  await page.addInitScript(() => {
    const g: any = window as any;
    g.__TEST_STORAGE__ = g.__TEST_STORAGE__ || {};
    // Ensure window.chrome exists
    if (!g.chrome) g.chrome = {};
    if (!g.chrome.storage) g.chrome.storage = {};
    // Define/override storage.sync with robust getters
    const sync = {
      get: (_keys: any, cb: (items: Record<string, unknown>) => void) => {
        const data = g.__TEST_STORAGE__ || {};
        cb({ nostrRelays: data.nostrRelays });
      },
      set: (items: Record<string, unknown>, cb: () => void) => {
        const data = g.__TEST_STORAGE__ || {};
        Object.assign(data, items);
        g.__TEST_STORAGE__ = data;
        if (cb) cb();
      },
    };
    Object.defineProperty(g.chrome, 'storage', {
      configurable: true,
      enumerable: true,
      value: {
        get sync() { return sync; }
      }
    });
  });
});

test('popup saves and resets relays', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  // Wait for popup readiness flag and form
  await page.waitForFunction(() => (window as any).__POPUP_READY__ === true);
  await page.waitForSelector('#relayForm');
  const textarea = page.locator('#relayList');
  const status = page.locator('#status');
  const saveBtn = page.locator('#saveBtn');
  const resetBtn = page.locator('#resetBtn');

  // Initially loads (from DEFAULT_RELAYS or empty stub)
  await expect(textarea).toBeVisible();

  // Reset to defaults first (simpler path)
  await resetBtn.click();
  // Verify storage updated
  const storedAfterReset = await page.evaluate(() => (window as any).__TEST_STORAGE__?.nostrRelays as string[] | undefined);
  expect(Array.isArray(storedAfterReset) && storedAfterReset!.length > 0).toBe(true);
  const afterReset = await textarea.inputValue();
  expect(afterReset.trim().length).toBeGreaterThan(0);

  // Now try saving valid relays and just assert status becomes non-empty
  await textarea.fill('wss://relay.example.com\nws://local.test:1234/');
  await saveBtn.click();
  await page.$eval('#relayForm', (form) => {
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  // Verify storage updated on save
  const storedAfterSave = await page.evaluate(() => (window as any).__TEST_STORAGE__?.nostrRelays as string[] | undefined);
  expect(Array.isArray(storedAfterSave)).toBe(true);
  expect(storedAfterSave).toEqual(['wss://relay.example.com', 'ws://local.test:1234']);

  // Reset to defaults
  await resetBtn.click();
  await expect(status).toHaveText(/Restored default relays\./);

  // Ensure textarea has some content after reset
  const value = await textarea.inputValue();
  expect(value.trim().length).toBeGreaterThan(0);
});
