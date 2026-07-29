const monthDayPattern = /^([A-Z][a-z]{2}\s+\d{1,2}),\s+(\d{1,2}:\d{2}\s+[AP]M)$/;

function trainingYear(activeCase = {}) {
  const source = activeCase.reportedDate ?? activeCase.opened ?? '';
  return String(source).match(/\b(20\d{2})\b/)?.[1] ?? '2026';
}

export function fullAccessTimestamp(activeCase = {}, value = '') {
  const text = String(value).trim();
  if (!text) return 'Not recorded';
  if (/\b20\d{2}\b/.test(text)) return text.includes('·') ? text : text.replace(/,\s+(\d{1,2}:\d{2}\s+[AP]M)$/, ' · $1');

  const monthDay = text.match(monthDayPattern);
  if (monthDay) return `${monthDay[1]}, ${trainingYear(activeCase)} · ${monthDay[2]}`;
  if (/^\d{1,2}:\d{2}\s+[AP]M$/.test(text)) {
    return `${activeCase.reportedDate ?? activeCase.opened ?? `Jul 8, ${trainingYear(activeCase)}`} · ${text}`;
  }
  return text;
}

export function accessDate(activeCase = {}, value = '') {
  const timestamp = fullAccessTimestamp(activeCase, value);
  return timestamp.includes('·') ? timestamp.split('·')[0].trim() : timestamp;
}

export function accessTime(activeCase = {}, value = '') {
  const timestamp = fullAccessTimestamp(activeCase, value);
  return timestamp.includes('·') ? timestamp.split('·').slice(1).join('·').trim() : 'Not recorded';
}

export function addMinutesToTimestamp(activeCase = {}, value = '', minutes = 0) {
  const timestamp = fullAccessTimestamp(activeCase, value);
  const parsed = new Date(timestamp.replace('·', ''));
  if (Number.isNaN(parsed.getTime())) return 'Not recorded';
  parsed.setMinutes(parsed.getMinutes() + minutes);
  return `${accessDate(activeCase, timestamp)} · ${parsed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function isSuccessfulLogin(login = {}) {
  return /successful|completed/i.test(String(login.result));
}

export function hasCreatedSession(login = {}) {
  return isSuccessfulLogin(login) && Boolean(login.session) && !/no session|not created|none/i.test(String(login.session));
}

export function stableAccessNumber(value = '') {
  return [...String(value)].reduce((total, character) => total + character.charCodeAt(0), 0);
}

export function uniqueAccessValues(values = []) {
  return [...new Set(values.filter(Boolean))];
}
