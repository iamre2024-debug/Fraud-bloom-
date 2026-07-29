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
  migratedBusinessBase.businessProfile.legalName,
  'migrated Business 360 retains neutral supplied company identity',
);
assert.ok(
  !forbiddenPreDecisionCopy.test(JSON.stringify(migratedOutcomeDossier)),
  'migrated Business 360 sanitizes supplied outcome language across relationship records',
);
assert.notEqual(
  migratedOutcomeDossier.contactNotes[0].assistanceProvided,
  'Recommended deny',
  'migrated Business 360 removes supplied decision-direction language',
);

const bareImperativeDossier = getBusiness360Dossier({
  ...migratedBusinessBase,
  id: 'FA-B360-BARE-IMPERATIVE',
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    contactHistory: [{
      id: 'CONTACT-IMPERATIVE-1',
      contactDate: 'Jul 9, 2026',
      personContacted: 'Morgan Training Reed',
      businessRole: 'Beneficial owner',
      contactChannel: 'Phone',
      reasonForContact: 'Account servicing',
      informationSupplied: 'The caller asked about the account status.',
      assistanceProvided: 'Close the account now.',
      documentsRequested: 'None',
      followUpStatus: 'Completed',
      agentOrDepartment: 'Business servicing',
    }],
  },
});
assert.notEqual(
  bareImperativeDossier.contactNotes[0].assistanceProvided,
  'Close the account now.',
  'migrated Business 360 sanitizes a bare operational-decision imperative',
);
assert.ok(
  !/close the account now/i.test(JSON.stringify(bareImperativeDossier)),
  'a bare close-account instruction is absent from the Business 360 dossier',
);

const ownerIsolationDossier = getBusiness360Dossier({
  ...migratedBusinessBase,
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    owners: [{
      id: 'OWNER-ISOLATED-1',
      role: 'Beneficial owner',
      ownershipPercentage: '35%',
    }],
  },
});
const isolatedOwner = ownerIsolationDossier.owners[0];
assert.equal(isolatedOwner.fullLegalName, unavailableCustomerField, 'an unsupplied owner name does not inherit the active-case submitter');
assert.equal(isolatedOwner.trainingId, unavailableCustomerField, 'an unsupplied owner Training ID does not inherit the active-case submitter ID');
assert.equal(isolatedOwner.currentResidentialAddress, unavailableCustomerField, 'an unsupplied owner address does not inherit the active-case submitter address');
assert.equal(isolatedOwner.personalPhone, unavailableCustomerField, 'an unsupplied owner phone does not inherit the active-case submitter phone');
assert.equal(isolatedOwner.personalEmail, unavailableCustomerField, 'an unsupplied owner email does not inherit the active-case submitter email');
assert.equal(isolatedOwner.businessTitle, 'Beneficial owner', 'owner isolation retains the supplied business relationship role');
assert.equal(isolatedOwner.ownershipPercentage, '35%', 'owner isolation retains the supplied ownership percentage');

const futureBusinessProfileEvent = {
  id: 'BUP-FUTURE-ONLY',
  date: 'Jul 11, 2026',
  time: '9:00 AM',
  eventType: 'Mailing-address change',
  oldValue: 'Prior training address',
  newValue: 'Future training address',
  channel: 'Business servicing',
  source: 'Business profile',
  user: 'Authorized business user',
  session: 'SES-BUP-FUTURE',
  device: 'DEV-BUP-FUTURE',
};
const futureOnlyBusinessDossier = getBusiness360Dossier({
  ...businessApplication,
  id: 'FA-B360-ASOF-FUTURE',
  reportedDate: 'Jul 10, 2026',
  opened: 'Jul 10, 2026',
  businessProfile: {
    ...(businessApplication.businessProfile ?? {}),
    profileUpdates: [futureBusinessProfileEvent],
  },
});
assert.deepEqual(
  futureOnlyBusinessDossier.profileUpdates,
  [],
  'Business 360 leaves a future-only supplied profile history empty instead of synthesizing a replacement',
);

