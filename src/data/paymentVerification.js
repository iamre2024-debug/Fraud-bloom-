import { getRelationshipAccounts } from './relationshipAccounts.js';

export const PAYMENT_NAME_RESULTS = Object.freeze([
  'Match',
  'Partial Match',
  'No Match',
  'Unable to Verify',
  'Destination Not Found',
]);

const holderCorrections = new Map([
  ['FA-ATO-24018:Maya Thompson', 'Maya Sterling'],
  ['FA-CR-24003:Riley Carter', 'Avery Brooks'],
  ['FA-CR-24003:R. Carter', 'A. Brooks'],
  ['FA-CR-24003:Riley Carter / R. Carter comparison', 'A. Brooks'],
]);

function text(value, fallback = 'Not supplied') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function normalizedName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizedName(value).split(' ').filter(Boolean);
}

const businessSuffixes = new Set([
  'co',
  'company',
  'corp',
  'corporation',
  'inc',
  'incorporated',
  'llc',
  'llp',
  'lp',
  'ltd',
  'limited',
  'plc',
]);

function meaningfulNameTokens(value) {
  return nameTokens(value).filter((token) => !businessSuffixes.has(token));
}

function compatibleNameToken(left = '', right = '') {
  return left === right
    || (left.length === 1 && right.startsWith(left))
    || (right.length === 1 && left.startsWith(right));
}

function canonicalStoredResult(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (/(no info|unable|not returned|unknown|recorded)/.test(normalized)) return 'Unable to Verify';
  if (/(partial)/.test(normalized)) return 'Partial Match';
  if (/(no match|mismatch)/.test(normalized)) return 'No Match';
  if (/(name match|exact match|\bmatch\b)/.test(normalized)) return 'Match';
  return 'Unable to Verify';
}

export function comparePaymentOwner(inputName, recordedName) {
  if (
    /^(?:not supplied|unavailable|unknown)$/i.test(String(inputName ?? '').trim())
    || /^(?:not supplied|unavailable|unknown)$/i.test(String(recordedName ?? '').trim())
  ) return 'Unable to Verify';
  const input = nameTokens(inputName);
  const recorded = nameTokens(recordedName);
  if (!input.length || !recorded.length) return 'Unable to Verify';
  if (input.join(' ') === recorded.join(' ')) return 'Match';

  const meaningfulInput = meaningfulNameTokens(inputName);
  const meaningfulRecorded = meaningfulNameTokens(recordedName);
  if (!meaningfulInput.length || !meaningfulRecorded.length) return 'Unable to Verify';

  const sameMeaningfulName = meaningfulInput.length === meaningfulRecorded.length
    && meaningfulInput.every((token, index) => compatibleNameToken(token, meaningfulRecorded[index]));
  if (sameMeaningfulName) return 'Partial Match';

  const sameLast = meaningfulInput.at(-1) === meaningfulRecorded.at(-1);
  const compatibleFirst = compatibleNameToken(meaningfulInput[0], meaningfulRecorded[0]);
  const sharedMeaningfulTokens = meaningfulInput.filter((token) => meaningfulRecorded.includes(token));
  const meaningfulOverlap = sharedMeaningfulTokens.length >= 2
    && sharedMeaningfulTokens.length >= Math.ceil(Math.min(meaningfulInput.length, meaningfulRecorded.length) / 2);

  if ((sameLast && compatibleFirst) || meaningfulOverlap) {
    return 'Partial Match';
  }
  return 'No Match';
}

function operationalStatus(value) {
  const normalized = String(value ?? '').toLowerCase();
  if (/closed/.test(normalized)) return 'Closed';
  if (/frozen|restricted|blocked/.test(normalized)) return 'Frozen';
  if (/pending/.test(normalized)) return 'Pending';
  if (/open|active/.test(normalized)) return 'Open';
  return 'Status unavailable';
}

