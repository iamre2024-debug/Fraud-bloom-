import { getBusinessRecords, getFinancialRecords } from './caseToolData.js';
import { getPayrollHistory } from './businessPayrollWorkspace.js';
import { getCaseDocuments } from './documentRecords.js';
import { isPaymentProfileEvent, paymentChangeMetadata } from './paymentVerification.js';

function row(id, values, pin = id, label = 'Record') {
  const normalized = values.map((value) => value ?? 'Not recorded');
  return { id, values: normalized, pin, label, detail: normalized.join(' ') };
}

function payrollIdentifierRow({
  rowId,
  identifier,
  identifierType,
  identifierLabel,
  values = [],
}) {
  const exactIdentifier = String(identifier ?? '').trim();
  if (!exactIdentifier) return null;
  return {
    ...row(
      rowId,
      [exactIdentifier, identifierLabel, ...values],
      exactIdentifier,
      identifierLabel,
    ),
    identifierType,
    identifierLabel,
    matchedIdentifier: exactIdentifier,
  };
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

const timelineMonthNames = Object.freeze([
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]);

const timelineMonthIndex = Object.freeze(Object.fromEntries(
  timelineMonthNames.map((month, index) => [month.toLowerCase(), index]),
));

const timelineDatePattern = /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{4}))?/gi;
const timelineTimePattern = /\b(\d{1,2}):(\d{2})\s*([AP]M)\b/gi;

function timelineDateTokens(value) {
  const text = String(value ?? '').trim();
  const dates = [...text.matchAll(timelineDatePattern)].map((match) => ({
    month: timelineMonthIndex[match[1].slice(0, 3).toLowerCase()],
    day: Number(match[2]),
    year: match[3] ? Number(match[3]) : null,
  }));
  const isoDate = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (!dates.length && isoDate) {
    dates.push({
      year: Number(isoDate[1]),
      month: Number(isoDate[2]) - 1,
      day: Number(isoDate[3]),
    });
  }
  return dates;
}

function timelineTimeToken(value) {
  const matches = [...String(value ?? '').matchAll(timelineTimePattern)];
  if (!matches.length) return null;
  const match = matches.at(-1);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  const period = match[3].toUpperCase();
  return {
    hour: (hour % 12) + (period === 'PM' ? 12 : 0),
    minute,
  };
}

function timelineFallbackDate(value) {
  const [date] = timelineDateTokens(value);
  return date?.year ? date : null;
}

function validTimelineDate({ year, month, day, hour = 0, minute = 0 }) {
  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || month < 0
    || month > 11
    || day < 1
    || day > 31
  ) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month, day, hour, minute));
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month
    && parsed.getUTCDate() === day
    && parsed.getUTCHours() === hour
    && parsed.getUTCMinutes() === minute
  );
}

function formatTimelineTime(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function normalizeTimelineDate(value, fallbackDate) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(?:not recorded|not received|pending|training date)$/i.test(raw)) return null;

  const fallback = timelineFallbackDate(fallbackDate);
  const dates = timelineDateTokens(raw);
  const explicitYear = dates.find((date) => date.year)?.year ?? fallback?.year;
  const normalizedDates = dates.map((date) => ({
    ...date,
    year: date.year ?? explicitYear,
  }));

  let date = null;
  if (normalizedDates.length) {
    const uniqueDates = new Map(normalizedDates.map((item) => [
      `${item.year}-${item.month}-${item.day}`,
      item,
    ]));
    if (uniqueDates.size !== 1) return null;
    [date] = uniqueDates.values();
  } else if (fallback && timelineTimeToken(raw)) {
    date = fallback;
  }
  if (!date?.year) return null;

  const time = timelineTimeToken(raw);
  const hour = time?.hour ?? 0;
  const minute = time?.minute ?? 0;
  if (!validTimelineDate({ ...date, hour, minute })) return null;

  const occurredAt = new Date(Date.UTC(
    date.year,
    date.month,
    date.day,
    hour,
    minute,
  )).toISOString();
  const displayDate = `${timelineMonthNames[date.month]} ${date.day}, ${date.year}`;
  const displayTime = time ? formatTimelineTime(hour, minute) : '';
  return {
    occurredAt,
    sortTime: Date.parse(occurredAt),
    displayDate,
    displayTime,
    display: displayTime ? `${displayDate} · ${displayTime}` : displayDate,
  };
}