const sameDayBusinessDossier = getBusiness360Dossier({
  ...businessApplication,
  id: 'FA-B360-ASOF-SAME-DAY',
  reportedDate: 'Jul 10, 2026',
  opened: 'Jul 10, 2026',
  businessProfile: {
    ...(businessApplication.businessProfile ?? {}),
    profileUpdates: [{
      ...futureBusinessProfileEvent,
      id: 'BUP-SAME-DAY',
      date: 'Jul 10, 2026',
      session: 'SES-BUP-SAME-DAY',
      device: 'DEV-BUP-SAME-DAY',
    }, futureBusinessProfileEvent],
  },
});
assert.deepEqual(
  sameDayBusinessDossier.profileUpdates.map((event) => event.id),
  ['BUP-SAME-DAY'],
  'Business 360 retains same-day profile evidence while excluding later records',
);

const linkedBusinessFromPersonalCase = {
  ...builtInPersonal,
  id: 'FA-C360-LINKED-BUSINESS-SCOPE',
  reportedDate: 'Jul 10, 2026',
  opened: 'Jul 10, 2026',
  customer: {
    ...builtInPersonal.customer,
    profileChanges: [{
      id: 'PERSONAL-PASSWORD-ONLY',
      date: 'Jul 9, 2026',
      time: '8:00 AM',
      eventType: 'Password reset',
      item: 'Personal online-banking password',
      oldValue: 'Prior personal password',
      newValue: 'Updated personal password',
      channel: 'Personal online banking',
      source: 'Personal customer profile',
      user: 'Personal training customer',
      session: 'SES-PERSONAL-ONLY',
      device: 'DEV-PERSONAL-ONLY',
    }],
    security: {
      trustedDevices: [{
        id: 'DEV-PERSONAL-ONLY',
        name: 'Personal trusted phone',
        type: 'Mobile phone',
        platform: 'iOS',
        firstSeen: 'Jun 1, 2026',
        lastSeen: 'Jul 9, 2026',
        trustStatus: 'Trusted personal device',
        authentication: 'Biometric',
      }],
    },
    businessRelationships: [{
      id: 'BIZ-LINK-SCOPE-1',
      businessId: 'BIZ-LINK-SCOPE-1',
      businessName: 'Linked Scope Training LLC',
      relationship: 'Beneficial owner',
      ownershipPercentage: '30%',
      legalName: 'Linked Scope Training LLC',
      entityType: 'Limited liability company',
      formationDate: 'Mar 3, 2020',
      formationState: 'Texas',
      registrationFileNumber: 'TX-LINK-SCOPE-1',
      operatingAddress: '810 Linked Business Training Drive, Dallas, TX 75201',
      mailingAddress: 'PO Box 810, Dallas, TX 75221',
      profileUpdates: [{
        id: 'LINKED-BUSINESS-UPDATE-1',
        date: 'Jul 8, 2026',
        time: '10:00 AM',
        eventType: 'Business mailing-address review',
        oldValue: 'Existing linked-business mailing address',
        newValue: 'Existing linked-business mailing address retained',
        channel: 'Business servicing',
        source: 'Linked business profile',
        user: 'Authorized business user',
        session: 'SES-LINKED-BUSINESS-1',
        device: 'DEV-LINKED-BUSINESS-1',
      }],
    }],
  },
};
const scopedLinkedBusiness = getBusiness360Dossier(
  linkedBusinessFromPersonalCase,
  { relationshipId: 'BIZ-LINK-SCOPE-1' },
);
assert.deepEqual(
  scopedLinkedBusiness.profileUpdates.map((event) => event.id),
  ['LINKED-BUSINESS-UPDATE-1'],
  'linked Business 360 uses only the linked company profile-update history',
);
assert.deepEqual(
  scopedLinkedBusiness.access.authorizedUsers,
  [],
  'linked Business 360 does not inherit personal authorized-user records',
);
assert.deepEqual(
  scopedLinkedBusiness.access.trustedDevices,
  [],
  'linked Business 360 does not inherit personal trusted devices',
);
assert.deepEqual(
  scopedLinkedBusiness.access.passwordOrAccessResets,
  [],
  'linked Business 360 does not inherit personal password or access changes',
);
assert.ok(
  !JSON.stringify(scopedLinkedBusiness).includes('PERSONAL-ONLY'),
  'linked Business 360 contains no personal profile or access record IDs',
);

