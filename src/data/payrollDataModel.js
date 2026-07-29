const cents = (value = 0) => Math.round((Number(value) || 0) * 100) / 100;

function asDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function onOrBefore(left, right) {
  const leftDate = asDate(left);
  const rightDate = asDate(right);
  if (!leftDate || !rightDate) return String(left) <= String(right);
  return leftDate.getTime() <= rightDate.getTime();
}

function valueAt(history = [], effectiveDate, fallback = 0) {
  return [...history]
    .filter((entry) => onOrBefore(entry.effectiveDate, effectiveDate))
    .sort((left, right) => (asDate(left.effectiveDate)?.getTime() ?? 0) - (asDate(right.effectiveDate)?.getTime() ?? 0))
    .at(-1)?.value ?? fallback;
}

function paymentPlanAt(history = [], payDate) {
  return [...history]
    .filter((entry) => onOrBefore(entry.effectiveDate, payDate))
    .sort((left, right) => (asDate(left.effectiveDate)?.getTime() ?? 0) - (asDate(right.effectiveDate)?.getTime() ?? 0))
    .at(-1) ?? null;
}

function currentAndYtd(items, ytdState, stateKey) {
  return items.map((item) => {
    const key = `${stateKey}:${item.type}`;
    const current = cents(item.current);
    const ytd = cents((ytdState[key] ?? item.openingYtd ?? 0) + current);
    ytdState[key] = ytd;
    return { ...item, current, ytd };
  });
}

function seedOpeningYtd(items, openingTotal = 0) {
  const total = cents(openingTotal);
  if (!items.length || !total) return items;
  const currentTotal = cents(items.reduce((sum, item) => sum + Math.max(0, Number(item.current) || 0), 0));
  let allocated = 0;
  return items.map((item, index) => {
    const isLast = index === items.length - 1;
    const openingYtd = isLast
      ? cents(total - allocated)
      : cents(currentTotal ? total * ((Number(item.current) || 0) / currentTotal) : total / items.length);
    allocated = cents(allocated + openingYtd);
    return { ...item, openingYtd };
  });
}

function allocateDestinations(plan, netPay, paystubId, settlementDate) {
  if (!plan || plan.method === 'Paper check') {
    return [{
      id: `${paystubId}-PMT-1`,
      method: 'Paper check',
      bankCode: 'Not applicable',
      destinationId: 'Not applicable',
      amount: cents(netPay),
      status: plan?.status ?? 'Issued',
      settlementDate,
      paymentRecordId: plan?.paymentRecordId ?? `${paystubId}-CHECK`,
      checkNumber: plan?.checkNumber ?? `CHK-${paystubId.replace(/\D/g, '').slice(-6).padStart(6, '0')}`,
      firstSeen: plan?.effectiveDate ?? settlementDate,
    }];
  }

  const configured = plan.destinations?.length ? plan.destinations : [];
  let allocated = 0;
  return configured.map((destination, index) => {
    const finalDestination = index === configured.length - 1;
    const amount = finalDestination
      ? cents(netPay - allocated)
      : cents(destination.amount ?? (netPay * (destination.percentage ?? 0)));
    allocated = cents(allocated + amount);
    return {
      id: destination.id ?? `${paystubId}-PMT-${index + 1}`,
      method: plan.method ?? (configured.length > 1 ? 'Split direct deposit' : 'Direct deposit'),
      bankCode: destination.bankCode,
      destinationId: destination.destinationId,
      amount,
      status: destination.status ?? plan.status ?? 'Settled',
      settlementDate,
      paymentRecordId: destination.paymentRecordId ?? plan.paymentRecordId ?? null,
      checkNumber: 'Not applicable',
      firstSeen: destination.firstSeen ?? plan.effectiveDate,
    };
  });
}

