import fs from 'node:fs';
import { trainingCases } from '../src/data/cases.js';
import { getPayrollHistory } from '../src/data/businessPayrollWorkspace.js';
import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { getFinancialRecords } from '../src/data/caseToolData.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import {
  PAYMENT_NAME_RESULTS,
  buildPaymentLookupHint,
  comparePaymentOwner,
  normalizePaymentRecord,
  paymentLookupPrefillFromQuery,
  parsePaymentLookupHint,
  resolvePaymentLookup,
} from '../src/data/paymentVerification.js';

const failures = [];
const cases = enrichTrainingCases(trainingCases);
const requiredFields = [
  'nameMatchResult',
  'accountState',
  'nsfStatus',
  'accountAgeLabel',
  'statusAsOf',
];
const canonicalChangeFields = [
  'bankCode',
  'destinationId',
  'oldDestination',
  'newDestination',
];
const paymentChangeEventPattern = /bank|destination|beneficiary|payment account|direct deposit|payroll/i;
const generatedPaymentChangeLanes = new Set([
  'payroll-direct-deposit',
  'email-bec',
  'credit-risk',
  'business-loan-bust-out',
  'application-verification',
  'ach-wire-check',
]);
const placeholderOrNoChangePattern = /•{2,}|\bplaceholder\b|no new destination(?: added)?/i;

function fail(message) {
  failures.push(message);
}

