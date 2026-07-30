import assert from 'node:assert/strict';
import { trainingCases } from '../src/data/cases.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { getCustomer360Dossier } from '../src/data/customer360Dossier.js';
import { getBusiness360Dossier } from '../src/data/business360Dossier.js';
import { getFinancialInvestigation } from '../src/data/financialInvestigationRecords.js';
import { getPayrollHistory } from '../src/data/businessPayrollWorkspace.js';
import {
  getIdentityIntelContextCase,
  getIdentityIntelReport,
  matchesIdentityIntelSearch,
} from '../src/data/identityIntelReport.js';

const forbiddenPreDecisionCopy = /\b(?:confirmed fraud|fraud confirmed|fraud score|fraud rule|automatic risk|accepted determination|correct determination|correct answer|scenario truth|synthetic identity|bust[- ]out|first[- ]party fraud|mule activity|email compromise|compromised mailbox)\b/i;
const unavailableCustomerField = 'Not available in the current training record';

function generated(options) {
  return createGeneratedCase({
    difficulty: 'standard',
    evidenceDepth: 'deep',
    ...options,
  });
}

function sectionIds(financial) {
  return financial.sections.map((section) => section.id);
}

function assertSharedAccountValues(accounts, financial, label) {
  const financialAccounts = financial.profile.accounts;
  assert.equal(financialAccounts.length, accounts.length, `${label}: account count`);
  for (const account of accounts) {
    const counterpart = financialAccounts.find((item) => item.accountId === account.accountId);
    assert.ok(counterpart, `${label}: ${account.accountId} appears in both workspaces`);
    assert.equal(counterpart.currentBalance, account.currentBalance, `${label}: current balance`);
    assert.equal(counterpart.availableBalance, account.availableBalance, `${label}: available balance`);
    assert.equal(counterpart.availableCredit, account.availableCredit, `${label}: available credit`);
    assert.equal(counterpart.creditLimit, account.creditLimit, `${label}: credit limit`);
    assert.equal(counterpart.originalLoanAmount, account.originalLoanAmount, `${label}: original loan amount`);
    assert.equal(counterpart.scheduledPayment, account.scheduledPayment, `${label}: scheduled payment`);
  }
}

function assertDateAggregations(analysis, label) {
  const expected = Number(analysis.visibleTotal.toFixed(2));
  for (const granularity of ['day', 'week', 'month']) {
    const total = analysis.aggregations[granularity]
      .reduce((sum, bucket) => sum + bucket.visibleTotal, 0);
    assert.equal(Number(total.toFixed(2)), expected, `${label}: ${granularity} total reconciles`);
    for (const bucket of analysis.aggregations[granularity]) {
      assert.ok(bucket.startDate && bucket.endDate, `${label}: ${granularity} bucket has dates`);
    }
  }
}

function assertComparisons(financial, label) {
  for (const comparison of financial.comparisons) {
    assert.ok(comparison.baselineDateRange, `${label}: baseline date range`);
    assert.ok(comparison.currentDateRange, `${label}: current date range`);
    assert.ok(comparison.baselineDisplay, `${label}: formatted baseline`);
    assert.ok(comparison.currentDisplay, `${label}: formatted current`);
    assert.ok(
      comparison.baselineValue !== 0 || comparison.currentValue !== 0,
      `${label}: meaningless zero comparison is hidden`,
    );
    if (comparison.valueType === 'currency') {
      assert.match(comparison.baselineDisplay, /^\$[\d,]+\.\d{2}$/, `${label}: currency baseline`);
      assert.match(comparison.currentDisplay, /^\$[\d,]+\.\d{2}$/, `${label}: currency current`);
    }
  }
}

const builtInPersonal = trainingCases.find((item) => item.id === 'FA-ATO-24018');
const builtInCard = trainingCases.find((item) => item.id === 'FA-CB-24007');
assert.ok(builtInPersonal && builtInCard, 'built-in personal fixtures exist');