function timelineRow({
  id,
  time,
  event,
  source,
  linkedObject,
  caseId,
  detail,
  pin,
  label,
  sourceCollection,
  sourceRecordId,
  temporalKind = 'occurred',
}) {
  return {
    ...row(
      id,
      [id, time, event, source, linkedObject, caseId, detail],
      pin ?? sourceRecordId ?? id,
      label,
    ),
    rawTime: String(time ?? '').trim(),
    sourceCollection,
    sourceRecordId: sourceRecordId ?? pin ?? id,
    requestedTemporalKind: temporalKind,
  };
}

function normalizedTimelineRows(rows, fallbackDate) {
  const seen = new Set();
  const occurredRows = [];
  const scheduledRows = [];
  const undatedRows = [];

  rows.forEach((item, sequence) => {
    const normalizedDate = normalizeTimelineDate(item.rawTime, fallbackDate);
    const temporalKind = normalizedDate
      ? item.requestedTemporalKind === 'scheduled' ? 'scheduled' : 'occurred'
      : 'undated';
    const provenanceKey = [
      item.sourceCollection,
      item.sourceRecordId,
      normalizedDate?.occurredAt ?? item.rawTime,
      item.values[2],
    ].map((value) => String(value ?? '').trim().toLowerCase()).join('|');
    if (seen.has(provenanceKey)) return;
    seen.add(provenanceKey);

    const values = [...item.values];
    if (normalizedDate) values[1] = normalizedDate.display;
    const normalized = {
      ...item,
      values,
      detail: values.join(' '),
      occurredAt: normalizedDate?.occurredAt ?? null,
      displayDate: normalizedDate?.displayDate ?? '',
      displayTime: normalizedDate?.displayTime ?? '',
      temporalKind,
      sequence,
    };
    delete normalized.requestedTemporalKind;

    if (temporalKind === 'scheduled') scheduledRows.push(normalized);
    else if (temporalKind === 'undated') undatedRows.push(normalized);
    else occurredRows.push(normalized);
  });

  const chronological = (left, right) => (
    Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
    || left.sequence - right.sequence
  );
  occurredRows.sort(chronological);
  scheduledRows.sort(chronological);
  return { rows: occurredRows, scheduledRows, undatedRows };
}

