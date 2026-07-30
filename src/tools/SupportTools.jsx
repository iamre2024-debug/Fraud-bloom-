import { useEffect, useMemo, useState } from 'react';
import {
  formatLinkAnalysisPin,
  getLinkIdentifiersForCase,
  linkIdentifierTypes,
  searchLinkRelationships,
} from '../data/linkAnalysisRecords.js';
import {
  buildSystemAccessSummary,
  getSystemAccessRecords,
  searchSystemAccessRecords,
  sortSystemAccessRecords,
} from '../data/systemAccessRecords.js';
import { buildCoreToolRecords } from '../data/coreToolRecords.js';
import {
  DataList,
  EvidenceActions,
  RecordList,
  SectionHeading,
  SkyCard,
  SkyIcon,
  SkySparkles,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

function clean(value) {
  return String(value ?? '').trim();
}

function SupportGlyph({ type, size = 22 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  if (type === 'phone') {
    return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M10 5h4M11 18.5h2" /></svg>;
  }
  if (type === 'email') {
    return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.3" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>;
  }
  if (type === 'device') {
    return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="1.8" /><path d="M8 20h8M10 16v4M14 16v4" /></svg>;
  }
  if (type === 'bank-code') {
    return <svg {...common}><path d="m3 9 9-5 9 5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 20h18M2 9h20" /></svg>;
  }
  if (type === 'destination-id') {
    return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2.2" /><path d="M3 9h18M7 14h4" /></svg>;
  }
  if (type === 'accounts') {
    return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5M16 6.5a2.6 2.6 0 0 1 0 5M16.5 14c2.3.3 3.6 1.9 4 4.5" /></svg>;
  }
  if (type === 'subject') {
    return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.8-4.5 3.3-7 7.5-7s6.7 2.5 7.5 7" /></svg>;
  }
  if (type === 'transaction') {
    return <svg {...common}><path d="M6 2.5h9l3 3V21H6z" /><path d="M15 2.5V6h3M9 10h6M9 13h3" /><circle cx="15.5" cy="16.5" r="3.5" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M8 12h8M12 8v8" /></svg>;
}

function SupportReferenceHero({
  title,
  eyebrow,
  subtitle,
  activeCase,
  onBack,
  icon,
  luna = false,
  status = '',
}) {
  return (
    <header
      className="sky-reference-tool-hero sky-support-reference-hero"
      data-luna={luna ? 'true' : 'false'}
    >
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
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {status ? (
          <div className="sky-reference-tool-case-line">
            <span>{activeCase?.id ?? 'No active case'}</span>
            <StatusChip>{status}</StatusChip>
          </div>
        ) : <span>{activeCase?.id ?? 'No active case'}</span>}
      </div>
      {luna ? (
        <div className="sky-reference-tool-luna" aria-hidden="true">
          <img src="/assets/luna-sky-vector-v1.svg" alt="" />
          <i aria-hidden="true">♥</i>
        </div>
      ) : null}
    </header>
  );
}

function linkPinRecord(result, match) {
  const pinValue = formatLinkAnalysisPin({
    identifierType: result.identifierType,
    value: result.searchedIdentifier,
    accountId: match.accountId,
  });
  return {
    id: pinValue,
    label: pinValue,
    detail: match.relationshipToCurrentCase,
    pinPayload: {
      id: pinValue,
      label: pinValue,
      value: result.searchedIdentifier,
      recordId: match.accountId,
      sourceRecordId: match.identifier?.sourceRecordId ?? match.accountId,
      query: result.searchedIdentifier,
      identifierType: result.identifierType,
      accountId: match.accountId,
      detail: match.relationshipToCurrentCase,
    },
  };
}

function LinkRelationshipMap({ result, selected, onSelect }) {
  const matches = result.matches.slice(0, 5);
  const endpoints = [
    [14, 20],
    [86, 20],
    [12, 76],
    [88, 76],
    [50, 93],
  ];

  return (
    <section className="sky-link-reference-map" aria-label="Exact matched-account relationship map">
      <div className="sky-link-reference-map-canvas" data-count={matches.length}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {matches.map((match, index) => (
            <g key={`${match.accountId}-line`}>
              <line x1="50" y1="50" x2={endpoints[index][0]} y2={endpoints[index][1]} />
              <circle
                cx={(50 + endpoints[index][0]) / 2}
                cy={(50 + endpoints[index][1]) / 2}
                r="1.1"
              />
            </g>
          ))}
        </svg>
        <article className="sky-link-reference-center">
          <span aria-hidden="true"><SupportGlyph type={result.identifierType} size={25} /></span>
          <small>{result.identifierTypeLabel}</small>
          <strong>{result.searchedIdentifier}</strong>
          <em>{result.summary.total} exact account match{result.summary.total === 1 ? '' : 'es'}</em>
        </article>
        {matches.map((match, index) => (
          <button
            className="sky-link-reference-node"
            type="button"
            data-slot={index + 1}
            key={`${match.accountId}-${match.identifierType}`}
            onClick={() => onSelect(match)}
            aria-pressed={selected?.accountId === match.accountId}
          >
            <span aria-hidden="true"><SupportGlyph type="subject" size={19} /></span>
            <strong>{match.customerName}</strong>
            <small>{match.accountId}</small>
            <em>{match.productType}</em>
          </button>
        ))}
        {!matches.length ? (
          <div className="sky-link-reference-map-empty">No exact account node was returned.</div>
        ) : null}
      </div>
      {result.matches.length > 5 ? (
        <p>{result.matches.length - 5} additional exact account match{result.matches.length - 5 === 1 ? '' : 'es'} appear in the list below.</p>
      ) : null}
    </section>
  );
}

function timelineDisplayParts(value, fallbackDate) {
  const raw = clean(value) || 'Time not supplied';
  const timeOnly = /^\d{1,2}:\d{2}\s*[AP]M$/i.test(raw);
  const normalized = raw.replace(/\s+[·-]\s+/, ' ');
  const parsed = new Date(timeOnly ? `${fallbackDate} ${raw}` : normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return {
      key: `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`,
      date: new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(parsed),
      time: timeOnly || /\d{1,2}:\d{2}/.test(raw)
        ? new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          }).format(parsed)
        : 'Date recorded',
    };
  }
  const [datePart, timePart] = raw.split(/\s+·\s+/);
  return {
    key: datePart || 'Recorded date',
    date: datePart || 'Recorded date',
    time: timePart || raw,
  };
}

function groupTimelineRows(rows, fallbackDate) {
  const groups = [];
  const byKey = new Map();
  rows.forEach((row) => {
    const display = row.displayDate
      ? {
          key: row.displayDate,
          date: row.displayDate,
          time: row.displayTime || 'Date recorded',
        }
      : timelineDisplayParts(row.values[1], fallbackDate);
    const event = { row, display };
    if (!byKey.has(display.key)) {
      const group = { key: display.key, label: display.date, events: [] };
      byKey.set(display.key, group);
      groups.push(group);
    }
    byKey.get(display.key).events.push(event);
  });
  return groups;
}

function timelineIconName(source = '') {
  if (/transaction|payment|merchant/i.test(source)) return 'payment';
  if (/login|session|device|ip/i.test(source)) return 'channel';
  if (/document/i.test(source)) return 'evidence';
  if (/customer|profile/i.test(source)) return 'user';
  return 'sparkle';
}

function toolActions(props, tool, record) {
  return (
    <EvidenceActions
      tool={tool}
      record={record}
      onPin={props.onPin}
      onSaveNote={props.onSaveNote}
      onMarkReviewed={props.onMarkReviewed}
      reviewed={props.completedTools?.includes(tool)}
    />
  );
}

function TimelineSelectedDetail({ props, timeline, row }) {
  return (
    <div className="sky-timeline-reference-inline-detail">
      <header>
        <div>
          <small>{row.label}</small>
          <strong>{row.values[2]}</strong>
        </div>
        <StatusChip>{row.values[3]}</StatusChip>
      </header>
      <DataList rows={timeline.columns.map((column, index) => [column, row.values[index]])} />
      {toolActions(props, 'Timeline', {
        id: row.id,
        label: `${row.values[1]} — ${row.values[2]}`,
        detail: row.values[6],
      })}
    </div>
  );
}

export function LinkAnalysisTool(props) {
  const {
    activeCase,
    cases = [],
    query: routedQuery = '',
    initialPayload = null,
  } = props;
  const prefilledQuery = clean(initialPayload?.query ?? routedQuery);
  const prefilledType = clean(initialPayload?.identifierType);
  const [query, setQuery] = useState(prefilledQuery);
  const [type, setType] = useState(prefilledType);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const [hasRun, setHasRun] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const knownIdentifiers = useMemo(
    () => getLinkIdentifiersForCase(activeCase),
    [activeCase],
  );
  const availableTypes = useMemo(
    () => new Set(knownIdentifiers.map((item) => item.type)),
    [knownIdentifiers],
  );

  useEffect(() => {
    setQuery(prefilledQuery);
    setType(prefilledType);
    setResult(null);
    setSelected(null);
    setHasRun(false);
    setShowAll(false);
  }, [activeCase?.id, prefilledQuery, prefilledType]);

  function clearResult() {
    setResult(null);
    setSelected(null);
    setHasRun(false);
    setShowAll(false);
  }

  function runSearch(event) {
    event?.preventDefault();
    const next = searchLinkRelationships({
      query: query.trim(),
      identifierType: type,
      cases,
      activeCase,
    });
    setResult(next);
    setSelected(null);
    setHasRun(true);
    setShowAll(false);
    props.onAction?.(
      'Ran exact link search',
      `${next.identifierTypeLabel}: ${next.searchedIdentifier || 'empty query'}`,
      'Link Analysis',
    );
  }

  const visibleMatches = result
    ? (showAll ? result.matches : result.matches.slice(0, 3))
    : [];
  const currentMatches = result?.matches.filter((match) => match.currentCase).length ?? 0;

  return (
    <section
      className="sky-main sky-reference-tool-page sky-support-reference-page sky-link-reference-page"
      data-reference-layout="sky-link-reference-v1"
      data-case-id={activeCase?.id ?? ''}
    >
      <SupportReferenceHero
        title="Link Analysis"
        eyebrow="Connections · Exact records"
        subtitle="Search one identifier and inspect only its source-backed account relationships."
        activeCase={activeCase}
        onBack={props.onBackToWorkspace}
        icon="workspace"
      />

      <div className="sky-grid">
        <SkyCard
          className="span-12 sky-reference-search sky-link-reference-search"
          tone="pink"
          shape="ribbon"
          sparkle
        >
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="sparkle" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Search one exact identifier</strong>
              <p>Results show stored exact matches only. A shared identifier is evidence, not a case outcome.</p>
            </div>
          </header>
        <form
            className="sky-link-reference-form"
            onSubmit={runSearch}
            noValidate
        >
            <label>
            <span>Identifier type</span>
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                  clearResult();
              }}
            >
              <option value="">Infer from exact value</option>
                {linkIdentifierTypes.map((item) => (
                  <option value={item.id} key={item.id} disabled={!availableTypes.has(item.id)}>
                    {item.label}
                </option>
              ))}
            </select>
          </label>
            <label>
            <span>Exact identifier</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                  clearResult();
              }}
              placeholder="Enter a complete Training ID, device ID, IP, Bank Code…"
                aria-label="Exact Link Analysis identifier"
                autoComplete="off"
            />
          </label>
            <button className="sky-button" type="submit" disabled={!query.trim()}>
              <SkyIcon name="workspace" size={18} />
              Run exact search
            </button>
        </form>
          {prefilledQuery && !hasRun ? (
            <div className="sky-reference-search-message" role="status">
              The routed identifier is ready. Run the exact search to reveal relationships.
            </div>
          ) : null}
        </SkyCard>

        {!hasRun ? (
          <SkyCard className="span-12 sky-support-reference-locked" shape="notched">
            <SkyIcon name="workspace" size={23} />
            <div>
              <strong>Account relationships are hidden</strong>
              <p>Choose a type or allow exact-value inference, enter the complete identifier, and run the search.</p>
            </div>
          </SkyCard>
        ) : null}

        {result ? (
          <>
            <SkyCard
              className="span-12 sky-link-reference-focus"
              shape="shield"
              sparkle
            >
              <span className="sky-link-reference-focus-icon" aria-hidden="true">
                <SupportGlyph type={result.identifierType} size={25} />
              </span>
              <div>
                <small>Searched {result.identifierTypeLabel}</small>
                <h2>{result.searchedIdentifier}</h2>
                <p>{result.message}. Only exact typed matches are displayed.</p>
              </div>
              <strong>{result.summary.exact}</strong>
            </SkyCard>

            <SkyCard
              className="span-12 sky-link-reference-graph-card"
              shape="ribbon"
              sparkle
            >
              <header className="sky-link-reference-section-heading">
                <div>
                  <small>Relationship map</small>
                  <h2>Exact account connections</h2>
                  <p>Select a node or matched-account row to inspect the same relationship.</p>
                </div>
                <span>{result.summary.total} link{result.summary.total === 1 ? '' : 's'}</span>
              </header>
              <LinkRelationshipMap
                result={result}
                selected={selected}
                onSelect={setSelected}
              />
            </SkyCard>

            <SkyCard
              className="span-12 sky-link-reference-accounts"
              tone="pink"
              shape="notched"
              sparkle
            >
              <header className="sky-link-reference-section-heading">
                <div>
                  <small>Matched accounts</small>
                  <h2>Source-backed exact matches</h2>
                  <p>Operational account facts do not determine the active case.</p>
                </div>
                {result.matches.length > 3 ? (
                  <button
                    type="button"
                    className="sky-button-secondary"
                    onClick={() => setShowAll((current) => !current)}
                  >
                    {showAll ? 'Show first 3' : `View all ${result.matches.length}`}
                  </button>
                ) : null}
              </header>
              <div className="sky-link-reference-account-list">
                {visibleMatches.map((match, index) => (
                  <button
                    type="button"
                    key={`${match.accountId}-${match.identifierType}`}
                    data-accent={index % 2 ? 'pink' : 'blue'}
                    aria-pressed={selected?.accountId === match.accountId}
                    onClick={() => setSelected(match)}
                  >
                    <span aria-hidden="true"><SupportGlyph type="subject" size={20} /></span>
                    <span>
                      <small>{match.accountId} · {match.productType}</small>
                      <strong>{match.customerName}</strong>
                      <em>{match.relationshipToCurrentCase}</em>
                    </span>
                    <span>
                      <small>Account status</small>
                      <strong>{match.status ?? 'Not supplied'}</strong>
                    </span>
                    <i aria-hidden="true">›</i>
                  </button>
                ))}
                {!result.matches.length ? (
                  <div className="sky-empty">No exact stored account match was returned.</div>
                ) : null}
              </div>
            </SkyCard>

            {selected ? (
              <SkyCard
                className="span-12 sky-link-reference-detail"
                shape="ribbon"
                sparkle
              >
                <SectionHeading
                  eyebrow="Selected account relationship"
                  title={selected.accountId}
                  description={selected.investigativeNote}
                  action={<StatusChip>{selected.currentCase ? 'Current account' : 'Linked account'}</StatusChip>}
                />
                <DataList rows={[
                  ['Customer / business', selected.customerName],
                  ['Product', selected.productType],
                  ['Account status', selected.status ?? 'Not supplied'],
                  ['Exact identifier', selected.exactSharedIdentifier],
                  ['Relationship', selected.relationshipToCurrentCase],
                  ['Source', selected.identifier?.source],
                  ['Source record', selected.identifier?.sourceRecordId],
                  ['First use', selected.identifier?.firstUse],
                  ['Last use', selected.identifier?.lastUse],
                  ['Status context', selected.statusExplanation],
                ]} />
                {toolActions(props, 'Link Analysis', linkPinRecord(result, selected))}
              </SkyCard>
            ) : null}

            <SkyCard
              className="span-12 sky-link-reference-summary"
              tone="pink"
              shape="shield"
              sparkle
            >
              <header>
                <span aria-hidden="true"><SkyIcon name="shield" size={24} /></span>
                <div>
                  <small>Exact links summary</small>
                  <h2>Recorded relationships only</h2>
                </div>
              </header>
              <div className="sky-link-reference-summary-metrics">
                <article><strong>{result.summary.exact}</strong><span>Exact matches</span></article>
                <article><strong>{currentMatches}</strong><span>Current account</span></article>
                <article><strong>{result.summary.relatedCases}</strong><span>Related cases</span></article>
                <article><strong>{result.summary.restricted}</strong><span>Restricted / closed</span></article>
              </div>
              <p>A shared identifier is evidence for review. It does not label the current case or choose a determination.</p>
          </SkyCard>
          </>
        ) : null}
      </div>
    </section>
  );
}

