import { canonicalToolName } from '../investigationToolGroups.js';
import {
  inferLinkIdentifierType,
  linkIdentifierTypes,
} from './linkAnalysisRecords.js';

const linkIdentifierTypeIds = new Set(linkIdentifierTypes.map((item) => item.id));

export const quickPadSearchCapableTools = new Set([
  'Customer 360',
  'Identity Intel / People Search',
  'Login History',
  'Session History',
  'Device Intelligence',
  'IP Intelligence',
  'Financial Investigation',
  'Payment Verification',
  'Business 360',
  'Payroll History',
  'Document Viewer',
  'Link Analysis',
]);

export function quickPadQueryForTool(item = {}, toolName = '') {
  if (toolName === 'Payroll History') return item.sourceRecordId || '';
  return item.value || '';
}

export function quickPadLinkIdentifierType(item = {}) {
  const explicitType = String(item.identifierType ?? '').trim().toLowerCase();
  if (linkIdentifierTypeIds.has(explicitType)) return explicitType;
  const inferredType = inferLinkIdentifierType(item.label, item.value);
  return linkIdentifierTypeIds.has(inferredType) ? inferredType : '';
}

export function quickPadSearchRoute(item = {}, toolName = '') {
  const query = quickPadQueryForTool(item, toolName);
  if (!query) return null;
  return {
    query,
    identifierType: toolName === 'Link Analysis' ? quickPadLinkIdentifierType(item) : '',
  };
}

export function quickPadItemSupportsTool(item = {}, toolName = '', layoutMode = 'desktop') {
  const label = String(item.label ?? '').toLowerCase();
  const value = String(item.value ?? '').trim();
  if (!value) return false;

  if (toolName === 'Customer 360') return layoutMode === 'desktop';
  if (toolName === 'Identity Intel / People Search') {
    return label === 'training id' || /^TRN-/i.test(value);
  }
  if (toolName === 'Business 360') {
    return [
      'business id',
      'business registration',
      'phone number',
      'business address',
    ].includes(label);
  }
  if (toolName === 'Payroll History') {
    return Boolean(item.sourceRecordId && canonicalToolName(item.sourceTool) === 'Payroll History');
  }
  if (toolName === 'Payment Verification') {
    return ['bank code', 'destination id'].includes(label)
      || canonicalToolName(item.sourceTool) === 'Payment Verification';
  }
  if (toolName === 'Device Intelligence') return label === 'device id';
  if (toolName === 'IP Intelligence') return /(?:^| )ip(?: address)?$/.test(label);
  if (toolName === 'Document Viewer') {
    return ['account id', 'document id', 'business id', 'business registration'].includes(label);
  }
  if (toolName === 'Link Analysis') {
    return Boolean(quickPadLinkIdentifierType(item));
  }
  if (['Login History', 'Session History', 'Financial Investigation'].includes(toolName)) {
    return Boolean(label && value);
  }
  return false;
}

export function quickPadSourceRoute(
  item = {},
  { availableTools = [], layoutMode = 'desktop' } = {},
) {
  const sourceTool = canonicalToolName(item.sourceTool);
  const available = availableTools instanceof Set ? availableTools : new Set(availableTools);
  if (
    !available.has(sourceTool)
    || !quickPadSearchCapableTools.has(sourceTool)
    || !quickPadItemSupportsTool(item, sourceTool, layoutMode)
  ) {
    return null;
  }

  const sourceQuery = ['Payment Verification', 'Payroll History'].includes(sourceTool)
    && item.sourceRecordId
    ? item.sourceRecordId
    : quickPadSearchRoute(item, sourceTool)?.query;
  if (!sourceQuery) return null;

  return {
    sourceTool,
    query: sourceQuery,
    identifierType: sourceTool === 'Link Analysis' ? quickPadLinkIdentifierType(item) : '',
    expandedId: item.sourceRecordId ?? '',
  };
}
