import { useEffect, useMemo, useState } from 'react';
import { getCustomer360Dossier } from '../data/customer360Dossier.js';
import { getIdentityIntelReport } from '../data/identityIntelReport.js';
import { getLoginRecords } from '../data/loginRecords.js';
import { getSessionRecords } from '../data/sessionRecords.js';
import { getDeviceProfiles } from '../data/deviceRecords.js';
import { getIpRecords } from '../data/ipRecords.js';
import { formatMoney } from '../data/relationshipAccounts.js';
import { SkyIcon, SkySparkles } from '../components/SkyPrimitives.jsx';

export const IDENTITY_DIGITAL_TOOLS = Object.freeze({
  CUSTOMER_360: 'Customer 360',
  IDENTITY_INTELLIGENCE: 'Identity Intelligence',
  LOGIN_HISTORY: 'Login History',
  SESSION_HISTORY: 'Session History',
  DEVICE_INTELLIGENCE: 'Device Intelligence',
  IP_INTELLIGENCE: 'IP Intelligence',
});

const UNSAFE_HINT = new RegExp(
  '\\b(?:correct\\s+answer|final\\s+answer|final decision|final finding|approve the claim|deny the claim|support(?:s|ed)? the (?:customer\'?s )?claim|does not support the (?:customer\'?s )?claim|fraud confirmed|not fraud)\\b',
  'i',
);
const EMPTY_VALUE = 'Not recorded';

