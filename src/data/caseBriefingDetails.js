import { WORKFLOW_TYPES } from './caseDomain.js';
import { buildCaseParties } from './caseParties.js';
import { publicCaseTaxonomy } from './publicCaseView.js';

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '');
}

function transactionParts(value = '') {
  return String(value).split(' · ').map((part) => part.trim()).filter(Boolean);
}

function dateWithTime(date, time) {
  if (!time) return date;
  if (String(time).includes(String(date)) || /\b\d{4}\b/.test(String(time))) return time;
  return `${date} · ${time}`;
}

function addCalendarDays(value, days) {
  const match = String(value ?? '').match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s+(\d{4})/);
  if (!match) return `${value ?? 'Case opened'} · end of assigned review window`;
  const monthIndex = monthNames.findIndex((month) => match[1].toLowerCase().startsWith(month.toLowerCase()));
  if (monthIndex < 0) return `${value} · end of assigned review window`;

  const date = new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[2]) + days, 12));
  return `${monthNames[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} · 5:00 PM`;
}

function defaultDueDate(item, claimType, reportedDate) {
  const explicit = firstValue(
    item.dueDate,
    item.caseBriefing?.dueDate,
    item.chargebackDecision?.responseDeadline,
    claimType.chargeback?.responseDeadline,
    item.creditDecision?.deadline,
    claimType.credit?.deadline,
  );
  if (explicit) return explicit;

  const priorityDays = { urgent: 1, high: 2, medium: 5, standard: 5, low: 7 };
  const days = priorityDays[String(item.priority ?? 'standard').toLowerCase()] ?? 5;
  return addCalendarDays(reportedDate, days);
}

function assignmentTeam(claimType) {
  const teams = {
    card: 'Card and account review',
    payroll: 'Business payroll review',
    wire: 'Payments investigation',
    credit: 'Credit review',
    loan: 'Business credit review',
  };
  return teams[claimType.taxonomy?.productRail] ?? 'Fraud investigation';
}

function detailRows(rows) {
  return rows
    .map(([label, value]) => ({ label, value: firstValue(value, 'Not supplied') }))
    .filter((row) => row.label);
}

function suppliedParties(item) {
  const parties = item.parties ?? item.caseBriefing?.parties;
  if (!parties?.length) return null;
  return parties.map((party, index) => ({
    ...party,
    id: party.id ?? `${item.id}-PTY-${index + 1}`,
    role: party.role ?? 'Case party',
    name: party.name ?? 'Name not supplied',
    relationship: party.relationship ?? 'Named in the active case packet',
    source: party.source ?? 'Case packet',
  }));
}

