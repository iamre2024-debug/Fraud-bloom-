import { getFinancialRecords } from './caseToolData.js';

export const linkIdentifierTypes = Object.freeze([
  { id: 'phone', label: 'Phone Number', shortLabel: 'Phone' },
  { id: 'email', label: 'Email Address', shortLabel: 'Email' },
  { id: 'training-id', label: 'Training ID', shortLabel: 'Training ID' },
  { id: 'address', label: 'Address', shortLabel: 'Address' },
  { id: 'device', label: 'Device ID', shortLabel: 'Device' },
  { id: 'ip', label: 'IP Address', shortLabel: 'IP' },
  { id: 'bank-code', label: 'Bank Code', shortLabel: 'Bank Code' },
  { id: 'destination-id', label: 'Destination ID', shortLabel: 'Destination ID' },
]);

const statusExplanations = Object.freeze({
  'Open · Current review': 'The current account is open. Its active case is still under investigator review.',
  'Open · Good standing': 'The linked account is open with no recorded servicing restriction.',
  'On Hold · NSF': 'The linked account has a recorded repayment or returned-payment restriction. NSF is not a fraud conclusion.',
  'On Hold · Paperwork required': 'The linked account is waiting for verification paperwork. Missing paperwork is not a fraud conclusion.',
  'Closed · Prior confirmed fraud': 'A separate prior investigation confirmed fraud on that linked account. The current case still requires its own evidence review.',
  'Closed · Other': 'The linked account is closed for an operational reason that is not a finding about the current case.',
});

function clean(value) {
  return String(value ?? '').trim();
}

function normalizedText(value) {
  return clean(value).normalize('NFKC').toLowerCase();
}

function normalizeIdentifierType(type = '') {
  const candidate = normalizedText(type).replace(/[\s_]+/g, '-');
  const directMatch = linkIdentifierTypes.find((item) => item.id === candidate);
  if (directMatch) return directMatch.id;
  const labelMatch = linkIdentifierTypes.find((item) => (
    normalizedText(item.label) === normalizedText(type)
    || normalizedText(item.shortLabel) === normalizedText(type)
  ));
  return labelMatch?.id ?? '';
}

