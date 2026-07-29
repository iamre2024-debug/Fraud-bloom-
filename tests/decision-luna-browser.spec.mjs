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

  await page.getByRole('navigation', { name: 'Case workflow' })
    .getByRole('button', { name: /Summary/i })
    .click();
  await page.getByRole('button', { name: /Continue to indicators/i }).click();
  await expect(page.getByRole('heading', { name: /checklist/i })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Yes/ }).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /^No/ }).first()).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Not enough evidence/ }).first()).toBeVisible();
  await expect(page.getByText(/Critical|High Risk|Review cue|Verified context/i)).toHaveCount(0);
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
  await expect(page.locator('.sky-case-card').first()).toBeVisible();
  const caseWidth = await page.locator('.sky-case-card').first().evaluate(
    (element) => element.getBoundingClientRect().width,
  );
  expect(caseWidth).toBeLessThanOrEqual(layout.viewport - 16);
});
