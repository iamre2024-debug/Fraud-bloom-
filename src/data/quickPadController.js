import { canonicalToolName } from '../investigationToolGroups.js';

const paymentTool = 'Payment Verification';

const destinationLabels = Object.freeze({
  'Identity Intel / People Search': new Set(['training id']),
  'Login History': new Set(['login id']),
  'Session History': new Set(['session id']),
  'Device Intelligence': new Set(['device id']),
  'IP Intelligence': new Set(['ip', 'ip address']),
  'Financial Investigation': new Set(['account id', 'transaction id']),
  'Business 360': new Set(['business id', 'business registration', 'phone number', 'business address']),
  'Payroll History': new Set(['payroll run id']),
  'Document Viewer': new Set(['document id']),
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

function matchingSingleItem(toolName, items = []) {
  const acceptedLabels = destinationLabels[toolName];
  if (!acceptedLabels) return null;
  const matches = items.filter((item) => (
    acceptedLabels.has(normalizedLabel(item?.label))
    && itemValue(item)
  ));
  return matches.length === 1 ? matches[0] : null;
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
  return {
    query: itemValue(item),
    label: text(item.label),
    sourceRecordId: correlationKey(item),
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
