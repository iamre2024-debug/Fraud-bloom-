import { getIpRecords } from './ipRecords.js';
import { getLoginRecords } from './loginRecords.js';
import { getSessionRecords } from './sessionRecords.js';

const storageKey = 'fraud-academy-generated-access-reports-v1';

export const accessReportTypes = {
  login: { idSuffix: 'LOGIN', title: 'Login Timeline Report', type: 'Authentication report' },
  session: { idSuffix: 'SESSION', title: 'Session History Report', type: 'Post-login activity report' },
  ip: { idSuffix: 'IP', title: 'IP Intelligence Report', type: 'Network intelligence report' },
};

function reportContext(activeCase = {}) {
  return {
    caseId: activeCase.id ?? 'FA-TRAIN-00000',
    customer: activeCase.person ?? 'Training Customer',
    claimType: activeCase.claimType ?? activeCase.type ?? 'Training Review',
    generated: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

function reportPage(title, subtitle, sections) {
  return { title, subtitle, kind: 'case', sections };
}

function reportSection(title, rows = [], options = {}) {
  return { title, rows, ...options };
}

function baseReport(activeCase, reportType, fields, pages, summary, relatedTools) {
  const context = reportContext(activeCase);
  const definition = accessReportTypes[reportType];
  return {
    id: `${context.caseId}-RPT-${definition.idSuffix}`,
    title: definition.title,
    type: definition.type,
    folder: 'System Reports',
    reference: `RPT-${definition.idSuffix}-${context.caseId}`,
    status: 'Generated',
    reviewStatus: 'Ready for Review',
    extractionConfidence: 'System generated',
    source: 'Fraud Academy access-history tools',
    received: context.generated,
    updated: context.generated,
    customer: context.customer,
    caseId: context.caseId,
    claimType: context.claimType,
    requestStatus: 'Generated',
    authenticity: 'System-generated from fictional training records. Investigator comparison remains required.',
    summary,
    investigatorNote: 'Compare this report with Customer 360, Timeline, transactions, documents, and the customer or business statement.',
    trainingTip: 'A report organizes evidence. It does not make the case determination or replace the weighted decision checklist.',
    relatedTools,
    relatedEvidence: [context.caseId, ...relatedTools],
    fields: [['Generated', context.generated], ['Training label', 'Fictional data - not valid for real-world use'], ...fields],
    pages,
  };
}

function loginReport(activeCase) {
  const records = getLoginRecords(activeCase);
  const successful = records.filter((record) => /successful/i.test(record.result)).length;
  const failed = records.filter((record) => /failed|denied/i.test(record.result)).length;
  const lockouts = records.filter((record) => /locked/i.test(record.result)).length;
  return baseReport(
    activeCase,
    'login',
    [['Authentication events', String(records.length)], ['Successful events', String(successful)], ['Failed / denied events', String(failed)], ['Lockouts', String(lockouts)]],
    [reportPage('Login Timeline Report', 'AUTHENTICATION EVENTS - FICTIONAL TRAINING REPORT', [
      reportSection('Report summary', [['Case', activeCase.id], ['Customer', activeCase.person], ['Claim type', activeCase.claimType ?? activeCase.type], ['Authentication events', String(records.length)], ['Successful', String(successful)], ['Failed / denied', String(failed)], ['Lockouts', String(lockouts)]]),
      reportSection('Authentication timeline', [], { table: { columns: ['Date / time', 'Event', 'Result', 'Method / MFA', 'Device', 'IP / location', 'Session'], rows: records.map((record) => [record.timestamp, record.eventType, record.result, `${record.method} / ${record.mfaStatus}`, `${record.deviceId ?? record.device} / ${record.operatingSystem}`, `${record.ip} / ${record.location}`, record.sessionReference]) } }),
    ])],
    `${records.length} authentication events organized by date, result, method, device, network, and session reference.`,
    ['Login History', 'Session History', 'Device Intelligence', 'IP Intelligence', 'Timeline'],
  );
}

function sessionReport(activeCase) {
  const records = getSessionRecords(activeCase);
  const normalLogout = records.filter((record) => /normal logout/i.test(record.logoutStatus)).length;
  const timeouts = records.filter((record) => /timeout/i.test(record.logoutStatus)).length;
  return baseReport(
    activeCase,
    'session',
    [['Authenticated sessions', String(records.length)], ['Normal logout', String(normalLogout)], ['Session timeout', String(timeouts)], ['Profile-maintenance sessions', String(records.filter((record) => record.hasProfileActivity).length)]],
    [
      reportPage('Session History Report', 'POST-LOGIN ACTIVITY - FICTIONAL TRAINING REPORT', [
        reportSection('Report summary', [['Case', activeCase.id], ['Customer', activeCase.person], ['Claim type', activeCase.claimType ?? activeCase.type], ['Authenticated sessions', String(records.length)], ['Normal logout', String(normalLogout)], ['Session timeout', String(timeouts)]]),
        reportSection('Session inventory', [], { table: { columns: ['Session', 'Start', 'End', 'Duration', 'Login', 'Device / IP', 'Logout state'], rows: records.map((record) => [record.session, record.start, record.end, record.duration, record.id, `${record.deviceId ?? record.device} / ${record.ip}`, record.logoutStatus]) } }),
      ]),
      reportPage('Session Activity Detail', 'RECORDED ACTION PATHS - FICTIONAL TRAINING REPORT', [
        ...records.map((record) => reportSection(record.session, [
          ['Pages viewed', record.pagesViewed.join(' | ')],
          ['Security settings', record.securitySettings.join(' | ')],
          ['Profile actions', record.profileActions.join(' | ')],
          ['Payee / token activity', record.payeeTokenActivity.join(' | ')],
          ['Transfer / purchase path', record.moneyMovement.join(' | ')],
          ['Session path', record.sessionPath.join(' | ')],
        ])),
      ]),
    ],
    `${records.length} authenticated sessions organized with start/end time, activity path, profile actions, payment activity, and logout state.`,
    ['Session History', 'Login History', 'Customer 360', 'Transaction History', 'Timeline'],
  );
}

function ipReport(activeCase) {
  const records = getIpRecords(activeCase);
  return baseReport(
    activeCase,
    'ip',
    [['IP records', String(records.length)], ['Authentication events', String(records.reduce((total, record) => total + record.observedLogins.length, 0))], ['Linked sessions', String(records.reduce((total, record) => total + record.observedSessions.length, 0))]],
    [reportPage('IP Intelligence Report', 'NETWORK LOOKUP RESULTS - FICTIONAL TRAINING REPORT', [
      reportSection('Report summary', [['Case', activeCase.id], ['Customer', activeCase.person], ['Claim type', activeCase.claimType ?? activeCase.type], ['IP records', String(records.length)]]),
      reportSection('Network lookup results', [], { table: { columns: ['IP', 'Location', 'ISP / network', 'Residential', 'VPN / proxy / TOR', 'First / last seen', 'Seen elsewhere'], rows: records.map((record) => [record.ip, `${record.city}, ${record.country}`, `${record.isp} / ${record.networkType}`, record.residentialStatus, record.vpnProxyTor, `${record.firstSeen} / ${record.lastSeen}`, record.crossCasePresence]) } }),
      reportSection('Linked activity', [], { table: { columns: ['IP', 'Logins', 'Sessions', 'Devices', 'Velocity'], rows: records.map((record) => [record.ip, record.observedLogins.join(' | '), record.observedSessions.join(' | ') || 'No authenticated session', record.observedDevices.join(' | '), record.velocity]) } }),
    ])],
    `${records.length} fictional IP lookups organized by origin, network type, historical use, linked devices, linked sessions, and cross-profile presence.`,
    ['IP Intelligence', 'Login History', 'Session History', 'Device Intelligence', 'Timeline'],
  );
}

export function buildAccessHistoryReport(activeCase, reportType) {
  if (reportType === 'login') return loginReport(activeCase);
  if (reportType === 'session') return sessionReport(activeCase);
  if (reportType === 'ip') return ipReport(activeCase);
  throw new Error(`Unknown access-history report type: ${reportType}`);
}

function readReportRegistry() {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
  } catch {
    return {};
  }
}

export function generatedAccessReportTypes(caseId) {
  const registry = readReportRegistry();
  return Array.isArray(registry[caseId]) ? registry[caseId] : [];
}

export function generateAccessHistoryReport(activeCase, reportType) {
  if (!accessReportTypes[reportType]) throw new Error(`Unknown access-history report type: ${reportType}`);
  if (typeof window !== 'undefined') {
    const registry = readReportRegistry();
    registry[activeCase.id] = [...new Set([...(registry[activeCase.id] ?? []), reportType])];
    window.localStorage.setItem(storageKey, JSON.stringify(registry));
  }
  return buildAccessHistoryReport(activeCase, reportType);
}

export function getGeneratedAccessReportDocuments(activeCase) {
  return generatedAccessReportTypes(activeCase.id).map((reportType) => buildAccessHistoryReport(activeCase, reportType));
}

export function accessReportExportText(report) {
  const lines = [
    report.title,
    `Reference: ${report.reference}`,
    `Case: ${report.caseId}`,
    `Customer: ${report.customer}`,
    `Claim type: ${report.claimType}`,
    `Status: ${report.status}`,
    '',
    report.summary,
    '',
    ...report.fields.map(([label, value]) => `${label}: ${value}`),
  ];
  for (const page of report.pages) {
    lines.push('', page.title, page.subtitle);
    for (const section of page.sections) {
      lines.push('', section.title);
      for (const [label, value] of section.rows ?? []) lines.push(`${label}: ${value}`);
      if (section.table) {
        lines.push(section.table.columns.join(' | '));
        for (const row of section.table.rows) lines.push(row.join(' | '));
      }
    }
  }
  lines.push('', `Investigator note: ${report.investigatorNote}`, `Training tip: ${report.trainingTip}`);
  return lines.join('\n');
}