export function SystemAccessTool(props) {
  const {
    activeCase,
    query: routedQuery = '',
    initialPayload = null,
  } = props;
  const records = useMemo(() => getSystemAccessRecords(activeCase), [activeCase]);
  const prefilledQuery = clean(initialPayload?.query ?? routedQuery);
  const [query, setQuery] = useState(prefilledQuery);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [ran, setRan] = useState(false);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const matches = useMemo(
    () => (ran
      ? sortSystemAccessRecords(searchSystemAccessRecords(records, submittedQuery))
      : []),
    [ran, records, submittedQuery],
  );
  const summary = useMemo(() => buildSystemAccessSummary(matches), [matches]);
  const latestDisplay = timelineDisplayParts(
    summary.latestObserved,
    activeCase?.reportedDate ?? activeCase?.opened ?? 'Training date',
  );

  useEffect(() => {
    setQuery(prefilledQuery);
    setSubmittedQuery('');
    setRan(false);
    setSelected(null);
    setError('');
  }, [activeCase?.id, prefilledQuery]);

  function clearResult() {
    setRan(false);
    setSelected(null);
    setError('');
  }

  function runSystemAccessSearch(event) {
    event.preventDefault();
    const exactQuery = query.trim();
    if (!exactQuery) {
      setError('Enter a record ID, actor, object, lane, status, or event.');
      setRan(false);
      setSelected(null);
      return;
    }
    setSubmittedQuery(exactQuery);
    setRan(true);
    setSelected(null);
    setError('');
    props.onAction?.(
      'Ran system access search',
      exactQuery,
      'System Access Lane',
    );
  }

  return (
    <section
      className="sky-main sky-reference-tool-page sky-support-reference-page sky-system-access-page"
      data-reference-layout="sky-system-access-v1"
      data-case-id={activeCase?.id ?? ''}
    >
      <SupportReferenceHero
        title="System Access Lane"
        eyebrow="Audit trail · Supplied records"
        subtitle="Search the case access sources, then open one recorded event and review its exact context."
        activeCase={activeCase}
        onBack={props.onBackToWorkspace}
        icon="shield"
        luna
        status={ran ? `${matches.length} matched` : 'Search required'}
      />

      <div className="sky-grid">
        <SkyCard
          className="span-12 sky-reference-search sky-system-access-search"
          shape="ribbon"
          sparkle
        >
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="search" size={20} /></span>
            <div>
              <small>Run before reveal</small>
              <strong>Find a supplied access event</strong>
              <p>Search by exact record ID or a source-backed actor, object, lane, status, or event term.</p>
            </div>
          </header>
          <form
            className="sky-system-access-search-form"
            onSubmit={runSystemAccessSearch}
            noValidate
          >
            <label>
              <span>Search System Access Lane</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  clearResult();
                }}
                placeholder="Record ID, actor, object, lane, status, or event"
                aria-label="Search System Access Lane"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit" aria-label="Run access search">
              <SkyIcon name="search" size={18} />
              Run access search
            </button>
          </form>
          {error ? <p className="sky-system-access-error" role="alert">{error}</p> : null}
          <div className="sky-system-access-search-status" role="status">
            <span>{ran ? `${matches.length} matching event${matches.length === 1 ? '' : 's'}` : 'Access events are hidden'}</span>
            <small>{ran ? `Search: ${submittedQuery}` : 'Run the search to reveal supplied records'}</small>
          </div>
        </SkyCard>

        {!ran ? (
          <SkyCard className="span-12 sky-support-reference-locked" shape="notched">
            <SkyIcon name="shield" size={23} />
            <div>
              <strong>System access records are hidden</strong>
              <p>Run a case-scoped search to reveal only the matching supplied events. No outcome is inferred before review.</p>
            </div>
          </SkyCard>
        ) : null}

        {ran && matches.length ? (
          <>
            <section className="span-12 sky-system-access-summary" aria-label="System access summary">
              <article data-tone="cyan">
                <span aria-hidden="true"><SkyIcon name="network" size={21} /></span>
                <strong>{summary.total}</strong>
                <small>Matching events</small>
                <em>Supplied records</em>
              </article>
              <article data-tone="pink">
                <span aria-hidden="true"><SkyIcon name="shield" size={21} /></span>
                <strong>{summary.lanes}</strong>
                <small>Recorded lanes</small>
                <em>Distinct source types</em>
              </article>
              <article data-tone="violet">
                <span aria-hidden="true"><SkyIcon name="user" size={21} /></span>
                <strong>{summary.actors}</strong>
                <small>Recorded actors</small>
                <em>Distinct supplied names</em>
              </article>
              <article data-tone="blue">
                <span aria-hidden="true"><SkyIcon name="clock" size={21} /></span>
                <strong>{latestDisplay.time}</strong>
                <small>Latest matched record</small>
                <em>{latestDisplay.date}</em>
              </article>
            </section>

            <section className="span-12 sky-system-access-lane" aria-label="Matching system access events">
              {matches.map((record, index) => {
                const display = timelineDisplayParts(
                  record.observed,
                  activeCase?.reportedDate ?? activeCase?.opened ?? 'Training date',
                );
                const selectedRecord = selected?.id === record.id;
                const icon = /vendor|device/i.test(`${record.lane} ${record.actor}`)
                  ? 'device'
                  : /internal|workspace|queue/i.test(`${record.lane} ${record.actor}`)
                    ? 'user'
                    : /audit/i.test(record.lane)
                      ? 'shield'
                      : 'network';
                return (
                  <article
                    className="sky-system-access-event"
                    data-accent={index % 4 === 1 ? 'violet' : index % 4 === 2 ? 'pink' : index % 4 === 3 ? 'amber' : 'cyan'}
                    data-selected={selectedRecord || undefined}
                    key={record.id}
                  >
                    <time>
                      <strong>{display.time}</strong>
                      <span>{display.date}</span>
                    </time>
                    <span className="sky-system-access-dot" aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => setSelected(selectedRecord ? null : record)}
                      aria-pressed={selectedRecord}
                      aria-label={`Open system access record ${record.id}`}
                    >
                      <i aria-hidden="true"><SkyIcon name={icon} size={22} /></i>
                      <span>
                        <small>{record.id} · {record.lane}</small>
                        <strong>{record.event}</strong>
                        <em>{record.actor}</em>
                        <b>{record.object}</b>
                      </span>
                      <StatusChip>{record.status}</StatusChip>
                      <SkyIcon name="arrow" size={17} />
                    </button>
                    {selectedRecord ? (
                      <div className="sky-system-access-detail">
                        <header>
                          <div>
                            <small>Selected supplied record</small>
                            <strong>{record.id}</strong>
                          </div>
                          <StatusChip>{record.status}</StatusChip>
                        </header>
                        <DataList rows={[
                          ['Lane', record.lane],
                          ['Actor', record.actor],
                          ['Event', record.event],
                          ['Object', record.object],
                          ['Observed', record.observed],
                          ['Context', record.context],
                        ]} />
                        {toolActions(props, 'System Access Lane', {
                          ...record,
                          label: `${record.id} · ${record.event}`,
                          detail: record.context,
                          pinPayload: {
                            id: record.id,
                            label: 'System Access Record ID',
                            value: record.id,
                            query: record.id,
                            sourceRecordId: record.id,
                            identifierType: 'system-access-record-id',
                            detail: record.context,
                          },
                        })}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          </>
        ) : null}

        {ran && !matches.length ? (
          <SkyCard className="span-12 sky-system-access-empty" tone="pink" shape="shield">
            <SkyIcon name="search" size={25} />
            <div>
              <strong>No supplied access event matched</strong>
              <p>Check the record ID or try another actor, object, lane, status, or event term. An empty result does not establish a finding.</p>
            </div>
          </SkyCard>
        ) : null}
      </div>
    </section>
  );
}

export function TimelineTool(props) {
  const {
    activeCase,
    query: routedQuery = '',
    initialPayload = null,
  } = props;
  const prefilledQuery = clean(initialPayload?.query ?? routedQuery);
  const prefilledSource = clean(initialPayload?.source) || 'All';
  const timeline = useMemo(
    () => buildCoreToolRecords('Timeline', activeCase) ?? { columns: [], rows: [] },
    [activeCase],
  );
  const [query, setQuery] = useState(prefilledQuery);
  const [source, setSource] = useState(prefilledSource);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [submittedSource, setSubmittedSource] = useState('All');
  const [ran, setRan] = useState(false);
  const [selected, setSelected] = useState(null);
  const allRows = useMemo(
    () => [
      ...(timeline.rows ?? []),
      ...(timeline.scheduledRows ?? []),
      ...(timeline.undatedRows ?? []),
    ],
    [timeline],
  );
  const sources = useMemo(
    () => ['All', ...new Set(allRows.map((row) => row.values[3]).filter(Boolean))],
    [allRows],
  );
  const rows = ran
    ? allRows.filter((row) => {
        const matchesSource = submittedSource === 'All' || row.values[3] === submittedSource;
        const matchesQuery = !submittedQuery.trim()
          || row.values.join(' ').toLowerCase().includes(submittedQuery.trim().toLowerCase());
        return matchesSource && matchesQuery;
      })
    : [];
  const occurredRows = rows.filter((row) => !['scheduled', 'undated'].includes(row.temporalKind));
  const scheduledRows = rows.filter((row) => row.temporalKind === 'scheduled');
  const undatedRows = rows.filter((row) => row.temporalKind === 'undated');
  const fallbackDate = activeCase.reportedDate ?? activeCase.opened ?? 'Training date';
  const groups = useMemo(
    () => groupTimelineRows(occurredRows, fallbackDate),
    [fallbackDate, occurredRows],
  );

  useEffect(() => {
    setQuery(prefilledQuery);
    setSource(sources.includes(prefilledSource) ? prefilledSource : 'All');
    setSubmittedQuery('');
    setSubmittedSource('All');
    setRan(false);
    setSelected(null);
  }, [activeCase?.id, prefilledQuery, prefilledSource, sources]);

  function clearTimelineResult() {
    setRan(false);
    setSelected(null);
  }

  function runTimelineSearch(event) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setSubmittedSource(source);
    setRan(true);
    setSelected(null);
    props.onAction?.(
      'Ran timeline search',
      `${source} source · ${query.trim() || 'all supplied events'}`,
      'Timeline',
    );
  }

  return (
    <section
      className="sky-main sky-reference-tool-page sky-support-reference-page sky-timeline-reference-page"
      data-reference-layout="sky-timeline-reference-v1"
      data-case-id={activeCase?.id ?? ''}
    >
      <SupportReferenceHero
        title="Timeline"
        eyebrow="Sequence · Supplied records"
        subtitle="Filter and run the case timeline, then open one event and cite its exact source."
        activeCase={activeCase}
        onBack={props.onBackToWorkspace}
        icon="calendar"
        luna
      />

      <div className="sky-grid">
        <SkyCard
          className="span-12 sky-reference-search sky-timeline-reference-search"
          shape="ribbon"
          sparkle
        >
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="calendar" size={20} /></span>
            <div>
              <small>Run before reveal</small>
              <strong>Put the recorded sequence in order</strong>
              <p>Choose a source or search term, run the timeline, then open an event and cite its timestamp.</p>
            </div>
          </header>
          <form className="sky-timeline-reference-form" onSubmit={runTimelineSearch} noValidate>
            <label className="sky-timeline-reference-query">
              <span>Search timeline</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  clearTimelineResult();
                }}
                placeholder="Event, object, date, source, or ID"
                aria-label="Search timeline"
                autoComplete="off"
              />
            </label>
            <label>
              <span>Source</span>
              <select
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  clearTimelineResult();
                }}
                aria-label="Timeline source"
              >
                {sources.map((item) => <option value={item} key={item}>{item}</option>)}
              </select>
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="calendar" size={18} />
              Run timeline
            </button>
          </form>
          <div className="sky-timeline-reference-search-status" role="status">
            <span>{ran ? `${rows.length} matched event${rows.length === 1 ? '' : 's'}` : 'Timeline events are hidden'}</span>
            <small>{ran ? `${submittedSource} source filter` : 'Run the search to reveal supplied events'}</small>
          </div>
        </SkyCard>

        {!ran ? (
          <SkyCard className="span-12 sky-support-reference-locked" shape="notched">
            <SkyIcon name="calendar" size={23} />
            <div>
              <strong>Timeline rows are hidden</strong>
              <p>Search text is optional. Choose a source or All, then run the timeline to reveal the supplied sequence.</p>
            </div>
          </SkyCard>
        ) : null}

        {ran && occurredRows.length ? (
          <section className="span-12 sky-timeline-reference" aria-label="Case timeline events">
            {groups.map((group) => (
              <section className="sky-timeline-reference-group" key={group.key}>
                <header>
                  <strong>{group.label}</strong>
                  <span>{group.events.length} event{group.events.length === 1 ? '' : 's'}</span>
                </header>
                <div>
                  {group.events.map(({ row, display }, index) => (
                    <article
                      className="sky-timeline-reference-event"
                      data-accent={index % 3 === 1 ? 'pink' : index % 3 === 2 ? 'violet' : 'blue'}
                      data-selected={selected?.id === row.id || undefined}
                      key={row.id}
                    >
                      <time>{display.time}</time>
                      <span className="sky-timeline-reference-dot" aria-hidden="true" />
                      <button
                        type="button"
                        onClick={() => setSelected(row)}
                        aria-pressed={selected?.id === row.id}
                      >
                        <span>
                          <small>{row.values[3]}</small>
                          <strong>{row.values[2]}</strong>
                          <em>{row.values[4]} · {row.values[6]}</em>
                        </span>
                        <i aria-hidden="true">
                          <SkyIcon name={timelineIconName(row.values[3])} size={22} />
                        </i>
                      </button>
                      {selected?.id === row.id ? (
                        <TimelineSelectedDetail props={props} timeline={timeline} row={row} />
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </section>
        ) : null}

        {ran && scheduledRows.length ? (
          <SkyCard
            className="span-12 sky-timeline-reference-supplement"
            shape="notched"
            sparkle
          >
            <SectionHeading
              eyebrow="Scheduled records"
              title="Upcoming supplied dates"
              description="These source-backed dates are shown separately from events that already occurred."
            />
            <div className="sky-timeline-reference-supplement-list">
              {scheduledRows.map((row) => (
                <article key={row.id} data-selected={selected?.id === row.id || undefined}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    aria-pressed={selected?.id === row.id}
                  >
                    <span aria-hidden="true">
                      <SkyIcon name={timelineIconName(row.values[3])} size={20} />
                    </span>
                    <span>
                      <small>{row.values[1]} · {row.values[3]}</small>
                      <strong>{row.values[2]}</strong>
                      <em>{row.values[4]} · {row.values[6]}</em>
                    </span>
                  </button>
                  {selected?.id === row.id ? (
                    <TimelineSelectedDetail props={props} timeline={timeline} row={row} />
                  ) : null}
                </article>
              ))}
            </div>
          </SkyCard>
        ) : null}

        {ran && undatedRows.length ? (
          <SkyCard
            className="span-12 sky-timeline-reference-supplement"
            tone="pink"
            shape="shield"
            sparkle
          >
            <SectionHeading
              eyebrow="Undated records"
              title="Recorded without an event timestamp"
              description="These source records remain available for review but are not placed on the chronological rail."
            />
            <div className="sky-timeline-reference-supplement-list">
              {undatedRows.map((row) => (
                <article key={row.id} data-selected={selected?.id === row.id || undefined}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    aria-pressed={selected?.id === row.id}
                  >
                    <span aria-hidden="true">
                      <SkyIcon name={timelineIconName(row.values[3])} size={20} />
                    </span>
                    <span>
                      <small>{row.values[1]} · {row.values[3]}</small>
                      <strong>{row.values[2]}</strong>
                      <em>{row.values[4]} · {row.values[6]}</em>
                    </span>
                  </button>
                  {selected?.id === row.id ? (
                    <TimelineSelectedDetail props={props} timeline={timeline} row={row} />
                  ) : null}
                </article>
              ))}
            </div>
          </SkyCard>
        ) : null}

        {ran && !rows.length ? (
          <SkyCard className="span-12 sky-timeline-reference-empty" tone="pink" shape="shield">
            <SkyIcon name="calendar" size={25} />
            <div>
              <strong>No timeline event matched</strong>
              <p>Adjust the source or search term and run the timeline again. No conclusion is inferred from an empty result.</p>
            </div>
          </SkyCard>
        ) : null}
      </div>
    </section>
  );
}

export function SupportToolRouter({ toolName, ...props }) {
  if (toolName === 'Link Analysis') return <LinkAnalysisTool {...props} />;
  if (toolName === 'System Access Lane') return <SystemAccessTool {...props} />;
  if (toolName === 'Timeline') return <TimelineTool {...props} />;
  return null;
}

export const supportToolNames = new Set(['Link Analysis', 'System Access Lane', 'Timeline']);