const rollbackBusinessMailingAddress = 'PO Box 1212, Dallas, TX 75221';
const futureBusinessMailingAddress = 'PO Box 3434, Dallas, TX 75223';
const rollbackOwnerResidence = '1515 Owner Training Lane, Irving, TX 75039';
const futureOwnerResidence = '2828 Future Owner Training Lane, Arlington, TX 76010';
const rolledBackSnapshotDossier = getBusiness360Dossier({
  ...migratedBusinessBase,
  id: 'FA-B360-SNAPSHOT-ROLLBACK',
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    mailingAddress: futureBusinessMailingAddress,
    owners: [{
      id: 'OWNER-ROLLBACK-1',
      fullLegalName: 'Taylor Training Monroe',
      role: 'Beneficial owner',
      ownershipPercentage: '45%',
      currentResidentialAddress: futureOwnerResidence,
    }],
    profileUpdates: [{
      id: 'BUSINESS-MAILING-FUTURE',
      date: 'Jul 11, 2026',
      time: '9:00 AM',
      eventType: 'Business mailing-address change',
      item: 'Business mailing address',
      oldValue: rollbackBusinessMailingAddress,
      newValue: futureBusinessMailingAddress,
      channel: 'Business servicing',
      source: 'Business profile',
      user: 'Authorized business user',
    }, {
      id: 'OWNER-RESIDENCE-FUTURE',
      date: 'Jul 12, 2026',
      time: '11:00 AM',
      eventType: 'Owner residential-address change',
      item: 'Owner residential address',
      ownerId: 'OWNER-ROLLBACK-1',
      subjectId: 'OWNER-ROLLBACK-1',
      oldValue: rollbackOwnerResidence,
      newValue: futureOwnerResidence,
      channel: 'Business servicing',
      source: 'Owner relationship profile',
      user: 'Taylor Training Monroe',
    }],
  },
});
assert.equal(
  rolledBackSnapshotDossier.profile.mailingAddress,
  rollbackBusinessMailingAddress,
  'Business 360 rolls an explicit business snapshot back to the value effective as of the case date',
);
assert.equal(
  rolledBackSnapshotDossier.owners[0].currentResidentialAddress,
  rollbackOwnerResidence,
  'Business 360 rolls an explicit owner snapshot back to the value effective as of the case date',
);
assert.deepEqual(
  rolledBackSnapshotDossier.profileUpdates,
  [],
  'after-as-of changes used for snapshot rollback remain absent from visible profile history',
);

const canonicalAccountCase = {
  ...migratedBusinessBase,
  id: 'FA-B360-CANONICAL-ACCOUNT',
  accountId: 'CANONICAL-BIZ-001',
  toolResults: {
    relationshipAccounts: [{
      relationshipDataVersion: 1,
      accountId: 'CANONICAL-BIZ-001',
      productType: 'business-account',
      productKind: 'business-checking',
      productLabel: 'Canonical Business Checking',
      openDate: 'Mar 8, 2021',
      status: 'Open — Good Standing',
      currentBalance: 3210.45,
      availableBalance: 3010.45,
      paymentStatus: 'Not applicable',
      pastDueAmount: 0,
      restrictions: 'None recorded',
      holds: '$200.00 deposited-item hold',
      isPrimary: true,
    }],
  },
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    accounts: [{
      accountId: 'STALE-BIZ-999',
      productType: 'business-account',
      productKind: 'business-checking',
      productLabel: 'Stale Profile Account',
      openDate: 'Jan 1, 2020',
      status: 'Open — Good Standing',
      currentBalance: 999.99,
      availableBalance: 999.99,
      isPrimary: true,
    }],
  },
};
const canonicalAccountDossier = getBusiness360Dossier(canonicalAccountCase);
assert.deepEqual(
  canonicalAccountDossier.accounts.map((account) => account.accountId),
  ['CANONICAL-BIZ-001'],
  'canonical toolResults relationship accounts override a conflicting business-profile snapshot',
);
assert.equal(canonicalAccountDossier.accounts[0].currentBalance, 3210.45, 'Business 360 retains the canonical account balance');
assertSharedAccountValues(
  canonicalAccountDossier.accounts,
  getFinancialInvestigation(canonicalAccountCase),
  'migrated canonical business account',
);