const customer = getCustomer360Dossier(builtInPersonal);
for (const field of [
  'legalName',
  'preferredName',
  'dob',
  'currentAddress',
  'previousAddress',
  'mobilePhone',
  'email',
  'trainingId',
  'customerSince',
  'relationshipLength',
  'segment',
  'preferredContact',
  'verificationStatus',
]) {
  assert.ok(customer.identity[field], `Customer 360 identity includes ${field}`);
}
assert.ok(customer.accounts.length >= 2, 'Customer 360 lists all supplied products');
assert.ok(customer.profileUpdates.length, 'Customer 360 includes profile updates');
assert.deepEqual(
  customer.profileUpdates.map((item) => item.id),
  builtInPersonal.customer.profileChanges.map((item) => item.id),
  'Customer 360 preserves stable supplied profile-update IDs',
);
assert.ok(customer.security.trustedDevices.length, 'Customer 360 includes trusted security');
assert.ok(customer.serviceContacts.length, 'Customer 360 includes factual contact notes');
assert.ok(
  !forbiddenPreDecisionCopy.test(JSON.stringify(customer.serviceContacts)),
  'Customer 360 contact notes do not expose hidden truth',
);
assertSharedAccountValues(
  customer.accounts,
  getFinancialInvestigation(builtInPersonal),
  'built-in personal relationship',
);

const futureProfileCase = {
  ...builtInPersonal,
  customer: {
    ...builtInPersonal.customer,
    profileChanges: [
      {
        id: 'PCH-FUTURE-C360',
        date: 'Jul 9, 2026',
        time: '8:15 AM',
        eventType: 'Address change',
        item: 'Mailing address updated after the case opened',
        oldValue: 'Prior training address',
        newValue: 'Future training address',
        channel: 'Customer profile',
        source: 'Relationship servicing',
        user: 'Training customer',
        device: 'Servicing device',
        session: 'SES-FUTURE-C360',
        mfaMethod: 'Profile verification',
      },
      ...builtInPersonal.customer.profileChanges,
    ],
  },
};
const asOfCustomer = getCustomer360Dossier(futureProfileCase);
assert.ok(
  !asOfCustomer.profileUpdates.some((event) => event.item === 'Mailing address updated after the case opened'),
  'Customer 360 excludes profile updates after the case as-of date',
);
assert.equal(
  asOfCustomer.profileUpdates.length,
  customer.profileUpdates.length,
  'excluding a future update does not synthesize a replacement profile event',
);

const legacyCustomer = getCustomer360Dossier({
  id: 'FA-C360-LEGACY-001',
  legacyDerivedEvidence: true,
  customerType: 'personal',
  productType: 'deposit-account',
  workflowType: 'personal-account-takeover',
  person: 'Rowan Vale',
  trainingId: 'TRN-C360-LEG-001',
  opened: 'Jul 8, 2026',
  customer: {
    segment: 'Fraud Confirmed',
  },
});
assert.equal(legacyCustomer.identity.legalName, 'Rowan Vale', 'legacy Customer 360 retains the supplied legal name');
assert.equal(legacyCustomer.identity.trainingId, 'TRN-C360-LEG-001', 'legacy Customer 360 retains the supplied Training ID');
for (const field of [
  'preferredName',
  'dob',
  'age',
  'currentAddress',
  'previousAddress',
  'mobilePhone',
  'email',
  'customerSince',
  'segment',
  'preferredContact',
  'verificationStatus',
  'verificationMethod',
  'lastVerified',
  'accountStanding',
  'maskedMemberId',
]) {
  assert.equal(
    legacyCustomer.identity[field],
    unavailableCustomerField,
    `legacy Customer 360 leaves unsupplied ${field} unavailable`,
  );
}
assert.deepEqual(legacyCustomer.profileUpdates, [], 'legacy Customer 360 does not generate profile updates');
assert.deepEqual(legacyCustomer.security.trustedDevices, [], 'legacy Customer 360 does not generate trusted devices');
assert.deepEqual(legacyCustomer.serviceContacts, [], 'legacy Customer 360 does not generate service contacts');
for (const value of Object.values(legacyCustomer.relationship).filter((value) => typeof value === 'string')) {
  assert.equal(value, unavailableCustomerField, 'legacy Customer 360 leaves unsupplied relationship behavior unavailable');
}
assert.equal(legacyCustomer.coverage.sourceMode, 'Supplied records only', 'legacy Customer 360 declares supplied-only coverage');
assert.ok(
  !forbiddenPreDecisionCopy.test(JSON.stringify({
    identity: legacyCustomer.identity,
    relationship: legacyCustomer.relationship,
    security: legacyCustomer.security,
    profileUpdates: legacyCustomer.profileUpdates,
    serviceContacts: legacyCustomer.serviceContacts,
  })),
  'legacy Customer 360 removes hidden conclusion language from supplied fields',
);

