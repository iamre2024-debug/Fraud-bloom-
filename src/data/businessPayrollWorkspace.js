import { getBusinessRecords, getFinancialRecords } from './caseToolData.js';
import { getBusinessResearch } from './businessResearchRecords.js';
import { payrollContractIssues, summarizeCompanyPayroll } from './payrollDataModel.js';
import { WORKFLOW_TYPES } from './caseDomain.js';
import { buildCaseParties } from './caseParties.js';
import { transactionAmountValue } from './transactionHistoryRecords.js';

function amountValue(value = '') {
  const source = String(value ?? '').trim();
  if (!source || !/\d/.test(source)) return null;
  const parsed = Number(source.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return /^\(.*\)$/.test(source) ? -Math.abs(parsed) : parsed;
}

function payrollDateValue(value) {
  const parsed = Date.parse(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function sortPayrollRunsNewestFirst(payrollRuns = []) {
  return payrollRuns
    .map((run, index) => ({ run, index }))
    .sort((left, right) => (
      (payrollDateValue(right.run.payDate ?? right.run.processedDate) ?? 0)
      - (payrollDateValue(left.run.payDate ?? left.run.processedDate) ?? 0)
      || right.index - left.index
    ))
    .map(({ run }) => run);
}

export function filterPayrollRuns(
  payrollRuns = [],
  { runType = 'all', status = 'all' } = {},
) {
  const requestedType = String(runType ?? 'all').trim().toLowerCase();
  const requestedStatus = String(status ?? 'all').trim().toLowerCase();
  return sortPayrollRunsNewestFirst(payrollRuns).filter((run) => {
    if (
      requestedType !== 'all'
      && String(run.runType ?? '').trim().toLowerCase() !== requestedType
    ) return false;
    if (
      requestedStatus !== 'all'
      && String(run.runStatus ?? run.status ?? '').trim().toLowerCase() !== requestedStatus
    ) return false;
    return true;
  });
}

export function payrollHistoryOverview(payrollWorkspace = {}) {
  const payrollRuns = sortPayrollRunsNewestFirst(payrollWorkspace.payrollRuns ?? []);
  const latestRun = payrollRuns[0] ?? null;
  return {
    latestRun,
    latestNetPayroll: latestRun?.netPay ?? latestRun?.netPayroll ?? null,
    latestPayDate: latestRun?.payDate ?? latestRun?.processedDate ?? null,
    payrollRunCount: payrollRuns.length,
    employeesPaid: latestRun?.employeeCount ?? payrollWorkspace.summary?.employeesPaid ?? null,
    nextPayDate: payrollWorkspace.companyPayrollProfile?.nextPayDate ?? null,
    paySchedule: payrollWorkspace.companyPayrollProfile?.paySchedule ?? null,
  };
}

function summarizeLegacyPayroll(payrollRuns = []) {
  const sumKnown = (field) => {
    const values = payrollRuns
      .map((run) => amountValue(run[field]))
      .filter(Number.isFinite);
    return values.length ? values.reduce((total, value) => total + value, 0) : null;
  };
  const employeeIds = new Set(
    payrollRuns
      .flatMap((run) => run.employees ?? [])
      .map((employee) => employee.employeeId)
      .filter(Boolean),
  );
  return {
    totalPayrollCost: sumKnown('totalPayrollCost'),
    grossWages: sumKnown('grossWages'),
    employeeTaxes: sumKnown('employeeTaxes'),
    employerTaxes: sumKnown('employerTaxes'),
    deductions: sumKnown('deductions'),
    employerContributions: sumKnown('employerContributions'),
    reimbursements: sumKnown('reimbursements'),
    netPay: sumKnown('netPay'),
    totalFundingAmount: sumKnown('totalFundingAmount'),
    employeesPaid: employeeIds.size || null,
  };
}

export function getTransactionHistory(activeCase) {
  const financial = getFinancialRecords(activeCase);
  return financial.transactions.map((item) => ({
    ...item,
    amountValue: transactionAmountValue(item.amount),
    direction: item.direction ?? null,
    category: item.category ?? null,
    location: item.location ?? null,
    entryMode: item.entryMode ?? null,
    relatedRecords: [...new Set([
      item.id,
      ...((Array.isArray(item.relatedRecords) ? item.relatedRecords : [])),
      ...((financial.paymentVerification ?? [])
        .filter((record) => record.relatedRecords?.includes(item.id))
        .map((record) => record.id)),
    ])],
    relatedDocuments: Array.isArray(item.relatedDocuments)
      ? item.relatedDocuments
      : [],
    pinPayload: {
      id: item.id,
      recordId: item.id,
      sourceRecordId: item.id,
      value: item.id,
      label: `${item.id} · ${item.merchant}`,
      query: item.id,
      identifierType: 'transaction-id',
    },
  }));
}

export function getBusiness360Workspace(activeCase) {
  const research = getBusinessResearch(activeCase);
  const records = Object.values(research.recordsBySection).flat();
  const primaryRelationship = research.profile.relationship?.accounts?.[0] ?? null;
  return {
    ...research,
    records,
    research: research.profile.research,
    profile: {
      ...research.profile,
      entity: research.profile.legalName,
      registration: `${research.profile.registrationId} · ${research.profile.standing}`,
      officer: research.profile.ownership?.controllingParty?.name,
      registeredAgent: research.profile.footprint?.registeredAgent,
      address: research.profile.footprint?.physicalAddress,
      contact: research.profile.footprint?.phone,
      filingDate: research.profile.formationDate,
      observed: research.profile.relationship?.relationshipStartDate,
    },
    relationships: records.map((record) => ({
      ...record,
      entity: record.title,
      relationship: record.category,
      context: record.detail,
      status: record.value,
    })),
    paymentSource: primaryRelationship?.bankCode && primaryRelationship?.destinationId
      ? primaryRelationship
      : null,
    navigation: [
      'Identity Intel / People Search',
      'Financial Investigation',
      'Payment Verification',
      'Employee Profile',
      'Payroll History',
    ].filter((tool) => activeCase.availableTools?.includes(tool)),
  };
}

export function sortEmployeePaymentHistoryNewestFirst(paymentHistory = []) {
  return (Array.isArray(paymentHistory) ? paymentHistory : [])
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      (payrollDateValue(right.item.effectiveDate ?? right.item.firstSeen) ?? 0)
      - (payrollDateValue(left.item.effectiveDate ?? left.item.firstSeen) ?? 0)
      || right.index - left.index
    ))
    .map(({ item }) => item);
}

export function employeePayrollSnapshots(payrollRuns = [], employeeId = '') {
  const requestedId = String(employeeId ?? '').trim();
  if (!requestedId) return [];
  return sortPayrollRunsNewestFirst(payrollRuns).flatMap((run) => {
    const employee = (Array.isArray(run.employees) ? run.employees : [])
      .find((item) => item?.employeeId === requestedId);
    if (!employee) return [];
    const paystub = employee.paystub ?? null;
    return [{
      run,
      employee,
      paystub,
      runId: run.id ?? null,
      payDate: run.payDate ?? run.processedDate ?? null,
      payPeriod: run.payPeriod ?? null,
      runType: run.runType ?? null,
      runStatus: run.runStatus ?? run.status ?? null,
      destinations: Array.isArray(paystub?.paymentDestinations)
        ? paystub.paymentDestinations
        : [],
    }];
  });
}

function employeeProfileHistory(employee, paymentHistory) {
  const changes = [
    ...paymentHistory.map((item, index) => ({
      id: item.paymentRecordId ?? `${employee.id}-PAYMENT-${index + 1}`,
      type: 'Payment method',
      effectiveDate: item.effectiveDate ?? null,
      value: item.method ?? null,
      detail: item.paymentRecordId ?? null,
      destinations: Array.isArray(item.destinations) ? item.destinations : [],
    })),
    ...(employee.hireDate ? [{
      id: `${employee.id}-HIRE`,
      type: 'Employment started',
      effectiveDate: employee.hireDate,
      value: null,
      detail: null,
    }] : []),
  ];
  return changes
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      (payrollDateValue(right.item.effectiveDate) ?? 0)
      - (payrollDateValue(left.item.effectiveDate) ?? 0)
      || right.index - left.index
    ))
    .map(({ item }) => item);
}