const payrollAliasCase = {
  ...migratedBusinessBase,
  id: 'FA-B360-PAYROLL-ALIASES',
  productType: 'payroll-product',
  workflowType: 'payroll-change-alert',
  reportedDate: 'Jul 31, 2026',
  opened: 'Jul 31, 2026',
  accountId: 'PAYROLL-ALIAS-001',
  accountStatus: 'Open — Payroll Service Active',
  toolResults: {
    relationshipAccounts: [{
      relationshipDataVersion: 1,
      accountId: 'PAYROLL-ALIAS-001',
      productType: 'payroll-product',
      productKind: 'payroll-account',
      productLabel: 'Payroll Funding Account',
      openDate: 'Feb 1, 2022',
      status: 'Open — Payroll Service Active',
      currentBalance: 40000,
      availableBalance: 38000,
      paymentStatus: 'Funding record available',
      isPrimary: true,
    }],
    payrollHistory: [{
      id: 'PAY-FUTURE-AUG',
      month: 'August 2026',
      processedDate: 'Aug 15, 2026',
      period: 'Aug 1–15, 2026',
      totalCompanyDebit: 90000,
      employeeCount: 99,
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }, {
      id: 'PAY-JUL-ISO',
      month: '2026-07',
      processedDate: 'Jul 31, 2026',
      period: 'Jul 16–31, 2026',
      totalCompanyDebit: 12000,
      employeeCount: 12,
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }, {
      id: 'PAY-JUL-NAMED',
      month: 'July 2026',
      processedDate: 'Jul 15, 2026',
      period: 'Jul 1–15, 2026',
      totalCompanyDebit: 10000,
      employeeCount: 11,
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }, {
      id: 'PAY-JUN',
      month: 'Jun 2026',
      processedDate: 'Jun 30, 2026',
      period: 'Jun 16–30, 2026',
      totalCompanyDebit: 8000,
      employeeCount: 10,
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }],
  },
};
const payrollAliasDossier = getBusiness360Dossier(payrollAliasCase);
assert.equal(
  payrollAliasDossier.payrollRelationship.lastCompletedPayrollDate,
  'Jul 31, 2026',
  'Business 360 excludes future payroll runs when selecting the last completed payroll',
);
assert.equal(payrollAliasDossier.payrollRelationship.lastPayrollAmount, '$12,000.00', 'Business 360 uses the latest in-scope payroll amount');
assert.equal(payrollAliasDossier.payrollRelationship.activeEmployeeCount, 12, 'Business 360 uses the latest in-scope payroll employee count');
assert.equal(
  payrollAliasDossier.payrollRelationship.averageMonthlyPayroll,
  '$15,000.00',
  'Business 360 reconciles named and ISO aliases for the same payroll month before averaging',
);

