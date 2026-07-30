import { expect, test } from '@playwright/test';

import {
  getPayrollHistory,
  sortPayrollRunsNewestFirst,
} from '../src/data/businessPayrollWorkspace.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';

const activeCase = createGeneratedCase({
  index: 12345679,
  claimTypeId: 'payroll-account-takeover',
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
const payroll = getPayrollHistory(activeCase);
const newestRuns = sortPayrollRunsNewestFirst(payroll.payrollRuns);
const latestRun = newestRuns[0];
const correctionRun = newestRuns.find((run) => run.runType === 'Correction');
const oldestRun = newestRuns.at(-1);
const correctionEmployee = correctionRun.employees[0];
const correctionPaystub = correctionEmployee.paystub;
const currentDestination = correctionPaystub.paymentDestinations[0];
const historicalEmployee = oldestRun.employees[0];
const historicalPaystub = historicalEmployee.paystub;
const historicalDestination = historicalPaystub.paymentDestinations[0];

async function seedGeneratedPayrollCase(page) {
  await page.addInitScript(({ caseRecord }) => {
    window.localStorage.setItem(
      'fraud-academy-generated-cases-v1',
      JSON.stringify([caseRecord]),
    );
    window.localStorage.setItem('fraud-bloom-active-case-v1', caseRecord.id);
  }, { caseRecord: activeCase });
}

async function openPayrollHistory(page) {
  await seedGeneratedPayrollCase(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();

  const caseCard = page.locator('.sky-case-card', { hasText: activeCase.id });
  await expect(caseCard).toBeVisible();
  await caseCard.click();
  if (await page.getByRole('button', { name: /Open workspace/i }).last().isVisible()) {
    await page.getByRole('button', { name: /Open workspace/i }).last().click();
  }
  await page.getByRole('button', { name: /Business & Payment Verification/i }).click();
  await page.getByRole('button', { name: /Payroll History Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Payroll History', exact: true })).toBeVisible();
}

async function runExactSearch(page, identifier) {
  await page.getByLabel('Search Payroll History').fill(identifier);
  await page.getByRole('button', { name: 'Run payroll search' }).click();
}

test('Payroll History preserves the exact-search lock and the full Sky evidence workflow', async ({ page }) => {
  await openPayrollHistory(page);

  await expect(page.locator('.sky-tool-heading')).toHaveCount(0);
  await expect(page.locator('.sky-payroll-overview')).toHaveCount(0);
  await expect(page.locator('[aria-label="Payroll runs"]')).toHaveCount(0);
  await expect(page.getByText('No payroll result is open.')).toBeVisible();

  await page.getByRole('button', { name: 'Run payroll search' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter an exact payroll');
  await runExactSearch(page, 'PAYROLL-PARTIAL');
  await expect(page.getByRole('alert')).toContainText('No supplied payroll record matched');
  await expect(page.locator('.sky-payroll-overview')).toHaveCount(0);

  await runExactSearch(page, payroll.companyPayrollProfile.payrollId);
  await expect(page.locator('.sky-payroll-overview')).toBeVisible();
  await expect(page.locator('.sky-payroll-overview[aria-label="Payroll overview"]')).toContainText(latestRun.payDate);
  await expect(page.locator('[aria-label="Payroll runs"]')).toBeVisible();
  await expect(page.locator('.sky-payroll-run-card').first()).toContainText(latestRun.id);

  await page.getByRole('button', { name: /^Filters/ }).click();
  const filters = page.locator('#payroll-history-filters');
  await expect(filters).toBeVisible();
  await filters.getByLabel('Run type').selectOption({ label: 'Correction' });
  await expect(page.locator('.sky-payroll-run-card')).toHaveCount(1);
  await expect(page.locator('.sky-payroll-run-card').first()).toContainText(correctionRun.id);
  await filters.getByLabel('Status').selectOption({ label: 'Settled' });
  await expect(page.locator('.sky-payroll-run-card')).toHaveCount(1);
  await filters.getByLabel('Run type').selectOption('all');

  await page.getByRole('button', { name: `Open payroll run ${correctionRun.id}` }).click();
  await expect(page.getByRole('heading', { name: 'Employee Pay Records Preview', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open paystub ${correctionPaystub.id}` })).toBeVisible();
  await page.getByRole('button', { name: `Open paystub ${correctionPaystub.id}` }).click();
  await expect(page.getByText(correctionPaystub.id, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', {
    name: `Select payment destination ${currentDestination.destinationId}`,
  })).toBeVisible();

  const evidenceActions = page.locator('.sky-reference-evidence-actions');
  await evidenceActions.getByLabel('Investigator note')
    .fill(`Paystub ${correctionPaystub.id} preserves the supplied correction-run record.`);
  await evidenceActions.getByRole('button', { name: 'Save note' }).click();
  await evidenceActions.getByRole('button', { name: 'Pin record' }).click();
  await evidenceActions.getByRole('button', { name: 'Mark Payroll History reviewed' }).click();
  await expect(evidenceActions.getByRole('button', { name: '✓ Payroll History reviewed' })).toBeDisabled();

  const quickPad = page.locator('.sky-quick-pad');
  await quickPad.getByRole('button', { name: /^Open/ }).click();
  await quickPad.locator('.sky-record', { hasText: correctionPaystub.id }).click();
  await expect(quickPad.locator('.sky-summary-list').getByText('Paystub ID', { exact: true })).toBeVisible();
  await expect(quickPad.locator('.sky-summary-list').getByText(correctionPaystub.id, { exact: true })).toBeVisible();
  await quickPad.getByRole('button', { name: 'Open Payroll History' }).click();

  await expect(page.getByLabel('Search Payroll History')).toHaveValue(correctionPaystub.id);
  await expect(page.locator('.sky-payroll-overview')).toHaveCount(0);
  await expect(page.locator('[aria-label="Payroll runs"]')).toHaveCount(0);
  await expect(page.getByText('No payroll result is open.')).toBeVisible();
  await page.getByRole('button', { name: 'Run payroll search' }).click();
  await expect(page.getByText(correctionPaystub.id, { exact: true })).toBeVisible();

  await page.getByLabel('Search Payroll History').fill(`${correctionPaystub.id}-edited`);
  await expect(page.locator('.sky-payroll-overview')).toHaveCount(0);
  await expect(page.locator('[aria-label="Payroll runs"]')).toHaveCount(0);
});

test('Payroll History keeps historical destinations immutable and exposes only valid payment handoffs', async ({ page }) => {
  await openPayrollHistory(page);

  await runExactSearch(page, oldestRun.id);
  await page.getByRole('button', { name: `Open payroll run ${oldestRun.id}` }).click();
  await page.getByRole('button', { name: `Open paystub ${historicalPaystub.id}` }).click();
  await expect(page.getByRole('button', {
    name: `Select payment destination ${historicalDestination.destinationId}`,
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: `Select payment destination ${currentDestination.destinationId}`,
  })).toHaveCount(0);

  await page.getByRole('button', {
    name: `Select payment destination ${historicalDestination.destinationId}`,
  }).click();
  await expect(page.getByRole('button', {
    name: `Verify payment destination ${historicalDestination.destinationId}`,
  })).toHaveCount(0);

  await runExactSearch(page, currentDestination.destinationId);
  await page.getByRole('button', {
    name: `Select payment destination ${currentDestination.destinationId}`,
  }).click();
  await expect(page.getByRole('button', {
    name: `Verify payment destination ${currentDestination.destinationId}`,
  })).toBeVisible();
});

test('Payroll History has no horizontal overflow at supported phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 });
  await openPayrollHistory(page);
  await runExactSearch(page, correctionPaystub.id);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('button', {
    name: `Select payment destination ${currentDestination.destinationId}`,
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
