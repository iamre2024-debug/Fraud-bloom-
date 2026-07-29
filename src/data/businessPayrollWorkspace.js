import { getBusinessRecords, getFinancialRecords } from './caseToolData.js';
import { getBusinessResearch } from './businessResearchRecords.js';
import { payrollContractIssues, summarizeCompanyPayroll } from './payrollDataModel.js';
import { WORKFLOW_TYPES } from './caseDomain.js';
import { buildCaseParties } from './caseParties.js';

function amountValue(value = '') {
  const source = String(value ?? '').trim();
  const parsed = Number(source.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) return 0;
  return /^\(.*\)$/.test(source) ? -Math.abs(parsed) : parsed;
}

function transactionCategory(item) {
  if (/recurring/i.test(item.channel)) return 'Recurring';
  if (/transfer|destination|account request|payment setup/i.test(`${item.merchant} ${item.channel}`)) return 'Account activity';
  if (/fuel/i.test(item.merchant)) return 'Fuel';
  if (/grocery/i.test(item.merchant)) return 'Grocery';
  return 'Digital goods';
}

function transactionLocation(item) {
  if (/card present/i.test(item.channel)) return 'Merchant location recorded in training packet';
  if (/recurring/i.test(item.channel)) return 'Merchant billing location not supplied';
  if (/account request|payment setup/i.test(item.channel)) return 'Internal account workspace';
  return 'Online merchant location not supplied';
}

function transactionEntryMode(item) {
  if (/card not present/i.test(item.channel)) return 'Card not present';
  if (/card present/i.test(item.channel)) return 'Chip / card present';
  if (/recurring/i.test(item.channel)) return 'Stored credential / recurring';
  if (/payment setup/i.test(item.channel)) return 'Profile setup';
  return 'Internal request';
}

