import { expect, test } from '@playwright/test';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';
import { getSystemAccessRecords } from '../src/data/systemAccessRecords.js';

const cases = enrichTrainingCases(trainingCases);
const activeCase = cases[0];
const [primaryRecord] = getSystemAccessRecords(activeCase);

async function openSystemAccessLane(page, caseRecord = activeCase) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await page.locator('.sky-case-card', { hasText: caseRecord.id }).click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await page.getByRole('button', { name: /Evidence, Links & Workflow/i }).click();
  await page.getByRole('button', { name: /System Access Lane Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'System Access Lane', exact: true })).toBeVisible();
}

async function runAccessSearch(page, query) {
  await page.getByLabel('Search System Access Lane').fill(query);
  await page.getByRole('button', { name: 'Apply filter' }).click();
}

test('System Access Lane opens directly, filters, and expands only supplied records', async ({ page }) => {
  await openSystemAccessLane(page);

  await expect(page.locator('.sky-tool-heading')).toHaveCount(0);
  await expect(page.locator('.sky-system-access-summary')).toBeVisible();
  await expect(page.locator('.sky-system-access-event').first()).toBeVisible();

  await runAccessSearch(page, 'NOT-A-SUPPLIED-ACCESS-RECORD');
  await expect(page.getByText('No supplied access event matched')).toBeVisible();
  await expect(page.locator('.sky-system-access-summary')).toHaveCount(0);

  await runAccessSearch(page, primaryRecord.id);
  await expect(page.locator('.sky-system-access-summary')).toContainText('1');
  await expect(page.locator('.sky-system-access-event')).toHaveCount(1);
  await expect(page.locator('.sky-system-access-event')).toContainText(primaryRecord.event);
  await expect(page.locator('.sky-system-access-event')).toContainText(primaryRecord.actor);
  await expect(page.locator('.sky-system-access-event')).toContainText(primaryRecord.object);

  await page.getByRole('button', {
    name: `Open system access record ${primaryRecord.id}`,
  }).click();
  const detail = page.locator('.sky-system-access-detail');
  await expect(detail).toContainText(primaryRecord.lane);
  await expect(detail).toContainText(primaryRecord.observed);
  await expect(detail).toContainText(primaryRecord.context);

  await detail.getByLabel('Evidence note')
    .fill(`Reviewed supplied system access record ${primaryRecord.id}.`);
  await detail.getByRole('button', { name: 'Save note' }).click();
  await detail.getByRole('button', { name: 'Mark reviewed' }).click();
  await expect(detail.getByRole('button', { name: 'Reviewed' })).toBeDisabled();

  await page.getByLabel('Search System Access Lane').fill('edited query');
  await expect(page.locator('.sky-system-access-summary')).toBeVisible();
  await expect(page.locator('.sky-system-access-event')).toHaveCount(1);

  const toolText = (await page.locator('.sky-system-access-page').innerText()).toLowerCase();
  for (const forbidden of [
    'risk score',
    'confirmed fraud',
    'correct answer',
    'accepted determination',
    'recommendation',
  ]) {
    expect(toolText).not.toContain(forbidden);
  }
});

test('System Access Lane pins and reopens the exact record through the floating Quick Pad', async ({ page }) => {
  await openSystemAccessLane(page);
  await runAccessSearch(page, primaryRecord.id);
  await page.getByRole('button', {
    name: `Open system access record ${primaryRecord.id}`,
  }).click();
  await page.locator('.sky-system-access-detail')
    .getByRole('button', { name: 'Pin evidence' })
    .click();

  const quickPad = page.locator('.sky-quick-pad-floating');
  await quickPad.getByRole('button', { name: /^Open Quick Pad/ }).click();
  await quickPad.locator('.sky-record', { hasText: primaryRecord.id }).click();
  await expect(quickPad.locator('.sky-summary-list')
    .getByText('System Access Record ID', { exact: true })).toBeVisible();
  await expect(quickPad.locator('.sky-summary-list')
    .getByText(primaryRecord.id, { exact: true })).toBeVisible();
  await quickPad.getByRole('button', { name: 'Open System Access Lane' }).click();

  await expect(page.getByLabel('Search System Access Lane')).toHaveValue(primaryRecord.id);
  await expect(page.locator('.sky-system-access-event')).toHaveCount(1);
  await expect(page.locator('.sky-system-access-event')).toContainText(primaryRecord.id);
});

test('System Access Lane has no horizontal overflow at supported phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 });
  await openSystemAccessLane(page);
  await runAccessSearch(page, primaryRecord.id);
  await page.getByRole('button', {
    name: `Open system access record ${primaryRecord.id}`,
  }).click();

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