export function getEmployeeProfiles(activeCase) {
  const records = getBusinessRecords(activeCase);
  const payrollRuns = records.payrollRuns ?? [];
  return (records.employeeProfile ?? []).map((employee) => {
    const paycheckHistory = employeePayrollSnapshots(payrollRuns, employee.id);
    const paymentHistory = sortEmployeePaymentHistoryNewestFirst(employee.paymentHistory);
    const currentPaymentPlan = paymentHistory[0] ?? null;
    const currentDestinations = Array.isArray(currentPaymentPlan?.destinations)
      ? currentPaymentPlan.destinations
      : [];
    const employmentTimeline = employee.employmentTimeline ?? [
      employee.hireDate,
      employee.employmentStatus ?? employee.status,
    ].filter(Boolean).join(' – ');
    return {
      ...employee,
      status: employee.employmentStatus ?? employee.status ?? null,
      lastSeen: paycheckHistory[0]?.payDate ?? employee.lastSeen ?? null,
      employmentTimeline: employmentTimeline || null,
      paymentHistory,
      currentPaymentPlan,
      currentDestinations,
      paycheckHistory,
      latestPaycheck: paycheckHistory[0] ?? null,
      profileHistory: employeeProfileHistory(employee, paymentHistory),
      linkedPayroll: paycheckHistory.map((item) => item.paystub?.id).filter(Boolean),
      employer: employee.employer ?? records.companyPayrollProfile?.legalName ?? null,
      role: employee.role ?? employee.position ?? null,
      department: employee.department ?? null,
    };
  });
}