function employeePaystub({ company, employee, run, ytdState, runIndex }) {
  const rate = cents(valueAt(employee.rateHistory, run.payDate, employee.rate ?? 0));
  const hours = employee.hoursByRun?.[run.id] ?? employee.regularHours ?? 80;
  const regularHours = cents(hours.regular ?? hours);
  const overtimeHours = cents(hours.overtime ?? 0);
  const ptoHours = cents(hours.pto ?? 0);
  const bonus = cents(hours.bonus ?? 0);
  const commission = cents(hours.commission ?? 0);
  const regularAmount = cents(regularHours * rate);
  const overtimeAmount = cents(overtimeHours * rate * 1.5);
  const ptoAmount = cents(ptoHours * rate);
  const earningsInput = [
    { type: 'Regular', hours: regularHours, rate, current: regularAmount },
    ...(overtimeHours ? [{ type: 'Overtime', hours: overtimeHours, rate: cents(rate * 1.5), current: overtimeAmount }] : []),
    ...(ptoHours ? [{ type: 'PTO', hours: ptoHours, rate, current: ptoAmount }] : []),
    ...(bonus ? [{ type: 'Bonus', hours: 'Not applicable', rate: 'Not applicable', current: bonus }] : []),
    ...(commission ? [{ type: 'Commission', hours: 'Not applicable', rate: 'Not applicable', current: commission }] : []),
  ];
  const earnings = currentAndYtd(
    seedOpeningYtd(earningsInput, employee.ytdOpening?.grossPay),
    ytdState,
    `${employee.id}:earnings`,
  );
  const grossPay = cents(earnings.reduce((total, item) => total + item.current, 0));
  const taxes = currentAndYtd(seedOpeningYtd([
    { type: 'Federal income tax', current: cents(grossPay * (employee.federalTaxRate ?? 0.08)) },
    { type: 'Social Security', current: cents(grossPay * 0.062) },
    { type: 'Medicare', current: cents(grossPay * 0.0145) },
    { type: 'State tax', current: cents(grossPay * (employee.stateTaxRate ?? 0)) },
    { type: 'Local tax', current: cents(grossPay * (employee.localTaxRate ?? 0)) },
  ], employee.ytdOpening?.employeeTaxes), ytdState, `${employee.id}:taxes`);
  const deductions = currentAndYtd(seedOpeningYtd([
    ...(employee.healthDeduction ? [{ type: 'Health', current: employee.healthDeduction }] : []),
    ...(employee.dentalDeduction ? [{ type: 'Dental', current: employee.dentalDeduction }] : []),
    ...(employee.retirementRate ? [{ type: 'Retirement', current: cents(grossPay * employee.retirementRate) }] : []),
    ...(employee.garnishment ? [{ type: 'Garnishment', current: employee.garnishment }] : []),
  ], employee.ytdOpening?.employeeDeductions), ytdState, `${employee.id}:deductions`);
  const employerContributions = currentAndYtd(seedOpeningYtd([
    ...(employee.employerHealthContribution ? [{ type: 'Employer health', current: employee.employerHealthContribution }] : []),
    ...(employee.employerRetirementRate ? [{ type: 'Employer retirement', current: cents(grossPay * employee.employerRetirementRate) }] : []),
  ], employee.ytdOpening?.employerContributions), ytdState, `${employee.id}:contributions`);
  const reimbursementAmount = cents(employee.reimbursementsByRun?.[run.id] ?? (runIndex % 3 === 2 ? employee.standardReimbursement ?? 0 : 0));
  const adjustmentAmount = cents(employee.adjustmentsByRun?.[run.id] ?? 0);
  const reimbursements = currentAndYtd(
    seedOpeningYtd(
      reimbursementAmount ? [{ type: 'Expense reimbursement', current: reimbursementAmount }] : [],
      employee.ytdOpening?.reimbursements,
    ),
    ytdState,
    `${employee.id}:reimbursements`,
  );
  const adjustments = currentAndYtd(
    adjustmentAmount ? [{ type: 'Payroll adjustment', current: adjustmentAmount }] : [],
    ytdState,
    `${employee.id}:adjustments`,
  );
  const employeeTaxes = cents(taxes.reduce((total, item) => total + item.current, 0));
  const employeeDeductions = cents(deductions.reduce((total, item) => total + item.current, 0));
  const employerContributionTotal = cents(employerContributions.reduce((total, item) => total + item.current, 0));
  const reimbursementsTotal = cents(reimbursements.reduce((total, item) => total + item.current, 0));
  const adjustmentsTotal = cents(adjustments.reduce((total, item) => total + item.current, 0));
  const employerTaxes = cents(grossPay * (employee.employerTaxRate ?? 0.0815));
  const netPay = cents(grossPay - employeeTaxes - employeeDeductions + reimbursementsTotal + adjustmentsTotal);
  const totalPayrollCost = cents(grossPay + employerTaxes + employerContributionTotal + reimbursementsTotal + adjustmentsTotal);
  const paystubId = `${run.id}-${employee.id}-STUB`;
  const paymentPlan = paymentPlanAt(employee.paymentHistory, run.payDate);
  const paymentDestinations = allocateDestinations(paymentPlan, netPay, paystubId, run.settlementDate);
  const summaryStateKey = `${employee.id}:summary`;
  const priorSummary = ytdState[summaryStateKey] ?? {
    grossPay: employee.ytdOpening?.grossPay ?? 0,
    employeeTaxes: employee.ytdOpening?.employeeTaxes ?? 0,
    employeeDeductions: employee.ytdOpening?.employeeDeductions ?? 0,
    employerContributions: employee.ytdOpening?.employerContributions ?? 0,
    reimbursements: employee.ytdOpening?.reimbursements ?? 0,
    netPay: employee.ytdOpening?.netPay ?? 0,
  };
  const ytdSnapshot = {
    grossPay: cents(priorSummary.grossPay + grossPay),
    employeeTaxes: cents(priorSummary.employeeTaxes + employeeTaxes),
    employeeDeductions: cents(priorSummary.employeeDeductions + employeeDeductions),
    employerContributions: cents(priorSummary.employerContributions + employerContributionTotal),
    reimbursements: cents(priorSummary.reimbursements + reimbursementsTotal),
    netPay: cents(priorSummary.netPay + netPay),
  };
  ytdState[summaryStateKey] = ytdSnapshot;

  return {
    id: paystubId,
    employer: {
      legalName: company.legalName,
      address: company.address,
      maskedEin: company.maskedEin,
    },
    employee: {
      legalName: employee.name,
      address: employee.address,
      employeeId: employee.id,
    },
    payPeriod: { start: run.payPeriodStart, end: run.payPeriodEnd, label: `${run.payPeriodStart} – ${run.payPeriodEnd}` },
    payDate: run.payDate,
    payrollType: run.runType,
    earnings,
    taxes,
    deductions,
    employerContributions,
    reimbursements,
    adjustments,
    paymentDestinations,
    summary: {
      grossPay,
      employeeTaxes,
      employerTaxes,
      employeeDeductions,
      employerContributions: employerContributionTotal,
      reimbursements: reimbursementsTotal,
      adjustments: adjustmentsTotal,
      totalDeductions: cents(employeeTaxes + employeeDeductions),
      netPay,
      totalPayrollCost,
    },
    ytdSnapshot,
  };
}

