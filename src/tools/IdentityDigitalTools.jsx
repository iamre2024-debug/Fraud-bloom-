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

function uniqueAdditionalRelationshipFacts(facts = []) {
  const displayedCoreLabels = new Set([
    'customer since',
    'relationship length',
    'previous address',
    'preferred contact',
  ]);
  const seen = new Set();
  return facts.filter((item) => {
    const label = String(item?.label ?? '').trim().toLowerCase();
    const value = String(item?.value ?? '').trim().toLowerCase();
    if (!label || !value || displayedCoreLabels.has(label)) return false;
    const identity = `${label}:${value}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
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

function useExactLookup(activeCase, initialQuery = '', directRecord = null, directQuery = '') {
  const openedQuery = String(initialQuery || directQuery || '');
  const [query, setQuery] = useState(openedQuery);
  const [selected, setSelected] = useState(directRecord);
  const [attempted, setAttempted] = useState(Boolean(directRecord));

  useEffect(() => {
    setQuery(String(initialQuery || directQuery || ''));
    setSelected(directRecord);
    setAttempted(Boolean(directRecord));
  }, [activeCase?.id, directQuery, directRecord, initialQuery]);

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
            <img src="/assets/luna-anime-purple-v1.webp" alt="" />
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

function RecordCollection({
  title,
  description,
  records = [],
  selectedId = '',
  getId,
  getTitle,
  getDetail,
  onSelect,
}) {
  return (
    <section className="sky-card span-12 sky-access-record-collection" data-shape="ribbon">
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Active-case records</p>
            <h3>{title}</h3>
            <span>{description}</span>
          </div>
          <span className="sky-chip">{records.length} supplied</span>
        </header>
        {records.length ? (
          <div className="sky-record-list">
            {records.map((record) => {
              const id = getId(record);
              return (
                <button
                  className="sky-record"
                  type="button"
                  key={id}
                  aria-current={id === selectedId}
                  onClick={() => onSelect(record)}
                >
                  <span>
                    <strong>{getTitle(record)}</strong>
                    <small>{getDetail(record)}</small>
                  </span>
                  <span>{id === selectedId ? 'Open' : 'View'}</span>
                </button>
              );
            })}
          </div>
        ) : <div className="sky-empty">No source records are supplied for this case.</div>}
      </div>
    </section>
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
              })}
            >
              {isReviewed ? 'Reviewed' : `Mark ${tool} reviewed`}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function Customer360Tool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.CUSTOMER_360;
  const dossier = useMemo(() => getCustomer360Dossier(activeCase), [activeCase]);
  const lookup = useExactLookup(activeCase, initialQuery);
  const trainingId = dossier.identity?.trainingId ?? activeCase.trainingId;
  const linkedBusinessCount = dossier.relationship?.businessRelationships?.length ?? 0;
  const relationshipFacts = useMemo(
    () => uniqueAdditionalRelationshipFacts(dossier.relationship?.facts ?? []),
    [dossier.relationship?.facts],
  );
  const customerSnapshot = useMemo(() => ({
    id: trainingId,
    recordId: trainingId,
    caseId: caseIdOf(activeCase),
    trainingId,
    legalName: dossier.identity?.legalName,
    customerSince: dossier.identity?.customerSince,
    relationshipLength: dossier.identity?.relationshipLength,
    segment: dossier.identity?.segment,
    dateOfBirth: dossier.identity?.dob,
    currentAddress: dossier.identity?.currentAddress,
    mobilePhone: dossier.contact?.mobilePhone,
    email: dossier.contact?.email,
  }), [activeCase, dossier, trainingId]);

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(exactText(lookup.query, trainingId) ? dossier : null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Relationship profile"
      title="Customer 360"
      subtitle="Open a customer relationship only with the complete Training ID."
      activeCase={activeCase}
      icon="user"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        title="Find one customer relationship"
        description="Enter the complete Training ID. Profile and relationship records remain hidden until the exact identifier matches."
      >
        <ExactSearchForm onSubmit={runSearch} reference>
          <SearchField
            label="Complete Training ID"
            value={lookup.query}
            onChange={lookup.setQuery}
            placeholder="TRN-0000-00"
            wide
          />
        </ExactSearchForm>
      </ReferenceSearchCard>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <section className="span-12 sky-customer-reference-dashboard" aria-label="Matched customer relationship">
            <article
              className="sky-card sky-customer-reference-profile"
              data-shape="shield"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header className="sky-customer-profile-heading">
                  <span className="sky-customer-profile-mark" aria-hidden="true">
                    {recordInitials(dossier.identity?.legalName)}
                  </span>
                  <div>
                    <small>Exact relationship returned</small>
                    <h2>{displayValue(dossier.identity?.legalName)}</h2>
                    <p>
                      Customer since {displayValue(dossier.identity?.customerSince)}
                      {' · '}
                      {displayValue(dossier.identity?.segment)}
                    </p>
                  </div>
                  <span className="sky-chip">Source record</span>
                </header>

                <div className="sky-customer-profile-id-strip">
                  <div>
                    <SkyIcon name="user" size={18} />
                    <span><small>Training ID</small><strong>{displayValue(trainingId)}</strong></span>
                  </div>
                  <div>
                    <SkyIcon name="cases" size={18} />
                    <span><small>Case ID</small><strong>{displayValue(activeCase.id)}</strong></span>
                  </div>
                  <div>
                    <SkyIcon name="payment" size={18} />
                    <span><small>Relationship</small><strong>{displayValue(dossier.identity?.segment)}</strong></span>
                  </div>
                </div>

                <div className="sky-customer-profile-details">
                  <DataRows
                    rows={[
                      ['Date of birth', dossier.identity?.dob],
                      ['Current address', dossier.identity?.currentAddress],
                    ]}
                  />
                  <DataRows
                    rows={[
                      ['Mobile phone', dossier.contact?.mobilePhone],
                      ['Email', dossier.contact?.email],
                    ]}
                  />
                </div>

                <div className="sky-action-row sky-customer-profile-actions">
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE}
                    query={trainingId}
                    identifierType="trainingId"
                    sourceTool={tool}
                    sourceRecordId={trainingId}
                  >
                    Search Identity Intelligence
                  </NavigateButton>
                  <PinButton
                    onPin={onPin}
                    activeCase={activeCase}
                    tool={tool}
                    recordId={trainingId}
                    label="Customer relationship"
                    value={trainingId}
                    query={trainingId}
                    identifierType="trainingId"
                    record={customerSnapshot}
                    children="Pin customer profile"
                  />
                </div>
              </div>
            </article>

            <div className="sky-customer-reference-middle">
              <article
                className="sky-card sky-customer-section-card sky-customer-updates-card"
                data-shape="ribbon"
                data-sparkle="true"
                aria-labelledby="customer-profile-updates-heading"
              >
                <span className="sky-card-sheen" aria-hidden="true" />
                <SkySparkles />
                <div className="sky-card-inner">
                  <header className="sky-customer-section-heading">
                    <span aria-hidden="true"><SkyIcon name="calendar" size={21} /></span>
                    <div>
                      <small>Maintenance history</small>
                      <h2 id="customer-profile-updates-heading">Profile updates</h2>
                      <p>Recorded through {displayValue(dossier.coverage?.asOf)}</p>
                    </div>
                    <em>{dossier.profileUpdates.length}</em>
                  </header>
                  {dossier.profileUpdates.length ? (
                    <div className="sky-customer-record-list">
                      {dossier.profileUpdates.map((update) => (
                        <article key={update.id}>
                          <span aria-hidden="true"><SkyIcon name="sparkle" size={17} /></span>
                          <div>
                            <small>{displayValue(update.dateTime)}</small>
                            <strong>{displayValue(update.item ?? update.updateType)}</strong>
                            <p>{displayValue([update.channel, update.source])}</p>
                          </div>
                          <PinButton
                            onPin={onPin}
                            activeCase={activeCase}
                            tool={tool}
                            recordId={update.id}
                            label="Profile update"
                            value={trainingId}
                            detailValue={update.id}
                            query={trainingId}
                            identifierType="trainingId"
                            record={{
                              id: update.id,
                              item: update.item ?? update.updateType,
                              dateTime: update.dateTime,
                              channel: update.channel,
                              source: update.source,
                            }}
                            children="Pin update"
                          />
                        </article>
                      ))}
                    </div>
                  ) : <div className="sky-empty">No profile update record is supplied through the case as-of date.</div>}
                </div>
              </article>

              <article
                className="sky-card sky-customer-section-card sky-customer-devices-card"
                data-shape="notched"
                aria-labelledby="customer-devices-heading"
              >
                <div className="sky-card-inner">
                  <header className="sky-customer-section-heading">
                    <span aria-hidden="true"><SkyIcon name="device" size={21} /></span>
                    <div>
                      <small>Security source records</small>
                      <h2 id="customer-devices-heading">Trusted devices &amp; controls</h2>
                      <p>Recorded context only; no authorization conclusion.</p>
                    </div>
                    <em>{dossier.security?.trustedDevices?.length ?? 0}</em>
                  </header>
                  <DataRows
                    rows={[
                      ['MFA profile', dossier.security?.mfaStatus],
                      ['Password changed', dossier.security?.passwordChanged],
                      ['Recovery contact', dossier.security?.recoveryContact],
                    ]}
                  />
                  {dossier.security?.trustedDevices?.length ? (
                    <div className="sky-customer-device-list">
                      {dossier.security.trustedDevices.map((device) => (
                        <article key={device.id}>
                          <span aria-hidden="true"><SkyIcon name="device" size={19} /></span>
                          <div>
                            <strong>{displayValue(device.name)}</strong>
                            <small>{displayValue(device.id)}</small>
                            <p>{displayValue([device.platform, device.lastSeen])}</p>
                          </div>
                          <div className="sky-customer-record-actions">
                            <NavigateButton
                              onNavigate={onNavigate}
                              targetTool={IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE}
                              query={device.id}
                              identifierType="deviceId"
                              sourceTool={tool}
                              sourceRecordId={trainingId}
                            >
                              Open exact device
                            </NavigateButton>
                            <PinButton
                              onPin={onPin}
                              activeCase={activeCase}
                              tool={tool}
                              recordId={device.id}
                              label="Trusted device"
                              value={trainingId}
                              detailValue={device.id}
                              query={trainingId}
                              identifierType="trainingId"
                              record={{
                                id: device.id,
                                name: device.name,
                                platform: device.platform,
                                lastSeen: device.lastSeen,
                              }}
                              children="Pin device"
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="sky-empty">{displayValue(dossier.coverage?.security)}</div>}
                </div>
              </article>
            </div>

            <div className="sky-customer-reference-lower">
              <article
                className="sky-card sky-customer-section-card sky-customer-accounts-card"
                data-shape="ribbon"
                aria-labelledby="customer-products-heading"
              >
                <div className="sky-card-inner">
                  <header className="sky-customer-section-heading">
                    <span aria-hidden="true"><SkyIcon name="payment" size={21} /></span>
                    <div>
                      <small>Relationship records</small>
                      <h2 id="customer-products-heading">Accounts &amp; products</h2>
                      <p>Balances and status exactly as recorded by the relationship source.</p>
                    </div>
                    <em>{dossier.accounts.length}</em>
                  </header>
                  {dossier.accounts.length ? (
                    <div className="sky-customer-account-grid">
                      {dossier.accounts.map((account, index) => (
                        <article data-tone={index % 2 ? 'pink' : 'blue'} key={account.accountId}>
                          <span aria-hidden="true"><SkyIcon name="payment" size={21} /></span>
                          <div>
                            <small>{displayValue(account.accountId)}</small>
                            <strong>{displayValue(account.productLabel ?? account.productTypeLabel)}</strong>
                            <p>{customerAccountDisplay(account)}</p>
                          </div>
                          <details>
                            <summary>Details</summary>
                            <DataRows
                              rows={[
                                ['Opened', account.openDate],
                                ['Status', account.status],
                                ['Available balance', account.availableBalance === null ? 'Not applicable' : formatMoney(account.availableBalance)],
                                ['Available credit', account.availableCredit === null ? 'Not applicable' : formatMoney(account.availableCredit)],
                                ['Restrictions', account.restrictions],
                                ['Holds', account.holds],
                              ]}
                            />
                          </details>
                          <PinButton
                            onPin={onPin}
                            activeCase={activeCase}
                            tool={tool}
                            recordId={account.accountId}
                            label="Relationship account"
                            value={trainingId}
                            detailValue={account.accountId}
                            query={trainingId}
                            identifierType="trainingId"
                            record={{
                              accountId: account.accountId,
                              productLabel: account.productLabel ?? account.productTypeLabel,
                              openDate: account.openDate,
                              status: account.status,
                              currentBalance: account.currentBalance,
                              availableBalance: account.availableBalance,
                              availableCredit: account.availableCredit,
                              restrictions: account.restrictions,
                              holds: account.holds,
                            }}
                            children="Pin account"
                          />
                        </article>
                      ))}
                    </div>
                  ) : <div className="sky-empty">No relationship account is supplied.</div>}
                </div>
              </article>

              <article
                className="sky-card sky-customer-section-card sky-customer-relationship-card"
                data-tone="pink"
                data-shape="notched"
                data-sparkle="true"
                aria-labelledby="customer-relationship-heading"
              >
                <span className="sky-card-sheen" aria-hidden="true" />
                <SkySparkles />
                <div className="sky-card-inner">
                  <header className="sky-customer-section-heading">
                    <span aria-hidden="true"><SkyIcon name="sparkle" size={21} /></span>
                    <div>
                      <small>Neutral coverage</small>
                      <h2 id="customer-relationship-heading">Relationship facts</h2>
                      <p>Recorded relationship fields only.</p>
                    </div>
                  </header>
                  <div className="sky-customer-relationship-facts">
                    <DataRows
                      rows={[
                        ['Customer since', dossier.identity?.customerSince],
                        ['Relationship length', dossier.identity?.relationshipLength],
                        ['Previous address', dossier.identity?.previousAddress],
                        ['Preferred contact', dossier.identity?.preferredContact],
                        ['Products', dossier.accounts.length],
                        ['Trusted-device records', dossier.security?.trustedDevices?.length ?? 0],
                        ['Profile-update records', dossier.profileUpdates.length],
                        ['Service-contact records', dossier.serviceContacts.length],
                        ['Linked business records', linkedBusinessCount],
                        ...relationshipFacts.map((item) => [item.label, item.value]),
                      ]}
                    />
                  </div>
                </div>
              </article>

              {linkedBusinessCount > 0 ? (
                <article
                  className="sky-card sky-customer-section-card sky-customer-relationship-card"
                  data-shape="notched"
                  aria-labelledby="customer-business-links-heading"
                >
                  <div className="sky-card-inner">
                    <header className="sky-customer-section-heading">
                      <span aria-hidden="true"><SkyIcon name="building" size={21} /></span>
                      <div>
                        <small>Ownership and affiliation records</small>
                        <h2 id="customer-business-links-heading">Linked businesses</h2>
                        <p>Source-recorded relationships only; no ownership is inferred.</p>
                      </div>
                      <em>{linkedBusinessCount}</em>
                    </header>
                    <div className="sky-customer-record-list">
                      {dossier.relationship.businessRelationships.map((business) => (
                        <article key={business.businessId}>
                          <span aria-hidden="true"><SkyIcon name="building" size={18} /></span>
                          <div>
                            <small>{displayValue(business.businessId)}</small>
                            <strong>{displayValue(business.businessName)}</strong>
                            <DataRows rows={[
                              ['Relationship', business.relationship],
                              ['Ownership', business.ownershipPercentage],
                              ['Relationship since', business.relationshipSince],
                              ['Status', business.status],
                            ]} />
                          </div>
                          <div className="sky-customer-record-actions">
                            <NavigateButton
                              onNavigate={onNavigate}
                              targetTool="Business 360"
                              query={business.businessId}
                              identifierType="businessId"
                              sourceTool={tool}
                              sourceRecordId={business.businessId}
                            >
                              Open Business 360
                            </NavigateButton>
                            <PinButton
                              onPin={onPin}
                              activeCase={activeCase}
                              tool={tool}
                              recordId={business.businessId}
                              label="Linked business"
                              value={trainingId}
                              detailValue={business.businessId}
                              query={trainingId}
                              identifierType="trainingId"
                              record={business}
                              children="Pin relationship"
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </article>
              ) : null}
            </div>

            <article
              className="sky-card sky-customer-section-card sky-customer-contact-card"
              data-shape="ribbon"
              aria-labelledby="customer-contacts-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-customer-section-heading">
                  <span aria-hidden="true"><SkyIcon name="evidence" size={21} /></span>
                  <div>
                    <small>Servicing history</small>
                    <h2 id="customer-contacts-heading">Recent contact notes</h2>
                    <p>{displayValue(dossier.coverage?.serviceContacts)}</p>
                  </div>
                  <em>{dossier.serviceContacts.length}</em>
                </header>
                {dossier.serviceContacts.length ? (
                  <div className="sky-customer-contact-list">
                    {dossier.serviceContacts.map((contact) => (
                      <article key={contact.id}>
                        <span aria-hidden="true"><SkyIcon name="evidence" size={18} /></span>
                        <div>
                          <small>{displayValue(contact.dateTime)} · {displayValue(contact.channel)}</small>
                          <strong>{displayValue(contact.type ?? contact.reasonForContact)}</strong>
                          <p>{displayValue(contact.notes ?? contact.outcome)}</p>
                          <DataRows rows={[
                            ['Outcome', contact.outcome],
                            ['Agent / department', contact.agent ?? contact.agentOrDepartment],
                            ['Related account', contact.relatedAccountId],
                            ['Information reported', contact.reportedInformation],
                            ['Assistance provided', contact.assistanceProvided],
                            ['Documents requested', contact.documentsRequested],
                            ['Follow-up status', contact.followUpStatus],
                          ]} />
                        </div>
                        <PinButton
                          onPin={onPin}
                          activeCase={activeCase}
                          tool={tool}
                          recordId={contact.id}
                          label="Service contact"
                          value={trainingId}
                          detailValue={contact.id}
                          query={trainingId}
                          identifierType="trainingId"
                          record={{
                            id: contact.id,
                            type: contact.type ?? contact.reasonForContact,
                            dateTime: contact.dateTime,
                            channel: contact.channel,
                            notes: contact.notes ?? contact.outcome,
                          }}
                          children="Pin contact"
                        />
                      </article>
                    ))}
                  </div>
                ) : <div className="sky-empty">No service-contact record is supplied through the case as-of date.</div>}
              </div>
            </article>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={trainingId}
              label={`Customer 360 · ${displayValue(dossier.identity?.legalName)}`}
              value={trainingId}
              record={customerSnapshot}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </section>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

export function IdentityIntelligenceTool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE;
  const [mode, setMode] = useState('training-id');
  const [trainingId, setTrainingId] = useState(String(initialQuery ?? ''));
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [report, setReport] = useState(null);

  useEffect(() => {
    setMode('training-id');
    setTrainingId(String(initialQuery ?? ''));
    setName('');
    setDob('');
    setAttempted(false);
    setReport(null);
  }, [activeCase?.id, initialQuery]);

  function clearResult() {
    setAttempted(false);
    setReport(null);
  }

  function updateTrainingId(value) {
    setTrainingId(value);
    clearResult();
  }

  function updateName(value) {
    setName(value);
    clearResult();
  }

  function updateDob(value) {
    setDob(value);
    clearResult();
  }

  function resetResult(nextMode) {
    setMode(nextMode);
    clearResult();
  }

  function runSearch() {
    setAttempted(true);
    if (mode === 'training-id') {
      const candidate = getIdentityIntelReport(activeCase, { trainingId });
      setReport(exactText(candidate.subject?.trainingId, trainingId) ? candidate : null);
      return;
    }
    const candidate = getIdentityIntelReport(activeCase);
    const matched = exactText(candidate.searchName, name) && exactDate(candidate.searchDob, dob);
    setReport(matched ? candidate : null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Exact person search"
      title="Identity Intelligence"
      subtitle="Match either the complete Training ID or the complete legal name plus date of birth."
      activeCase={activeCase}
      icon="user"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        title="Find one supplied identity"
        description="Choose one exact lookup method. Identity details remain hidden until the submitted values match."
      >
        <div className="sky-tabs" role="group" aria-label="Identity search method">
          <button
            className="sky-tab"
            type="button"
            aria-pressed={mode === 'training-id'}
            onClick={() => resetResult('training-id')}
          >
            Training ID
          </button>
          <button
            className="sky-tab"
            type="button"
            aria-pressed={mode === 'name-dob'}
            onClick={() => resetResult('name-dob')}
          >
            Name + DOB
          </button>
        </div>

        <ExactSearchForm onSubmit={runSearch} reference>
          {mode === 'training-id' ? (
            <SearchField
              label="Complete Training ID"
              value={trainingId}
              onChange={updateTrainingId}
              placeholder="TRN-0000-00"
              wide
            />
          ) : (
            <div className="sky-intel-reference-dual-fields">
              <SearchField
                label="Complete legal name"
                value={name}
                onChange={updateName}
                placeholder="First and last name"
              />
              <SearchField
                label="Date of birth"
                value={dob}
                onChange={updateDob}
                type="date"
              />
            </div>
          )}
        </ExactSearchForm>
      </ReferenceSearchCard>

      <LookupMessage attempted={attempted} matched={Boolean(report)}>
        {report ? (
          <div className="span-12 sky-intel-reference-results sky-identity-reference-results">
            <article
              className="sky-card sky-intel-profile-hero"
              data-shape="shield"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header className="sky-intel-profile-heading">
                  <span className="sky-intel-profile-mark" aria-hidden="true">
                    <SkyIcon name="user" size={30} />
                  </span>
                  <div>
                    <p>Exact match returned</p>
                    <h3>{displayValue(report.subject?.name)}</h3>
                    <span>Only supplied identity-source records are shown below.</span>
                  </div>
                  <span className="sky-chip">{displayValue(report.subject?.trainingId)}</span>
                </header>
                <div className="sky-intel-hero-facts">
                  <DataRows
                    rows={[
                      ['Training ID', report.subject?.trainingId],
                      ['Context', report.subject?.contextType],
                      ['Source case', report.subject?.sourceCaseId],
                      ...(mode === 'name-dob' ? [['Matched DOB', report.searchDob]] : []),
                    ]}
                  />
                  <div className="sky-intel-source-count" aria-label={`${report.sourceRecords?.length ?? 0} source records`}>
                    <strong>{report.sourceRecords?.length ?? 0}</strong>
                    <span>source records</span>
                  </div>
                </div>
                {report.subject?.contextType === 'case-customer' ? (
                  <div className="sky-action-row">
                    <NavigateButton
                      onNavigate={onNavigate}
                      targetTool={IDENTITY_DIGITAL_TOOLS.CUSTOMER_360}
                      query={report.subject?.trainingId}
                      identifierType="trainingId"
                      sourceTool={tool}
                      sourceRecordId={report.subject?.trainingId}
                    >
                      Open Customer 360
                    </NavigateButton>
                  </div>
                ) : null}
              </div>
            </article>

            <section
              className="sky-card sky-intel-source-section"
              data-shape="ribbon"
              aria-labelledby="identity-source-records-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="evidence" size={22} />
                  </span>
                  <div>
                    <p>Source-backed only</p>
                    <h3 id="identity-source-records-heading">Identity records</h3>
                    <span>Each tile is a supplied record, not an inferred identity conclusion.</span>
                  </div>
                  <span className="sky-chip">{report.sourceRecords?.length ?? 0} found</span>
                </header>
                {report.sourceRecords?.length ? (
                  <div className="sky-intel-source-grid">
                    {report.sourceRecords.map((record, index) => (
                      <article
                        className="sky-intel-source-tile"
                        data-tone={index % 3 === 1 ? 'pink' : index % 3 === 2 ? 'violet' : 'blue'}
                        key={record.id}
                      >
                        <span className="sky-intel-source-icon" aria-hidden="true">
                          <SkyIcon name={record.type === 'Phone' ? 'device' : record.type === 'Email' ? 'evidence' : 'user'} size={20} />
                        </span>
                        <div>
                          <small>{displayValue(record.type)}</small>
                          <strong>{displayValue(record.value)}</strong>
                          <span>{displayValue(record.lastSeen)}</span>
                          <p>{displayValue(record.history)}</p>
                        </div>
                        <PinButton
                          onPin={onPin}
                          activeCase={activeCase}
                          tool={tool}
                          recordId={record.id}
                          label={record.type}
                          value={record.value}
                          record={record}
                          children="Pin"
                        />
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="sky-notice">
                    The exact case identity matched, but no separate identity-intelligence source record was supplied. No inferred background record is displayed.
                  </div>
                )}
              </div>
            </section>

            <div className="sky-intel-boundary-note">
              <SkyIcon name="shield" size={19} />
              <div>
                Generated relatives, property, credit, public-record, and outcome-oriented summaries remain outside this pre-submit view.
              </div>
            </div>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={report.subject?.trainingId}
              label={`Identity Intelligence · ${displayValue(report.subject?.name)}`}
              value={report.subject?.trainingId}
              record={{
                subject: report.subject,
                sourceRecords: report.sourceRecords,
                ...(mode === 'name-dob' ? { matchedDob: report.searchDob } : {}),
              }}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </div>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

export function LoginHistoryTool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY;
  const records = useMemo(() => getLoginRecords(activeCase), [activeCase]);
  const directRecord = records.find((record) => exactText(record.id, initialQuery)) ?? records[0] ?? null;
  const lookup = useExactLookup(activeCase, initialQuery, directRecord, directRecord?.id);
  const rawRecord = lookup.selected ? sourceLogin(activeCase, lookup.selected.id) : null;

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(records.find((record) => exactText(record.id, lookup.query)) ?? null);
  }

  const selectedDeviceId = lookup.selected
    ? exactDeviceId(activeCase, rawRecord?.deviceId ?? lookup.selected.device)
    : '';

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Authentication evidence"
      title="Login History"
      subtitle="Open the active case’s authentication history and switch to another Login ID when needed."
      count={records.length}
      activeCase={activeCase}
      icon="login"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        eyebrow="Record filter"
        title="Open another authentication event"
        description="The first supplied event opens automatically. Enter a complete Login ID to switch records."
      >
        <ExactSearchForm onSubmit={runSearch} reference>
          <SearchField
            label="Login ID"
            value={lookup.query}
            onChange={lookup.setQuery}
            placeholder="LOG-0000"
            wide
          />
        </ExactSearchForm>
      </ReferenceSearchCard>

      <section className="sky-card span-12" data-shape="notched" aria-label="Login history summary">
        <div className="sky-card-inner">
          <MetricGrid metrics={[
            ['Authentication events', records.length, 'Supplied logins'],
            ['Successful', records.filter((record) => /successful/i.test(record.result ?? '')).length, 'Recorded result'],
            ['Failed / denied', records.filter((record) => /(failed|denied)/i.test(record.result ?? '')).length, 'Recorded result'],
            ['Account lockouts', records.filter((record) => /lock/i.test(record.accountLockout ?? record.result ?? '')).length, 'Recorded lock state'],
            ['Unique devices', new Set(records.map((record) => record.deviceId ?? record.device).filter(Boolean)).size, 'Exact device references'],
            ['MFA completed', records.filter((record) => /(completed|approved|delivered)/i.test(record.mfaStatus ?? '')).length, 'Recorded MFA state'],
          ]} />
        </div>
      </section>

      <RecordCollection
        title="Recorded authentication events"
        description="Choose any supplied login. The exact-ID field above remains available as a quick switch."
        records={records}
        selectedId={lookup.selected?.id}
        getId={(record) => record.id}
        getTitle={(record) => `${record.id} · ${displayValue(record.result, 'Recorded')}`}
        getDetail={(record) => displayValue([
          record.timestamp,
          record.deviceId ?? record.device,
          record.location,
          record.ip,
        ])}
        onSelect={(record) => {
          lookup.setSelected(record);
          lookup.setQuery(record.id);
          lookup.setAttempted(false);
        }}
      />

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="span-12 sky-intel-reference-results sky-access-reference-results">
            <article
              className="sky-card sky-access-event-card"
              data-shape="notched"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header className="sky-access-event-heading">
                  <span className="sky-access-event-icon" aria-hidden="true">
                    <SkyIcon name="login" size={25} />
                  </span>
                  <div>
                    <small>Recorded authentication event</small>
                    <h2>{displayValue(lookup.selected.id)}</h2>
                    <p>{displayValue(lookup.selected.timestamp)}</p>
                  </div>
                  <span className="sky-chip">{displayValue(rawRecord?.result, 'Recorded')}</span>
                </header>
                <div className="sky-access-event-layout">
                  <DataRows
                    rows={[
                      ['Event type', rawRecord?.eventType],
                      ['Method', rawRecord?.method],
                      ['MFA', rawRecord?.mfaStatus],
                      ['Channel', rawRecord?.authChannel],
                      ['Browser', rawRecord?.browserSource],
                      ['Operating system', rawRecord?.operatingSystem],
                      ['Device', rawRecord?.deviceId ?? rawRecord?.device],
                      ['IP address', rawRecord?.ip],
                      ['Location', rawRecord?.location],
                      ['Session', lookup.selected.sessionReference],
                      ['Failed attempts', rawRecord?.failedAttemptCount],
                      ['Account lockout', rawRecord?.accountLockout],
                      ['Logout status', rawRecord?.logoutStatus],
                      ['Session context', rawRecord?.sessionBehavior],
                    ]}
                  />
                  <aside className="sky-access-time-rail" aria-label="Authentication sequence marker">
                    <span><SkyIcon name="clock" size={22} /></span>
                    <strong>{displayValue(lookup.selected.timeOfDay ?? rawRecord?.time)}</strong>
                    <small>{displayValue(lookup.selected.date)}</small>
                  </aside>
                </div>
                <div className="sky-action-row sky-access-route-actions">
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY}
                    query={lookup.selected.sessionReference !== 'No session created' ? lookup.selected.sessionReference : ''}
                    identifierType="sessionId"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.id}
                  >
                    Open exact session
                  </NavigateButton>
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE}
                    query={selectedDeviceId}
                    identifierType="deviceId"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.id}
                  >
                    Open exact device
                  </NavigateButton>
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE}
                    query={rawRecord?.ip}
                    identifierType="ipAddress"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.id}
                  >
                    Open exact IP
                  </NavigateButton>
                </div>
              </div>
            </article>

            <RelatedRecordRoutes
              activeCase={activeCase}
              records={lookup.selected.relatedRecords}
              sourceTool={tool}
              sourceRecordId={lookup.selected.id}
              onNavigate={onNavigate}
              excludeRoutes={[
                {
                  tool: IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY,
                  query: lookup.selected.sessionReference !== 'No session created'
                    ? lookup.selected.sessionReference
                    : '',
                },
                {
                  tool: IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE,
                  query: selectedDeviceId,
                },
                {
                  tool: IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE,
                  query: rawRecord?.ip,
                },
              ]}
            />

            <div className="sky-intel-boundary-note">
              <SkyIcon name="shield" size={19} />
              A successful authentication or completed MFA step is evidence of access. It does not by itself establish who performed later activity.
            </div>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={lookup.selected.id}
              label={`Login event · ${lookup.selected.id}`}
              value={lookup.selected.id}
              record={{
                id: lookup.selected.id,
                timestamp: lookup.selected.timestamp,
                eventType: rawRecord?.eventType,
                result: rawRecord?.result,
                method: rawRecord?.method,
                mfaStatus: rawRecord?.mfaStatus,
                authChannel: rawRecord?.authChannel,
                browserSource: rawRecord?.browserSource,
                operatingSystem: rawRecord?.operatingSystem,
                deviceId: rawRecord?.deviceId,
                device: rawRecord?.device,
                ip: rawRecord?.ip,
                location: rawRecord?.location,
                session: lookup.selected.sessionReference,
                failedAttemptCount: rawRecord?.failedAttemptCount,
                accountLockout: rawRecord?.accountLockout,
                logoutStatus: rawRecord?.logoutStatus,
                sessionBehavior: rawRecord?.sessionBehavior,
                relatedRecords: lookup.selected.relatedRecords,
              }}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </div>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

export function SessionHistoryTool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY;
  const records = useMemo(() => getSessionRecords(activeCase), [activeCase]);
  const directRecord = records.find((record) => exactText(record.session, initialQuery)) ?? records[0] ?? null;
  const lookup = useExactLookup(activeCase, initialQuery, directRecord, directRecord?.session);
  const rawLogin = lookup.selected ? sourceLogin(activeCase, lookup.selected.id) : null;
  const selectedDeviceId = lookup.selected
    ? exactDeviceId(activeCase, rawLogin?.deviceId ?? rawLogin?.device)
    : '';
  const profileChanges = lookup.selected
    ? (activeCase.customer?.profileChanges ?? []).filter((record) => exactText(record.session, lookup.selected.session))
    : [];

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(records.find((record) => exactText(record.session, lookup.query)) ?? null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Post-login evidence"
      title="Session History"
      subtitle="Open the active case’s session history and switch to another Session ID when needed."
      count={records.length}
      activeCase={activeCase}
      icon="session"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        eyebrow="Record filter"
        title="Open another authenticated session"
        description="The first supplied session opens automatically. Enter a complete Session ID to switch records."
      >
        <ExactSearchForm onSubmit={runSearch} reference>
          <SearchField
            label="Session ID"
            value={lookup.query}
            onChange={lookup.setQuery}
            placeholder="SES-0000"
            wide
          />
        </ExactSearchForm>
      </ReferenceSearchCard>

      <section className="sky-card span-12" data-shape="notched" aria-label="Session history summary">
        <div className="sky-card-inner">
          <MetricGrid metrics={[
            ['Recorded sessions', records.length, 'Supplied sessions'],
            ['Normal logout', records.filter((record) => /normal logout/i.test(record.logoutStatus ?? '')).length, 'Recorded state'],
            ['Session timeout', records.filter((record) => /timeout/i.test(record.logoutStatus ?? '')).length, 'Recorded state'],
            ['Profile activity', records.filter((record) => (record.activityTypes ?? []).some((item) => /profile/i.test(item))).length, 'Explicit activity'],
            ['Money activity', records.filter((record) => (record.activityTypes ?? []).some((item) => /(payment|transfer|purchase|money)/i.test(item))).length, 'Explicit activity'],
            ['Devices / IPs', `${new Set(records.map((record) => sourceLogin(activeCase, record.id)?.deviceId).filter(Boolean)).size} / ${new Set(records.map((record) => sourceLogin(activeCase, record.id)?.ip).filter(Boolean)).size}`, 'Exact references'],
          ]} />
        </div>
      </section>

      <RecordCollection
        title="Recorded authenticated sessions"
        description="Open any supplied session without running a search."
        records={records}
        selectedId={lookup.selected?.session}
        getId={(record) => record.session}
        getTitle={(record) => `${record.session} · ${displayValue(record.duration, 'Duration not supplied')}`}
        getDetail={(record) => displayValue([
          record.start,
          record.end,
          record.logoutStatus,
          record.activityTypes,
        ])}
        onSelect={(record) => {
          lookup.setSelected(record);
          lookup.setQuery(record.session);
          lookup.setAttempted(false);
        }}
      />

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="span-12 sky-intel-reference-results sky-session-reference-results">
            <article
              className="sky-card sky-session-summary-card"
              data-tone="pink"
              data-shape="shield"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header className="sky-access-event-heading">
                  <span className="sky-access-event-icon" aria-hidden="true">
                    <SkyIcon name="session" size={25} />
                  </span>
                  <div>
                    <small>Authenticated session</small>
                    <h2>{displayValue(lookup.selected.session)}</h2>
                    <p>{displayValue(lookup.selected.start)}</p>
                  </div>
                  <span className="sky-chip">{displayValue(lookup.selected.duration, 'Recorded')}</span>
                </header>
                <div className="sky-session-summary-layout">
                  <DataRows
                    rows={[
                      ['Session end', lookup.selected.end],
                      ['Login ID', lookup.selected.id],
                      ['Authentication result', rawLogin?.result],
                      ['Authentication method', rawLogin?.method],
                      ['Browser', rawLogin?.browserSource],
                      ['Operating system', rawLogin?.operatingSystem],
                      ['Device', rawLogin?.deviceId ?? rawLogin?.device],
                      ['IP address', rawLogin?.ip],
                      ['Location', rawLogin?.location],
                      ['Logout status', lookup.selected.logoutStatus ?? rawLogin?.logoutStatus],
                    ]}
                  />
                  <aside className="sky-session-activity-summary">
                    <span><SkyIcon name="evidence" size={22} /></span>
                    <strong>{lookup.selected.sessionPath?.length ?? 0}</strong>
                    <small>recorded steps</small>
                    <p>{displayValue(lookup.selected.activityTypes, 'Source-linked activity')}</p>
                  </aside>
                </div>
                <div className="sky-action-row sky-access-route-actions">
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY}
                    query={lookup.selected.id}
                    identifierType="loginId"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.session}
                  >
                    Open exact login
                  </NavigateButton>
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE}
                    query={selectedDeviceId}
                    identifierType="deviceId"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.session}
                  >
                    Open exact device
                  </NavigateButton>
                  <NavigateButton
                    onNavigate={onNavigate}
                    targetTool={IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE}
                    query={rawLogin?.ip}
                    identifierType="ipAddress"
                    sourceTool={tool}
                    sourceRecordId={lookup.selected.session}
                  >
                    Open exact IP
                  </NavigateButton>
                </div>
              </div>
            </article>

            <section
              className="sky-card sky-session-path-card"
              data-shape="ribbon"
              aria-labelledby="session-path-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="network" size={22} />
                  </span>
                  <div>
                    <p>Source-linked activity</p>
                    <h3 id="session-path-heading">Recorded session path</h3>
                    <span>Sequence entries come from this exact session record.</span>
                  </div>
                  <span className="sky-chip">{lookup.selected.sessionPath?.length ?? 0} steps</span>
                </header>
                {lookup.selected.sessionPath?.length ? (
                  <ol className="sky-session-path">
                    {lookup.selected.sessionPath.map((step, index) => (
                      <li key={`${lookup.selected.session}-path-${index}`}>
                        <span aria-hidden="true">{index + 1}</span>
                        <div>
                          <small>Step {index + 1}</small>
                          <strong>{displayValue(step)}</strong>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <div className="sky-empty">No activity path was supplied for this session.</div>}
              </div>
            </section>

            <section
              className="sky-card sky-session-profile-card"
              data-shape="notched"
              aria-labelledby="session-profile-activity-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="user" size={22} />
                  </span>
                  <div>
                    <p>Source-linked activity</p>
                    <h3 id="session-profile-activity-heading">Recorded profile events</h3>
                    <span>Only events explicitly linked to this Session ID are displayed.</span>
                  </div>
                  <span className="sky-chip">{profileChanges.length} linked</span>
                </header>
                {profileChanges.length ? (
                  <ul className="sky-session-profile-events">
                    {profileChanges.map((change) => (
                      <li key={change.id}>
                        <span className="sky-session-profile-dot" aria-hidden="true" />
                        <div>
                          <strong>{displayValue(change.item ?? change.eventType)}</strong>
                          <span>{displayValue(change.id)} · {displayValue(`${change.date ?? ''} ${change.time ?? ''}`)}</span>
                        </div>
                        <PinButton
                          onPin={onPin}
                          activeCase={activeCase}
                          tool={tool}
                          recordId={change.id}
                          label="Session-linked profile event"
                          value={change.id}
                          record={change}
                          children="Pin event"
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="sky-empty">
                    No profile-maintenance event is explicitly linked to this session. Inferred page paths and activity summaries are not displayed.
                  </div>
                )}
              </div>
            </section>

            <RelatedRecordRoutes
              activeCase={activeCase}
              records={lookup.selected.relatedRecords}
              sourceTool={tool}
              sourceRecordId={lookup.selected.session}
              onNavigate={onNavigate}
              excludeRoutes={[
                {
                  tool: IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY,
                  query: lookup.selected.id,
                },
                {
                  tool: IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE,
                  query: selectedDeviceId,
                },
                {
                  tool: IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE,
                  query: rawLogin?.ip,
                },
              ]}
            />

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={lookup.selected.session}
              label={`Session · ${lookup.selected.session}`}
              value={lookup.selected.session}
              record={{
                session: lookup.selected.session,
                start: lookup.selected.start,
                end: lookup.selected.end,
                duration: lookup.selected.duration,
                loginId: lookup.selected.id,
                result: rawLogin?.result,
                method: rawLogin?.method,
                browserSource: rawLogin?.browserSource,
                operatingSystem: rawLogin?.operatingSystem,
                deviceId: rawLogin?.deviceId,
                device: rawLogin?.device,
                ip: rawLogin?.ip,
                location: rawLogin?.location,
                logoutStatus: lookup.selected.logoutStatus ?? rawLogin?.logoutStatus,
                sessionPath: lookup.selected.sessionPath,
                activityTypes: lookup.selected.activityTypes,
                profileChanges,
                relatedRecords: lookup.selected.relatedRecords,
              }}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </div>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

export function DeviceIntelligenceTool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE;
  const records = useMemo(() => getDeviceProfiles(activeCase), [activeCase]);
  const directRecord = records.find((record) => (
    exactText(record.id, initialQuery)
    || exactText(record.deviceFingerprint, initialQuery)
    || exactText(record.browserFingerprint, initialQuery)
  )) ?? records[0] ?? null;
  const lookup = useExactLookup(activeCase, initialQuery, directRecord, directRecord?.id);

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(records.find((record) => (
      exactText(record.id, lookup.query)
      || exactText(record.deviceFingerprint, lookup.query)
      || exactText(record.browserFingerprint, lookup.query)
    )) ?? null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Exact device lookup"
      title="Device Intelligence"
      subtitle="Open the active case’s device record and switch devices by an exact identifier when needed."
      count={records.length}
      activeCase={activeCase}
      icon="device"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        eyebrow="Record filter"
        title="Open another device record"
        description="The first supplied device opens automatically. Use a complete Device ID or fingerprint to switch records."
      >
        <ExactSearchForm onSubmit={runSearch} reference>
          <SearchField
            label="Device ID or fingerprint"
            value={lookup.query}
            onChange={lookup.setQuery}
            placeholder="DEV-… or FP-…"
            wide
          />
        </ExactSearchForm>
      </ReferenceSearchCard>

      <RecordCollection
        title="Supplied device records"
        description="Compare every device attached to the active case; the exact field above is only a shortcut."
        records={records}
        selectedId={lookup.selected?.id}
        getId={(record) => record.id}
        getTitle={(record) => `${record.id} · ${displayValue(record.deviceName)}`}
        getDetail={(record) => displayValue([
          record.deviceType,
          record.operatingSystem,
          record.browser,
          record.firstSeen,
          record.lastSeen,
        ])}
        onSelect={(record) => {
          lookup.setSelected(record);
          lookup.setQuery(record.id);
          lookup.setAttempted(false);
        }}
      />

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="span-12 sky-intel-reference-results sky-device-reference-results">
            <article
              className="sky-card sky-device-primary-card"
              data-shape="shield"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <div className="sky-device-primary-copy">
                  <small>Primary returned device</small>
                  <div className="sky-device-primary-title">
                    <span className="sky-device-visual" aria-hidden="true">
                      <SkyIcon name="device" size={44} />
                      <i />
                    </span>
                    <div>
                      <h2>{displayValue(lookup.selected.deviceName)}</h2>
                      <p>{displayValue(lookup.selected.deviceType)} · {displayValue(lookup.selected.operatingSystem)}</p>
                      <span>{displayValue(lookup.selected.id)}</span>
                    </div>
                  </div>
                </div>
                <div className="sky-device-primary-meta">
                  <span className="sky-device-primary-orbit" aria-hidden="true">
                    <SkyIcon name="network" size={34} />
                  </span>
                  <strong>{lookup.selected.history?.length ?? 0}</strong>
                  <small>observations</small>
                </div>
              </div>
            </article>

            <section
              className="sky-card sky-device-spec-card"
              data-shape="ribbon"
              aria-labelledby="device-spec-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="device" size={22} />
                  </span>
                  <div>
                    <p>Source record</p>
                    <h3 id="device-spec-heading">Device details</h3>
                    <span>Recorded identifiers and timestamps for this exact match.</span>
                  </div>
                </header>
                <DataRows
                  rows={[
                    ['Device ID', lookup.selected.id],
                    ['Device type', lookup.selected.deviceType],
                    ['Operating system', lookup.selected.operatingSystem],
                    ['Browser', lookup.selected.browser],
                    ['Device fingerprint', lookup.selected.deviceFingerprint],
                    ['Browser fingerprint', lookup.selected.browserFingerprint],
                    ['First seen', lookup.selected.firstSeen],
                    ['Last seen', lookup.selected.lastSeen],
                    ['Linked training profiles', lookup.selected.linkedProfiles],
                    ['Related records', lookup.selected.relatedRecords],
                  ]}
                />
              </div>
            </section>

            <section
              className="sky-card sky-device-history-card"
              data-tone="pink"
              data-shape="notched"
              aria-labelledby="device-observation-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="clock" size={22} />
                  </span>
                  <div>
                    <p>Observed activity</p>
                    <h3 id="device-observation-heading">Device history</h3>
                    <span>Recorded timestamps and linked sessions are context for comparison.</span>
                  </div>
                  <span className="sky-chip">{lookup.selected.history?.length ?? 0} observations</span>
                </header>
                {lookup.selected.history?.length ? (
                  <ol className="sky-device-history-list">
                    {lookup.selected.history.map((item, index) => (
                      <li key={`${lookup.selected.id}-history-${index}`}>
                        <span aria-hidden="true"><SkyIcon name="device" size={18} /></span>
                        <div>
                          <small>Observation {index + 1}</small>
                          <strong>{displayValue(item)}</strong>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <div className="sky-empty">No device observation history was supplied.</div>}
              </div>
            </section>

            <section className="sky-card sky-device-links-card" data-shape="shield">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="network" size={22} />
                  </span>
                  <div>
                    <p>Cross-tool navigation</p>
                    <h3>Open linked source records</h3>
                    <span>Each available action preserves the exact identifier for the next tool.</span>
                  </div>
                </header>
                <RelatedRecordRoutes
                  activeCase={activeCase}
                  records={[
                    ...(lookup.selected.relatedRecords ?? []),
                    ...recordIdentifiers(lookup.selected.history),
                  ]}
                  sourceTool={tool}
                  sourceRecordId={lookup.selected.id}
                  onNavigate={onNavigate}
                />
                <div className="sky-intel-boundary-note">
                  <SkyIcon name="shield" size={19} />
                  Trust labels, behavioral conclusions, wallet conclusions, and device-level outcome hints remain outside this pre-submit view.
                </div>
              </div>
            </section>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={lookup.selected.id}
              label={`Device · ${lookup.selected.id}`}
              value={lookup.selected.id}
              record={{
                id: lookup.selected.id,
                deviceName: lookup.selected.deviceName,
                deviceType: lookup.selected.deviceType,
                operatingSystem: lookup.selected.operatingSystem,
                browser: lookup.selected.browser,
                deviceFingerprint: lookup.selected.deviceFingerprint,
                browserFingerprint: lookup.selected.browserFingerprint,
                firstSeen: lookup.selected.firstSeen,
                lastSeen: lookup.selected.lastSeen,
                linkedProfiles: lookup.selected.linkedProfiles,
                history: lookup.selected.history,
                relatedRecords: lookup.selected.relatedRecords,
              }}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </div>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

export function IpIntelligenceTool({
  activeCase,
  initialQuery = '',
  onBackToWorkspace,
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE;
  const records = useMemo(() => getIpRecords(activeCase), [activeCase]);
  const directRecord = records.find((record) => exactText(record.ip, initialQuery)) ?? records[0] ?? null;
  const lookup = useExactLookup(activeCase, initialQuery, directRecord, directRecord?.ip);

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(records.find((record) => exactText(record.ip, lookup.query)) ?? null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Exact network lookup"
      title="IP Intelligence"
      subtitle="Open the active case’s IP records and switch to another exact address when needed."
      count={records.length}
      activeCase={activeCase}
      icon="globe"
      onBack={onBackToWorkspace}
      reference
    >
      <ReferenceSearchCard
        icon="search"
        eyebrow="Record filter"
        title="Open another network record"
        description="The first supplied IP record opens automatically. Enter a complete address to switch records."
      >
        <ExactSearchForm onSubmit={runSearch} reference>
          <SearchField
            label="Complete IP address"
            value={lookup.query}
            onChange={lookup.setQuery}
            placeholder="203.0.113.45"
            wide
          />
        </ExactSearchForm>
      </ReferenceSearchCard>

      <RecordCollection
        title="Supplied network records"
        description="Open any observed address without unlocking it through search."
        records={records}
        selectedId={lookup.selected?.ip}
        getId={(record) => record.ip}
        getTitle={(record) => record.ip}
        getDetail={(record) => displayValue([
          record.firstSeen,
          record.lastSeen,
          record.lookupResult,
          record.observedDevices,
          record.observedSessions,
        ])}
        onSelect={(record) => {
          lookup.setSelected(record);
          lookup.setQuery(record.ip);
          lookup.setAttempted(false);
        }}
      />

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="span-12 sky-intel-reference-results sky-ip-reference-results">
            <article
              className="sky-card sky-ip-primary-card"
              data-tone="pink"
              data-shape="ribbon"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header className="sky-ip-primary-heading">
                  <div>
                    <small>Exact IP returned</small>
                    <h2>{displayValue(lookup.selected.ip)}</h2>
                    <span>Only observed case-linked access records are shown.</span>
                  </div>
                  <span className="sky-chip">Network record</span>
                </header>
                <div className="sky-ip-globe" aria-hidden="true">
                  <span><SkyIcon name="globe" size={90} /></span>
                  <i /><i /><i />
                </div>
              </div>
            </article>

            <section
              className="sky-card sky-ip-context-card"
              data-shape="shield"
              aria-labelledby="ip-context-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="network" size={22} />
                  </span>
                  <div>
                    <p>Observed context</p>
                    <h3 id="ip-context-heading">Case-linked footprint</h3>
                    <span>Counts reflect only access records attached to the active case.</span>
                  </div>
                </header>
                <MetricGrid
                  metrics={[
                    ['Login events', lookup.selected.observedLogins?.length ?? 0, 'Observed in this case'],
                    ['Sessions', lookup.selected.observedSessions?.length ?? 0, 'Authenticated sessions'],
                    ['Devices', lookup.selected.observedDevices?.length ?? 0, 'Recorded device references'],
                    ['Locations', new Set((lookup.selected.observedLoginEvents ?? []).map((event) => event.location).filter(Boolean)).size, 'Observed event locations'],
                  ]}
                />
              </div>
            </section>

            <section
              className="sky-card sky-ip-history-card"
              data-shape="notched"
              aria-labelledby="ip-events-heading"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-intel-section-icon" aria-hidden="true">
                    <SkyIcon name="clock" size={22} />
                  </span>
                  <div>
                    <p>Source-linked activity</p>
                    <h3 id="ip-events-heading">Observed login events</h3>
                    <span>Each row comes from an authentication event linked to the searched IP.</span>
                  </div>
                </header>
                {lookup.selected.observedLoginEvents?.length ? (
                  <ol className="sky-ip-event-list">
                    {lookup.selected.observedLoginEvents.map((event, index) => (
                      <li key={event.id}>
                        <span className="sky-ip-event-marker" aria-hidden="true">{index + 1}</span>
                        <div>
                          <small>{displayValue(event.time)}</small>
                          <strong>{displayValue(event.id)}</strong>
                          <span>{displayValue(event.result)} · {displayValue(event.device)} · {displayValue(event.location)}</span>
                        </div>
                        <div className="sky-action-row">
                          <NavigateButton
                            onNavigate={onNavigate}
                            targetTool={IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY}
                            query={event.id}
                            identifierType="loginId"
                            sourceTool={tool}
                            sourceRecordId={lookup.selected.id}
                          >
                            Open login
                          </NavigateButton>
                          <NavigateButton
                            onNavigate={onNavigate}
                            targetTool={IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY}
                            query={event.session !== 'No session created' ? event.session : ''}
                            identifierType="sessionId"
                            sourceTool={tool}
                            sourceRecordId={lookup.selected.id}
                          >
                            Open session
                          </NavigateButton>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : <div className="sky-empty">No authentication event is linked to this IP in the active case.</div>}
              </div>
            </section>

            <RelatedRecordRoutes
              activeCase={activeCase}
              records={lookup.selected.relatedRecords}
              sourceTool={tool}
              sourceRecordId={lookup.selected.id}
              onNavigate={onNavigate}
              excludeRoutes={(lookup.selected.observedLoginEvents ?? []).flatMap((event) => [
                {
                  tool: IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY,
                  query: event.id,
                },
                {
                  tool: IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY,
                  query: event.session !== 'No session created' ? event.session : '',
                },
              ])}
            />

            <div className="sky-intel-boundary-note">
              <SkyIcon name="shield" size={19} />
              Provider, proxy, cross-profile, and outcome fields remain omitted because their source provenance is not separated by the current record contract.
            </div>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={lookup.selected.id}
              label={`IP address · ${lookup.selected.ip}`}
              value={lookup.selected.ip}
              record={{
                id: lookup.selected.id,
                ip: lookup.selected.ip,
                observedLogins: lookup.selected.observedLogins,
                observedSessions: lookup.selected.observedSessions,
                observedDevices: lookup.selected.observedDevices,
                observedLoginEvents: lookup.selected.observedLoginEvents,
                relatedRecords: lookup.selected.relatedRecords,
              }}
              onPin={onPin}
              onNote={onNote}
              onReview={onReview}
              reviewed={reviewed}
            />
          </div>
        ) : null}
      </LookupMessage>
    </ToolFrame>
  );
}

const TOOL_ALIASES = new Map([
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.CUSTOMER_360), IDENTITY_DIGITAL_TOOLS.CUSTOMER_360],
  [normalizedToolName('Customer360'), IDENTITY_DIGITAL_TOOLS.CUSTOMER_360],
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE), IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE],
  [normalizedToolName('Identity Intel'), IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE],
  [normalizedToolName('Identity Intel / People Search'), IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE],
  [normalizedToolName('People Search'), IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE],
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY), IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY],
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY), IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY],
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE), IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE],
  [normalizedToolName(IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE), IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE],
  [normalizedToolName('IP Lookup'), IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE],
]);

function toolCallbackAdapters(props, tool) {
  const noteCallback = props.onSaveNote ?? props.saveNote;
  const reviewCallback = props.onMarkReviewed ?? props.markReviewed;
  const legacyOpenTool = props.openTool;
  const stateTool = tool === IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE
    ? 'Identity Intel / People Search'
    : tool;
  return {
    onPin: props.onPin ?? props.pin,
    onNote: props.onNote ?? (noteCallback
      ? (payload) => noteCallback(payload.note, stateTool, payload.recordId)
      : undefined),
    onReview: props.onReview ?? (reviewCallback
      ? () => reviewCallback(stateTool)
      : undefined),
    onNavigate: props.onNavigate
      ?? props.onOpenTool
      ?? (legacyOpenTool
        ? (targetTool, context) => legacyOpenTool(
          targetTool,
          'investigate',
          context?.query ? { query: context.query, ...context } : context,
        )
        : undefined),
    reviewed: props.reviewed
      ?? Boolean(props.completedTools?.includes(tool) || props.completedTools?.includes(stateTool)),
  };
}

function adaptedTool(Component, tool) {
  function AdaptedIdentityDigitalTool(props) {
    return <Component {...props} {...toolCallbackAdapters(props, tool)} />;
  }
  AdaptedIdentityDigitalTool.displayName = `Adapted${Component.name}`;
  return AdaptedIdentityDigitalTool;
}

const AdaptedCustomer360Tool = adaptedTool(Customer360Tool, IDENTITY_DIGITAL_TOOLS.CUSTOMER_360);
const AdaptedIdentityIntelligenceTool = adaptedTool(IdentityIntelligenceTool, IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE);
const AdaptedLoginHistoryTool = adaptedTool(LoginHistoryTool, IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY);
const AdaptedSessionHistoryTool = adaptedTool(SessionHistoryTool, IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY);
const AdaptedDeviceIntelligenceTool = adaptedTool(DeviceIntelligenceTool, IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE);
const AdaptedIpIntelligenceTool = adaptedTool(IpIntelligenceTool, IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE);

export const identityDigitalToolRegistry = Object.freeze({
  [IDENTITY_DIGITAL_TOOLS.CUSTOMER_360]: AdaptedCustomer360Tool,
  [IDENTITY_DIGITAL_TOOLS.IDENTITY_INTELLIGENCE]: AdaptedIdentityIntelligenceTool,
  'Identity Intel / People Search': AdaptedIdentityIntelligenceTool,
  'Identity Intel': AdaptedIdentityIntelligenceTool,
  'People Search': AdaptedIdentityIntelligenceTool,
  [IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY]: AdaptedLoginHistoryTool,
  [IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY]: AdaptedSessionHistoryTool,
  [IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE]: AdaptedDeviceIntelligenceTool,
  [IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE]: AdaptedIpIntelligenceTool,
  'IP Lookup': AdaptedIpIntelligenceTool,
});

export const identityDigitalToolNames = Object.freeze(Object.keys(identityDigitalToolRegistry));

export function resolveIdentityDigitalTool(toolName) {
  if (identityDigitalToolRegistry[toolName]) return identityDigitalToolRegistry[toolName];
  const canonicalName = TOOL_ALIASES.get(normalizedToolName(toolName));
  return canonicalName ? identityDigitalToolRegistry[canonicalName] : null;
}

export function isIdentityDigitalTool(toolName) {
  return Boolean(resolveIdentityDigitalTool(toolName));
}

export function IdentityDigitalTools({ tool, toolName, ...props }) {
  const requestedTool = toolName ?? tool;
  const ToolComponent = resolveIdentityDigitalTool(requestedTool);
  if (!ToolComponent) return null;
  if (!props.activeCase) {
    return (
      <div className="sky-empty" role="status">
        Select an active training case before opening {displayValue(requestedTool, 'this tool')}.
      </div>
    );
  }
  return <ToolComponent {...props} toolName={requestedTool} />;
}

export default IdentityDigitalTools;
