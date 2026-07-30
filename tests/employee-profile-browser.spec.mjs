import { expect, test } from '@playwright/test';

import {
  getEmployeeProfiles,
} from '../src/data/businessPayrollWorkspace.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { resolvePaymentLookup } from '../src/data/paymentVerification.js';

const activeCase = createGeneratedCase({
  index: 12345680,
  claimTypeId: 'payroll-account-takeover',
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
const employeeProfiles = getEmployeeProfiles(activeCase);
const paymentRecords = getFinancialRecords(activeCase).paymentVerification;
const paymentState = (profile, destination) => resolvePaymentLookup(
  paymentRecords,
  {
    bankCode: destination?.bankCode,
    destinationId: destination?.destinationId,
    ownerName: profile?.name,
  },
  activeCase,
).state;
const verifiedProfile = employeeProfiles.find((profile) => (
  profile.latestPaycheck?.destinations?.some((destination) => (
    paymentState(profile, destination) === 'found'
  ))
));
const verifiedDestination = verifiedProfile.latestPaycheck.destinations.find((destination) => (
  paymentState(verifiedProfile, destination) === 'found'
));
const unsupportedProfile = employeeProfiles.find((profile) => (
  profile.id !== verifiedProfile.id
  && profile.latestPaycheck?.destinations?.length
  && profile.latestPaycheck.destinations.every((destination) => (
    paymentState(profile, destination) === 'not-found'
  ))
));
const unsupportedDestination = unsupportedProfile.latestPaycheck.destinations[0];
const latestVerifiedPaystub = verifiedProfile.latestPaycheck.paystub;

const ambiguousCase = JSON.parse(JSON.stringify(activeCase));
ambiguousCase.id = `${activeCase.id}-AMBIGUOUS`;
ambiguousCase.claimId = `${activeCase.claimId ?? activeCase.id}-AMBIGUOUS`;
ambiguousCase.toolResults.employeeProfile = ambiguousCase.toolResults.employeeProfile
  .map((profile, index) => (
    index < 2 ? { ...profile, name: 'Shared Training Employee' } : profile
  ));

async function seedGeneratedEmployeeCase(page, caseRecord = activeCase) {
  await page.addInitScript(({ seededCase }) => {
    window.localStorage.setItem(
      'fraud-academy-generated-cases-v1',
      JSON.stringify([seededCase]),
    );
    window.localStorage.setItem('fraud-bloom-active-case-v1', seededCase.id);
  }, { seededCase: caseRecord });
}

async function openEmployeeProfile(page, caseRecord = activeCase) {
  await seedGeneratedEmployeeCase(page, caseRecord);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();

  const caseCard = page.locator('.sky-case-card', { hasText: caseRecord.id });
  await expect(caseCard).toBeVisible();
  await caseCard.click();
  const workspaceButton = page.getByRole('button', { name: /Open workspace/i }).last();
  if (await workspaceButton.isVisible()) await workspaceButton.click();
  await page.getByRole('button', { name: /Business & Payment Verification/i }).click();
  await page.getByRole('button', { name: /Employee Profile Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Employee Profile', exact: true })).toBeVisible();
}

async function runEmployeeSearch(page, identifier) {
  await page.getByLabel('Search Employee Profile').fill(identifier);
  await page.getByRole('button', { name: 'Run employee search' }).click();
}

test('Employee Profile keeps exact search locked and preserves actions plus Payroll handoffs', async ({ page }) => {
  await openEmployeeProfile(page);

  await expect(page.locator('.sky-tool-heading')).toHaveCount(0);
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);
  await expect(page.locator('[aria-label="Employee pay details"]')).toHaveCount(0);
  await expect(page.getByText('No employee profile is open.')).toBeVisible();

  await page.getByRole('button', { name: 'Run employee search' }).click();
  await expect(page.getByRole('alert')).toContainText('Enter an exact employee');
  await runEmployeeSearch(page, `${verifiedProfile.id}-PARTIAL`);
  await expect(page.getByRole('alert')).toContainText('No supplied employee profile matched');
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);

  await runEmployeeSearch(page, verifiedProfile.id);
  await expect(page.locator('.sky-employee-hero')).toContainText(verifiedProfile.name);
  await expect(page.locator('.sky-employee-hero')).toContainText(verifiedProfile.id);
  await expect(page.locator('.sky-employee-paycheck')).toContainText(latestVerifiedPaystub.id);
  await expect(page.locator('.sky-employee-deposit')).toContainText(verifiedDestination.destinationId);
  await expect(page.getByRole('heading', { name: 'Compensation History', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Profile History', exact: true })).toBeVisible();

  const evidenceActions = page.locator('.sky-reference-evidence-actions');
  await evidenceActions.getByLabel('Investigator note')
    .fill(`Employee ${verifiedProfile.id} is connected to supplied payroll records.`);
  await evidenceActions.getByRole('button', { name: 'Save note' }).click();
  await evidenceActions.getByRole('button', { name: 'Pin record' }).click();
  await evidenceActions.getByRole('button', { name: 'Mark Employee Profile reviewed' }).click();
  await expect(evidenceActions.getByRole('button', { name: '✓ Employee Profile reviewed' })).toBeDisabled();

  const quickPad = page.locator('.sky-quick-pad-floating');
  await quickPad.getByRole('button', { name: /^Open Quick Pad/ }).click();
  await quickPad.locator('.sky-record', { hasText: verifiedProfile.id }).click();
  await expect(quickPad.locator('.sky-summary-list').getByText('Employee ID', { exact: true })).toBeVisible();
  await expect(quickPad.locator('.sky-summary-list').getByText(verifiedProfile.id, { exact: true })).toBeVisible();
  await quickPad.getByRole('button', { name: 'Open Employee Profile' }).click();

  await expect(page.getByLabel('Search Employee Profile')).toHaveValue(verifiedProfile.id);
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);
  await expect(page.getByText('No employee profile is open.')).toBeVisible();
  await page.getByRole('button', { name: 'Run employee search' }).click();
  await expect(page.locator('.sky-employee-hero')).toContainText(verifiedProfile.name);

  await page.getByRole('button', { name: 'Open Payroll History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payroll History', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search Payroll History')).toHaveValue(verifiedProfile.id);
  await expect(page.locator('.sky-payroll-overview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Run payroll search' }).click();
  await expect(page.getByRole('heading', { name: 'Employee Pay Records Preview', exact: true })).toBeVisible();
  await expect(page.locator('.sky-payroll-employees')).toContainText(verifiedProfile.name);

  await page.getByRole('button', { name: /Open Employee Profile/i }).click();
  await expect(page.getByRole('heading', { name: 'Employee Profile', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search Employee Profile')).toHaveValue(verifiedProfile.id);
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);

  await page.getByLabel('Search Employee Profile').fill(`${verifiedProfile.id}-edited`);
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);
  await expect(page.locator('[aria-label="Employee pay details"]')).toHaveCount(0);
});

test('Employee Profile exposes only source-backed Payment Verification handoffs', async ({ page }) => {
  await openEmployeeProfile(page);

  await runEmployeeSearch(page, unsupportedProfile.id);
  await expect(page.locator('.sky-employee-deposit')).toContainText(unsupportedDestination.destinationId);
  await expect(page.getByRole('button', {
    name: `Verify payment destination ${unsupportedDestination.destinationId}`,
  })).toHaveCount(0);
  await expect(page.locator('.sky-employee-deposit')).toContainText(
    'No exact Payment Verification record is supplied for this destination.',
  );

  await runEmployeeSearch(page, verifiedProfile.id);
  const verifyButton = page.getByRole('button', {
    name: `Verify payment destination ${verifiedDestination.destinationId}`,
  });
  await expect(verifyButton).toBeVisible();
  await verifyButton.click();

  await expect(page.getByRole('heading', { name: 'Payment Verification', exact: true })).toBeVisible();
  await expect(page.getByLabel('Bank Code')).toHaveValue(verifiedDestination.bankCode);
  await expect(page.getByLabel('Destination ID')).toHaveValue(verifiedDestination.destinationId);
  await expect(page.getByLabel('Optional payment relationship name')).toHaveValue(verifiedProfile.name);
  await expect(page.getByText('Verification result is hidden')).toBeVisible();
  await expect(page.locator('.sky-payment-reference-result-rail')).toHaveCount(0);
});

test('Employee Profile rejects an ambiguous exact name instead of choosing the first employee', async ({ page }) => {
  await openEmployeeProfile(page, ambiguousCase);

  await runEmployeeSearch(page, 'Shared Training Employee');
  await expect(page.getByRole('alert')).toContainText(
    'Multiple supplied employee profiles share that exact name',
  );
  await expect(page.locator('.sky-employee-hero')).toHaveCount(0);

  const exactEmployeeId = ambiguousCase.toolResults.employeeProfile[1].id;
  await runEmployeeSearch(page, exactEmployeeId);
  await expect(page.locator('.sky-employee-hero')).toContainText(exactEmployeeId);
});

test('Employee Profile has no horizontal overflow at supported phone widths', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 1000 });
  await openEmployeeProfile(page);
  await runEmployeeSearch(page, verifiedProfile.id);

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
