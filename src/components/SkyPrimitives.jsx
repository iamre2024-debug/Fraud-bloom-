import { useMemo, useState } from 'react';

export function SkyCard({
  as: Element = 'section',
  tone,
  shape = 'soft',
  sparkle = false,
  charm,
  className = '',
  children,
  ...props
}) {
  return (
    <Element
      className={`sky-card ${className}`.trim()}
      data-tone={tone}
      data-shape={shape}
      data-sparkle={sparkle || undefined}
      {...props}
    >
      <span className="sky-card-sheen" aria-hidden="true" />
      {sparkle ? <SkySparkles /> : null}
      {charm ? <span className="sky-card-charm" aria-hidden="true">{charm}</span> : null}
      <div className="sky-card-inner">{children}</div>
    </Element>
  );
}

const iconPaths = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9.5V21h14V9.5M9 21v-7h6v7" />
    </>
  ),
  cases: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="3" />
      <path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2" />
    </>
  ),
  workspace: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  review: (
    <>
      <path d="m12 3 8.5 9-8.5 9-8.5-9z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  luna: (
    <>
      <path d="M6 9 5 4l4 2.3A9 9 0 0 1 12 6a9 9 0 0 1 3 .3L19 4l-1 5a7 7 0 1 1-12 0Z" />
      <path d="M9 12h.01M15 12h.01M10 15c1.3 1 2.7 1 4 0" />
    </>
  ),
  report: (
    <>
      <path d="M7 17H4V8h7v6c0 4-2 6-5 7M17 17h-3V8h7v6c0 4-2 6-5 7" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  amount: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5c-.8-.7-1.9-1-3.1-1-1.8 0-3.2.9-3.2 2.3 0 3.5 6.2 1.5 6.2 5 0 1.4-1.4 2.5-3.4 2.5-1.4 0-2.7-.5-3.6-1.3M12 5.5v13" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  channel: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M10 5h4M11 18.5h2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M7 2v6M17 2v6M3 10h18M7 14h3M14 14h3M7 18h3" />
    </>
  ),
  hash: (
    <>
      <path d="M9 3 7 21M17 3l-2 18M4 9h16M3 15h16" />
    </>
  ),
  payment: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 10h19M6 15h4" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </>
  ),
  device: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="3" />
      <path d="M9.5 5h5M10 18.5h4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  login: (
    <>
      <path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10" />
    </>
  ),
  session: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2M8 3.8 6.5 2.5M16 3.8l1.5-1.3" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5l8-3 8 3v16M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2M10 21v-3h4v3" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="18.5" r="2.5" />
      <circle cx="19" cy="18.5" r="2.5" />
      <path d="m10.8 7.2-4.6 9M13.2 7.2l4.6 9M7.5 18.5h9" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  merchant: (
    <>
      <path d="M4 10v11h16V10M3 10l2-6h14l2 6" />
      <path d="M3 10c0 2 3 3 4.5 1 1.5 2 4.5 1 4.5-1 0 2 3 3 4.5 1 1.5 2 4.5 1 4.5-1M9 21v-6h6v6" />
    </>
  ),
  back: (
    <>
      <path d="m15 18-6-6 6-6" />
      <path d="M9 12h10" />
    </>
  ),
  menu: (
    <>
      <circle cx="6" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v5c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6z" />
      <path d="m12 7 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22z" />
      <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z" />
    </>
  ),
  evidence: (
    <>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 11h6M9 15h6" />
    </>
  ),
  pin: (
    <>
      <path d="M8 3h8l-1 6 3 3v2H6v-2l3-3z" />
      <path d="M12 14v7" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  sparkle: (
    <>
      <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" />
      <path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z" />
    </>
  ),
};

export function SkyIcon({
  name,
  size = 22,
  className = '',
  title,
}) {
  return (
    <svg
      className={`sky-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {iconPaths[name] ?? iconPaths.sparkle}
    </svg>
  );
}

export function SkySparkles({ className = '' }) {
  return (
    <span className={`sky-sparkles ${className}`.trim()} aria-hidden="true">
      <i /><i /><i /><i /><i /><i />
    </span>
  );
}

export function SkyCharm({ name = 'bow', className = '' }) {
  if (name === 'quote') {
    return (
      <svg className={`sky-charm-art ${className}`.trim()} viewBox="0 0 48 48" aria-hidden="true">
        <path d="M7 12h14v13c0 8-4 13-12 15l-2-5c5-2 7-5 7-9H7zM27 12h14v13c0 8-4 13-12 15l-2-5c5-2 7-5 7-9h-7z" />
      </svg>
    );
  }

  return (
    <svg className={`sky-charm-art ${className}`.trim()} viewBox="0 0 64 56" aria-hidden="true">
      <path d="M28 21C20 6 7 4 3 16c-3 10 8 17 25 16z" />
      <path d="M36 21C44 6 57 4 61 16c3 10-8 17-25 16z" />
      <path d="m27 31-12 21 17-8 17 8-12-21z" opacity=".78" />
      <rect x="24" y="18" width="16" height="17" rx="6" />
      <path d="M12 13c4-3 8-2 12 2M52 13c-4-3-8-2-12 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".72" />
    </svg>
  );
}

export function SkyProgressRing({
  value = 0,
  label = 'Progress',
  size = 'regular',
  decorative = false,
}) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div
      className="sky-progress-ring"
      data-size={size}
      role={decorative ? undefined : 'progressbar'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      aria-valuemin={decorative ? undefined : '0'}
      aria-valuemax={decorative ? undefined : '100'}
      aria-valuenow={decorative ? undefined : progress}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="sky-progress-ring-track" cx="50" cy="50" r={radius} />
        <circle
          className="sky-progress-ring-value"
          cx="50"
          cy="50"
          r={radius}
          style={{ strokeDasharray: circumference, strokeDashoffset: dashOffset }}
        />
      </svg>
      <span><strong>{progress}%</strong><small>{label}</small></span>
    </div>
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
  const pinPayload = useMemo(() => {
    const routed = record?.pinPayload ?? {};
    return {
      ...routed,
      id: routed.id ?? record?.id ?? `${tool}-workspace`,
      label: routed.label ?? record?.title ?? record?.label ?? record?.name ?? record?.id ?? tool,
      detail: routed.detail ?? record?.detail ?? record?.summary ?? record?.status ?? 'Workspace reviewed',
      tool,
      sourceTool: tool,
    };
  }, [record, tool]);

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
