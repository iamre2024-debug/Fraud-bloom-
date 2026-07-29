import { getBusinessRecords, getFinancialRecords } from './caseToolData.js';
import { getCaseDocuments } from './documentRecords.js';
import { getMerchantIntelligence } from './merchantIntelligenceRecords.js';
import { isPaymentProfileEvent, paymentChangeMetadata } from './paymentVerification.js';
import { WORKFLOW_TYPES } from './caseDomain.js';

function row(id, values, pin = id, label = 'Record') {
  const normalized = values.map((value) => value ?? 'Not recorded');
  return { id, values: normalized, pin, label, detail: normalized.join(' ') };
}

function joinIds(items = []) {
  return items.length ? items.map((item) => item.id).join(' · ') : 'None recorded';
}

function paymentRecordDetail(item) {
  return [
    `Bank Code ${item.bankCode}`,
    `Destination ID ${item.destinationId}`,
    `${item.oldDestination} → ${item.newDestination}`,
    item.changeComparison,
    item.context,
  ].filter(Boolean).join(' · ');
}

function profileChangeDetail(item, paymentRecords) {
  if (!isPaymentProfileEvent(item)) {
    return `${item.eventType ?? 'Profile maintenance'} · ${item.oldValue ?? 'Not recorded'} → ${item.newValue ?? item.detail}`;
  }
  return paymentChangeMetadata(item, paymentRecords)
    .map(([label, value]) => `${label}: ${value}`)
    .join(' · ');
}

function timelineTimestamp(value, fallbackDate) {
  let display = String(value ?? '').trim();
  if (/^\d{1,2}:\d{2}\s*[AP]M$/i.test(display)) display = `${fallbackDate} · ${display}`;
  display = display.replace(/\s+[·-]\s+/, ' ');
  const parsed = new Date(display);
  return Number.isNaN(parsed.getTime()) ? Number.MAX_SAFE_INTEGER : parsed.getTime();
}