const incompleteCustomer = getCustomer360Dossier({
  id: 'FA-C360-SOURCE-GAP-001',
  trainingId: 'TRN-C360-SOURCE-GAP-001',
  person: 'Source Gap Learner',
  opened: 'Jul 8, 2026',
  generatedPacketVersion: 7,
  legacyDerivedEvidence: false,
  customer: {
    relationship: [
      { label: 'Relationship context', value: 'Synthetic identity' },
    ],
  },
});
assert.equal(
  incompleteCustomer.identity.dob,
  unavailableCustomerField,
  'Customer 360 does not invent missing identity fields at read time',
);
assert.deepEqual(incompleteCustomer.accounts, [], 'Customer 360 does not invent relationship accounts at read time');
assert.deepEqual(incompleteCustomer.profileUpdates, [], 'Customer 360 does not invent profile history at read time');
assert.deepEqual(incompleteCustomer.security.trustedDevices, [], 'Customer 360 does not invent trusted devices at read time');
assert.deepEqual(incompleteCustomer.serviceContacts, [], 'Customer 360 does not invent service contacts at read time');
assert.deepEqual(
  incompleteCustomer.relationship.facts,
  [],
  'Customer 360 removes hidden-answer language from supplied relationship facts',
);
assert.equal(
  incompleteCustomer.coverage.sourceMode,
  'Supplied records only',
  'Customer 360 preserves an older incomplete generated packet as supplied-only without backfilling evidence',
);

const intakeChannelCase = generated({
  index: 98004,
  customerType: 'personal',
  productType: 'credit-card',
  workflowType: 'merchant-non-fraud-dispute',
});
assert.equal(intakeChannelCase.intake.channel, 'Digital fraud intake', 'intake-contamination fixture uses the target intake channel');
const intakeSafeCustomer = getCustomer360Dossier(intakeChannelCase);
assert.ok(intakeSafeCustomer.profileUpdates.length, 'generated Customer 360 retains independent profile history');
assert.ok(
  !JSON.stringify(intakeSafeCustomer.profileUpdates).includes(intakeChannelCase.intake.channel),
  'generated Customer 360 profile history does not copy the current case intake channel',
);
assert.ok(
  !JSON.stringify({
    identity: intakeSafeCustomer.identity,
    relationship: intakeSafeCustomer.relationship,
    serviceContacts: intakeSafeCustomer.serviceContacts,
  }).includes(intakeChannelCase.intake.channel),
  'persisted Customer 360 profile and service records do not copy the current intake channel',
);

