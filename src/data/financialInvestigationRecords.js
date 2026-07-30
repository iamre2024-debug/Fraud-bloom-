import { getFinancialRecords } from './caseToolData.js';
import {
  CUSTOMER_TYPES,
  PRODUCT_TYPES,
  WORKFLOW_TYPES,
  caseDomainLabels,
} from './caseDomain.js';
import { getPayrollHistory } from './businessPayrollWorkspace.js';
import {
  RELATIONSHIP_DATA_VERSION,
  formatMoney,
  formatPercent,
  getPrimaryRelationshipAccount,
  getRelationshipAccounts,
  isCreditOrLoanProduct,
  isInstallmentLoan,
  isSpendingProduct,
  moneyNumber,
  relationshipLengthFrom,
} from './relationshipAccounts.js';
import {
  containsHiddenAnswer,
  publicCaseTaxonomy,
} from './publicCaseView.js';

export const FINANCIAL_INVESTIGATION_DATA_VERSION = 2;

const unavailable = 'Not supplied in the current training record';

const sectionDefinitions = Object.freeze({
  'account-review': Object.freeze({
    id: 'account-review',
    label: 'Account Review',
    question: 'What products, balances, standing, restrictions, and payment terms are recorded?',
  }),
  comparisons: Object.freeze({
    id: 'comparisons',
    label: 'Current vs Historical',
    question: 'How do the current records compare with the dated history in this case packet?',
  }),
  spending: Object.freeze({
    id: 'spending',
    label: 'Spending Analysis',
    question: 'Which recorded outflows make up the visible period total?',
  }),
  deposits: Object.freeze({
    id: 'deposits',
    label: 'Personal Deposit Analysis',
    question: 'Which incoming entries are recorded for this personal deposit relationship?',
  }),
  payments: Object.freeze({
    id: 'payments',
    label: 'Credit & Loan Payments',
    question: 'What balance, payment schedule, due date, and payment history are recorded?',
  }),
  payroll: Object.freeze({
    id: 'payroll',
    label: 'Business Payroll Analysis',
    question: 'What monthly and pay-period payroll totals are supported by Payroll History?',
  }),
});

// Compatibility export for callers that import the former static tab list. The
// workspace itself uses the case-specific `sections` returned below.
export const financialInvestigationTabs = Object.freeze([
  sectionDefinitions['account-review'],
  sectionDefinitions.comparisons,
  sectionDefinitions.spending,
  sectionDefinitions.deposits,
  sectionDefinitions.payments,
  sectionDefinitions.payroll,
]);

const spendingProducts = new Set([
  PRODUCT_TYPES.CREDIT_CARD,
  PRODUCT_TYPES.DEPOSIT_ACCOUNT,
  PRODUCT_TYPES.BUSINESS_ACCOUNT,
  PRODUCT_TYPES.BUSINESS_CREDIT_CARD,
]);

const payrollWorkflows = new Set([
  WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT,
  WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER,
]);

const builtInPersonalDeposits = Object.freeze({
  'FA-ATO-24018': Object.freeze([
    Object.freeze({
      id: 'DEP-1001',
      title: 'Payroll deposit',
      amount: 2941.05,
      observed: 'Jul 5, 2026',
      channel: 'ACH credit',
      detail: 'Training employer payroll deposit recorded in the supplied account history.',
    }),
    Object.freeze({
      id: 'DEP-1002',
      title: 'Payroll deposit',
      amount: 2941.05,
      observed: 'Jun 20, 2026',
      channel: 'ACH credit',
      detail: 'Earlier payroll deposit supplied for amount and timing comparison.',
    }),
    Object.freeze({
      id: 'DEP-1003',
      title: 'Savings transfer',
      amount: 960,
      observed: 'Jun 14, 2026',
      channel: 'Internal transfer',
      detail: 'Incoming transfer from the separately listed savings relationship.',
    }),
  ]),
});

const builtInPaymentHistory = Object.freeze({
  'FA-CB-24007': Object.freeze([
    Object.freeze({
      id: 'PMT-2201',
      paymentDate: 'Jul 2, 2026',
      scheduledAmount: 35,
      actualPaid: 650,
      status: 'Posted',
      source: 'Established checking destination',
      balanceAfter: 1048.32,
    }),
    Object.freeze({
      id: 'PMT-2202',
      paymentDate: 'Jun 2, 2026',
      scheduledAmount: 35,
      actualPaid: 650,
      status: 'Posted',
      source: 'Established checking destination',
      balanceAfter: 1698.32,
    }),
  ]),
});

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  if (!normalized || normalized === '-' || normalized === '.') return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function countOrNull(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.max(0, Math.round(parsed));
}

function safeEvidenceText(value, fallback = unavailable) {
  const text = String(value ?? '').trim();
  if (!text || containsHiddenAnswer(text)) {
    return fallback;
  }
  return text;
}

function getSuppliedFinancialRecords(activeCase) {
  const source = getFinancialRecords(activeCase);
  const isGeneratedSnapshot = activeCase.generatedPacketVersion !== undefined
    || activeCase.legacyDerivedEvidence !== undefined;
  if (!isGeneratedSnapshot) return source;

  // caseToolData provides display fallbacks when a generated packet omits a
  // collection. Financial Investigation must distinguish those placeholders
  // from persisted evidence so migrated/worked cases receive an explicit
  // coverage gap instead of a newly synthesized transaction or payment row.
  const persisted = activeCase.toolResults ?? {};
  return {
    ...source,
    transactions: Array.isArray(persisted.transactions) ? persisted.transactions : [],
    financialIntel: Array.isArray(persisted.financialIntel) ? persisted.financialIntel : [],
    paymentVerification: Array.isArray(persisted.paymentVerification)
      ? (persisted.paymentVerification.length ? source.paymentVerification : [])
      : [],
  };
}

function dateObject(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getTime());
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(value) {
  const parsed = dateObject(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

function displayDate(value) {
  const parsed = dateObject(value);
  if (!parsed) return safeEvidenceText(value);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function displayDateRange(startDate, endDate) {
  if (!startDate || !endDate) return unavailable;
  if (startDate === endDate) return displayDate(startDate);
  return `${displayDate(startDate)} – ${displayDate(endDate)}`;
}

function periodRange(value, fallbackValue, labelPrefix = '') {
  const resolved = isoDate(value) ?? isoDate(fallbackValue);
  const suppliedLabel = safeEvidenceText(value, '');
  const rangeLabel = resolved ? displayDateRange(resolved, resolved) : suppliedLabel || unavailable;
  return {
    startDate: resolved ?? unavailable,
    endDate: resolved ?? unavailable,
    label: `${labelPrefix}${labelPrefix ? ' · ' : ''}${rangeLabel}`,
  };
}

function monthRange(value, fallbackValue) {
  const parsed = dateObject(value) ?? dateObject(fallbackValue);
  if (!parsed) return periodRange(value, fallbackValue, 'Payroll month');
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    id: `${year}-${String(month + 1).padStart(2, '0')}`,
    startDate: isoDate(start),
    endDate: isoDate(end),
    label: new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start),
  };
}

function unionPeriodRanges(records = [], fallbackValue, labelPrefix) {
  const dates = records
    .flatMap((record) => [record.periodRange?.startDate, record.periodRange?.endDate])
    .map(dateObject)
    .filter(Boolean)
    .sort((left, right) => left - right);
  if (!dates.length) return periodRange(fallbackValue, fallbackValue, labelPrefix);
  const startDate = isoDate(dates[0]);
  const endDate = isoDate(dates[dates.length - 1]);
  return {
    startDate,
    endDate,
    label: `${labelPrefix}${labelPrefix ? ' · ' : ''}${displayDateRange(startDate, endDate)}`,
  };
}

function previousPeriod(range, days = 30, labelPrefix = 'Available history') {
  const currentStart = dateObject(range?.startDate);
  if (!currentStart) return periodRange(null, null, labelPrefix);
  const end = new Date(currentStart.getTime() - (24 * 60 * 60 * 1000));
  const start = new Date(end.getTime() - ((days - 1) * 24 * 60 * 60 * 1000));
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  return {
    startDate,
    endDate,
    label: `${labelPrefix} · ${displayDateRange(startDate, endDate)}`,
  };
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function createRecord({
  id,
  title,
  category,
  value,
  observed,
  status,
  detail,
  fields = [],
  supportRecordIds = [],
  recordPeriod,
  ...extra
}) {
  const explicitPeriod = recordPeriod ?? periodRange(observed, observed);
  const relatedRecords = unique(supportRecordIds);
  return {
    id,
    title: safeEvidenceText(title, 'Financial record'),
    category: safeEvidenceText(category, 'Financial record'),
    value,
    observed: safeEvidenceText(observed, explicitPeriod.label),
    status: safeEvidenceText(status, 'Record available'),
    detail: safeEvidenceText(detail, 'The supplied financial record is available for comparison.'),
    fields: fields.filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined && fieldValue !== ''),
    period: explicitPeriod.label,
    periodRange: explicitPeriod,
    supportRecordIds: relatedRecords,
    relatedRecords,
    ...extra,
  };
}

function bucketPeriodFor(value, granularity) {
  const parsed = dateObject(value);
  if (!parsed) return null;
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();
  let start = new Date(Date.UTC(year, month, day));
  let end = new Date(start.getTime());
  if (granularity === 'week') {
    const mondayOffset = (start.getUTCDay() + 6) % 7;
    start = new Date(start.getTime() - (mondayOffset * 24 * 60 * 60 * 1000));
    end = new Date(start.getTime() + (6 * 24 * 60 * 60 * 1000));
  } else if (granularity === 'month') {
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month + 1, 0));
  }
  const startDate = isoDate(start);
  const endDate = isoDate(end);
  const label = granularity === 'month'
    ? new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(start)
    : displayDateRange(startDate, endDate);
  return {
    id: `${granularity}-${startDate}`,
    granularity,
    startDate,
    endDate,
    label,
  };
}

