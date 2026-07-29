import { useMemo, useState } from 'react';
import {
  getLinkIdentifiersForCase,
  searchLinkRelationships,
} from '../data/linkAnalysisRecords.js';
import { getSystemAccessRecords } from '../data/systemAccessRecords.js';
import { buildCoreToolRecords } from '../data/coreToolRecords.js';
import {
  DataList,
  EvidenceActions,
  RecordList,
  SectionHeading,
  SkyCard,
  StatusChip,
} from '../components/SkyPrimitives.jsx';

const linkTypes = [
  ['training-id', 'Training ID'],
  ['account-id', 'Account ID'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['device', 'Device ID'],
  ['ip', 'IP address'],
  ['bank-code', 'Bank Code'],
  ['destination-id', 'Destination ID'],
];

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

export function LinkAnalysisTool(props) {
  const { activeCase, cases = [] } = props;
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState(null);
  const knownIdentifiers = getLinkIdentifiersForCase(activeCase);
  const availableTypes = new Set(knownIdentifiers.map((item) => item.type));

  function runSearch() {
    const next = searchLinkRelationships({
      query: query.trim(),
      identifierType: type,
      cases,
      activeCase,
    });
    setResult(next);
    setSelected(null);
    props.onAction?.(
      'Ran exact link search',
      `${next.identifierTypeLabel}: ${next.searchedIdentifier || 'empty query'}`,
      'Link Analysis',
    );
  }

  return (
    <>
      <SkyCard tone="pink">
        <SectionHeading
          eyebrow="Link analysis"
          title="Search one exact identifier"
          description="Results show stored exact matches only. A shared identifier is evidence, not a case outcome."
        />
        <form
          className="sky-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
        >
          <label className="sky-field">
            <span>Identifier type</span>
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setResult(null);
                setSelected(null);
              }}
            >
              <option value="">Infer from exact value</option>
              {linkTypes.map(([value, label]) => (
                <option value={value} key={value} disabled={!availableTypes.has(value)}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="sky-field wide">
            <span>Exact identifier</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResult(null);
                setSelected(null);
              }}
              placeholder="Enter a complete Training ID, device ID, IP, Bank Code…"
            />
          </label>
          <button className="sky-button" type="submit" disabled={!query.trim()}>
            Run exact search
          </button>
        </form>
      </SkyCard>

      {result ? (
        <div className="sky-grid">
          <SkyCard className="span-5">
            <SectionHeading
              eyebrow="Search results"
              title={result.message}
              description={result.searchedIdentifier}
              action={<StatusChip>{result.summary.exact} exact</StatusChip>}
            />
            <RecordList
              records={result.matches}
              selectedId={selected?.accountId}
              getId={(record) => record.accountId}
              getTitle={(record) => record.customerName}
              getSubtitle={(record) => `${record.accountId} · ${record.status}`}
              onSelect={setSelected}
              empty="No exact stored matches were returned."
            />
          </SkyCard>
          <SkyCard className="span-7" tone="pink">
            <SectionHeading
              eyebrow="Account relationship"
              title={selected ? selected.accountId : 'Choose a result'}
              description={selected?.investigativeNote ?? 'Open a matched account to review the recorded relationship.'}
            />
            {selected ? (
              <>
                <DataList rows={[
                  ['Customer / business', selected.customerName],
                  ['Product', selected.productType],
                  ['Operational status', selected.status],
                  ['Exact identifier', selected.exactSharedIdentifier],
                  ['Relationship', selected.relationshipToCurrentCase],
                  ['Source', selected.identifier?.source],
                  ['First use', selected.identifier?.firstUse],
                  ['Last use', selected.identifier?.lastUse],
                ]} />
                {toolActions(props, 'Link Analysis', {
                  id: `${selected.accountId}:${selected.exactSharedIdentifier}`,
                  label: `${selected.accountId} exact link`,
                  detail: selected.relationshipToCurrentCase,
                })}
              </>
            ) : <div className="sky-empty">No result selected.</div>}
          </SkyCard>
        </div>
      ) : null}
    </>
  );
}