function runTotals(employees) {
  const totals = employees.reduce((summary, employee) => {
    const values = employee.paystub.summary;
    summary.grossWages += values.grossPay;
    summary.employeeTaxes += values.employeeTaxes;
    summary.employerTaxes += values.employerTaxes;
    summary.deductions += values.employeeDeductions;
    summary.employerContributions += values.employerContributions;
    summary.reimbursements += values.reimbursements;
    summary.netPay += values.netPay;
    summary.totalPayrollCost += values.totalPayrollCost;
    return summary;
  }, {
    grossWages: 0,
    employeeTaxes: 0,
    employerTaxes: 0,
    deductions: 0,
    employerContributions: 0,
    reimbursements: 0,
    netPay: 0,
    totalPayrollCost: 0,
  });
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, cents(value)]));
}

export function createCompanyPayrollData({ companyPayrollProfile, employeeProfiles, runDefinitions }) {
  const ytdState = {};
  const sortedRuns = [...runDefinitions].sort((left, right) => (
    (asDate(left.payDate)?.getTime() ?? 0) - (asDate(right.payDate)?.getTime() ?? 0)
  ));
  const payrollRuns = sortedRuns.map((run, runIndex) => {
    const runEmployees = run.employeeIds?.length
      ? employeeProfiles.filter((employee) => run.employeeIds.includes(employee.id))
      : employeeProfiles;
    const employees = runEmployees.map((employee) => {
      const paystub = employeePaystub({
        company: companyPayrollProfile,
        employee,
        run,
        ytdState,
        runIndex,
      });
      const destinationStatuses = [...new Set(paystub.paymentDestinations.map((item) => item.status).filter(Boolean))];
      return {
        employeeId: employee.id,
        name: employee.name,
        department: employee.department,
        payType: employee.payType,
        regularHours: paystub.earnings.find((item) => item.type === 'Regular')?.hours ?? 0,
        overtimeHours: paystub.earnings.find((item) => item.type === 'Overtime')?.hours ?? 0,
        grossPay: paystub.summary.grossPay,
        taxes: paystub.summary.employeeTaxes,
        deductions: paystub.summary.employeeDeductions,
        netPay: paystub.summary.netPay,
        paymentMethod: paystub.paymentDestinations.length > 1
          ? 'Split direct deposit'
          : paystub.paymentDestinations[0]?.method ?? 'Not recorded',
        paymentStatus: destinationStatuses.join(' · ') || 'Recorded',
        paystub,
      };
    });
    const totals = runTotals(employees);
    return {
      id: run.id,
      payPeriod: { start: run.payPeriodStart, end: run.payPeriodEnd, label: `${run.payPeriodStart} – ${run.payPeriodEnd}` },
      payDate: run.payDate,
      runType: run.runType ?? 'Regular',
      status: run.status ?? 'Completed',
      employeeCount: employees.length,
      ...totals,
      totalCompanyDebit: totals.totalPayrollCost,
      totalFundingAmount: totals.totalPayrollCost,
      companyFunding: {
        bankCode: run.fundingBankCode,
        accountUsed: run.fundingAccount,
        paymentRecordId: run.fundingPaymentRecordId ?? null,
      },
      submissionDate: run.submissionDate,
      settlementDate: run.settlementDate,
      submittedBy: run.submittedBy,
      approvedBy: run.approvedBy,
      employees,
    };
  });

  return {
    companyPayrollProfile: {
      ...companyPayrollProfile,
      activeEmployeeCount: companyPayrollProfile.activeEmployeeCount ?? employeeProfiles.length,
    },
    payrollRuns,
  };
}