function present(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function paymentChangeEvents(activeCase) {
  return (activeCase.customer?.profileChanges ?? []).filter((event) => paymentChangeEventPattern.test([
    event.eventType,
    event.item,
    event.oldValue,
    event.newValue,
  ].filter(Boolean).join(' ')));
}

function normalizedStatusFixture(overrides = {}) {
  return normalizePaymentRecord({
    id: 'PV-STATUS-FIXTURE',
    type: 'External payment account',
    object: 'Destination ID DST-STATUS',
    accountType: 'Linked external account',
    accountHolder: 'Training Owner',
    ownerMatch: 'Match',
    accountStatus: 'Open',
    standing: 'Good standing',
    firstSeen: 'Jan 8, 2026',
    statusAsOf: 'Jul 8, 2026',
    bankCode: 'BC-STATUS',
    destinationId: 'DST-STATUS',
    ...overrides,
  }, {
    id: 'FA-PV-STATUS',
    customerType: 'personal',
    person: 'Training Owner',
    opened: 'Jul 8, 2026',
  });
}

for (const activeCase of cases.filter((item) => item.availableTools?.includes('Payment Verification'))) {
  const records = getFinancialRecords(activeCase).paymentVerification;
  if (!records.length) fail(`${activeCase.id} has no Payment Verification records.`);
  for (const record of records) {
    for (const field of requiredFields) {
      if (record[field] === undefined || record[field] === '') fail(`${record.id} is missing ${field}.`);
    }
    for (const field of canonicalChangeFields) {
      if (!present(record[field])) fail(`${record.id} is missing canonical ${field}.`);
    }
    if (!PAYMENT_NAME_RESULTS.includes(record.nameMatchResult)) fail(`${record.id} has a non-canonical stored name result.`);
    if (/fraud/i.test(record.operationalStatus)) fail(`${record.id} incorrectly uses fraud as operational account status.`);
    if (/^(hold|pause|release|approve|deny|remove|close)\b/i.test(record.verificationOutcome)) fail(`${record.id} exposes a pre-decision verification outcome.`);
    if (record.actions.some((action) => /^(hold|pause|release|approve|deny|remove|close)\b/i.test(action))) fail(`${record.id} exposes a pre-decision action.`);
  }
}

if (comparePaymentOwner('Maya Sterling', 'Maya Sterling') !== 'Match') fail('Exact owner-name comparison failed.');
if (comparePaymentOwner('Maya Sterling', 'Maya S.') !== 'Partial Match') fail('Abbreviated owner-name comparison failed.');
if (comparePaymentOwner('Avery Brooks', 'Training Holder 1234') !== 'No Match') fail('Different owner-name comparison failed.');
if (comparePaymentOwner('', 'Avery Brooks') !== 'Unable to Verify') fail('Missing owner-name comparison failed.');
if (comparePaymentOwner('Acme Corp LLC', 'Global Corp LLC') !== 'No Match') {
  fail('Business suffixes incorrectly created a partial owner-name match.');
}

const openStatus = normalizedStatusFixture();
const closedStatus = normalizedStatusFixture({ accountStatus: 'Closed' });
const frozenStatus = normalizedStatusFixture({ accountStatus: 'Restricted / frozen' });
const nsfFound = normalizedStatusFixture({
  standing: 'NSF returned-payment record found',
  notes: 'One returned payment is present in the supplied source.',
});
const unavailableStatus = normalizedStatusFixture({
  accountStatus: 'Pending provider response',
  standing: 'Standing unavailable',
  notes: 'The provider did not return standing detail.',
});
const exactAge = normalizedStatusFixture({
  accountOpenedDate: 'Jan 8, 2024',
  statusAsOf: 'Jul 8, 2026',
});
const limitedAge = normalizedStatusFixture({
  firstSeen: 'Jan 8, 2026',
  statusAsOf: 'Jul 8, 2026',
});
const unavailableAge = normalizedStatusFixture({
  firstSeen: 'Training date',
  statusAsOf: 'Training date',
});
const missingSourceFacts = normalizePaymentRecord({
  id: 'PV-MISSING-SOURCE-FACTS',
  type: 'External payment account',
  accountStatus: 'Open',
  bankCode: 'BC-MISSING',
  destinationId: 'DST-MISSING',
}, {
  id: 'FA-PV-MISSING-SOURCE-FACTS',
  person: 'Do Not Infer This Customer',
});
const missingSourceLookup = resolvePaymentLookup(
  [missingSourceFacts],
  {
    bankCode: 'BC-MISSING',
    destinationId: 'DST-MISSING',
    ownerName: 'Do Not Infer This Customer',
  },
  { id: 'FA-PV-MISSING-SOURCE-FACTS' },
);
const businessPartyCase = {
  id: 'FA-PV-BUSINESS-PARTIES',
  customerType: 'business',
  person: 'Training Owner',
  profile: { business: 'Acme Corp LLC' },
  parties: [
    { name: 'Training Owner', role: 'Owner', partyType: 'person' },
    { name: 'Acme Corp LLC', role: 'Business', partyType: 'entity' },
  ],
  opened: 'Jul 8, 2026',
};
const ownerPartyRecord = normalizePaymentRecord({
  id: 'PV-OWNER-PARTY',
  type: 'Business checking account',
  object: 'Business checking',
  accountType: 'Business checking',
  accountHolder: 'Training Owner',
  accountStatus: 'Open',
  standing: 'No NSF record found',
  firstSeen: 'Jan 8, 2026',
  statusAsOf: 'Jul 8, 2026',
  bankCode: 'BC-OWNER',
  destinationId: 'DST-OWNER',
}, businessPartyCase);
const businessPartyRecord = normalizePaymentRecord({
  ...ownerPartyRecord,
  id: 'PV-BUSINESS-PARTY',
  accountHolder: 'Acme Corp LLC',
  bankCode: 'BC-BUSINESS',
  destinationId: 'DST-BUSINESS',
}, businessPartyCase);
const ownerPartyLookup = resolvePaymentLookup(
  [ownerPartyRecord],
  { bankCode: 'BC-OWNER', destinationId: 'DST-OWNER', ownerName: 'Training Owner' },
  businessPartyCase,
);
const businessPartyLookup = resolvePaymentLookup(
  [businessPartyRecord],
  { bankCode: 'BC-BUSINESS', destinationId: 'DST-BUSINESS', ownerName: 'Acme Corp LLC' },
  businessPartyCase,
);

if (openStatus.accountState !== 'Open') fail('Open account state did not normalize to Open.');
if (closedStatus.accountState !== 'Closed') fail('Closed account state did not normalize to Closed.');
if (frozenStatus.accountState !== 'Frozen') fail('Frozen account state did not normalize to Frozen.');
if (nsfFound.nsfStatus !== 'NSF found') fail('Positive NSF evidence did not normalize to NSF found.');
if (unavailableStatus.accountState !== 'Unable to Verify') fail('Pending account state did not remain unavailable.');
if (unavailableStatus.nsfStatus !== 'Unable to Verify') fail('Missing NSF evidence did not remain unavailable.');
if (exactAge.accountAgeLabel !== '2 years, 6 months') {
  fail(`Exact account age was not deterministic: ${exactAge.accountAgeLabel}.`);
}
if (limitedAge.accountAgeLabel !== 'At least 6 months in supplied history') {
  fail(`Limited-history account age was not preserved: ${limitedAge.accountAgeLabel}.`);
}
if (unavailableAge.accountAgeLabel !== 'Unable to verify from supplied history') {
  fail(`Unavailable account age was not explicit: ${unavailableAge.accountAgeLabel}.`);
}
if (missingSourceLookup.nameMatchResult !== 'Unable to Verify') {
  fail('A missing account-holder source was inferred from the active-case customer.');
}
for (const field of ['ownershipHistory', 'trustedContactSource', 'customerLink', 'callbackStatus']) {
  if (!/not supplied/i.test(missingSourceFacts[field])) {
    fail(`Missing Payment source fact ${field} was synthesized instead of remaining unavailable.`);
  }
}
if (ownerPartyLookup.matchedPartyType !== 'Owner' || ownerPartyLookup.nameMatchResult !== 'Match') {
  fail('Business-owner lookup did not return a matching Owner relationship.');
}
if (businessPartyLookup.matchedPartyType !== 'Business' || businessPartyLookup.nameMatchResult !== 'Match') {
  fail('Business-name lookup did not return a matching Business relationship.');
}

const creditCase = cases.find((item) => item.id === 'FA-CR-24003');
const creditRecords = getFinancialRecords(creditCase).paymentVerification;
const exactLookup = resolvePaymentLookup(
  creditRecords,
  { bankCode: 'BC-204', destinationId: 'DST-7740', ownerName: 'Avery Brooks' },
  creditCase,
);
if (exactLookup.state !== 'found' || exactLookup.nameMatchResult !== 'Partial Match') fail('Exact destination lookup did not return the expected partial name result.');
if (exactLookup.recordId !== 'PAY-3302' || exactLookup.accountState !== 'Open') {
  fail('Duplicate destination lookup did not select the actual linked account record.');
}
if (exactLookup.nsfStatus !== 'No NSF found') {
  fail('Duplicate destination lookup did not reconcile the supplied no-NSF evidence.');
}
if (exactLookup.matchingRecordIds?.length !== 3) {
  fail('Duplicate destination lookup did not retain all matching source-record identifiers.');
}
if (exactLookup.matchedPartyType !== 'Person') {
  fail('Personal credit lookup did not identify the supplied name as a person.');
}
const missingLookup = resolvePaymentLookup(
  creditRecords,
  { bankCode: 'BC-404', destinationId: 'DST-MISSING', ownerName: 'Avery Brooks' },
  creditCase,
);
if (missingLookup.nameMatchResult !== 'Destination Not Found' || missingLookup.record) fail('Missing destination lookup leaked a record.');

const hint = buildPaymentLookupHint({ bankCode: 'BC-204', destinationId: 'DST-7740', ownerName: 'Avery Brooks' });
if (JSON.stringify(parsePaymentLookupHint(hint)) !== JSON.stringify({ bankCode: 'BC-204', destinationId: 'DST-7740', ownerName: 'Avery Brooks' })) fail('Payment lookup prefill did not round-trip.');
if (JSON.stringify(paymentLookupPrefillFromQuery(hint, creditRecords)) !== JSON.stringify({
  bankCode: 'BC-204',
  destinationId: 'DST-7740',
  ownerName: 'Avery Brooks',
  replace: true,
})) fail('Structured Payment lookup did not replace all search fields.');
if (JSON.stringify(paymentLookupPrefillFromQuery('BC-204', creditRecords)) !== JSON.stringify({
  bankCode: 'BC-204',
  replace: false,
})) fail('Quick Pad Bank Code did not map to the Payment search.');
if (JSON.stringify(paymentLookupPrefillFromQuery('DST-7740', creditRecords)) !== JSON.stringify({
  destinationId: 'DST-7740',
  replace: false,
})) fail('Quick Pad Destination ID did not map to the Payment search.');
const pinnedPaymentPrefill = paymentLookupPrefillFromQuery('PAY-3302', creditRecords);
if (
  pinnedPaymentPrefill?.bankCode !== 'BC-204'
  || pinnedPaymentPrefill?.destinationId !== 'DST-7740'
  || pinnedPaymentPrefill?.ownerName
  || pinnedPaymentPrefill?.replace !== false
) {
  fail('Pinned Payment evidence did not restore only the non-secret destination identifiers.');
}
if (paymentLookupPrefillFromQuery('UNKNOWN-LOOKUP', creditRecords) !== null) {
  fail('Unknown Payment query unexpectedly populated the search.');
}

const generatedLaneVariants = new Set();
let generatedSequence = 1900000000000;
let eligibleGeneratedCases = 0;
for (const claimType of coreClaimTypes) {
  for (const scenario of claimType.scenarios) {
    generatedSequence += 1;
    const generated = createGeneratedCase({
      index: generatedSequence,
      claimTypeId: claimType.id,
      scenarioId: scenario.id,
      difficulty: 'deep',
      evidenceDepth: 'deep',
    });
    if (!generated.availableTools.includes('Payment Verification')) continue;
    eligibleGeneratedCases += 1;
    const records = getFinancialRecords(generated).paymentVerification;
    if (!records.length) {
      fail(`${scenario.id} exposes Payment Verification without a normalized record.`);
      continue;
    }
    for (const record of records) {
      generatedLaneVariants.add(record.laneVariant);
      for (const field of requiredFields) {
        if (record[field] === undefined || record[field] === '') fail(`${scenario.id}/${record.id} is missing ${field}.`);
      }
      for (const field of canonicalChangeFields) {
        if (!present(record[field])) fail(`${scenario.id}/${record.id} is missing canonical ${field}.`);
      }
      if (!/^BC-[A-Z0-9-]+$/i.test(record.bankCode ?? '')) fail(`${scenario.id}/${record.id} has a non-canonical Bank Code.`);
      if (!/^DST-[A-Z0-9-]+$/i.test(record.destinationId ?? '')) fail(`${scenario.id}/${record.id} has a non-canonical Destination ID.`);
      if (!PAYMENT_NAME_RESULTS.includes(record.nameMatchResult)) fail(`${scenario.id}/${record.id} has a non-canonical stored name result.`);
      if (/fraud/i.test(record.operationalStatus)) fail(`${scenario.id}/${record.id} uses fraud as operational status.`);
      if (!Array.isArray(record.verificationAttempts) || !record.verificationAttempts.length) fail(`${scenario.id}/${record.id} has no verification attempts.`);
      const resolved = resolvePaymentLookup(records, {
        bankCode: record.bankCode,
        destinationId: record.destinationId,
        ownerName: generated.person,
      }, generated);
      if (resolved.state !== 'found' || !PAYMENT_NAME_RESULTS.includes(resolved.nameMatchResult)) {
        fail(`${scenario.id}/${record.id} cannot be retrieved through the canonical lookup.`);
      }
    }

    if (generatedPaymentChangeLanes.has(generated.claimTypeId)) {
      const canonicalRecord = records[0];
      const matchingEvents = paymentChangeEvents(generated);
      if (!matchingEvents.length) {
        fail(`${scenario.id} has Payment Verification but no payment-related profile event.`);
      }
      for (const event of matchingEvents) {
        for (const field of canonicalChangeFields) {
          if (event[field] !== canonicalRecord[field]) {
            fail(`${scenario.id}/${event.id} ${field} does not match ${canonicalRecord.id}.`);
          }
        }
        const eventText = [
          event.detail,
          event.oldValue,
          event.newValue,
          event.bankCode,
          event.destinationId,
          event.oldDestination,
          event.newDestination,
        ].filter(Boolean).join(' ');
        if (!eventText.includes(canonicalRecord.bankCode) || !eventText.includes(canonicalRecord.destinationId)) {
          fail(`${scenario.id}/${event.id} does not expose the canonical Bank Code and Destination ID.`);
        }
        if (!eventText.includes(canonicalRecord.oldDestination) || !eventText.includes(canonicalRecord.newDestination)) {
          fail(`${scenario.id}/${event.id} does not expose the canonical previous and new destination.`);
        }
        if (placeholderOrNoChangePattern.test(eventText)) {
          fail(`${scenario.id}/${event.id} contains a masked, placeholder, or contradictory no-change destination.`);
        }
      }
    }

    if (generated.claimTypeId === 'payroll-direct-deposit') {
      const canonicalRecord = records[0];
      const payrollWorkspace = getPayrollHistory(generated);
      if (!payrollWorkspace.payrollRuns.length) {
        fail(`${scenario.id} has no generated company Payroll History runs.`);
      }
      for (const payrollRun of payrollWorkspace.payrollRuns) {
        const destinations = payrollRun.employees[0]?.paystub?.paymentDestinations ?? [];
        const hasCurrentDestination = destinations.some((destination) => destination.bankCode === canonicalRecord.bankCode && destination.destinationId === canonicalRecord.destinationId);
        const currentDestinationEffective = new Date(payrollRun.payDate) >= new Date(canonicalRecord.firstSeen);
        if (currentDestinationEffective && !hasCurrentDestination) fail(`${scenario.id}/${payrollRun.id} omits the destination effective for that payroll snapshot.`);
        if (!currentDestinationEffective && hasCurrentDestination) fail(`${scenario.id}/${payrollRun.id} backfills a destination introduced after the payroll posted.`);
        const payrollText = JSON.stringify(payrollRun);
        for (const gatedField of ['accountHolder', 'ownerMatch', 'ownershipStatus', 'operationalStatus', 'priorUseHistory']) {
          if (payrollText.includes(gatedField)) fail(`${scenario.id}/${payrollRun.id} exposes gated Payment Verification field ${gatedField}.`);
        }
      }
    }
  }
}

if (eligibleGeneratedCases < 1) fail('No generated Payment Verification cases were exercised.');
for (const expectedLane of ['Personal', 'Payroll', 'Business']) {
  if (!generatedLaneVariants.has(expectedLane)) fail(`Generated cases did not exercise the ${expectedLane} Payment Verification variant.`);
}

const fallbackCase = {
  id: 'FA-FALLBACK-PV',
  person: 'Training Customer',
  type: 'Account review',
  claimType: 'Account review',
  availableTools: ['Payment Verification'],
  opened: 'Training date',
};
const fallbackRecord = getFinancialRecords(fallbackCase).paymentVerification[0];
if (fallbackRecord) {
  fail('A case without supplied payment evidence received a fabricated Payment Verification record.');
}

const toolModule = fs.readFileSync(new URL('../src/tools/FinancialBusinessTools.jsx', import.meta.url), 'utf8');
const paymentWorkspace = toolModule.slice(
  toolModule.indexOf('export function PaymentVerificationTool'),
  toolModule.indexOf('function explicitBusinessProfile'),
);
for (const anchor of [
  'Bank Code',
  'Destination ID',
  'relationship-aware name comparison',
  'Run verification',
  'No exact Bank Code and Destination ID pair was found',
  'Name relationship',
  'Account status',
  'NSF result',
  'Time on record',
  'Ownership status',
  'Ownership history',
  'Prior-use history',
  'Verification activity',
  'Callback status',
  'Trusted contact source',
  'Previous destination',
  'Current destination',
  'Change comparison',
  'Return / NSF history',
  'Payment type',
  'resolvePaymentLookup(records, submitted, activeCase)',
  'sky-payment-reference-locked',
  'Verification result is hidden',
  'setResult(null);',
  'lookupHistory',
  'This case session only',
]) {
  if (!paymentWorkspace.includes(anchor)) fail(`Payment Verification UI is missing: ${anchor}`);
}
for (const forbidden of [
  'Account holder',
  'Operational account status',
  'Evidence-first summary',
  'ready for payments',
]) {
  if (paymentWorkspace.toLowerCase().includes(forbidden.toLowerCase())) {
    fail(`Payment Verification narrow result leaks forbidden detail: ${forbidden}.`);
  }
}
if (/\baccountHolder\b/.test(paymentWorkspace)) {
  fail('Payment Verification UI reads the hidden account-holder value.');
}
if (/\b(?:fraud score|name match score|confidence score|\d{1,3}% confidence)\b/i.test(paymentWorkspace)) {
  fail('Payment Verification UI exposes a score.');
}
if (/\b(?:approve|deny|ready for payments)\b/i.test(paymentWorkspace)) {
  fail('Payment Verification UI exposes pre-decision approval or payment-routing language.');
}
for (const legacyClass of [
  'payment-verification-gate',
  'payment-detail-panel',
  'payment-verification-snapshot',
  'payment-action-panel',
  'payment-lookup-history',
  'investigation-tool-next-routes',
  'investigation-tool-review-bar',
]) {
  if (paymentWorkspace.includes(legacyClass)) {
    fail(`Payment Verification still couples the rebuilt layout to legacy class ${legacyClass}.`);
  }
}
for (const anchor of [
  "'Payment Verification': PaymentVerificationTool",
  'record,',
  'sourceRecordId',
  'bankCode',
  'destinationId',
]) {
  if (!toolModule.includes(anchor)) fail(`Payment tool registry or strict Quick Pad handoff is missing: ${anchor}`);
}

if (failures.length) {
  console.error(`Payment Verification smoke check failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Payment Verification smoke check passed for all ${eligibleGeneratedCases} eligible generated scenarios plus every built-in and fallback case. Search-before-reveal, exact destination selection, person/owner/business name relationships, narrow account status and NSF results, deterministic or limited account age, source prefills, and Evidence First result boundaries are intact.`);