const detailedPayrollOverridesStaleSummaryCase = {
  ...payrollAliasCase,
  id: 'FA-B360-PAYROLL-DETAIL-WINS',
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    payrollRelationship: {
      payrollAccountStatus: 'Open — Payroll Service Active',
      payrollCustomerSince: 'Feb 1, 2022',
      paySchedule: 'Monthly',
      nextScheduledPayroll: 'Jul 1, 2026',
      activeEmployeeCount: 5,
      lastCompletedPayrollDate: 'Jun 15, 2026',
      lastPayrollAmount: '$5,000.00',
      averageMonthlyPayroll: '$5,000.00',
      payrollFundingStatus: 'Stale summary status',
      payrollAdministrator: 'Stale Training Administrator',
      authorizedPayrollUsers: ['Stale Training Administrator'],
      employerTaxProfileStatus: 'Current',
    },
  },
  toolResults: {
    ...payrollAliasCase.toolResults,
    payrollHistory: [{
      id: 'PAY-DETAIL-PENDING',
      month: 'July 2026',
      processedDate: 'Jul 31, 2026',
      period: 'Jul 31, 2026',
      totalCompanyDebit: 99000,
      employeeCount: 99,
      paySchedule: 'Twice monthly',
      nextScheduledPayroll: 'Aug 15, 2026',
      status: 'Pending approval',
      fundingStatus: 'Funding pending',
    }, {
      id: 'PAY-DETAIL-CURRENT',
      month: '2026-07',
      processedDate: 'Jul 30, 2026',
      period: 'Jul 16–30, 2026',
      totalCompanyDebit: 12000,
      employeeCount: 12,
      paySchedule: 'Twice monthly',
      nextScheduledPayroll: 'Aug 15, 2026',
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }, {
      id: 'PAY-DETAIL-PRIOR',
      month: 'July 2026',
      processedDate: 'Jul 15, 2026',
      period: 'Jul 1–15, 2026',
      totalCompanyDebit: 10000,
      employeeCount: 11,
      paySchedule: 'Twice monthly',
      nextScheduledPayroll: 'Jul 30, 2026',
      status: 'Posted',
      fundingStatus: 'Funding completed',
    }],
  },
};
const detailedPayrollDossier = getBusiness360Dossier(detailedPayrollOverridesStaleSummaryCase);
assert.equal(
  detailedPayrollDossier.payrollRelationship.lastCompletedPayrollDate,
  'Jul 30, 2026',
  'detailed completed Payroll History overrides a stale source payroll-summary date',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.lastPayrollAmount,
  '$12,000.00',
  'detailed completed Payroll History overrides a stale source payroll-summary amount',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.activeEmployeeCount,
  12,
  'pending payroll runs do not supply the last-completed employee count',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.averageMonthlyPayroll,
  '$22,000.00',
  'pending payroll runs are excluded from the completed monthly payroll total',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.paySchedule,
  'Twice monthly',
  'the detailed completed run overrides a stale summary pay schedule',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.nextScheduledPayroll,
  'Aug 15, 2026',
  'the detailed completed run overrides a stale next-payroll summary',
);
assert.equal(
  detailedPayrollDossier.payrollRelationship.payrollFundingStatus,
  'Funding completed',
  'pending funding does not replace the last completed payroll funding status',
);