export function buildCoreToolRecords(tool, activeCase, fallbackData = { rows: [] }) {
  const logins = activeCase.loginHistory ?? [];
  const events = activeCase.events ?? [];
  const profileChanges = activeCase.customer?.profileChanges ?? [];
  const financial = getFinancialRecords(activeCase);
  const business = getBusinessRecords(activeCase);
  const documents = getCaseDocuments(activeCase);

  if (tool === 'Transaction History') return {
    columns: ['Transaction', 'Date', 'Merchant', 'Amount', 'Instrument', 'Channel', 'Status', 'Context'],
    rows: financial.transactions.map((item) => row(
      item.id,
      [
        item.id,
        [item.posted, item.time].filter(Boolean).join(' · '),
        item.merchant,
        item.amount,
        item.instrument,
        item.channel,
        item.status,
        item.context,
      ],
      item.id,
      'Transaction record',
    )),
  };

  if (tool === 'Payroll History') {
    const payroll = getPayrollHistory(activeCase);
    const profile = payroll.companyPayrollProfile;
    const rows = [
      payrollIdentifierRow({
        rowId: `PAYROLL-PROFILE:${profile?.payrollId ?? 'missing'}`,
        identifier: profile?.payrollId,
        identifierType: 'payroll-profile-id',
        identifierLabel: 'Payroll Profile ID',
        values: [
          profile?.legalName,
          profile?.paySchedule,
          profile?.selectedDateRange,
        ],
      }),
      ...(payroll.payrollRuns ?? []).flatMap((run) => [
        payrollIdentifierRow({
          rowId: `PAYROLL-RUN:${run.id}`,
          identifier: run.id,
          identifierType: 'payroll-run-id',
          identifierLabel: 'Payroll Run ID',
          values: [
            run.payDate,
            run.runType,
            run.runStatus ?? run.status,
            run.netPayroll ?? run.netPay,
          ],
        }),
        payrollIdentifierRow({
          rowId: `PAYROLL-FUNDING-BANK:${run.id}`,
          identifier: run.companyFunding?.bankCode,
          identifierType: 'funding-bank-code',
          identifierLabel: 'Funding Bank Code',
          values: [
            run.id,
            run.payDate,
            run.companyFunding?.accountUsed,
          ],
        }),
        payrollIdentifierRow({
          rowId: `PAYROLL-FUNDING-PAYMENT:${run.id}`,
          identifier: run.companyFunding?.paymentRecordId,
          identifierType: 'funding-payment-record-id',
          identifierLabel: 'Funding Payment Record ID',
          values: [
            run.id,
            run.payDate,
            run.companyFunding?.bankCode,
          ],
        }),
        ...(run.employees ?? []).flatMap((employee) => {
          const paystub = employee.paystub ?? {};
          return [
            payrollIdentifierRow({
              rowId: `PAYROLL-EMPLOYEE:${run.id}:${employee.employeeId}`,
              identifier: employee.employeeId,
              identifierType: 'employee-id',
              identifierLabel: 'Employee ID',
              values: [
                run.id,
                run.payDate,
                employee.name,
                employee.netPay,
              ],
            }),
            payrollIdentifierRow({
              rowId: `PAYROLL-PAYSTUB:${run.id}:${paystub.id ?? 'missing'}`,
              identifier: paystub.id,
              identifierType: 'paystub-id',
              identifierLabel: 'Paystub ID',
              values: [
                run.id,
                run.payDate,
                employee.employeeId,
                employee.name,
              ],
            }),
            ...(paystub.paymentDestinations ?? []).flatMap((destination, destinationIndex) => [
              payrollIdentifierRow({
                rowId: `PAYROLL-DESTINATION-RECORD:${run.id}:${employee.employeeId}:${destinationIndex}`,
                identifier: destination.id,
                identifierType: 'payment-destination-record-id',
                identifierLabel: 'Payment Destination Record ID',
                values: [
                  run.id,
                  employee.employeeId,
                  paystub.id,
                  destination.bankCode,
                  destination.destinationId,
                ],
              }),
              payrollIdentifierRow({
                rowId: `PAYROLL-DESTINATION:${run.id}:${employee.employeeId}:${destinationIndex}`,
                identifier: destination.destinationId,
                identifierType: 'destination-id',
                identifierLabel: 'Destination ID',
                values: [
                  run.id,
                  employee.employeeId,
                  paystub.id,
                  destination.bankCode,
                  destination.paymentRecordId,
                ],
              }),
              payrollIdentifierRow({
                rowId: `PAYROLL-BANK:${run.id}:${employee.employeeId}:${destinationIndex}`,
                identifier: destination.bankCode,
                identifierType: 'bank-code',
                identifierLabel: 'Bank Code',
                values: [
                  run.id,
                  employee.employeeId,
                  paystub.id,
                  destination.destinationId,
                  destination.paymentRecordId,
                ],
              }),
              payrollIdentifierRow({
                rowId: `PAYROLL-PAYMENT:${run.id}:${employee.employeeId}:${destinationIndex}`,
                identifier: destination.paymentRecordId,
                identifierType: 'payment-record-id',
                identifierLabel: 'Payment Record ID',
                values: [
                  run.id,
                  employee.employeeId,
                  paystub.id,
                  destination.bankCode,
                  destination.destinationId,
                ],
              }),
            ]),
          ];
        }),
      ]),
    ].filter(Boolean);
    return {
      columns: ['Record', 'Identifier type', 'Run / date', 'Employee / account', 'Related record', 'Status / value'],
      rows,
    };
  }

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
    const caseOpenedRow = timelineRow({
      id: 'TML-OPEN',
      time: activeCase.reportedDate ?? activeCase.opened,
      event: 'Case opened',
      source: 'Case Summary',
      linkedObject: activeCase.id,
      caseId: activeCase.id,
      detail: activeCase.queueReason,
      pin: activeCase.id,
      label: 'Timeline event',
      sourceCollection: 'activeCase',
      sourceRecordId: activeCase.id,
    });
    const profileChangeRows = profileChanges.map((item) => timelineRow({
      id: `TML-${item.id}`,
      time: `${item.date ?? ''}${item.time ? ` · ${item.time}` : ''}`.trim(),
      event: item.item,
      source: 'Customer 360',
      linkedObject: item.session ?? item.id,
      caseId: activeCase.id,
      detail: profileChangeDetail(item, financial.paymentVerification),
      pin: item.id,
      label: 'Profile change timeline',
      sourceCollection: 'activeCase.customer.profileChanges',
      sourceRecordId: item.id,
    }));
    const eventRows = events.map((item) => timelineRow({
      id: `TML-${item.id}`,
      time: item.time,
      event: item.label,
      source: item.sourceTool ?? item.source ?? item.chip ?? 'Case Events',
      linkedObject: item.object,
      caseId: activeCase.id,
      detail: item.detail,
      pin: item.id,
      label: 'Timeline event',
      sourceCollection: 'activeCase.events',
      sourceRecordId: item.id,
    }));
    const loginRows = logins.map((item) => timelineRow({
      id: `TML-${item.id}`,
      time: item.time,
      event: item.result,
      source: 'Login History',
      linkedObject: item.session,
      caseId: activeCase.id,
      detail: `${item.deviceId ?? item.device} · ${item.ip}`,
      pin: item.session,
      label: 'Login timeline',
      sourceCollection: 'activeCase.loginHistory',
      sourceRecordId: item.id,
    }));
    const transactionRows = financial.transactions.map((item) => timelineRow({
      id: `TML-${item.id}`,
      time: [item.posted, item.time].filter(Boolean).join(' · '),
      event: item.merchant,
      source: 'Transaction History',
      linkedObject: item.id,
      caseId: activeCase.id,
      detail: `${item.amount} · ${item.status}`,
      pin: item.id,
      label: 'Transaction timeline',
      sourceCollection: 'financial.transactions',
      sourceRecordId: item.id,
    }));
    const paymentRows = activeCase.availableTools?.includes('Payment Verification')
      ? financial.paymentVerification.map((item) => timelineRow({
        id: `TML-${item.id}`,
        time: item.lastSeen,
        event: item.type,
        source: 'Payment Verification',
        linkedObject: item.id,
        caseId: activeCase.id,
        detail: paymentRecordDetail(item),
        pin: item.id,
        label: 'Payment timeline',
        sourceCollection: 'financial.paymentVerification',
        sourceRecordId: item.id,
      }))
      : [];
    const documentRows = documents.map((item) => timelineRow({
      id: `TML-${item.id}`,
      time: item.received,
      event: item.title,
      source: 'Document Viewer',
      linkedObject: item.id,
      caseId: activeCase.id,
      detail: item.status,
      pin: item.id,
      label: 'Document timeline',
      sourceCollection: 'documents',
      sourceRecordId: item.id,
    }));
    const rows = [
      caseOpenedRow,
      ...profileChangeRows,
      ...eventRows,
      ...loginRows,
      ...transactionRows,
      ...paymentRows,
      ...documentRows,
    ];
    const normalized = normalizedTimelineRows(rows, fallbackDate);
    return {
      columns: ['Timeline', 'Time', 'Event', 'Source', 'Linked Object', 'Case', 'Detail'],
      ...normalized,
    };
  }

  return null;
}