function namedTotals(records, keySelector) {
  const grouped = new Map();
  for (const record of records) {
    const label = safeEvidenceText(keySelector(record), 'Unclassified');
    const current = grouped.get(label) ?? { label, total: 0, count: 0, supportRecordIds: [] };
    current.total = roundMoney(current.total + (record.amountValue ?? 0));
    current.count += 1;
    current.supportRecordIds.push(record.id);
    grouped.set(label, current);
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      totalDisplay: formatMoney(item.total),
      supportRecordIds: unique(item.supportRecordIds),
    }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
}

function summarizeBucket(records, bucket) {
  const visibleTotal = roundMoney(records.reduce((sum, record) => sum + (record.amountValue ?? 0), 0));
  const transactionCount = records.length;
  const average = transactionCount ? roundMoney(visibleTotal / transactionCount) : 0;
  const largestTransactions = [...records]
    .sort((left, right) => (right.amountValue ?? 0) - (left.amountValue ?? 0))
    .slice(0, 5)
    .map((record) => ({
      id: record.id,
      title: record.title,
      amount: record.amountValue,
      amountDisplay: formatMoney(record.amountValue),
      date: record.periodRange.startDate,
    }));
  const categoryTotals = namedTotals(records, (record) => record.analysisCategory ?? record.category);
  const merchantTotals = namedTotals(records, (record) => record.counterparty ?? record.title);
  const repeatedMerchants = merchantTotals
    .filter((item) => item.count > 1)
    .map((item) => ({
      merchant: item.label,
      count: item.count,
      total: item.total,
      totalDisplay: item.totalDisplay,
      supportRecordIds: item.supportRecordIds,
    }));
  return {
    ...bucket,
    visibleTotal,
    visibleTotalDisplay: formatMoney(visibleTotal),
    total: visibleTotal,
    totalDisplay: formatMoney(visibleTotal),
    transactionCount,
    average,
    averageDisplay: formatMoney(average),
    largestTransactions,
    categoryTotals,
    merchantTotals,
    repeatedMerchants,
    repeatedMerchantCount: repeatedMerchants.length,
    returnedEntryCount: records.filter((record) => record.returnedOrReversed).length,
    supportRecordIds: unique(records.flatMap((record) => record.supportRecordIds)),
  };
}

function buildDateAggregations(records = [], expectedTotal = null) {
  const result = {};
  for (const granularity of ['day', 'week', 'month']) {
    const groups = new Map();
    for (const record of records) {
      const bucket = bucketPeriodFor(record.periodRange?.startDate, granularity);
      if (!bucket) continue;
      const group = groups.get(bucket.id) ?? { bucket, records: [] };
      group.records.push(record);
      groups.set(bucket.id, group);
    }
    const buckets = [...groups.values()]
      .map(({ bucket, records: bucketRecords }) => summarizeBucket(bucketRecords, bucket))
      .sort((left, right) => right.startDate.localeCompare(left.startDate));
    const total = roundMoney(buckets.reduce((sum, bucket) => sum + bucket.visibleTotal, 0));
    if (expectedTotal !== null && total !== roundMoney(expectedTotal)) {
      throw new RangeError(`Financial ${granularity} buckets do not reconcile`);
    }
    result[granularity] = buckets;
  }
  return result;
}