const explicitAccessCase = {
  ...migratedBusinessBase,
  id: 'FA-B360-EXPLICIT-ACCESS',
  businessProfile: {
    ...migratedBusinessBase.businessProfile,
    access: {
      authorizedUsers: [{
        id: 'BUS-USER-1',
        name: 'Avery Training Owner',
        role: 'Payroll administrator',
        permissions: 'Fraud Confirmed',
        mfaMethod: 'Accepted determination',
        lastSuccessfulLogin: 'Jul 9, 2026 · 8:00 AM',
      }, {
        id: 'BUS-USER-1',
        name: 'Avery Training Owner',
        role: 'Payroll administrator',
        permissions: 'Fraud score 99',
        mfaMethod: 'Password + OTP',
        lastSuccessfulLogin: 'Jul 10, 2026 · 9:00 AM',
      }, {
        id: 'BUS-USER-FUTURE',
        name: 'Future Training User',
        role: 'Authorized user',
        permissions: 'View accounts',
        mfaMethod: 'Password + OTP',
        lastSuccessfulLogin: 'Jul 11, 2026 · 9:00 AM',
      }],
      trustedDevices: [{
        deviceId: 'DEV-BUS-1',
        deviceName: 'Training office computer',
        deviceType: 'Computer',
        browserOrOperatingSystem: 'Windows · Chrome',
        firstSeen: 'Jun 1, 2026',
        lastSeen: 'Jul 9, 2026',
        trustStatus: 'Fraud Confirmed',
        mfaMethod: 'Password + OTP',
      }, {
        deviceId: 'DEV-BUS-1',
        deviceName: 'Training office computer',
        deviceType: 'Computer',
        browserOrOperatingSystem: 'Windows · Chrome',
        firstSeen: 'May 1, 2026',
        lastSeen: 'Jul 10, 2026',
        trustStatus: 'Automatic risk conclusion',
        mfaMethod: 'Password + OTP',
      }, {
        deviceId: 'DEV-BUS-FUTURE',
        deviceName: 'Future training device',
        deviceType: 'Computer',
        browserOrOperatingSystem: 'Windows · Chrome',
        firstSeen: 'Jul 11, 2026',
        lastSeen: 'Jul 11, 2026',
        trustStatus: 'Trusted',
        mfaMethod: 'Password + OTP',
      }],
      passwordOrAccessResets: [{
        id: 'ACCESS-RESET-1',
        updateType: 'Password reset',
        dateTime: 'Jul 9, 2026 · 4:00 PM',
        previousValue: 'Existing password',
        newValue: 'Accepted determination',
      }, {
        id: 'ACCESS-RESET-1',
        updateType: 'Password reset',
        dateTime: 'Jul 10, 2026 · 9:00 AM',
        previousValue: 'Existing password',
        newValue: 'Fraud score 99',
      }, {
        id: 'ACCESS-RESET-FUTURE',
        updateType: 'Permission change',
        dateTime: 'Jul 11, 2026 · 9:00 AM',
        previousValue: 'View accounts',
        newValue: 'Approve payments',
      }],
    },
  },
};
const explicitAccessDossier = getBusiness360Dossier(explicitAccessCase);
assert.deepEqual(
  explicitAccessDossier.access.authorizedUsers.map((user) => user.id),
  ['BUS-USER-1', 'BUS-USER-FUTURE'],
  'explicit Business 360 access deduplicates authorized-user relationship records',
);
assert.equal(
  explicitAccessDossier.access.authorizedUsers
    .find((user) => user.id === 'BUS-USER-FUTURE')
    .lastSuccessfulLogin,
  unavailableCustomerField,
  'explicit Business 360 access does not expose a future successful-login timestamp',
);
assert.deepEqual(
  explicitAccessDossier.access.trustedDevices.map((device) => device.deviceId),
  ['DEV-BUS-1'],
  'explicit Business 360 access removes future devices and deduplicates the retained device',
);
assert.equal(explicitAccessDossier.access.trustedDevices[0].firstSeen, 'May 1, 2026', 'deduplicated access retains the earliest device observation');
assert.equal(explicitAccessDossier.access.trustedDevices[0].lastSeen, 'Jul 10, 2026', 'deduplicated access retains the latest in-scope device observation');
assert.deepEqual(
  explicitAccessDossier.access.passwordOrAccessResets.map((update) => update.id),
  ['ACCESS-RESET-1'],
  'explicit Business 360 access removes future access changes and deduplicates the retained change',
);
assert.ok(
  !forbiddenPreDecisionCopy.test(JSON.stringify(explicitAccessDossier.access)),
  'explicit Business 360 access sanitizes outcome language',
);

const personalCard = getFinancialInvestigation(builtInCard);
assert.deepEqual(
  sectionIds(personalCard),
  ['account-review', 'comparisons', 'spending', 'payments'],
  'personal card shows spending and payments without business or deposit-only sections',
);
assertDateAggregations(personalCard.spending, 'personal card spending');
assertComparisons(personalCard, 'personal card');

const personalLoanCase = generated({
  index: 97001,
  customerType: 'personal',
  productType: 'personal-loan',
  workflowType: 'credit-risk-review',
});
const personalLoan = getFinancialInvestigation(personalLoanCase);
assert.ok(sectionIds(personalLoan).includes('payments'), 'personal installment loan prioritizes payment history');
assert.ok(!sectionIds(personalLoan).includes('spending'), 'personal installment loan omits purchase-style spending');
assert.ok(personalLoan.payments.datedRecords.length >= 2, 'personal installment loan has dated payment records');

const personalDepositCase = generated({
  index: 97002,
  customerType: 'personal',
  productType: 'deposit-account',
  workflowType: 'personal-account-takeover',
});
const personalDeposit = getFinancialInvestigation(personalDepositCase);
assert.ok(sectionIds(personalDeposit).includes('deposits'), 'personal deposit relationship shows Deposit Analysis');
assertDateAggregations(personalDeposit.deposits, 'personal deposit analysis');

