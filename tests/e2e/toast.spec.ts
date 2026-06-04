import { expect, test } from '@playwright/test';

test('toast appears top-right on desktop and dismisses after 2s', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('app-shell')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { lfs: { toast: (t: string, m: string) => void } }).lfs.toast(
      'success',
      'Connected to Server',
    );
  });

  const container = page.locator('.toast-container');
  await expect(container).toBeVisible();
  const toast = page.locator('toast-notification');
  await expect(toast).toBeVisible();
  await expect(toast).toHaveAttribute('role', 'status');
  await expect(toast).toContainText('Connected to Server');

  const viewport = page.viewportSize();
  expect(viewport?.width ?? 1280).toBeGreaterThan(768);
  const box = await container.boundingBox();
  expect(box).not.toBeNull();
  if (box && viewport) {
    expect(box.x + box.width).toBeGreaterThan(viewport.width / 2);
  }

  await expect(toast).toBeHidden({ timeout: 3500 });
});

test('toast appears as full-width strip on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/');
  await expect(page.locator('app-shell')).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { lfs: { toast: (t: string, m: string) => void } }).lfs.toast(
      'info',
      'Mobile Toast',
    );
  });

  const container = page.locator('.toast-container');
  await expect(container).toBeVisible();
  const box = await container.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    expect(box.width).toBeGreaterThanOrEqual(360 - 1);
    expect(box.x).toBeLessThanOrEqual(1);
  }
});