function normalizedToolName(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

function normalizedExact(value = '') {
  return String(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function exactText(left, right) {
  const normalizedLeft = normalizedExact(left);
  return Boolean(normalizedLeft && normalizedLeft === normalizedExact(right));
}

function normalizedDate(value = '') {
  const parsed = Date.parse(String(value).trim());
  if (Number.isNaN(parsed)) return normalizedExact(value);
  return new Date(parsed).toISOString().slice(0, 10);
}

function exactDate(left, right) {
  const normalizedLeft = normalizedDate(left);
  return Boolean(normalizedLeft && normalizedLeft === normalizedDate(right));
}

function displayValue(value, fallback = EMPTY_VALUE) {
  if (value === null || value === undefined || value === '') return fallback;
  if (Array.isArray(value)) {
    const items = value.map((item) => displayValue(item, '')).filter(Boolean);
    return items.length ? items.join(' · ') : fallback;
  }
  const text = String(value).trim();
  return text && !UNSAFE_HINT.test(text) ? text : fallback;
}

function recordLabel(value, fallback = 'Evidence record') {
  const text = displayValue(value, fallback);
  return text.length > 84 ? `${text.slice(0, 81)}…` : text;
}

function recordInitials(value = '') {
  const initials = String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  return initials || 'C';
}

function customerAccountDisplay(account = {}) {
  const amount = account.currentBalance
    ?? account.availableBalance
    ?? account.availableCredit
    ?? account.creditLimit;
  return amount === null || amount === undefined
    ? displayValue(account.status)
    : formatMoney(amount);
}

function caseIdOf(activeCase) {
  return activeCase?.id ?? 'unassigned-case';
}

function reviewedForTool(reviewed, tool) {
  if (typeof reviewed === 'function') return Boolean(reviewed(tool));
  if (reviewed instanceof Set) return reviewed.has(tool);
  if (Array.isArray(reviewed)) return reviewed.includes(tool);
  if (reviewed && typeof reviewed === 'object') return Boolean(reviewed[tool]);
  return Boolean(reviewed);
}

function sourceLogin(activeCase, loginId) {
  return (activeCase?.loginHistory ?? []).find((record) => exactText(record.id, loginId)) ?? {};
}

function exactDeviceId(activeCase, candidate) {
  if (!candidate) return '';
  const profiles = getDeviceProfiles(activeCase);
  const profile = profiles.find((item) => (
    exactText(item.id, candidate)
    || exactText(item.deviceName, candidate)
    || exactText(item.deviceFingerprint, candidate)
    || exactText(item.browserFingerprint, candidate)
  ));
  return profile?.id ?? '';
}

function routeDescriptor(recordId, activeCase) {
  const value = String(recordId ?? '').trim();
  if (/^LOG-/i.test(value)) return { tool: IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY, query: value, identifierType: 'loginId' };
  if (/^SES-/i.test(value)) return { tool: IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY, query: value, identifierType: 'sessionId' };
  if (/^IP-/i.test(value)) return { tool: IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE, query: value.replace(/^IP-/i, ''), identifierType: 'ipAddress' };
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) return { tool: IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE, query: value, identifierType: 'ipAddress' };
  const deviceId = exactDeviceId(activeCase, value);
  if (deviceId) return { tool: IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE, query: deviceId, identifierType: 'deviceId' };
  return null;
}

function recordIdentifiers(values = []) {
  const identifiers = [];
  for (const value of values) {
    const matches = String(value ?? '').match(/\b(?:LOG|SES|DEV)-[A-Z0-9-]+\b|\bIP-(?:\d{1,3}\.){3}\d{1,3}\b/gi) ?? [];
    identifiers.push(...matches);
  }
  return [...new Set(identifiers)];
}

function useExactLookup(activeCase, initialQuery = '') {
  const [query, setQuery] = useState(String(initialQuery ?? ''));
  const [selected, setSelected] = useState(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    setQuery(String(initialQuery ?? ''));
    setSelected(null);
    setAttempted(false);
  }, [activeCase?.id, initialQuery]);

  function updateQuery(value) {
    setQuery(value);
    setSelected(null);
    setAttempted(false);
  }

  return {
    query,
    setQuery: updateQuery,
    selected,
    setSelected,
    attempted,
    setAttempted,
  };
}

function ToolFrame({
  tool,
  eyebrow,
  title,
  subtitle,
  count,
  icon = 'sparkle',
  activeCase,
  onBack,
  reference = false,
  children,
}) {
  if (reference) {
    return (
      <section
        className="sky-main sky-reference-tool-page sky-intel-reference-page"
        data-identity-digital-tool={tool}
        data-reference-layout="sky-reference-v1"
        aria-labelledby={`${normalizedToolName(tool).replaceAll(' ', '-')}-heading`}
      >
        <header className="sky-reference-tool-hero">
          <SkySparkles />
          <button
            className="sky-reference-tool-back"
            type="button"
            onClick={onBack}
            aria-label="Back to tool map"
          >
            <SkyIcon name="back" size={20} />
          </button>
          <span className="sky-reference-tool-icon" aria-hidden="true">
            <SkyIcon name={icon} size={24} />
          </span>
          <div className="sky-reference-tool-copy">
            <small>{eyebrow}</small>
            <h1 id={`${normalizedToolName(tool).replaceAll(' ', '-')}-heading`}>{title}</h1>
            <p>{subtitle}</p>
            <span>{activeCase?.id ?? 'Case-scoped search'}</span>
          </div>
          <div className="sky-reference-tool-luna" aria-hidden="true">
            <img src="/assets/luna-sky-vector-v1.svg" alt="" />
            <i>♥</i>
          </div>
        </header>
        <div className="sky-grid sky-intel-reference-grid">
          {Number.isFinite(count) ? (
            <span className="sky-intel-record-count" aria-label={`${count} records available`}>
              {count} source records
            </span>
          ) : null}
          {children}
        </div>
      </section>
    );
  }

  return (
    <section className="sky-card sky-tool-shell" aria-labelledby={`${normalizedToolName(tool).replaceAll(' ', '-')}-heading`}>
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>{eyebrow}</p>
            <h2 id={`${normalizedToolName(tool).replaceAll(' ', '-')}-heading`}>{title}</h2>
            <span>{subtitle}</span>
          </div>
          {Number.isFinite(count) ? <span className="sky-chip">{count} records available</span> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

function ReferenceSearchCard({
  icon = 'search',
  eyebrow = 'Search before reveal',
  title,
  description,
  children,
}) {
  return (
    <article
      className="sky-card span-12 sky-reference-search sky-intel-reference-search"
      data-shape="ribbon"
      data-sparkle="true"
    >
      <span className="sky-card-sheen" aria-hidden="true" />
      <SkySparkles />
      <div className="sky-card-inner">
        <header className="sky-reference-search-heading">
          <span aria-hidden="true"><SkyIcon name={icon} size={20} /></span>
          <div>
            <small>{eyebrow}</small>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
        </header>
        {children}
      </div>
    </article>
  );
}

function LookupMessage({ attempted, matched, children }) {
  if (!attempted) {
    return (
      <div className="sky-empty sky-lookup-gate" aria-live="polite">
        Enter the complete identifier and select <strong>Run exact search</strong>. Record details stay hidden until a match is returned.
      </div>
    );
  }
  if (!matched) {
    return (
      <div className="sky-notice sky-lookup-gate" role="status">
        No exact record matched the submitted search. Check the complete identifier and try again.
      </div>
    );
  }
  return children;
}

function DataRows({ rows }) {
  const visibleRows = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (!visibleRows.length) return <div className="sky-empty">No source-linked fields are available for this record.</div>;
  return (
    <dl className="sky-data-list">
      {visibleRows.map(([label, value]) => (
        <div className="sky-data-row" key={label}>
          <dt>{label}</dt>
          <dd>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetricGrid({ metrics }) {
  return (
    <div className="sky-metric-grid">
      {metrics.map(([label, value, note]) => (
        <article className="sky-metric" key={label}>
          <span>{label}</span>
          <strong>{displayValue(value, '0')}</strong>
          {note ? <small>{note}</small> : null}
        </article>
      ))}
    </div>
  );
}

function SearchField({ label, value, onChange, placeholder, type = 'text', autoComplete = 'off', wide = false }) {
  return (
    <label className={`sky-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck="false"
        required
      />
    </label>
  );
}

function ExactSearchForm({
  children,
  onSubmit,
  submitLabel = 'Run exact search',
  reference = false,
}) {
  return (
    <form
      className={reference
        ? 'sky-reference-search-row sky-intel-exact-search'
        : 'sky-form-grid sky-exact-search'}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      {reference ? (
        <button className="sky-button" type="submit">
          <SkyIcon name="search" size={18} />
          {submitLabel}
        </button>
      ) : (
        <div className="sky-field wide sky-action-row">
          <button className="sky-button" type="submit">{submitLabel}</button>
        </div>
      )}
    </form>
  );
}

function NavigateButton({ onNavigate, targetTool, query, identifierType, sourceTool, sourceRecordId, children }) {
  if (!onNavigate || !query) return null;
  return (
    <button
      className="sky-button-secondary"
      type="button"
      onClick={() => onNavigate(targetTool, {
        query,
        identifier: query,
        identifierType,
        sourceTool,
        sourceRecordId,
      })}
    >
      {children}
    </button>
  );
}

function RelatedRecordRoutes({
  activeCase,
  records,
  sourceTool,
  sourceRecordId,
  onNavigate,
  excludeRoutes = [],
}) {
  if (!onNavigate) return null;
  const excluded = new Set(
    excludeRoutes
      .filter((route) => route?.tool && route?.query)
      .map((route) => `${route.tool}::${route.query}`),
  );
  const routes = (records ?? [])
    .map((record) => ({ record, route: routeDescriptor(record, activeCase) }))
    .filter(({ route }) => route)
    .filter(({ route, record }, index, all) => (
      all.findIndex((candidate) => candidate.route.tool === route.tool && candidate.route.query === route.query) === index
      && record !== sourceRecordId
      && !excluded.has(`${route.tool}::${route.query}`)
    ));
  if (!routes.length) return null;
  return (
    <div className="sky-action-row sky-related-routes" aria-label="Open related records">
      {routes.map(({ record, route }) => (
        <NavigateButton
          key={`${route.tool}-${route.query}`}
          onNavigate={onNavigate}
          targetTool={route.tool}
          query={route.query}
          identifierType={route.identifierType}
          sourceTool={sourceTool}
          sourceRecordId={sourceRecordId}
        >
          Open {recordLabel(record)}
        </NavigateButton>
      ))}
    </div>
  );
}

function PinButton({
  onPin,
  activeCase,
  tool,
  recordId,
  sourceRecordId = recordId,
  label,
  value,
  detailValue = value,
  query,
  identifierType,
  record,
  children = 'Pin evidence',
}) {
  if (!onPin) return null;
  return (
    <button
      className="sky-button-secondary"
      type="button"
      onClick={() => onPin({
        id: recordId,
        caseId: caseIdOf(activeCase),
        tool,
        sourceTool: tool,
        recordId,
        sourceRecordId,
        label,
        detail: `${displayValue(label)} · ${displayValue(detailValue)}`,
        value,
        query,
        identifierType,
        record,
      })}
    >
      {children}
    </button>
  );
}

function EvidenceActions({
  activeCase,
  tool,
  recordId,
  label,
  value = recordId,
  record,
  onPin,
  onNote,
  onReview,
  reviewed,
}) {
  const [note, setNote] = useState('');
  const isReviewed = reviewedForTool(reviewed, tool);

  useEffect(() => {
    setNote('');
  }, [activeCase?.id, tool, recordId]);

  if (!onPin && !onNote && !onReview) return null;

  return (
    <section className="sky-card sky-evidence-actions" data-tone="pink" aria-label={`${tool} evidence actions`}>
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Evidence controls</p>
            <h3>Save your work</h3>
            <span>These actions preserve evidence and notes; they do not make a determination.</span>
          </div>
        </header>
        {onNote ? (
          <label className="sky-field wide">
            <span>Investigator note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record what this source shows and what still needs comparison."
            />
          </label>
        ) : null}
        <div className="sky-action-row">
          <PinButton
            onPin={onPin}
            activeCase={activeCase}
            tool={tool}
            recordId={recordId}
            label={label}
            value={value}
            record={record}
          />
          {onNote ? (
            <button
              className="sky-button-secondary"
              type="button"
              disabled={!note.trim()}
              onClick={() => {
                const cleanNote = note.trim();
                if (!cleanNote) return;
                onNote({
                  caseId: caseIdOf(activeCase),
                  tool,
                  sourceTool: tool,
                  recordId,
                  sourceRecordId: recordId,
                  note: cleanNote,
                  record,
                });
                setNote('');
              }}
            >
              Save note
            </button>
          ) : null}
          {onReview ? (
            <button
              className={isReviewed ? 'sky-button-secondary' : 'sky-button'}
              type="button"
              onClick={() => onReview({
                caseId: caseIdOf(activeCase),
                tool,
                recordId,
                sourceRecordId: recordId,
      