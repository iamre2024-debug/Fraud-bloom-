const trainingNames = [
  'Morgan Hale',
  'Casey Lin',
  'Riley Navarro',
  'Dana Mercer',
  'Quinn Patel',
  'Skyler Brooks',
  'Ari Monroe',
  'Taylor Chen',
];

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 100000, 17);
}

function normalized(value = '') {
  return String(value).trim().toLowerCase();
}

function uniqueParties(parties = []) {
  const seen = new Set();
  return parties.filter((party) => {
    const key = party.id ?? `${normalized(party.role)}:${normalized(party.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExistingParty(item, partyRecord, index) {
  const entity = partyRecord.partyType === 'entity' || /business account holder|business\s*\/\s*entity|applicant organization/i.test(partyRecord.role ?? '');
  const seed = stableNumber(`${item.id}-${partyRecord.id ?? index}`);
  return {
    ...partyRecord,
    partyType: entity ? 'entity' : partyRecord.partyType ?? 'person',
    trainingId: entity ? undefined : partyRecord.trainingId ?? `TRN-P-${String(seed).padStart(5, '0')}`,
    businessId: entity ? partyRecord.businessId ?? item.businessId ?? `BIZ-TRN-${String(seed).padStart(5, '0')}` : partyRecord.businessId,
    fictionalEin: entity ? partyRecord.fictionalEin ?? item.fictionalEin ?? `**-***${String(seed).padStart(5, '0').slice(-4)}` : partyRecord.fictionalEin,
    verificationStatus: partyRecord.verificationStatus ?? 'Verification records available for review',
  };
}

function party(caseId, suffix, role, name, relationship, source, extras = {}) {
  const seed = stableNumber(`${caseId}-${suffix}`);
  return {
    id: `${caseId}-PTY-${suffix}`,
    partyType: extras.partyType ?? 'person',
    role,
    name,
    relationship,
    source,
    trainingId: extras.trainingId ?? (extras.partyType === 'entity' ? undefined : `TRN-P-${String(seed).padStart(5, '0')}`),
    verificationStatus: extras.verificationStatus ?? 'Verification records available for review',
    ...extras,
  };
}

function roleMatch(parties, pattern) {
  return parties.find((item) => pattern.test(`${item.role ?? ''} ${item.partyType ?? ''}`));
}

function nameFor(caseId, offset) {
  return trainingNames[(stableNumber(caseId) + offset) % trainingNames.length];
}

function entityName(item) {
  return item.profile?.business
    ?? item.businessProfile?.legalName
    ?? item.toolResults?.business360?.[0]?.entity
    ?? (item.customerType === 'Business' && /llc|inc|corp|company|business/i.test(item.person ?? '') ? item.person : null)
    ?? `${String(item.person ?? 'Harbor Point').replace(/\s+\(Training\)$/i, '')} Training Services LLC`;
}

function employeeName(item) {
  return item.toolResults?.employeeProfile?.[0]?.name
    ?? item.employee?.name
    ?? roleMatch(item.parties ?? [], /employee/i)?.name
    ?? nameFor(item.id, 1);
}

function businessApplicationParties(item, existing) {
  const entity = roleMatch(existing, /business|entity|applicant organization/i)
    ?? party(item.id, 'ENTITY', 'Business / entity', entityName(item), 'Business applying for the fictional financial product', 'Business application', {
      partyType: 'entity',
      businessId: item.businessId ?? `BIZ-TRN-${String(stableNumber(item.id)).padStart(5, '0')}`,
      fictionalEin: item.fictionalEin ?? `**-***${String(stableNumber(item.id)).padStart(5, '0').slice(-4)}`,
      verificationScope: ['Business registration', 'Identifying information', 'Entity address and contact', 'Credit and repayment information'],
    });
  const submitter = roleMatch(existing, /submitter|applicant representative/i)
    ?? party(item.id, 'SUBMITTER', 'Application submitter', item.applicationSubmitter?.name ?? item.person ?? nameFor(item.id, 0), 'Person who submitted the application for the business', 'Application record', {
      verificationScope: ['Identity', 'Authority to submit', 'Contact and device records'],
    });
  const owner = roleMatch(existing, /beneficial owner|ubo/i)
    ?? party(item.id, 'OWNER1', 'Beneficial owner', item.beneficialOwners?.[0]?.name ?? nameFor(item.id, 2), 'Relevant beneficial owner connected to the applicant entity', 'Ownership certification', {
      ownership: item.beneficialOwners?.[0]?.ownership ?? '62% (fictional)',
      verificationScope: ['Identity', 'Ownership', 'Address and contact', 'Cross-account links'],
    });
  const control = roleMatch(existing, /control person|controlling person/i)
    ?? party(item.id, 'CONTROL', 'Control person', item.controlPerson?.name ?? nameFor(item.id, 3), 'Person recorded as controlling business operations', 'Business application', {
      verificationScope: ['Identity', 'Control role', 'Authority', 'Cross-account links'],
    });
  const guarantor = roleMatch(existing, /guarantor/i)
    ?? party(item.id, 'GUARANTOR', 'Personal guarantor', item.personalGuarantor?.name ?? nameFor(item.id, 4), 'Personal guarantor for the fictional credit product', 'Guaranty record', {
      applicability: 'Applicable to this fictional product',
      verificationScope: ['Identity', 'Guaranty', 'Credit and repayment information', 'Cross-account links'],
    });
  const administrator = roleMatch(existing, /authorized administrator|administrator/i)
    ?? party(item.id, 'ADMIN', 'Authorized administrator', item.authorizedAdministrators?.[0]?.name ?? nameFor(item.id, 5), 'Administrator authorized to manage the business relationship', 'Administrator authorization', {
      applicability: 'Applicable to account administration',
      verificationScope: ['Identity', 'Administrative authority', 'Device and session history', 'Cross-account links'],
    });

  return uniqueParties([entity, submitter, owner, control, guarantor, administrator, ...existing]);
}

function payrollParties(item, existing) {
  const workflow = normalized(item.workflowType ?? item.type);
  const isPayrollChange = workflow.includes('payroll-change');
  const entity = roleMatch(existing, /business account holder|business|entity/i)
    ?? party(item.id, 'ENTITY', 'Business account holder', entityName(item), 'Business that owns the payroll or payroll-funding account', 'Business relationship record', {
      partyType: 'entity',
      businessId: item.businessId ?? `BIZ-TRN-${String(stableNumber(item.id)).padStart(5, '0')}`,
      fictionalEin: item.fictionalEin ?? `**-***${String(stableNumber(item.id)).padStart(5, '0').slice(-4)}`,
    });
  const employee = roleMatch(existing, /affected employee|employee/i)
    ?? party(
      item.id,
      'EMPLOYEE',
      'Affected employee',
      isPayrollChange ? employeeName(item) : (item.employee?.name ?? nameFor(item.id, 1)),
      'Employee record affected by the payroll alert',
      'Employee profile',
    );
  const administrator = roleMatch(existing, /authorized administrator|payroll administrator/i)
    ?? party(item.id, 'ADMIN', 'Authorized payroll administrator', nameFor(item.id, 2), 'Administrator recorded on the business payroll profile', 'Administrator profile');
  const initiator = roleMatch(existing, /initiator/i)
    ?? party(item.id, 'INITIATOR', 'Activity initiator', nameFor(item.id, 3), 'Person or administrator recorded as initiating the observed payroll activity', 'Payroll activity log');
  const approver = roleMatch(existing, /approver/i)
    ?? party(item.id, 'APPROVER', 'Activity approver', nameFor(item.id, 4), 'Person or administrator recorded as approving the observed payroll activity', 'Payroll approval log');
  const contact = roleMatch(existing, /trusted business contact|control person|owner/i)
    ?? party(item.id, 'CONTACT', 'Trusted business contact', nameFor(item.id, 5), 'Previously known contact used for business verification', 'Business contact record');

  return uniqueParties([entity, employee, administrator, initiator, approver, contact, ...existing]);
}

function businessAccountParties(item, existing) {
  const entity = roleMatch(existing, /business account holder|business|entity/i)
    ?? party(item.id, 'ENTITY', 'Business account holder', entityName(item), 'Business that owns the account under review', 'Business relationship record', {
      partyType: 'entity',
      businessId: item.businessId ?? `BIZ-TRN-${String(stableNumber(item.id)).padStart(5, '0')}`,
      fictionalEin: item.fictionalEin ?? `**-***${String(stableNumber(item.id)).padStart(5, '0').slice(-4)}`,
    });
  const control = roleMatch(existing, /control person|owner/i)
    ?? party(item.id, 'CONTROL', 'Control person', nameFor(item.id, 2), 'Person recorded as controlling the business relationship', 'Ownership and control record');
  const administrator = roleMatch(existing, /administrator/i)
    ?? party(item.id, 'ADMIN', 'Authorized administrator', nameFor(item.id, 3), 'Administrator authorized on the business account', 'Administrator profile');
  const initiator = roleMatch(existing, /initiator|submitter/i)
    ?? party(item.id, 'INITIATOR', 'Activity initiator', nameFor(item.id, 4), 'Person recorded as initiating the activity under review', 'Activity log');

  return uniqueParties([entity, control, administrator, initiator, ...existing]);
}

export function buildCaseParties(item = {}, existingParties = item.parties ?? []) {
  const existing = uniqueParties(existingParties).map((partyRecord, index) => normalizeExistingParty(item, partyRecord, index));
  if (normalized(item.customerType) !== 'business') return existing;

  const workflow = normalized(item.workflowType ?? item.type);
  const product = normalized(item.productType);
  if (workflow.includes('credit-application') || workflow.includes('credit application')) return businessApplicationParties(item, existing);
  if (workflow.includes('payroll') || product.includes('payroll')) return payrollParties(item, existing);
  return businessAccountParties(item, existing);
}

export function partiesForLinkAnalysis(item = {}) {
  return buildCaseParties(item).filter((item) => item.partyType === 'entity' || item.trainingId);
}
