import { expect, test } from '@playwright/test';

test('skeleton page loads and shows coming-soon copy', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Local File Share');
  await expect(page.locator('app-shell')).toBeVisible();
  await expect(page.getByText('coming soon')).toBeVisible();
});
