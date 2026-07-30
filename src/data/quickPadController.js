import { canonicalToolName } from '../investigationToolGroups.js';

const paymentTool = 'Payment Verification';

const destinationLabels = Object.freeze({
  'Customer 360': new Set(['training id']),
  'Identity Intel / People Search': new Set(['training id']),
  'Login History': new Set(['login id']),
  'Session History': new Set(['session id']),
  'Device Intelligence': new Set(['device id']),
  'IP Intelligence': new Set(['ip', 'ip address']),
  'Transaction History': new Set(['transaction id']),
  'Financial Investigation': new Set(['account id', 'transaction id']),
  'Merchant Intelligence': new Set([
    'merchant name',
    'merchant legal name',
    'merchant descriptor',
    'merchant mcc',
    'merchant record id',
  ]),
  'Business 360': new Set(['business id', 'business registration', 'phone number', 'business address']),
  'Employee Profile': new Set(['employee id']),
  'Payroll History': new Set([
    'payroll profile id',
    'payroll run id',
    'employee id',
    'paystub id',
    'payment destination record id',
    'destination id',
    'bank code',
    'payment record id',
    'funding bank code',
    'funding payment record id',
  ]),
  'Document Viewer': new Set(['document id']),
  'Document Request': new Set(['document request id', 'source document id']),
  'System Access Lane': new Set(['system access record id']),
  'Link Analysis': new Set([
    'phone number',
    'email',
    'training id',
    'address',
    'device id',
    'ip address',
    'bank code',
    'destination id',
  ]),
  Timeline: new Set(['timeline event id']),
});

function text(value) {
  return String(value ?? '').trim();
}

function normalizedLabel(value) {
  return text(value).toLowerCase();
}

function correlationKey(item = {}) {
  return text(
    item.routeGroupId
    ?? item.sourceRecordId
    ?? item.sourceObjectId
    ?? item.recordId,
  );
}

function itemValue(item = {}) {
  return text(item.value);
}

const payrollLabelByIdentifierType = Object.freeze({
  'payroll-profile-id': 'Payroll Profile ID',
  'payroll-run-id': 'Payroll Run ID',
  'employee-id': 'Employee ID',
  'paystub-id': 'Paystub ID',
  'payment-destination-record-id': 'Payment Destination Record ID',
  'destination-id': 'Destination ID',
  'bank-code': 'Bank Code',
  'payment-record-id': 'Payment Record ID',
  'funding-bank-code': 'Funding Bank Code',
  'funding-payment-record-id': 'Funding Payment Record ID',
});

function cleanPinnedIdentifier(value) {
  return text(value).split(/\s+(?:\||·)\s+/)[0].trim();
}

function inferPayrollIdentifierType(value, label = '') {
  const normalizedPayrollLabel = normalizedLabel(label);
  const explicitLabel = Object.entries(payrollLabelByIdentifierType)
    .find(([, candidate]) => candidate.toLowerCase() === normalizedPayrollLabel);
  if (explicitLabel) return explicitLabel[0];

  const identifier = text(value);
  if (/(?:^|-)STUB(?:-|$)/i.test(identifier)) return 'paystub-id';
  if (/(?:^|-)EMP(?:-|$)/i.test(identifier)) return 'employee-id';
  if (/(?:^|-)PR(?:-|$)/i.test(identifier)) return 'payroll-run-id';
  if (/^PAYROLL-/i.test(identifier)) return 'payroll-profile-id';
  if (/^(?:DST|DEST)-/i.test(identifier)) return 'destination-id';
  return '';
}

export function payrollQuickPadItem(pin = {}) {
  const record = pin.record && typeof pin.record === 'object' ? pin.record : {};
  const routed = record.pinPayload && typeof record.pinPayload === 'object'
    ? record.pinPayload
    : {};
  const query = cleanPinnedIdentifier(
    pin.query
    ?? pin.matchedIdentifier
    ?? routed.query
    ?? routed.matchedIdentifier
    ?? record.matchedIdentifier
    ?? pin.sourceRecordId
    ?? routed.sourceRecordId
    ?? pin.recordId
    ?? routed.recordId
    ?? record.id
    ?? pin.value
    ?? pin.id,
  );
  if (!query) return null;

  const explicitType = text(
    pin.identifierType
    ?? routed.identifierType
    ?? record.identifierType,
  ).toLowerCase();
  const identifierType = payrollLabelByIdentifierType[explicitType]
    ? explicitType
    : inferPayrollIdentifierType(query, pin.identifierLabel ?? pin.label);
  const label = payrollLabelByIdentifierType[identifierType]
    || text(pin.identifierLabel)
    || 'Exact Payroll Identifier';

  return {
    id: `${query}:${identifierType || 'payroll-identifier'}`,
    label,
    value: query,
    sourceTool: 'Payroll History',
    sourceRecordId: query,
    identifierType,
  };
}

function destinationQuery(toolName, item = {}) {
  if (['Employee Profile', 'Payroll History', 'Transaction History'].includes(toolName)) {
    return text(item.sourceRecordId || item.value);
  }
  if (toolName === 'Merchant Intelligence') {
    return text(item.value || item.merchantName);
  }
  if (toolName === 'Document Request') {
    return text(item.requestId || item.sourceDocumentId || item.value);
  }
  return itemValue(item);
}

