const builtInSystemAccessRecordsByCase = {
  'FA-ATO-24018': [
    {
      id: 'SYS-ATO-001',
      lane: 'API event',
      actor: 'Card authorization gateway',
      event: 'Authorization inquiry returned transaction context',
      object: 'Northstar Digital Market authorization packet',
      observed: 'Jul 8, 2026 · 10:52 AM',
      status: 'Available for review',
      context: 'System-to-system event attached to the disputed card transaction. Review neutrally with transaction and session history.',
    },
    {
      id: 'SYS-ATO-002',
      lane: 'Vendor event',
      actor: 'Device fingerprint vendor',
      event: 'Device reputation lookup completed',
      object: 'DEV-MAYA-IP16-001',
      observed: 'Jul 8, 2026 · 10:42 AM',
      status: 'Available for review',
      context: 'Vendor returned a device-object lookup tied to login history. This is an evidence source, not an outcome label.',
    },
    {
      id: 'SYS-ATO-003',
      lane: 'Internal access',
      actor: 'Claims queue user',
      event: 'Case workspace opened',
      object: 'FA-ATO-24018',
      observed: 'Jul 8, 2026 · 11:04 AM',
      status: 'Logged',
      context: 'Internal case access is logged for audit context. No account profile changes are assigned by this row.',
    },
  ],
  'FA-CB-24007': [
    {
      id: 'SYS-CB-001',
      lane: 'Merchant API event',
      actor: 'Merchant dispute data endpoint',
      event: 'Billing descriptor packet received',
      object: 'StreamBox Premium recurring billing packet',
      observed: 'Jul 8, 2026 · 8:31 AM',
      status: 'Available for review',
      context: 'Merchant-side packet can be compared with transaction history and customer cancellation evidence.',
    },
    {
      id: 'SYS-CB-002',
      lane: 'Vendor event',
      actor: 'Document intake vendor',
      event: 'Cancellation confirmation request created',
      object: 'DOC-511',
      observed: 'Jul 8, 2026 · 8:40 AM',
      status: 'Requested',
      context: 'Document request status only. It does not determine whether the claim is supported.',
    },
    {
      id: 'SYS-CB-003',
      lane: 'Internal access',
      actor: 'Dispute operations queue',
      event: 'Representment review lane available',
      object: 'CLM-CB-24007',
      observed: 'Jul 8, 2026 · 9:03 AM',
      status: 'Open',
      context: 'Administrative workflow record for possible chargeback representment routing.',
    },
  ],
  'FA-CR-24003': [
    {
      id: 'SYS-CR-001',
      lane: 'Open banking consent',
      actor: 'External account connection provider',
      event: 'Permissioned account-link check available',
      object: 'Bank Code + Destination ID token',
      observed: 'Jul 8, 2026 · 7:32 AM',
      status: 'Available for review',
      context: 'Open-banking style connection data can support Payment Verification review without exposing raw destination credentials.',
    },
    {
      id: 'SYS-CR-002',
      lane: 'API event',
      actor: 'Credit decisioning service',
      event: 'Credit-line draw request queued for system review',
      object: '$2,400 personal credit-line draw request',
      observed: 'Jul 8, 2026 · 7:36 AM',
      status: 'Queued',
      context: 'System queue event for account activity review. It is not a final risk decision.',
    },
    {
      id: 'SYS-CR-003',
      lane: 'Vendor event',
      actor: 'Payment verification vendor',
      event: 'Destination token verification packet created',
      object: 'Destination ID token',
      observed: 'Jul 8, 2026 · 7:40 AM',
      status: 'Available for review',
      context: 'Vendor packet should be compared with Payment Verification and identity records.',
    },
  ],
};

function generatedCaseId(caseId = '') {
  return /^FA-[A-Z0-9]+-G\d+$/i.test(String(caseId).trim());
}

