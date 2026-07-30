import { expect, test } from '@playwright/test';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';

const [defaultCase] = enrichTrainingCases(trainingCases);

async function openCustomer360(page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await page.locator('.sky-case-card', { hasText: defaultCase.id }).click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await page.getByRole('button', { name: /Identity & Customer/i }).click();
  await page.getByRole('button', { name: /Customer 360 Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Customer 360' })).toBeVisible();
}

async function runExactCustomerSearch(page) {
  await page.getByLabel('Complete Training ID').fill(defaultCase.trainingId);
  await page.getByRole('button', { name: 'Run exact search' }).click();
  await expect(page.locator('.sky-customer-reference-dashboard')).toBeVisible();
}

test('Customer 360 is a gated Sky structure with working source routes and pins', async ({ page }) => {
  await openCustomer360(page);

  await expect(page.locator('.sky-customer-reference-dashboard')).toHaveCount(0);
  await expect(page.getByText(/Record details stay hidden until a match is returned/i)).toBeVisible();

  await page.getByLabel('Complete Training ID').fill(defaultCase.trainingId.slice(0, -2));
  await page.getByRole('button', { name: 'Run exact search' }).click();
  await expect(page.getByText(/No exact record matched/i)).toBeVisible();
  await expect(page.locator('.sky-customer-reference-dashboard')).toHaveCount(0);

  await runExactCustomerSearch(page);
  await expect(page.locator('.sky-tool-heading')).toHaveCount(0);
  for (const heading of [
    defaultCase.person,
    'Profile updates',
    'Trusted devices & controls',
    'Accounts & products',
    'Relationship facts',
    'Recent contact notes',
  ]) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.locator('.sky-customer-reference-dashboard')).not.toContainText(
    /Engagement score|Security status/i,
  );
  await expect(page.locator('.sky-customer-devices-card')).not.toHaveAttribute('data-tone');

  await page.getByLabel('Complete Training ID').fill(`${defaultCase.trainingId}-changed`);
  await expect(page.locator('.sky-customer-reference-dashboard')).toHaveCount(0);
  await runExactCustomerSearch(page);

  await page.getByRole('button', { name: 'Back to tool map' }).click();
  await expect(page.getByRole('heading', { name: /Tool Map/i })).toBeVisible();
  await page.getByRole('button', { name: /Identity & Customer/i }).click();
  await page.getByRole('button', { name: /Customer 360 Open tool/i }).click();
  await runExactCustomerSearch(page);

  await page.getByRole('button', { name: 'Open exact device' }).first().click();
  await expect(page.getByRole('heading', { name: 'Device Intelligence' })).toBeVisible();
  await expect(page.getByLabel('Device ID')).toHaveValue('DEV-MAYA-IP16-001');
  await expect(page.locator('.sky-device-primary-card')).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Workspace/i })
    .click();
  await page.getByRole('button', { name: /Identity & Customer/i }).click();
  await page.getByRole('button', { name: /Customer 360 Open tool/i }).click();
  await runExactCustomerSearch(page);

  await page.getByRole('button', { name: 'Pin update' }).first().click();
  await page.getByRole('button', { name: 'Pin contact' }).first().click();
  const quickPad = page.locator('.sky-quick-pad');
  await quickPad.getByRole('button', { name: /^Open/ }).click();
  await quickPad.locator('.sky-record', { hasText: 'Profile update' }).click();
  await quickPad.locator('.sky-record', { hasText: 'Service contact' }).click();
  await expect(quickPad.getByText(defaultCase.trainingId, { exact: true })).toHaveCount(2);
  await quickPad.getByRole('button', { name: 'Open Customer 360' }).click();

  await expect(page.getByLabel('Complete Training ID')).toHaveValue(defaultCase.trainingId);
  await expect(page.locator('.sky-customer-reference-dashboard')).toHaveCount(0);
  await expect(page.getByText(/Record details stay hidden until a match is returned/i)).toBeVisible();
});

test('Customer 360 has no horizontal overflow at supported phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 });
  await openCustomer360(page);
  await runExactCustomerSearch(page);

  for (const width of [420, 390, 360, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const layout = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(layout.body).toBeLessThanOrEqual(layout.viewport + 1);
    expect(layout.document).toBeLessThanOrEqual(layout.viewport + 1);
  }
});