function matchingSingleItem(toolName, items = []) {
  const acceptedLabels = destinationLabels[toolName];
  if (!acceptedLabels) return null;
  const matches = items.filter((item) => (
    acceptedLabels.has(normalizedLabel(item?.label))
    && destinationQuery(toolName, item)
  ));
  const uniqueQueries = new Map();
  matches.forEach((item) => {
    const query = destinationQuery(toolName, item);
    const key = query.toLowerCase();
    if (!uniqueQueries.has(key)) uniqueQueries.set(key, item);
  });
  return uniqueQueries.size === 1 ? [...uniqueQueries.values()][0] : null;
}

export function customer360QuickPadItem(pin = {}, activeCaseTrainingId = '') {
  const sourceRecordId = text(pin.sourceRecordId ?? pin.recordId ?? pin.id);
  const record = pin.record && typeof pin.record === 'object' ? pin.record : {};
  const pinValue = text(pin.value);
  const trainingId = text(
    pin.query
    ?? record.trainingId
    ?? record.identity?.trainingId
    ?? (/^TRN-/i.test(pinValue) ? pinValue : '')
    ?? activeCaseTrainingId,
  ) || text(activeCaseTrainingId);
  if (!trainingId) return null;
  return {
    id: `${sourceRecordId || trainingId}:quick-pad`,
    label: 'Training ID',
    value: trainingId,
    sourceTool: 'Customer 360',
    sourceRecordId: sourceRecordId || trainingId,
    identifierType: 'trainingId',
  };
}

export function normalizeQuickPadItemsForActiveCase(items = [], activeCaseTrainingId = '') {
  const trainingId = text(activeCaseTrainingId);
  if (!trainingId) return Array.isArray(items) ? items : [];
  return (Array.isArray(items) ? items : []).map((item) => (
    canonicalToolName(item?.sourceTool) === 'Customer 360'
      ? {
        ...item,
        label: 'Training ID',
        value: trainingId,
        identifierType: 'trainingId',
      }
      : item
  ));
}

function paymentPayloadFromItems(items = [], preferredSourceRecordId = '') {
  const grouped = new Map();
  items.forEach((item) => {
    const key = correlationKey(item);
    if (!key) return;
    const label = normalizedLabel(item?.label);
    if (!['bank code', 'destination id'].includes(label) || !itemValue(item)) return;
    const group = grouped.get(key) ?? {};
    if (label === 'bank code') group.bankCode = itemValue(item);
    if (label === 'destination id') group.destinationId = itemValue(item);
    grouped.set(key, group);
  });

  const completeGroups = [...grouped.entries()]
    .filter(([, payload]) => payload.bankCode && payload.destinationId);
  const preferredKey = text(preferredSourceRecordId);
  if (preferredKey) {
    const preferred = completeGroups.find(([key]) => key === preferredKey);
    return preferred ? { ...preferred[1], sourceRecordId: preferred[0] } : null;
  }
  if (completeGroups.length !== 1) return null;
  return {
    ...completeGroups[0][1],
    sourceRecordId: completeGroups[0][0],
  };
}

export function validateQuickPadDestinationPayload(toolName = '', payload = {}) {
  const canonicalTool = canonicalToolName(toolName);
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const errors = [];

  if (canonicalTool === paymentTool) {
    if (!text(source.bankCode)) errors.push('Bank Code is required');
    if (!text(source.destinationId)) errors.push('Destination ID is required');
  } else {
    if (!destinationLabels[canonicalTool]) errors.push(`Unsupported Quick Pad destination: ${canonicalTool || '(missing)'}`);
    if (!text(source.query)) errors.push('A destination-specific query is required');
    if (!text(source.label)) errors.push('An identifier label is required');
    else if (
      destinationLabels[canonicalTool]
      && !destinationLabels[canonicalTool].has(normalizedLabel(source.label))
    ) {
      errors.push(`${source.label} is not valid for ${canonicalTool}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    toolName: canonicalTool,
    payload: canonicalTool === paymentTool
      ? {
        bankCode: text(source.bankCode),
        destinationId: text(source.destinationId),
        sourceRecordId: text(source.sourceRecordId),
      }
      : {
        query: text(source.query),
        label: text(source.label),
        sourceRecordId: text(source.sourceRecordId),
        identifierType: text(source.identifierType),
      },
  };
}

export function buildQuickPadDestinationPayload(
  toolName = '',
  items = [],
  { sourceRecordId = '' } = {},
) {
  const canonicalTool = canonicalToolName(toolName);
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];

  if (canonicalTool === paymentTool) {
    return paymentPayloadFromItems(safeItems, sourceRecordId);
  }

  const item = matchingSingleItem(canonicalTool, safeItems);
  if (!item) return null;
  const query = destinationQuery(canonicalTool, item);
  return {
    query,
    label: text(item.label),
    sourceRecordId: canonicalTool === 'Customer 360'
      ? query
      : canonicalTool === 'Document Request'
      ? query
      : correlationKey(item),
    identifierType: text(item.identifierType),
  };
}

export function buildQuickPadDestinationRoute(
  toolName = '',
  items = [],
  options = {},
) {
  const canonicalTool = canonicalToolName(toolName);
  const payload = buildQuickPadDestinationPayload(canonicalTool, items, options);
  if (!payload) return null;
  const validation = validateQuickPadDestinationPayload(canonicalTool, payload);
  if (!validation.valid) return null;

  return {
    toolName: canonicalTool,
    payload: validation.payload,
    expandedId: validation.payload.sourceRecordId,
  };
}