function laneVariant(activeCase = {}, record = {}) {
  const context = `${activeCase.claimType} ${activeCase.type} ${activeCase.lane} ${record.type} ${record.accountType}`.toLowerCase();
  if (/payroll|employee|direct deposit/.test(context)) return 'Payroll';
  if (
    activeCase.customerType === 'business'
    || /business|vendor|commercial/.test(`${activeCase.productType} ${record.type} ${record.accountType}`.toLowerCase())
  ) return 'Business';
  return 'Personal';
}

function accountState(value) {
  const normalized = operationalStatus(value);
  if (normalized === 'Pending' || normalized === 'Status unavailable') return 'Unable to Verify';
  return normalized;
}

function nsfStatus(standing, notes, returnHistory) {
  const normalized = `${standing ?? ''} ${notes ?? ''} ${returnHistory ?? ''}`.toLowerCase();
  const noNsfPattern = /\b(?:no|zero|0)\b.{0,32}\b(?:nsf|returned|return)\b/;
  const noNsfEvidence = noNsfPattern.test(normalized) || /good standing/.test(normalized);
  const positiveText = normalized.replace(
    /\b(?:no|zero|0)\b.{0,32}\b(?:nsf|returned|return)\b/g,
    ' ',
  );
  const nsfEvidence = /\bnsf\b|returned[- ]payment|returned entry/.test(positiveText);
  if (noNsfEvidence && nsfEvidence) return 'Unable to Verify';
  if (noNsfEvidence) return 'No NSF found';
  if (nsfEvidence) return 'NSF found';
  return 'Unable to Verify';
}

