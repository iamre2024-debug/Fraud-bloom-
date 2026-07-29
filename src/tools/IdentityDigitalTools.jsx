import { useEffect, useMemo, useState } from 'react';
import { getCustomer360Dossier } from '../data/customer360Dossier.js';
import { getIdentityIntelReport } from '../data/identityIntelReport.js';
import { getLoginRecords } from '../data/loginRecords.js';
import { getSessionRecords } from '../data/sessionRecords.js';
import { getDeviceProfiles } from '../data/deviceRecords.js';
import { getIpRecords } from '../data/ipRecords.js';
import { formatMoney } from '../data/relationshipAccounts.js';

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

function ToolFrame({ tool, eyebrow, title, subtitle, count, children }) {
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

function ExactSearchForm({ children, onSubmit, submitLabel = 'Run exact search' }) {
  return (
    <form
      className="sky-form-grid sky-exact-search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <div className="sky-field wide sky-action-row">
        <button className="sky-button" type="submit">{submitLabel}</button>
      </div>
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

function RelatedRecordRoutes({ activeCase, records, sourceTool, sourceRecordId, onNavigate }) {
  if (!onNavigate) return null;
  const routes = (records ?? [])
    .map((record) => ({ record, route: routeDescriptor(record, activeCase) }))
    .filter(({ route }) => route)
    .filter(({ route, record }, index, all) => (
      all.findIndex((candidate) => candidate.route.tool === route.tool && candidate.route.query === route.query) === index
      && record !== sourceRecordId
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

function PinButton({ onPin, activeCase, tool, recordId, label, value, record, children = 'Pin evidence' }) {
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
        sourceRecordId: recordId,
        label,
        detail: `${displayValue(label)} · ${displayValue(value)}`,
        value,
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

function RecordCard({ title, subtitle, tone, children, actions }) {
  return (
    <article className="sky-card sky-record-card" data-tone={tone}>
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Source record</p>
            <h3>{title}</h3>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
        </header>
        {children}
        {actions ? <div className="sky-action-row">{actions}</div> : null}
      </div>
    </article>
  );
}

export function Customer360Tool({
  activeCase,
  initialQuery = '',
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
    >
      <ExactSearchForm onSubmit={runSearch}>
        <SearchField
          label="Training ID"
          value={lookup.query}
          onChange={lookup.setQuery}
          placeholder="Enter the complete Training ID"
          wide
        />
      </ExactSearchForm>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        <div className="sky-main sky-tool-results">
          <MetricGrid
            metrics={[
              ['Products', dossier.accounts.length, 'Relationship records'],
              ['Trusted devices', dossier.security?.trustedDevices?.length ?? 0, 'Recorded in Customer 360'],
              ['Profile updates', dossier.profileUpdates.length, `Through ${displayValue(dossier.coverage?.asOf)}`],
              ['Service contacts', dossier.serviceContacts.length, 'Recorded contacts'],
            ]}
          />

          <div className="sky-grid">
            <div className="sky-card span-7">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Identity and contact</p>
                    <h3>{displayValue(dossier.identity?.legalName)}</h3>
                    <span>{displayValue(dossier.coverage?.sourceMode)}</span>
                  </div>
                  <span className="sky-chip">{displayValue(trainingId)}</span>
                </header>
                <DataRows
                  rows={[
                    ['Date of birth', dossier.identity?.dob],
                    ['Current address', dossier.identity?.currentAddress],
                    ['Previous address', dossier.identity?.previousAddress],
                    ['Mobile phone', dossier.contact?.mobilePhone],
                    ['Email', dossier.contact?.email],
                    ['Customer since', dossier.identity?.customerSince],
                    ['Preferred contact', dossier.identity?.preferredContact],
                    ['Verification status', dossier.identity?.verificationStatus],
                    ['Verification method', dossier.identity?.verificationMethod],
                    ['Last verified', dossier.identity?.lastVerified],
                  ]}
                />
                <div className="sky-action-row">
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
                </div>
              </div>
            </div>

            <div className="sky-card span-5" data-tone="pink">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Security profile</p>
                    <h3>Recorded controls</h3>
                    <span>Account controls are context, not an authorization conclusion.</span>
                  </div>
                </header>
                <DataRows
                  rows={[
                    ['MFA status', dossier.security?.mfaStatus],
                    ['Password changed', dossier.security?.passwordChanged],
                    ['Recovery contact', dossier.security?.recoveryContact],
                    ['Lockout history', dossier.security?.lockouts],
                    ['Alert delivery', dossier.security?.alerts],
                  ]}
                />
              </div>
            </div>
          </div>

          <section aria-labelledby="customer-products-heading">
            <header className="sky-section-heading">
              <div>
                <p>Relationship records</p>
                <h3 id="customer-products-heading">Products and accounts</h3>
                <span>Balances and status are shown as recorded in the relationship source.</span>
              </div>
            </header>
            <div className="sky-grid">
              {dossier.accounts.map((account) => (
                <div className="span-6" key={account.accountId}>
                  <RecordCard
                    title={displayValue(account.productLabel ?? account.productTypeLabel)}
                    subtitle={displayValue(account.accountId)}
                    actions={(
                      <PinButton
                        onPin={onPin}
                        activeCase={activeCase}
                        tool={tool}
                        recordId={account.accountId}
                        label="Relationship account"
                        value={account.accountId}
                        record={account}
                        children="Pin account"
                      />
                    )}
                  >
                    <DataRows
                      rows={[
                        ['Account ID', account.accountId],
                        ['Opened', account.openDate],
                        ['Status', account.status],
                        ['Current balance', account.currentBalance === null ? 'Not applicable' : formatMoney(account.currentBalance)],
                        ['Available balance', account.availableBalance === null ? 'Not applicable' : formatMoney(account.availableBalance)],
                        ['Available credit', account.availableCredit === null ? 'Not applicable' : formatMoney(account.availableCredit)],
                        ['Restrictions', account.restrictions],
                        ['Holds', account.holds],
                      ]}
                    />
                  </RecordCard>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="customer-devices-heading">
            <header className="sky-section-heading">
              <div>
                <p>Recorded devices</p>
                <h3 id="customer-devices-heading">Trusted-device references</h3>
                <span>Open Device Intelligence to examine the exact device record.</span>
              </div>
            </header>
            {dossier.security?.trustedDevices?.length ? (
              <ul className="sky-record-list">
                {dossier.security.trustedDevices.map((device) => (
                  <li className="sky-data-row" key={device.id}>
                    <div>
                      <strong>{displayValue(device.name)}</strong>
                      <span>{displayValue(device.id)}</span>
                    </div>
                    <div className="sky-action-row">
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
                        value={device.id}
                        record={device}
                        children="Pin device"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : <div className="sky-empty">{displayValue(dossier.coverage?.security)}</div>}
          </section>

          <div className="sky-grid">
            <section className="sky-card span-6" aria-labelledby="profile-updates-heading">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Maintenance</p>
                    <h3 id="profile-updates-heading">Profile updates</h3>
                    <span>{displayValue(dossier.coverage?.profileUpdates)}</span>
                  </div>
                </header>
                {dossier.profileUpdates.length ? (
                  <ul className="sky-record-list">
                    {dossier.profileUpdates.map((update) => (
                      <li className="sky-data-row" key={update.id}>
                        <div>
                          <strong>{displayValue(update.item ?? update.updateType)}</strong>
                          <span>{displayValue(update.id)} · {displayValue(update.dateTime)}</span>
                        </div>
                        <PinButton
                          onPin={onPin}
                          activeCase={activeCase}
                          tool={tool}
                          recordId={update.id}
                          label="Profile update"
                          value={update.id}
                          record={update}
                          children="Pin update"
                        />
                      </li>
                    ))}
                  </ul>
                ) : <div className="sky-empty">No profile update record is supplied through the case as-of date.</div>}
              </div>
            </section>

            <section className="sky-card span-6" data-tone="pink" aria-labelledby="service-contacts-heading">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Servicing</p>
                    <h3 id="service-contacts-heading">Service contacts</h3>
                    <span>{displayValue(dossier.coverage?.serviceContacts)}</span>
                  </div>
                </header>
                {dossier.serviceContacts.length ? (
                  <ul className="sky-record-list">
                    {dossier.serviceContacts.map((contact) => (
                      <li className="sky-data-row" key={contact.id}>
                        <div>
                          <strong>{displayValue(contact.type ?? contact.reasonForContact)}</strong>
                          <span>{displayValue(contact.dateTime)} · {displayValue(contact.channel)}</span>
                        </div>
                        <PinButton
                          onPin={onPin}
                          activeCase={activeCase}
                          tool={tool}
                          recordId={contact.id}
                          label="Service contact"
                          value={contact.id}
                          record={contact}
                          children="Pin contact"
                        />
                      </li>
                    ))}
                  </ul>
                ) : <div className="sky-empty">No service-contact record is supplied through the case as-of date.</div>}
              </div>
            </section>
          </div>

          <EvidenceActions
            activeCase={activeCase}
            tool={tool}
            recordId={trainingId}
            label={`Customer 360 · ${displayValue(dossier.identity?.legalName)}`}
            value={trainingId}
            record={dossier}
            onPin={onPin}
            onNote={onNote}
            onReview={onReview}
            reviewed={reviewed}
          />
        </div>
      </LookupMessage>
    </ToolFrame>
  );
}

export function IdentityIntelligenceTool({
  activeCase,
  initialQuery = '',
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
    >
      <div className="sky-tabs" role="tablist" aria-label="Identity search method">
        <button
          className="sky-tab"
          type="button"
          role="tab"
          aria-selected={mode === 'training-id'}
          onClick={() => resetResult('training-id')}
        >
          Training ID
        </button>
        <button
          className="sky-tab"
          type="button"
          role="tab"
          aria-selected={mode === 'name-dob'}
          onClick={() => resetResult('name-dob')}
        >
          Name + DOB
        </button>
      </div>

      <ExactSearchForm onSubmit={runSearch}>
        {mode === 'training-id' ? (
          <SearchField
            label="Complete Training ID"
            value={trainingId}
            onChange={updateTrainingId}
            placeholder="TRN-0000-00"
            wide
          />
        ) : (
          <>
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
          </>
        )}
      </ExactSearchForm>

      <LookupMessage attempted={attempted} matched={Boolean(report)}>
        {report ? (
          <div className="sky-main sky-tool-results">
            <div className="sky-card">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Exact match returned</p>
                    <h3>{displayValue(report.subject?.name)}</h3>
                    <span>Only supplied identity-source records are shown below.</span>
                  </div>
                  <span className="sky-chip">{displayValue(report.subject?.trainingId)}</span>
                </header>
                <DataRows
                  rows={[
                    ['Training ID', report.subject?.trainingId],
                    ['Context', report.subject?.contextType],
                    ['Source case', report.subject?.sourceCaseId],
                    ...(mode === 'name-dob' ? [['Matched DOB', report.searchDob]] : []),
                  ]}
                />
                <div className="sky-action-row">
                  {report.subject?.contextType === 'case-customer' ? (
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
                  ) : null}
                </div>
              </div>
            </div>

            <section aria-labelledby="identity-source-records-heading">
              <header className="sky-section-heading">
                <div>
                  <p>Source-backed only</p>
                  <h3 id="identity-source-records-heading">Identity records</h3>
                  <span>Generated relatives, property, credit, public-record, and risk-summary fields are intentionally omitted.</span>
                </div>
              </header>
              {report.sourceRecords?.length ? (
                <div className="sky-grid">
                  {report.sourceRecords.map((record) => (
                    <div className="span-6" key={record.id}>
                      <RecordCard
                        title={displayValue(record.type)}
                        subtitle={displayValue(record.id)}
                        tone="pink"
                        actions={(
                          <PinButton
                            onPin={onPin}
                            activeCase={activeCase}
                            tool={tool}
                            recordId={record.id}
                            label={record.type}
                            value={record.value}
                            record={record}
                            children="Pin source record"
                          />
                        )}
                      >
                        <DataRows
                          rows={[
                            ['Recorded value', record.value],
                            ['Last seen', record.lastSeen],
                            ['Source history', record.history],
                          ]}
                        />
                      </RecordCard>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sky-notice">
                  The exact case identity matched, but no separate identity-intelligence source record was supplied. No inferred background record is displayed.
                </div>
              )}
            </section>

            <EvidenceActions
              activeCase={activeCase}
              tool={tool}
              recordId={report.subject?.trainingId}
              label={`Identity Intelligence · ${displayValue(report.subject?.name)}`}
              value={report.subject?.trainingId}
              record={{ subject: report.subject, sourceRecords: report.sourceRecords }}
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
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY;
  const records = useMemo(() => getLoginRecords(activeCase), [activeCase]);
  const lookup = useExactLookup(activeCase, initialQuery);
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
      subtitle="Search one complete Login ID to examine the recorded authentication event."
      count={records.length}
    >
      <ExactSearchForm onSubmit={runSearch}>
        <SearchField
          label="Login ID"
          value={lookup.query}
          onChange={lookup.setQuery}
          placeholder="LOG-0000"
          wide
        />
      </ExactSearchForm>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="sky-main sky-tool-results">
            <RecordCard
              title={displayValue(lookup.selected.id)}
              subtitle="Recorded authentication event"
            >
              <DataRows
                rows={[
                  ['Date and time', lookup.selected.timestamp],
                  ['Result', rawRecord?.result],
                  ['Method', rawRecord?.method],
                  ['MFA', rawRecord?.mfaStatus],
                  ['Channel', rawRecord?.authChannel],
                  ['Device', rawRecord?.deviceId ?? rawRecord?.device],
                  ['IP address', rawRecord?.ip],
                  ['Location', rawRecord?.location],
                  ['Session', lookup.selected.sessionReference],
                  ['Failed attempts', rawRecord?.failedAttemptCount],
                  ['Account lockout', rawRecord?.accountLockout],
                  ['Logout status', rawRecord?.logoutStatus],
                ]}
              />
              <div className="sky-action-row">
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
            </RecordCard>

            <RelatedRecordRoutes
              activeCase={activeCase}
              records={lookup.selected.relatedRecords}
              sourceTool={tool}
              sourceRecordId={lookup.selected.id}
              onNavigate={onNavigate}
            />

            <div className="sky-notice">
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
                result: rawRecord?.result,
                method: rawRecord?.method,
                mfaStatus: rawRecord?.mfaStatus,
                authChannel: rawRecord?.authChannel,
                deviceId: rawRecord?.deviceId,
                device: rawRecord?.device,
                ip: rawRecord?.ip,
                location: rawRecord?.location,
                session: lookup.selected.sessionReference,
                failedAttemptCount: rawRecord?.failedAttemptCount,
                accountLockout: rawRecord?.accountLockout,
                logoutStatus: rawRecord?.logoutStatus,
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
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY;
  const records = useMemo(() => getSessionRecords(activeCase), [activeCase]);
  const lookup = useExactLookup(activeCase, initialQuery);
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
      subtitle="Search one complete Session ID to inspect its source-linked authentication and profile activity."
      count={records.length}
    >
      <ExactSearchForm onSubmit={runSearch}>
        <SearchField
          label="Session ID"
          value={lookup.query}
          onChange={lookup.setQuery}
          placeholder="SES-0000"
          wide
        />
      </ExactSearchForm>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="sky-main sky-tool-results">
            <RecordCard
              title={displayValue(lookup.selected.session)}
              subtitle="Authenticated session reference"
              tone="pink"
            >
              <DataRows
                rows={[
                  ['Session start', lookup.selected.start],
                  ['Login ID', lookup.selected.id],
                  ['Authentication result', rawLogin?.result],
                  ['Authentication method', rawLogin?.method],
                  ['Device', rawLogin?.deviceId ?? rawLogin?.device],
                  ['IP address', rawLogin?.ip],
                  ['Location', rawLogin?.location],
                  ['Logout status', rawLogin?.logoutStatus],
                ]}
              />
              <div className="sky-action-row">
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
            </RecordCard>

            <section className="sky-card" aria-labelledby="session-profile-activity-heading">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Source-linked activity</p>
                    <h3 id="session-profile-activity-heading">Recorded profile events</h3>
                    <span>Only events explicitly linked to this Session ID are displayed.</span>
                  </div>
                  <span className="sky-chip">{profileChanges.length} linked</span>
                </header>
                {profileChanges.length ? (
                  <ul className="sky-record-list">
                    {profileChanges.map((change) => (
                      <li className="sky-data-row" key={change.id}>
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
                loginId: lookup.selected.id,
                result: rawLogin?.result,
                method: rawLogin?.method,
                deviceId: rawLogin?.deviceId,
                device: rawLogin?.device,
                ip: rawLogin?.ip,
                location: rawLogin?.location,
                logoutStatus: rawLogin?.logoutStatus,
                profileChanges,
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
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE;
  const records = useMemo(() => getDeviceProfiles(activeCase), [activeCase]);
  const lookup = useExactLookup(activeCase, initialQuery);

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
      subtitle="Search the complete Device ID, device fingerprint, or browser fingerprint."
      count={records.length}
    >
      <ExactSearchForm onSubmit={runSearch}>
        <SearchField
          label="Device ID or fingerprint"
          value={lookup.query}
          onChange={lookup.setQuery}
          placeholder="DEV-… or FP-…"
          wide
        />
      </ExactSearchForm>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="sky-main sky-tool-results">
            <div className="sky-grid">
              <div className="sky-card span-7">
                <div className="sky-card-inner">
                  <header className="sky-section-heading">
                    <div>
                      <p>Device record</p>
                      <h3>{displayValue(lookup.selected.deviceName)}</h3>
                      <span>{displayValue(lookup.selected.id)}</span>
                    </div>
                    <span className="sky-chip">{displayValue(lookup.selected.deviceType)}</span>
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
                    ]}
                  />
                </div>
              </div>
              <div className="sky-card span-5" data-tone="pink">
                <div className="sky-card-inner">
                  <header className="sky-section-heading">
                    <div>
                      <p>Linked identifiers</p>
                      <h3>Profiles and records</h3>
                      <span>Identifiers are shown without a risk or ownership conclusion.</span>
                    </div>
                  </header>
                  <DataRows
                    rows={[
                      ['Linked training profiles', lookup.selected.linkedProfiles],
                      ['Related records', lookup.selected.relatedRecords],
                    ]}
                  />
                </div>
              </div>
            </div>

            <section className="sky-card" aria-labelledby="device-observation-heading">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Observed activity</p>
                    <h3 id="device-observation-heading">Device history</h3>
                    <span>Recorded timestamps and linked sessions are context for comparison.</span>
                  </div>
                  <span className="sky-chip">{lookup.selected.history?.length ?? 0} observations</span>
                </header>
                {lookup.selected.history?.length ? (
                  <ul className="sky-record-list">
                    {lookup.selected.history.map((item, index) => (
                      <li className="sky-data-row" key={`${lookup.selected.id}-history-${index}`}>
                        <span>Observation {index + 1}</span>
                        <strong>{displayValue(item)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <div className="sky-empty">No device observation history was supplied.</div>}
              </div>
            </section>

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

            <div className="sky-notice">
              Trust labels, behavioral conclusions, wallet conclusions, and device-level risk hints are intentionally omitted from this view.
            </div>

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
  onPin,
  onNote,
  onReview,
  onNavigate,
  reviewed,
}) {
  const tool = IDENTITY_DIGITAL_TOOLS.IP_INTELLIGENCE;
  const records = useMemo(() => getIpRecords(activeCase), [activeCase]);
  const lookup = useExactLookup(activeCase, initialQuery);

  function runSearch() {
    lookup.setAttempted(true);
    lookup.setSelected(records.find((record) => exactText(record.ip, lookup.query)) ?? null);
  }

  return (
    <ToolFrame
      tool={tool}
      eyebrow="Exact network lookup"
      title="IP Intelligence"
      subtitle="Search one complete IP address. No candidate addresses are exposed before lookup."
      count={records.length}
    >
      <ExactSearchForm onSubmit={runSearch}>
        <SearchField
          label="Complete IP address"
          value={lookup.query}
          onChange={lookup.setQuery}
          placeholder="203.0.113.45"
          wide
        />
      </ExactSearchForm>

      <LookupMessage attempted={lookup.attempted} matched={Boolean(lookup.selected)}>
        {lookup.selected ? (
          <div className="sky-main sky-tool-results">
            <div className="sky-card" data-tone="pink">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Exact IP returned</p>
                    <h3>{displayValue(lookup.selected.ip)}</h3>
                    <span>Only observed case-linked access records are shown.</span>
                  </div>
                  <span className="sky-chip">Network record</span>
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
            </div>

            <section className="sky-card" aria-labelledby="ip-events-heading">
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <div>
                    <p>Source-linked activity</p>
                    <h3 id="ip-events-heading">Observed login events</h3>
                    <span>Each row comes from an authentication event linked to the searched IP.</span>
                  </div>
                </header>
                {lookup.selected.observedLoginEvents?.length ? (
                  <ul className="sky-record-list">
                    {lookup.selected.observedLoginEvents.map((event) => (
                      <li className="sky-data-row" key={event.id}>
                        <div>
                          <strong>{displayValue(event.id)}</strong>
                          <span>{displayValue(event.time)} · {displayValue(event.result)}</span>
                        </div>
                        <div>
                          <span>{displayValue(event.device)} · {displayValue(event.location)}</span>
                          <div className="sky-action-row">
                            <NavigateButton
                              onNavigate={onNavigate}
                              targetTool={IDENTITY_DIGITAL_TOOLS.LOGIN_HISTORY}
                              query={event.id}
                              identifierType="loginId"
                              sourceTool={tool}
                              sourceRecordId={lookup.selected.id}
                            >
                              Open exact login
                            </NavigateButton>
                            <NavigateButton
                              onNavigate={onNavigate}
                              targetTool={IDENTITY_DIGITAL_TOOLS.SESSION_HISTORY}
                              query={event.session !== 'No session created' ? event.session : ''}
                              identifierType="sessionId"
                              sourceTool={tool}
                              sourceRecordId={lookup.selected.id}
                            >
                              Open exact session
                            </NavigateButton>
                            <NavigateButton
                              onNavigate={onNavigate}
                              targetTool={IDENTITY_DIGITAL_TOOLS.DEVICE_INTELLIGENCE}
                              query={exactDeviceId(activeCase, event.device)}
                              identifierType="deviceId"
                              sourceTool={tool}
                              sourceRecordId={lookup.selected.id}
                            >
                              Open exact device
                            </NavigateButton>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="sky-empty">No authentication event is linked to this IP in the active case.</div>}
              </div>
            </section>

            <RelatedRecordRoutes
              activeCase={activeCase}
              records={lookup.selected.relatedRecords}
              sourceTool={tool}
              sourceRecordId={lookup.selected.id}
              onNavigate={onNavigate}
            />

            <div className="sky-notice">
              Provider, VPN/proxy, cross-profile, and risk fields are omitted because the current data API does not distinguish supplied lookup evidence from generated training context.
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