export function summarizeCompanyPayroll(payrollRuns = []) {
  const employeeIds = new Set();
  const summary = payrollRuns.reduce((totals, run) => {
    run.employees.forEach((employee) => employeeIds.add(employee.employeeId));
    totals.totalPayrollCost += run.totalPayrollCost;
    totals.grossWages += run.grossWages;
    totals.employeeTaxes += run.employeeTaxes;
    totals.employerTaxes += run.employerTaxes;
    totals.deductions += run.deductions;
    totals.employerContributions += run.employerContributions;
    totals.reimbursements += run.reimbursements;
    totals.netPay += run.netPay;
    totals.totalFundingAmount += run.totalFundingAmount;
    return totals;
  }, {
    totalPayrollCost: 0,
    grossWages: 0,
    employeeTaxes: 0,
    employerTaxes: 0,
    deductions: 0,
    employerContributions: 0,
    reimbursements: 0,
    netPay: 0,
    totalFundingAmount: 0,
  });
  return {
    ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, cents(value)])),
    employeesPaid: employeeIds.size,
  };
}

export function payrollContractIssues(data = {}) {
  const issues = [];
  if (!data.companyPayrollProfile && !(data.payrollRuns ?? []).length) return issues;
  if (!data.companyPayrollProfile?.legalName) issues.push('Company payroll profile is missing its legal name.');
  for (const run of data.payrollRuns ?? []) {
    const reconciled = runTotals(run.employees ?? []);
    for (const key of Object.keys(reconciled)) {
      if (cents(run[key]) !== cents(reconciled[key])) issues.push(`${run.id} does not reconcile ${key}.`);
    }
    if (run.employeeCount !== run.employees?.length) issues.push(`${run.id} employee count does not match its employee rows.`);
    for (const employee of run.employees ?? []) {
      const destinations = employee.paystub?.paymentDestinations ?? [];
      const destinationTotal = cents(destinations.reduce((total, destination) => total + Number(destination.amount || 0), 0));
      if (destinationTotal !== cents(employee.netPay)) issues.push(`${employee.paystub?.id} payment destinations do not equal net pay.`);
      for (const destination of destinations) {
        if (!onOrBefore(destination.firstSeen, run.payDate)) issues.push(`${employee.paystub?.id} uses a destination before its first-seen date.`);
      }
    }
  }
  return issues;
}
