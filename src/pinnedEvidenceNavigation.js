import {
  financialRecordSearchText,
  getFinancialInvestigation,
} from './data/financialInvestigationRecords.js';
import { getLoginRecords } from './data/loginRecords.js';
import { getSessionRecords } from './data/sessionRecords.js';
import { getDeviceProfiles } from './data/deviceRecords.js';
import { getIpRecords } from './data/ipRecords.js';
import { buildCoreToolRecords } from './data/coreToolRecords.js';
import {
  filterToolsForCaseDomain,
  normalizeToolName,
} from './data/caseDomain.js';
import { parseLinkAnalysisPin } from './data/linkAnalysisRecords.js';

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function firstIdentifier(value) {
  return text(value).split(/\s+(?:\||·)\s+/)[0].trim();
}

function indexedRow(id, values, pin = id, label = 'Evidence record') {
  const normalizedValues = values.map((value) => value ?? 'Not recorded');
  return {
    id,
    values: normalizedValues,
    pin,
    label,
    detail: normalizedValues.join(' '),
  };
}

function rowsFor(tool, activeCase) {
  if (tool === 'Customer 360') {
    return {
      rows: [
        indexedRow(
          'C360-REL',
          [
            activeCase.trainingId,
            activeCase.person,
            activeCase.customer?.relationshipSince,
            activeCase.customer?.segment,
          ],
          activeCase.trainingId,
          'Customer relationship',
        ),
        ...(activeCase.customer?.profileChanges ?? []).map((item) => indexedRow(
          item.id,
          [item.item, item.oldValue, item.newValue, item.date, item.time],
          item.id,
          'Profile change',
        )),
      ],
    };
  }
  if (tool === 'Identity Intel / People Search') {
    return {
      rows: (activeCase.identityRecords ?? []).map((item) => indexedRow(
        item.id,
        [item.type, item.value, item.lastSeen, item.history],
        item.value,
        item.type,
      )),
    };
  }
  if (tool === 'Login History') {
    return {
      rows: getLoginRecords(activeCase).map((item) => indexedRow(
        item.id,
        [item.time, item.method, item.device, item.ip, item.session, item.result],
        item.id,
        'Login record',
      )),
    };
  }
  if (tool === 'Session History') {
    return {
      rows: getSessionRecords(activeCase).map((item) => indexedRow(
        item.session,
        [item.id, item.start, item.end, item.device, item.ip, item.status],
        item.session,
        'Session record',
      )),
    };
  }
  if (tool === 'Device Intelligence') {
    return {
      rows: getDeviceProfiles(activeCase).map((item) => indexedRow(
        item.id,
        [item.device, item.firstSeen, item.lastSeen, item.status],
        item.id,
        'Device record',
      )),
    };
  }
  if (tool === 'IP Intelligence') {
    return {
      rows: getIpRecords(activeCase).map((item) => indexedRow(
        item.id,
        [item.ip, item.firstSeen, item.lastSeen, item.location],
        item.ip,
        'IP record',
      )),
    };
  }
  return buildCoreToolRecords(tool, activeCase) ?? { rows: [] };
}

const pinPrefixRoutes = [
  [/^LOG-/i, 'Login History'],
  [/^SES-/i, 'Session History'],
  [/^(?:DEV|DFP)-/i, 'Device Intelligence'],
  [/^IP-/i, 'IP Intelligence'],
  [/^(?:TXN|TRX|AUTH|ACH|WIRE)-/i, 'Transaction History'],
  [/^(?:FIN|FI|DEP|CASH)-/i, 'Financial Investigation'],
  [/^(?:PAY|PV|BNK|DST)-/i, 'Payment Verification'],
  [/^(?:MER|MRC|MCC|ORD|FUL|CBK)-/i, 'Merchant Intelligence'],
  [/^(?:BIZ|REL)-/i, 'Business 360'],
  [/^(?:KYB|REG|SOS|EIN)-/i, 'Business 360'],
  [/^EMP-/i, 'Employee Profile'],
  [/^(?:PAYR|PR)-/i, 'Payroll History'],
  [/^DOC-/i, 'Document Viewer'],
  [/^(?:REQ|DRQ)-/i, 'Document Request'],
  [/^(?:IDR|PID|PEP)-/i, 'Identity Intel / People Search'],
  [/^(?:C360|PCH|TRN)-/i, 'Customer 360'],
  [/^LNK-/i, 'Link Analysis'],
  [/^(?:SYS|ACC)-/i, 'System Access Lane'],
  [/^(?:TML|EVT)-/i, 'Timeline'],
];