function safeIdPart(caseId = '') {
  return String(caseId).replace(/[^A-Z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase();
}

function normalizedSearchText(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function observedTimestamp(value = '') {
  const timestamp = Date.parse(String(value).replace(/\s+·\s+/, ' '));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function searchSystemAccessRecords(records = [], query = '') {
  const normalizedQuery = normalizedSearchText(query);
  if (!Array.isArray(records)) return [];
  if (!normalizedQuery) return [...records];

  const exactIdMatches = records.filter((record) => (
    normalizedSearchText(record?.id) === normalizedQuery
  ));
  if (exactIdMatches.length) return exactIdMatches;

  return records.filter((record) => (
    [
      record?.id,
      record?.lane,
      record?.actor,
      record?.event,
      record?.object,
      record?.observed,
      record?.status,
      record?.context,
    ].some((value) => normalizedSearchText(value).includes(normalizedQuery))
  ));
}

export function sortSystemAccessRecords(records = []) {
  return [...(Array.isArray(records) ? records : [])].sort((left, right) => {
    const leftTime = observedTimestamp(left?.observed);
    const rightTime = observedTimestamp(right?.observed);
    if (leftTime === null && rightTime === null) return 0;
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return leftTime - rightTime;
  });
}

export function buildSystemAccessSummary(records = []) {
  const safeRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  const datedRecords = safeRecords
    .map((record) => ({ record, timestamp: observedTimestamp(record.observed) }))
    .filter((item) => item.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp);

  return {
    total: safeRecords.length,
    lanes: new Set(safeRecords.map((record) => record.lane).filter(Boolean)).size,
    actors: new Set(safeRecords.map((record) => record.actor).filter(Boolean)).size,
    latestObserved: datedRecords[0]?.record.observed
      ?? safeRecords.at(-1)?.observed
      ?? 'Not supplied',
  };
}

export function buildNeutralSystemAccessRecords(activeCaseOrId = {}) {
  const activeCase = activeCaseOrId && typeof activeCaseOrId === 'object'
    ? activeCaseOrId
    : {};
  const caseId = String(activeCase.id ?? activeCase.caseId ?? activeCaseOrId ?? '').trim();
  if (!generatedCaseId(caseId)) return [];
  const idPart = safeIdPart(caseId);
  const observed = activeCase.reportedDate
    ?? activeCase.opened
    ?? activeCase.createdAt
    ?? 'Recorded at case intake';

  return [
    {
      id: `SYS-${idPart}-001`,
      lane: 'Internal access',
      actor: 'Case workspace service',
      event: 'Generated training case workspace initialized',
      object: caseId,
      observed,
      status: 'Logged',
      context: 'Administrative access record for the fictional case workspace. This row records availability and does not establish an investigation outcome.',
    },
    {
      id: `SYS-${idPart}-002`,
      lane: 'System event',
      actor: 'Evidence indexing service',
      event: 'Case evidence sources indexed for investigator review',
      object: `${caseId} evidence index`,
      observed,
      status: 'Available for review',
      context: 'System indexing confirms that fictional source records can be opened. Investigators must compare those records independently.',
    },
    {
      id: `SYS-${idPart}-003`,
      lane: 'Audit event',
      actor: 'Training audit service',
      event: 'System-access audit trail initialized',
      object: `${caseId} audit trail`,
      observed,
      status: 'Logged',
      context: 'Audit metadata records access to the training workspace without assigning fault, legitimacy, or a final finding.',
    },
  ];
}

export const systemAccessRecordsByCase = new Proxy(builtInSystemAccessRecordsByCase, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    if (typeof property !== 'string' || !generatedCaseId(property)) return undefined;
    return buildNeutralSystemAccessRecords(property);
  },
});

export function getSystemAccessRecords(activeCaseOrId) {
  const caseId = String(
    activeCaseOrId && typeof activeCaseOrId === 'object'
      ? activeCaseOrId.id ?? activeCaseOrId.caseId ?? ''
      : activeCaseOrId ?? '',
  ).trim();
  return builtInSystemAccessRecordsByCase[caseId]
    ?? buildNeutralSystemAccessRecords(activeCaseOrId);
}