const directionalDeposit = getFinancialInvestigation({
  id: 'FA-FIN-DIRECTION-DEPOSIT',
  legacyDerivedEvidence: true,
  customerType: 'personal',
  productType: 'deposit-account',
  workflowType: 'personal-account-takeover',
  accountId: 'DDA-DIRECTION-1',
  toolResults: {
    transactions: [{
      id: 'TX-CREDIT',
      posted: 'Jul 10, 2026',
      merchant: 'Training Employer Payroll',
      amount: '$1,000.00',
      channel: 'ACH credit',
      instrument: 'Checking account',
      status: 'Posted',
    }, {
      id: 'TX-DEBIT',
      posted: 'Jul 11, 2026',
      merchant: 'Training Utility',
      amount: '$125.00',
      channel: 'ACH debit',
      instrument: 'Checking account',
      status: 'Posted',
    }],
  },
});
assert.ok(
  directionalDeposit.deposits.records.some((record) => record.id === 'TX-CREDIT'),
  'an ACH credit appears in Personal Deposit Analysis',
);
assert.ok(
  !directionalDeposit.spending.records.some((record) => record.id === 'TX-CREDIT'),
  'an ACH credit is not double-classified as spending',
);
assert.ok(
  directionalDeposit.spending.records.some((record) => record.id === 'TX-DEBIT'),
  'an ACH debit remains in spending',
);

const directionalCard = getFinancialInvestigation({
  id: 'FA-FIN-DIRECTION-CARD',
  legacyDerivedEvidence: true,
  customerType: 'personal',
  productType: 'credit-card',
  workflowType: 'credit-risk-review',
  accountId: 'CARD-DIRECTION-1',
  currentBalance: 1200,
  creditLimit: 2000,
  scheduledPayment: 75,
  toolResults: {
    transactions: [{
      id: 'PMT-OLD',
      posted: 'Jun 10, 2026',
      merchant: 'Card payment',
      amount: '$300.00',
      channel: 'Scheduled payment',
      instrument: 'Checking account',
      status: 'Posted',
      balanceAfter: 1200,
    }, {
      id: 'PMT-X',
      posted: 'Jul 10, 2026',
      merchant: 'Card payment',
      amount: '$300.00',
      channel: 'Scheduled payment',
      instrument: 'Checking account',
      status: 'Posted',
      balanceAfter: 1000,
    }, {
      id: 'PMT-X2',
      posted: 'Jul 20, 2026',
      merchant: 'Card payment',
      amount: '$300.00',
      channel: 'Scheduled payment',
      instrument: 'Checking account',
      status: 'Posted',
      balanceAfter: 900,
    }, {
      id: 'PUR-X',
      posted: 'Jul 11, 2026',
      merchant: 'Training Office Supply',
      amount: '$80.00',
      channel: 'Card purchase',
      instrument: 'Credit card',
      status: 'Posted',
    }],
  },
});
assert.ok(
  directionalCard.payments.records.some((record) => record.id === 'PMT-X'),
  'a card payment appears in Credit and Loan Payments',
);
assert.ok(
  !directionalCard.spending.records.some((record) => record.id === 'PMT-X'),
  'a card payment is not double-classified as spending',
);
assert.ok(
  directionalCard.spending.records.some((record) => record.id === 'PUR-X'),
  'a card purchase remains in spending',
);
const paymentAmountComparison = directionalCard.comparisons
  .find((comparison) => comparison.label === 'Monthly credit payment');
const paymentBalanceComparison = directionalCard.comparisons
  .find((comparison) => comparison.label === 'Balance after payment');
const utilizationComparison = directionalCard.comparisons
  .find((comparison) => comparison.label === 'Recorded utilization after payment');
assert.equal(paymentAmountComparison.baselineValue, 300, 'monthly payment baseline sums June payments');
assert.equal(paymentAmountComparison.currentValue, 600, 'monthly payment total sums both July payments');
assert.equal(paymentBalanceComparison.baselineValue, 1200, 'balance baseline uses the last June snapshot');
assert.equal(paymentBalanceComparison.currentValue, 900, 'balance current value uses the last July snapshot rather than summing balances');
assert.equal(utilizationComparison.baselineValue, 60, 'utilization baseline uses the last June snapshot');
assert.equal(utilizationComparison.currentValue, 45, 'utilization current value uses the last July snapshot');

