import {
  financialRecordSearchText,
  getFinancialInvestigation,
} from './data/financialInvestigationRecords.js';
import { getLoginRecords } from './data/loginRecords.js';
import { getSessionRecords } from './data/sessionRecords.js';
import { getDeviceProfiles } from './data/deviceRecords.js';
import { getIpRecords } from './data/ipRecords.js';
import { getCustomer360Dossier } from './data/customer360Dossier.js';
import { buildCoreToolRecords } from './data/coreToolRecords.js';
import { getBusinessRecords } from './data/caseToolData.js';
import { getSystemAccessRecords } from './data/systemAccessRecords.js';
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
    const dossier = getCustomer360Dossier(activeCase);
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
        ...dossier.profileUpdates.map((item) => indexedRow(
          item.id,
          [item.item, item.previousValue, item.newValue, item.dateTime, item.channel],
          activeCase.trainingId,
          'Profile change',
        )),
        ...dossier.serviceContacts.map((item) => indexedRow(
          item.id,
          [item.type, item.dateTime, item.channel, item.notes, item.relatedAccountId],
          activeCase.trainingId,
          'Service contact',
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
  if (tool === 'Employee Profile') {
    return {
      rows: (getBusinessRecords(activeCase).employeeProfile ?? []).map((item) => ({
        ...indexedRow(
          item.id,
          [
            item.name,
            item.role ?? item.position,
            item.department,
            item.employmentStatus ?? item.status,
            item.employer,
          ],
          item.id,
          'Employee profile',
        ),
        identifierType: 'employee-id',
      })),
    };
  }
  if (tool === 'System Access Lane') {
    return {
      rows: getSystemAccessRecords(activeCase).map((item) => ({
        ...indexedRow(
          item.id,
          [
            item.lane,
            item.actor,
            item.event,
            item.object,
            item.observed,
            item.status,
            item.context,
          ],
          item.id,
          'System access record',
        ),
        identifierType: 'system-access-record-id',
      })),
    };
  }
  return buildCoreToolRecords(tool, activeCase) ?? { rows: [] };
}

const pinPrefixRoutes = [
  [/^PAYROLL-|-(?:PR|STUB)(?:-|$)/i, 'Payroll History'],
  [/^(?:EMP-.+|.+-EMP-\d+)$/i, 'Employee Profile'],
  [/^LOG-/i, 'Login History'],
  [/^SES-/i, 'Session History'],
  [/^(?:DEV|DFP)-/i, 'Device Intelligence'],
  [/^IP-/i, 'IP Intelligence'],
  [/^(?:TXN|TRX|AUTH|ACH|WIRE)-|-(?:TXN|TRX|AUTH|ACH|WIRE)-/i, 'Transaction History'],
  [/^(?:FIN|FI|DEP|CASH)-/i, 'Financial Investigation'],
  [/^(?:PAY|PV|BNK|DST)-/i, 'Payment Verification'],
  [/^(?:MER|MRC|MCC|ORD|FUL|CBK)-/i, 'Merchant Intelligence'],
  [/^(?:BIZ|REL)-/i, 'Business 360'],
  [/^(?:KYB|REG|SOS|EIN)-/i, 'Business 360'],
  [/^(?:PAYR|PR)-/i, 'Payroll History'],
  [/^DOC-/i, 'Document Viewer'],
  [/^(?:REQ|DRQ)-/i, 'Document Request'],
  [/^(?:IDR|PID|PEP)-/i, 'Identity Intel / People Search'],
  [/^(?:C360|PCH|PROFILE|SVC|TRN)-/i, 'Customer 360'],
  [/^LNK-/i, 'Link Analysis'],
  [/^(?:SYS|ACC)-/i, 'System Access Lane'],
  [/^(?:TML|EVT)-/i, 'Timeline'],
];

function routedRowIdentifier(tool, row) {
  if (tool === 'Payroll History') {
    return text(row?.matchedIdentifier ?? row?.pin ?? row?.id);
  }
  return text(row?.id);
}

function routedRowQuery(tool, row, fallbackValue = '') {
  if (tool === 'Customer 360') return text(row?.pin);
  if (tool === 'IP Intelligence') return text(fallbackValue);
  return routedRowIdentifier(tool, row);
}

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

  const domainToolNames = filterToolsForCaseDomain(toolNames, activeCase);
  const availableToolNames = Array.isArray(activeCase.availableTools)
    ? new Set(filterToolsForCaseDomain(activeCase.availableTools, activeCase))
    : null;
  const routedToolNames = availableToolNames
    ? domainToolNames.filter((toolName) => availableToolNames.has(toolName))
    : domainToolNames;
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

  if (preferredTool && routedToolNames.includes(preferredTool)) {
    const preferredRows = rowsForPinnedEvidence(preferredTool, activeCase).rows;
    const exactPreferredRow = preferredRows.find((row) => (
      normalized(row.id) === normalized(value)
      || normalized(row.id) === normalized(identifier)
      || normalized(row.pin) === normalized(value)
      || normalized(row.pin) === normalized(identifier)
    ));
    if (exactPreferredRow) {
      const recordId = routedRowIdentifier(preferredTool, exactPreferredRow);
      return {
        value,
        tool: preferredTool,
        row: exactPreferredRow,
        query: routedRowQuery(preferredTool, exactPreferredRow, value),
        recordId,
        identifierType: exactPreferredRow.identifierType,
      };
    }
    return {
      value,
      tool: preferredTool,
      row: null,
      query: preferredTool === 'Customer 360'
        ? text(activeCase.trainingId) || identifier
        : identifier,
      recordId: identifier,
    };
  }

  if (
    preferredTool !== 'Transaction History'
    && routedToolNames.includes('Financial Investigation')
  ) {
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
    const query = routedRowQuery(bestMatch.tool, bestMatch.row, value);
    return {
      value,
      tool: bestMatch.tool,
      row: bestMatch.row,
      query,
      recordId: routedRowIdentifier(bestMatch.tool, bestMatch.row),
      identifierType: bestMatch.row.identifierType,
    };
  }

  const fallbackTool = preferredTool;
  if (!fallbackTool) return null;

  return {
    value,
    tool: fallbackTool,
    row: null,
    query: fallbackTool === 'Customer 360'
      ? text(activeCase.trainingId) || identifier
      : identifier,
    recordId: identifier,
  };
}
