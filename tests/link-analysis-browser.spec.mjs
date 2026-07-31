import { expect, test } from '@playwright/test';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';
import { getLinkIdentifiersForCase } from '../src/data/linkAnalysisRecords.js';

const [defaultCase] = enrichTrainingCases(trainingCases);
const exactPhone = getLinkIdentifiersForCase(defaultCase)
  .find((item) => item.type === 'phone')?.value;

async function openFirstCaseWorkspace(page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await page.locator('.sky-case-card').first().click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await expect(page.getByRole('heading', { name: /investigation workspace/i })).toBeVisible();
}

async function returnToToolMap(page) {
  const referenceBack = page.getByRole('button', { name: 'Back to tool map' });
  if (await referenceBack.isVisible()) {
    await referenceBack.click();
    return;
  }
  await page.getByRole('button', { name: 'Back to Workspace' }).click();
}

test('Link Analysis and Timeline open directly with optional filters in the Sky reference structure', async ({ page }) => {
  await openFirstCaseWorkspace(page);

  await page.getByRole('button', { name: /Evidence, Links & Workflow/i }).click();
  await page.getByRole('button', { name: /Link Analysis Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Link Analysis' })).toBeVisible();
  await expect(page.locator('.sky-link-reference-map')).toBeVisible();
  await expect(page.locator('.sky-link-reference-account-list button').first()).toBeVisible();
  await page.locator('.sky-link-reference-account-list button').first().click();
  await expect(page.getByText('Selected account relationship')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pin evidence' })).toBeVisible();

  await returnToToolMap(page);
  await page.getByRole('button', { name: /Evidence, Links & Workflow/i }).click();
  await page.getByRole('button', { name: /Timeline Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible();
  await expect(page.locator('.sky-timeline-reference-event').first()).toBeVisible();
  await page.locator('.sky-timeline-reference-event > button').first().click();
  await expect(page.locator('.sky-timeline-reference-inline-detail')).toBeVisible();
  await expect(page.locator('.sky-timeline-reference-inline-detail')
    .getByRole('button', { name: 'Pin evidence' })).toBeVisible();

  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
});