function canonicalPhone(value) {
  const source = normalizedText(value).replace(/^tel:\s*/, '');
  const extensionMatch = source.match(/\s*(?:ext(?:ension)?\.?|x|#)\s*(\d+)\s*$/i);
  const extension = extensionMatch?.[1] ?? '';
  const base = extensionMatch ? source.slice(0, extensionMatch.index).trim() : source;

  // Do not silently turn a digit-bearing email or address into a phone key.
  if (/[a-z]/i.test(base)) return `invalid:${base.replace(/\s+/g, ' ')}`;

  let digits = base.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  return extension ? `${digits};ext=${extension}` : digits;
}

function canonicalEmail(value) {
  const source = normalizedText(value);
  const at = source.indexOf('@');
  if (at < 1 || at !== source.lastIndexOf('@')) return source.replace(/\s+/g, ' ');
  return `${source.slice(0, at).trim()}@${source.slice(at + 1).trim()}`;
}

function canonicalAddress(value) {
  return normalizedText(value)
    .replace(/\b([a-z]+)\./g, '$1')
    .replace(/,/g, ' ')
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/\s*#\s*/g, ' #')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalIp(value) {
  const source = normalizedText(value).replace(/^\[|\]$/g, '');
  const parts = source.split('.');
  if (
    parts.length !== 4
    || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  ) {
    return source.replace(/\s+/g, '');
  }
  return parts.map((part) => String(Number(part))).join('.');
}

export function normalizeLinkIdentifier(value, identifierType = '') {
  const resolvedType = normalizeIdentifierType(identifierType)
    || inferLinkIdentifierType('', clean(value));
  const canonical = resolvedType === 'phone'
    ? canonicalPhone(value)
    : resolvedType === 'email'
      ? canonicalEmail(value)
      : resolvedType === 'address'
        ? canonicalAddress(value)
        : resolvedType === 'ip'
          ? canonicalIp(value)
          : normalizedText(value).replace(/\s+/g, ' ');
  return `${resolvedType || 'generic'}:${canonical}`;
}

function typeMeta(typeId) {
  const resolvedType = normalizeIdentifierType(typeId);
  return linkIdentifierTypes.find((item) => item.id === resolvedType) ?? {
    id: resolvedType || 'identifier',
    label: 'Identifier',
    shortLabel: 'Identifier',
  };
}

export function inferLinkIdentifierType(type = '', value = '') {
  const joined = `${type} ${value}`.toLowerCase();
  if (/training id/.test(joined) || /^trn-/i.test(value)) return 'training-id';
  if (/phone|mobile/.test(joined)) return 'phone';
  if (/email/.test(joined) || /@/.test(value)) return 'email';
  if (/address/.test(joined)) return 'address';
  if (/\bip\b|network/.test(joined) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return 'ip';
  if (/bank code/.test(joined) || /^bc-/i.test(value)) return 'bank-code';
  if (/destination/.test(joined) || /^dst-/i.test(value)) return 'destination-id';
  if (/device/.test(joined) || /^dev-/i.test(value)) return 'device';
  if (/^(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?:\s*(?:ext(?:ension)?\.?|x|#)\s*\d+)?$/i.test(clean(value))) return 'phone';
  if (/^\d+\s+\S+(?:\s+\S+)*(?:\s|,)+(?:st(?:reet)?|ave(?:nue)?|rd|road|blvd|boulevard|ln|lane|dr|drive|ct|court|way)\b/i.test(clean(value))) return 'address';
  return '';
}

export function formatLinkAnalysisPin({ identifierType, value, accountId = '' } = {}) {
  const resolvedType = normalizeIdentifierType(identifierType);
  const exactValue = clean(value);
  if (!resolvedType || !exactValue) return '';
  const base = `LNK-${typeMeta(resolvedType).label}: ${exactValue}`;
  return accountId ? `${base} · ${clean(accountId)}` : base;
}

export function parseLinkAnalysisPin(value) {
  const match = clean(value).match(/^LNK-([^:]+):\s*(.+?)(?:\s+·\s+(.+))?$/i);
  if (!match) return null;
  const identifierType = normalizeIdentifierType(match[1]);
  const searchedIdentifier = clean(match[2]);
  if (!identifierType || !searchedIdentifier) return null;
  return {
    identifierType,
    searchedIdentifier,
    accountId: clean(match[3]),
  };
}

function addIdentifier(target, {
  type,
  value,
  source = 'Case record',
  sourceRecordId = '',
  firstUse = 'Not recorded',
  lastUse = 'Not recorded',
  confidence = 'Exact record match',
}) {
  const exactValue = clean(value);
  if (!type || !exactValue || /not supplied|not available|not applicable/i.test(exactValue)) return;
  const key = normalizeLinkIdentifier(exactValue, type);
  if (target.some((item) => item.type === type && normalizeLinkIdentifier(item.value, item.type) === key)) return;
  target.push({
    type,
    typeLabel: typeMeta(type).label,
    shortLabel: typeMeta(type).shortLabel,
    value: exactValue,
    source,
    sourceRecordId,
    firstUse,
    lastUse,
    confidence,
  });
}

function splitIdentityValue(record = {}) {
  return clean(record.value)
    .split(/\s*(?:\||·)\s*/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({
      type: inferLinkIdentifierType(record.type, value),
      value,
    }))
    .filter((item) => item.type);
}

export function getLinkIdentifiersForCase(activeCase = {}) {
  const identifiers = [];
  const opened = activeCase.reportedDate ?? activeCase.opened ?? 'Training date';
  const relationshipSince = activeCase.customer?.relationshipSince ?? activeCase.issueStartDate ?? opened;
  const contact = activeCase.customer?.contact ?? {};

  addIdentifier(identifiers, {
    type: 'training-id',
    value: activeCase.trainingId,
    source: 'Customer identity record',
    sourceRecordId: activeCase.identityRecords?.find((item) => /training id/i.test(item.type))?.id,
    firstUse: relationshipSince,
    lastUse: opened,
  });
  addIdentifier(identifiers, {
    type: 'phone',
    value: contact.phone,
    source: 'Customer 360 contact record',
    firstUse: relationshipSince,
    lastUse: opened,
  });
  addIdentifier(identifiers, {
    type: 'email',
    value: contact.email,
    source: 'Customer 360 contact record',
    firstUse: relationshipSince,
    lastUse: opened,
  });
  addIdentifier(identifiers, {
    type: 'address',
    value: contact.address,
    source: 'Customer 360 address record',
    firstUse: relationshipSince,
    lastUse: opened,
    confidence: 'Recorded profile match',
  });

  for (const record of activeCase.identityRecords ?? []) {
    for (const identifier of splitIdentityValue(record)) {
      addIdentifier(identifiers, {
        ...identifier,
        source: record.type ?? 'Identity record',
        sourceRecordId: record.id,
        firstUse: relationshipSince,
        lastUse: record.lastSeen ?? opened,
      });
    }
  }

  for (const party of activeCase.parties ?? []) {
    addIdentifier(identifiers, {
      type: 'training-id',
      value: party.trainingId,
      source: `${party.role ?? 'Related party'} record`,
      firstUse: relationshipSince,
      lastUse: opened,
    });
    addIdentifier(identifiers, {
      type: 'phone',
      value: party.phone,
      source: `${party.role ?? 'Related party'} record`,
      firstUse: relationshipSince,
      lastUse: opened,
    });
    addIdentifier(identifiers, {
      type: 'email',
      value: party.email,
      source: `${party.role ?? 'Related party'} record`,
      firstUse: relationshipSince,
      lastUse: opened,
    });
    addIdentifier(identifiers, {
      type: 'address',
      value: party.address,
      source: `${party.role ?? 'Related party'} record`,
      firstUse: relationshipSince,
      lastUse: opened,
    });
  }

  for (const login of activeCase.loginHistory ?? []) {
    addIdentifier(identifiers, {
      type: 'device',
      value: login.deviceId ?? login.device,
      source: 'Device Intelligence',
      sourceRecordId: login.id,
      firstUse: login.time,
      lastUse: login.time,
    });
    addIdentifier(identifiers, {
      type: 'ip',
      value: login.ip,
      source: 'IP Intelligence',
      sourceRecordId: login.id,
      firstUse: login.time,
      lastUse: login.time,
    });
  }

  for (const payment of getFinancialRecords(activeCase).paymentVerification ?? []) {
    addIdentifier(identifiers, {
      type: 'bank-code',
      value: payment.bankCode,
      source: 'Payment Verification',
      sourceRecordId: payment.id,
      firstUse: payment.firstSeen ?? payment.lastSeen ?? opened,
      lastUse: payment.lastSeen ?? payment.firstSeen ?? opened,
    });
    addIdentifier(identifiers, {
      type: 'destination-id',
      value: payment.destinationId,
      source: 'Payment Verification',
      sourceRecordId: payment.id,
      firstUse: payment.firstSeen ?? payment.lastSeen ?? opened,
      lastUse: payment.lastSeen ?? payment.firstSeen ?? opened,
    });
  }

  return identifiers;
}

function isBusinessCase(activeCase = {}) {
  return Boolean(activeCase.profile?.business)
    || /business|payroll|merchant|company/i.test(`${activeCase.type ?? ''} ${activeCase.lane ?? ''} ${activeCase.customer?.segment ?? ''}`);
}

function caseCustomerName(activeCase = {}) {
  return activeCase.profile?.business
    ?? activeCase.businessProfile?.legalName
    ?? activeCase.person
    ?? 'Fictional training customer';
}

function caseProduct(activeCase = {}) {
  return activeCase.taxonomyTags?.productTypeLabel
    ?? activeCase.taxonomyTags?.productRail
    ?? activeCase.customer?.segment
    ?? activeCase.type
    ?? 'Training account';
}

function caseAccount(activeCase = {}) {
  const opened = activeCase.reportedDate ?? activeCase.opened ?? 'Training date';
  return {
    accountId: activeCase.accountId ?? activeCase.id,
    customerName: caseCustomerName(activeCase),
    customerType: isBusinessCase(activeCase) ? 'Business' : 'Personal',
    productType: caseProduct(activeCase),
    status: activeCase.accountStatus ?? 'Not supplied',
    statusSource: 'Current relationship record',
    firstUse: activeCase.customer?.relationshipSince ?? activeCase.issueStartDate ?? activeCase.opened ?? 'Not recorded',
    lastUse: opened,
    caseId: activeCase.id,
    relatedCaseId: activeCase.id,
    currentCase: false,
    fixture: false,
    identifiers: getLinkIdentifiersForCase(activeCase),
  };
}

export function buildLinkAccountIndex(cases = [], activeCase = {}) {
  const actualAccounts = cases.map(caseAccount);
  const currentAccountId = activeCase.accountId ?? activeCase.id;
  return actualAccounts.map((account) => ({
    ...account,
    currentCase: account.accountId === currentAccountId,
    status: account.accountId === currentAccountId
      ? activeCase.accountStatus ?? account.status ?? 'Not supplied'
      : account.status ?? 'Not supplied',
  }));
}

function relationshipToCurrentCase(match, {
  currentAccountId,
  queryIsCurrentCaseIdentifier,
}) {
  if (match.accountId === currentAccountId) {
    return `Current case account contains this ${match.identifier.shortLabel.toLowerCase()}.`;
  }
  if (queryIsCurrentCaseIdentifier) {
    return `Exact shared ${match.identifier.shortLabel.toLowerCase()} with the current case.`;
  }
  return `Exact ${match.identifier.shortLabel.toLowerCase()} match returned; its relationship to the current case is not yet established.`;
}

function statusTone(status = '') {
  if (/good standing/i.test(status)) return 'good';
  if (/current review/i.test(status)) return 'current';
  if (/nsf|paperwork/i.test(status)) return 'hold';
  if (/confirmed fraud/i.test(status)) return 'confirmed';
  if (/closed/i.test(status)) return 'closed';
  return 'neutral';
}

export function searchLinkRelationships({
  query,
  identifierType = '',
  cases = [],
  activeCase = {},
} = {}) {
  const searchedIdentifier = clean(query);
  if (!searchedIdentifier) {
    return {
      searchedIdentifier: '',
      identifierType: identifierType || '',
      identifierTypeLabel: typeMeta(identifierType).label,
      matches: [],
      summary: { total: 0, exact: 0, restricted: 0, relatedCases: 0 },
      message: 'Choose a current-case identifier or enter an exact fictional value.',
    };
  }

  const currentAccountId = activeCase.accountId ?? activeCase.id;
  const activeIdentifiers = getLinkIdentifiersForCase(activeCase);
  const requestedType = normalizeIdentifierType(identifierType);
  const currentCandidates = activeIdentifiers.filter((item) => (
    (!requestedType || item.type === requestedType)
    && normalizeLinkIdentifier(item.value, item.type) === normalizeLinkIdentifier(searchedIdentifier, item.type)
  ));
  const candidateTypes = [...new Set(currentCandidates.map((item) => item.type))];
  const inferredType = inferLinkIdentifierType('', searchedIdentifier);
  const resolvedType = requestedType
    || (candidateTypes.length === 1 ? candidateTypes[0] : '')
    || inferredType;
  const queryKey = resolvedType ? normalizeLinkIdentifier(searchedIdentifier, resolvedType) : '';
  const currentIdentifier = resolvedType
    ? currentCandidates.find((item) => item.type === resolvedType)
    : null;
  const found = [];
  const seenAccounts = new Set();

  for (const account of buildLinkAccountIndex(cases, activeCase)) {
    const identifier = account.identifiers.find((item) => (
      item.type === resolvedType
      && normalizeLinkIdentifier(item.value, item.type) === queryKey
    ));
    if (!identifier || seenAccounts.has(account.accountId)) continue;
    seenAccounts.add(account.accountId);
    const match = {
      ...account,
      identifier,
      identifierType: identifier.type,
      identifierTypeLabel: identifier.typeLabel,
      exactSharedIdentifier: identifier.value,
      relationshipToCurrentCase: '',
      statusExplanation: statusExplanations[account.status] ?? 'Review the linked account record for the exact operational status.',
      tone: statusTone(account.status),
      investigativeNote: 'This exact link is evidence for review. It does not determine the current case outcome.',
    };
    match.relationshipToCurrentCase = relationshipToCurrentCase(match, {
      currentAccountId,
      queryIsCurrentCaseIdentifier: Boolean(currentIdentifier),
    });
    found.push(match);
  }

  const matches = found.sort((left, right) => {
    if (left.currentCase !== right.currentCase) return left.currentCase ? -1 : 1;
    if (left.fixture !== right.fixture) return left.fixture ? 1 : -1;
    return left.accountId.localeCompare(right.accountId);
  });
  const restricted = matches.filter((item) => (
    /closed|on hold|restricted|suspended|blocked|frozen|nsf/i.test(item.status ?? '')
  )).length;
  const relatedCases = new Set(matches.map((item) => item.relatedCaseId).filter((id) => id && id !== activeCase.id)).size;

  return {
    searchedIdentifier,
    identifierType: resolvedType || matches[0]?.identifierType || 'identifier',
    identifierTypeLabel: typeMeta(resolvedType || matches[0]?.identifierType).label,
    matches,
    summary: {
      total: matches.length,
      exact: matches.length,
      restricted,
      relatedCases,
    },
    message: `${matches.length} matched account${matches.length === 1 ? '' : 's'}`,
  };
}

export function getLinkMapContext(activeCase = {}) {
  const financial = getFinancialRecords(activeCase);
  const transaction = financial.transactions?.[0] ?? null;
  const identifiers = getLinkIdentifiersForCase(activeCase);
  const first = (type) => identifiers.find((item) => item.type === type);

  return {
    subject: {
      name: caseCustomerName(activeCase),
      id: activeCase.trainingId ?? activeCase.accountId ?? activeCase.id,
      label: isBusinessCase(activeCase) ? 'Central Business' : 'Central Subject',
    },
    transaction: {
      id: transaction?.id ?? '',
      merchant: transaction?.merchant ?? '',
      amount: transaction?.amount ?? '',
      date: transaction?.posted ?? '',
      time: transaction?.time ?? '',
    },
    nodes: [
      { slot: 'phone', type: 'phone', label: 'Phone', identifier: first('phone'), detail: first('device')?.value ?? 'Customer record' },
      { slot: 'email', type: 'email', label: 'Email', identifier: first('email'), detail: 'Profile record' },
      { slot: 'device', type: 'device', label: 'Device', identifier: first('device'), detail: first('device')?.lastUse ?? 'No device date' },
      { slot: 'bank', type: 'bank-code', label: 'Bank Code', identifier: first('bank-code'), detail: first('bank-code')?.source ?? 'No bank record' },
      { slot: 'destination', type: 'destination-id', label: 'Destination ID', identifier: first('destination-id'), detail: first('destination-id')?.source ?? 'No destination record' },
    ],
  };
}