export function SystemAccessTool(props) {
  const { activeCase } = props;
  const records = useMemo(() => getSystemAccessRecords(activeCase), [activeCase]);
  const [query, setQuery] = useState('');
  const [ran, setRan] = useState(false);
  const [selected, setSelected] = useState(null);
  const matches = ran
    ? records.filter((record) => [
      record.id,
      record.actor,
      record.event,
      record.object,
      record.lane,
    ].some((value) => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())))
    : [];

  return (
    <div className="sky-grid">
      <SkyCard className="span-5">
        <SectionHeading
          eyebrow="System access lane"
          title="Find recorded system activity"
          description="Search the case audit sources. System events do not assign a finding."
        />
        <form
          className="sky-search-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setRan(true);
            setSelected(null);
          }}
        >
          <label className="sky-field wide">
            <span>Record ID, actor, object, or lane</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRan(false);
                setSelected(null);
              }}
              placeholder="Enter an exact record ID or search term"
            />
          </label>
          <button className="sky-button" type="submit" disabled={!query.trim()}>Run search</button>
        </form>
        {ran ? (
          <RecordList
            records={matches}
            selectedId={selected?.id}
            getTitle={(record) => record.event}
            getSubtitle={(record) => `${record.id} · ${record.lane}`}
            onSelect={setSelected}
          />
        ) : null}
      </SkyCard>
      <SkyCard className="span-7" tone="pink">
        <SectionHeading
          eyebrow="System record"
          title={selected?.id ?? 'Run a search'}
          description="Open one result to inspect the recorded actor, object, and event."
        />
        {selected ? (
          <>
            <DataList rows={[
              ['Lane', selected.lane],
              ['Actor', selected.actor],
              ['Event', selected.event],
              ['Object', selected.object],
              ['Observed', selected.observed],
              ['Status', selected.status],
              ['Context', selected.context],
            ]} />
            {toolActions(props, 'System Access Lane', selected)}
          </>
        ) : <div className="sky-empty">System details remain hidden until you run and open a search result.</div>}
      </SkyCard>
    </div>
  );
}

export function TimelineTool(props) {
  const { activeCase } = props;
  const timeline = useMemo(
    () => buildCoreToolRecords('Timeline', activeCase) ?? { columns: [], rows: [] },
    [activeCase],
  );
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('All');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [submittedSource, setSubmittedSource] = useState('All');
  const [ran, setRan] = useState(false);
  const [selected, setSelected] = useState(null);
  const sources = ['All', ...new Set(timeline.rows.map((row) => row.values[3]).filter(Boolean))];
  const rows = ran
    ? timeline.rows.filter((row) => {
        const matchesSource = submittedSource === 'All' || row.values[3] === submittedSource;
        const matchesQuery = !submittedQuery.trim()
          || row.values.join(' ').toLowerCase().includes(submittedQuery.trim().toLowerCase());
        return matchesSource && matchesQuery;
      })
    : [];

  return (
    <>
      <SkyCard>
        <SectionHeading
          eyebrow="Timeline"
          title="Put the recorded sequence in order"
          description="Choose a source or search term, run the timeline search, then open an event and cite its exact timestamp."
          action={<StatusChip>{ran ? `${rows.length} events` : 'Not run'}</StatusChip>}
        />
        <form
          className="sky-form-grid"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query);
            setSubmittedSource(source);
            setRan(true);
            setSelected(null);
          }}
        >
          <label className="sky-field wide">
            <span>Search timeline</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRan(false);
                setSelected(null);
              }}
              placeholder="Event, object, date, ID…"
            />
          </label>
          <label className="sky-field">
            <span>Source</span>
            <select
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                setRan(false);
                setSelected(null);
              }}
            >
              {sources.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <button className="sky-button" type="submit">Run timeline search</button>
        </form>
      </SkyCard>
      {ran ? (
        rows.length ? (
          <div className="sky-timeline">
            {rows.map((row) => (
              <article className="sky-timeline-event" key={row.id}>
                <span className="sky-timeline-dot" aria-hidden="true" />
                <button type="button" onClick={() => setSelected(row)}>
                  <small>{row.values[1]}</small>
                  <strong>{row.values[2]}</strong>
                  <span>{row.values[3]} · {row.values[4]}</span>
                </button>
              </article>
            ))}
          </div>
        ) : <div className="sky-empty">No timeline event matched the submitted search.</div>
      ) : <div className="sky-empty">Timeline rows remain hidden until you run the search.</div>}
      {selected ? (
        <SkyCard tone="pink">
          <SectionHeading
            eyebrow={selected.label}
            title={selected.values[2]}
            description={selected.values[1]}
          />
          <DataList rows={timeline.columns.map((column, index) => [column, selected.values[index]])} />
          {toolActions(props, 'Timeline', {
            id: selected.id,
            label: `${selected.values[1]} — ${selected.values[2]}`,
            detail: selected.values[6],
          })}
        </SkyCard>
      ) : null}
    </>
  );
}

export function SupportToolRouter({ toolName, ...props }) {
  if (toolName === 'Link Analysis') return <LinkAnalysisTool {...props} />;
  if (toolName === 'System Access Lane') return <SystemAccessTool {...props} />;
  if (toolName === 'Timeline') return <TimelineTool {...props} />;
  return null;
}

export const supportToolNames = new Set(['Link Analysis', 'System Access Lane', 'Timeline']);