const businessPayrollCase = generated({
  index: 97003,
  customerType: 'business',
  productType: 'payroll-product',
  workflowType: 'payroll-change-alert',
});
const businessPayrollDossier = getBusiness360Dossier(businessPayrollCase);
const businessPayroll = getFinancialInvestigation(businessPayrollCase);
const payrollRuns = getPayrollHistory(businessPayrollCase).payrollRuns;
assert.ok(businessPayrollDossier.payrollRelationship, 'Business 360 shows the payroll relationship');
assert.ok(sectionIds(businessPayroll).includes('payroll'), 'business payroll shows Payroll Analysis');
assert.ok(!sectionIds(businessPayroll).includes('deposits'), 'business payroll never shows Personal Deposit Analysis');
assert.ok(!sectionIds(businessPayroll).includes('spending'), 'payroll funding product hides unrelated purchase spending');
assert.ok(businessPayroll.payroll.months.some((month) => month.runCount >= 2), 'monthly payroll combines individual pay periods');
for (const record of businessPayroll.payroll.records) {
  assert.equal(
    record.monthId,
    record.periodRange.endDate.slice(0, 7),
    `${record.payrollRunId} groups into the month when its pay period ends`,
  );
}
for (const month of businessPayroll.payroll.months) {
  const expected = payrollRuns
    .filter((run) => businessPayroll.payroll.records.find((record) => (
      record.payrollRunId === run.id && record.monthId === month.id
    )))
    .reduce((sum, run) => sum + run.totalCompanyDebit, 0);
  assert.equal(Number(month.companyDebit.toFixed(2)), Number(expected.toFixed(2)), `${month.label} payroll total reconciles`);
}
assert.deepEqual(
  businessPayroll.payroll.payPeriods.map((period) => period.runId),
  payrollRuns.map((run) => run.id),
  'Financial Investigation periods deep-link to exact Payroll History runs',
);
const reorderedPayrollDossier = getBusiness360Dossier({
  ...businessPayrollCase,
  toolResults: {
    ...businessPayrollCase.toolResults,
    payrollRuns: [...businessPayrollCase.toolResults.payrollRuns].reverse(),
    payrollHistory: {
      ...businessPayrollCase.toolResults.payrollHistory,
      payrollRuns: [...businessPayrollCase.toolResults.payrollHistory.payrollRuns].reverse(),
    },
  },
});
assert.equal(
  reorderedPayrollDossier.payrollRelationship.lastCompletedPayrollDate,
  businessPayrollDossier.payrollRelationship.lastCompletedPayrollDate,
  'Business 360 chooses the latest completed payroll by date rather than packet order',
);
assert.equal(
  reorderedPayrollDossier.payrollRelationship.lastPayrollAmount,
  businessPayrollDossier.payrollRelationship.lastPayrollAmount,
  'Reordering Payroll History does not change the last completed payroll amount',
);
assert.equal(
  reorderedPayrollDossier.payrollRelationship.nextScheduledPayroll,
  businessPayrollDossier.payrollRelationship.nextScheduledPayroll,
  'Reordering Payroll History does not change the next scheduled payroll',
);

const businessCardCase = generated({
  index: 97004,
  customerType: 'business',
  productType: 'business-credit-card',
  workflowType: 'credit-risk-review',
});
const businessCard = getFinancialInvestigation(businessCardCase);
assert.ok(sectionIds(businessCard).includes('spending'), 'business credit card shows spending analysis');
assert.ok(!sectionIds(businessCard).includes('deposits'), 'business credit card omits personal Deposit Analysis');
assertDateAggregations(businessCard.spending, 'business card spending');

for (const [label, financial] of [
  ['built-in card', personalCard],
  ['personal loan', personalLoan],
  ['personal deposit', personalDeposit],
  ['business payroll', businessPayroll],
  ['business card', businessCard],
]) {
  assertComparisons(financial, label);
  assert.ok(!forbiddenPreDecisionCopy.test(JSON.stringify(financial)), `${label}: Financial Investigation remains evidence-first`);
}

console.log('Relationship tools smoke check passed: Customer 360, Business 360, shared accounts, product-aware Financial Investigation, payroll reconciliation, and pre-decision evidence boundaries are intact.');