function normalizedTimelineRows(rows, fallbackDate) {
  const seen = new Set();
  return rows
    .filter((item) => {
      const key = `${item.values[1]}|${item.values[2]}|${item.values[4]}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => timelineTimestamp(left.values[1], fallbackDate) - timelineTimestamp(right.values[1], fallbackDate));
}

export function buildCoreToolRecords(tool, activeCase, fallbackData = { rows: [] }) {
  const logins = activeCase.loginHistory ?? [];
  const events = activeCase.events ?? [];
  const profileChanges = activeCase.customer?.profileChanges ?? [];
  const financial = getFinancialRecords(activeCase);
  const business = getBusinessRecords(activeCase);
  const documents = getCaseDocuments(activeCase);

  if (tool === 'Payment Verification') return {
    columns: ['Record', 'Payment Object / Bank Code / Destination ID', 'Status', 'Last Seen', 'Linked Transactions', 'Linked Digital Objects', 'Context'],
    rows: financial.paymentVerification.map((item) => row(
      item.id,
      [
        item.id,
        `${item.type} · ${item.object} · Bank Code ${item.bankCode} · Destination ID ${item.destinationId}`,
        item.status,
        item.lastSeen,
        joinIds(financial.transactions),
        logins.length ? logins.map((login) => `${login.deviceId ?? login.device} · ${login.session}`).join(' · ') : 'None recorded',
        paymentRecordDetail(item),
      ],
      item.object,
      'Payment verification',
    )),
  };

  if (tool === 'Document Viewer') return {
    columns: ['Document', 'Folder', 'Status', 'Source', 'Received / Updated', 'Reference', 'Summary / Preview'],
    rows: documents.map((item) => row(
      item.id,
      [item.id, item.folder, item.status, item.source, item.received, item.reference, item.summary],
      item.id,
      'Document',
    )),
  };

  if (tool === 'Link Analysis') return {
    columns: ['Link', 'Object', 'Type', 'Connected To', 'Source', 'Case', 'Detail'],
    rows: [
      ...(activeCase.identityRecords ?? []).map((item) => row(`LNK-${item.id}`, [`LNK-${item.id}`, item.value, item.type, activeCase.person, item.id, activeCase.id, item.history], item.value, 'Identity link')),
      ...logins.map((item) => row(`LNK-${item.session}`, [`LNK-${item.session}`, item.session, 'Session', `${item.deviceId ?? item.device} · ${item.ip}`, item.id, activeCase.id, `${item.location} · ${item.method}`], item.session, 'Digital link')),
      ...financial.transactions.map((item) => row(`LNK-${item.id}`, [`LNK-${item.id}`, item.id, 'Transaction', item.merchant, item.channel, activeCase.id, `${item.amount} · ${item.instrument}`], item.id, 'Transaction link')),
      ...financial.paymentVerification.map((item) => row(`LNK-${item.id}`, [`LNK-${item.id}`, `Bank Code ${item.bankCode} · Destination ID ${item.destinationId}`, item.type, joinIds(financial.transactions), item.id, activeCase.id, paymentRecordDetail(item)], item.object, 'Payment link')),
      ...business.business360.map((item) => row(`LNK-${item.id}`, [`LNK-${item.id}`, item.entity, 'Business relationship', item.relationship, item.id, activeCase.id, item.context], item.entity, 'Business link')),
      ...documents.map((item) => row(`LNK-${item.id}`, [`LNK-${item.id}`, item.id, 'Document', item.reference, item.source, activeCase.id, item.summary], item.id, 'Document link')),
    ],
  };

  if (tool === 'Timeline') {
    const fallbackDate = activeCase.reportedDate ?? activeCase.opened ?? 'Training date';
    const chargeback = [
      WORKFLOW_TYPES.UNAUTHORIZED_CARD_TRANSACTION_CLAIM,
      WORKFLOW_TYPES.MERCHANT_NON_FRAUD_DISPUTE,
    ].includes(activeCase.workflowType ?? activeCase.claimTypeId)
      || Boolean(activeCase.chargebackDecision);
    const transactionRows = financial.transactions.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, `${item.posted} · ${item.time}`, item.merchant, 'Transaction History', item.id, activeCase.id, `${item.amount} · ${item.status}`], item.id, 'Transaction timeline'));
    const rows = chargeback
      ? [
        ...transactionRows,
        ...getMerchantIntelligence(activeCase).timeline.map((item, index) => row(
          `TML-${activeCase.id}-CB-${index + 1}`,
          [`TML-${activeCase.id}-CB-${index + 1}`, item.date, item.label, 'Merchant Intelligence', activeCase.id, activeCase.id, item.detail],
          activeCase.id,
          'Chargeback lifecycle event',
        )),
      ]
      : [
        row('TML-OPEN', ['TML-OPEN', activeCase.reportedDate ?? activeCase.opened, 'Case opened', 'Case Summary', activeCase.id, activeCase.id, activeCase.queueReason], activeCase.id, 'Timeline event'),
        ...profileChanges.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, `${item.date}${item.time ? ` · ${item.time}` : ''}`, item.item, 'Customer 360', item.session ?? item.id, activeCase.id, profileChangeDetail(item, financial.paymentVerification)], item.id, 'Profile change timeline')),
        ...events.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, item.time, item.label, item.chip, item.object, activeCase.id, item.detail], item.id, 'Timeline event')),
        ...logins.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, item.time, item.result, 'Login History', item.session, activeCase.id, `${item.deviceId ?? item.device} · ${item.ip}`], item.session, 'Login timeline')),
        ...transactionRows,
        ...(activeCase.availableTools?.includes('Payment Verification') ? financial.paymentVerification.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, item.lastSeen, item.type, 'Payment Verification', item.id, activeCase.id, paymentRecordDetail(item)], item.id, 'Payment timeline')) : []),
        ...documents.map((item) => row(`TML-${item.id}`, [`TML-${item.id}`, item.received, item.title, 'Document Viewer', item.id, activeCase.id, item.status], item.id, 'Document timeline')),
      ];
    return {
      columns: ['Timeline', 'Time', 'Event', 'Source', 'Linked Object', 'Case', 'Detail'],
      rows: normalizedTimelineRows(rows, fallbackDate),
    };
  }

  return null;
}
