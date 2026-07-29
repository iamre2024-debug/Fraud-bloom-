import {
  CASE_RELATIONSHIP_DATA_VERSION,
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
  getProductType,
} from './caseDomain.js';

export const RELATIONSHIP_DATA_VERSION = CASE_RELATIONSHIP_DATA_VERSION;

const unavailable = 'Not available in the current training record';

const builtInAccounts = {
  'FA-ATO-24018': [
    {
      accountId: 'ACCT-24018-4410',
      productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: 'checking',
      productLabel: 'Everyday Checking',
      openDate: 'Jul 16, 2018',
      status: 'Open — Good Standing',
      currentBalance: 1100.42,
      availableBalance: 1050.42,
      scheduledPayment: null,
      nextPaymentDueDate: null,
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: '$50.00 card authorization hold',
      isPrimary: true,
    },
    {
      accountId: 'ACCT-24018-1182',
      productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: 'savings',
      productLabel: 'Relationship Savings',
      openDate: 'Aug 2, 2018',
      status: 'Open — Good Standing',
      currentBalance: 12406.11,
      availableBalance: 12406.11,
      scheduledPayment: null,
      nextPaymentDueDate: null,
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: 'None recorded',
    },
    {
      accountId: 'CARD-24018-4410',
      productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: 'debit-card',
      productLabel: 'Debit Card',
      openDate: 'Jul 16, 2018',
      status: 'Active',
      currentBalance: null,
      availableBalance: null,
      scheduledPayment: null,
      nextPaymentDueDate: null,
      paymentStatus: 'Linked to Everyday Checking',
      pastDueAmount: null,
      restrictions: '$2,500 daily purchase limit',
      holds: 'Authorizations are reflected on the linked checking account',
    },
  ],
  'FA-CB-24007': [
    {
      accountId: 'CARD-24007-8841',
      productType: PRODUCT_TYPES.CREDIT_CARD,
      productKind: 'credit-card',
      productLabel: 'Rewards Credit Card',
      openDate: 'Sep 9, 2021',
      status: 'Open — Good Standing',
      currentBalance: 1048.32,
      availableBalance: 7451.68,
      creditLimit: 8500,
      scheduledPayment: 35,
      nextPaymentDueDate: 'Aug 2, 2026',
      paymentStatus: 'Current · autopay enrolled',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: 'None recorded',
      isPrimary: true,
    },
  ],
  'FA-CR-24003': [
    {
      accountId: 'LINE-24003-3011',
      productType: PRODUCT_TYPES.PERSONAL_LOAN,
      productKind: 'revolving-credit-line',
      productLabel: 'Consumer Revolving Credit Line',
      openDate: 'Jul 7, 2026',
      status: 'Open — Review Pending',
      currentBalance: 0,
      availableBalance: 8000,
      creditLimit: 8000,
      scheduledPayment: 0,
      nextPaymentDueDate: 'No payment due before a balance posts',
      paymentStatus: 'No payment history yet',
      pastDueAmount: 0,
      restrictions: 'Usage request remains pending',
      holds: '$2,400.00 requested amount has not been released',
      isPrimary: true,
    },
    {
      accountId: 'ACCT-24003-2044',
      productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: 'checking',
      productLabel: 'Linked Personal Checking',
      openDate: 'Jul 7, 2026',
      status: 'Open — Limited History',
      currentBalance: 3800,
      availableBalance: 3500,
      scheduledPayment: null,
      nextPaymentDueDate: null,
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: '$300.00 ATM activity reflected in available balance',
    },
  ],
};

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 100000, 17);
}