function formatTypedValue(value, valueType) {
  if (valueType === 'currency') return formatMoney(value);
  if (valueType === 'percent') return formatPercent(value);
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function createComparison({
  id,
  label,
  valueType,
  baseline,
  current,
  baselinePeriod,
  currentPeriod,
  explanation,
  supportRecordIds,
}) {
  const baselineValue = Number(baseline) || 0;
  const currentValue = Number(current) || 0;
  if (baselineValue === 0 && currentValue === 0) return null;
  const baselineDisplay = formatTypedValue(baselineValue, valueType);
  const currentDisplay = formatTypedValue(currentValue, valueType);
  const delta = roundMoney(currentValue - baselineValue);
  const deltaDisplay = formatTypedValue(delta, valueType);
  return {
    id,
    label,
    valueType,
    format: valueType,
    unit: valueType,
    baseline: baselineValue,
    current: currentValue,
    baselineValue,
    currentValue,
    baselineDisplay,
    currentDisplay,
    baselineDateRange: baselinePeriod.label,
    currentDateRange: currentPeriod.label,
    baselinePeriod,
    currentPeriod,
    baselineMetric: {
      value: baselineValue,
      display: baselineDisplay,
      dateRange: baselinePeriod.label,
    },
    currentMetric: {
      value: currentValue,
      display: currentDisplay,
      dateRange: currentPeriod.label,
    },
    delta,
    deltaDisplay,
    explanation,
    supportRecordIds: unique(supportRecordIds),
  };
}

function accountFields(account, activeCase, isPrimary) {
  const fields = [
    ['Account ID', account.accountId],
    ['Masked account', account.maskedAccountId],
    ['Product', account.productTypeLabel],
    ['Product detail', account.productLabel],
    ['Opened', account.openDate],
    ['Status', account.status],
  ];
  const creditOrRevolving = ['credit-card', 'business-credit-card', 'revolving-credit-line']
    .includes(account.productKind);
  const installment = ['installment-loan', 'business-installment-loan'].includes(account.productKind);
  const depositOrFunding = ['checking', 'savings', 'business-checking', 'business-savings', 'payroll-account']
    .includes(account.productKind);
  if (account.currentBalance !== null) {
    fields.push([installment ? 'Remaining balance' : 'Current balance', formatMoney(account.currentBalance)]);
  }
  if (depositOrFunding) {
    fields.push(['Available balance', account.availableBalance === null ? unavailable : formatMoney(account.availableBalance)]);
  }
  if (creditOrRevolving) {
    const utilization = account.creditLimit > 0 && account.currentBalance !== null
      ? (account.currentBalance / account.creditLimit) * 100
      : null;
    fields.push(
      ['Available credit', account.availableCredit === null ? unavailable : formatMoney(account.availableCredit)],
      ['Credit limit', account.creditLimit === null ? unavailable : formatMoney(account.creditLimit)],
      ['Utilization', utilization === null ? unavailable : formatPercent(utilization)],
    );
  }
  if (installment) {
    fields.push(['Original principal', account.originalLoanAmount === null ? unavailable : formatMoney(account.originalLoanAmount)]);
  }
  if (creditOrRevolving || installment) {
    fields.push(
      ['Scheduled / minimum payment', account.scheduledPayment === null ? unavailable : formatMoney(account.scheduledPayment)],
      ['Next payment due', account.nextPaymentDueDate ?? unavailable],
      ['Payment status', account.paymentStatus],
      ['Past-due amount', account.pastDueAmount === null ? unavailable : formatMoney(account.pastDueAmount)],
    );
  }
  fields.push(
    ['Restrictions', account.restrictions],
    ['Holds', account.holds],
  );
  if (account.legacyCoverage) fields.push(['Evidence coverage', account.evidenceCoverage]);
  const caseAmount = numberOrNull(activeCase.amountExposure ?? activeCase.amount);
  if (isPrimary && caseAmount !== null) {
    fields.push(['Case amount / exposure', formatMoney(caseAmount)]);
  }
  return fields;
}

function buildAccountRecords(activeCase, accounts, asOfValue) {
  return accounts.map((account) => createRecord({
    id: `${activeCase.id}-FIN-ACCOUNT-${account.accountId}`,
    title: `${account.productLabel} ${account.maskedAccountId}`,
    category: account.productTypeLabel,
    value: account.currentBalance === null ? account.status : formatMoney(account.currentBalance),
    observed: asOfValue,
    status: account.status,
    detail: 'This relationship snapshot uses the shared account record shown across the investigation workspaces.',
    fields: accountFields(account, activeCase, account.isPrimary),
    supportRecordIds: [account.accountId],
    recordPeriod: periodRange(asOfValue, asOfValue, 'Account snapshot'),
    accountId: account.accountId,
  }));
}

function sanitizedCreditProfile(activeCase) {
  const credit = activeCase.toolResults?.creditProfile;
  if (!credit) return null;
  return {
    relationshipStage: safeEvidenceText(credit.relationshipStage),
    subject: safeEvidenceText(credit.subject, activeCase.person ?? 'Case subject'),
    applicationStatus: safeEvidenceText(credit.applicationStatus, 'Review open'),
    requestedExposure: credit.requestedExposure ?? unavailable,
    statedAnnualIncome: credit.statedAnnualIncome ?? unavailable,
    verifiedAnnualIncome: credit.verifiedAnnualIncome ?? unavailable,
    averageMonthlyDeposits: credit.averageMonthlyDeposits ?? unavailable,
    averageMonthlyOutflow: credit.averageMonthlyOutflow ?? unavailable,
    averageBalance: credit.averageBalance ?? unavailable,
    dti: credit.dti ?? unavailable,
    utilization: credit.utilization ?? unavailable,
    paymentHistory: safeEvidenceText(credit.paymentHistory),
    overdrafts: countOrNull(credit.overdrafts),
    nsfReturns: countOrNull(credit.nsfReturns),
    completedDocuments: (credit.completedDocuments ?? []).map((item) => safeEvidenceText(item)).filter(Boolean),
    missingDocuments: (credit.missingDocuments ?? []).map((item) => safeEvidenceText(item)).filter(Boolean),
    employerOrBusiness: safeEvidenceText(credit.employerOrBusiness),
    incomeSource: safeEvidenceText(credit.incomeSource),
    term: safeEvidenceText(credit.term ?? credit.loanTerm, unavailable),
    apr: safeEvidenceText(credit.apr ?? credit.interestRate ?? credit.rate, unavailable),
  };
}

function creditEvidenceRecord(activeCase, credit, asOfValue, supportRecordIds) {
  if (!credit) return null;
  const business = activeCase.customerType === CUSTOMER_TYPES.BUSINESS;
  return createRecord({
    id: `${activeCase.id}-CREDIT-PROFILE`,
    title: activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
      ? 'Credit application evidence'
      : 'Existing credit relationship evidence',
    category: activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
      ? 'Origination records'
      : 'Servicing and repayment records',
    value: credit.requestedExposure,
    observed: asOfValue,
    status: credit.applicationStatus,
    detail: 'The values below are source-record facts for the selected review workflow and are presented without an outcome.',
    fields: [
      ['Relationship stage', credit.relationshipStage],
      ['Subject', credit.subject],
      ['Requested exposure', credit.requestedExposure],
      [business ? 'Stated annual revenue' : 'Stated annual income', credit.statedAnnualIncome],
      [business ? 'Verified annual revenue' : 'Verified annual income', credit.verifiedAnnualIncome],
      ['Recorded source', credit.incomeSource],
      ['Employer / business', credit.employerOrBusiness],
      ['Average monthly deposits', credit.averageMonthlyDeposits],
      ['Average monthly outflow', credit.averageMonthlyOutflow],
      ['Average balance', credit.averageBalance],
      ...(!business ? [['Debt-to-income', credit.dti]] : []),
      ['Utilization', credit.utilization],
      ['Payment history', credit.paymentHistory],
      ['Overdraft count', credit.overdrafts ?? unavailable],
      ['NSF / returned-payment count', credit.nsfReturns ?? unavailable],
      ['Documents available', credit.completedDocuments.join(', ') || 'None listed'],
      ['Documents still requested', credit.missingDocuments.join(', ') || 'None listed'],
    ],
    supportRecordIds,
    recordPeriod: periodRange(asOfValue, asOfValue, 'Credit record snapshot'),
  });
}

function isIncomingTransaction(item = {}) {
  const classification = [
    item.direction,
    item.type,
    item.transactionType,
    item.entryType,
    item.channel,
    item.category,
  ].filter(Boolean).join(' ');
  return /(?:incoming funds?|incoming transfer|deposit|ach credit|payroll credit|direct deposit|credit entry|posted credit)/i
    .test(classification);
}

function isCreditOrLoanPaymentTransaction(item = {}) {
  return /(?:scheduled payment|minimum payment|card payment|credit payment|loan payment|installment payment|line repayment|account repayment|monthly repayment)/i
    .test(`${item.channel ?? ''} ${item.category ?? ''} ${item.merchant ?? ''}`);
}

function spendingRecordFromTransaction(activeCase, item, index, asOfValue, paymentRecords) {
  const amount = numberOrNull(item.amount);
  if (
    amount === null
    || amount <= 0
    || isIncomingTransaction(item)
    || isCreditOrLoanPaymentTransaction(item)
  ) return null;
  const observed = item.posted ?? asOfValue;
  const relatedPaymentIds = paymentRecords
    .filter((record) => record.relatedRecords?.includes(item.id))
    .map((record) => record.id);
  const counterparty = safeEvidenceText(item.merchant, 'Recorded account activity');
  const analysisCategory = safeEvidenceText(item.category ?? item.channel, 'Account activity');
  return createRecord({
    id: item.id ?? `${activeCase.id}-FIN-SPEND-${index + 1}`,
    title: counterparty,
    category: analysisCategory,
    value: formatMoney(amount),
    observed,
    status: safeEvidenceText(item.status, 'Record available'),
    detail: 'This entry is displayed as a recorded outflow for period reconciliation; its presence does not establish who initiated it.',
    fields: [
      ['Amount', formatMoney(amount)],
      ['Instrument / account', safeEvidenceText(item.instrument)],
      ['Channel', safeEvidenceText(item.channel)],
      ['Status', safeEvidenceText(item.status)],
      ['Observed', safeEvidenceText(`${item.posted ?? ''} ${item.time ?? ''}`.trim(), displayDate(observed))],
    ],
    supportRecordIds: [item.id, ...relatedPaymentIds],
    recordPeriod: periodRange(observed, asOfValue, index === 0 ? 'Current record' : 'Available history'),
    amountValue: amount,
    counterparty,
    analysisCategory,
  });
}

function buildSpending(activeCase, source, primaryAccount, asOfValue) {
  if (activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
    || isInstallmentLoan(primaryAccount)
    || (!spendingProducts.has(activeCase.productType) && !isSpendingProduct(primaryAccount))) {
    return {
      records: [],
      visibleTotal: 0,
      knownRemainder: 0,
      periodOutflow: 0,
      visibleTotalDisplay: formatMoney(0),
      knownRemainderDisplay: formatMoney(0),
      periodOutflowDisplay: formatMoney(0),
      periodRange: periodRange(asOfValue, asOfValue, 'Current supplied period'),
      supportRecordIds: [],
      transactionCount: 0,
      averageTransaction: 0,
      averageTransactionDisplay: formatMoney(0),
      largestTransactions: [],
      categoryTotals: [],
      merchantTotals: [],
      vendorTotals: [],
      repeatedMerchants: [],
      repeatedMerchantCount: 0,
      aggregations: { day: [], week: [], month: [] },
      granularityOptions: ['day', 'week', 'month'],
    };
  }

  const records = (source.transactions ?? [])
    .map((item, index) => spendingRecordFromTransaction(
      activeCase,
      item,
      index,
      asOfValue,
      source.paymentVerification ?? [],
    ))
    .filter(Boolean);
  const visibleTotal = roundMoney(records.reduce((sum, record) => sum + record.amountValue, 0));
  const statedOutflow = numberOrNull(activeCase.toolResults?.creditProfile?.averageMonthlyOutflow);
  const periodOutflow = roundMoney(Math.max(visibleTotal, statedOutflow ?? visibleTotal));
  const knownRemainder = roundMoney(periodOutflow - visibleTotal);
  const range = unionPeriodRanges(records, asOfValue, 'Supplied activity');
  const supportRecordIds = unique(records.flatMap((record) => record.supportRecordIds));
  const summary = summarizeBucket(records, {
    id: 'all-supplied-spending',
    granularity: 'all',
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
  });
  const aggregations = buildDateAggregations(records, visibleTotal);

  return {
    records,
    visibleTotal,
    knownRemainder,
    periodOutflow,
    visibleTotalDisplay: formatMoney(visibleTotal),
    knownRemainderDisplay: formatMoney(knownRemainder),
    periodOutflowDisplay: formatMoney(periodOutflow),
    periodRange: range,
    explanation: knownRemainder > 0
      ? 'The period total includes the visible transaction records plus a grouped remainder from the supplied cash-flow summary.'
      : 'The visible transaction records reconcile to the period outflow shown in this workspace.',
    supportRecordIds,
    transactionCount: summary.transactionCount,
    averageTransaction: summary.average,
    averageTransactionDisplay: summary.averageDisplay,
    largestTransactions: summary.largestTransactions,
    categoryTotals: summary.categoryTotals,
    merchantTotals: summary.merchantTotals,
    vendorTotals: summary.merchantTotals,
    repeatedMerchants: summary.repeatedMerchants,
    repeatedMerchantCount: summary.repeatedMerchantCount,
    aggregations,
    granularityOptions: ['day', 'week', 'month'],
  };
}

function buildDepositRecords(activeCase, source, primaryAccount, asOfValue) {
  if (activeCase.customerType !== CUSTOMER_TYPES.PERSONAL
    || activeCase.productType !== PRODUCT_TYPES.DEPOSIT_ACCOUNT) return [];

  const preset = builtInPersonalDeposits[activeCase.id];
  if (preset) {
    return classifyDepositRecords(preset.map((item, index) => createRecord({
      id: item.id,
      title: item.title,
      category: 'Incoming funds',
      value: formatMoney(item.amount),
      observed: item.observed,
      status: item.channel,
      detail: item.detail,
      fields: [
        ['Amount', formatMoney(item.amount)],
        ['Entry type', item.title],
        ['Channel', item.channel],
        ['Observed', item.observed],
      ],
      supportRecordIds: [item.id],
      recordPeriod: periodRange(item.observed, asOfValue, index === 0 ? 'Current record' : 'Available history'),
      amountValue: item.amount,
      depositSource: item.channel,
      depositType: item.title,
    })));
  }

  const persistedDeposits = activeCase.toolResults?.depositHistory;
  if (Array.isArray(persistedDeposits) && persistedDeposits.length) {
    return classifyDepositRecords(persistedDeposits.map((item) => {
      const amount = numberOrNull(item.amount);
      return createRecord({
        id: item.id,
        title: safeEvidenceText(item.title ?? item.depositType, 'Incoming account entry'),
        category: 'Incoming funds',
        value: amount === null ? unavailable : formatMoney(amount),
        observed: item.observed ?? item.posted ?? asOfValue,
        status: safeEvidenceText(item.status ?? item.channel, 'Incoming entry'),
        detail: safeEvidenceText(
          item.detail,
          'This incoming entry was persisted with the generated training packet.',
        ),
        fields: [
          ['Amount', amount === null ? unavailable : formatMoney(amount)],
          ['Source', safeEvidenceText(item.source ?? item.depositSource)],
          ['Type', safeEvidenceText(item.depositType ?? item.channel)],
          ['Observed', displayDate(item.observed ?? item.posted ?? asOfValue)],
          ['Posting status', safeEvidenceText(item.status)],
        ],
        supportRecordIds: [item.id],
        recordPeriod: periodRange(item.observed ?? item.posted, asOfValue),
        amountValue: amount,
        depositSource: safeEvidenceText(item.source ?? item.depositSource),
        depositType: safeEvidenceText(item.depositType ?? item.title),
      });
    }));
  }

  const incomingTransactions = (source.transactions ?? []).filter((item) => (
    isIncomingTransaction(item)
    && !/destination change|destination activity/i.test(`${item.channel ?? ''} ${item.merchant ?? ''}`)
  ));
  const records = incomingTransactions.map((item, index) => {
    const amount = numberOrNull(item.amount) ?? 0;
    return createRecord({
      id: item.id ?? `${activeCase.id}-FIN-DEP-${index + 1}`,
      title: safeEvidenceText(item.merchant, 'Incoming account entry'),
      category: 'Incoming funds',
      value: formatMoney(amount),
      observed: item.posted ?? asOfValue,
      status: safeEvidenceText(item.channel, 'Incoming entry'),
      detail: 'The supplied account record classifies this entry as incoming funds.',
      fields: [
        ['Amount', formatMoney(amount)],
        ['Channel', safeEvidenceText(item.channel)],
        ['Instrument / account', safeEvidenceText(item.instrument)],
        ['Observed', safeEvidenceText(`${item.posted ?? ''} ${item.time ?? ''}`.trim(), displayDate(asOfValue))],
      ],
      supportRecordIds: [item.id],
      recordPeriod: periodRange(item.posted, asOfValue, index === 0 ? 'Current record' : 'Available history'),
      amountValue: amount,
      depositSource: safeEvidenceText(item.instrument ?? item.channel, 'Incoming account source'),
      depositType: safeEvidenceText(item.channel, 'Incoming entry'),
    });
  });

  if (records.length) return classifyDepositRecords(records);
  return classifyDepositRecords([createRecord({
    id: `${activeCase.id}-FIN-DEPOSIT-COVERAGE`,
    title: 'Deposit-record coverage',
    category: 'Source inventory',
    value: 'No separately classified deposit entry supplied',
    observed: asOfValue,
    status: 'Source scope recorded',
    detail: 'The case packet contains a personal deposit relationship but no separately classified incoming entry in Financial Investigation.',
    fields: [
      ['Customer type', 'Personal'],
      ['Product', 'Deposit account'],
      ['Deposit entries supplied', '0'],
      ['Related source', 'Transaction History'],
    ],
    supportRecordIds: (source.transactions ?? []).map((item) => item.id),
    recordPeriod: periodRange(asOfValue, asOfValue, 'Current source inventory'),
    amountValue: null,
    depositSource: unavailable,
    depositType: 'Coverage record',
  })]);
}

function classifyDepositRecords(records) {
  const frequencies = new Map();
  for (const record of records) {
    if (!Number.isFinite(record.amountValue)) continue;
    const key = `${record.depositType ?? record.title}|${record.depositSource ?? record.status}`.toLowerCase();
    frequencies.set(key, (frequencies.get(key) ?? 0) + 1);
  }
  return records.map((record) => {
    const key = `${record.depositType ?? record.title}|${record.depositSource ?? record.status}`.toLowerCase();
    const repeated = (frequencies.get(key) ?? 0) > 1;
    const returnedOrReversed = /(?:return|reversal|reversed)/i.test(
      `${record.title} ${record.status} ${record.detail}`,
    );
    const regularity = Number.isFinite(record.amountValue)
      ? repeated ? 'Regular in the supplied entries' : 'Irregular / one-time in the supplied entries'
      : 'Not classified because no deposit entry was supplied';
    const existingLabels = new Set(record.fields.map(([label]) => label));
    return {
      ...record,
      analysisCategory: record.depositType ?? record.title,
      counterparty: record.depositSource ?? record.status,
      depositSource: record.depositSource ?? record.status,
      depositType: record.depositType ?? record.title,
      regularity,
      returnedOrReversed,
      fields: [
        ...record.fields,
        ...(!existingLabels.has('Source') ? [['Source', record.depositSource ?? record.status]] : []),
        ...(!existingLabels.has('Type') ? [['Type', record.depositType ?? record.title]] : []),
        ['Regularity', regularity],
        ['Reversal / returned entry', returnedOrReversed ? 'Recorded in supplied entry' : 'Not recorded'],
      ],
    };
  });
}

function buildDepositAnalysis(records, asOfValue) {
  const amountRecords = records.filter((record) => Number.isFinite(record.amountValue));
  const visibleTotal = roundMoney(amountRecords.reduce((sum, record) => sum + record.amountValue, 0));
  const aggregations = buildDateAggregations(amountRecords, visibleTotal);
  const monthlyAverage = aggregations.month.length
    ? roundMoney(visibleTotal / aggregations.month.length)
    : 0;
  const range = unionPeriodRanges(records, asOfValue, 'Supplied deposit records');
  const summary = summarizeBucket(amountRecords, {
    id: 'all-supplied-deposits',
    granularity: 'all',
    startDate: range.startDate,
    endDate: range.endDate,
    label: range.label,
  });
  return {
    records,
    visibleTotal,
    visibleTotalDisplay: formatMoney(visibleTotal),
    transactionCount: amountRecords.length,
    monthlyAverage,
    monthlyAverageDisplay: formatMoney(monthlyAverage),
    regularEntryCount: amountRecords.filter((record) => record.regularity.startsWith('Regular ')).length,
    irregularEntryCount: amountRecords.filter((record) => record.regularity.startsWith('Irregular ')).length,
    returnedOrReversedEntries: records.filter((record) => record.returnedOrReversed),
    returnedOrReversedCount: records.filter((record) => record.returnedOrReversed).length,
    sourceTotals: namedTotals(amountRecords, (record) => record.depositSource),
    typeTotals: namedTotals(amountRecords, (record) => record.depositType),
    largestEntries: summary.largestTransactions,
    aggregations,
    granularityOptions: ['day', 'week', 'month'],
    periodRange: range,
    supportRecordIds: unique(records.flatMap((record) => record.supportRecordIds)),
  };
}

function optionalMoney(value) {
  const parsed = numberOrNull(value);
  return parsed === null ? unavailable : formatMoney(parsed);
}

function buildLoanProfile(activeCase, primaryAccount, credit) {
  if (![PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.BUSINESS_LOAN].includes(activeCase.productType)) return null;
  if (!isCreditOrLoanProduct(primaryAccount)) {
    return {
      accountId: null,
      principal: null,
      principalDisplay: unavailable,
      outstandingBalance: null,
      outstandingBalanceDisplay: unavailable,
      term: credit?.term ?? unavailable,
      rate: credit?.apr ?? unavailable,
      apr: credit?.apr ?? unavailable,
      scheduledPayment: null,
      scheduledPaymentDisplay: unavailable,
      nextDueDate: unavailable,
      paymentHistory: 'No existing product payment history supplied',
      paymentStatus: 'Application product is not yet open',
    };
  }
  const principal = primaryAccount.originalLoanAmount;
  const outstandingBalance = primaryAccount.currentBalance;
  return {
    accountId: primaryAccount.accountId,
    principal,
    principalDisplay: principal === null ? unavailable : formatMoney(principal),
    outstandingBalance,
    outstandingBalanceDisplay: outstandingBalance === null ? unavailable : formatMoney(outstandingBalance),
    term: credit?.term ?? unavailable,
    rate: credit?.apr ?? unavailable,
    apr: credit?.apr ?? unavailable,
    scheduledPayment: primaryAccount.scheduledPayment,
    scheduledPaymentDisplay: primaryAccount.scheduledPayment === null
      ? unavailable
      : formatMoney(primaryAccount.scheduledPayment),
    nextDueDate: primaryAccount.nextPaymentDueDate ?? unavailable,
    paymentHistory: credit?.paymentHistory ?? primaryAccount.paymentStatus,
    paymentStatus: primaryAccount.paymentStatus,
  };
}

function buildPaymentRecords(activeCase, accounts, source, credit, asOfValue) {
  const creditAccounts = accounts.filter(isCreditOrLoanProduct);
  if (!creditAccounts.length) return [];
  const records = creditAccounts.map((account) => {
    const loanProfile = buildLoanProfile(activeCase, account, credit);
    return createRecord({
      id: `${activeCase.id}-FIN-PAYMENT-${account.accountId}`,
      title: `${account.productLabel} payment record`,
      category: isInstallmentLoan(account) ? 'Installment payment history' : 'Credit payment history',
      value: account.scheduledPayment === null ? account.paymentStatus : formatMoney(account.scheduledPayment),
      observed: asOfValue,
      status: account.paymentStatus,
      detail: 'The balance, payment schedule, due date, and servicing status come from the shared relationship account.',
      fields: [
        ['Account ID', account.accountId],
        ['Product', account.productLabel],
        ['Original principal', loanProfile?.principalDisplay ?? optionalMoney(account.originalLoanAmount)],
        ['Outstanding balance', account.currentBalance === null ? unavailable : formatMoney(account.currentBalance)],
        ['Credit limit', account.creditLimit === null ? unavailable : formatMoney(account.creditLimit)],
        ['Term', loanProfile?.term ?? credit?.term ?? unavailable],
        ['Rate / APR', loanProfile?.apr ?? credit?.apr ?? unavailable],
        ['Scheduled payment', account.scheduledPayment === null ? unavailable : formatMoney(account.scheduledPayment)],
        ['Next due date', account.nextPaymentDueDate ?? unavailable],
        ['Payment history', credit?.paymentHistory ?? account.paymentStatus],
        ['Past-due amount', account.pastDueAmount === null ? unavailable : formatMoney(account.pastDueAmount)],
      ],
      supportRecordIds: [account.accountId, credit ? `${activeCase.id}-CREDIT-PROFILE` : null],
      recordPeriod: periodRange(asOfValue, asOfValue, 'Payment snapshot'),
      accountId: account.accountId,
      paymentRecordKind: 'snapshot',
      scheduledAmount: account.scheduledPayment,
      actualPaid: null,
      paymentDate: null,
      paymentSource: unavailable,
      balanceAfter: account.currentBalance,
    });
  });

  const primaryCreditAccount = creditAccounts.find((account) => account.isPrimary) ?? creditAccounts[0];
  const transactionRecords = (activeCase.workflowType === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
    ? []
    : source.transactions ?? [])
    .filter((item) => /(?:scheduled payment|loan payment|card payment|repayment)/i.test(`${item.channel ?? ''} ${item.merchant ?? ''}`))
    .map((item, index) => {
      const amount = Math.max(0, numberOrNull(item.amount) ?? 0);
      const scheduledAmount = numberOrNull(item.scheduledAmount ?? item.minimumPayment)
        ?? primaryCreditAccount.scheduledPayment;
      const balanceAfter = numberOrNull(item.balanceAfter ?? item.endingBalance);
      const paymentSource = safeEvidenceText(item.paymentSource ?? item.instrument, 'Recorded payment source');
      return createRecord({
        id: item.id,
        title: safeEvidenceText(item.merchant, 'Recorded payment'),
        category: 'Payment activity',
        value: formatMoney(amount),
        observed: item.posted ?? asOfValue,
        status: safeEvidenceText(item.status, 'Payment record available'),
        detail: 'This dated payment record is presented separately from the account-level payment schedule.',
        fields: [
          ['Scheduled / minimum amount', scheduledAmount === null ? unavailable : formatMoney(scheduledAmount)],
          ['Actual paid', formatMoney(amount)],
          ['Payment date', safeEvidenceText(item.posted, displayDate(asOfValue))],
          ['Payment status', safeEvidenceText(item.status)],
          ['Payment source', paymentSource],
          ['Balance after payment', balanceAfter === null ? unavailable : formatMoney(balanceAfter)],
          ['Channel', safeEvidenceText(item.channel)],
          ['Instrument / account', safeEvidenceText(item.instrument)],
          ['Observed', safeEvidenceText(`${item.posted ?? ''} ${item.time ?? ''}`.trim(), displayDate(asOfValue))],
        ],
        supportRecordIds: [item.id],
        recordPeriod: periodRange(item.posted, asOfValue, index === 0 ? 'Current payment' : 'Payment history'),
        amountValue: amount,
        paymentRecordKind: 'dated',
        scheduledAmount,
        actualPaid: amount,
        paymentDate: item.posted ?? asOfValue,
        paymentStatus: safeEvidenceText(item.status),
        paymentSource,
        balanceAfter,
      });
    });
  const builtInRecords = (builtInPaymentHistory[activeCase.id] ?? []).map((item, index) => createRecord({
    id: item.id,
    title: `${primaryCreditAccount.productLabel} payment`,
    category: 'Payment activity',
    value: formatMoney(item.actualPaid),
    observed: item.paymentDate,
    status: item.status,
    detail: 'This dated payment row is included in the supplied account payment history.',
    fields: [
      ['Scheduled / minimum amount', formatMoney(item.scheduledAmount)],
      ['Actual paid', formatMoney(item.actualPaid)],
      ['Payment date', item.paymentDate],
      ['Payment status', item.status],
      ['Payment source', item.source],
      ['Balance after payment', item.balanceAfter === null ? unavailable : formatMoney(item.balanceAfter)],
    ],
    supportRecordIds: [item.id, primaryCreditAccount.accountId],
    recordPeriod: periodRange(item.paymentDate, asOfValue, index === 0 ? 'Current payment' : 'Payment history'),
    amountValue: item.actualPaid,
    paymentRecordKind: 'dated',
    scheduledAmount: item.scheduledAmount,
    actualPaid: item.actualPaid,
    paymentDate: item.paymentDate,
    paymentStatus: item.status,
    paymentSource: item.source,
    balanceAfter: item.balanceAfter,
  }));
  const paymentSourceAccount = accounts.find((account) => !isCreditOrLoanProduct(account));
  const persistedPaymentHistory = activeCase.toolResults?.paymentHistory;
  const persistedRecords = Array.isArray(persistedPaymentHistory)
    ? persistedPaymentHistory.map((item) => {
      const scheduledAmount = numberOrNull(item.scheduledAmount ?? item.minimumPayment)
        ?? primaryCreditAccount.scheduledPayment;
      const actualPaid = numberOrNull(item.actualPaid ?? item.amount);
      const balanceAfter = numberOrNull(item.balanceAfter);
      const sourceLabel = safeEvidenceText(
        item.paymentSource,
        paymentSourceAccount
          ? `${paymentSourceAccount.productLabel} ${paymentSourceAccount.maskedAccountId}`
          : 'Recorded relationship payment source',
      );
      return createRecord({
        id: item.id,
        title: safeEvidenceText(item.title, `${primaryCreditAccount.productLabel} monthly payment`),
        category: 'Payment activity',
        value: actualPaid === null ? unavailable : formatMoney(actualPaid),
        observed: item.paymentDate ?? item.observed ?? asOfValue,
        status: safeEvidenceText(item.status, 'Payment status recorded'),
        detail: safeEvidenceText(
          item.detail,
          'This dated payment row was persisted with the generated training packet.',
        ),
        fields: [
          ['Scheduled / minimum amount', scheduledAmount === null ? unavailable : formatMoney(scheduledAmount)],
          ['Actual paid', actualPaid === null ? unavailable : formatMoney(actualPaid)],
          ['Payment date', displayDate(item.paymentDate ?? item.observed ?? asOfValue)],
          ['Payment status', safeEvidenceText(item.status)],
          ['Payment source', sourceLabel],
          ['Balance after payment', balanceAfter === null ? unavailable : formatMoney(balanceAfter)],
        ],
        supportRecordIds: [item.id, primaryCreditAccount.accountId, paymentSourceAccount?.accountId],
        recordPeriod: periodRange(item.paymentDate ?? item.observed, asOfValue),
        amountValue: actualPaid ?? 0,
        paymentRecordKind: 'dated',
        scheduledAmount,
        actualPaid,
        paymentDate: item.paymentDate ?? item.observed,
        paymentStatus: safeEvidenceText(item.status),
        paymentSource: sourceLabel,
        balanceAfter,
      });
    })
    : [];
  const datedRecords = [...builtInRecords, ...transactionRecords, ...persistedRecords];
  const coverageRecords = datedRecords.length ? [] : [createRecord({
    id: `${activeCase.id}-FIN-PAYMENT-COVERAGE`,
    title: 'Dated payment-record coverage',
    category: 'Source inventory',
    value: 'No dated payment row supplied',
    observed: asOfValue,
    status: primaryCreditAccount.paymentStatus,
    detail: 'The account snapshot remains available, but this case packet does not add an unsupported monthly payment amount or date.',
    fields: [
      ['Account ID', primaryCreditAccount.accountId],
      ['Scheduled / minimum amount', primaryCreditAccount.scheduledPayment === null
        ? unavailable
        : formatMoney(primaryCreditAccount.scheduledPayment)],
      ['Dated payment rows supplied', '0'],
      ['Payment history summary', credit?.paymentHistory ?? primaryCreditAccount.paymentStatus],
    ],
    supportRecordIds: [primaryCreditAccount.accountId],
    recordPeriod: periodRange(asOfValue, asOfValue, 'Current source inventory'),
    paymentRecordKind: 'coverage',
    scheduledAmount: primaryCreditAccount.scheduledPayment,
    actualPaid: null,
    paymentDate: null,
    paymentSource: unavailable,
    balanceAfter: primaryCreditAccount.currentBalance,
  })];
  return [...records, ...datedRecords, ...coverageRecords];
}

function buildPaymentAnalysis(records) {
  const datedRecords = records.filter((record) => record.paymentRecordKind === 'dated');
  const actualTotal = roundMoney(datedRecords.reduce((sum, record) => sum + (record.actualPaid ?? 0), 0));
  const aggregations = buildDateAggregations(datedRecords, actualTotal);
  const monthlyRows = aggregations.month.map((month) => {
    const rows = datedRecords.filter((record) => (
      record.periodRange.startDate >= month.startDate
      && record.periodRange.startDate <= month.endDate
    ));
    const scheduledAmount = roundMoney(rows.reduce((sum, record) => sum + (record.scheduledAmount ?? 0), 0));
    const actualPaid = roundMoney(rows.reduce((sum, record) => sum + (record.actualPaid ?? 0), 0));
    return {
      ...month,
      scheduledAmount,
      scheduledAmountDisplay: formatMoney(scheduledAmount),
      actualPaid,
      actualPaidDisplay: formatMoney(actualPaid),
      paymentCount: rows.length,
      statuses: unique(rows.map((record) => record.paymentStatus)),
      sources: unique(rows.map((record) => record.paymentSource)),
      endingBalance: rows.find((record) => record.balanceAfter !== null)?.balanceAfter ?? null,
    };
  });
  const averageMonthlyPayment = monthlyRows.length
    ? roundMoney(monthlyRows.reduce((sum, month) => sum + month.actualPaid, 0) / monthlyRows.length)
    : 0;
  return {
    records,
    datedRecords,
    monthlyRows,
    months: monthlyRows,
    actualTotal,
    actualTotalDisplay: formatMoney(actualTotal),
    averageMonthlyPayment,
    averageMonthlyPaymentDisplay: formatMoney(averageMonthlyPayment),
    supportRecordIds: unique(records.flatMap((record) => record.supportRecordIds)),
  };
}

function payrollMetric(run, names) {
  for (const name of names) {
    const value = numberOrNull(run?.[name]);
    if (value !== null) return value;
  }
  return null;
}

function sumOptional(records, field) {
  const supplied = records.map((record) => record[field]).filter((value) => value !== null);
  return supplied.length ? roundMoney(supplied.reduce((sum, value) => sum + value, 0)) : null;
}

function payPeriodRange(run, asOfValue) {
  const start = isoDate(run.payPeriodStart ?? run.periodStart);
  const end = isoDate(run.payPeriodEnd ?? run.periodEnd);
  if (start || end) {
    const startDate = start ?? end;
    const endDate = end ?? start;
    return {
      startDate,
      endDate,
      label: `Pay period · ${displayDateRange(startDate, endDate)}`,
    };
  }
  if (/^[A-Za-z]{3,9}\s+\d{4}$/.test(String(run.period ?? '').trim())) {
    const month = monthRange(run.period, asOfValue);
    return {
      startDate: month.startDate,
      endDate: month.endDate,
      label: `Pay period · ${displayDateRange(month.startDate, month.endDate)}`,
    };
  }
  return periodRange(run.period ?? run.effectiveDate, asOfValue, 'Pay period');
}

function normalizePayrollRun(activeCase, run, index, asOfValue) {
  const companyDebit = payrollMetric(
    run,
    activeCase.legacyDerivedEvidence === true
      ? ['totalCompanyDebit', 'companyDebit']
      : ['totalCompanyDebit', 'companyDebit', 'amount'],
  );
  const grossWages = payrollMetric(run, ['grossWages']);
  const employeeTaxes = payrollMetric(run, ['employeeTaxes']);
  const employerTaxes = payrollMetric(run, ['employerTaxes']);
  const deductions = payrollMetric(run, ['deductions']);
  const employerContributions = payrollMetric(run, ['employerContributions']);
  const netPayroll = payrollMetric(run, ['netPayroll']);
  const fundingAmount = payrollMetric(run, ['fundingAmount', 'fundingDebit', 'totalFunding'])
    ?? companyDebit;
  const employeeCount = countOrNull(run.employeeCount ?? run.activeEmployeeCount);
  const range = payPeriodRange(run, asOfValue);
  const month = monthRange(range.endDate ?? range.startDate, asOfValue);
  const id = run.id ?? `${activeCase.id}-PAYR-${index + 1}`;
  const supportRecordIds = unique([id, ...(run.relatedRecords ?? [])]);
  const fundingStatus = safeEvidenceText(run.fundingStatus ?? run.runStatus ?? run.status, 'Funding status recorded');
  const runType = safeEvidenceText(run.runType, 'Regular payroll');
  const runStatus = safeEvidenceText(run.runStatus ?? run.status, 'Run status recorded');

  return createRecord({
    id,
    title: `${safeEvidenceText(run.employer, 'Training business')} · ${safeEvidenceText(run.period, range.label)}`,
    category: 'Payroll run',
    value: companyDebit === null ? unavailable : formatMoney(companyDebit),
    observed: safeEvidenceText(run.period ?? run.effectiveDate, range.label),
    status: runStatus,
    detail: 'This pay-period summary is sourced from the matching Payroll History run. Unavailable breakdown fields remain explicitly unfilled.',
    fields: [
      ['Run ID', id],
      ['Business', safeEvidenceText(run.employer, 'Training business')],
      ['Pay period', range.label],
      ['Run type', runType],
      ['Run status', runStatus],
      ['Employee count', employeeCount ?? unavailable],
      ['Gross wages', optionalMoney(grossWages)],
      ['Employee taxes', optionalMoney(employeeTaxes)],
      ['Employer taxes', optionalMoney(employerTaxes)],
      ['Deductions', optionalMoney(deductions)],
      ['Employer contributions', optionalMoney(employerContributions)],
      ['Net payroll', optionalMoney(netPayroll)],
      ['Total company debit', optionalMoney(companyDebit)],
      ['Funding amount', optionalMoney(fundingAmount)],
      ['Funding status', fundingStatus],
      ['Funding source', safeEvidenceText(run.fundingSource ?? run.bankCode, unavailable)],
    ],
    supportRecordIds,
    recordPeriod: range,
    payrollRunId: id,
    monthId: month.id,
    monthLabel: month.label,
    employeeCount,
    grossWages,
    employeeTaxes,
    employerTaxes,
    deductions,
    employerContributions,
    netPayroll,
    companyDebit,
    totalCompanyDebit: companyDebit,
    fundingAmount,
    fundingStatus,
    runType,
    runStatus,
    // Compatibility aliases for existing display consumers.
    grossPayroll: grossWages,
    taxes: employeeTaxes !== null || employerTaxes !== null
      ? roundMoney((employeeTaxes ?? 0) + (employerTaxes ?? 0))
      : null,
    contributions: employerContributions,
    netPay: netPayroll,
  });
}

function buildPayroll(activeCase, asOfValue) {
  const expected = activeCase.customerType === CUSTOMER_TYPES.BUSINESS && (
    activeCase.productType === PRODUCT_TYPES.PAYROLL_PRODUCT
    || payrollWorkflows.has(activeCase.workflowType)
    || activeCase.availableTools?.includes('Payroll History')
    || Boolean(
      activeCase.toolResults?.payrollHistory?.payrollRuns?.length
      ?? activeCase.toolResults?.payrollHistory?.length,
    )
  );
  if (!expected) {
    return {
      records: [],
      months: [],
      payPeriods: [],
      monthlyTotals: [],
      runTypes: [],
      runStatuses: [],
      supportRecordIds: [],
    };
  }

  const records = getPayrollHistory(activeCase).payrollRuns
    .map((run, index) => normalizePayrollRun(activeCase, run, index, asOfValue));
  const monthIds = unique(records.map((record) => record.monthId));
  const months = monthIds.map((monthId) => {
    const runs = records.filter((record) => record.monthId === monthId);
    const month = monthRange(
      runs[0]?.periodRange?.endDate ?? runs[0]?.periodRange?.startDate,
      asOfValue,
    );
    const companyDebit = sumOptional(runs, 'companyDebit');
    const fundingAmount = sumOptional(runs, 'fundingAmount');
    const employeeCounts = runs.map((run) => run.employeeCount).filter((value) => value !== null);
    const employeeCount = employeeCounts.length ? Math.max(...employeeCounts) : null;
    return {
      id: monthId,
      label: month.label,
      startDate: month.startDate,
      endDate: month.endDate,
      runCount: runs.length,
      employeeCount,
      grossWages: sumOptional(runs, 'grossWages'),
      employeeTaxes: sumOptional(runs, 'employeeTaxes'),
      employerTaxes: sumOptional(runs, 'employerTaxes'),
      deductions: sumOptional(runs, 'deductions'),
      employerContributions: sumOptional(runs, 'employerContributions'),
      netPayroll: sumOptional(runs, 'netPayroll'),
      companyDebit,
      totalCompanyDebit: companyDebit,
      fundingAmount,
      total: companyDebit,
      totalDisplay: optionalMoney(companyDebit),
      companyDebitDisplay: optionalMoney(companyDebit),
      fundingAmountDisplay: optionalMoney(fundingAmount),
      runTypes: unique(runs.map((run) => run.runType)),
      runStatuses: unique(runs.map((run) => run.runStatus)),
      fundingStatuses: unique(runs.map((run) => run.fundingStatus)),
      supportRecordIds: runs.map((run) => run.payrollRunId),
    };
  });
  const payPeriods = records.map((record) => ({
    id: record.payrollRunId,
    runId: record.payrollRunId,
    label: record.periodRange.label,
    startDate: record.periodRange.startDate,
    endDate: record.periodRange.endDate,
    monthId: record.monthId,
    total: record.companyDebit,
    totalDisplay: optionalMoney(record.companyDebit),
    employeeCount: record.employeeCount,
    grossWages: record.grossWages,
    employeeTaxes: record.employeeTaxes,
    employerTaxes: record.employerTaxes,
    deductions: record.deductions,
    employerContributions: record.employerContributions,
    netPayroll: record.netPayroll,
    companyDebit: record.companyDebit,
    totalCompanyDebit: record.companyDebit,
    fundingAmount: record.fundingAmount,
    fundingStatus: record.fundingStatus,
    runType: record.runType,
    runStatus: record.runStatus,
    supportRecordIds: record.supportRecordIds,
  }));
  return {
    records,
    months,
    payPeriods,
    monthlyTotals: months,
    runTypes: unique(records.map((record) => record.runType)),
    runStatuses: unique(records.map((record) => record.runStatus)),
    supportRecordIds: unique(records.flatMap((record) => record.supportRecordIds)),
  };
}

function monthlyComparisonGroups(records, valueSelector, { aggregation = 'sum' } = {}) {
  const groups = new Map();
  records.forEach((record, index) => {
    const value = valueSelector(record);
    const startDate = isoDate(record.startDate ?? record.periodRange?.startDate);
    if (!Number.isFinite(value) || !startDate) return;
    const month = monthRange(startDate, startDate);
    const group = groups.get(month.id) ?? {
      ...month,
      value: 0,
      supportRecordIds: [],
      latestObserved: '',
      latestIndex: -1,
    };
    if (aggregation === 'latest') {
      if (startDate > group.latestObserved
        || (startDate === group.latestObserved && index > group.latestIndex)) {
        group.value = roundMoney(value);
        group.latestObserved = startDate;
        group.latestIndex = index;
      }
    } else {
      group.value = roundMoney(group.value + value);
    }
    group.supportRecordIds.push(
      ...(record.supportRecordIds ?? [record.id ?? record.payrollRunId].filter(Boolean)),
    );
    groups.set(month.id, group);
  });
  return [...groups.values()]
    .map(({ latestObserved, latestIndex, ...group }) => ({
      ...group,
      supportRecordIds: unique(group.supportRecordIds),
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
}

function comparableMonthlyPeriods(records, valueSelector, { aggregation = 'sum' } = {}) {
  const months = monthlyComparisonGroups(records, valueSelector, { aggregation });
  if (months.length < 2) return null;
  const current = months.at(-1);
  const history = months.slice(0, -1);
  const baseline = roundMoney(history.reduce((sum, month) => sum + month.value, 0) / history.length);
  const baselineStart = history[0].startDate;
  const baselineEnd = history.at(-1).endDate;
  return {
    baseline,
    current: current.value,
    baselinePeriod: {
      startDate: baselineStart,
      endDate: baselineEnd,
      label: `Baseline monthly ${aggregation === 'latest' ? 'ending-snapshot ' : ''}average · ${displayDateRange(baselineStart, baselineEnd)}`,
    },
    currentPeriod: {
      startDate: current.startDate,
      endDate: current.endDate,
      label: `Current monthly ${aggregation === 'latest' ? 'ending snapshot' : 'total'} · ${displayDateRange(current.startDate, current.endDate)}`,
    },
    supportRecordIds: unique(months.flatMap((month) => month.supportRecordIds)),
  };
}

function addMonthlyComparison(comparisons, {
  id,
  label,
  valueType,
  records,
  valueSelector,
  explanation,
  aggregation = 'sum',
}) {
  const periods = comparableMonthlyPeriods(records, valueSelector, { aggregation });
  if (!periods) return;
  comparisons.push(createComparison({
    id,
    label,
    valueType,
    baseline: periods.baseline,
    current: periods.current,
    baselinePeriod: periods.baselinePeriod,
    currentPeriod: periods.currentPeriod,
    explanation,
    supportRecordIds: periods.supportRecordIds,
  }));
}

function buildComparisons(
  activeCase,
  source,
  spending,
  deposits,
  payments,
  payroll,
  primaryAccount,
  asOfValue,
) {
  const comparisons = [];
  const activityComparisonsApply = activeCase.workflowType !== WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW
    && ![PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.BUSINESS_LOAN].includes(activeCase.productType);
  const activityRows = (activityComparisonsApply ? (source.transactions ?? []) : [])
    .map((item, index) => ({
      id: item.id ?? `${activeCase.id}-FIN-ACT-${index + 1}`,
      amountValue: Math.max(0, numberOrNull(item.amount) ?? 0),
      status: safeEvidenceText(item.status, 'Record available'),
      periodRange: periodRange(item.posted, asOfValue),
      supportRecordIds: [item.id].filter(Boolean),
    }))
    .filter((item) => item.amountValue > 0);
  addMonthlyComparison(comparisons, {
    id: `${activeCase.id}-FIN-CMP-AMOUNT`,
    label: 'Monthly recorded activity',
    valueType: 'currency',
    records: activityRows,
    valueSelector: (item) => item.amountValue,
    explanation: 'Each month is totaled separately. The baseline is the average monthly total across the earlier displayed months; the current value is the latest displayed calendar month.',
  });

  const datedPayments = payments.datedRecords ?? [];
  const paymentLabel = isInstallmentLoan(primaryAccount)
    ? 'Monthly installment payment'
    : 'Monthly credit payment';
  addMonthlyComparison(comparisons, {
    id: `${activeCase.id}-FIN-CMP-PAYMENTS`,
    label: paymentLabel,
    valueType: 'currency',
    records: datedPayments,
    valueSelector: (item) => item.actualPaid,
    explanation: 'The baseline is the average amount actually paid across earlier supplied months; the current value is the latest supplied month.',
  });
  addMonthlyComparison(comparisons, {
    id: `${activeCase.id}-FIN-CMP-PAYMENT-BALANCE`,
    label: isInstallmentLoan(primaryAccount)
      ? 'Remaining balance after payment'
      : 'Balance after payment',
    valueType: 'currency',
    records: datedPayments,
    valueSelector: (item) => item.balanceAfter,
    aggregation: 'latest',
    explanation: 'Each month uses the latest dated payment row that includes a recorded balance after payment; earlier months form the baseline average.',
  });
  if (primaryAccount.creditLimit > 0) {
    addMonthlyComparison(comparisons, {
      id: `${activeCase.id}-FIN-CMP-UTILIZATION`,
      label: 'Recorded utilization after payment',
      valueType: 'percent',
      records: datedPayments,
      aggregation: 'latest',
      valueSelector: (item) => (
        Number.isFinite(item.balanceAfter)
          ? (item.balanceAfter / primaryAccount.creditLimit) * 100
          : Number.NaN
      ),
      explanation: 'Each month uses the latest dated balance-after-payment row divided by the recorded credit limit; earlier monthly snapshots form the baseline average.',
    });
  }
  addMonthlyComparison(comparisons, {
    id: `${activeCase.id}-FIN-CMP-COUNT`,
    label: 'Monthly recorded activity count',
    valueType: 'count',
    records: activityRows,
    valueSelector: () => 1,
    explanation: 'The baseline is the average monthly record count across the earlier displayed months; the current value is the count in the latest displayed calendar month.',
  });

  const depositRows = deposits.filter((record) => Number.isFinite(record.amountValue) && record.amountValue > 0);
  addMonthlyComparison(comparisons, {
    id: `${activeCase.id}-FIN-CMP-DEPOSITS`,
    label: 'Monthly recorded incoming funds',
    valueType: 'currency',
    records: depositRows,
    valueSelector: (item) => item.amountValue,
    explanation: 'The comparison uses only separately classified incoming entries. The baseline is the average monthly total across the earlier displayed months.',
  });

  const payrollMonths = payroll.months.map((month) => ({
    ...month,
    periodRange: { startDate: month.startDate, endDate: month.endDate },
    supportRecordIds: month.supportRecordIds,
  }));
  const payrollMetrics = [
    ['COST', 'Monthly payroll cost', 'currency', (month) => month.companyDebit],
    ['EMPLOYEES', 'Employees paid', 'count', (month) => month.employeeCount],
    ['PER-EMPLOYEE', 'Average payroll per employee', 'currency', (month) => (
      month.companyDebit !== null && month.employeeCount > 0
        ? roundMoney(month.companyDebit / month.employeeCount)
        : Number.NaN
    )],
    ['EMPLOYER-COSTS', 'Employer taxes and contributions', 'currency', (month) => (
      month.employerTaxes !== null || month.employerContributions !== null
        ? roundMoney((month.employerTaxes ?? 0) + (month.employerContributions ?? 0))
        : Number.NaN
    )],
    ['FUNDING', 'Payroll funding totals', 'currency', (month) => month.fundingAmount],
  ];
  for (const [suffix, label, valueType, valueSelector] of payrollMetrics) {
    addMonthlyComparison(comparisons, {
      id: `${activeCase.id}-FIN-CMP-PAYROLL-${suffix}`,
      label,
      valueType,
      records: payrollMonths,
      valueSelector,
      explanation: 'The baseline is the average monthly value across the earlier supplied payroll months; the current value is the latest supplied payroll month.',
    });
  }

  // The arithmetic contract is intentional: callers can always reconcile the
  // visible entries and the grouped statement remainder to the period outflow.
  if (roundMoney(spending.visibleTotal + spending.knownRemainder) !== spending.periodOutflow) {
    throw new RangeError(`Financial spending totals do not reconcile for ${activeCase.id}`);
  }
  return comparisons.filter(Boolean);
}

function comparisonRecords(activeCase, comparisons, asOfValue) {
  if (!comparisons.length) {
    return [createRecord({
      id: `${activeCase.id}-FIN-CMP-COVERAGE`,
      title: 'Historical comparison coverage',
      category: 'Source inventory',
      value: 'Current snapshot only',
      observed: asOfValue,
      status: 'No separate historical amount supplied',
      detail: 'The workspace does not create a historical value when the case packet provides only a current snapshot.',
      fields: [
        ['Current range', displayDate(asOfValue)],
        ['Historical range', unavailable],
      ],
      supportRecordIds: [],
      recordPeriod: periodRange(asOfValue, asOfValue, 'Current source inventory'),
    })];
  }
  return comparisons.map((comparison) => createRecord({
    id: comparison.id,
    title: comparison.label,
    category: 'Dated comparison',
    value: `${comparison.baselineDisplay} baseline · ${comparison.currentDisplay} current`,
    observed: comparison.currentDateRange,
    status: 'Exact values available',
    detail: comparison.explanation,
    fields: [
      ['Value format', comparison.valueType],
      ['Baseline value', comparison.baselineDisplay],
      ['Baseline date range', comparison.baselineDateRange],
      ['Current value', comparison.currentDisplay],
      ['Current date range', comparison.currentDateRange],
      ['Numeric change', comparison.deltaDisplay],
    ],
    supportRecordIds: comparison.supportRecordIds,
    recordPeriod: {
      startDate: comparison.baselinePeriod.startDate,
      endDate: comparison.currentPeriod.endDate,
      label: `${comparison.baselineDateRange} / ${comparison.currentDateRange}`,
    },
    comparisonId: comparison.id,
  }));
}

function buildSections(activeCase, primaryAccount, spending, paymentRecords, payroll) {
  const hasSpending = spending.records.length > 0;
  const hasDeposits = activeCase.customerType === CUSTOMER_TYPES.PERSONAL
    && activeCase.productType === PRODUCT_TYPES.DEPOSIT_ACCOUNT;
  const hasPayments = isCreditOrLoanProduct(primaryAccount) && paymentRecords.length > 0;
  const hasPayroll = activeCase.customerType === CUSTOMER_TYPES.BUSINESS && payroll.records.length > 0;
  const loanFirst = isInstallmentLoan(primaryAccount)
    || [PRODUCT_TYPES.PERSONAL_LOAN, PRODUCT_TYPES.BUSINESS_LOAN].includes(activeCase.productType);
  const ids = ['account-review', 'comparisons'];
  if (loanFirst && hasPayments) ids.push('payments');
  if (hasSpending) ids.push('spending');
  if (hasDeposits) ids.push('deposits');
  if (!loanFirst && hasPayments) ids.push('payments');
  if (hasPayroll) ids.push('payroll');
  return ids.map((id) => sectionDefinitions[id]);
}

function buildKpis(primaryAccount, payroll) {
  const candidates = [];
  const loan = isInstallmentLoan(primaryAccount);
  if (primaryAccount.currentBalance > 0) {
    candidates.push({
      label: loan ? 'Outstanding balance' : 'Current balance',
      value: formatMoney(primaryAccount.currentBalance),
      context: primaryAccount.productLabel,
    });
  }
  if (primaryAccount.availableBalance > 0) {
    candidates.push({
      label: 'Available balance',
      value: formatMoney(primaryAccount.availableBalance),
      context: primaryAccount.status,
    });
  }
  if (primaryAccount.availableCredit > 0) {
    candidates.push({
      label: 'Available credit',
      value: formatMoney(primaryAccount.availableCredit),
      context: primaryAccount.productLabel,
    });
  }
  if (primaryAccount.creditLimit > 0 && primaryAccount.currentBalance !== null) {
    candidates.push({
      label: 'Utilization',
      value: formatPercent((primaryAccount.currentBalance / primaryAccount.creditLimit) * 100),
      context: `${formatMoney(primaryAccount.currentBalance)} of ${formatMoney(primaryAccount.creditLimit)}`,
    });
  }
  if (primaryAccount.originalLoanAmount > 0) {
    candidates.push({
      label: 'Original principal',
      value: formatMoney(primaryAccount.originalLoanAmount),
      context: primaryAccount.accountId,
    });
  }
  if (primaryAccount.scheduledPayment > 0) {
    candidates.push({
      label: 'Scheduled payment',
      value: formatMoney(primaryAccount.scheduledPayment),
      context: primaryAccount.nextPaymentDueDate ?? 'Due date not supplied',
    });
  }
  const latestPayroll = payroll.records[0];
  if (latestPayroll?.companyDebit > 0) {
    candidates.push({
      label: 'Latest payroll debit',
      value: formatMoney(latestPayroll.companyDebit),
      context: latestPayroll.periodRange.label,
    });
  }
  return candidates.slice(0, 6);
}

function profileFromAccount(activeCase, primaryAccount, accounts, credit, loan) {
  const taxonomy = publicCaseTaxonomy(activeCase);
  const caseAmount = numberOrNull(activeCase.amountExposure ?? activeCase.amount);
  return {
    relationshipDataVersion: RELATIONSHIP_DATA_VERSION,
    customerType: activeCase.customerType,
    customerTypeLabel: taxonomy.customerType,
    productType: activeCase.productType,
    productTypeLabel: taxonomy.productType,
    workflowType: activeCase.workflowType,
    workflowTypeLabel: taxonomy.workflowType,
    account: `${primaryAccount.productLabel} ${primaryAccount.maskedAccountId}`,
    accountId: primaryAccount.accountId,
    accountType: primaryAccount.productLabel,
    accountAge: relationshipLengthFrom(primaryAccount.openDate),
    accountStatus: primaryAccount.status,
    relationshipLength: relationshipLengthFrom(primaryAccount.openDate),
    openDate: primaryAccount.openDate,
    currentBalance: primaryAccount.currentBalance,
    currentBalanceDisplay: primaryAccount.currentBalance === null ? unavailable : formatMoney(primaryAccount.currentBalance),
    availableBalance: primaryAccount.availableBalance,
    availableBalanceDisplay: primaryAccount.availableBalance === null ? unavailable : formatMoney(primaryAccount.availableBalance),
    availableCredit: primaryAccount.availableCredit,
    availableCreditDisplay: primaryAccount.availableCredit === null ? unavailable : formatMoney(primaryAccount.availableCredit),
    creditLimit: primaryAccount.creditLimit,
    creditLimitDisplay: primaryAccount.creditLimit === null ? unavailable : formatMoney(primaryAccount.creditLimit),
    originalLoanAmount: primaryAccount.originalLoanAmount,
    scheduledPayment: primaryAccount.scheduledPayment,
    nextDueDate: primaryAccount.nextPaymentDueDate ?? unavailable,
    paymentHistory: credit?.paymentHistory ?? primaryAccount.paymentStatus,
    restrictions: primaryAccount.restrictions,
    holds: primaryAccount.holds,
    caseAmount,
    caseAmountDisplay: caseAmount === null ? unavailable : formatMoney(caseAmount),
    creditProfile: credit,
    loan,
    principal: loan?.principal ?? null,
    outstandingBalance: loan ? loan.outstandingBalance : primaryAccount.currentBalance,
    term: loan?.term ?? unavailable,
    rate: loan?.rate ?? unavailable,
    apr: loan?.apr ?? unavailable,
    nextPaymentDueDate: loan?.nextDueDate ?? primaryAccount.nextPaymentDueDate ?? unavailable,
    accounts,
  };
}

function buildContextRecords(records = [], asOfValue) {
  return records.map((item, index) => {
    const id = safeEvidenceText(item.id, `FIN-CONTEXT-${index + 1}`);
    const observed = safeEvidenceText(item.observed, asOfValue);
    const title = safeEvidenceText(item.type, 'Recorded financial observation');
    const value = safeEvidenceText(item.value);
    const detail = safeEvidenceText(
      item.context,
      'The supplied financial packet contains this observation without assigning a case outcome.',
    );
    const observedRange = periodRange(observed, asOfValue, 'Recorded observation');
    return {
      id,
      title,
      category: 'Recorded observation',
      value,
      observed,
      status: 'Recorded',
      detail,
      fields: [
        ['Observation', title],
        ['Recorded value', value],
        ['Observed', observed],
      ],
      supportRecordIds: [id],
      period: observed,
      periodRange: {
        ...observedRange,
        label: `Recorded observation · ${observed}`,
      },
    };
  });
}

export function getFinancialInvestigation(activeCase = {}) {
  const asOfValue = activeCase.reportedDate ?? activeCase.opened ?? 'Current training record';
  const source = getSuppliedFinancialRecords(activeCase);
  const accounts = getRelationshipAccounts(activeCase);
  const primaryAccount = getPrimaryRelationshipAccount(activeCase);
  const credit = sanitizedCreditProfile(activeCase);
  const loan = buildLoanProfile(activeCase, primaryAccount, credit);
  const accountRecords = buildAccountRecords(activeCase, accounts, asOfValue);
  const transactionIds = (source.transactions ?? []).map((item) => item.id);
  const paymentObjectIds = (source.paymentVerification ?? []).map((item) => item.id);
  const creditRecord = creditEvidenceRecord(
    activeCase,
    credit,
    asOfValue,
    [...transactionIds, ...paymentObjectIds],
  );
  if (creditRecord) accountRecords.push(creditRecord);
  const contextRecords = buildContextRecords(source.financialIntel ?? [], asOfValue);
  accountRecords.push(...contextRecords);

  const spending = buildSpending(activeCase, source, primaryAccount, asOfValue);
  const deposits = buildDepositRecords(activeCase, source, primaryAccount, asOfValue);
  const depositAnalysis = buildDepositAnalysis(deposits, asOfValue);
  const paymentRecords = buildPaymentRecords(activeCase, accounts, source, credit, asOfValue);
  const paymentAnalysis = buildPaymentAnalysis(paymentRecords);
  const payroll = buildPayroll(activeCase, asOfValue);
  const comparisons = buildComparisons(
    activeCase,
    source,
    spending,
    deposits,
    paymentAnalysis,
    payroll,
    primaryAccount,
    asOfValue,
  );
  const comparisonsAsRecords = comparisonRecords(activeCase, comparisons, asOfValue);
  const sections = buildSections(activeCase, primaryAccount, spending, paymentRecords, payroll);
  const recordsBySection = {
    'account-review': accountRecords,
    comparisons: comparisonsAsRecords,
    spending: spending.records,
    deposits,
    payments: paymentRecords,
    payroll: payroll.records,
  };
  const recordsByTab = {
    ...recordsBySection,
    overview: accountRecords,
    trends: comparisonsAsRecords,
  };
  const depositTrend = deposits
    .filter((record) => Number.isFinite(record.amountValue) && record.amountValue > 0)
    .map((record) => ({
      id: record.id,
      label: record.periodRange.label,
      value: record.amountValue,
      displayValue: formatMoney(record.amountValue),
      title: record.title,
      periodRange: record.periodRange,
      supportRecordIds: record.supportRecordIds,
    }));
  const profile = profileFromAccount(activeCase, primaryAccount, accounts, credit, loan);
  const kpis = buildKpis(primaryAccount, payroll);
  const reviewedFacts = [
    `${accounts.length} relationship account${accounts.length === 1 ? '' : 's'} are listed from the shared account record.`,
    `${primaryAccount.productLabel} ${primaryAccount.maskedAccountId} is recorded as ${primaryAccount.status}.`,
    `${source.transactions?.length ?? 0} transaction or activity record${source.transactions?.length === 1 ? '' : 's'} are available for dated comparison.`,
    ...(contextRecords.length
      ? [`${contextRecords.length} neutral financial observation${contextRecords.length === 1 ? '' : 's'} are supplied in the case packet.`]
      : []),
    ...(payroll.records.length
      ? [`${payroll.records.length} Payroll History run${payroll.records.length === 1 ? '' : 's'} reconcile to the payroll section.`]
      : []),
  ];
  const routes = [
    ...(activeCase.availableTools?.includes('Transaction History')
      ? [{ tool: 'Transaction History', label: 'Open Transaction History' }]
      : []),
    ...(activeCase.availableTools?.includes('Payment Verification')
      ? [{ tool: 'Payment Verification', label: 'Open Payment Verification' }]
      : []),
    ...(payroll.records.length
      ? [{ tool: 'Payroll History', label: 'Open Payroll History', queryField: 'payrollRunId' }]
      : []),
  ];

  return {
    dataVersion: FINANCIAL_INVESTIGATION_DATA_VERSION,
    relationshipDataVersion: activeCase.relationshipDataVersion ?? RELATIONSHIP_DATA_VERSION,
    legacyDerivedEvidence: activeCase.legacyDerivedEvidence === true,
    taxonomy: caseDomainLabels(activeCase),
    profile,
    accounts,
    primaryAccount,
    sections,
    sectionIds: sections.map((section) => section.id),
    recordsBySection,
    recordsByTab,
    kpis,
    comparisons,
    comparison: comparisons,
    depositTrend,
    deposits: depositAnalysis,
    depositAnalysis,
    spending,
    payments: {
      ...paymentAnalysis,
      loan,
    },
    payroll,
    contextRecords,
    reviewedFacts,
    routes,
    relatedRecordIds: unique([
      ...transactionIds,
      ...paymentObjectIds,
      ...accounts.map((account) => account.accountId),
      ...payroll.supportRecordIds,
    ]),
  };
}

export function getFinancialInvestigationSections(activeCase = {}) {
  return getFinancialInvestigation(activeCase).sections;
}

export function financialRecordSearchText(record = {}) {
  return [
    record.id,
    record.title,
    record.category,
    record.value,
    record.observed,
    record.status,
    record.detail,
    record.period,
    record.periodRange?.startDate,
    record.periodRange?.endDate,
    record.periodRange?.label,
    ...(record.fields ?? []).flat(),
    ...(record.supportRecordIds ?? record.relatedRecords ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}
