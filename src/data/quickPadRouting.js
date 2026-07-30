import { canonicalToolName } from '../investigationToolGroups.js';
import {
  inferLinkIdentifierType,
  linkIdentifierTypes,
} from './linkAnalysisRecords.js';

const linkIdentifierTypeIds = new Set(linkIdentifierTypes.map((item) => item.id));
const payrollIdentifierLabels = new Set([
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
]);

export const quickPadSearchCapableTools = new Set([
  'Customer 360',
  'Identity Intel / People Search',
  'Login History',
  'Session History',
  'Device Intelligence',
  'IP Intelligence',
  'Transaction History',
  'Financial Investigation',
  'Merchant Intelligence',
  'Payment Verification',
  'Business 360',
  'Employee Profile',
  'Payroll History',
  'Document Viewer',
  'Document Request',
  'Link Analysis',
]);

export function quickPadQueryForTool(item = {}, toolName = '') {
  if (toolName === 'Employee Profile') return item.sourceRecordId || item.value || '';
  if (toolName === 'Payroll History') return item.sourceRecordId || item.value || '';
  if (toolName === 'Transaction History') return item.sourceRecordId || item.value || '';
  if (toolName === 'Merchant Intelligence') {
    return item.value || item.merchantName || '';
  }
  if (toolName === 'Document Request') {
    return item.requestId || item.sourceDocumentId || item.value || '';
  }
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

  if (toolName === 'Customer 360') {
    return label === 'training id' || /^TRN-/i.test(value);
  }
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
  if (toolName === 'Employee Profile') {
    return label === 'employee id'
      && /^(?:EMP-.+|.+-EMP-\d+)$/i.test(value);
  }
  if (toolName === 'Payroll History') {
    return Boolean(
      (item.sourceRecordId || item.value)
      && canonicalToolName(item.sourceTool) === 'Payroll History'
      && payrollIdentifierLabels.has(label),
    );
  }
  if (toolName === 'Payment Verification') {
    return ['bank code', 'destination id'].includes(label)
      || canonicalToolName(item.sourceTool) === 'Payment Verification';
  }
  if (toolName === 'Transaction History') {
    return label === 'transaction id'
      && /^(?:TXN|TRX|AUTH|ACH|WIRE)-|-(?:TXN|TRX|AUTH|ACH|WIRE)-/i.test(value);
  }
  if (toolName === 'Merchant Intelligence') {
    return [
      'merchant name',
      'merchant legal name',
      'merchant descriptor',
      'merchant mcc',
      'merchant record id',
    ].includes(label);
  }
  if (toolName === 'Device Intelligence') return label === 'device id';
  if (toolName === 'IP Intelligence') return /(?:^| )ip(?: address)?$/.test(label);
  if (toolName === 'Document Viewer') {
    return ['account id', 'document id', 'business id', 'business registration'].includes(label);
  }
  if (toolName === 'Document Request') {
    return ['document request id', 'source document id'].includes(label);
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
