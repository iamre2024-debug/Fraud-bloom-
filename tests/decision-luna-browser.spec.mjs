import { expect, test } from '@playwright/test';

test('Sky dashboard, briefing, Payment Verification, and neutral indicators are structural', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /let’s investigate with clarity/i })).toBeVisible();
  await expect(page.getByAltText('Luna, the Fraud Bloom assistant')).toBeVisible();
  await expect(page.locator('.sky-dashboard-tile')).toHaveCount(3);
  const dashboardTileRadius = await page.locator('.sky-dashboard-tile').first().evaluate(
    (element) => getComputedStyle(element).borderRadius,
  );
  expect(dashboardTileRadius).not.toBe('0px');

  const primaryNav = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(primaryNav.getByRole('button', { name: /Luna/i })).toBeDisabled();
  await primaryNav.getByRole('button', { name: /Cases/i }).click();
  await expect(page.getByRole('heading', { name: 'Choose the next investigation' })).toBeVisible();

  await page.locator('.sky-case-card').first().click();
  await expect(page.getByRole('heading', { name: 'FA-ATO-24018' })).toBeVisible();
  await expect(page.locator('.sky-briefing-facts')).toBeVisible();
  await expect(page.getByText('This is the intake allegation, not a finding.')).toBeVisible();

  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await expect(page.getByRole('heading', { name: /investigation workspace/i })).toBeVisible();
  await page.getByRole('button', { name: /Business & Payment Verification/i }).click();
  await page.getByRole('button', { name: /Payment Verification Open tool/i }).click();

  await expect(page.getByLabel('Bank Code')).toBeVisible();
  await expect(page.getByLabel('Destination ID')).toBeVisible();
  await expect(page.getByText('Ownership status', { exact: true })).toHaveCount(0);
  await page.getByLabel('Bank Code').fill('BC-441');
  await page.getByLabel('Destination ID').fill('DST-CARD-4410');
  await page.getByRole('button', { name: 'Run verification' }).click();
  await expect(page.getByText('Ownership status', { exact: true })).toBeVisible();
  await expect(page.getByText('Account status', { exact: true })).toBeVisible();
  await page.getByLabel('Destination ID').fill('DST-CHANGED');
  await expect(page.getByText('Ownership status', { exact: true })).toHaveCount(0);

  const referenceBack = page.getByRole('button', { name: 'Back to tool map' });
  if (await referenceBack.isVisible()) {
    await referenceBack.click();
    await page.getByRole('button', { name: /Build investigation summary/i }).click();
  } else {
    await page.getByRole('navigation', { name: 'Case workflow' })
      .getByRole('button', { name: /Summary/i })
      .click();
  }
  await page.getByRole('button', { name: /Continue to indicators/i }).click();
  await expect(page.getByRole('heading', { name: /checklist/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Yes/ }).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /^No/ }).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Not enough evidence/ }).first()).toBeVisible();
  await expect(page.getByText(/Critical|High Risk|Review cue|Verified context/i)).toHaveCount(0);

  const indicatorItems = page.locator('.sky-indicator-item');
  const indicatorCount = await indicatorItems.count();
  for (let index = 0; index < indicatorCount; index += 1) {
    const item = indicatorItems.nth(index);
    await item.locator('summary').click();
    await item.getByRole('radio', { name: /^Not enough evidence/ }).click();
    await item.getByLabel('Evidence reference').fill(`Record ID EVT-E2E-${index + 1}`);
    await item.getByLabel('Your explanation').fill(
      'The cited record is documented, but this single record does not resolve the indicator without the related case evidence.',
    );
  }

  await page.getByRole('button', { name: /Continue to determination/i }).click();
  await expect(page.getByRole('heading', { name: 'Determination', exact: true }).first()).toBeVisible();
  await expect(page.locator('.sky-decision-card[aria-pressed="true"]')).toHaveCount(0);

  await page.locator('.sky-determination-options .sky-decision-card').first().click();
  await page.locator('.sky-finding-options .sky-decision-card').first().click();
  await page.getByLabel('Evidence-based rationale').fill(
    'Transaction ID TXN-E2E-001 and the documented indicator records support this operational decision while keeping the final case finding separate.',
  );
  await expect(page.getByRole('button', { name: 'Review submission' })).toBeEnabled();
  await page.getByRole('button', { name: 'Review submission' }).click();

  await expect(page.getByRole('heading', { name: 'Submit Decision' })).toBeVisible();
  await expect(page.locator('.sky-submit-decision-card')).toContainText('Selected decision');
  await expect(page.locator('.sky-submit-evidence-card')).toContainText('Pinned evidence (0)');
  await expect(page.locator('.sky-submit-notes-card')).toContainText('Investigation notes (0)');
  await expect(page.getByRole('button', { name: 'Submit and unlock Luna' })).toBeEnabled();
  await page.getByRole('button', { name: 'Submit and unlock Luna' }).click();

  await expect(page.getByRole('heading', { name: 'Luna Debrief ✨' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What You Did Well' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Evidence You Might Have Missed' })).toBeVisible();
  await expect(page.getByText('Scenario outcome', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to Workspace' })).toBeEnabled();
});

test('Sky mobile layout keeps shaped cards and fixed navigation usable', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile-only layout assertion.');
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  await expect(page.locator('.sky-hero')).toBeVisible();
  await expect(page.locator('.sky-dashboard-tile')).toHaveCount(3);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    navBottom: Math.round(
      window.innerHeight
      - document.querySelector('.sky-bottom-nav').getBoundingClientRect().bottom,
    ),
  }));
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.navBottom).toBeGreaterThanOrEqual(0);

  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await expect(page.locator('.sky-queue-reference')).toBeVisible();
  await expect(page.locator('.sky-queue-status-tabs')).toBeVisible();
  await expect(page.locator('.sky-case-card').first()).toBeVisible();
  const caseWidth = await page.locator('.sky-case-card').first().evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(caseWidth).toBeLessThanOrEqual(layout.viewport - 16);

  await page.getByRole('button', { name: /Open Quick Pad/i }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Quick Pad' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Close Quick Pad' }).click();

  await page.locator('.sky-case-card').first().click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await expect(page.locator('.sky-toolmap-canvas')).toBeVisible();
  await expect(page.locator('.sky-toolmap-node')).toHaveCount(5);
  const toolMapLayout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(toolMapLayout.bodyWidth).toBeLessThanOrEqual(toolMapLayout.viewport + 1);
});