export function moneyNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatMoney(value, fallback = 'Not applicable') {
  if (value === null || value === undefined || value === '') return fallback;
  return `$${moneyNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value, fallback = 'Not applicable') {
  if (value === null || value === undefined || value === '') return fallback;
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

export function maskedAccountId(value) {
  const normalized = String(value ?? '').replace(/[^a-z0-9]/gi, '');
  return normalized ? `••••${normalized.slice(-4)}` : unavailable;
}

export function relationshipLengthFrom(value, asOfYear = 2026) {
  const match = String(value ?? '').match(/\b(19|20)\d{2}\b/);
  if (!match) return unavailable;
  const years = Math.max(0, asOfYear - Number(match[0]));
  if (years === 0) return 'Less than one year';
  return `${years} year${years === 1 ? '' : 's'}`;
}

function accountDate(activeCase, seed, offset = 0, ceilingValue) {
  const relationshipYear = String(activeCase.customer?.relationshipSince ?? '').match(/\b(19|20)\d{2}\b/)?.[0];
  const year = Number(relationshipYear) || 2018 + ((seed + offset) % 7);
  const monthIndex = (seed + offset) % 12;
  const day = 1 + ((seed + offset) % 27);
  let candidate = new Date(Date.UTC(year, monthIndex, day));
  const ceiling = new Date(ceilingValue ?? activeCase.reportedDate ?? activeCase.issueStartDate ?? '');
  if (!Number.isNaN(ceiling.getTime()) && candidate.getTime() > ceiling.getTime()) {
    candidate = new Date(ceiling.getTime());
    candidate.setUTCDate(candidate.getUTCDate() - (7 + (offset * 11)));
    const relationshipStart = new Date(Date.UTC(year, 0, 1));
    if (candidate.getTime() < relationshipStart.getTime()) candidate = relationshipStart;
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(candidate);
}

function evidenceStatus(value, fallback, { allowVerifiedPriorFraud = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (
    allowVerifiedPriorFraud
    && /^Closed\s*[—-]\s*Fraud$/i.test(text)
  ) return text;
  const words = new Set(text.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(/\s+/));
  const statesAConclusion = (
    words.has('fraud')
    && (words.has('confirmed') || words.has('score') || words.has('rule'))
  ) || (
    words.has('accepted')
    && words.has('determination')
  ) || (
    words.has('automatic')
    && words.has('risk')
  );
  return statesAConclusion || /^Closed\s*[—-]\s*Fraud$/i.test(text)
    ? fallback
    : text;
}

function normalizedAccount(record, position = 0) {
  const isPrimary = Boolean(record.isPrimary ?? position === 0);
  const accountId = record.accountId ?? unavailable;
  const destinationId = record.destinationId
    ?? record.destinationAccountId
    ?? accountId;
  const bankCode = record.bankCode
    ?? record.institutionCode
    ?? record.routingCode
    ?? record.routingNumber
    ?? (record.legacyCoverage
      ? unavailable
      : `BANK-${String(stableNumber(accountId)).padStart(5, '0').slice(-5)}`);
  const allowVerifiedPriorFraud = !isPrimary
    && record.statusVerified === true
    && /prior|linked|historical/i.test(record.relationshipRole ?? record.statusSource ?? '');
  return {
    relationshipDataVersion: RELATIONSHIP_DATA_VERSION,
    accountId,
    destinationId,
    maskedAccountId: maskedAccountId(accountId),
    maskedDestinationId: maskedAccountId(destinationId),
    bankCode,
    productType: record.productType,
    productTypeLabel: getProductType(record.productType)?.label ?? record.productType,
    productKind: record.productKind,
    productLabel: record.productLabel,
    openDate: record.openDate ?? unavailable,
    status: evidenceStatus(
      record.status,
      record.legacyCoverage
        ? 'Status not supplied in the preserved relationship record'
        : 'Account status not supplied',
      { allowVerifiedPriorFraud },
    ),
    currentBalance: record.currentBalance ?? null,
    availableBalance: record.availableBalance ?? null,
    availableCredit: record.availableCredit ?? (
      record.creditLimit !== null && record.creditLimit !== undefined
        ? Math.max(0, moneyNumber(record.creditLimit) - moneyNumber(record.currentBalance))
        : null
    ),
    creditLimit: record.creditLimit ?? null,
    originalLoanAmount: record.originalLoanAmount ?? null,
    scheduledPayment: record.scheduledPayment ?? null,
    nextPaymentDueDate: record.nextPaymentDueDate ?? null,
    paymentStatus: evidenceStatus(record.paymentStatus, record.legacyCoverage
      ? 'Payment status not supplied in the preserved relationship record'
      : 'Not applicable'),
    pastDueAmount: record.pastDueAmount ?? null,
    restrictions: evidenceStatus(record.restrictions, record.legacyCoverage
      ? 'Restriction information not supplied in the preserved relationship record'
      : 'None recorded'),
    holds: evidenceStatus(record.holds, record.legacyCoverage
      ? 'Hold information not supplied in the preserved relationship record'
      : 'None recorded'),
    relationshipLimit: record.relationshipLimit ?? null,
    nsfContext: record.nsfContext ?? null,
    repaymentSource: record.repaymentSource ?? null,
    isPrimary,
    legacyCoverage: Boolean(record.legacyCoverage),
    evidenceCoverage: record.evidenceCoverage,
  };
}

function legacyProductKind(productType) {
  const kinds = {
    [PRODUCT_TYPES.CREDIT_CARD]: 'credit-card',
    [PRODUCT_TYPES.DEPOSIT_ACCOUNT]: 'checking',
    [PRODUCT_TYPES.PERSONAL_LOAN]: 'installment-loan',
    [PRODUCT_TYPES.BUSINESS_ACCOUNT]: 'business-checking',
    [PRODUCT_TYPES.PAYROLL_PRODUCT]: 'payroll-account',
    [PRODUCT_TYPES.BUSINESS_CREDIT_CARD]: 'business-credit-card',
    [PRODUCT_TYPES.BUSINESS_LOAN]: 'business-installment-loan',
  };
  return kinds[productType] ?? 'relationship-account';
}

function legacyCoverageAccount(activeCase) {
  const supplied = activeCase.account && typeof activeCase.account === 'object'
    ? activeCase.account
    : {};
  return normalizedAccount({
    accountId: activeCase.accountId ?? supplied.accountId ?? supplied.id,
    destinationId: supplied.destinationId
      ?? supplied.destinationAccountId
      ?? activeCase.destinationId
      ?? activeCase.destinationAccountId,
    bankCode: supplied.bankCode
      ?? supplied.institutionCode
      ?? supplied.routingCode
      ?? supplied.routingNumber
      ?? activeCase.bankCode
      ?? activeCase.institutionCode
      ?? activeCase.routingNumber,
    productType: activeCase.productType,
    productKind: supplied.productKind ?? legacyProductKind(activeCase.productType),
    productLabel: supplied.productLabel
      ?? getProductType(activeCase.productType)?.label
      ?? 'Preserved relationship record',
    openDate: supplied.openDate ?? activeCase.accountOpenDate,
    status: supplied.status ?? activeCase.accountStatus,
    currentBalance: supplied.currentBalance ?? activeCase.currentBalance ?? null,
    availableBalance: supplied.availableBalance ?? activeCase.availableBalance ?? null,
    availableCredit: supplied.availableCredit ?? activeCase.availableCredit ?? null,
    creditLimit: supplied.creditLimit ?? activeCase.creditLimit ?? null,
    originalLoanAmount: supplied.originalLoanAmount ?? activeCase.originalLoanAmount ?? null,
    scheduledPayment: supplied.scheduledPayment ?? activeCase.scheduledPayment ?? null,
    nextPaymentDueDate: supplied.nextPaymentDueDate ?? activeCase.nextPaymentDueDate ?? null,
    paymentStatus: supplied.paymentStatus ?? activeCase.paymentStatus,
    pastDueAmount: supplied.pastDueAmount ?? activeCase.pastDueAmount ?? null,
    restrictions: supplied.restrictions ?? activeCase.restrictions,
    holds: supplied.holds ?? activeCase.holds,
    isPrimary: true,
    legacyCoverage: true,
    evidenceCoverage: 'The saved case did not include a versioned relationship-account snapshot. Only fields already present in that saved record are shown.',
  });
}

function generatedPrimaryAccount(activeCase, seed) {
  const caseAmount = Math.max(500, moneyNumber(activeCase.amount ?? activeCase.amountExposure));
  const credit = activeCase.toolResults?.creditProfile;
  if (activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW) {
    const isBusiness = activeCase.customerType === CUSTOMER_TYPES.BUSINESS;
    const accountId = `${isBusiness ? 'BCHK' : 'PCHK'}-REL-${String(seed).padStart(5, '0')}`;
    const recordedBalance = moneyNumber(credit?.averageBalance);
    const relationshipIsNew = /\b2026\b/.test(String(activeCase.customer?.relationshipSince ?? ''));
    return {
      accountId,
      productType: isBusiness ? PRODUCT_TYPES.BUSINESS_ACCOUNT : PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: isBusiness ? 'business-checking' : 'checking',
      productLabel: isBusiness ? 'Existing Business Operating Checking' : 'Existing Personal Checking',
      openDate: accountDate(activeCase, seed),
      status: relationshipIsNew ? 'Open — Limited History' : 'Open — Good Standing',
      currentBalance: recordedBalance || (isBusiness ? 12500 : 2400),
      availableBalance: recordedBalance || (isBusiness ? 11800 : 2200),
      scheduledPayment: null,
      nextPaymentDueDate: null,
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: 'None recorded',
      isPrimary: true,
    };
  }
  const accountId = activeCase.accountId ?? `ACCT-${String(seed).padStart(5, '0')}`;
  const openDate = accountDate(activeCase, seed);
  const common = {
    accountId,
    productType: activeCase.productType,
    openDate,
    pastDueAmount: 0,
    restrictions: 'None recorded',
    holds: 'None recorded',
    isPrimary: true,
  };

  switch (activeCase.productType) {
    case PRODUCT_TYPES.CREDIT_CARD: {
      const limit = Math.max(2500, moneyNumber(credit?.existingLimit) || caseAmount * 4);
      const balance = Math.min(limit, moneyNumber(credit?.averageBalance) || caseAmount * 0.72);
      return {
        ...common,
        productKind: 'credit-card',
        productLabel: 'Personal Credit Card',
        status: credit?.applicationStatus ?? 'Open — Good Standing',
        currentBalance: balance,
        availableBalance: Math.max(0, limit - balance),
        creditLimit: limit,
        scheduledPayment: Math.max(35, Math.round(balance * 0.03 * 100) / 100),
        nextPaymentDueDate: 'Aug 12, 2026',
        paymentStatus: credit?.paymentHistory ?? 'Current',
        restrictions: activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
          ? 'Application product is not yet open; existing relationship shown'
          : 'None recorded',
      };
    }
    case PRODUCT_TYPES.PERSONAL_LOAN: {
      const originalLoanAmount = Math.max(5000, moneyNumber(credit?.requestedExposure) || caseAmount * 5);
      const balance = Math.max(0, moneyNumber(credit?.averageBalance) || originalLoanAmount * 0.64);
      return {
        ...common,
        productKind: 'installment-loan',
        productLabel: 'Personal Installment Loan',
        status: credit?.applicationStatus ?? 'Open — Current',
        currentBalance: balance,
        originalLoanAmount,
        scheduledPayment: Math.max(125, Math.round(originalLoanAmount / 48 * 100) / 100),
        nextPaymentDueDate: 'Aug 15, 2026',
        paymentStatus: credit?.paymentHistory ?? 'Current',
      };
    }
    case PRODUCT_TYPES.BUSINESS_CREDIT_CARD: {
      const limit = Math.max(10000, moneyNumber(credit?.existingLimit) || caseAmount * 5);
      const balance = Math.min(limit, moneyNumber(credit?.averageBalance) || caseAmount * 1.4);
      return {
        ...common,
        productKind: 'business-credit-card',
        productLabel: 'Business Credit Card',
        status: credit?.applicationStatus ?? 'Open — Good Standing',
        currentBalance: balance,
        availableBalance: Math.max(0, limit - balance),
        creditLimit: limit,
        scheduledPayment: Math.max(125, Math.round(balance * 0.03 * 100) / 100),
        nextPaymentDueDate: 'Aug 18, 2026',
        paymentStatus: credit?.paymentHistory ?? 'Current',
      };
    }
    case PRODUCT_TYPES.BUSINESS_LOAN: {
      const originalLoanAmount = Math.max(15000, moneyNumber(credit?.requestedExposure) || caseAmount * 6);
      const balance = Math.max(0, moneyNumber(credit?.averageBalance) || originalLoanAmount * 0.71);
      return {
        ...common,
        productKind: 'business-installment-loan',
        productLabel: 'Business Installment Loan',
        status: credit?.applicationStatus ?? 'Open — Current',
        currentBalance: balance,
        originalLoanAmount,
        scheduledPayment: Math.max(350, Math.round(originalLoanAmount / 48 * 100) / 100),
        nextPaymentDueDate: 'Aug 20, 2026',
        paymentStatus: credit?.paymentHistory ?? 'Current',
      };
    }
    case PRODUCT_TYPES.PAYROLL_PRODUCT:
      return {
        ...common,
        productKind: 'payroll-account',
        productLabel: 'Payroll Funding Account',
        status: 'Open — Payroll Service Active',
        currentBalance: Math.max(caseAmount * 2.4, 25000),
        availableBalance: Math.max(caseAmount * 2.1, 22000),
        paymentStatus: 'Funding record available',
      };
    case PRODUCT_TYPES.BUSINESS_ACCOUNT:
      return {
        ...common,
        productKind: 'business-checking',
        productLabel: 'Business Operating Checking',
        status: 'Open — Good Standing',
        currentBalance: Math.max(caseAmount * 3.2, 18000),
        availableBalance: Math.max(caseAmount * 3, 16500),
        paymentStatus: 'Not applicable',
      };
    case PRODUCT_TYPES.DEPOSIT_ACCOUNT:
    default:
      return {
        ...common,
        productKind: 'checking',
        productLabel: 'Personal Checking',
        status: 'Open — Good Standing',
        currentBalance: Math.max(caseAmount * 2.2, 2200),
        availableBalance: Math.max(caseAmount * 2, 2000),
        paymentStatus: 'Not applicable',
      };
  }
}

function generatedCompanionAccounts(activeCase, seed, primary) {
  if (activeCase.customerType === CUSTOMER_TYPES.BUSINESS) {
    if (primary.productKind === 'business-checking') {
      return [{
        accountId: `BSAVE-${String(seed).padStart(5, '0')}`,
        productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
        productKind: 'business-savings',
        productLabel: 'Business Reserve Savings',
        openDate: accountDate(activeCase, seed, 2, primary.openDate),
        status: 'Open — Good Standing',
        currentBalance: Math.max(8200, moneyNumber(primary.currentBalance) * 0.76),
        availableBalance: Math.max(8200, moneyNumber(primary.availableBalance) * 0.76),
        paymentStatus: 'Not applicable',
        pastDueAmount: 0,
        restrictions: 'None recorded',
        holds: 'None recorded',
      }];
    }
    return [{
      accountId: `BCHK-${String(seed).padStart(5, '0')}`,
      productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
      productKind: 'business-checking',
      productLabel: 'Business Operating Checking',
      openDate: accountDate(activeCase, seed, 2, primary.openDate),
      status: 'Open — Good Standing',
      currentBalance: Math.max(12500, moneyNumber(primary.currentBalance) * 1.25),
      availableBalance: Math.max(11800, moneyNumber(primary.currentBalance) * 1.18),
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: 'None recorded',
    }];
  }

  if (primary.productKind === 'checking') {
    return [{
      accountId: `SAVE-${String(seed).padStart(5, '0')}`,
      productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
      productKind: 'savings',
      productLabel: 'Personal Savings',
      openDate: accountDate(activeCase, seed, 3, primary.openDate),
      status: 'Open — Good Standing',
      currentBalance: Math.max(3100, moneyNumber(primary.currentBalance) * 0.82),
      availableBalance: Math.max(3100, moneyNumber(primary.availableBalance) * 0.82),
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: 'None recorded',
    }];
  }

  return [{
    accountId: `PCHK-${String(seed).padStart(5, '0')}`,
    productType: PRODUCT_TYPES.DEPOSIT_ACCOUNT,
    productKind: 'checking',
    productLabel: 'Personal Checking',
    openDate: accountDate(activeCase, seed, 4, primary.openDate),
    status: 'Open — Good Standing',
    currentBalance: Math.max(2400, moneyNumber(primary.currentBalance) * 0.46),
    availableBalance: Math.max(2200, moneyNumber(primary.currentBalance) * 0.42),
    paymentStatus: 'Not applicable',
    pastDueAmount: 0,
    restrictions: 'None recorded',
    holds: 'None recorded',
  }];
}

export function getRelationshipAccounts(activeCase = {}) {
  const snapshot = activeCase.toolResults?.relationshipAccounts ?? activeCase.relationshipAccounts;
  if (Array.isArray(snapshot) && snapshot.length) return snapshot.map(normalizedAccount);
  const preset = builtInAccounts[activeCase.id];
  if (preset) return preset.map(normalizedAccount);
  if (activeCase.legacyDerivedEvidence === true) return [legacyCoverageAccount(activeCase)];
  const seed = stableNumber(activeCase.id);
  const primary = generatedPrimaryAccount(activeCase, seed);
  return [primary, ...generatedCompanionAccounts(activeCase, seed, primary)].map(normalizedAccount);
}

export function getPrimaryRelationshipAccount(activeCase = {}) {
  const accounts = getRelationshipAccounts(activeCase);
  return accounts.find((account) => account.isPrimary) ?? accounts[0];
}

export function isSpendingProduct(account = {}) {
  return ['checking', 'business-checking', 'credit-card', 'business-credit-card', 'revolving-credit-line'].includes(account.productKind);
}

export function isCreditOrLoanProduct(account = {}) {
  return ['credit-card', 'business-credit-card', 'revolving-credit-line', 'installment-loan', 'business-installment-loan'].includes(account.productKind);
}

export function isInstallmentLoan(account = {}) {
  return ['installment-loan', 'business-installment-loan'].includes(account.productKind);
}