export function resolveEmployeeProfileLookup(employeeProfiles = [], value = '') {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (
    !normalized
    || ['not supplied', 'not applicable', 'not recorded', 'none'].includes(normalized)
  ) {
    return { state: 'invalid', record: null, matches: [] };
  }
  const records = Array.isArray(employeeProfiles) ? employeeProfiles : [];
  const exactIds = records.filter((item) => (
    String(item?.id ?? '').trim().toLowerCase() === normalized
  ));
  if (exactIds.length === 1) {
    return { state: 'found', record: exactIds[0], matches: exactIds, matchedBy: 'employee-id' };
  }
  if (exactIds.length > 1) {
    return { state: 'ambiguous', record: null, matches: exactIds, matchedBy: 'employee-id' };
  }
  const exactNames = records.filter((item) => (
    String(item?.name ?? '').trim().toLowerCase() === normalized
  ));
  if (exactNames.length === 1) {
    return { state: 'found', record: exactNames[0], matches: exactNames, matchedBy: 'employee-name' };
  }
  if (exactNames.length > 1) {
    return { state: 'ambiguous', record: null, matches: exactNames, matchedBy: 'employee-name' };
  }
  return { state: 'not-found', record: null, matches: [] };
}

export function findEmployeeProfile(employeeProfiles = [], value = '') {
  return resolveEmployeeProfileLookup(employeeProfiles, value).record;
}

