import { financialRecordsByCase } from './financialRecords.js';

const EMPTY_LIST = Object.freeze([]);
const MERCHANT_TOOL = 'Merchant Intelligence';

export const merchantLookupTypes = Object.freeze([
  Object.freeze({ id: 'merchant-name', label: 'Merchant name' }),
  Object.freeze({ id: 'legal-name', label: 'Legal name' }),
  Object.freeze({ id: 'descriptor', label: 'Statement descriptor' }),
  Object.freeze({ id: 'mcc', label: 'MCC' }),
  Object.freeze({ id: 'record-id', label: 'Merchant record ID' }),
]);

const lookupTypeIds = new Set(merchantLookupTypes.map((item) => item.id));
const lookupTypeAliases = new Map([
  ['merchant', 'merchant-name'],
  ['name', 'merchant-name'],
  ['merchant-name', 'merchant-name'],
  ['legal', 'legal-name'],
  ['legal-name', 'legal-name'],
  ['descriptor', 'descriptor'],
  ['statement-descriptor', 'descriptor'],
  ['mcc', 'mcc'],
  ['merchant-category-code', 'mcc'],
  ['id', 'record-id'],
  ['record', 'record-id'],
  ['record-id', 'record-id'],
  ['merchant-id', 'record-id'],
  ['transaction-id', 'record-id'],
  ['authorization-id', 'record-id'],
  ['response-id', 'record-id'],
]);

function asArray(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function clean(value) {
  return String(value ?? '').trim();
}

function hasValues(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length,
  );
}

function canonicalLookupType(value, fallback = 'auto') {
  const normalized = clean(value).toLowerCase().replace(/[\s_]+/g, '-');
  if (!normalized) return fallback;
  return lookupTypeAliases.get(normalized)
    ?? (lookupTypeIds.has(normalized) ? normalized : fallback);
}