function dateValue(value) {
  const normalized = String(value ?? '')
    .replace(/\s+[·-]\s+\d{1,2}:\d{2}.*$/i, '')
    .trim();
  if (!normalized || /^training date$/i.test(normalized)) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function durationLabel(startValue, endValue) {
  const start = dateValue(startValue);
  const end = dateValue(endValue);
  if (!start || !end || end < start) return null;

  let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
    + (end.getUTCMonth() - start.getUTCMonth());
  if (end.getUTCDate() < start.getUTCDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(0, Math.floor((end - start) / 86_400_000));
    if (days === 0) return 'First seen on the status date';
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`;
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return `${years} year${years === 1 ? '' : 's'}${remainingMonths ? `, ${remainingMonths} month${remainingMonths === 1 ? '' : 's'}` : ''}`;
}

function partyTypeForLookup(activeCase = {}, lookupName = '', record = {}) {
  const normalizedLookup = normalizedName(lookupName);
  const parties = activeCase.parties ?? [];
  const party = parties.find((item) => normalizedName(item.name) === normalizedLookup);
  if (party) {
    if (/\bowner\b/i.test(party.role ?? '')) return 'Owner';
    if (party.partyType === 'entity') return 'Business';
    return 'Person';
  }

  const businessName = activeCase.profile?.business ?? activeCase.business;
  if (businessName && normalizedName(businessName) === normalizedLookup) return 'Business';
  if (record.laneVariant === 'Business') return 'Business';
  return 'Person';
}

function accountRecordScore(record = {}) {
  const text = `${record.type ?? ''} ${record.accountType ?? ''}`.toLowerCase();
  let score = 0;
  if (/destination|bank account|checking|savings|deposit account|linked external account|external payment account/.test(text)) score += 5;
  if (/payment instrument|debit card|credit card/.test(text)) score += 3;
  if (/packet|token|authorization|bank code/.test(text)) score -= 4;
  return score;
}

function accountOpenedDateFor(activeCase = {}, record = {}) {
  const explicitDate = String(record.accountOpenedDate ?? record.openDate ?? '').trim();
  if (explicitDate) return explicitDate;

  const ending = String(record.object ?? '').match(/\bending\s+(\d{4})\b/i)?.[1];
  if (!ending) return '';
  const relationship = getRelationshipAccounts(activeCase).find((account) => (
    String(account.accountId ?? '').endsWith(ending)
    || String(account.maskedAccountId ?? '').endsWith(ending)
  ));
  return String(relationship?.openDate ?? '').trim();
}

function neutralOutcome(value) {
  const outcome = text(value, 'Verification evidence recorded');
  if (/^(hold|pause|release|approve|deny|remove|close)\b/i.test(outcome)) {
    return 'Additional evidence review is required before an operational decision';
  }
  return outcome;
}

function neutralAction(value) {
  const action = text(value, 'Document the verification source');
  if (/^(hold|pause|release|approve|deny|remove|close)\b/i.test(action)) {
    return 'Document the available account control for senior review';
  }
  return action;
}

function correctedHolder(activeCase, record) {
  return holderCorrections.get(`${activeCase.id}:${record.accountHolder}`)
    ?? text(record.accountHolder);
}

function exactDestinationLabel(bankCode, destinationId) {
  return `Bank Code ${bankCode} · Destination ID ${destinationId}`;
}

function normalizedNewDestination(value, bankCode, destinationId) {
  const supplied = String(value ?? '').trim();
  return supplied || exactDestinationLabel(bankCode, destinationId);
}

export function normalizePaymentRecord(record = {}, activeCase = {}) {
  const accountHolder = correctedHolder(activeCase, record);
  const storedNameResult = canonicalStoredResult(record.nameMatchResult ?? record.ownerMatch);
  const lane = laneVariant(activeCase, record);
  const attempts = (record.verificationAttempts ?? record.verificationLog ?? []).map((entry, index) => ({
    id: entry.id ?? `${record.id ?? 'PV'}-ATTEMPT-${index + 1}`,
    time: text(entry.time, activeCase.reportedDate ?? 'Training date'),
    method: text(entry.method, 'Recorded lookup'),
    result: text(entry.result, 'Recorded'),
    note: text(entry.note, 'No additional attempt detail supplied'),
  }));
  const callback = attempts.find((entry) => /callback|phone|contact/i.test(`${entry.method} ${entry.result} ${entry.note}`));
  const firstSeen = text(record.firstSeen, record.lastSeen);
  const statusAsOf = text(record.statusAsOf, record.lastSeen);
  const accountOpenedDate = accountOpenedDateFor(activeCase, record);
  const exactAge = durationLabel(accountOpenedDate, statusAsOf);
  const suppliedHistoryAge = durationLabel(firstSeen, statusAsOf);
  const priorUseHistory = text(record.priorUse, 'Prior-use history unavailable');
  const standingStatus = text(record.standing, 'Standing unavailable');
  const bankCode = text(record.bankCode);
  const destinationId = text(record.destinationId);
  const suppliedOldDestination = String(record.oldDestination ?? '').trim();
  const suppliedNewDestination = String(record.newDestination ?? '').trim();
  const oldDestination = text(suppliedOldDestination, 'Prior account / destination not supplied');
  const newDestination = normalizedNewDestination(record.newDestination, bankCode, destinationId);
  const changeComparison = text(
    record.changeComparison,
    suppliedOldDestination && suppliedNewDestination
      ? `${suppliedOldDestination} changed to ${suppliedNewDestination}.`
      : 'Destination change comparison not supplied',
  );
  const returnHistory = /no nsf|no return/i.test(standingStatus)
    ? 'No NSF or returned-payment record found'
    : /nsf|return/i.test(`${standingStatus} ${record.notes ?? ''}`)
      ? text(standingStatus)
      : text(record.returnHistory, 'Return / NSF history not supplied');

  return {
    ...record,
    id: text(record.id, `${activeCase.id ?? 'CASE'}-PV-1`),
    bankCode,
    destinationId,
    oldDestination,
    newDestination,
    changeComparison,
    accountHolder,
    ownerMatch: storedNameResult,
    nameMatchResult: storedNameResult,
    ownershipStatus: text(record.ownershipStatus, {
      Match: 'Recorded source identifies the named owner',
      'Partial Match': 'Recorded source returns a partial owner-name relationship',
      'No Match': 'Recorded source returns a different owner name',
      'Unable to Verify': 'The available source does not confirm ownership',
    }[storedNameResult]),
    operationalStatus: operationalStatus(record.operationalStatus ?? record.accountStatus),
    accountState: accountState(record.operationalStatus ?? record.accountStatus),
    standingStatus,
    nsfStatus: nsfStatus(standingStatus, record.notes, record.returnHistory),
    paymentType: text(record.paymentType, record.accountType ?? record.type),
    paymentStatus: text(record.paymentStatus, record.status),
    laneVariant: lane,
    priorUseHistory,
    ownershipHistory: text(
      record.ownershipHistory,
      'Ownership history not supplied',
    ),
    returnHistory,
    verificationAttempts: attempts,
    callbackStatus: text(record.callbackStatus, callback
      ? `${callback.result}: ${callback.note}`
      : 'Callback record not supplied'),
    trustedContactSource: text(
      record.trustedContactSource,
      'Trusted-contact source not supplied',
    ),
    customerLink: text(record.customerLink, 'Customer or business link not supplied'),
    reviewContext: text(record.reviewContext, changeComparison || record.context),
    evidenceSummary: text(
      record.evidenceSummary,
      `${storedNameResult}; ${operationalStatus(record.accountStatus)} operational status; ${priorUseHistory}.`,
    ),
    verificationOutcome: neutralOutcome(record.verificationOutcome),
    actions: (record.actions ?? []).map(neutralAction),
    firstSeen,
    accountOpenedDate: accountOpenedDate || null,
    statusAsOf,
    accountAgeLabel: exactAge
      ? (exactAge === 'First seen on the status date' ? 'Opened on the status date' : exactAge)
      : suppliedHistoryAge === 'First seen on the status date'
        ? 'First seen on the status date; no earlier history supplied'
        : suppliedHistoryAge
          ? `At least ${suppliedHistoryAge} in supplied history`
          : 'Unable to verify from supplied history',
  };
}

export function normalizePaymentRecords(records = [], activeCase = {}) {
  return records.map((record) => normalizePaymentRecord(record, activeCase));
}

export function isPaymentProfileEvent(event = {}) {
  return /\b(?:bank|destination|beneficiary|payee|direct deposit|external (?:payment )?account|payment (?:profile|method|account))\b/i.test(
    `${event.eventType ?? ''} ${event.item ?? ''}`,
  );
}

export function findPaymentRecordForProfileEvent(event = {}, records = []) {
  if (!isPaymentProfileEvent(event) || !records.length) return null;
  if (event.paymentRecordId) {
    const linked = records.find((record) => record.id === event.paymentRecordId);
    if (linked) return linked;
  }

  const eventText = [
    event.oldValue,
    event.newValue,
    event.detail,
    event.notes,
  ].filter(Boolean).join(' ').toLowerCase();
  const exact = records.find((record) => [record.bankCode, record.destinationId]
    .filter(Boolean)
    .some((value) => eventText.includes(String(value).toLowerCase())));
  if (exact) return exact;

  const compared = records.find((record) => [record.oldDestination, record.newDestination]
    .filter(Boolean)
    .some((value) => eventText.includes(String(value).toLowerCase())));
  if (compared) return compared;
  return records.length === 1 ? records[0] : null;
}

export function paymentChangeMetadata(event = {}, records = []) {
  if (!isPaymentProfileEvent(event)) return [];
  const record = findPaymentRecordForProfileEvent(event, records);
  const bankCode = text(record?.bankCode ?? event.bankCode);
  const destinationId = text(record?.destinationId ?? event.destinationId);
  const previousDestination = text(
    record?.oldDestination ?? event.oldDestination ?? event.oldValue,
    'No prior account / destination supplied',
  );
  const newDestination = record
    ? normalizedNewDestination(record.newDestination, bankCode, destinationId)
    : text(event.newDestination ?? event.newValue);
  const changeComparison = text(
    record?.changeComparison ?? event.changeComparison ?? event.detail,
    `${previousDestination} changed to ${newDestination}.`,
  );
  return [
    ['Bank Code', bankCode],
    ['Destination ID', destinationId],
    ['Previous account / destination', previousDestination],
    ['New account / destination', newDestination],
    ['Change comparison', changeComparison],
  ];
}

export function findPaymentDestinations(records = [], bankCode, destinationId) {
  const bank = String(bankCode ?? '').trim().toLowerCase();
  const destination = String(destinationId ?? '').trim().toLowerCase();
  if (!bank || !destination) return [];
  return records.filter((record) => (
    String(record.bankCode).trim().toLowerCase() === bank
    && String(record.destinationId).trim().toLowerCase() === destination
  ));
}

export function findPaymentDestination(records = [], bankCode, destinationId) {
  return findPaymentDestinations(records, bankCode, destinationId)
    .sort((left, right) => accountRecordScore(right) - accountRecordScore(left))[0] ?? null;
}

export function resolvePaymentLookup(records, lookup, activeCase = {}) {
  const matchingRecords = findPaymentDestinations(records, lookup.bankCode, lookup.destinationId)
    .sort((left, right) => accountRecordScore(right) - accountRecordScore(left));
  const record = matchingRecords[0] ?? null;
  if (!record) {
    return { state: 'not-found', record: null, nameMatchResult: 'Destination Not Found' };
  }
  const nameMatchResult = comparePaymentOwner(lookup.ownerName, record.accountHolder);
  const suppliedNsfResults = [...new Set(
    matchingRecords
      .map((item) => item.nsfStatus)
      .filter((value) => value && value !== 'Unable to Verify'),
  )];
  const reconciledNsfStatus = suppliedNsfResults.length === 1
    ? suppliedNsfResults[0]
    : 'Unable to Verify';
  return {
    state: 'found',
    record,
    recordId: record.id,
    matchingRecordIds: matchingRecords.map((item) => item.id),
    nameMatchResult,
    matchedPartyType: partyTypeForLookup(activeCase, lookup.ownerName, record),
    accountState: record.accountState,
    nsfStatus: reconciledNsfStatus,
    accountOpenedDate: record.accountOpenedDate,
    accountAgeLabel: record.accountAgeLabel,
    statusAsOf: record.statusAsOf,
    bankCode: record.bankCode,
    destinationId: record.destinationId,
  };
}

export function buildPaymentLookupHint({ bankCode = '', destinationId = '', ownerName = '' } = {}) {
  return `PVLOOKUP|${[bankCode, destinationId, ownerName].map((value) => encodeURIComponent(String(value))).join('|')}`;
}

export function parsePaymentLookupHint(value = '') {
  if (!String(value).startsWith('PVLOOKUP|')) return null;
  const [bankCode = '', destinationId = '', ownerName = ''] = String(value)
    .slice('PVLOOKUP|'.length)
    .split('|')
    .map((item) => decodeURIComponent(item));
  return { bankCode, destinationId, ownerName };
}

export function paymentLookupPrefillFromQuery(value = '', records = []) {
  const structuredHint = parsePaymentLookupHint(value);
  if (structuredHint) return { ...structuredHint, replace: true };

  const requested = String(value ?? '').trim();
  if (!requested) return null;

  const record = records.find((item) => (
    String(item.id ?? '').toLowerCase() === requested.toLowerCase()
  ));
  if (record) {
    return {
      bankCode: record.bankCode ?? '',
      destinationId: record.destinationId ?? '',
      replace: false,
    };
  }

  if (/^BC-/i.test(requested)) return { bankCode: requested, replace: false };
  if (/^DST-/i.test(requested)) return { destinationId: requested, replace: false };
  return null;
}