export function getPayrollHistory(activeCase) {
  const records = getBusinessRecords(activeCase);
  const legacyRows = Array.isArray(activeCase.toolResults?.payrollHistory)
    ? activeCase.toolResults.payrollHistory
    : [];
  const companyPayrollProfile = records.companyPayrollProfile ?? (legacyRows.length ? {
    businessId: activeCase.businessId ?? `BIZ-${activeCase.id}`,
    legalName: legacyRows[0].employer ?? activeCase.profile?.business ?? 'Employer not supplied',
    address: activeCase.businessProfile?.address ?? 'Not supplied in preserved payroll record',
    maskedEin: activeCase.businessProfile?.ein ?? 'Not supplied',
    payrollId: activeCase.accountId ?? `PAYROLL-${activeCase.id}`,
    paySchedule: legacyRows[0].paySchedule ?? 'Not supplied',
    nextPayDate: legacyRows[0].nextScheduledPayroll ?? 'Not supplied',
    activeEmployeeCount: legacyRows[0].employeeCount ?? null,
    selectedDateRange: `${legacyRows.at(-1)?.period ?? 'Not supplied'} – ${legacyRows[0]?.period ?? 'Not supplied'}`,
  } : null);
  const hasDetailedPayroll = Boolean(records.payrollRuns?.length);
  const sourceRuns = hasDetailedPayroll ? records.payrollRuns : legacyRows.map((row) => {
    const suppliedEmployees = Array.isArray(row.employees) ? row.employees : [];
    return {
      ...row,
      payPeriod: row.payPeriod ?? {
        start: row.payPeriodStart ?? null,
        end: row.payPeriodEnd ?? null,
        label: row.period ?? null,
      },
      payDate: row.payDate ?? row.processedDate ?? null,
      runType: row.runType ?? null,
      status: row.status ?? row.fundingStatus ?? 'Recorded',
      employeeCount: row.employeeCount ?? (suppliedEmployees.length || null),
      grossWages: amountValue(row.grossWages),
      employeeTaxes: amountValue(row.employeeTaxes),
      employerTaxes: amountValue(row.employerTaxes),
      deductions: amountValue(row.deductions),
      employerContributions: amountValue(row.employerContributions),
      reimbursements: amountValue(row.reimbursements),
      netPay: amountValue(row.netPay ?? row.netPayroll),
      totalPayrollCost: amountValue(row.totalPayrollCost),
      totalCompanyDebit: amountValue(row.totalCompanyDebit ?? row.amount),
      totalFundingAmount: amountValue(row.totalFundingAmount),
      companyFunding: row.companyFunding ?? {
        bankCode: row.fundingSource ?? null,
        accountUsed: row.fundingAccount ?? null,
        paymentRecordId: row.fundingPaymentRecordId ?? null,
      },
      employees: suppliedEmployees,
      legacySummaryOnly: !suppliedEmployees.length,
    };
  });
  const payrollRuns = sourceRuns.map((run) => {
    const primaryEmployee = run.employees?.[0];
    const primaryDestination = primaryEmployee?.paystub?.paymentDestinations?.[0];
    const payDate = run.payDate ?? run.processedDate;
    const parsedPayDate = new Date(payDate);
    const month = Number.isNaN(parsedPayDate.getTime())
      ? payDate
      : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(parsedPayDate);
    return {
      ...run,
      employer: run.employer ?? companyPayrollProfile?.legalName ?? 'Employer not supplied',
      processedDate: run.processedDate ?? payDate,
      effectiveDate: run.effectiveDate ?? payDate,
      month,
      period: run.period ?? run.payPeriod?.label,
      payPeriodLabel: run.payPeriodLabel ?? run.payPeriod?.label,
      payPeriodStart: run.payPeriodStart ?? run.payPeriod?.start,
      payPeriodEnd: run.payPeriodEnd ?? run.payPeriod?.end,
      paySchedule: run.paySchedule ?? companyPayrollProfile?.paySchedule,
      runStatus: run.runStatus ?? run.status,
      netPayroll: run.netPayroll ?? run.netPay,
      amount: run.amount ?? run.totalCompanyDebit,
      channel: run.channel ?? 'Company payroll run',
      fundingAmount: run.fundingAmount ?? run.totalFundingAmount,
      fundingStatus: run.fundingStatus ?? run.status,
      fundingSource: run.fundingSource ?? run.companyFunding?.bankCode,
      bankCode: run.bankCode ?? primaryDestination?.bankCode ?? run.companyFunding?.bankCode,
      destinationId: run.destinationId ?? primaryDestination?.destinationId,
      paymentRecordId: run.paymentRecordId ?? primaryDestination?.paymentRecordId,
      employee: run.employee ?? primaryEmployee?.name,
      paycheckAmount: run.paycheckAmount ?? primaryEmployee?.netPay,
      relatedRecords: run.relatedRecords ?? [
        run.id,
        ...(run.employees ?? []).flatMap((employee) => [employee.employeeId, employee.paystub?.id].filter(Boolean)),
      ],
      context: run.context ?? `${run.employeeCount ?? 0} immutable employee paystub snapshots are recorded for this payroll run.`,
      callback: run.callback ?? 'Review trusted business-contact record when verification is required.',
      changeRequest: run.changeRequest ?? 'Request method is not inferred from the payroll record.',
    };
  });
  const data = { companyPayrollProfile, payrollRuns };
  return {
    ...data,
    summary: hasDetailedPayroll
      ? summarizeCompanyPayroll(payrollRuns)
      : summarizeLegacyPayroll(payrollRuns),
    contractIssues: hasDetailedPayroll ? payrollContractIssues(data) : [],
  };
}

export function employeePayrollHistory(payrollWorkspace, employeeId) {
  const company = payrollWorkspace.companyPayrollProfile;
  const paychecks = employeePayrollSnapshots(
    payrollWorkspace.payrollRuns ?? 