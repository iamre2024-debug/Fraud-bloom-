import { expect, test } from '@playwright/test';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';

const [activeCase] = enrichTrainingCases(trainingCases);

async function openTransactionHistory(page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await page.locator('.sky-case-card', { hasText: activeCase.id }).click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await page.getByRole('button', { name: /Transactions, Merchant & Financial/i }).click();
  await page.getByRole('button', { name: /Transaction History Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Transaction History' })).toBeVisible();
}

async function runPostedSearch(page) {
  await page.getByLabel('Search Transaction History').fill('Posted');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.locator('.sky-transaction-summary')).toBeVisible();
  await expect(page.locator('.sky-transaction-record')).toHaveCount(3);
}

test('Transaction History opens directly and preserves its functional Sky investigation workflow', async ({ page }) => {
  await openTransactionHistory(page);

  await expect(page.locator('.sky-tool-heading')).toHaveCount(0);
  await expect(page.locator('.sky-transaction-summary')).toBeVisible();
  await expect(page.locator('.sky-transaction-record').first()).toBeVisible();

  await page.getByLabel('Search Transaction History').fill('not-a-source-transaction');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.getByRole('alert')).toContainText('No supplied transaction matched');

  await runPostedSearch(page);
  await expect(page.locator('.sky-transaction-summary')).toContainText('$865.09');
  await expect(page.getByRole('button', { name: 'All supplied' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Channel').selectOption({ label: 'Card present' });
  await expect(page.locator('.sky-transaction-record')).toHaveCount(2);
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('.sky-transaction-record')).toHaveCount(3);

  await page.getByRole('button', { name: /Custom/ }).click();
  await page.getByLabel('Transaction custom start date').fill('2026-07-08');
  await page.getByLabel('Transaction custom end date').fill('2026-07-08');
  await expect(page.locator('.sky-transaction-record')).toHaveCount(1);
  await page.getByRole('button', { name: 'All supplied' }).click();
  await expect(page.locator('.sky-transaction-record')).toHaveCount(3);

  const primaryRecord = page.locator('.sky-transaction-record', { hasText: 'Northstar Digital Market' });
  await primaryRecord.getByRole('button').click();
  await expect(primaryRecord).toContainText('TXN-1001');
  await expect(primaryRecord).toContainText('Debit card ending 4410');
  await expect(primaryRecord).toContainText('Disputed transaction tied to case allegation.');

  const evidenceActions = page.locator('.sky-reference-evidence-actions');
  await evidenceActions.getByLabel('Investigator note')
    .fill('The source records TXN-1001 as a posted card-not-present debit.');
  await evidenceActions.getByRole('button', { name: 'Save note' }).click();
  await evidenceActions.getByRole('button', { name: 'Pin record' }).click();
  await evidenceActions.getByRole('button', { name: 'Mark Transaction History reviewed' }).click();
  await expect(evidenceActions.getByRole('button', { name: '✓ Transaction History reviewed' })).toBeDisabled();

  const quickPad = page.locator('.sky-quick-pad-floating');
  await quickPad.getByRole('button', { name: /^Open Quick Pad/ }).click();
  await quickPad.locator('.sky-record', { hasText: 'TXN-1001' }).click();
  await expect(quickPad.locator('.sky-summary-list').getByText('Transaction ID', { exact: true })).toBeVisible();
  await expect(quickPad.locator('.sky-summary-list').getByText('TXN-1001', { exact: true })).toBeVisible();
  await quickPad.getByRole('button', { name: 'Open Transaction History' }).click();

  await expect(page.getByLabel('Search Transaction History')).toHaveValue('TXN-1001');
  await expect(page.locator('.sky-transaction-record')).toHaveCount(1);
  await expect(page.locator('.sky-transaction-summary')).toContainText('Exact transaction view');

  await page.getByLabel('Search Transaction History').fill('Metro Fuel');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await expect(page.locator('.sky-transaction-record')).toHaveCount(1);
  await page.getByLabel('Search Transaction History').fill('Metro');
  await expect(page.locator('.sky-transaction-summary')).toBeVisible();
  await expect(page.locator('.sky-transaction-record')).toHaveCount(1);
});

test('Transaction History has no horizontal overflow at supported phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 });
  await openTransactionHistory(page);
  await runPostedSearch(page);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.locator('.sky-transaction-record').first().getByRole('button').click();

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
