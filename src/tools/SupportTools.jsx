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
                    t