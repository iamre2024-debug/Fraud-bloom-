import { expect, test } from '@playwright/test';

async function openChargebackWorkspace(page) {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('button', { name: /Cases/i })
    .click();
  await page.locator('.sky-case-card', { hasText: 'FA-CB-24007' }).click();
  await page.getByRole('button', { name: /Open workspace/i }).last().click();
  await expect(page.getByRole('heading', { name: /investigation workspace/i })).toBeVisible();
}

async function returnToToolMap(page) {
  await page.getByRole('button', { name: 'Back to tool map' }).click();
  await expect(page.getByRole('heading', { name: /investigation workspace/i })).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
}

test('Merchant and document tools open directly with functional Sky workflows', async ({ page }) => {
  await openChargebackWorkspace(page);

  await page.getByRole('button', { name: /Transactions, Merchant & Financial/i }).click();
  await page.getByRole('button', { name: /Merchant Intelligence Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Merchant Intelligence' })).toBeVisible();
  await expect(page.locator('.sky-merchant-profile-card')).toContainText('StreamBox Premium');
  await expect(page.locator('.sky-merchant-transaction-card')).toContainText('TXN-2201');
  await expect(page.locator('.sky-merchant-history-grid')).toContainText('$558.32');
  await expect(page.getByText(/High Risk|Active Merchant|Returning Customer/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await returnToToolMap(page);
  await page.getByRole('button', { name: /Evidence, Links & Workflow/i }).click();
  await page.getByRole('button', { name: /Document Viewer Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Document Viewer' })).toBeVisible();
  await expect(page.locator('.sky-document-focus-strip')).toBeVisible();
  await expect(page.locator('.sky-document-result-rail')).toContainText('DOC-510');
  await expect(page.locator('.sky-document-preview-layout')).toBeVisible();
  await expect(page.locator('.sky-document-sheet')).toContainText('Customer dispute form');
  await page.getByLabel('Search Document Viewer by Account ID or Document ID')
    .fill('DOC-511');
  await expect(page.locator('.sky-document-focus-strip')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await returnToToolMap(page);
  await page.getByRole('button', { name: /Evidence, Links & Workflow/i }).click();
  await page.getByRole('button', { name: /Document Request Open tool/i }).click();
  await expect(page.getByRole('heading', { name: 'Document Request' })).toBeVisible();
  await expect(page.locator('.sky-request-inbox-card')).toBeVisible();
  await page.getByLabel('Search Document Request').fill('DOC-511');
  await page.locator('.sky-document-reference-search').getByRole('button', { name: /Apply filter/i }).click();
  await expect(page.locator('.sky-request-composer')).toContainText('Cancellation confirmation');
  await page.getByLabel('Follow-up due').fill('2026-08-15');
  await page.getByLabel('Request reason').fill('Request the customer-supplied cancellation confirmation.');
  await page.getByRole('button', { name: 'Send Request' }).click();
  await expect(page.locator('.sky-request-history-card')).toContainText('Requested');
  await expect(page.locator('.sky-request-preview-card')).toContainText('No source page attached');
  await page.getByRole('button', { name: 'Check Customer Response' }).click();
  await expect(page.getByRole('button', { name: 'Mark selected response as read' })).toBeVisible();
  await expect(page.locator('.sky-request-preview-card .sky-document-sheet')).toBeVisible();
  await page.getByRole('button', { name: 'Mark selected response as read' }).click();
  await expect(page.locator('.sky-request-inbox-card')).toContainText('All read');
  await expectNoHorizontalOverflow(page);
});