function normalizeWords(value) {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDescriptor(value) {
  return clean(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

function normalizeRecordId(value) {
  return clean(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, '');
}

export function normalizeMerchantLookup(value, type = 'merchant-name') {
  const canonicalType = canonicalLookupType(type, type === 'auto' ? 'auto' : 'merchant-name');
  if (canonicalType === 'mcc') {
    return clean(value).replace(/^mcc[\s:#-]*/i, '').replace(/\D/g, '');
  }
  if (canonicalType === 'descriptor') return normalizeDescriptor(value);
  if (canonicalType === 'record-id') return normalizeRecordId(value);
  return normalizeWords(value);
}

function validLookup(value, type) {
  if (!value) return false;
  if (type === 'mcc') return /^\d{4}$/.test(value);
  if (type === 'record-id') return value.length >= 3;
  return value.replace(/\s/g, '').length >= 2;
}

function firstPresent(...values) {
  return values.find((value) => clean(value)) ?? '';
}

function sourceRows(groups = []) {
  const rows = [];
  const seen = new Set();
  groups.forEach(([sourcePath, values]) => {
    asArray(values).forEach((value, index) => {
      if (!value || typeof value !== 'object') return;
      const identity = clean(value.id ?? value.recordId ?? value.reference)
        || `${sourcePath}:${index}:${JSON.stringify(value)}`;
      const normalizedIdentity = normalizeRecordId(identity);
      if (seen.has(normalizedIdentity)) return;
      seen.add(normalizedIdentity);
      rows.push({ ...value, sourcePath });
    });
  });
  return rows;
}

function explicitTransactions(activeCase = {}) {
  const fixed = financialRecordsByCase[activeCase.id]?.transactions;
  return sourceRows([
    ['financialRecordsByCase.transactions', fixed],
    ['activeCase.toolResults.transactions', activeCase.toolResults?.transactions],
    ['activeCase.transactions', activeCase.transactions],
  ]);
}

function explicitDocuments(activeCase = {}, packet = {}) {
  return sourceRows([
    ['activeCase.documents', activeCase.documents],
    ['activeCase.toolResults.documents', activeCase.toolResults?.documents],
    ['activeCase.documentRequests', activeCase.documentRequests],
    ['activeCase.toolResults.merchantIntelligence.documents', packet.documents],
    ['activeCase.toolResults.merchantIntelligence.response.documents', packet.response?.documents],
    ['activeCase.toolResults.merchantIntelligence.customerDocuments', packet.customerDocuments],
  ]);
}

function explicitEvents(activeCase = {}) {
  return sourceRows([
    ['activeCase.events', activeCase.events],
    ['activeCase.timelineEvents', activeCase.timelineEvents],
  ]);
}

function disputedTransactionIds(activeCase = {}) {
  return [
    ...asArray(activeCase.claimDetails?.disputedTransactionIds),
    activeCase.claimDetails?.disputedTransactionId,
    activeCase.claimDetails?.transactionId,
    activeCase.transactionId,
  ].map(normalizeRecordId).filter(Boolean);
}

function pickPrimaryTransaction(activeCase, transactions, suppliedMerchantName) {
  const disputedIds = new Set(disputedTransactionIds(activeCase));
  const disputed = transactions.find((item) => disputedIds.has(normalizeRecordId(item.id)));
  if (disputed) return disputed;

  const normalizedMerchant = normalizeWords(suppliedMerchantName);
  if (normalizedMerchant) {
    const merchantMatch = transactions.find((item) => (
      normalizeWords(item.merchant ?? item.merchantName) === normalizedMerchant
    ));
    if (merchantMatch) return merchantMatch;
  }
  return transactions[0] ?? null;
}

function matchingMerchantTransactions(transactions, profile, primaryTransaction) {
  const primaryName = normalizeWords(
    primaryTransaction?.merchant,
  ) || normalizeWords(primaryTransaction?.merchantName);
  const primaryDescriptor = normalizeDescriptor(primaryTransaction?.descriptor);
  const nameKeys = new Set(
    (primaryName ? [primaryName] : [normalizeWords(profile.name)]).filter(Boolean),
  );
  const descriptorKeys = new Set(
    (primaryDescriptor
      ? [primaryDescriptor]
      : [normalizeDescriptor(profile.descriptor)]
    ).filter(Boolean),
  );

  if (!nameKeys.size && !descriptorKeys.size) {
    return primaryTransaction ? [primaryTransaction] : [];
  }

  return transactions.filter((item) => {
    const merchantName = normalizeWords(item.merchant ?? item.merchantName);
    const descriptor = normalizeDescriptor(item.descriptor);
    return (
      (merchantName && nameKeys.has(merchantName))
      || (descriptor && descriptorKeys.has(descriptor))
    );
  });
}

function numberFromAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = clean(value);
  if (!raw) return null;
  const numeric = Number(raw.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(numeric) ? numeric : null;
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function documentTitle(document = {}) {
  return firstPresent(document.title, document.name, document.type, document.category);
}

function documentStatus(document = {}) {
  return firstPresent(document.status, document.requestStatus, document.reviewStatus);
}

function documentLink(document, tool) {
  const id = firstPresent(document?.id, document?.recordId, document?.reference);
  if (!id) return null;
  return {
    tool,
    query: id,
    sourceRecordId: id,
    title: documentTitle(document) || id,
    status: documentStatus(document),
  };
}

function policyDocumentFrom(documents) {
  return documents.find((document) => (
    /(?:^|\b)(?:policy|terms|conditions|cancellation terms|refund terms)(?:\b|$)/i.test([
      document.title,
      document.name,
      document.type,
      document.category,
      document.classification,
    ].filter(Boolean).join(' '))
  )) ?? null;
}

function requestableDocumentFrom(documents) {
  const requestStatus = /requested|not requested|missing|pending|rejected|expired/i;
  const preferred = documents.find((document) => (
    requestStatus.test(documentStatus(document))
    && /cancel|policy|terms|refund|receipt|confirmation|response/i.test(documentTitle(document))
  ));
  return preferred
    ?? documents.find((document) => (
      document.requestEligible === true
      || requestStatus.test(documentStatus(document))
    ))
    ?? null;
}

function candidate({
  type,
  value,
  label,
  sourcePath,
  sourceRecordId = '',
  recordKind = 'merchant',
}) {
  const shown = clean(value);
  const normalized = normalizeMerchantLookup(shown, type);
  if (!validLookup(normalized, type)) return null;
  return {
    type,
    value: shown,
    normalized,
    label,
    sourcePath,
    sourceRecordId: clean(sourceRecordId),
    recordKind,
  };
}

function uniqueCandidates(values) {
  const seen = new Set();
  return values.filter(Boolean).filter((item) => {
    const identity = `${item.type}:${item.normalized}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function actualRecordId(record = {}, names = ['id', 'recordId']) {
  for (const name of names) {
    if (clean(record[name])) return clean(record[name]);
  }
  return '';
}

function lookupCandidatesFor({
  profile,
  profileSourcePath,
  merchantRecordId,
  primaryTransaction,
  transactions,
  authorization,
  authorizationSourcePath,
  response,
  responseSourcePath,
  records,
}) {
  const identityRecordId = merchantRecordId || primaryTransaction?.id || '';
  return uniqueCandidates([
    candidate({
      type: 'merchant-name',
      value: profile.name,
      label: 'Merchant name',
      sourcePath: profileSourcePath,
      sourceRecordId: identityRecordId,
      recordKind: 'merchant',
    }),
    candidate({
      type: 'legal-name',
      value: profile.legalName,
      label: 'Legal name',
      sourcePath: 'activeCase.toolResults.merchantIntelligence.profile.legalName',
      sourceRecordId: merchantRecordId,
      recordKind: 'merchant',
    }),
    candidate({
      type: 'descriptor',
      value: profile.descriptor,
      label: 'Statement descriptor',
      sourcePath: 'activeCase.toolResults.merchantIntelligence.profile.descriptor',
      sourceRecordId: merchantRecordId || primaryTransaction?.id,
      recordKind: 'merchant',
    }),
    candidate({
      type: 'mcc',
      value: profile.mcc,
      label: 'MCC',
      sourcePath: 'activeCase.toolResults.merchantIntelligence.profile.mcc',
      sourceRecordId: merchantRecordId,
      recordKind: 'merchant',
    }),
    ...[
      merchantRecordId
        ? {
          value: merchantRecordId,
          label: 'Merchant record ID',
          sourcePath: 'activeCase.toolResults.merchantIntelligence.profile',
          recordKind: 'merchant',
        }
        : null,
      ...records.map((record) => ({
        value: actualRecordId(record),
        label: record.title ?? 'Merchant record ID',
        sourcePath: record.sourcePath,
        recordKind: 'merchant',
      })),
      ...transactions.map((transaction) => ({
        value: actualRecordId(transaction),
        label: 'Transaction record ID',
        sourcePath: transaction.sourcePath,
        recordKind: 'transaction',
      })),
      actualRecordId(authorization, ['id', 'recordId', 'authorizationId'])
        ? {
          value: actualRecordId(authorization, ['id', 'recordId', 'authorizationId']),
          label: 'Authorization record ID',
          sourcePath: authorizationSourcePath,
          recordKind: 'authorization',
        }
        : null,
      actualRecordId(response, ['id', 'recordId', 'responseId'])
        ? {
          value: actualRecordId(response, ['id', 'recordId', 'responseId']),
          label: 'Response record ID',
          sourcePath: responseSourcePath,
          recordKind: 'response',
        }
        : null,
    ].filter(Boolean).map((item) => candidate({
      type: 'record-id',
      value: item.value,
      label: item.label,
      sourcePath: item.sourcePath,
      sourceRecordId: item.value,
      recordKind: item.recordKind,
    })),
  ]);
}

export function buildExplicitMerchantWorkspace(activeCase = {}) {
  const packet = activeCase.toolResults?.merchantIntelligence;
  const packetObject = hasValues(packet) ? packet : {};
  const packetProfile = hasValues(packetObject.profile) ? packetObject.profile : {};
  const directResponse = hasValues(activeCase.merchantResponse) ? activeCase.merchantResponse : {};
  const packetResponse = hasValues(packetObject.response) ? packetObject.response : {};
  const directAuthorization = hasValues(activeCase.merchantAuthorization)
    ? activeCase.merchantAuthorization
    : {};
  const packetAuthorization = hasValues(packetObject.authorization)
    ? packetObject.authorization
    : {};
  const response = { ...directResponse, ...packetResponse };
  const authorization = { ...directAuthorization, ...packetAuthorization };
  const transactions = explicitTransactions(activeCase);
  const records = sourceRows([
    ['activeCase.toolResults.merchantIntelligence.records', packetObject.records],
  ]);
  const suppliedProfileName = firstPresent(packetProfile.name, packetProfile.merchantName);
  const primaryTransaction = pickPrimaryTransaction(
    activeCase,
    transactions,
    suppliedProfileName,
  );
  const derivedMerchantName = firstPresent(
    suppliedProfileName,
    primaryTransaction?.merchant,
    primaryTransaction?.merchantName,
  );
  const profileSourcePath = suppliedProfileName
    ? 'activeCase.toolResults.merchantIntelligence.profile.name'
    : primaryTransaction?.sourcePath
      ? `${primaryTransaction.sourcePath}.merchant`
      : '';
  const merchantRecord = records.find((record) => (
    /^(?:overview|profile|merchant)$/i.test(clean(record.section))
    || /merchant (?:identity|profile)/i.test(clean(record.title))
  ));
  const merchantRecordId = firstPresent(
    packetProfile.id,
    packetProfile.recordId,
    packetProfile.merchantId,
    merchantRecord?.id,
  );
  const profile = {
    ...packetProfile,
    name: derivedMerchantName,
    merchantRecordId,
    sourcePath: profileSourcePath,
  };
  const matchingTransactions = matchingMerchantTransactions(
    transactions,
    profile,
    primaryTransaction,
  );
  const suppliedAmounts = matchingTransactions
    .map((transaction) => numberFromAmount(transaction.amount))
    .filter((amount) => amount !== null);
  const totalAmount = suppliedAmounts.length
    ? Math.round(
      suppliedAmounts.reduce((total, amount) => total + amount, 0) * 100,
    ) / 100
    : null;
  const documents = explicitDocuments(activeCase, packetObject);
  const policyDocument = policyDocumentFrom(documents);
  const requestableDocument = requestableDocumentFrom(documents);
  const events = explicitEvents(activeCase);
  const authorizationSourcePath = hasValues(packetAuthorization)
    ? 'activeCase.toolResults.merchantIntelligence.authorization'
    : hasValues(directAuthorization)
      ? 'activeCase.merchantAuthorization'
      : '';
  const responseSourcePath = hasValues(packetResponse)
    ? 'activeCase.toolResults.merchantIntelligence.response'
    : hasValues(directResponse)
      ? 'activeCase.merchantResponse'
      : '';
  const lookupCandidates = lookupCandidatesFor({
    profile,
    profileSourcePath,
    merchantRecordId,
    primaryTransaction,
    transactions: matchingTransactions,
    authorization,
    authorizationSourcePath,
    response,
    responseSourcePath,
    records,
  });
  const toolAvailable = asArray(activeCase.availableTools).some((tool) => (
    clean(tool).toLowerCase() === MERCHANT_TOOL.toLowerCase()
  ));
  const hasExplicitMerchantRecord = (
    hasValues(packet)
    || hasValues(directResponse)
    || hasValues(directAuthorization)
    || records.length > 0
    || (toolAvailable && matchingTransactions.length > 0)
  );

  if (!hasExplicitMerchantRecord || !lookupCandidates.length) return null;

  return {
    contract: 'explicit-merchant-v1',
    tool: MERCHANT_TOOL,
    caseId: clean(activeCase.id),
    profile,
    merchantRecordId,
    primaryTransaction,
    transactions,
    matchingTransactions,
    history: {
      transactionCount: matchingTransactions.length,
      totalAmount,
      totalAmountDisplay: formatMoney(totalAmount),
      recordIds: matchingTransactions.map((item) => clean(item.id)).filter(Boolean),
    },
    authorization,
    authorizationSourcePath,
    response,
    responseSourcePath,
    records,
    documents,
    policyDocument,
    requestableDocument,
    policyLink: documentLink(policyDocument, 'Document Viewer'),
    requestLink: documentLink(requestableDocument, 'Document Request'),
    events,
    lookupCandidates,
    provenance: {
      profile: profileSourcePath,
      primaryTransaction: primaryTransaction?.sourcePath ?? '',
      transactions: matchingTransactions.map((item) => ({
        id: clean(item.id),
        sourcePath: item.sourcePath,
      })),
      authorization: authorizationSourcePath,
      response: responseSourcePath,
      documents: documents.map((item) => ({
        id: clean(item.id ?? item.reference),
        sourcePath: item.sourcePath,
      })),
      events: events.map((item) => ({
        id: clean(item.id),
        sourcePath: item.sourcePath,
      })),
    },
  };
}

function asWorkspace(activeCaseOrWorkspace) {
  if (activeCaseOrWorkspace?.contract === 'explicit-merchant-v1') {
    return activeCaseOrWorkspace;
  }
  return buildExplicitMerchantWorkspace(activeCaseOrWorkspace);
}

export function resolveMerchantLookup(
  activeCaseOrWorkspace,
  lookup,
  requestedType = 'auto',
) {
  const workspace = asWorkspace(activeCaseOrWorkspace);
  if (!workspace) return null;

  const input = typeof lookup === 'object' && lookup !== null
    ? firstPresent(lookup.value, lookup.query, lookup.identifier)
    : clean(lookup);
  const type = canonicalLookupType(
    typeof lookup === 'object' && lookup !== null
      ? firstPresent(lookup.type, lookup.lookupType, requestedType)
      : requestedType,
    'auto',
  );
  if (!input || input.length === 1) return null;

  const eligible = type === 'auto'
    ? workspace.lookupCandidates
    : workspace.lookupCandidates.filter((item) => item.type === type);
  const match = eligible.find((item) => {
    const normalizedInput = normalizeMerchantLookup(input, item.type);
    return (
      validLookup(normalizedInput, item.type)
      && normalizedInput === item.normalized
    );
  });
  if (!match) return null;

  return {
    workspace,
    match,
    query: input,
    lookupType: match.type,
    normalizedQuery: match.normalized,
    sourceRecordId: match.sourceRecordId,
  };
}

function pinSegment(value, fallback) {
  const segment = clean(value)
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return segment || fallback;
}

export function formatMerchantPin(activeCaseOrWorkspace, resolvedLookup = null) {
  const workspace = asWorkspace(activeCaseOrWorkspace);
  if (!workspace) return null;
  const match = resolvedLookup?.match
    ?? (resolvedLookup?.type && resolvedLookup?.value ? resolvedLookup : null)
    ?? workspace.lookupCandidates.find((item) => item.type === 'merchant-name')
    ?? workspace.lookupCandidates[0];
  if (!match) return null;

  const sourceRecordId = clean(
    match.sourceRecordId
    || workspace.merchantRecordId
    || workspace.primaryTransaction?.id,
  );
  const pinId = [
    'MER',
    pinSegment(workspace.caseId, 'CASE'),
    pinSegment(sourceRecordId || match.type, 'RECORD'),
  ].join('-');
  const merchantName = clean(workspace.profile?.name);
  const detailParts = [
    match.label,
    sourceRecordId,
    merchantName,
  ].filter(Boolean);

  return {
    id: pinId,
    recordId: pinId,
    sourceRecordId,
    sourceTool: MERCHANT_TOOL,
    tool: MERCHANT_TOOL,
    caseId: workspace.caseId,
    label: merchantName
      ? `${merchantName} · ${match.label}`
      : `${match.value} · ${match.label}`,
    value: match.value,
    query: match.value,
    lookupType: match.type,
    identifierType: match.type,
    detail: detailParts.join(' · '),
    sourcePath: match.sourcePath,
    initialPayload: {
      query: match.value,
      lookupType: match.type,
      sourceRecordId,
    },
  };
}
