import { useMemo, useState } from 'react';

export function SkyCard({
  as: Element = 'section',
  tone,
  className = '',
  children,
  ...props
}) {
  return (
    <Element
      className={`sky-card ${className}`.trim()}
      data-tone={tone}
      {...props}
    >
      <div className="sky-card-inner">{children}</div>
    </Element>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  level = 2,
}) {
  const Heading = `h${level}`;
  return (
    <header className="sky-section-heading">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <Heading>{title}</Heading>
        {description ? <span>{description}</span> : null}
      </div>
      {action}
    </header>
  );
}

export function DataList({ rows = [], empty = 'No records are available.' }) {
  const normalized = rows
    .filter(Boolean)
    .map((row) => (Array.isArray(row)
      ? { label: row[0], value: row[1] }
      : row));
  if (!normalized.length) return <div className="sky-empty">{empty}</div>;
  return (
    <dl className="sky-data-list">
      {normalized.map((row, index) => (
        <div className="sky-data-row" key={`${row.label}-${index}`}>
          <dt>{row.label}</dt>
          <dd>{displayValue(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordList({
  records = [],
  selectedId,
  onSelect,
  getId = (record) => record.id,
  getTitle = (record) => record.title ?? record.label ?? record.name ?? record.id,
  getSubtitle = (record) => record.detail ?? record.status ?? '',
  empty = 'No matching records.',
}) {
  if (!records.length) return <div className="sky-empty">{empty}</div>;
  return (
    <div className="sky-record-list">
      {records.map((record, index) => {
        const id = String(getId(record) ?? index);
        return (
          <button
            className="sky-record"
            type="button"
            key={id}
            aria-current={selectedId === id ? 'true' : undefined}
            onClick={() => onSelect?.(record)}
          >
            <span>
              <strong>{getTitle(record)}</strong>
              {getSubtitle(record) ? <small>{getSubtitle(record)}</small> : null}
            </span>
            <span aria-hidden="true">›</span>
          </button>
        );
      })}
    </div>
  );
}

export function SearchPanel({
  label = 'Search',
  value,
  onChange,
  onRun,
  placeholder,
  hint,
  disabled,
  children,
}) {
  return (
    <form
      className="sky-search-panel"
      onSubmit={(event) => {
        event.preventDefault();
        onRun?.();
      }}
    >
      <label className="sky-field wide">
        <span>{label}</span>
        <input
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
      </label>
      {children}
      {hint ? <small className="sky-field-hint">{hint}</small> : null}
      <button className="sky-button" type="submit" disabled={disabled}>
        Run search
      </button>
    </form>
  );
}

export function EvidenceActions({
  tool,
  record,
  onPin,
  onSaveNote,
  onMarkReviewed,
  reviewed,
}) {
  const [note, setNote] = useState('');
  const pinPayload = useMemo(() => ({
    id: record?.id ?? `${tool}-workspace`,
    label: record?.title ?? record?.label ?? record?.name ?? record?.id ?? tool,
    detail: record?.detail ?? record?.summary ?? record?.status ?? 'Workspace reviewed',
    tool,
    sourceTool: tool,
  }), [record, tool]);

  return (
    <div className="sky-evidence-actions">
      <div className="sky-action-row">
        <button
          type="button"
          className="sky-button-secondary"
          onClick={() => onPin?.(pinPayload)}
        >
          Pin evidence
        </button>
        <button
          type="button"
          className="sky-button-secondary"
          onClick={() => onMarkReviewed?.(tool)}
          disabled={reviewed}
        >
          {reviewed ? 'Reviewed' : 'Mark reviewed'}
        </button>
      </div>
      <form
        className="sky-inline-note"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = note.trim();
          if (!clean) return;
          onSaveNote?.(clean, tool, record?.id);
          setNote('');
        }}
      >
        <label className="sky-field wide">
          <span>Evidence note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Record what this evidence supports, contradicts, or leaves unresolved."
          />
        </label>
        <button className="sky-button-secondary" type="submit" disabled={!note.trim()}>
          Save note
        </button>
      </form>
    </div>
  );
}

export function Tabs({ tabs = [], active, onChange }) {
  return (
    <div className="sky-tabs" role="tablist" aria-label="Workspace sections">
      {tabs.map((tab) => {
        const value = typeof tab === 'string' ? tab : tab.value;
        const label = typeof tab === 'string' ? tab : tab.label;
        return (
          <button
            type="button"
            className="sky-tab"
            role="tab"
            key={value}
            aria-selected={active === value}
            onClick={() => onChange?.(value)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusChip({ children, tone }) {
  return (
    <span className="sky-chip" data-tone={tone}>
      {children}
    </span>
  );
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="sky-empty sky-empty-state">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function objectRows(value, { omit = [] } = {}) {
  if (!value || typeof value !== 'object') return [];
  const omitted = new Set(omit);
  return Object.entries(value)
    .filter(([key, item]) => !omitted.has(key) && !isEmptyValue(item))
    .map(([key, item]) => [humanize(key), displayValue(item)]);
}

export function humanize(value = '') {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not supplied';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value.map((item) => (
      typeof item === 'object' ? displayValue(item) : String(item)
    )).join(' · ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, item]) => !isEmptyValue(item))
      .map(([key, item]) => `${humanize(key)}: ${displayValue(item)}`)
      .join(' · ');
  }
  return String(value);
}

function isEmptyValue(value) {
  return value === null
    || value === undefined
    || value === ''
    || (Array.isArray(value) && !value.length);
}