function buildParties(item, claimType, scenario, context) {
  const supplied = suppliedParties(item);
  if (supplied) return buildCaseParties(item, supplied);

  const parties = [];
  const seen = new Set();
  const addParty = (role, name, relationship, source) => {
    if (!name) return;
    const key = `${role}:${name}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parties.push({ id: `${item.id}-PTY-${parties.length + 1}`, role, name, relationship, source });
  };

  const role = scenario.entityRole ?? item.profile?.entityRole ?? 'Customer';
  addParty(role, item.person, 'Primary person named in the intake', 'Case intake');

  if (context.business && /business|vendor|payment|owner/i.test(`${role} ${claimType.lane}`)) {
    addParty('Business', context.business, 'Business connected to the active review', 'Business profile');
  }
  const businessSubject = /business|vendor|owner/i.test(`${role} ${claimType.lane}`);
  if (context.employer && !businessSubject && /payroll|employee|credit|application/i.test(`${claimType.id} ${claimType.lane}`)) {
    addParty('Employer', context.employer, 'Employer listed in the case packet', 'Relationship record');
  }
  if (claimType.taxonomy?.productRail === 'card') {
    addParty('Merchant / payee', context.merchant, 'Counterparty tied to the activity in scope', 'Transaction record');
  }
  if (claimType.taxonomy?.productRail === 'wire' && parties.length < 3) {
    addParty('Payment counterparty', context.merchant, 'Counterparty named in the payment instruction', 'Payment record');
  }

  return buildCaseParties(item, parties);
}

function buildDetailSection(item, claimType, scenario, reportedDate, dueDate, context, parties) {
  const supplied = item.briefingDetails ?? item.caseBriefing?.details;
  if (supplied?.rows?.length) return supplied;

  const rail = claimType.taxonomy?.productRail;
  const common = {
    eyebrow: 'Structured case details',
    title: 'Account details',
    rows: [],
  };

  if ([WORKFLOW_TYPES.CARD_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PERSONAL_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.BUSINESS_ACCOUNT_TAKEOVER, WORKFLOW_TYPES.PAYROLL_ACCOUNT_TAKEOVER].includes(claimType.id)) {
    return {
      eyebrow: 'Account access and card activity',
      title: 'Account and transaction details',
      rows: detailRows([
        ['Account holder', item.person],
        ['Activity in scope', context.merchant],
        ['Amount', item.amountExposure ?? item.amount ?? scenario.amount],
        ['Payment instrument', context.instrument],
        ['Transaction channel', context.channel],
        ['Activity date / time', context.activityTime ?? reportedDate],
        ['Linked session', context.session],
        ['Record status', context.status],
      ]),
    };
  }

  if (rail === 'card') {
    return {
      eyebrow: 'Card and merchant activity',
      title: 'Transaction details',
      rows: detailRows([
        ['Cardholder', item.person],
        ['Merchant / payee', context.merchant],
        ['Amount', item.amountExposure ?? item.amount ?? scenario.amount],
        ['Payment instrument', context.instrument],
        ['Transaction type', context.channel],
        ['Posted / reported', context.activityTime ?? reportedDate],
        ['Transaction record', context.recordId],
        ['Record status', context.status],
      ]),
    };
  }

  if (rail === 'payroll') {
    const employee = parties.find((party) => /affected employee|employee/i.test(party.role ?? ''));
    const business = parties.find((party) => party.partyType === 'entity' || /business account holder/i.test(party.role ?? ''));
    const initiator = parties.find((party) => /initiator/i.test(party.role ?? ''));
    const approver = parties.find((party) => /approver/i.test(party.role ?? ''));
    return {
      eyebrow: 'Employee and pay destination',
      title: 'Payroll details',
      rows: detailRows([
        ['Business account holder', business?.name ?? context.business ?? context.employer],
        ['Affected employee', employee?.name ?? item.person],
        ['Initiator', initiator?.name ?? 'Review administrator activity'],
        ['Approver', approver?.name ?? 'Review approval activity'],
        ['Change in scope', context.merchant],
        ['Payroll amount', item.amountExposure ?? item.amount ?? scenario.amount],
        ['Destination', context.destination],
        ['Reported / effective date', reportedDate],
        ['Recent payroll record', context.payrollRecord],
        ['Payment record', context.paymentRecord],
      ]),
    };
  }

  if (rail === 'wire') {
    const initiator = parties.find((party) => /initiator|submitter/i.test(party.role ?? ''));
    return {
      eyebrow: 'Payment instruction and destination',
      title: 'Payment instruction details',
      rows: detailRows([
        ['Business / originator', context.business],
        ['Requesting contact', initiator?.name ?? item.person],
        ['Instruction in scope', context.merchant],
        ['Amount', item.amountExposure ?? item.amount ?? scenario.amount],
        ['Beneficiary / destination', context.destination],
        ['Payment rail', claimType.shortLabel ?? claimType.label],
        ['Instruction date', reportedDate],
        ['Payment record', context.paymentRecord ?? context.recordId],
      ]),
    };
  }

  if (rail === 'credit' || rail === 'loan') {
    const isApplication = claimType.id === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW;
    const isBusiness = item.customerType === 'business';
    if (isApplication && isBusiness) {
      const entities = parties.filter((party) => party.partyType === 'entity' || /business.*entity/i.test(party.role ?? ''));
      const submitters = parties.filter((party) => /submitter/i.test(party.role ?? ''));
      const owners = parties.filter((party) => /beneficial owner/i.test(party.role ?? ''));
      const controls = parties.filter((party) => /control person/i.test(party.role ?? ''));
      const guarantors = parties.filter((party) => /guarantor/i.test(party.role ?? ''));
      const administrators = parties.filter((party) => /administrator/i.test(party.role ?? ''));
      return {
        eyebrow: 'Business application and party verification',
        title: 'Business application details',
        rows: detailRows([
          ['Business / entity', entities.map((party) => party.name).join(' · ')],
          ['Application submitter', submitters.map((party) => party.name).join(' · ')],
          ['Beneficial owners', owners.map((party) => party.name).join(' · ')],
          ['Control person', controls.map((party) => party.name).join(' · ')],
          ['Personal guarantor', guarantors.map((party) => party.name).join(' · ') || 'Not applicable to this fictional product'],
          ['Authorized administrators', administrators.map((party) => party.name).join(' · ') || 'Not applicable to this fictional product'],
          ['Product / requested exposure', `${publicCaseTaxonomy(item).productType} · ${item.amountExposure ?? item.amount ?? scenario.amount}`],
          ['Review due', dueDate],
        ]),
      };
    }
    return {
      eyebrow: isApplication ? 'Application and identity record' : 'Credit request and exposure',
      title: isApplication ? 'Application details' : rail === 'loan' ? 'Business credit details' : 'Credit details',
      rows: detailRows([
        [isApplication ? 'Applicant' : 'Customer / applicant', item.person],
        ['Review workflow', publicCaseTaxonomy(item).workflowType],
        ['Request / exposure', item.amountExposure ?? item.amount ?? scenario.amount],
        ['Product / account context', context.primaryDetails],
        ['Relationship history', context.relationship],
        ['Employer / business', rail === 'loan' ? context.business : context.employer ?? context.business],
        ['Payment destination', context.destination],
        ['Review due', dueDate],
      ]),
    };
  }

  return {
    ...common,
    rows: detailRows([
      ['Primary person', item.person],
      ['Customer type', publicCaseTaxonomy(item).customerType],
      ['Product', publicCaseTaxonomy(item).productType],
      ['Review workflow', publicCaseTaxonomy(item).workflowType],
      ['Amount / exposure', item.amountExposure ?? item.amount ?? scenario.amount],
      ['Primary details', context.primaryDetails],
      ['Reported date', reportedDate],
    ]),
  };
}

export function buildCaseBriefingPacket({ item, claimType, scenario, reportedDate }) {
  const parts = transactionParts(item.transactionInfo ?? scenario.transactionInfo);
  const firstTransaction = item.toolResults?.transactions?.[0];
  const payment = item.toolResults?.paymentVerification?.[0];
  const payroll = item.toolResults?.payrollRuns?.at(-1);
  const employee = item.toolResults?.employeeProfile?.[0];
  const businessRecord = item.toolResults?.business360?.[0];
  const activityEvent = item.events?.find((event) => /transaction|purchase|payment|limit|credit|payroll/i.test(`${event.label} ${event.object}`));
  const profileChange = item.customer?.profileChanges?.find((event) => /destination|payment|deposit/i.test(`${event.item} ${event.eventType}`));
  const relationshipRecord = item.customer?.relationship?.find((record) => /relationship age|relationship context/i.test(record.label));
  const assignedInvestigator = firstValue(item.assignedInvestigator, item.caseBriefing?.assignedInvestigator, 'Learner Agent');
  const assignedDate = firstValue(
    item.assignedDate,
    item.caseBriefing?.assignedDate,
    dateWithTime(reportedDate, item.intake?.contactTime),
  );
  const dueDate = defaultDueDate(item, claimType, reportedDate);
  const context = {
    merchant: firstValue(firstTransaction?.merchant, parts[0], claimType.shortLabel),
    channel: firstValue(parts[1], firstTransaction?.channel, claimType.taxonomy?.lifecycleStage),
    instrument: firstValue(parts[2], firstTransaction?.instrument, claimType.taxonomy?.productRail),
    activityTime: firstValue(activityEvent?.time, firstTransaction?.posted, reportedDate),
    session: firstValue(item.loginHistory?.[0]?.session, 'No linked session supplied'),
    status: firstValue(firstTransaction?.status, 'Case record available'),
    recordId: firstValue(firstTransaction?.id, activityEvent?.id, `${item.id}-DETAIL-1`),
    destination: firstValue(payment?.destinationId, profileChange?.newValue, parts[2], 'Destination record available'),
    paymentRecord: firstValue(payment?.id, `${item.id}-PAYMENT-1`),
    payrollRecord: firstValue(payroll ? `${payroll.payPeriod?.label ?? payroll.payDate} · ${payroll.employeeCount} employees` : null, 'Payroll history available'),
    employer: firstValue(item.profile?.employer, employee?.employer),
    business: firstValue(item.profile?.business, businessRecord?.entity),
    relationship: firstValue(
      relationshipRecord?.value,
      item.customer?.relationshipSince ? `Since ${item.customer.relationshipSince}` : null,
      'Relationship record available',
    ),
    primaryDetails: firstValue(item.transactionInfo, scenario.transactionInfo),
  };
  const parties = buildParties(item, claimType, scenario, context);
  const details = buildDetailSection(item, claimType, scenario, reportedDate, dueDate, context, parties);

  return {
    assignedInvestigator,
    assignedDate,
    assignmentTeam: firstValue(item.assignmentTeam, item.caseBriefing?.assignmentTeam, assignmentTeam(claimType)),
    dueDate,
    parties,
    details,
  };
}