export function getTransactionHistory(activeCase) {
  const financial = getFinancialRecords(activeCase);
  return financial.transactions.map((item) => ({
    ...item,
    amountValue: amountValue(item.amount),
    direction: amountValue(item.amount) > 0
      ? 'Debit'
      : amountValue(item.amount) < 0
        ? 'Credit'
        : 'Non-monetary',
    category: transactionCategory(item),
    location: transactionLocation(item),
    entryMode: transactionEntryMode(item),
    relatedRecords: [
      item.id,
      ...((financial.paymentVerification ?? [])
        .filter((record) => record.relatedRecords?.includes(item.id))
        .map((record) => record.id)),
    ],
    relatedDocuments: activeCase.documents?.slice(0, 2).map((document) => document.id ?? document.title ?? document.name) ?? [],
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

export function getEmployeeProfiles(activeCase) {
  const records = getBusinessRecords(activeCase);
  const payrollRuns = records.payrollRuns ?? [];
  return (records.employeeProfile ?? []).map((employee) => {
    const paychecks = payrollRuns
      .flatMap((run) => run.employees ?? [])
      .filter((runEmployee) => runEmployee.employeeId === employee.id)
      .map((runEmployee) => runEmployee.paystub.id);
    const currentPaymentPlan = employee.paymentHistory?.at(-1);
    return {
      ...employee,
      status: employee.employmentStatus ?? employee.status ?? 'Recorded',
      lastSeen: payrollRuns.at(-1)?.payDate ?? employee.lastSeen ?? 'Not supplied',
      employmentTimeline: `${employee.hireDate ?? 'Hire date not supplied'} – ${employee.employmentStatus ?? 'Status not supplied'}`,
      officialContact: employee.officialContact ?? 'Employer payroll office on file',
      directDeposit: currentPaymentPlan?.method === 'Paper check'
        ? 'Paper check · destination identifiers are not applicable'
        : `${currentPaymentPlan?.method ?? 'Payment method recorded'} · event-level destination identifiers are shown only on paystubs`,
      linkedPayroll: paychecks,
      employer: employee.employer ?? records.companyPayrollProfile?.legalName ?? 'Employer not supplied',
      role: employee.role ?? employee.position ?? 'Employee',
      department: employee.department ?? 'Not supplied',
    };
  });
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
  const sourceRuns = records.payrollRuns?.length ? records.payrollRuns : legacyRows.map((row, index) => {
    const total = amountValue(row.totalCompanyDebit ?? row.amount);
    const employeeId = row.employeeId ?? `${activeCase.id}-LEGACY-EMP-${index + 1}`;
    const paystubId = `${row.id}-STUB`;
    const paymentDestination = {
      id: `${paystubId}-PMT-1`,
      method: row.paymentMethod ?? 'Preserved payroll payment',
      bankCode: row.bankCode ?? 'Not supplied',
      destinationId: row.destinationId ?? 'Not supplied',
      amount: total,
      status: row.fundingStatus ?? row.status ?? 'Recorded',
      settlementDate: row.processedDate ?? row.period,
      paymentRecordId: row.paymentRecordId ?? null,
      checkNumber: 'Not applicable',
      firstSeen: row.processedDate ?? row.period,
    };
    const paystub = {
      id: paystubId,
      employer: { legalName: row.employer, address: companyPayrollProfile?.address, maskedEin: companyPayrollProfile?.maskedEin },
      employee: { legalName: row.employee ?? 'Employee detail not supplied', address: 'Not supplied', employeeId },
      payPeriod: { start: row.payPeriodStart ?? row.period, end: row.payPeriodEnd ?? row.period, label: row.period },
      payDate: row.processedDate ?? row.period,
      payrollType: row.runType ?? 'Preserved payroll run',
      earnings: [{ type: 'Preserved gross payroll', hours: 'Not supplied', rate: 'Not supplied', current: total, ytd: total }],
      taxes: [],
      deductions: [],
      employerContributions: [],
      reimbursements: [],
      adjustments: [],
      paymentDestinations: [paymentDestination],
      summary: { grossPay: total, employeeTaxes: 0, employerTaxes: 0, employeeDeductions: 0, employerContributions: 0, reimbursements: 0, netPay: total, totalPayrollCost: total, totalDeductions: 0 },
      ytdSnapshot: { grossPay: total, netPay: total },
    };
    return {
      ...row,
      payPeriod: paystub.payPeriod,
      payDate: paystub.payDate,
      runType: row.runType ?? 'Preserved payroll run',
      status: row.status ?? 'Recorded',
      employeeCount: row.employeeCount ?? 1,
      grossWages: total,
      employeeTaxes: 0,
      employerTaxes: 0,
      deductions: 0,
      employerContributions: 0,
      reimbursements: 0,
      netPay: total,
      totalPayrollCost: total,
      totalCompanyDebit: total,
      totalFundingAmount: total,
      companyFunding: { bankCode: row.fundingSource ?? row.bankCode ?? 'Not supplied', accountUsed: row.fundingAccount ?? 'Not supplied', paymentRecordId: row.paymentRecordId ?? null },
      employees: [{ employeeId, name: paystub.employee.legalName, department: 'Not supplied', payType: 'Not supplied', regularHours: 0, overtimeHours: 0, grossPay: total, taxes: 0, deductions: 0, netPay: total, paymentMethod: paymentDestination.method, paymentStatus: paymentDestination.status, paystub }],
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
    summary: summarizeCompanyPayroll(payrollRuns),
    contractIssues: records.payrollRuns?.length ? payrollContractIssues(data) : [],
  };
}

export function employeePayrollHistory(payrollWorkspace, employeeId) {
  const company = payrollWorkspace.companyPayrollProfile;
  const paychecks = payrollWorkspace.payrollRuns
    .flatMap((run) => run.employees.map((employee) => ({
      ...employee,
      runId: run.id,
      payDate: run.payDate,
      payPeriod: run.payPeriod,
      payrollType: run.runType,
      company: company?.legalName,
    })))
    .filter((employee) => employee.employeeId === employeeId)
    .sort((left, right) => new Date(right.payDate).getTime() - new Date(left.payDate).getTime());
  return {
    employee: paychecks[0] ?? null,
    paychecks,
    selectedYear: paychecks[0]?.payDate?.match(/\d{4}/)?.[0] ?? 'Not supplied',
    paycheckCount: paychecks.length,
    ytdGross: paychecks[0]?.paystub?.ytdSnapshot?.grossPay ?? 0,
    ytdNet: paychecks[0]?.paystub?.ytdSnapshot?.netPay ?? 0,
  };
}

export function findPayrollRecord(payrollWorkspace, value = '') {
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  for (const run of payrollWorkspace.payrollRuns ?? []) {
    if (run.id.toLowerCase() === normalized) return { type: 'run', run };
    for (const employee of run.employees ?? []) {
      if (employee.employeeId.toLowerCase() === normalized) return { type: 'employee', run, employee };
      if (employee.paystub.id.toLowerCase() === normalized) return { type: 'paystub', run, employee, paystub: employee.paystub };
      const destination = employee.paystub.paymentDestinations.find((item) => (
        [item.bankCode, item.destinationId, item.paymentRecordId].some((candidate) => String(candidate ?? '').toLowerCase() === normalized)
      ));
      if (destination) return { type: 'paystub', run, employee, paystub: employee.paystub, destination };
    }
  }
  return null;
}

export function getPayrollAccessContext(activeCase) {
  if (activeCase.workflowType !== WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER) return null;
  const parties = buildCaseParties(activeCase);
  const login = activeCase.loginHistory?.[0] ?? {};
  const businessRecords = getBusinessRecords(activeCase);
  const financialRecords = getFinancialRecords(activeCase);
  const payrollRecords = businessRecords.payrollRuns ?? [];
  const destinationRecords = financialRecords.paymentVerification ?? [];
  const initiator = parties.find((party) => /initiator/i.test(party.role ?? ''));
  const approver = parties.find((party) => /approver/i.test(party.role ?? ''));
  const administrator = parties.find((party) => /administrator/i.test(party.role ?? ''));
  const recoveryDocument = (activeCase.documents ?? []).find((document) => /recover|recall|return/i.test(`${document.name ?? document.title} ${document.detail ?? ''}`));
  const abnormalSamePerson = Boolean(initiator?.name && approver?.name && initiator.name === approver.name);

  return {
    initiator: initiator?.name ?? 'Initiator record not supplied',
    approver: approver?.name ?? 'Approver record not supplied',
    administrator: administrator?.name ?? 'Administrator record not supplied',
    approvalSeparation: abnormalSamePerson
      ? 'The same person initiated and approved; compare this with the business baseline.'
      : 'Separate initiator and approver records are available.',
    deviceId: login.deviceId ?? login.device ?? 'Device record not supplied',
    ipAddress: login.ip ?? 'IP record not supplied',
    sessionId: login.session ?? login.sessionReference ?? 'Session record not supplied',
    payrollHistory: `${payrollRecords.length} payroll record${payrollRecords.length === 1 ? '' : 's'} available`,
    destinationChanges: `${destinationRecords.length} payment or destination record${destinationRecords.length === 1 ? '' : 's'} available`,
    fundsStatus: financialRecords.transactions?.[0]?.status ?? 'Funds status not supplied',
    recoveryInformation: recoveryDocument?.detail ?? 'No recovery or recall result is recorded yet.',
  };
}