const businessApplication = generated({
  index: 96001,
  customerType: 'business',
  productType: 'business-loan',
  workflowType: 'credit-application-review',
});
const business = getBusiness360Dossier(businessApplication);
assert.equal(business.profile.legalName, businessApplication.profile.business, 'Business 360 uses the company object');
assert.notEqual(business.profile.legalName, businessApplication.person, 'Business 360 does not use a person as the company');
assert.ok(business.owners.length >= 2, 'Business application includes owners and control parties');
for (const owner of business.owners) {
  for (const field of [
    'fullLegalName',
    'dateOfBirth',
    'trainingId',
    'ownershipPercentage',
    'businessTitle',
    'currentResidentialAddress',
    'previousResidentialAddress',
    'personalPhone',
    'personalEmail',
    'identityVerificationStatus',
    'addressVerificationStatus',
  ]) {
    assert.ok(owner[field], `Business owner includes ${field}`);
  }
}
const firstOwner = business.owners[0];
assert.notEqual(firstOwner.currentResidentialAddress, business.profile.operatingAddress, 'owner and operating addresses remain separate');
assert.notEqual(firstOwner.currentResidentialAddress, business.profile.mailingAddress, 'owner and mailing addresses remain separate in fixture');
assert.notEqual(firstOwner.currentResidentialAddress, business.profile.registeredAgent.address, 'owner and registered-agent addresses remain separate');
const ownerIdentityContext = getIdentityIntelContextCase(businessApplication, firstOwner.trainingId);
assert.equal(ownerIdentityContext.person, firstOwner.fullLegalName, 'owner identity navigation uses the selected owner name');
assert.equal(ownerIdentityContext.trainingId, firstOwner.trainingId, 'owner identity navigation preserves the exact owner Training ID');
assert.equal(ownerIdentityContext.identityContext?.sourceCaseId, businessApplication.id, 'owner identity context retains the source case');
assert.deepEqual(ownerIdentityContext.loginHistory, [], 'owner identity context does not reuse the active-case person login history');
const ownerIdentityReport = getIdentityIntelReport(
  businessApplication,
  { trainingId: firstOwner.trainingId },
);
assert.equal(ownerIdentityReport.subject.name, firstOwner.fullLegalName, 'owner People Search reports the selected owner');
assert.equal(ownerIdentityReport.subject.trainingId, firstOwner.trainingId, 'owner People Search reports the exact owner Training ID');
assert.ok(
  matchesIdentityIntelSearch(ownerIdentityReport, { mode: 'id', id: firstOwner.trainingId }),
  'owner Training ID returns the selected owner People Search match',
);
assert.ok(
  !matchesIdentityIntelSearch(ownerIdentityReport, { mode: 'id', id: businessApplication.trainingId }),
  'owner People Search does not match the active-case person Training ID',
);
const businessPublicData = JSON.stringify(business);
assert.ok(!businessPublicData.includes(businessApplication.id), 'Business 360 excludes the active case ID');
assert.ok(!businessPublicData.includes(businessApplication.amount), 'Business 360 excludes the active case amount');
assert.ok(!businessPublicData.includes(businessApplication.alertReason), 'Business 360 excludes the active alert');
assert.ok(!forbiddenPreDecisionCopy.test(businessPublicData), 'Business 360 excludes hidden findings');
assertSharedAccountValues(
  business.accounts,
  getFinancialInvestigation(businessApplication),
  'generated business relationship',
);

const migratedBusinessBase = {
  id: 'FA-B360-MIGRATED-001',
  legacyDerivedEvidence: true,
  customerType: 'business',
  productType: 'business-account',
  workflowType: 'business-account-takeover',
  reportedDate: 'Jul 10, 2026',
  opened: 'Jul 10, 2026',
  person: 'Case Submitter Training',
  trainingId: 'TRN-SUBMITTER-001',
  customer: {
    relationshipSince: '2021',
    contact: {
      address: '900 Submitter Training Road, Dallas, TX 75201',
      phone: '(555) 010-9000',
      email: 'submitter@training.example.test',
    },
  },
  businessProfile: {
    legalName: 'Northstar Training Logistics LLC',
    dba: 'Northstar Training Logistics',
    entityType: 'Limited liability company',
    formationDate: 'May 14, 2018',
    formationState: 'Texas',
    registrationFileNumber: 'TX-TRAIN-88421',
    operatingAddress: '1200 Logistics Training Drive, Dallas, TX 75201',
    mailingAddress: 'PO Box 4400, Dallas, TX 75221',
    registeredAgent: {
      name: 'Northstar Training Agent Services',
      address: '400 Registry Training Avenue, Austin, TX 78701',
    },
  },
};

const migratedOutcomeDossier = getBusiness360Dossier({
  ...migratedBusinessBase,
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    standing: 'Fraud Confirmed',
    industry: 'Accepted determination',
    sourceChecked: 'Hidden case truth',
    owners: [{
      id: 'OWNER-OUTCOME-1',
      fullLegalName: 'Morgan Training Reed',
      role: 'Beneficial owner',
      ownershipPercentage: '40%',
      identityVerificationStatus: 'Fraud score 91',
    }],
    contactHistory: [{
      id: 'CONTACT-OUTCOME-1',
      contactDate: 'Jul 9, 2026',
      personContacted: 'Morgan Training Reed',
      businessRole: 'Beneficial owner',
      contactChannel: 'Phone',
      reasonForContact: 'Correct determination',
      informationSupplied: 'Synthetic identity was the accepted determination.',
      assistanceProvided: 'Recommended deny',
      documentsRequested: 'None',
      followUpStatus: 'Completed',
      agentOrDepartment: 'Business servicing',
    }],
  },
});
assert.equal(
  migratedOutcomeDossier.profile.legalName,
