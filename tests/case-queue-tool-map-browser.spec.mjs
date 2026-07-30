import { expect, test } from '@playwright/test';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';
import { availableWorkspaceTools } from '../src/data/workspaceProgress.js';

const [defaultCase] = enrichTrainingCases(trainingCases);
const expectedTools = availableWorkspaceTools(defaultCase).sort();

async function expectNoPageOverflow(page, width) {
  const layout = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(layout.body).toBeLessThanOrEqual(width + 1);
  expect(layout.document).toBeLessThanOrEqual(width + 1);
}

for (const width of [420, 390, 360, 320]) {
  test(`Case Queue and Tool Map remain functional at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('button', { name: /Cases/i })
      .click();

    await expect(page.getByRole('heading', { name: 'Case Queue' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Case lifecycle filters' })).toBeVisible();
    await expect(page.locator('.sky-queue-status-tabs button').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/High Risk|Medium Risk|Low Risk|Merchant challenged/i)).toHaveCount(0);

    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByLabel('Customer type')).toBeVisible();
    await page.getByLabel('Customer type').selectOption({ label: 'Personal' });
    await page.getByRole('button', { name: 'Clear' }).click();

    await page.getByLabel('Search cases').fill('ACCT-24007-8841');
    await expect(page.locator('.sky-case-card', { hasText: 'FA-CB-24007' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear case search' }).click();
    await expectNoPageOverflow(page, width);

    await page.getByRole('button', { name: /Open Quick Pad/i }).click();
    const quickPad = page.getByRole('dialog', { name: 'Quick Pad' });
    await expect(quickPad).toHaveAttribute('aria-modal', 'true');
    await expect.poll(() => page.evaluate(() => (
      document.activeElement?.closest('[role="dialog"]') !== null
    ))).toBe(true);
    await quickPad.getByRole('button', { name: 'Close Quick Pad' }).click();

    await page.locator('.sky-case-card', { hasText: defaultCase.id }).click();
    if (await page.locator('.sky-briefing').isVisible()) {
      await page.getByRole('button', { name: /Open workspace/i }).last().click();
    }

    await expect(page.locator('.sky-toolmap-canvas')).toBeVisible();
    await expect(page.locator('.sky-toolmap-node')).toHaveCount(5);
    await expect(page.locator('.sky-toolmap-lines-mobile')).toBeVisible();

    const renderedTools = [];
    const nodes = page.locator('.sky-toolmap-node');
    for (let index = 0; index < 5; index += 1) {
      await nodes.nth(index).click();
      renderedTools.push(...await page.locator('.sky-toolmap-tool-button strong').allTextContents());
    }
    expect([...new Set(renderedTools)].sort()).toEqual(expectedTools);
    expect(renderedTools).toHaveLength(expectedTools.length);
    await expect(page.getByRole('button', { name: /Build investigation summary/i })).toBeVisible();
    await expectNoPageOverflow(page, width);
  });
}
