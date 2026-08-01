export const transactionHistoryRanges = Object.freeze([
  Object.freeze({ id: 'all', label: 'All supplied', days: null }),
  Object.freeze({ id: '7d', label: '7D', days: 7 }),
  Object.freeze({ id: '14d', label: '14D', days: 14 }),
  Object.freeze({ id: '30d', label: '30D', days: 30 }),
  Object.freeze({ id: '90d', label: '90D', days: 90 }),
  Object.freeze({ id: 'custom', label: 'Custom', days: null }),
]);

export function transactionAmountValue(value = '') {
  const source = String(value ?? '').trim();
  if (!source || !/\d/.test(source)) return null;
  const parsed = Number(source.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return /^\(.*\)$/.test(source) ? -Math.abs(parsed) : parsed;
}

export function transactionRecordTimestamp(record = {}) {
  const source = [record.posted, record.time].filter(Boolean).join(' ');
  const parsed = Date.parse(source);
  return Number.isFinite(parsed) ? parsed : null;
}

export function transactionInputDate(timestamp) {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function transactionSearchText(record = {}) {
  return [
    record.id,
    record.merchant,
    record.amount,
    record.posted,
    record.time,
    record.instrument,
    record.channel,
    record.status,
    record.direction,
    record.category,
    record.entryMode,
    record.location,
    record.context,
    ...(Array.isArray(record.relatedRecords) ? record.relatedRecords : []),
    ...(Array.isArray(record.relatedDocuments) ? record.relatedDocuments : []),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function searchTransactionRecords(records = [], query = '') {
  const requested = String(query ?? '').trim().toLowerCase();
  if (!requested) return [];
  const exactIdMatches = records.filter(
    (record) => String(record.id ?? '').trim().toLowerCase() === requested,
  );
  if (exactIdMatches.length) return exactIdMatches;
  return records.filter((record) => transactionSearchText(record).includes(requested));
}

export function rangeTransactionRecords(
  records = [],
  rangeId = 'all',
  {
    customStart = '',
    customEnd = '',
    anchorRecords = records,
  } = {},
) {
  if (!records.length) return [];
  if (rangeId === 'all' || rangeId === 'exact') return [...records];

  let start = null;
  let end = null;
  if (rangeId === 'custom') {
    start = customStart ? Date.parse(`${customStart}T00:00:00`) : null;
    end = customEnd ? Date.parse(`${customEnd}T23:59:59.999`) : null;
    if (!Number.isFinite(start) && !Number.isFinite(end)) return [...records];
  } else {
    const knownAnchorTimestamps = anchorRecords
      .map(transactionRecordTimestamp)
      .filter(Number.isFinite);
    if (!knownAnchorTimestamps.length) return [];
    const selectedRange = transactionHistoryRanges.find((item) => item.id === rangeId)
      ?? transactionHistoryRanges.find((item) => item.id === '30d');
    const anchor = new Date(Math.max(...knownAnchorTimestamps));
    end = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    start = new Date(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() - (selectedRange.days - 1),
    ).getTime();
  }

  return records.filter((record) => {
    const timestamp = transactionRecordTimestamp(record);
    if (!Number.isFinite(timestamp)) return false;
    if (Number.isFinite(start) && timestamp < start) return false;
    if (Number.isFinite(end) && timestamp > end) return false;
    return true;
  });
}

export function filterTransactionRecords(
  records = [],
  {
    direction = 'all',
    status = 'all',
    channel = 'all',
  } = {},
) {
  const requestedDirection = String(direction).toLowerCase();
  const requestedStatus = String(status).toLowerCase();
  const requestedChannel = String(channel).toLowerCase();
  return records.filter((record) => {
    if (
      requestedDirection !== 'all'
      && String(record.direction ?? '').toLowerCase() !== requestedDirection
    ) return false;
    if (
      requestedStatus !== 'all'
      && String(record.status ?? '').toLowerCase() !== requestedStatus
    ) return false;
    if (
      requestedChannel !== 'all'
      && String(record.channel ?? '').toLowerCase() !== requestedChannel
    ) return false;
    return true;
  });
}

export function summarizeTransactionRecords(records = []) {
  return records.reduce((summary, record) => {
    const amount = transactionAmountValue(record.amount);
    const hasAmount = Number.isFinite(amount);
    const absoluteAmount = hasAmount ? Math.abs(amount) : 0;
    const direction = String(record.direction ?? '').trim().toLowerCase();
    summary.totalCount += 1;
    if (hasAmount) summary.amountCount += 1;
    summary.totalAmount += absoluteAmount;
    if (direction === 'credit') {
      summary.creditCount += 1;
      if (hasAmount) summary.creditAmountCount += 1;
      summary.creditAmount += absoluteAmount;
    } else if (direction === 'debit') {
      summary.debitCount += 1;
      if (hasAmount) summary.debitAmountCount += 1;
      summary.debitAmount += absoluteAmount;
    }
    return summary;
  }, {
    totalCount: 0,
    amountCount: 0,
    totalAmount: 0,
    creditCount: 0,
    creditAmountCount: 0,
    creditAmount: 0,
    debitCount: 0,
    debitAmountCount: 0,
    debitAmount: 0,
  });
}