function scoreRow(pinValue, identifier, row) {
  const pin = normalized(pinValue);
  const id = normalized(row.id);
  const rowPin = normalized(row.pin);
  const primary = normalized(identifier);
  const detail = normalized([row.detail, ...(row.values ?? [])].join(' '));

  if (pin === id) return 120;
  if (pin === rowPin) return 115;
  if (primary && primary === id) return 110;
  if (primary && primary === rowPin) return 105;
  if (id.length >= 4 && pin.includes(id)) return 95;
  if (rowPin.length >= 4 && pin.includes(rowPin)) return 90;
  if (pin.length >= 4 && detail.includes(pin)) return 70;
  if (primary.length >= 4 && detail.includes(primary)) return 60;
  return 0;
}

function rowsForPinnedEvidence(tool, activeCase) {
  const legacyData = rowsFor(tool, activeCase);
  if (tool !== 'Financial Investigation') return legacyData;

  const richRecords = Object.values(
    getFinancialInvestigation(activeCase).recordsBySection,
  ).flat();
  const richRows = richRecords.map((record) => ({
    id: record.id,
    pin: record.id,
    label: record.title ?? record.category ?? 'Financial record',
    detail: financialRecordSearchText(record),
    values: [
      record.id,
      record.title ?? record.category ?? 'Financial record',
      record.value ?? 'Not recorded',
      record.observed ?? record.period ?? 'Not recorded',
      record.status ?? 'Recorded',
      record.detail ?? 'No additional detail supplied',
    ],
  }));
  const richIds = new Set(richRows.map((row) => row.id));
  return {
    ...legacyData,
    rows: [
      ...richRows,
      ...legacyData.rows.filter((row) => !richIds.has(row.id)),
    ],
  };
}

export function resolvePinnedEvidence(pinValue, activeCase, toolNames) {
  const value = text(pinValue);
  if (!value || !activeCase) return null;

  const routedToolNames = filterToolsForCaseDomain(toolNames, activeCase);
  const linkPin = routedToolNames.includes('Link Analysis') ? parseLinkAnalysisPin(value) : null;
  if (linkPin) {
    return {
      value,
      tool: 'Link Analysis',
      row: null,
      query: linkPin.searchedIdentifier,
      recordId: linkPin.accountId || linkPin.searchedIdentifier,
      identifierType: linkPin.identifierType,
      accountId: linkPin.accountId,
    };
  }

  const identifier = firstIdentifier(value);
  const preferredTool = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
    ? 'IP Intelligence'
    : normalizeToolName(
        pinPrefixRoutes.find(([pattern, tool]) => (
          pattern.test(identifier) && routedToolNames.includes(tool)
        ))?.[1],
      );
  let bestMatch = null;

  if (routedToolNames.includes('Financial Investigation')) {
    const financialRows = rowsForPinnedEvidence('Financial Investigation', activeCase).rows;
    const exactFinancialRow = financialRows.find((row) => (
      normalized(row.id) === normalized(value)
      || normalized(row.id) === normalized(identifier)
      || normalized(row.pin) === normalized(value)
      || normalized(row.pin) === normalized(identifier)
    ));
    if (exactFinancialRow) {
      return {
        value,
        tool: 'Financial Investigation',
        row: exactFinancialRow,
        query: exactFinancialRow.id,
        recordId: exactFinancialRow.id,
      };
    }
  }

  routedToolNames.forEach((tool) => {
    const data = rowsForPinnedEvidence(tool, activeCase);
    data.rows.forEach((row) => {
      const baseScore = scoreRow(value, identifier, row);
      if (!baseScore) return;
      const score = baseScore + (tool === preferredTool ? 25 : 0);
      if (bestMatch && bestMatch.score >= score) return;
      bestMatch = { score, tool, row };
    });
  });

  if (bestMatch) {
    const query = bestMatch.tool === 'IP Intelligence' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)
      ? value
      : bestMatch.tool === 'Customer 360' && bestMatch.row.id === 'C360-REL'
        ? bestMatch.row.pin
        : bestMatch.row.id;
    return {
      value,
      tool: bestMatch.tool,
      row: bestMatch.row,
      query,
      recordId: bestMatch.row.id,
    };
  }

  const fallbackTool = preferredTool;
  if (!fallbackTool) return null;

  return {
    value,
    tool: fallbackTool,
    row: null,
    query: identifier,
    recordId: identifier,
  };
}
