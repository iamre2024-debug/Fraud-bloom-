import { useEffect, useMemo, useState } from 'react';
import { financialRecordsByCase } from '../data/financialRecords.js';
import { businessRecordsByCase } from '../data/businessRecords.js';
import {
  financialRecordSearchText,
  getFinancialInvestigation,
} from '../data/financialInvestigationRecords.js';
import {
  filterPayrollRuns,
  findPayrollRecord,
  getEmployeeProfiles,
  getPayrollHistory,
  getTransactionHistory,
  payrollHistoryOverview,
  resolveEmployeeProfileLookup,
  sortPayrollRunsNewestFirst,
} from '../data/businessPayrollWorkspace.js';
import {
  filterTransactionRecords,
  rangeTransactionRecords,
  searchTransactionRecords,
  summarizeTransactionRecords,
  transactionAmountValue,
  transactionHistoryRanges,
  transactionInputDate,
  transactionRecordTimestamp,
} from '../data/transactionHistoryRecords.js';
import {
  merchantIntelligenceTabs,
} from '../data/merchantIntelligenceRecords.js';
import {
  buildExplicitMerchantWorkspace,
  formatMerchantPin,
  merchantLookupTypes,
  resolveMerchantLookup,
} from '../data/explicitMerchantWorkspace.js';
import {
  buildPaymentLookupHint,
  normalizePaymentRecords,
  paymentLookupPrefillFromQuery,
  resolvePaymentLookup,
} from '../data/paymentVerification.js';
import {
  normalizeBusinessIntelAddress,
  normalizeBusinessIntelId,
  normalizeBusinessIntelName,
  normalizeBusinessIntelPhone,
} from '../data/businessIntelSearch.js';
import {
  SkyIcon,
  SkySparkles,
} from '../components/SkyPrimitives.jsx';
import {
  documentSearchText,
  getCaseDocuments,
} from '../data/documentRecords.js';
import {
  applyCustomerResponse,
  buildCustomerResponseDocuments,
  buildPaperworkInboxRecords,
  createPaperworkAttempt,
  getPaperworkRequestTemplates,
  markPaperworkResponseRead,
} from '../data/documentRequestWorkflow.js';
import { canonicalToolName } from '../investigationToolGroups.js';

const EMPTY_LIST = Object.freeze([]);
const NOT_SUPPLIED = 'Not supplied in the active case record';

function asArray(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function clean(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return NOT_SUPPLIED;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const shown = value.map(displayValue).filter((item) => item !== NOT_SUPPLIED);
    return shown.length ? shown.join(' · ') : NOT_SUPPLIED;
  }
  if (typeof value === 'object') return NOT_SUPPLIED;
  return String(value);
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return NOT_SUPPLIED;
  if (typeof value === 'string' && value.trim().startsWith('$')) return value;
  const number = Number(String(value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(number)) return String(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(number);
}

function referenceInitials(value = '') {
  const parts = clean(value).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PV';
  return `${parts[0][0] ?? ''}${parts.at(-1)?.[0] ?? ''}`.toUpperCase();
}

function referenceBarWidth(value, maximum) {
  const numeric = Math.abs(Number(value));
  if (!Number.isFinite(numeric) || numeric === 0) return '0%';
  return `${Math.min(100, (numeric / Math.max(1, maximum)) * 100)}%`;
}

function paymentResultTone(value = '') {
  const normalized = lower(value);
  if (/^match$|^open$|no nsf/.test(normalized)) return 'mint';
  if (/partial|unable|pending/.test(normalized)) return 'amber';
  if (/no match|closed|frozen|nsf found|not found/.test(normalized)) return 'pink';
  return 'blue';
}

function financialBreakdown(workspace, selected) {
  const sectionId = selected?.sectionId;

  if (sectionId === 'spending') {
    const merchantTotals = asArray(workspace.spending?.merchantTotals);
    const shownMerchants = merchantTotals.slice(0, 4);
    const groupedMerchantTotal = merchantTotals
      .slice(4)
      .reduce((sum, item) => sum + (Number(item.total) || 0), 0);
    const suppliedRemainder = Number(workspace.spending?.knownRemainder) || 0;
    const groupedRemainder = groupedMerchantTotal + suppliedRemainder;
    const items = [
      ...shownMerchants.map((item) => ({
        label: item.label,
        value: item.total,
        display: item.totalDisplay,
        meta: `${item.count} record${item.count === 1 ? '' : 's'}`,
        recordId: item.supportRecordIds?.[0],
      })),
      ...(groupedRemainder > 0 ? [{
        label: 'Grouped supplied remainder',
        value: groupedRemainder,
        display: formatMoney(groupedRemainder),
        meta: workspace.spending?.explanation,
        recordId: null,
      }] : []),
    ];
    return {
      title: 'Merchant activity',
      subtitle: workspace.spending?.periodRange?.label ?? 'Supplied spending records',
      total: items.length ? workspace.spending?.periodOutflowDisplay : NOT_SUPPLIED,
      items,
    };
  }

  if (sectionId === 'deposits') {
    const items = asArray(workspace.deposits?.sourceTotals).slice(0, 5);
    return {
      title: 'Incoming-funds sources',
      subtitle: 'Personal deposits supplied in this case',
      total: items.length ? workspace.deposits?.visibleTotalDisplay : NOT_SUPPLIED,
      items: items.map((item) => ({
        label: item.label,
        value: item.total,
        display: item.totalDisplay,
        meta: `${item.count} record${item.count === 1 ? '' : 's'}`,
        recordId: item.supportRecordIds?.[0],
      })),
    };
  }

  if (sectionId === 'payroll') {
    const allMonths = asArray(workspace.payroll?.months);
    const items = allMonths.slice(0, 5);
    const suppliedDebits = allMonths
      .map((item) => item.companyDebit)
      .filter((value) => (
        value !== null
        && value !== undefined
        && clean(value) !== ''
      ))
      .map(Number)
      .filter(Number.isFinite);
    const total = suppliedDebits.reduce((sum, value) => sum + value, 0);
    return {
      title: 'Payroll movement',
      subtitle: 'Exact company debits from supplied Payroll History',
      total: suppliedDebits.length ? formatMoney(total) : NOT_SUPPLIED,
      items: items.map((item) => ({
        label: item.label,
        value: item.companyDebit,
        display: item.companyDebitDisplay,
        meta: `${item.runCount} pay period${item.runCount === 1 ? '' : 's'}`,
        recordId: item.supportRecordIds?.[0] ?? item.payrollRunId,
      })),
    };
  }

  if (sectionId === 'payments') {
    const items = asArray(workspace.payments?.monthlyRows).slice(0, 5);
    return {
      title: 'Credit and loan payments',
      subtitle: 'Actual paid amounts in supplied dated records',
      total: items.length ? workspace.payments?.actualTotalDisplay : NOT_SUPPLIED,
      items: items.map((item) => ({
        label: item.label,
        value: item.actualPaid,
        display: item.actualPaidDisplay,
        meta: asArray(item.statuses).join(' · ') || 'Status not supplied',
        recordId: item.supportRecordIds?.[0],
      })),
    };
  }

  if (sectionId === 'comparisons') {
    const items = asArray(workspace.comparisons).slice(0, 5);
    return {
      title: 'Current versus historical',
      subtitle: 'Only dated comparisons supplied by the case',
      total: selected?.value,
      items: items.map((item) => ({
        label: item.title ?? item.label ?? item.id,
        value: Number.isFinite(Number(item.currentValue))
          ? Math.abs(Number(item.currentValue))
          : 0,
        display: item.value ?? item.currentDisplay ?? item.totalDisplay,
        meta: item.period ?? item.status ?? 'Recorded comparison',
        recordId: item.id,
      })),
    };
  }

  const items = asArray(workspace.accounts).slice(0, 5);
  return {
    title: 'Relationship accounts',
    subtitle: 'Amounts and statuses from the shared account record',
    total: selected?.value ?? workspace.profile?.currentBalanceDisplay,
    items: items.map((item) => ({
      label: `${item.productLabel} ${item.maskedAccountId}`,
      value: Number.isFinite(Number(item.currentBalance ?? item.availableCredit))
        ? Math.abs(Number(item.currentBalance ?? item.availableCredit))
        : 0,
      display: item.currentBalance === null || item.currentBalance === undefined
        ? item.status
        : formatMoney(item.currentBalance),
      meta: item.status,
      recordId: item.accountId,
    })),
  };
}

function ReferenceToolHero({
  icon,
  title,
  eyebrow,
  subtitle,
  activeCase,
  onBack,
  showLuna = true,
}) {
  return (
    <header
      className="sky-reference-tool-hero"
      data-luna={showLuna ? 'true' : 'false'}
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
        {eyebrow ? <small>{eyebrow}</small> : null}
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <span>{activeCase?.id ?? 'No active case'}</span>
      </div>
      {showLuna ? (
        <div className="sky-reference-tool-luna" aria-hidden="true">
          <img src="/assets/luna-anime-purple-v1.webp" alt="" />
          <i aria-hidden="true">♥</i>
        </div>
      ) : null}
    </header>
  );
}

function explicitFinancialSource(activeCase = {}) {
  const fixed = financialRecordsByCase[activeCase.id];
  const packet = activeCase.toolResults ?? {};
  const source = fixed ?? packet;
  return {
    transactions: asArray(source.transactions),
    financialIntel: asArray(source.financialIntel),
    paymentVerification: normalizePaymentRecords(
      asArray(source.paymentVerification),
      activeCase,
    ),
    creditProfile: source.creditProfile ?? null,
    relationshipAccounts: asArray(
      source.relationshipAccounts ?? activeCase.relationshipAccounts,
    ),
    supplied: Boolean(
      fixed
      || hasOwn(packet, 'transactions')
      || hasOwn(packet, 'financialIntel')
      || hasOwn(packet, 'paymentVerification')
      || hasOwn(packet, 'creditProfile')
      || hasOwn(packet, 'relationshipAccounts')
      || activeCase.relationshipAccounts?.length,
    ),
  };
}

function explicitBusinessSource(activeCase = {}) {
  const fixed = businessRecordsByCase[activeCase.id];
  const packet = activeCase.toolResults ?? {};
  const source = fixed ?? packet;
  return {
    business360: asArray(source.business360),
    employeeProfile: asArray(source.employeeProfile),
    companyPayrollProfile: source.companyPayrollProfile ?? null,
    payrollRuns: asArray(source.payrollRuns),
    supplied: Boolean(
      fixed
      || hasOwn(packet, 'business360')
      || hasOwn(packet, 'employeeProfile')
      || hasOwn(packet, 'companyPayrollProfile')
      || hasOwn(packet, 'payrollRuns')
      || activeCase.businessProfile,
    ),
  };
}

function requestStateForCase(documentRequests, caseId) {
  if (!documentRequests || typeof documentRequests !== 'object') return {};
  if (hasOwn(documentRequests, caseId)) return documentRequests[caseId] ?? {};
  return documentRequests;
}

function explicitDocumentSource(activeCase = {}, requestState = {}) {
  const packet = activeCase.toolResults ?? {};
  return Boolean(
    activeCase.documents?.length
    || activeCase.documentRequests?.length
    || asArray(packet.documents).length
    || asArray(packet.evidence).length
    || packet.merchantIntelligence
    || activeCase.merchantResponse
    || Object.keys(requestState).length,
  );
}

function callbackProps(props, toolName) {
  return {
    caseId: props.activeCase?.id,
    toolName,
  };
}

function sendPin(props, toolName, value, record = null) {
  if (!value) return;
  if (props.onPin) {
    const pinPayload = record?.pinPayload ?? {};
    const recordId = record?.id
      ?? record?.recordId
      ?? record?.paymentRecordId
      ?? value;
    props.onPin({
      ...pinPayload,
      id: pinPayload.id ?? recordId,
      recordId: pinPayload.recordId ?? recordId,
      sourceRecordId: pinPayload.sourceRecordId ?? recordId,
      value: pinPayload.value ?? value,
      label: pinPayload.label ?? value,
      detail: record?.detail ?? record?.summary ?? record?.status ?? 'Supplied evidence record',
      tool: toolName,
      sourceTool: toolName,
      caseId: props.activeCase?.id,
      bankCode: record?.bankCode,
      destinationId: record?.destinationId,
      record,
    });
    return;
  }
  props.pin?.(value, { ...callbackProps(props, toolName), record });
}

function sendNote(props, toolName, text, record = null) {
  const handler = props.onSaveNote ?? props.saveNote;
  const note = clean(text);
  if (!handler || !note) return;
  handler(
    note,
    toolName,
    record?.id ?? record?.recordId ?? record?.attemptId ?? '',
    { ...callbackProps(props, toolName), record },
  );
}

function sendReviewed(props, toolName) {
  const handler = props.onMarkReviewed ?? props.markReviewed;
  handler?.(toolName, callbackProps(props, toolName));
}

function openRelatedTool(props, toolName, query = '') {
  if (props.onOpenTool) {
    props.onOpenTool(toolName, {
      query,
      sourceTool: canonicalToolName(props.toolName),
      caseId: props.activeCase?.id,
    });
    return;
  }
  props.openTool?.(toolName, 'investigate', query ? { query } : undefined);
}

function ToolIntro({ toolName, question, activeCase, children }) {
  return (
    <article className="sky-card span-12" data-tone="pink">
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Evidence First workspace</p>
            <h2>{toolName}</h2>
            <span>{question}</span>
          </div>
          <span className="sky-chip">{activeCase?.id ?? 'No active case'}</span>
        </header>
        {children}
      </div>
    </article>
  );
}

function SearchCard({ title, description, onSubmit, children, error, status }) {
  return (
    <article className="sky-card span-12">
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Search before reveal</p>
            <h3>{title}</h3>
            <span>{description}</span>
          </div>
        </header>
        <form className="sky-form-grid" onSubmit={onSubmit} noValidate>
          {children}
        </form>
        {error && <div className="sky-notice" role="alert">{error}</div>}
        {status && <div className="sky-empty" role="status">{status}</div>}
      </div>
    </article>
  );
}

function FieldList({ fields = [] }) {
  const visible = fields.filter((item) => (
    Array.isArray(item)
    && item.length > 1
    && item[1] !== null
    && item[1] !== undefined
    && item[1] !== ''
  ));
  if (!visible.length) {
    return <div className="sky-empty">No additional supplied fields are available.</div>;
  }
  return (
    <dl className="sky-data-list">
      {visible.map(([label, value], index) => (
        <div className="sky-data-row" key={`${label}-${index}`}>
          <dt>{label}</dt>
          <dd>{displayValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResultList({
  records,
  selectedId,
  onSelect,
  getId = (record) => record.id,
  getTitle = (record) => record.title ?? record.name ?? record.id,
  getMeta = (record) => record.status ?? record.observed ?? '',
  ariaLabel = 'Search results',
}) {
  return (
    <div className="sky-record-list" aria-label={ariaLabel}>
      {records.map((record, index) => {
        const id = clean(getId(record)) || `result-${index}`;
        return (
          <button
            className="sky-record"
            type="button"
            key={id}
            aria-current={id === selectedId ? 'true' : undefined}
            onClick={() => onSelect(id)}
          >
            <span>
              <strong>{getTitle(record)}</strong>
              <small>{getMeta(record)}</small>
            </span>
            <strong aria-hidden="true">›</strong>
          </button>
        );
      })}
    </div>
  );
}

function EvidenceActions({
  props,
  toolName,
  recordId,
  record,
  pinLabel,
  reviewed,
  children,
  reference = false,
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [props.activeCase?.id, recordId]);

  return (
    <article
      className={`sky-card span-12${reference ? ' sky-reference-evidence-actions' : ''}`}
      data-shape={reference ? 'shield' : undefined}
      data-sparkle={reference || undefined}
    >
      {reference ? <span className="sky-card-sheen" aria-hidden="true" /> : null}
      {reference ? <SkySparkles /> : null}
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Investigator output</p>
            <h3>Pin, document, and complete the review</h3>
            <span>These actions are passed to the parent case workspace.</span>
          </div>
        </header>
        <div className="sky-form-grid">
          <label className="sky-field wide">
            <span>Investigator note</span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record what the source supports, contradicts, or leaves unresolved."
            />
          </label>
        </div>
        <div className="sky-action-row">
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => sendPin(props, toolName, pinLabel ?? recordId, record)}
          >
            Pin record
          </button>
          <button
            className="sky-button-secondary"
            type="button"
            disabled={!clean(note)}
            onClick={() => {
              sendNote(props, toolName, note, record);
              setNote('');
            }}
          >
            Save note
          </button>
          {children}
          <button
            className="sky-button"
            type="button"
            disabled={reviewed}
            onClick={() => sendReviewed(props, toolName)}
          >
            {reviewed ? `✓ ${toolName} reviewed` : `Mark ${toolName} reviewed`}
          </button>
        </div>
      </div>
    </article>
  );
}

function ToolShell({
  toolName,
  question,
  activeCase,
  children,
  reference = false,
  displayName,
  icon = 'sparkle',
  onBack,
  showLuna = true,
}) {
  return (
    <section
      className={`sky-main${reference ? ' sky-reference-tool-page' : ''}`}
      data-financial-business-tool={canonicalToolName(toolName)}
      data-case-id={activeCase?.id ?? ''}
      data-reference-layout={reference ? 'sky-reference-v1' : undefined}
    >
      {reference ? (
        <ReferenceToolHero
          icon={icon}
          title={displayName ?? toolName}
          eyebrow={displayName && displayName !== toolName ? toolName : ''}
          subtitle={question}
          activeCase={activeCase}
          onBack={onBack}
          showLuna={showLuna}
        />
      ) : (
        <ToolIntro toolName={toolName} question={question} activeCase={activeCase} />
      )}
      <div className="sky-grid">{children}</div>
    </section>
  );
}

export function FinancialInvestigationTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Financial Investigation';
  const source = useMemo(() => explicitFinancialSource(activeCase), [activeCase]);
  const workspace = useMemo(
    () => (source.supplied ? getFinancialInvestigation(activeCase) : null),
    [activeCase, source.supplied],
  );
  const allRecords = useMemo(() => (
    workspace
      ? workspace.sections.flatMap((section) => (
          asArray(workspace.recordsBySection[section.id]).map((record) => ({
            ...record,
            sectionId: section.id,
            sectionLabel: section.label,
          }))
        ))
      : []
  ), [workspace]);
  const [input, setInput] = useState(query);
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setInput(query);
    setResults([]);
    setSelectedId('');
    setError('');
    setHasRun(false);
  }, [activeCase.id, query]);

  function runSearch(event) {
    event.preventDefault();
    const requested = lower(input);
    setSelectedId('');
    setHasRun(true);
    if (!requested) {
      setResults([]);
      setError('Enter a record ID, account, date, amount, source, or other financial value.');
      return;
    }
    if (!source.supplied || !workspace) {
      setResults([]);
      setError('No supplied financial investigation records are attached to this case.');
      return;
    }
    const matches = allRecords.filter((record) => (
      financialRecordSearchText(record).includes(requested)
      || lower(record.sectionLabel).includes(requested)
    ));
    setResults(matches);
    if (matches.length === 1) setSelectedId(matches[0].id);
    setError(matches.length ? '' : 'No supplied financial record matched that search.');
  }

  function openRecord(recordId) {
    const target = allRecords.find((record) => (
      record.id === recordId
      || asArray(record.supportRecordIds).includes(recordId)
      || asArray(record.relatedRecords).includes(recordId)
      || asArray(record.fields).some((field) => asArray(field).some((value) => clean(value) === clean(recordId)))
    ));
    if (!target) return;
    setSelectedId(target.id);
  }

  const selected = allRecords.find((record) => record.id === selectedId) ?? null;
  const breakdown = selected ? financialBreakdown(workspace, selected) : null;
  const breakdownMaximum = Math.max(
    1,
    ...asArray(breakdown?.items).map((item) => Math.abs(Number(item.value)) || 0),
  );
  const supportIds = selected
    ? [...new Set([
        selected.id,
        ...asArray(selected.supportRecordIds),
        ...asArray(selected.relatedRecords),
      ].filter(Boolean))]
    : [];
  const relatedSourceIds = supportIds.filter((recordId) => recordId !== selected?.id);
  const displayedSourceIds = relatedSourceIds.length ? relatedSourceIds : supportIds;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Analyze supplied money movement and account records without predicting the case outcome."
      reference
      displayName="Financial Intelligence"
      icon="amount"
      onBack={props.onBackToWorkspace}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-financial-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="sparkle" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find a supplied financial record</strong>
              <p>Account, spending, deposit, payment, loan, and payroll details remain hidden until a case record matches.</p>
            </div>
          </header>
          <form className="sky-reference-search-row" onSubmit={runSearch} noValidate>
            <label>
              <span>Financial record search</span>
              <input
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setResults([]);
                  setSelectedId('');
                  setError('');
                  setHasRun(false);
                }}
                placeholder="Record ID, account, date, amount, source, or support ID"
                aria-label="Search Financial Investigation"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="sparkle" size={18} />
              Run search
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!hasRun ? (
            <div className="sky-reference-search-message" role="status">
              No financial record is open.
            </div>
          ) : null}
        </div>
      </article>

      {results.length > 0 && (
        <article
          className="sky-card span-12 sky-reference-result-rail"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <header>
              <div>
                <small>Matched records</small>
                <strong>Choose the source record to inspect</strong>
              </div>
              <span>{results.length} found</span>
            </header>
            <div className="sky-reference-result-scroll" role="group" aria-label="Financial Investigation matched records">
              {results.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  aria-current={selectedId === record.id ? 'true' : undefined}
                  onClick={() => setSelectedId(record.id)}
                >
                  <small>{record.sectionLabel}</small>
                  <strong>{record.title ?? record.id}</strong>
                  <span>{record.value ?? record.status ?? 'Recorded'}</span>
                </button>
              ))}
            </div>
          </div>
        </article>
      )}

      {selected && (
        <>
          <section className="span-12 sky-financial-reference-dashboard" aria-label="Selected financial record dashboard">
            <div className="sky-financial-reference-kpis">
              <article data-tone="blue">
                <small>{selected.sectionLabel}</small>
                <strong>{selected.value ?? selected.totalDisplay ?? 'Recorded'}</strong>
                <span>{selected.title ?? selected.id}</span>
                <i aria-hidden="true" />
              </article>
              <article data-tone="pink">
                <small>Record status</small>
                <strong>{selected.status ?? 'Recorded'}</strong>
                <span>{selected.observed ?? selected.period ?? 'Date not supplied'}</span>
                <i aria-hidden="true" />
              </article>
            </div>

            <article className="sky-card sky-financial-reference-analysis" data-shape="ribbon" data-sparkle="true">
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <header>
                  <div>
                    <small>Supplied analysis</small>
                    <h2>{breakdown.title}</h2>
                    <p>{breakdown.subtitle}</p>
                  </div>
                  <strong>{breakdown.total ?? 'Coverage only'}</strong>
                </header>
                {breakdown.items.length ? (
                  <div className="sky-financial-reference-bars">
                    {breakdown.items.map((item, index) => (
                      <button
                        type="button"
                        key={`${item.label}-${index}`}
                        onClick={() => openRecord(item.recordId)}
                        disabled={!item.recordId}
                      >
                        <span><strong>{item.label}</strong><small>{item.meta}</small></span>
                        <i><b style={{ width: referenceBarWidth(item.value, breakdownMaximum) }} /></i>
                        <em>{item.display ?? 'Recorded'}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="sky-empty">No numeric breakdown is supplied for this selected record.</div>
                )}
              </div>
            </article>

            <div className="sky-financial-reference-support">
              <article>
                <span aria-hidden="true"><SkyIcon name="calendar" size={18} /></span>
                <small>Recorded period</small>
                <strong>{selected.period ?? selected.observed ?? 'Not supplied'}</strong>
              </article>
              <article>
                <span aria-hidden="true"><SkyIcon name="evidence" size={18} /></span>
                <small>Source coverage</small>
                <strong>{supportIds.length} source record{supportIds.length === 1 ? '' : 's'}</strong>
              </article>
            </div>

            <article
              className="sky-card sky-financial-reference-fields"
              data-shape="notched"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <div><small>Selected record</small><h2>{selected.title ?? selected.id}</h2></div>
                  <span>{selected.id}</span>
                </header>
                <p>{selected.detail ?? 'Supplied financial record'}</p>
                <FieldList fields={asArray(selected.fields)} />
              </div>
            </article>

            <div className="sky-financial-reference-lower">
              <article className="sky-card" data-sparkle="true">
                <span className="sky-card-sheen" aria-hidden="true" />
                <div className="sky-card-inner">
                  <header><small>Related records</small><h2>Source links</h2></header>
                  <div className="sky-financial-source-links">
                    {displayedSourceIds.map((recordId) => {
                      const linked = allRecords.find((record) => (
                        record.id === recordId
                        || asArray(record.supportRecordIds).includes(recordId)
                      ));
                      return linked && linked.id !== selected.id ? (
                        <button type="button" key={recordId} onClick={() => setSelectedId(linked.id)}>
                          <span>{recordId}</span><strong>{linked.sectionLabel}</strong>
                        </button>
                      ) : (
                        <span key={recordId}><small>Source ID</small><strong>{recordId}</strong></span>
                      );
                    })}
                  </div>
                </div>
              </article>
              <article className="sky-card" data-tone="pink" data-sparkle="true">
                <span className="sky-card-sheen" aria-hidden="true" />
                <div className="sky-card-inner">
                  <header><small>Coverage note</small><h2>What this record says</h2></header>
                  <p>{selected.detail ?? selected.status ?? 'No additional coverage note is supplied.'}</p>
                  {selected.payrollRunId ? (
                    <button
                      className="sky-button-secondary"
                      type="button"
                      onClick={() => openRelatedTool(props, 'Payroll History', selected.payrollRunId)}
                    >
                      Open exact Payroll History run
                    </button>
                  ) : null}
                </div>
              </article>
            </div>
          </section>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={selected.id}
            record={selected}
            reviewed={reviewed}
            reference
          />
        </>
      )}

      {hasRun && results.length > 1 && !selected ? (
        <article className="sky-card span-12 sky-reference-choice-prompt">
          <div className="sky-card-inner">
            <SkyIcon name="evidence" size={20} />
            <span>Choose one matched record above to open its financial dashboard.</span>
          </div>
        </article>
      ) : null}
    </ToolShell>
  );
}

function transactionAccent(record = {}) {
  if (lower(record.direction) === 'credit') return 'mint';
  if (/recurring/i.test(record.channel)) return 'violet';
  if (/card present/i.test(record.channel)) return 'amber';
  if (/card not present|digital wallet/i.test(record.channel)) return 'pink';
  return 'blue';
}

function transactionIcon(record = {}) {
  if (lower(record.direction) === 'credit') return 'building';
  if (/card|wallet/i.test(record.channel)) return 'payment';
  if (/account|credit|loan|wire/i.test(`${record.channel} ${record.category}`)) return 'amount';
  return 'merchant';
}

function signedTransactionAmount(record = {}) {
  const amount = transactionAmountValue(record.amount);
  if (!Number.isFinite(amount)) return displayValue(record.amount);
  const formatted = formatMoney(Math.abs(amount));
  if (lower(record.direction) === 'credit') return `+${formatted}`;
  if (lower(record.direction) === 'debit') return `-${formatted}`;
  return formatted;
}

function uniqueTransactionValues(records = [], field) {
  return [...new Set(records.map((record) => clean(record[field])).filter(Boolean))];
}

export function TransactionHistoryTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Transaction History';
  const source = useMemo(() => explicitFinancialSource(activeCase), [activeCase]);
  const records = useMemo(
    () => (source.transactions.length ? getTransactionHistory(activeCase) : []),
    [activeCase, source.transactions.length],
  );
  const [input, setInput] = useState(query);
  const [results, setResults] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [hasRun, setHasRun] = useState(false);
  const [rangeId, setRangeId] = useState('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    direction: 'all',
    status: 'all',
    channel: 'all',
  });

  useEffect(() => {
    setInput(query);
    setResults([]);
    setSelectedId('');
    setError('');
    setHasRun(false);
    setRangeId('30d');
    setCustomStart('');
    setCustomEnd('');
    setFiltersOpen(false);
    setFilters({ direction: 'all', status: 'all', channel: 'all' });
  }, [activeCase.id, query]);

  function runSearch(event) {
    event.preventDefault();
    const requested = clean(input);
    setSelectedId('');
    setHasRun(true);
    if (!requested) {
      setResults([]);
      setError('Enter a transaction ID, merchant, account, channel, date, amount, or status.');
      return;
    }
    if (!records.length) {
      setResults([]);
      setError('No supplied transaction records are attached to this case.');
      return;
    }
    const matches = searchTransactionRecords(records, requested);
    const isExactIdSearch = (
      matches.length === 1
      && lower(matches[0].id) === lower(requested)
    );
    setResults(matches);
    setError(matches.length ? '' : 'No supplied transaction matched that search.');
    setRangeId(isExactIdSearch ? 'exact' : '30d');
    setCustomStart('');
    setCustomEnd('');
    setFilters({ direction: 'all', status: 'all', channel: 'all' });
    setFiltersOpen(false);
  }

  function changeInput(value) {
    setInput(value);
    setResults([]);
    setSelectedId('');
    setError('');
    setHasRun(false);
  }

  function chooseRange(nextRangeId) {
    setRangeId(nextRangeId);
    setSelectedId('');
    if (nextRangeId !== 'custom' || !results.length) return;
    const timestamps = results.map(transactionRecordTimestamp).filter(Number.isFinite);
    if (!timestamps.length) return;
    setCustomStart(transactionInputDate(Math.min(...timestamps)));
    setCustomEnd(transactionInputDate(Math.max(...timestamps)));
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setSelectedId('');
  }

  function resetFilters() {
    setFilters({ direction: 'all', status: 'all', channel: 'all' });
    setSelectedId('');
  }

  const rangedResults = useMemo(
    () => rangeTransactionRecords(results, rangeId, {
      customStart,
      customEnd,
      anchorRecords: records,
    }),
    [customEnd, customStart, rangeId, records, results],
  );
  const displayedResults = useMemo(
    () => filterTransactionRecords(rangedResults, filters)
      .sort((left, right) => (
        (transactionRecordTimestamp(right) ?? 0) - (transactionRecordTimestamp(left) ?? 0)
      )),
    [filters, rangedResults],
  );
  const selected = displayedResults.find((record) => record.id === selectedId) ?? null;
  const summary = useMemo(
    () => summarizeTransactionRecords(displayedResults),
    [displayedResults],
  );
  const selectedRange = rangeId === 'exact'
    ? { id: 'exact', label: 'Exact' }
    : transactionHistoryRanges.find((item) => item.id === rangeId)
      ?? transactionHistoryRanges[2];
  const directionOptions = uniqueTransactionValues(results, 'direction');
  const statusOptions = uniqueTransactionValues(results, 'status');
  const channelOptions = uniqueTransactionValues(results, 'channel');
  const activeFilterCount = Object.values(filters).filter((value) => value !== 'all').length;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Search and review supplied transaction records without predicting the case outcome."
      reference
      icon="payment"
      onBack={props.onBackToWorkspace}
    >
      {results.length > 0 ? (
        <article
          className="sky-card span-12 sky-transaction-summary"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <header>
              <div>
                <small>Matched source summary</small>
                <h2>{selectedRange.label} transaction view</h2>
              </div>
              <span>{displayedResults.length} visible</span>
            </header>
            <div className="sky-transaction-summary-grid">
              <article data-accent="blue">
                <span aria-hidden="true"><SkyIcon name="evidence" size={21} /></span>
                <small>Total transactions</small>
                <strong>{summary.totalCount}</strong>
                <p>Visible source records</p>
              </article>
              <article data-accent="mint">
                <span aria-hidden="true"><SkyIcon name="arrow" size={21} /></span>
                <small>Total credits</small>
                <strong>{summary.creditAmountCount ? formatMoney(summary.creditAmount) : 'Not supplied'}</strong>
                <p>
                  {summary.creditCount} explicit credit record{summary.creditCount === 1 ? '' : 's'}
                  {summary.creditAmountCount < summary.creditCount
                    ? ` · ${summary.creditAmountCount} with amount`
                    : ''}
                </p>
              </article>
              <article data-accent="pink">
                <span aria-hidden="true"><SkyIcon name="arrow" size={21} /></span>
                <small>Total debits</small>
                <strong>{summary.debitAmountCount ? formatMoney(summary.debitAmount) : 'Not supplied'}</strong>
                <p>
                  {summary.debitCount} explicit debit record{summary.debitCount === 1 ? '' : 's'}
                  {summary.debitAmountCount < summary.debitCount
                    ? ` · ${summary.debitAmountCount} with amount`
                    : ''}
                </p>
              </article>
              <article data-accent="amber">
                <span aria-hidden="true"><SkyIcon name="amount" size={21} /></span>
                <small>Matched amount</small>
                <strong>{summary.amountCount ? formatMoney(summary.totalAmount) : 'Not supplied'}</strong>
                <p>{summary.amountCount} of {summary.totalCount} with supplied amounts</p>
              </article>
            </div>
          </div>
        </article>
      ) : null}

      <article
        className="sky-card span-12 sky-transaction-search"
        data-shape="notched"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="search" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find supplied transaction records</strong>
              <p>Totals, rows, and details remain hidden until a case record matches this search.</p>
            </div>
          </header>
          <form className="sky-transaction-search-form" onSubmit={runSearch} noValidate>
            <label>
              <span>Transaction search</span>
              <input
                value={input}
                onChange={(event) => changeInput(event.target.value)}
                placeholder="Merchant, amount, transaction ID, account, date, channel, or status"
                aria-label="Search Transaction History"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit" title="Run search">
              <SkyIcon name="search" size={18} />
              <span>Run search</span>
            </button>
            <button
              className="sky-button-secondary sky-transaction-filter-toggle"
              type="button"
              title="Transaction filters"
              aria-expanded={filtersOpen}
              aria-controls="transaction-history-filters"
              disabled={!results.length}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SkyIcon name="review" size={18} />
              <span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!hasRun ? (
            <div className="sky-reference-search-message" role="status">No transaction result is open.</div>
          ) : null}

          {results.length ? (
            <>
              <div className="sky-transaction-ranges" role="group" aria-label="Transaction date range">
                {transactionHistoryRanges.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={rangeId === item.id}
                    onClick={() => chooseRange(item.id)}
                  >
                    {item.label}
                    {item.id === 'custom' ? <SkyIcon name="calendar" size={16} /> : null}
                  </button>
                ))}
              </div>
              {rangeId === 'custom' ? (
                <div className="sky-transaction-custom-range">
                  <label>
                    <span>From</span>
                    <input
                      type="date"
                      value={customStart}
                      max={customEnd || undefined}
                      onChange={(event) => {
                        setCustomStart(event.target.value);
                        setSelectedId('');
                      }}
                      aria-label="Transaction custom start date"
                    />
                  </label>
                  <label>
                    <span>Through</span>
                    <input
                      type="date"
                      value={customEnd}
                      min={customStart || undefined}
                      onChange={(event) => {
                        setCustomEnd(event.target.value);
                        setSelectedId('');
                      }}
                      aria-label="Transaction custom end date"
                    />
                  </label>
                </div>
              ) : null}
              {filtersOpen ? (
                <div className="sky-transaction-filters" id="transaction-history-filters">
                  <label>
                    <span>Direction</span>
                    <select
                      value={filters.direction}
                      onChange={(event) => updateFilter('direction', event.target.value)}
                    >
                      <option value="all">All directions</option>
                      {directionOptions.map((value) => <option value={lower(value)} key={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={filters.status}
                      onChange={(event) => updateFilter('status', event.target.value)}
                    >
                      <option value="all">All statuses</option>
                      {statusOptions.map((value) => <option value={lower(value)} key={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Channel</span>
                    <select
                      value={filters.channel}
                      onChange={(event) => updateFilter('channel', event.target.value)}
                    >
                      <option value="all">All channels</option>
                      {channelOptions.map((value) => <option value={lower(value)} key={value}>{value}</option>)}
                    </select>
                  </label>
                  <button className="sky-button-secondary" type="button" onClick={resetFilters}>
                    Reset filters
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </article>

      {results.length > 0 ? (
        <section className="span-12 sky-transaction-results" aria-label="Transaction History results">
          <header className="sky-transaction-results-heading">
            <div>
              <small>Supplied activity</small>
              <h2>Matched transaction records</h2>
            </div>
            <span>{displayedResults.length} of {results.length}</span>
          </header>
          {displayedResults.length ? (
            <div className="sky-transaction-list">
              {displayedResults.map((record) => {
                const isSelected = record.id === selectedId;
                return (
                  <article
                    className="sky-card sky-transaction-record"
                    data-accent={transactionAccent(record)}
                    data-shape={isSelected ? 'ribbon' : undefined}
                    data-sparkle={isSelected || undefined}
                    key={record.id}
                  >
                    <span className="sky-card-sheen" aria-hidden="true" />
                    {isSelected ? <SkySparkles /> : null}
                    <button
                      className="sky-transaction-record-toggle"
                      type="button"
                      aria-expanded={isSelected}
                      onClick={() => setSelectedId(isSelected ? '' : record.id)}
                    >
                      <span className="sky-transaction-record-icon" aria-hidden="true">
                        <SkyIcon name={transactionIcon(record)} size={25} />
                      </span>
                      <span className="sky-transaction-record-copy">
                        <strong>{record.merchant}</strong>
                        <small>{record.posted}{record.time ? ` · ${record.time}` : ''}</small>
                        <span>{record.instrument}</span>
                        <i>
                          {[record.channel, record.category].filter(Boolean).map((value) => (
                            <em key={value}>{value}</em>
                          ))}
                        </i>
                      </span>
                      <span className="sky-transaction-record-value">
                        <strong>{signedTransactionAmount(record)}</strong>
                        <small>{record.direction ?? 'Direction not supplied'}</small>
                        <em>{record.status}</em>
                      </span>
                      <SkyIcon className="sky-transaction-record-chevron" name="arrow" size={20} />
                    </button>
                    {isSelected ? (
                      <div className="sky-transaction-record-detail">
                        <header>
                          <div>
                            <small>Exact source detail</small>
                            <h3>{record.id}</h3>
                          </div>
                          <span className="sky-chip">{record.status}</span>
                        </header>
                        <FieldList fields={[
                          ['Amount', record.amount],
                          ['Direction', record.direction],
                          ['Account / card', record.instrument],
                          ['Channel', record.channel],
                          ['Category', record.category],
                          ['Entry mode', record.entryMode],
                          ['Location', record.location],
                          ['Recorded context', record.context],
                          ['Related records', record.relatedRecords],
                          ['Related documents', record.relatedDocuments],
                        ]} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <article className="sky-card sky-transaction-empty" data-shape="notched">
              <div className="sky-card-inner">
                <SkyIcon name="search" size={24} />
                <div>
                  <strong>No matched records are inside this range and filter combination.</strong>
                  <p>Change the date range or reset the filters. The original search result remains intact.</p>
                </div>
              </div>
            </article>
          )}
        </section>
      ) : null}

      {selected ? (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={selected}
          pinLabel={selected.id}
          reviewed={reviewed}
          reference
        >
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => openRelatedTool(props, 'Financial Investigation', selected.id)}
          >
            Open Financial Investigation
          </button>
        </EvidenceActions>
      ) : null}
    </ToolShell>
  );
}

function merchantAuthorizationFields(authorization = {}) {
  return [
    ['Authorization ID', authorization.id ?? authorization.authorizationId],
    ['Authorized at', authorization.authorizedAt],
    ['Amount', authorization.amount],
    ['Entry mode', authorization.entryMode],
    ['Stored credential', authorization.storedCredential],
    ['Authorization result', authorization.authorizationResult],
    ['AVS', authorization.avs],
    ['CVV', authorization.cvv],
    ['3DS', authorization.threeDS],
    ['OTP', authorization.otp],
    ['Wallet token', authorization.walletToken],
    ['Device', authorization.device],
    ['IP record', authorization.ip],
    ['Attempts', authorization.attempts],
  ];
}

function merchantResponseFields(response = {}) {
  return [
    ['Response ID', response.id ?? response.responseId],
    ['Response status', response.status],
    ['Response received', response.receivedDate],
    ['Cancellation request found', response.cancellationRequestFound],
    ['Refund issued', response.refundIssued],
  ];
}

function MerchantSection({
  activeCase,
  workspace,
  section,
  onOpenDocument,
  onRequestDocument,
}) {
  const primary = workspace.primaryTransaction ?? {};
  const sectionRecords = (matcher) => asArray(workspace.records).filter((record) => (
    matcher.test(`${record.section ?? ''} ${record.title ?? ''}`)
  ));
  if (section === 'claim-details') {
    return <FieldList fields={[
      ['Customer', activeCase.person],
      ['Merchant', workspace.profile?.name],
      ['Transaction ID', primary.id],
      ['Transaction date', primary.posted],
      ['Disputed amount', primary.amount ?? activeCase.amount],
      ['Account / card', primary.instrument],
      ['Channel', primary.channel],
      ['Recorded context', primary.context],
      ['Reported allegation', activeCase.reportedAllegation ?? activeCase.allegation],
      ['Cancellation date', activeCase.claimDetails?.cancellationDate],
      ['Cancellation method', activeCase.claimDetails?.cancellationMethod],
      ['Reported', activeCase.reportedDate ?? activeCase.opened],
      ...merchantAuthorizationFields(workspace.authorization),
    ]} />;
  }
  if (section === 'network-submission') {
    const records = sectionRecords(/network|submission/i);
    if (!records.length) {
      return <div className="sky-empty">No network-submission record is supplied on the active case.</div>;
    }
    return records.map((record) => (
      <section className="sky-merchant-section-record" key={record.id ?? record.title}>
        <strong>{record.title ?? record.id}</strong>
        <FieldList fields={record.fields} />
      </section>
    ));
  }
  if (section === 'merchant-response') {
    return (
      <>
        <FieldList fields={merchantResponseFields(workspace.response)} />
        {workspace.response?.statement ? <div className="sky-notice">{workspace.response.statement}</div> : null}
        {!Object.keys(workspace.response ?? {}).length ? (
          <div className="sky-empty">No merchant-response record is supplied on the active case.</div>
        ) : null}
      </>
    );
  }
  if (section === 'customer-evidence') {
    return (
      <>
        <DocumentRows documents={workspace.documents} onOpen={onOpenDocument} />
        {workspace.requestLink ? (
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => onRequestDocument(workspace.requestLink.query)}
          >
            Open requestable document
          </button>
        ) : null}
      </>
    );
  }
  if (section === 'visa-requirements') {
    const records = sectionRecords(/visa|requirement|network/i);
    return records.length ? records.map((record) => (
      <section className="sky-merchant-section-record" key={record.id ?? record.title}>
        <strong>{record.title ?? record.id}</strong>
        <FieldList fields={record.fields} />
      </section>
    )) : (
      <div className="sky-empty">
        No card-network requirement is supplied here. Merchant Intelligence does not infer a reason code or determination.
      </div>
    );
  }
  return (
    <FieldList fields={asArray(workspace.events).map((item) => [
      item.time ?? item.date ?? 'Recorded event',
      `${item.label ?? 'Case event'}${item.detail ? ` · ${item.detail}` : ''}`,
    ])} />
  );
}

function DocumentRows({ documents = [], onOpen = null }) {
  const rows = asArray(documents);
  if (!rows.length) return <div className="sky-empty">No source document is supplied for this section.</div>;
  return (
    <div className="sky-record-list" aria-label="Supplied documents">
      {rows.map((document) => {
        const id = document.id ?? document.reference ?? document.title;
        return onOpen && id ? (
          <button className="sky-record" type="button" key={id} onClick={() => onOpen(id)}>
            <span>
              <strong>{document.title ?? document.id}</strong>
              <small>{displayValue([document.source, document.status, document.reference])}</small>
            </span>
            <strong aria-hidden="true">›</strong>
          </button>
        ) : (
          <div className="sky-data-row" key={id}>
            <dt>{document.title ?? document.id}</dt>
            <dd>{displayValue([document.source, document.status, document.reference])}</dd>
          </div>
        );
      })}
    </div>
  );
}

export function MerchantIntelligenceTool(props) {
  const {
    activeCase = {},
    query = '',
    reviewed = false,
    initialPayload = null,
  } = props;
  const toolName = 'Merchant Intelligence';
  const workspace = useMemo(
    () => buildExplicitMerchantWorkspace(activeCase),
    [activeCase],
  );
  const routedLookup = useMemo(
    () => clean(
      initialPayload?.query
      ?? initialPayload?.sourceRecordId
      ?? query,
    ),
    [initialPayload, query],
  );
  const routedLookupType = clean(
    initialPayload?.lookupType
    ?? initialPayload?.identifierType
    ?? 'auto',
  );
  const [input, setInput] = useState(routedLookup);
  const [lookupType, setLookupType] = useState(routedLookupType);
  const [resolved, setResolved] = useState(null);
  const [section, setSection] = useState('claim-details');
  const [error, setError] = useState('');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setInput(routedLookup);
    setLookupType(routedLookupType);
    setResolved(null);
    setSection('claim-details');
    setError('');
    setHasRun(false);
  }, [activeCase.id, routedLookup, routedLookupType]);

  function runSearch(event) {
    event.preventDefault();
    setResolved(null);
    setHasRun(true);
    if (!clean(input)) {
      setError('Enter a merchant name, descriptor, MCC, or supplied merchant record ID.');
      return;
    }
    if (!workspace) {
      setError('No supplied merchant intelligence packet is attached to this case.');
      return;
    }
    const match = resolveMerchantLookup(workspace, input, lookupType);
    if (!match) {
      setError('No exact supplied merchant identity or record ID matched that search.');
      return;
    }
    setError('');
    setResolved(match);
    setSection(match.match.recordKind === 'response' ? 'merchant-response' : 'claim-details');
  }

  const primary = workspace?.primaryTransaction ?? null;
  const focusTransaction = resolved?.match?.recordKind === 'transaction'
    ? asArray(workspace?.transactions).find((transaction) => (
        clean(transaction.id) === clean(resolved.match.sourceRecordId)
      )) ?? primary
    : primary;
  const matchingTransactions = asArray(workspace?.matchingTransactions);
  const firstSupplied = matchingTransactions[0] ?? null;
  const lastSupplied = matchingTransactions.at(-1) ?? null;
  const merchantPin = resolved ? formatMerchantPin(workspace, resolved) : null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What merchant, authorization, fulfillment, refund, and dispute evidence is supplied?"
      reference
      displayName="Merchant Intelligence"
      icon="merchant"
      onBack={props.onBackToWorkspace}
      showLuna={false}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-merchant-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="merchant" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find an exact supplied merchant record</strong>
              <p>Only a complete merchant identity, descriptor, MCC, or source record ID unlocks the packet.</p>
            </div>
          </header>
          <form className="sky-merchant-search-row" onSubmit={runSearch} noValidate>
            <label>
              <span>Lookup type</span>
              <select
                value={lookupType}
                onChange={(event) => {
                  setLookupType(event.target.value);
                  setResolved(null);
                  setError('');
                  setHasRun(false);
                }}
              >
                <option value="auto">Detect exact type</option>
                {merchantLookupTypes.map((type) => (
                  <option value={type.id} key={type.id}>{type.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Merchant search</span>
              <input
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setResolved(null);
                  setSection('claim-details');
                  setError('');
                  setHasRun(false);
                }}
                placeholder="Exact merchant name, descriptor, MCC, or record ID"
                aria-label="Search Merchant Intelligence"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="sparkle" size={18} />
              Search
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!hasRun ? <div className="sky-reference-search-message" role="status">Merchant evidence is locked.</div> : null}
        </div>
      </article>

      {resolved && workspace && (
        <article
          className="sky-card span-12 sky-merchant-profile-card"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <span className="sky-merchant-profile-icon" aria-hidden="true">
              <SkyIcon name="merchant" size={30} />
            </span>
            <div className="sky-merchant-profile-copy">
              <small>Matched merchant</small>
              <h2>{workspace.profile.name}</h2>
              <p>{[
                workspace.profile.legalName,
                workspace.profile.descriptor,
              ].filter(Boolean).join(' · ') || resolved.match.label}</p>
              <div>
                {workspace.profile.mcc ? <span>MCC {workspace.profile.mcc}</span> : null}
                {workspace.profile.category ? <span>{workspace.profile.category}</span> : null}
                {workspace.profile.channel ? <span>{workspace.profile.channel}</span> : null}
              </div>
            </div>
            <div className="sky-merchant-profile-luna" aria-hidden="true">
              <img src="/assets/luna-anime-purple-v1.webp" alt="" />
              <i>♥</i>
            </div>
          </div>
        </article>
      )}

      {resolved && workspace && focusTransaction ? (
        <article
          className="sky-card span-12 sky-merchant-transaction-card"
          data-tone="pink"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <div>
              <small>
                {focusTransaction.id === primary?.id
                  ? 'Transaction under review'
                  : 'Matched merchant transaction'}
              </small>
              <strong>{focusTransaction.amount ?? activeCase.amount ?? 'Amount not supplied'}</strong>
              <p>{focusTransaction.id} · {focusTransaction.posted ?? 'Date not supplied'}</p>
              <span>{[
                focusTransaction.instrument,
                focusTransaction.channel,
                focusTransaction.status,
              ].filter(Boolean).join(' · ')}</span>
            </div>
            <span aria-hidden="true"><SkyIcon name="evidence" size={34} /></span>
          </div>
        </article>
      ) : null}

      {resolved && workspace && (
        <section className="span-12 sky-merchant-history-grid" aria-label="Supplied merchant history">
          <article>
            <span aria-hidden="true"><SkyIcon name="hash" size={19} /></span>
            <small>Transactions</small>
            <strong>{workspace.history.transactionCount}</strong>
            <em>Exact same-merchant records</em>
          </article>
          <article>
            <span aria-hidden="true"><SkyIcon name="amount" size={19} /></span>
            <small>Supplied total</small>
            <strong>{workspace.history.totalAmountDisplay ?? 'Not supplied'}</strong>
            <em>From matched records only</em>
          </article>
          <article>
            <span aria-hidden="true"><SkyIcon name="calendar" size={19} /></span>
            <small>First / last supplied</small>
            <strong>{firstSupplied?.posted ?? 'Not supplied'}</strong>
            <em>{lastSupplied?.posted ?? 'No second record'}</em>
          </article>
        </section>
      )}

      {resolved && workspace && (
        <section className="span-12 sky-merchant-evidence-pair" aria-label="Policy and merchant response">
          <article className="sky-card" data-shape="notched" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <span aria-hidden="true"><SkyIcon name="shield" size={21} /></span>
                <div>
                  <small>Cancellation &amp; policy</small>
                  <h2>{workspace.policyDocument?.title ?? 'No policy document supplied'}</h2>
                </div>
              </header>
              <p>{workspace.policyDocument?.summary ?? workspace.policyDocument?.status ?? 'Request or locate a source policy before relying on merchant terms.'}</p>
              {workspace.policyLink ? (
                <button
                  className="sky-button-secondary"
                  type="button"
                  onClick={() => openRelatedTool(props, 'Document Viewer', workspace.policyLink.query)}
                >
                  View source policy
                </button>
              ) : workspace.requestLink ? (
                <button
                  className="sky-button-secondary"
                  type="button"
                  onClick={() => openRelatedTool(props, 'Document Request', workspace.requestLink.query)}
                >
                  Open Document Request
                </button>
              ) : null}
            </div>
          </article>
          <article className="sky-card" data-tone="pink" data-shape="ribbon" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <SkySparkles />
            <div className="sky-card-inner">
              <header>
                <span aria-hidden="true"><SkyIcon name="evidence" size={21} /></span>
                <div>
                  <small>Merchant response</small>
                  <h2>{workspace.response?.status ?? 'No response supplied'}</h2>
                </div>
              </header>
              <p>{workspace.response?.statement ?? 'No merchant statement is attached to the active case.'}</p>
              <FieldList fields={[
                ['Received', workspace.response?.receivedDate],
                ['Cancellation request found', workspace.response?.cancellationRequestFound],
                ['Refund issued', workspace.response?.refundIssued],
              ]} />
            </div>
          </article>
        </section>
      )}

      {resolved && workspace && (
        <article
          className="sky-card span-12 sky-merchant-section-deck"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <nav aria-label="Merchant Intelligence sections">
              {merchantIntelligenceTabs.map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  aria-pressed={section === tab.id}
                  onClick={() => setSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <section className="sky-merchant-section-content">
              <header>
                <div>
                  <small>Supplied source section</small>
                  <h2>{merchantIntelligenceTabs.find((tab) => tab.id === section)?.label}</h2>
                </div>
              </header>
              <MerchantSection
                activeCase={activeCase}
                workspace={workspace}
                section={section}
                onOpenDocument={(documentId) => openRelatedTool(props, 'Document Viewer', documentId)}
                onRequestDocument={(documentId) => openRelatedTool(props, 'Document Request', documentId)}
              />
            </section>
          </div>
        </article>
      )}

      {resolved && workspace && merchantPin && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={merchantPin.id}
          record={{
            id: merchantPin.id,
            profile: workspace.profile,
            detail: merchantPin.detail,
            pinPayload: merchantPin,
          }}
          pinLabel={merchantPin.label}
          reviewed={reviewed}
          reference
        >
          {workspace.policyLink ? (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Document Viewer', workspace.policyLink.query)}
            >
              Open exact policy document
            </button>
          ) : null}
          {workspace.requestLink ? (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Document Request', workspace.requestLink.query)}
            >
              Open exact document request
            </button>
          ) : null}
        </EvidenceActions>
      )}
    </ToolShell>
  );
}

export function PaymentVerificationTool(props) {
  const {
    activeCase = {},
    reviewed = false,
    query = '',
    initialPayload = null,
  } = props;
  const toolName = 'Payment Verification';
  const source = useMemo(() => explicitFinancialSource(activeCase), [activeCase]);
  const records = source.paymentVerification;
  const routedPrefill = useMemo(() => {
    if (initialPayload?.bankCode && initialPayload?.destinationId) {
      return {
        bankCode: clean(initialPayload.bankCode),
        destinationId: clean(initialPayload.destinationId),
        ownerName: clean(initialPayload.ownerName),
      };
    }
    return paymentLookupPrefillFromQuery(query, records);
  }, [initialPayload, query, records]);
  const [lookup, setLookup] = useState({
    bankCode: routedPrefill?.bankCode ?? '',
    destinationId: routedPrefill?.destinationId ?? '',
    ownerName: routedPrefill?.ownerName ?? '',
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [lookupHistory, setLookupHistory] = useState([]);

  useEffect(() => {
    setLookup({
      bankCode: routedPrefill?.bankCode ?? '',
      destinationId: routedPrefill?.destinationId ?? '',
      ownerName: routedPrefill?.ownerName ?? '',
    });
    setResult(null);
    setError('');
    setLookupHistory([]);
  }, [activeCase.id, routedPrefill]);

  const relationshipLabel = activeCase.customerType === 'business'
    ? 'Optional owner or business name'
    : /payroll|employee/i.test(`${activeCase.productType ?? ''} ${activeCase.workflowType ?? ''}`)
      ? 'Optional employee or employer name'
      : 'Optional customer or account-owner name';

  function updateLookup(field, value) {
    setLookup((current) => ({ ...current, [field]: value }));
    setResult(null);
    setError('');
  }

  function runLookup(event) {
    event.preventDefault();
    const submitted = {
      bankCode: clean(lookup.bankCode),
      destinationId: clean(lookup.destinationId),
      ownerName: clean(lookup.ownerName),
    };
    setResult(null);
    if (!submitted.bankCode || !submitted.destinationId) {
      setError('Bank Code and Destination ID are required. The relationship-aware name comparison is optional.');
      return;
    }
    if (!records.length) {
      setError('No supplied payment-verification records are attached to this case.');
      return;
    }
    const resolved = resolvePaymentLookup(records, submitted, activeCase);
    setError('');
    setResult(resolved);
    setLookupHistory((current) => [{
      id: `${Date.now()}-${submitted.bankCode}-${submitted.destinationId}`,
      lookup: submitted,
      result: resolved,
    }, ...current.filter((item) => (
      item.lookup.bankCode !== submitted.bankCode
      || item.lookup.destinationId !== submitted.destinationId
      || item.lookup.ownerName !== submitted.ownerName
    ))].slice(0, 6));
  }

  const record = result?.state === 'found' ? result.record : null;
  const submittedName = clean(lookup.ownerName);
  const attemptCount = record?.verificationAttempts?.length ?? 0;

  function openLookupHistory(item) {
    setLookup(item.lookup);
    setResult(item.result);
    setError('');
  }

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Verify an exact destination and review only the supplied account evidence."
      reference
      displayName="Payment Verification"
      icon="shield"
      onBack={props.onBackToWorkspace}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-payment-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="shield" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Verify a specific payment destination</strong>
              <p>No ownership, standing, prior-use, return, or account-age result appears before Run verification.</p>
            </div>
          </header>
          <form className="sky-payment-reference-form" onSubmit={runLookup} noValidate>
            <label>
              <span>Bank Code</span>
              <input
                value={lookup.bankCode}
                onChange={(event) => updateLookup('bankCode', event.target.value)}
                placeholder="Enter Bank Code"
                aria-label="Bank Code"
                autoComplete="off"
              />
            </label>
            <label>
              <span>Destination ID</span>
              <input
                value={lookup.destinationId}
                onChange={(event) => updateLookup('destinationId', event.target.value)}
                placeholder="Enter Destination ID"
                aria-label="Destination ID"
                autoComplete="off"
              />
            </label>
            <label className="sky-payment-reference-name">
              <span>{relationshipLabel}</span>
              <input
                value={lookup.ownerName}
                onChange={(event) => updateLookup('ownerName', event.target.value)}
                placeholder="Optional name comparison"
                aria-label="Optional payment relationship name"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="shield" size={18} />
              Run verification
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
        </div>
      </article>

      {!result ? (
        <article className="sky-card span-12 sky-payment-reference-locked">
          <div className="sky-card-inner">
            <SkyIcon name="sparkle" size={21} />
            <div>
              <strong>Verification result is hidden</strong>
              <p>Enter the exact paired training identifiers, then run the lookup.</p>
            </div>
          </div>
        </article>
      ) : null}

      {lookupHistory.length ? (
        <article
          className="sky-card span-12 sky-reference-result-rail sky-payment-history-rail"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <header>
              <div><small>Recent verifications</small><strong>This case session only</strong></div>
              <span>{lookupHistory.length}</span>
            </header>
            <div className="sky-reference-result-scroll" role="group" aria-label="Payment Verification lookup history">
              {lookupHistory.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-current={result === item.result ? 'true' : undefined}
                  onClick={() => openLookupHistory(item)}
                >
                  <small>{item.lookup.bankCode}</small>
                  <strong>{item.lookup.destinationId}</strong>
                  <span>{item.lookup.ownerName ? item.result.nameMatchResult : 'Name not compared'}</span>
                </button>
              ))}
            </div>
          </div>
        </article>
      ) : null}

      {result?.state === 'not-found' && (
        <article
          className="sky-card span-12 sky-payment-reference-not-found"
          data-shape="shield"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <SkyIcon name="alert" size={27} />
            <div role="status">
              <strong>Destination not found</strong>
              <p>No exact Bank Code and Destination ID pair was found in the supplied case records. A missing destination does not determine the case outcome.</p>
            </div>
          </div>
        </article>
      )}

      {record && (
        <>
          <article
            className="sky-card span-12 sky-payment-reference-primary"
            data-tone={lookup.ownerName ? paymentResultTone(result.nameMatchResult) : 'blue'}
            data-shape="ribbon"
            data-sparkle="true"
          >
            <span className="sky-card-sheen" aria-hidden="true" />
            <SkySparkles />
            <div className="sky-card-inner">
              <header className="sky-payment-reference-account">
                <span className="sky-payment-reference-avatar" aria-hidden="true">
                  {submittedName ? referenceInitials(submittedName) : 'PV'}
                </span>
                <div>
                  <small>Account verification details</small>
                  <h2>{submittedName || 'Name not compared'}</h2>
                  <p>{record.type}</p>
                  <span>{result.bankCode} · {result.destinationId}</span>
                </div>
                <strong className="sky-payment-reference-match" data-tone={paymentResultTone(result.nameMatchResult)}>
                  {lookup.ownerName ? result.nameMatchResult : 'Name not compared'}
                </strong>
              </header>
              <div className="sky-payment-reference-metrics">
                <article>
                  <span aria-hidden="true"><SkyIcon name="user" size={18} /></span>
                  <small>Name relationship</small>
                  <strong>{lookup.ownerName ? result.nameMatchResult : 'Not requested'}</strong>
                  <p>{lookup.ownerName ? result.matchedPartyType : 'Optional comparison omitted'}</p>
                </article>
                <article>
                  <span aria-hidden="true"><SkyIcon name="check" size={18} /></span>
                  <small>Account status</small>
                  <strong>{result.accountState}</strong>
                  <p>As of {result.statusAsOf}</p>
                </article>
                <article>
                  <span aria-hidden="true"><SkyIcon name="payment" size={18} /></span>
                  <small>NSF result</small>
                  <strong>{result.nsfStatus}</strong>
                  <p>Separate from account status</p>
                </article>
                <article>
                  <span aria-hidden="true"><SkyIcon name="calendar" size={18} /></span>
                  <small>Time on record</small>
                  <strong>{result.accountAgeLabel}</strong>
                  <p>{record.firstSeen}</p>
                </article>
              </div>
            </div>
          </article>

          <div className="span-12 sky-payment-reference-details">
            <article className="sky-card" data-shape="notched" data-sparkle="true">
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="user" size={20} /></span>
                  <div><small>{record.laneVariant} relationship</small><h2>Ownership and use</h2></div>
                </header>
                <FieldList fields={[
                  ['Source record', result.recordId],
                  ['Ownership status', record.ownershipStatus],
                  ['Ownership history', record.ownershipHistory],
                  ['Prior-use history', record.priorUseHistory],
                  ['Customer / business link', record.customerLink],
                  ['Trusted contact source', record.trustedContactSource],
                ]} />
              </div>
            </article>

            <article
              className="sky-card"
              data-tone="pink"
              data-shape="notched"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="payment" size={20} /></span>
                  <div><small>Standing and changes</small><h2>Destination record</h2></div>
                </header>
                <FieldList fields={[
                  ['Payment lane', record.laneVariant],
                  ['Payment type', record.paymentType],
                  ['Previous destination', record.oldDestination],
                  ['Current destination', record.newDestination],
                  ['Change comparison', record.changeComparison],
                  ['Return / NSF history', record.returnHistory],
                  ['Callback status', record.callbackStatus],
                ]} />
              </div>
            </article>
          </div>

          <article
            className="sky-card span-12 sky-payment-reference-attempts"
            data-shape="ribbon"
            data-sparkle="true"
          >
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <div><small>Verification activity</small><h2>Recorded attempts</h2></div>
                <span>{attemptCount}</span>
              </header>
              {record.verificationAttempts.length ? (
                <FieldList fields={record.verificationAttempts.map((attempt) => [
                  `${attempt.time} · ${attempt.method}`,
                  `${attempt.result} · ${attempt.note}`,
                ])} />
              ) : <div className="sky-empty">No verification attempts are supplied.</div>}
            </div>
          </article>

          <article
            className="sky-card span-12 sky-payment-reference-summary"
            data-shape="shield"
            data-sparkle="true"
          >
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <span aria-hidden="true"><SkyIcon name="shield" size={31} /></span>
              <div>
                <small>Verification summary</small>
                <h2>Exact record found</h2>
                <p>{lookup.ownerName
                  ? `${result.nameMatchResult}; ${result.accountState} account status; ${result.nsfStatus}.`
                  : `${result.accountState} account status; ${result.nsfStatus}; name comparison was not requested.`}</p>
              </div>
            </div>
          </article>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={record.id}
            record={record}
            pinLabel={`${record.id} · ${result.bankCode} · ${result.destinationId}`}
            reviewed={reviewed}
            reference
          />
        </>
      )}
    </ToolShell>
  );
}

function explicitBusinessProfile(activeCase, source) {
  const first = source.business360[0] ?? {};
  const supplied = activeCase.businessProfile ?? {};
  const payroll = source.companyPayrollProfile ?? {};
  return {
    businessId: supplied.businessId ?? supplied.registrationId ?? first.id ?? payroll.businessId,
    legalName: supplied.legalName
      ?? supplied.businessName
      ?? activeCase.profile?.business
      ?? first.entity
      ?? payroll.legalName,
    dba: supplied.dba,
    entityType: supplied.entityType,
    registrationId: supplied.registrationId,
    standing: supplied.standing ?? first.status,
    address: supplied.address ?? supplied.operatingAddress ?? payroll.address,
    phone: supplied.phone,
    email: supplied.email,
    website: supplied.website,
    relationship: first.relationship,
    observed: first.observed,
    context: first.context,
    maskedEin: supplied.ein ?? payroll.maskedEin,
    payrollId: payroll.payrollId,
    paySchedule: payroll.paySchedule,
    activeEmployeeCount: payroll.activeEmployeeCount,
  };
}

const businessSearchModes = {
  businessId: {
    label: 'Business or registration ID',
    normalize: normalizeBusinessIntelId,
    values(profile) {
      return [profile.businessId, profile.registrationId, profile.payrollId];
    },
  },
  phone: {
    label: 'Business phone',
    normalize: normalizeBusinessIntelPhone,
    values(profile) {
      return [profile.phone];
    },
  },
  address: {
    label: 'Business address',
    normalize: normalizeBusinessIntelAddress,
    values(profile) {
      return [profile.address];
    },
  },
};

function businessRoutedPrefill(profile, query = '', initialPayload = null) {
  const routedCandidates = [
    initialPayload?.sourceRecordId,
    initialPayload?.businessId,
    initialPayload?.registrationId,
    initialPayload?.phone,
    initialPayload?.address,
    initialPayload?.query,
    query,
  ].map(clean).filter(Boolean);
  const sourceMatch = Object.entries(businessSearchModes).flatMap(([modeKey, mode]) => (
    routedCandidates
      .filter((value) => mode.values(profile)
        .map(mode.normalize)
        .filter(Boolean)
        .includes(mode.normalize(value)))
      .map((value) => ({ modeKey, value }))
  ))[0] ?? null;
  const routedValue = sourceMatch?.value ?? routedCandidates[0] ?? '';
  if (!routedValue) {
    return { businessName: '', mode: 'businessId', secondary: '' };
  }

  const label = lower(initialPayload?.label);
  const labeledMode = /phone/.test(label)
    ? 'phone'
    : /address/.test(label)
      ? 'address'
      : /business|registration/.test(label)
        ? 'businessId'
        : '';
  const mode = sourceMatch?.modeKey ?? labeledMode ?? 'businessId';
  const exactSourceMatch = businessSearchModes[mode].values(profile)
    .map(businessSearchModes[mode].normalize)
    .filter(Boolean)
    .includes(businessSearchModes[mode].normalize(routedValue));

  return {
    businessName: exactSourceMatch
      ? clean(initialPayload?.businessName ?? profile.legalName)
      : clean(initialPayload?.businessName),
    mode,
    secondary: routedValue,
  };
}

export function Business360Tool(props) {
  const {
    activeCase = {},
    reviewed = false,
    query = '',
    initialPayload = null,
  } = props;
  const toolName = 'Business 360';
  const source = useMemo(() => explicitBusinessSource(activeCase), [activeCase]);
  const profile = useMemo(
    () => explicitBusinessProfile(activeCase, source),
    [activeCase, source],
  );
  const routedPrefill = useMemo(
    () => businessRoutedPrefill(profile, query, initialPayload),
    [initialPayload, profile, query],
  );
  const [lookup, setLookup] = useState(routedPrefill);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLookup(routedPrefill);
    setOpened(false);
    setError('');
  }, [activeCase.id, routedPrefill]);

  function updateBusinessLookup(patch) {
    setLookup((current) => ({ ...current, ...patch }));
    setOpened(false);
    setError('');
  }

  function runSearch(event) {
    event.preventDefault();
    setOpened(false);
    const mode = businessSearchModes[lookup.mode];
    const submittedName = normalizeBusinessIntelName(lookup.businessName);
    const expectedName = normalizeBusinessIntelName(profile.legalName);
    const submittedSecondary = mode.normalize(lookup.secondary);
    const expectedValues = mode.values(profile).map(mode.normalize).filter(Boolean);
    if (!submittedName || !submittedSecondary) {
      setError('Enter the business name and one exact secondary business value.');
      return;
    }
    if (!source.supplied || !profile.legalName) {
      setError('No supplied business relationship record is attached to this case.');
      return;
    }
    if (submittedName !== expectedName || !expectedValues.includes(submittedSecondary)) {
      setError('No supplied business relationship matched both search values.');
      return;
    }
    setError('');
    setOpened(true);
  }

  const matchedRecordId = profile.businessId
    ?? source.business360[0]?.id
    ?? profile.legalName;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Search supplied business identity and relationship facts without predicting the case outcome."
      reference
      displayName="Business Intelligence"
      icon="building"
      onBack={props.onBackToWorkspace}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-business-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="search" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find one supplied business relationship</strong>
              <p>Enter the exact legal name plus one exact secondary value. Business details remain hidden until both fields match.</p>
            </div>
          </header>
          <form className="sky-business-reference-search-form" onSubmit={runSearch} noValidate>
            <label>
              <span>Business name</span>
              <input
                value={lookup.businessName}
                onChange={(event) => updateBusinessLookup({ businessName: event.target.value })}
                placeholder="Enter exact business name"
                aria-label="Business name"
                autoComplete="off"
              />
            </label>
            <label>
              <span>Secondary search type</span>
              <select
                value={lookup.mode}
                onChange={(event) => updateBusinessLookup({ mode: event.target.value, secondary: '' })}
                aria-label="Business secondary search type"
              >
                {Object.entries(businessSearchModes).map(([key, mode]) => (
                  <option key={key} value={key}>{mode.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{businessSearchModes[lookup.mode].label}</span>
              <input
                value={lookup.secondary}
                onChange={(event) => updateBusinessLookup({ secondary: event.target.value })}
                placeholder="Enter exact supplied value"
                aria-label="Business secondary search value"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="search" size={18} />
              Run business search
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!opened && !error ? (
            <div className="sky-reference-search-message" role="status">No business profile is open.</div>
          ) : null}
        </div>
      </article>

      {opened && (
        <>
          <section className="span-12 sky-business-reference-dashboard" aria-label="Matched business profile">
            <div className="sky-business-reference-profile-row">
              <article
                className="sky-card sky-business-reference-profile"
                data-shape="shield"
                data-sparkle="true"
              >
                <span className="sky-card-sheen" aria-hidden="true" />
                <SkySparkles />
                <div className="sky-card-inner">
                  <header>
                    <span className="sky-business-reference-mark" aria-hidden="true">
                      <SkyIcon name="building" size={31} />
                    </span>
                    <div>
                      <small>Exact match returned</small>
                      <h2>{profile.legalName}</h2>
                      <p>{profile.relationship ?? 'Supplied relationship record'}</p>
                    </div>
                    <span className="sky-chip">Source record</span>
                  </header>
                  <FieldList fields={[
                    ['DBA', profile.dba],
                    ['Entity type', profile.entityType],
                    ['Operating address', profile.address],
                    ['Phone', profile.phone],
                    ['Email', profile.email],
                    ['Website', profile.website],
                    ['Recorded relationship', profile.relationship],
                    ['Observed', profile.observed],
                  ]} />
                </div>
              </article>

              <article
                className="sky-card sky-business-reference-registration"
                data-tone="pink"
                data-shape="notched"
              >
                <div className="sky-card-inner">
                  <header>
                    <span aria-hidden="true"><SkyIcon name="evidence" size={23} /></span>
                    <div><small>Registration</small><h2>Business identity</h2></div>
                  </header>
                  <FieldList fields={[
                    ['Training Business ID', profile.businessId],
                    ['Registration ID', profile.registrationId],
                    ['Masked EIN', profile.maskedEin],
                    ['Entity standing', profile.standing],
                    ['Source context', profile.context],
                  ]} />
                </div>
              </article>
            </div>

            <article
              className="sky-card sky-business-reference-relationships"
              data-shape="ribbon"
            >
              <div className="sky-card-inner">
                <header className="sky-section-heading">
                  <span className="sky-business-reference-section-icon" aria-hidden="true">
                    <SkyIcon name="payment" size={22} />
                  </span>
                  <div>
                    <p>Institution relationship</p>
                    <h2>Supplied relationship records</h2>
                    <span>Names, relationship types, and status are factual source fields, not a case determination.</span>
                  </div>
                  <span className="sky-chip">{source.business360.length} records</span>
                </header>
                {source.business360.length ? (
                  <div className="sky-business-reference-account-list">
                    {source.business360.map((record, index) => (
                      <article data-tone={index % 2 ? 'pink' : 'blue'} key={record.id}>
                        <span aria-hidden="true"><SkyIcon name="payment" size={20} /></span>
                        <div>
                          <small>{record.relationship ?? 'Business relationship'}</small>
                          <strong>{record.entity ?? record.id}</strong>
                          <p>{[record.status, record.observed].filter(Boolean).join(' · ')}</p>
                        </div>
                        <em>{record.id}</em>
                      </article>
                    ))}
                  </div>
                ) : <div className="sky-empty">No additional business objects are supplied.</div>}
                {source.companyPayrollProfile ? (
                  <div className="sky-business-reference-payroll">
                    <span aria-hidden="true"><SkyIcon name="building" size={22} /></span>
                    <div>
                      <small>Payroll relationship</small>
                      <strong>{profile.payrollId ?? 'Recorded payroll profile'}</strong>
                      <p>{[profile.paySchedule, profile.activeEmployeeCount ? `${profile.activeEmployeeCount} active employees` : ''].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>

            <div className="sky-business-reference-lower">
              <article
                className="sky-card sky-business-reference-owners"
                data-tone="pink"
                data-shape="shield"
              >
                <div className="sky-card-inner">
                  <header>
                    <span aria-hidden="true"><SkyIcon name="user" size={22} /></span>
                    <div><small>Named profiles</small><h2>Employee records</h2></div>
                    <span>{source.employeeProfile.length}</span>
                  </header>
                  {source.employeeProfile.length ? (
                    <div className="sky-business-reference-person-list">
                      {source.employeeProfile.map((employee) => (
                        <article key={employee.id}>
                          <span aria-hidden="true">{referenceInitials(employee.name)}</span>
                          <div>
                            <strong>{employee.name}</strong>
                            <small>{[employee.role, employee.status].filter(Boolean).join(' · ')}</small>
                            <p>{[employee.employer, employee.lastSeen].filter(Boolean).join(' · ')}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="sky-empty">No employee profile is supplied.</div>}
                </div>
              </article>

              <article
                className="sky-card sky-business-reference-access"
                data-shape="notched"
              >
                <div className="sky-card-inner">
                  <header>
                    <span aria-hidden="true"><SkyIcon name="building" size={22} /></span>
                    <div><small>Recorded payroll</small><h2>Payroll runs</h2></div>
                    <span>{source.payrollRuns.length}</span>
                  </header>
                  {source.payrollRuns.length ? (
                    <div className="sky-business-reference-person-list">
                      {source.payrollRuns.map((run) => (
                        <article key={run.id}>
                          <span aria-hidden="true">PR</span>
                          <div>
                            <strong>{run.id}</strong>
                            <small>{[run.status ?? run.runStatus, run.payDate ?? run.processedDate].filter(Boolean).join(' · ')}</small>
                            <p>{[run.fundingAccount, run.settlementDate].filter(Boolean).join(' · ')}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : <div className="sky-empty">No payroll run is supplied.</div>}
                </div>
              </article>
            </div>

            <article
              className="sky-card sky-business-reference-coverage"
              data-shape="ribbon"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <SkySparkles />
              <div className="sky-card-inner">
                <span aria-hidden="true"><SkyIcon name="shield" size={30} /></span>
                <div>
                  <small>Evidence coverage</small>
                  <h2>Exact source relationship found</h2>
                  <p>{source.business360.length} relationship records · {source.employeeProfile.length} employee records · {source.payrollRuns.length} payroll runs</p>
                </div>
              </div>
            </article>
          </section>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={matchedRecordId}
            record={{
              id: matchedRecordId,
              recordId: matchedRecordId,
              business: {
                businessId: profile.businessId,
                legalName: profile.legalName,
                dba: profile.dba,
                entityType: profile.entityType,
                registrationId: profile.registrationId,
                maskedEin: profile.maskedEin,
                standing: profile.standing,
                operatingAddress: profile.address,
                phone: profile.phone,
                email: profile.email,
                website: profile.website,
                relationship: profile.relationship,
                observed: profile.observed,
                context: profile.context,
              },
              relationships: source.business360.map((record) => ({
                id: record.id,
                entity: record.entity,
                relationship: record.relationship,
                status: record.status,
                observed: record.observed,
                context: record.context,
              })),
              employeeProfiles: source.employeeProfile.map((employee) => ({
                id: employee.id,
                name: employee.name,
                role: employee.role,
                employer: employee.employer,
                status: employee.status,
                lastSeen: employee.lastSeen,
              })),
              payrollRelationship: source.companyPayrollProfile ? {
                businessId: source.companyPayrollProfile.businessId,
                legalName: source.companyPayrollProfile.legalName,
                address: source.companyPayrollProfile.address,
                maskedEin: source.companyPayrollProfile.maskedEin,
                payrollId: profile.payrollId,
                paySchedule: profile.paySchedule,
                activeEmployeeCount: profile.activeEmployeeCount,
                selectedDateRange: source.companyPayrollProfile.selectedDateRange,
              } : null,
              payrollRuns: source.payrollRuns.map((run) => ({
                id: run.id,
                status: run.status ?? run.runStatus,
                payDate: run.payDate ?? run.processedDate,
                fundingAccount: run.fundingAccount,
                settlementDate: run.settlementDate,
              })),
            }}
            pinLabel={`${matchedRecordId ?? 'Business'} · ${profile.legalName}`}
            reviewed={reviewed}
            reference
          >
            {source.employeeProfile.length > 0 && (
              <button
                className="sky-button-secondary"
                type="button"
                onClick={() => openRelatedTool(props, 'Employee Profile')}
              >
                Open Employee Profile
              </button>
            )}
            {source.payrollRuns.length > 0 && (
              <button
                className="sky-button-secondary"
                type="button"
                onClick={() => openRelatedTool(props, 'Payroll History')}
              >
                Open Payroll History
              </button>
            )}
          </EvidenceActions>
        </>
      )}
    </ToolShell>
  );
}

export function EmployeeProfileTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Employee Profile';
  const source = useMemo(() => explicitBusinessSource(activeCase), [activeCase]);
  const paymentRecords = useMemo(
    () => explicitFinancialSource(activeCase).paymentVerification,
    [activeCase],
  );
  const records = useMemo(
    () => (source.employeeProfile.length ? getEmployeeProfiles(activeCase) : []),
    [activeCase, source.employeeProfile.length],
  );
  const [input, setInput] = useState(query);
  const [record, setRecord] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setInput(query);
    setRecord(null);
    setError('');
  }, [activeCase.id, query]);

  function runSearch(event) {
    event.preventDefault();
    const requested = lower(input);
    setRecord(null);
    if (!requested) {
      setError('Enter an exact employee ID or employee name.');
      return;
    }
    if (!records.length) {
      setError('No supplied employee profile is attached to this case.');
      return;
    }
    const lookup = resolveEmployeeProfileLookup(records, requested);
    if (lookup.state === 'ambiguous') {
      setError('Multiple supplied employee profiles share that exact name. Search an exact Employee ID.');
      return;
    }
    if (lookup.state !== 'found') {
      setError('No supplied employee profile matched that exact ID or name.');
      return;
    }
    setError('');
    setRecord(lookup.record);
  }

  function changeInput(value) {
    setInput(value);
    setRecord(null);
    setError('');
  }

  function paymentHintFor(destination) {
    if (
      !/direct deposit/i.test(destination?.method ?? '')
      || !validPayrollLookupValue(destination?.bankCode)
      || !validPayrollLookupValue(destination?.destinationId)
    ) return '';
    const lookup = {
      bankCode: destination.bankCode,
      destinationId: destination.destinationId,
      ownerName: record?.name ?? '',
    };
    return resolvePaymentLookup(paymentRecords, lookup, activeCase).state === 'found'
      ? buildPaymentLookupHint(lookup)
      : '';
  }

  const latestSnapshot = record?.latestPaycheck ?? null;
  const latestEmployee = latestSnapshot?.employee ?? null;
  const latestPaystub = latestSnapshot?.paystub ?? null;
  const latestDestinations = latestSnapshot?.destinations ?? EMPTY_LIST;
  const currentPayment = record?.currentPaymentPlan ?? null;
  const profileFacts = record ? [
    ['Department', record.department, 'building'],
    ['Position', record.position ?? record.role, 'cases'],
    ['Hire date', record.hireDate, 'calendar'],
    ['Employment status', record.employmentStatus ?? record.status, 'check'],
    ['Compensation type', record.compensationType ?? record.payType, 'payment'],
    ['Pay schedule', record.paySchedule, 'clock'],
    ['Current rate', record.currentRate, 'amount'],
    ['Employer', record.employer, 'merchant'],
    ['Address', record.address, 'globe'],
    ['W-4 setup', record.w4Setup, 'evidence'],
    ['Tax elections', record.taxElections, 'review'],
    ['Latest payroll activity', record.lastSeen, 'calendar'],
  ].filter(([, value]) => value !== null && value !== undefined && value !== '') : EMPTY_LIST;
  const evidenceRecord = record ? {
    ...record,
    id: record.id,
    recordId: record.id,
    pinPayload: {
      id: record.id,
      recordId: record.id,
      sourceRecordId: record.id,
      value: record.id,
      label: `Employee ID: ${record.id}`,
      query: record.id,
      identifierType: 'employee-id',
      identifierLabel: 'Employee ID',
    },
  } : null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Search the supplied employee, pay, and payment-history records."
      reference
      icon="user"
      onBack={props.onBackToWorkspace}
    >
      <article
        className="sky-card span-12 sky-employee-search"
        data-shape="notched"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="search" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find an exact employee profile</strong>
              <p>Employment, paycheck, and destination facts remain hidden until an exact Employee ID or unique exact name matches.</p>
            </div>
          </header>
          <form className="sky-employee-search-form" onSubmit={runSearch} noValidate>
            <label>
              <span>Employee ID or name</span>
              <input
                value={input}
                onChange={(event) => changeInput(event.target.value)}
                placeholder="Enter exact Employee ID or name"
                aria-label="Search Employee Profile"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit" aria-label="Run employee search">
              <SkyIcon name="search" size={18} />
              <span>Run employee search</span>
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!record && !error ? (
            <div className="sky-reference-search-message" role="status">No employee profile is open.</div>
          ) : null}
        </div>
      </article>

      {record && (
        <>
          <article
            className="sky-card span-12 sky-employee-hero"
            data-shape="ribbon"
            data-sparkle="true"
          >
            <span className="sky-card-sheen" aria-hidden="true" />
            <SkySparkles />
            <div className="sky-card-inner">
              <header className="sky-employee-identity">
                <span className="sky-employee-avatar" aria-hidden="true">
                  <SkyIcon name="user" size={36} />
                  <i>✦</i>
                </span>
                <div>
                  <small>Supplied employee profile</small>
                  <h2>{record.name}</h2>
                  <p>{record.id}</p>
                  <span>{[record.position ?? record.role, record.employer].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="sky-employee-statuses">
                  {record.status ? <span>{record.status}</span> : null}
                  {record.employmentType ? <span>{record.employmentType}</span> : null}
                </div>
              </header>
              <div className="sky-employee-facts">
                {profileFacts.map(([label, value, icon]) => (
                  <article key={label}>
                    <span aria-hidden="true"><SkyIcon name={icon} size={18} /></span>
                    <div><small>{label}</small><strong>{displayValue(value)}</strong></div>
                  </article>
                ))}
              </div>
            </div>
          </article>

          <section className="span-12 sky-employee-pay-grid" aria-label="Employee pay details">
            <article
              className="sky-card sky-employee-paycheck"
              data-shape="notched"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="amount" size={22} /></span>
                  <div><small>Newest supplied occurrence</small><h3>Latest Paycheck</h3></div>
                  {latestEmployee?.paymentStatus ? <em>{latestEmployee.paymentStatus}</em> : null}
                </header>
                {latestPaystub ? (
                  <>
                    <strong className="sky-employee-paycheck-total">{formatMoney(latestPaystub.summary?.netPay)}</strong>
                    <FieldList fields={[
                      ['Pay date', latestSnapshot.payDate ?? latestPaystub.payDate],
                      ['Pay period', latestPaystub.payPeriod?.label ?? latestSnapshot.payPeriod?.label],
                      ['Gross pay', formatMoney(latestPaystub.summary?.grossPay)],
                      ['Paystub ID', latestPaystub.id],
                      ['Payroll run', latestSnapshot.runId],
                    ]} />
                    <button
                      className="sky-button-secondary"
                      type="button"
                      onClick={() => openRelatedTool(props, 'Payroll History', latestPaystub.id)}
                    >
                      Open exact paystub
                    </button>
                  </>
                ) : (
                  <div className="sky-empty">
                    The supplied employee occurrence has no paystub detail. No amount was inferred.
                  </div>
                )}
              </div>
            </article>

            <article
              className="sky-card sky-employee-deposit"
              data-tone="pink"
              data-shape="notched"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="payment" size={22} /></span>
                  <div><small>Newest supplied paycheck</small><h3>Payment Destinations</h3></div>
                  <em>{latestDestinations.length}</em>
                </header>
                {latestDestinations.length ? (
                  <div className="sky-employee-destination-list">
                    {latestDestinations.map((destination, index) => {
                      const paymentHint = paymentHintFor(destination);
                      const isPaperCheck = /paper check/i.test(destination.method ?? '');
                      return (
                        <article key={`${destination.id ?? 'destination'}-${index}`}>
                          <header>
                            <span>{destination.method ?? `Destination ${index + 1}`}</span>
                            <strong>{formatMoney(destination.amount)}</strong>
                          </header>
                          <FieldList fields={[
                            ['Bank Code', isPaperCheck ? null : destination.bankCode],
                            ['Destination ID', isPaperCheck ? null : destination.destinationId],
                            ['Check number', isPaperCheck ? destination.checkNumber : null],
                            ['Status', destination.status],
                            ['First seen', destination.firstSeen],
                            ['Payment record ID', destination.paymentRecordId],
                          ]} />
                          {paymentHint ? (
                            <button
                              className="sky-button-secondary"
                              type="button"
                              aria-label={`Verify payment destination ${destination.destinationId}`}
                              onClick={() => openRelatedTool(props, 'Payment Verification', paymentHint)}
                            >
                              Verify exact destination
                            </button>
                          ) : (
                            <p>
                              {isPaperCheck
                                ? 'Paper-check records do not use Payment Verification.'
                                : 'No exact Payment Verification record is supplied for this destination.'}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="sky-empty">
                    No paycheck destinations were supplied for this employee occurrence.
                  </div>
                )}
                {asArray(record.currentDestinations).some((destination) => (
                  !latestDestinations.some((posted) => (
                    posted.destinationId === destination.destinationId
                    && posted.bankCode === destination.bankCode
                  ))
                )) ? (
                  <section className="sky-employee-newest-instruction">
                    <header>
                      <small>Newest supplied instruction</small>
                      <strong>{currentPayment?.method ?? 'Payment method not supplied'}</strong>
                      <span>{currentPayment?.effectiveDate ?? 'Effective date not supplied'}</span>
                    </header>
                    {asArray(record.currentDestinations).map((destination, index) => {
                      const paymentHint = paymentHintFor({
                        ...destination,
                        method: currentPayment?.method,
                      });
                      return (
                        <article key={`${destination.id ?? destination.destinationId}-${index}`}>
                          <FieldList fields={[
                            ['Bank Code', destination.bankCode],
                            ['Destination ID', destination.destinationId],
                            ['Status', destination.status],
                            ['First seen', destination.firstSeen],
                            ['Payment record ID', destination.paymentRecordId ?? currentPayment?.paymentRecordId],
                          ]} />
                          {paymentHint ? (
                            <button
                              className="sky-button-secondary"
                              type="button"
                              aria-label={`Verify newest payment instruction ${destination.destinationId}`}
                              onClick={() => openRelatedTool(props, 'Payment Verification', paymentHint)}
                            >
                              Verify newest instruction
                            </button>
                          ) : (
                            <p>No exact Payment Verification record is supplied for this instruction.</p>
                          )}
                        </article>
                      );
                    })}
                  </section>
                ) : null}
              </div>
            </article>
          </section>

          <section className="span-12 sky-employee-history-grid" aria-label="Employee profile history">
            <article className="sky-card sky-employee-rate-history" data-shape="shield">
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="clock" size={21} /></span>
                  <div><small>Supplied dated fields</small><h3>Compensation History</h3></div>
                  <em>{asArray(record.rateHistory).length}</em>
                </header>
                {asArray(record.rateHistory).length ? (
                  <div className="sky-employee-history-list">
                    {asArray(record.rateHistory)
                      .slice()
                      .sort((left, right) => (
                        (Date.parse(right.effectiveDate) || 0) - (Date.parse(left.effectiveDate) || 0)
                      ))
                      .map((item, index) => (
                        <article key={`${item.effectiveDate}-${index}`}>
                          <span aria-hidden="true" />
                          <div>
                            <small>{item.effectiveDate}</small>
                            <strong>{formatMoney(item.value)}</strong>
                            <p>Recorded rate</p>
                          </div>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="sky-empty">No dated compensation history was supplied.</div>
                )}
              </div>
            </article>

            <article
              className="sky-card sky-employee-profile-history"
              data-tone="pink"
              data-shape="shield"
              data-sparkle="true"
            >
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="evidence" size={21} /></span>
                  <div><small>Derived only from supplied fields</small><h3>Profile History</h3></div>
                  <em>{asArray(record.profileHistory).length}</em>
                </header>
                {asArray(record.profileHistory).length ? (
                  <div className="sky-employee-history-list">
                    {asArray(record.profileHistory).map((item) => (
                      <article key={item.id}>
                        <span aria-hidden="true" />
                        <div>
                          <small>{item.effectiveDate ?? 'Date not supplied'}</small>
                          <strong>{item.type}</strong>
                          {item.value || item.detail ? (
                            <p>{[item.value, item.detail].filter(Boolean).join(' · ')}</p>
                          ) : null}
                          {asArray(item.destinations).length ? (
                            <ul>
                              {item.destinations.map((destination, index) => {
                                const identifiers = [destination.bankCode, destination.destinationId]
                                  .filter(validPayrollLookupValue);
                                return identifiers.length ? (
                                  <li key={`${destination.id ?? destination.destinationId}-${index}`}>
                                    {identifiers.join(' · ')}
                                  </li>
                                ) : null;
                              })}
                            </ul>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="sky-empty">No dated profile history was supplied.</div>
                )}
              </div>
            </article>
          </section>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={record.id}
            record={evidenceRecord}
            pinLabel={record.id}
            reviewed={reviewed}
            reference
          >
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Payroll History', record.id)}
            >
              Open Payroll History
            </button>
          </EvidenceActions>
        </>
      )}
    </ToolShell>
  );
}

function PayrollBreakdown({ title, rows }) {
  const values = asArray(rows);
  if (!values.length) return null;
  return (
    <details className="sky-payroll-breakdown">
      <summary>
        <span>{title}</span>
        <small>{values.length} supplied item{values.length === 1 ? '' : 's'}</small>
        <SkyIcon name="arrow" size={17} />
      </summary>
      <FieldList fields={values.map((item, index) => [
        item.type ?? item.label ?? `${title} ${index + 1}`,
        [
          item.current !== undefined ? `Current ${formatMoney(item.current)}` : '',
          item.ytd !== undefined ? `YTD ${formatMoney(item.ytd)}` : '',
          item.hours !== undefined ? `${item.hours} hours` : '',
          item.rate !== undefined ? `Rate ${formatMoney(item.rate)}` : '',
        ].filter(Boolean).join(' · '),
      ])} />
    </details>
  );
}

function payrollRunAccent(run = {}) {
  if (/bonus/i.test(run.runType)) return 'amber';
  if (/off.?cycle|correction/i.test(run.runType)) return 'pink';
  if (/pending|processing|submitted/i.test(run.runStatus ?? run.status)) return 'violet';
  return 'blue';
}

function uniquePayrollValues(runs = [], field) {
  return [...new Set(
    runs
      .map((run) => clean(field === 'status' ? run.runStatus ?? run.status : run[field]))
      .filter(Boolean),
  )];
}

function validPayrollLookupValue(value) {
  const normalized = lower(value);
  return Boolean(
    normalized
    && !['not supplied', 'not applicable', 'not recorded', 'none'].includes(normalized),
  );
}

export function PayrollHistoryTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Payroll History';
  const workspace = useMemo(() => {
    const resolved = getPayrollHistory(activeCase);
    return resolved?.payrollRuns?.length ? resolved : null;
  }, [activeCase]);
  const paymentRecords = useMemo(
    () => explicitFinancialSource(activeCase).paymentVerification,
    [activeCase],
  );
  const [input, setInput] = useState(query);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ runType: 'all', status: 'all' });
  const [showAllRuns, setShowAllRuns] = useState(false);

  useEffect(() => {
    setInput(query);
    setResult(null);
    setError('');
    setSelectedRunId('');
    setFiltersOpen(false);
    setFilters({ runType: 'all', status: 'all' });
    setShowAllRuns(false);
  }, [activeCase.id, query]);

  const orderedRuns = useMemo(
    () => sortPayrollRunsNewestFirst(workspace?.payrollRuns ?? []),
    [workspace],
  );
  const overview = useMemo(
    () => (workspace ? payrollHistoryOverview(workspace) : null),
    [workspace],
  );
  const filteredRuns = useMemo(
    () => filterPayrollRuns(orderedRuns, filters),
    [filters, orderedRuns],
  );
  const visibleRuns = showAllRuns ? filteredRuns : filteredRuns.slice(0, 3);
  const selectedRun = orderedRuns.find((run) => run.id === selectedRunId)
    ?? result?.run
    ?? null;
  const selectedEmployee = result?.employee ?? null;
  const selectedPaystub = result?.paystub ?? selectedEmployee?.paystub ?? null;
  const selectedDestination = result?.destination ?? null;
  const runTypeOptions = uniquePayrollValues(orderedRuns, 'runType');
  const statusOptions = uniquePayrollValues(orderedRuns, 'status');
  const activeFilterCount = Object.values(filters).filter((value) => value !== 'all').length;

  function runSearch(event) {
    event.preventDefault();
    const requested = clean(input);
    setResult(null);
    setSelectedRunId('');
    if (!requested) {
      setError('Enter an exact payroll profile, run, employee, paystub, destination, Bank Code, or payment record ID.');
      return;
    }
    if (!workspace) {
      setError('No supplied payroll history is attached to this case.');
      return;
    }
    const match = findPayrollRecord(workspace, requested);
    if (!match) {
      setError('No supplied payroll record matched that exact identifier.');
      return;
    }
    const matchedRun = match.run ?? overview?.latestRun ?? null;
    setError('');
    setResult(match);
    setSelectedRunId(matchedRun?.id ?? '');
    setFilters({ runType: 'all', status: 'all' });
    setFiltersOpen(false);
    setShowAllRuns(
      matchedRun
      && orderedRuns.findIndex((run) => run.id === matchedRun.id) >= 3,
    );
  }

  function changeInput(value) {
    setInput(value);
    setResult(null);
    setError('');
    setSelectedRunId('');
    setFiltersOpen(false);
    setFilters({ runType: 'all', status: 'all' });
    setShowAllRuns(false);
  }

  function openRun(run) {
    setSelectedRunId(run.id);
    setResult({
      type: 'run',
      identifierType: 'payroll-run-id',
      identifierLabel: 'Payroll Run ID',
      matchedIdentifier: run.id,
      occurrences: [{ run }],
      matchCount: 1,
      run,
    });
  }

  function openPaystub(run, employee) {
    const paystub = employee.paystub;
    if (!paystub?.id) return;
    setSelectedRunId(run.id);
    setResult({
      type: 'paystub',
      identifierType: 'paystub-id',
      identifierLabel: 'Paystub ID',
      matchedIdentifier: paystub.id,
      occurrences: [{ run, employee, paystub }],
      matchCount: 1,
      run,
      employee,
      paystub,
    });
  }

  function selectDestination(run, employee, paystub, destination) {
    const matchedIdentifier = validPayrollLookupValue(destination.destinationId)
      ? destination.destinationId
      : destination.id;
    if (!matchedIdentifier) return;
    setSelectedRunId(run.id);
    setResult({
      type: 'destination',
      identifierType: validPayrollLookupValue(destination.destinationId)
        ? 'destination-id'
        : 'payment-destination-record-id',
      identifierLabel: validPayrollLookupValue(destination.destinationId)
        ? 'Destination ID'
        : 'Payment Destination Record ID',
      matchedIdentifier,
      occurrences: [{ run, employee, paystub, destination }],
      matchCount: 1,
      run,
      employee,
      paystub,
      destination,
    });
  }

  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setShowAllRuns(false);
  }

  function paymentHintFor(destination, ownerName) {
    if (
      !/direct deposit/i.test(destination?.method ?? '')
      || !validPayrollLookupValue(destination?.bankCode)
      || !validPayrollLookupValue(destination?.destinationId)
    ) return '';
    const lookup = {
      bankCode: destination.bankCode,
      destinationId: destination.destinationId,
      ownerName: clean(ownerName),
    };
    const verification = resolvePaymentLookup(paymentRecords, lookup, activeCase);
    if (verification.state !== 'found') return '';
    return buildPaymentLookupHint(lookup);
  }

  const resultId = result?.matchedIdentifier ?? '';
  const evidenceRecord = result ? {
    ...result,
    id: resultId,
    recordId: resultId,
    pinPayload: {
      id: resultId,
      recordId: resultId,
      sourceRecordId: resultId,
      value: resultId,
      label: `${result.identifierLabel}: ${resultId}`,
      query: resultId,
      identifierType: result.identifierType,
      identifierLabel: result.identifierLabel,
    },
  } : null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Search immutable payroll runs, employee pay records, paystubs, and destinations."
      reference
      icon="calendar"
      onBack={props.onBackToWorkspace}
    >
      {result && overview ? (
        <article
          className="sky-card span-12 sky-payroll-overview"
          data-shape="ribbon"
          data-sparkle="true"
          aria-label="Payroll overview"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <header>
              <div>
                <small>Payroll Overview</small>
                <h2>{workspace.companyPayrollProfile?.legalName ?? 'Supplied payroll history'}</h2>
              </div>
              <span>{workspace.companyPayrollProfile?.payrollId ?? `${orderedRuns.length} runs`}</span>
            </header>
            <div className="sky-payroll-overview-grid">
              <article data-accent="pink">
                <span aria-hidden="true"><SkyIcon name="amount" size={21} /></span>
                <small>Latest net payroll</small>
                <strong>{formatMoney(overview.latestNetPayroll)}</strong>
                <p>{overview.latestPayDate ?? 'Pay date not supplied'}</p>
              </article>
              <article data-accent="violet">
                <span aria-hidden="true"><SkyIcon name="review" size={21} /></span>
                <small>Payroll runs</small>
                <strong>{overview.payrollRunCount}</strong>
                <p>{workspace.companyPayrollProfile?.selectedDateRange ?? 'Supplied range'}</p>
              </article>
              <article data-accent="blue">
                <span aria-hidden="true"><SkyIcon name="user" size={21} /></span>
                <small>Employees paid</small>
                <strong>{displayValue(overview.employeesPaid)}</strong>
                <p>Latest supplied run</p>
              </article>
              <article data-accent="amber">
                <span aria-hidden="true"><SkyIcon name="calendar" size={21} /></span>
                <small>Next payroll date</small>
                <strong>{displayValue(overview.nextPayDate)}</strong>
                <p>{overview.paySchedule ?? 'Schedule not supplied'}</p>
              </article>
            </div>
          </div>
        </article>
      ) : null}

      <article
        className="sky-card span-12 sky-payroll-search"
        data-shape="notched"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="search" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Find an exact payroll record</strong>
              <p>Payroll totals, employee rows, paystubs, and destinations remain hidden until a supplied identifier matches.</p>
            </div>
          </header>
          <form className="sky-payroll-search-form" onSubmit={runSearch} noValidate>
            <label>
              <span>Payroll identifier</span>
              <input
                value={input}
                onChange={(event) => changeInput(event.target.value)}
                placeholder="Payroll profile, run, employee, paystub, destination, Bank Code, or payment record"
                aria-label="Search Payroll History"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="search" size={18} />
              <span>Run payroll search</span>
            </button>
            <button
              className="sky-button-secondary sky-payroll-filter-toggle"
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="payroll-history-filters"
              disabled={!result}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SkyIcon name="review" size={18} />
              <span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</span>
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!result && !error ? (
            <div className="sky-reference-search-message" role="status">No payroll result is open.</div>
          ) : null}
          {result?.matchCount > 1 ? (
            <div className="sky-reference-search-message" data-tone="blue" role="status">
              {result.matchCount} supplied occurrences share this exact {lower(result.identifierLabel)}. The newest occurrence is open; each period remains available below.
            </div>
          ) : null}
          {result && filtersOpen ? (
            <div className="sky-payroll-filters" id="payroll-history-filters">
              <label>
                <span>Run type</span>
                <select
                  value={filters.runType}
                  onChange={(event) => updateFilter('runType', event.target.value)}
                >
                  <option value="all">All run types</option>
                  {runTypeOptions.map((value) => <option value={lower(value)} key={value}>{value}</option>)}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={filters.status}
                  onChange={(event) => updateFilter('status', event.target.value)}
                >
                  <option value="all">All statuses</option>
                  {statusOptions.map((value) => <option value={lower(value)} key={value}>{value}</option>)}
                </select>
              </label>
              <button
                className="sky-button-secondary"
                type="button"
                onClick={() => {
                  setFilters({ runType: 'all', status: 'all' });
                  setShowAllRuns(false);
                }}
              >
                Reset filters
              </button>
            </div>
          ) : null}
        </div>
      </article>

      {result ? (
        <section className="span-12 sky-payroll-runs" aria-label="Payroll runs">
          <header className="sky-payroll-results-heading">
            <div>
              <small>Supplied payroll activity</small>
              <h2>Payroll Runs</h2>
            </div>
            <span>{filteredRuns.length} of {orderedRuns.length}</span>
          </header>
          {visibleRuns.length ? (
            <div className="sky-payroll-run-list">
              {visibleRuns.map((run) => {
                const isSelected = run.id === selectedRun?.id;
                return (
                  <article
                    className="sky-card sky-payroll-run-card"
                    data-accent={payrollRunAccent(run)}
                    data-shape={isSelected ? 'ribbon' : undefined}
                    data-sparkle={isSelected || undefined}
                    key={run.id}
                  >
                    <span className="sky-card-sheen" aria-hidden="true" />
                    {isSelected ? <SkySparkles /> : null}
                    <button
                      className="sky-payroll-run-toggle"
                      type="button"
                      aria-expanded={isSelected}
                      aria-label={`Open payroll run ${run.id}`}
                      onClick={() => openRun(run)}
                    >
                      <span className="sky-payroll-run-icon" aria-hidden="true">
                        <SkyIcon name={/bonus/i.test(run.runType) ? 'sparkle' : 'calendar'} size={25} />
                      </span>
                      <span className="sky-payroll-run-title">
                        <strong>{run.payDate ?? run.processedDate ?? 'Pay date not supplied'}</strong>
                        <small>{run.runType ?? 'Run type not supplied'}</small>
                        <em>{run.id}</em>
                      </span>
                      <span className="sky-payroll-run-fact">
                        <small>Frequency</small>
                        <strong>{run.paySchedule ?? 'Not supplied'}</strong>
                      </span>
                      <span className="sky-payroll-run-fact">
                        <small>Employees</small>
                        <strong>{displayValue(run.employeeCount)}</strong>
                      </span>
                      <span className="sky-payroll-run-status">
                        <em>{run.runStatus ?? run.status ?? 'Status not supplied'}</em>
                        <small>Net payroll</small>
                        <strong>{formatMoney(run.netPay ?? run.netPayroll)}</strong>
                      </span>
                      <SkyIcon className="sky-payroll-run-chevron" name="arrow" size={20} />
                    </button>
                    {isSelected ? (
                      <div className="sky-payroll-run-detail">
                        <div className="sky-payroll-run-totals">
                          <span><small>Gross payroll</small><strong>{formatMoney(run.grossWages)}</strong></span>
                          <span><small>Net payroll</small><strong>{formatMoney(run.netPay ?? run.netPayroll)}</strong></span>
                          <span><small>Company debit</small><strong>{formatMoney(run.totalCompanyDebit ?? run.amount)}</strong></span>
                        </div>
                        <FieldList fields={[
                          ['Employer', run.employer ?? workspace.companyPayrollProfile?.legalName],
                          ['Pay period', run.payPeriodLabel ?? run.payPeriod?.label],
                          ['Submission date', run.submissionDate],
                          ['Settlement date', run.settlementDate],
                          ['Submitted by', run.submittedBy],
                          ['Approved by', run.approvedBy],
                          ['Funding Bank Code', run.companyFunding?.bankCode ?? run.fundingSource],
                          ['Funding account', run.companyFunding?.accountUsed],
                          ['Funding payment record', run.companyFunding?.paymentRecordId],
                        ]} />
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {filteredRuns.length > visibleRuns.length ? (
                <button className="sky-payroll-load-more" type="button" onClick={() => setShowAllRuns(true)}>
                  View all {filteredRuns.length} payroll runs
                  <SkyIcon name="arrow" size={18} />
                </button>
              ) : null}
              {showAllRuns && filteredRuns.length > 3 ? (
                <button className="sky-payroll-load-more" type="button" onClick={() => setShowAllRuns(false)}>
                  Show latest 3 runs
                </button>
              ) : null}
            </div>
          ) : (
            <article className="sky-card sky-payroll-empty" data-shape="notched">
              <div className="sky-card-inner">
                <SkyIcon name="search" size={23} />
                <div>
                  <strong>No payroll runs match this filter combination.</strong>
                  <p>Reset the filters to restore the supplied run list.</p>
                </div>
              </div>
            </article>
          )}
        </section>
      ) : null}

      {result && selectedRun ? (
        <article
          className="sky-card span-12 sky-payroll-employees"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <header>
              <div>
                <small>Selected run · {selectedRun.id}</small>
                <h2>Employee Pay Records Preview</h2>
              </div>
              <span>{asArray(selectedRun.employees).length}</span>
            </header>
            {asArray(selectedRun.employees).length ? (
              <div className="sky-payroll-employee-list">
                {asArray(selectedRun.employees).map((employee) => {
                  const paystub = employee.paystub;
                  const isSelected = paystub?.id === selectedPaystub?.id;
                  return (
                    <button
                      type="button"
                      key={paystub?.id ?? employee.employeeId}
                      aria-current={isSelected ? 'true' : undefined}
                      aria-label={`Open paystub ${paystub?.id ?? employee.employeeId}`}
                      onClick={() => openPaystub(selectedRun, employee)}
                    >
                      <span className="sky-payroll-employee-avatar" aria-hidden="true">
                        {referenceInitials(employee.name)}
                      </span>
                      <span>
                        <strong>{employee.name ?? 'Employee name not supplied'}</strong>
                        <small>{employee.department ?? employee.payType ?? 'Employment detail not supplied'}</small>
                        <em>{employee.employeeId}</em>
                      </span>
                      <span>
                        <small>Net pay</small>
                        <strong>{formatMoney(employee.netPay ?? paystub?.summary?.netPay)}</strong>
                        <em>{employee.paymentStatus ?? 'Status not supplied'}</em>
                      </span>
                      <SkyIcon name="arrow" size={18} />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="sky-payroll-summary-only">
                <SkyIcon name="evidence" size={22} />
                <div>
                  <strong>Employee pay records were not supplied for this preserved run.</strong>
                  <p>The source supports only the run-level summary shown above. No employee, paystub, tax, or destination facts were inferred.</p>
                </div>
              </div>
            )}
          </div>
        </article>
      ) : null}

      {result && selectedPaystub ? (
        <section className="span-12 sky-payroll-paystub" aria-label={`Paystub ${selectedPaystub.id}`}>
          <header className="sky-payroll-results-heading">
            <div>
              <small>Immutable paystub</small>
              <h2>{selectedPaystub.employee?.legalName ?? selectedEmployee?.name ?? 'Employee paystub'}</h2>
            </div>
            <span>{selectedPaystub.id}</span>
          </header>
          <div className="sky-payroll-paystub-grid">
            <article className="sky-card" data-shape="notched">
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="user" size={21} /></span>
                  <div><small>Pay record</small><h3>Employee and period</h3></div>
                </header>
                <FieldList fields={[
                  ['Employer', selectedPaystub.employer?.legalName],
                  ['Employer address', selectedPaystub.employer?.address],
                  ['Masked EIN', selectedPaystub.employer?.maskedEin],
                  ['Employee ID', selectedPaystub.employee?.employeeId ?? selectedEmployee?.employeeId],
                  ['Employee address', selectedPaystub.employee?.address],
                  ['Payroll type', selectedPaystub.payrollType],
                  ['Pay period', selectedPaystub.payPeriod?.label],
                  ['Pay date', selectedPaystub.payDate],
                ]} />
                {(selectedPaystub.employee?.employeeId ?? selectedEmployee?.employeeId) ? (
                  <button
                    className="sky-button-secondary"
                    type="button"
                    onClick={() => openRelatedTool(
                      props,
                      'Employee Profile',
                      selectedPaystub.employee?.employeeId ?? selectedEmployee?.employeeId,
                    )}
                  >
                    Open Employee Profile
                  </button>
                ) : null}
              </div>
            </article>
            <article className="sky-card" data-tone="pink" data-shape="notched" data-sparkle="true">
              <span className="sky-card-sheen" aria-hidden="true" />
              <div className="sky-card-inner">
                <header>
                  <span aria-hidden="true"><SkyIcon name="amount" size={21} /></span>
                  <div><small>Paystub totals</small><h3>Current and YTD</h3></div>
                </header>
                <FieldList fields={[
                  ['Gross pay', formatMoney(selectedPaystub.summary?.grossPay)],
                  ['Employee taxes', formatMoney(selectedPaystub.summary?.employeeTaxes)],
                  ['Employee deductions', formatMoney(selectedPaystub.summary?.employeeDeductions)],
                  ['Employer contributions', formatMoney(selectedPaystub.summary?.employerContributions)],
                  ['Reimbursements', formatMoney(selectedPaystub.summary?.reimbursements)],
                  ['Net pay', formatMoney(selectedPaystub.summary?.netPay)],
                  ['Total payroll cost', formatMoney(selectedPaystub.summary?.totalPayrollCost)],
                  ['YTD gross', formatMoney(selectedPaystub.ytdSnapshot?.grossPay)],
                  ['YTD net', formatMoney(selectedPaystub.ytdSnapshot?.netPay)],
                ]} />
              </div>
            </article>
          </div>

          <article className="sky-card sky-payroll-breakdowns" data-shape="ribbon">
            <div className="sky-card-inner">
              <header>
                <div><small>Source breakdowns</small><h3>Earnings, taxes, deductions, and adjustments</h3></div>
              </header>
              <div>
                <PayrollBreakdown title="Earnings" rows={selectedPaystub.earnings} />
                <PayrollBreakdown title="Taxes" rows={selectedPaystub.taxes} />
                <PayrollBreakdown title="Deductions" rows={selectedPaystub.deductions} />
                <PayrollBreakdown title="Employer contributions" rows={selectedPaystub.employerContributions} />
                <PayrollBreakdown title="Reimbursements" rows={selectedPaystub.reimbursements} />
                <PayrollBreakdown title="Adjustments" rows={selectedPaystub.adjustments} />
              </div>
            </div>
          </article>

          <article
            className="sky-card sky-payroll-destinations"
            data-shape="ribbon"
            data-sparkle="true"
          >
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <div><small>Immutable payment history</small><h3>Payment Destinations</h3></div>
                <span>{asArray(selectedPaystub.paymentDestinations).length}</span>
              </header>
              <div className="sky-payroll-destination-list">
                {asArray(selectedPaystub.paymentDestinations).map((destination, index) => {
                  const ownerName = selectedPaystub.employee?.legalName ?? selectedEmployee?.name ?? '';
                  const paymentHint = paymentHintFor(destination, ownerName);
                  const destinationLabel = validPayrollLookupValue(destination.destinationId)
                    ? destination.destinationId
                    : destination.id ?? `Destination ${index + 1}`;
                  const isSelected = (
                    selectedDestination === destination
                    || (
                      result?.type === 'destination'
                      && result?.matchedIdentifier === destinationLabel
                    )
                  );
                  return (
                    <article
                      key={`${destination.id ?? destinationLabel}-${index}`}
                      data-selected={isSelected || undefined}
                    >
                      <button
                        className="sky-payroll-destination-select"
                        type="button"
                        aria-label={`Select payment destination ${destinationLabel}`}
                        onClick={() => selectDestination(
                          selectedRun,
                          selectedEmployee
                            ?? asArray(selectedRun.employees).find((employee) => employee.paystub?.id === selectedPaystub.id),
                          selectedPaystub,
                          destination,
                        )}
                      >
                        <span aria-hidden="true"><SkyIcon name={/check/i.test(destination.method) ? 'evidence' : 'payment'} size={22} /></span>
                        <span>
                          <small>{destination.method ?? `Destination ${index + 1}`}</small>
                          <strong>{destinationLabel}</strong>
                          <em>{destination.bankCode}</em>
                        </span>
                        <span>
                          <strong>{formatMoney(destination.amount)}</strong>
                          <small>{destination.status ?? 'Status not supplied'}</small>
                        </span>
                        <SkyIcon name="arrow" size={17} />
                      </button>
                      <div className="sky-payroll-destination-detail">
                        <FieldList fields={[
                          ['Destination record', destination.id],
                          ['Bank Code', destination.bankCode],
                          ['Destination ID', destination.destinationId],
                          ['Amount', formatMoney(destination.amount)],
                          ['Status', destination.status],
                          ['Settlement date', destination.settlementDate],
                          ['First seen', destination.firstSeen],
                          ['Payment record ID', destination.paymentRecordId],
                          ['Check number', destination.checkNumber],
                        ]} />
                        {paymentHint ? (
                          <button
                            className="sky-button-secondary"
                            type="button"
                            aria-label={`Verify payment destination ${destination.destinationId}`}
                            onClick={() => openRelatedTool(props, 'Payment Verification', paymentHint)}
                          >
                            Verify exact destination
                          </button>
                        ) : (
                          <p className="sky-payroll-destination-note">
                            {/check/i.test(destination.method ?? '')
                              ? 'Paper-check records do not use Payment Verification.'
                              : 'No exact Payment Verification record is supplied for this historical destination.'}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {result && evidenceRecord ? (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={resultId}
          record={evidenceRecord}
          pinLabel={resultId}
          reviewed={reviewed}
          reference
        />
      ) : null}
    </ToolShell>
  );
}

function documentFields(document) {
  return [
    ['Document ID', document.id],
    ['Reference', document.reference],
    ['Case ID', document.caseId],
    ['Account ID', document.accountId],
    ['Customer / entity', document.customer],
    ['Type', document.type],
    ['Folder', document.folder],
    ['Status', document.status],
    ['Review status', document.reviewStatus],
    ['Source', document.source],
    ['Received', document.received],
    ['Request status', document.requestStatus],
    ['Extraction confidence', document.extractionConfidence],
    ['Quality / authenticity', document.authenticity],
    ['Summary', document.summary],
    ...asArray(document.fields),
  ];
}

function DocumentPreviewSheet({ document, page, compact = false }) {
  if (!page) {
    return (
      <div className="sky-document-preview-empty">
        <SkyIcon name="evidence" size={28} />
        <strong>No source page supplied</strong>
        <span>The record can still be reviewed from its supplied metadata.</span>
      </div>
    );
  }
  return (
    <div className="sky-document-sheet" data-compact={compact || undefined}>
      <header>
        <span aria-hidden="true"><SkyIcon name="shield" size={21} /></span>
        <div>
          <small>{page.subtitle ?? document.type ?? 'Source document'}</small>
          <strong>{page.title ?? document.title}</strong>
          <em>{page.reference ?? document.reference ?? document.id}</em>
        </div>
      </header>
      <div className="sky-document-sheet-body">
        {asArray(page.sections).map((section, sectionIndex) => (
          <section key={`${section.title}-${sectionIndex}`}>
            <h4>{section.title}</h4>
            {asArray(section.rows).length ? (
              <dl>
                {asArray(section.rows).map(([label, value], rowIndex) => (
                  <div key={`${label}-${rowIndex}`}>
                    <dt>{label}</dt>
                    <dd>{displayValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {asArray(section.paragraphs).map((paragraph, paragraphIndex) => (
              <p key={`${section.title}-paragraph-${paragraphIndex}`}>{paragraph}</p>
            ))}
            {section.table ? (
              <div className="sky-document-table-wrap">
                <table>
                  {asArray(section.table.columns).length ? (
                    <thead>
                      <tr>{section.table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
                    </thead>
                  ) : null}
                  <tbody>
                    {asArray(section.table.rows).map((row, rowIndex) => (
                      <tr key={`${section.title}-row-${rowIndex}`}>
                        {row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{displayValue(cell)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ))}
      </div>
      <footer>Fictional training document · investigator review required</footer>
    </div>
  );
}

function exportDocumentText(document) {
  return [
    document.title,
    ...documentFields(document).map(([label, value]) => `${label}: ${displayValue(value)}`),
    ...asArray(document.pages).flatMap((page, index) => [
      '',
      `Page ${index + 1}: ${page.title ?? document.title}`,
      ...asArray(page.sections).flatMap((section) => [
        section.title,
        ...asArray(section.rows).map(([label, value]) => `${label}: ${displayValue(value)}`),
        ...asArray(section.paragraphs),
      ]),
    ]),
    '',
    'Fictional training document — not valid for real-world use.',
  ].join('\n');
}

function downloadDocument(document) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([exportDocumentText(document)], { type: 'text/plain;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${document.id ?? 'training-document'}.txt`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export function DocumentViewerTool(props) {
  const {
    activeCase = {},
    documentRequests = {},
    reviewed = false,
    query = '',
    initialPayload = null,
  } = props;
  const toolName = 'Document Viewer';
  const routedIdentifier = useMemo(
    () => clean(
      initialPayload?.sourceRecordId
      ?? initialPayload?.query
      ?? initialPayload?.documentId
      ?? initialPayload?.accountId
      ?? query,
    ),
    [initialPayload, query],
  );
  const [accountId, setAccountId] = useState(routedIdentifier);
  const [matchedCase, setMatchedCase] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setAccountId(routedIdentifier);
    setMatchedCase(null);
    setDocuments([]);
    setSelectedId('');
    setPageIndex(0);
    setFilter('');
    setError('');
    setHasRun(false);
  }, [activeCase.id, routedIdentifier]);

  function runAccountSearch(event) {
    event.preventDefault();
    setHasRun(true);
    setMatchedCase(null);
    setDocuments([]);
    setSelectedId('');
    setPageIndex(0);
    const requested = clean(accountId).toUpperCase();
    if (!requested) {
      setError('Enter an exact Account ID or Document ID.');
      return;
    }
    const requestState = requestStateForCase(documentRequests, activeCase.id);
    if (!explicitDocumentSource(activeCase, requestState)) {
      setError('No supplied source documents are attached to the active case.');
      return;
    }
    const suppliedDocuments = [
      ...getCaseDocuments(activeCase),
      ...buildCustomerResponseDocuments(activeCase, requestState),
    ].filter((item, index, items) => (
      items.findIndex((candidate) => candidate.id === item.id) === index
    ));
    const accountMatches = clean(activeCase.accountId).toUpperCase() === requested;
    const matchedDocument = suppliedDocuments.find(
      (document) => clean(document.id).toUpperCase() === requested,
    ) ?? null;

    if (!accountMatches && !matchedDocument) {
      setError('No supplied account or document matched that exact identifier.');
      return;
    }
    if (!suppliedDocuments.length) {
      setError('The matched case has no supplied source documents.');
      return;
    }
    setError('');
    setMatchedCase(activeCase);
    setDocuments(suppliedDocuments);
    setSelectedId(matchedDocument?.id ?? suppliedDocuments[0]?.id ?? '');
  }

  const visibleDocuments = documents.filter((document) => (
    !lower(filter) || documentSearchText(document).includes(lower(filter))
  ));
  const selected = visibleDocuments.find((document) => document.id === selectedId) ?? null;
  const page = selected?.pages?.[pageIndex] ?? null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Which exact customer account owns the supplied documents, and what can be verified from each source?"
      reference
      displayName="Document Viewer"
      icon="evidence"
      onBack={props.onBackToWorkspace}
      showLuna={false}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-document-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="evidence" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Open an exact source document</strong>
              <p>Document titles, pages, fields, sources, and statuses remain locked until the active case’s Account ID or Document ID matches.</p>
            </div>
          </header>
          <form className="sky-reference-search-row" onSubmit={runAccountSearch} noValidate>
            <label>
              <span>Account ID or Document ID</span>
              <input
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value);
                  setMatchedCase(null);
                  setDocuments([]);
                  setSelectedId('');
                  setPageIndex(0);
                  setFilter('');
                  setError('');
                  setHasRun(false);
                }}
                placeholder="Enter exact Account ID or Document ID"
                aria-label="Search Document Viewer by Account ID or Document ID"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="sparkle" size={18} />
              Open
            </button>
          </form>
          <div className="sky-action-row">
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(
                props,
                'Document Request',
                matchedCase?.accountId ?? activeCase.accountId ?? activeCase.id,
              )}
            >
              <SkyIcon name="evidence" size={17} />
              Request a document
            </button>
          </div>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {!hasRun ? (
            <div className="sky-reference-search-message" role="status">
              Customer documents are locked.
            </div>
          ) : null}
        </div>
      </article>

      {matchedCase && (
        <article
          className="sky-card span-12 sky-document-focus-strip"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <div className="sky-document-focus-copy">
              <span aria-hidden="true"><SkyIcon name="shield" size={22} /></span>
              <div>
                <small>Matched active case</small>
                <strong>{matchedCase.accountId ?? matchedCase.id}</strong>
                <em>{documents.length} supplied document{documents.length === 1 ? '' : 's'}</em>
              </div>
            </div>
            <label>
              <span>Filter matched documents</span>
              <input
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
                placeholder="Title, reference, status, source, or extracted field"
                aria-label="Filter matched documents"
              />
            </label>
          </div>
        </article>
      )}

      {matchedCase && visibleDocuments.length > 0 && (
        <article
          className="sky-card span-12 sky-reference-result-rail sky-document-result-rail"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <header>
              <div><small>Document inventory</small><strong>Choose a source to inspect</strong></div>
              <span>{visibleDocuments.length} shown</span>
            </header>
            <div className="sky-reference-result-scroll" role="group" aria-label="Document Viewer results">
              {visibleDocuments.map((document) => (
                <button
                  type="button"
                  key={document.id}
                  aria-current={selectedId === document.id ? 'true' : undefined}
                  onClick={() => {
                    setSelectedId(document.id);
                    setPageIndex(0);
                  }}
                >
                  <small>{document.status ?? 'Recorded'}</small>
                  <strong>{document.title}</strong>
                  <span>{document.id} · {document.source}</span>
                </button>
              ))}
            </div>
          </div>
        </article>
      )}

      {selected && (
        <section className="span-12 sky-document-preview-layout" aria-label="Selected source document">
          <article className="sky-card sky-document-preview-card" data-shape="ribbon" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <SkySparkles />
            <div className="sky-card-inner">
              <header>
                <div>
                  <small>Document preview</small>
                  <h2>{selected.title}</h2>
                  <p>{selected.id} · {selected.source}</p>
                </div>
                <span>{pageIndex + 1} / {Math.max(1, asArray(selected.pages).length)}</span>
              </header>
              <DocumentPreviewSheet document={selected} page={page} />
              <div className="sky-document-page-controls" aria-label="Document page controls">
                <button
                  className="sky-button-secondary"
                  type="button"
                  disabled={pageIndex <= 0}
                  onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                >
                  ← Previous
                </button>
                <strong>Page {pageIndex + 1}</strong>
                <button
                  className="sky-button-secondary"
                  type="button"
                  disabled={pageIndex >= asArray(selected.pages).length - 1}
                  onClick={() => setPageIndex((current) => Math.min(asArray(selected.pages).length - 1, current + 1))}
                >
                  Next →
                </button>
              </div>
              <button
                className="sky-document-export"
                type="button"
                onClick={() => downloadDocument(selected)}
              >
                <SkyIcon name="evidence" size={17} />
                Export text copy
              </button>
            </div>
          </article>
          <article className="sky-card sky-document-summary-card" data-tone="pink" data-shape="notched" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <span aria-hidden="true"><SkyIcon name="evidence" size={22} /></span>
                <div>
                  <small>{selected.type}</small>
                  <h2>Source details</h2>
                  <p>{selected.reviewStatus ?? selected.status}</p>
                </div>
              </header>
              <FieldList fields={documentFields(selected)} />
            </div>
          </article>
        </section>
      )}

      {selected && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={{
            ...selected,
            pinPayload: {
              id: selected.id,
              sourceRecordId: selected.id,
              value: selected.id,
              label: `${selected.id} · ${selected.title}`,
              query: selected.id,
            },
          }}
          pinLabel={`${selected.id} · ${selected.title}`}
          reviewed={reviewed}
          reference
        >
          {selected.requestEligible !== false ? (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Document Request', selected.id)}
            >
              Open Document Request
            </button>
          ) : null}
        </EvidenceActions>
      )}
    </ToolShell>
  );
}

function requestSearchText(item) {
  return lower([
    item.id,
    item.title,
    item.documentType,
    item.category,
    item.status,
    item.requirement,
    item.reason,
    item.sourceDocumentId,
  ].join(' '));
}

export function DocumentRequestTool(props) {
  const {
    activeCase = {},
    documentRequests = {},
    reviewed = false,
    query = '',
    initialPayload = null,
  } = props;
  const toolName = 'Document Request';
  const routedIdentifier = useMemo(
    () => clean(
      initialPayload?.sourceRecordId
      ?? initialPayload?.query
      ?? initialPayload?.documentId
      ?? query,
    ),
    [initialPayload, query],
  );
  const suppliedRequests = useMemo(
    () => requestStateForCase(documentRequests, activeCase.id),
    [documentRequests, activeCase.id],
  );
  const [requestState, setRequestState] = useState(suppliedRequests);
  const [input, setInput] = useState(routedIdentifier);
  const [results, setResults] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [channel, setChannel] = useState('Secure upload link');
  const [dueDate, setDueDate] = useState('');
  const [reason, setReason] = useState('');
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setRequestState(suppliedRequests);
    setInput(routedIdentifier);
    setResults([]);
    setSelectedKey('');
    setError('');
    setConfirmation('');
    setChannel('Secure upload link');
    setDueDate('');
    setReason('');
    setHasRun(false);
  }, [activeCase.id, routedIdentifier]);

  useEffect(() => {
    setRequestState(suppliedRequests);
  }, [suppliedRequests]);

  const hasSource = explicitDocumentSource(activeCase, requestState);
  const templates = useMemo(
    () => (hasSource ? getPaperworkRequestTemplates(activeCase) : []),
    [activeCase, hasSource],
  );
  const inbox = useMemo(
    () => (hasSource ? buildPaperworkInboxRecords(activeCase, requestState) : []),
    [activeCase, requestState, hasSource],
  );
  const candidates = useMemo(() => [
    ...templates.map((document) => ({
      key: `template:${document.id}`,
      kind: 'template',
      id: document.id,
      title: document.title,
      category: document.folder,
      status: document.requestStatus ?? document.status ?? 'Not requested',
      document,
    })),
    ...inbox.map((record) => ({
      ...record,
      key: `record:${record.id}`,
      kind: 'record',
      title: record.documentType,
    })),
  ], [templates, inbox]);

  function publishRequestState(next) {
    setRequestState(next);
    props.onDocumentRequestsChange?.(next, activeCase.id);
    props.setDocumentRequests?.(next);
  }

  function runSearch(event) {
    event.preventDefault();
    const requested = lower(input);
    setHasRun(true);
    setSelectedKey('');
    setConfirmation('');
    if (!requested) {
      setResults([]);
      setError('Enter a document title, type, status, category, or request ID.');
      return;
    }
    if (!hasSource) {
      setResults([]);
      setError('No supplied requestable document records are attached to this case.');
      return;
    }
    const exactMatches = candidates.filter((item) => (
      [
        item.id,
        item.sourceDocumentId,
        item.documentViewerId,
      ].some((value) => lower(value) === requested)
    ));
    const matches = exactMatches.length
      ? exactMatches
      : candidates.filter((item) => requestSearchText(item).includes(requested));
    setResults(matches);
    if (matches.length === 1) setSelectedKey(matches[0].key);
    setError(matches.length ? '' : 'No supplied document-request record matched that search.');
  }

  const selected = results.find((item) => item.key === selectedKey) ?? null;
  const responseDocuments = useMemo(() => (
    hasSource
      ? [
          ...getCaseDocuments(activeCase),
          ...buildCustomerResponseDocuments(activeCase, requestState),
        ].filter((item, index, items) => (
          items.findIndex((document) => document.id === item.id) === index
        ))
      : []
  ), [activeCase, requestState, hasSource]);
  const selectedDocument = selected?.kind === 'record'
    ? responseDocuments.find((document) => (
        document.id === selected.documentViewerId
        || document.id === selected.id
      )) ?? null
    : null;
  const unreadCount = inbox.filter((record) => record.unread).length;
  const selectedCanBeMarkedRead = Boolean(
    selected?.kind === 'record'
    && selected.unread
    && selected.recordKind === 'customer-submission'
    && selected.attemptId,
  );

  function sendRequest(event) {
    event.preventDefault();
    if (selected?.kind !== 'template') return;
    if (!clean(dueDate) || !clean(reason)) {
      setError('A follow-up due date and request reason are required before Send Request.');
      return;
    }
    const attempt = createPaperworkAttempt({
      activeCase,
      document: selected.document,
      reason: clean(reason),
      dueDate,
      requestedDate: new Date().toLocaleString(),
      deliveryChannel: channel,
    });
    const existing = requestState[selected.document.id] ?? {
      schemaVersion: 2,
      sourceDocumentId: selected.document.id,
      attempts: [],
    };
    const next = {
      ...requestState,
      [selected.document.id]: {
        ...existing,
        attempts: [...asArray(existing.attempts), attempt],
      },
    };
    publishRequestState(next);
    setError('');
    setConfirmation(`${selected.document.title} request was recorded. No customer document was created.`);
    sendNote(
      props,
      toolName,
      `${selected.document.title} requested through ${channel}; follow-up due ${dueDate}.`,
      attempt,
    );
    const outboundRecord = buildPaperworkInboxRecords(activeCase, next).find(
      (record) => record.id === attempt.requestId,
    );
    if (outboundRecord) {
      const openedRecord = {
        ...outboundRecord,
        key: `record:${outboundRecord.id}`,
        kind: 'record',
        title: outboundRecord.documentType,
      };
      setResults([openedRecord]);
      setSelectedKey(openedRecord.key);
      setInput(outboundRecord.id);
      setHasRun(true);
    }
    setDueDate('');
    setReason('');
  }

  function checkResponse() {
    if (selected?.kind !== 'record' || selected.recordKind !== 'outbound-request') return;
    const document = templates.find((item) => item.id === selected.sourceDocumentId)
      ?? getPaperworkRequestTemplates(activeCase).find((item) => item.id === selected.sourceDocumentId);
    const existing = requestState[selected.sourceDocumentId];
    const attempt = asArray(existing?.attempts).find((item) => item.attemptId === selected.attemptId);
    if (!document || !attempt || attempt.responseCheckedAt) return;
    const updated = applyCustomerResponse({
      activeCase,
      document,
      attempt,
      checkedAt: new Date().toLocaleString(),
    });
    const next = {
      ...requestState,
      [selected.sourceDocumentId]: {
        ...existing,
        attempts: asArray(existing.attempts).map((item) => (
          item.attemptId === attempt.attemptId ? updated : item
        )),
      },
    };
    publishRequestState(next);
    setConfirmation(`Customer response check recorded: ${updated.responseStatus}.`);
    sendNote(
      props,
      toolName,
      `${document.title} response check recorded: ${updated.responseStatus}.`,
      updated,
    );
    const relatedRecords = buildPaperworkInboxRecords(activeCase, next)
      .filter((record) => record.sourceDocumentId === selected.sourceDocumentId)
      .map((record) => ({
        ...record,
        key: `record:${record.id}`,
        kind: 'record',
        title: record.documentType,
      }));
    const inbound = relatedRecords.find((record) => record.id === updated.responseId);
    setResults(relatedRecords);
    setSelectedKey(inbound?.key ?? `record:${selected.id}`);
    setInput(inbound?.id ?? selected.id);
    setHasRun(true);
  }

  function markSelectedRead() {
    if (!selectedCanBeMarkedRead) return;
    const readAt = new Date().toLocaleString();
    const next = markPaperworkResponseRead(
      requestState,
      selected.id,
      readAt,
    );
    if (next === requestState) return;
    publishRequestState(next);
    setResults((current) => current.map((item) => (
      item.key === selected.key ? { ...item, unread: false, readAt } : item
    )));
    setConfirmation(`${selected.documentType} was marked as read.`);
  }

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What paperwork has been requested, received, or left pending for this case?"
      reference
      displayName="Document Request"
      icon="evidence"
      onBack={props.onBackToWorkspace}
      showLuna={false}
    >
      <article
        className="sky-card span-12 sky-reference-search sky-document-reference-search"
        data-shape="ribbon"
        data-sparkle="true"
      >
        <span className="sky-card-sheen" aria-hidden="true" />
        <SkySparkles />
        <div className="sky-card-inner">
          <header className="sky-reference-search-heading">
            <span aria-hidden="true"><SkyIcon name="evidence" size={20} /></span>
            <div>
              <small>Search before reveal</small>
              <strong>Open requestable paperwork or request history</strong>
              <p>Sending is always a separate learner action. It records an outbound request and never creates a customer document.</p>
            </div>
          </header>
          <form className="sky-reference-search-row" onSubmit={runSearch} noValidate>
            <label>
              <span>Document request search</span>
              <input
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setResults([]);
                  setSelectedKey('');
                  setError('');
                  setConfirmation('');
                  setDueDate('');
                  setReason('');
                  setHasRun(false);
                }}
                placeholder="Document title, type, status, category, or request ID"
                aria-label="Search Document Request"
                autoComplete="off"
              />
            </label>
            <button className="sky-button" type="submit">
              <SkyIcon name="sparkle" size={18} />
              Search
            </button>
          </form>
          {error ? <div className="sky-reference-search-message" data-tone="pink" role="alert">{error}</div> : null}
          {confirmation ? <div className="sky-reference-search-message" role="status">{confirmation}</div> : null}
          {!hasRun && !confirmation ? (
            <div className="sky-reference-search-message" role="status">
              No document-request record is open.
            </div>
          ) : null}
        </div>
      </article>

      {results.length > 0 && (
        <article
          className="sky-card span-12 sky-request-inbox-card"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <header>
              <span aria-hidden="true"><SkyIcon name="evidence" size={24} /></span>
              <div>
                <small>Manual Request Inbox</small>
                <h2>{results.length} matched record{results.length === 1 ? '' : 's'}</h2>
                <p>{inbox.length} total history record{inbox.length === 1 ? '' : 's'} for {activeCase.id}</p>
              </div>
              {unreadCount ? <strong>{unreadCount} unread</strong> : <strong>All read</strong>}
            </header>
            {selectedCanBeMarkedRead ? (
              <button className="sky-button-secondary" type="button" onClick={markSelectedRead}>
                Mark selected response as read
              </button>
            ) : null}
          </div>
        </article>
      )}

      {results.length > 0 && (
        <article
          className="sky-card span-12 sky-request-document-list"
          data-shape="notched"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <div className="sky-card-inner">
            <header>
              <div><small>Requested Documents</small><h2>Choose a template or history record</h2></div>
              <span>{results.length}</span>
            </header>
            <div className="sky-request-records" role="group" aria-label="Document Request results">
              {results.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  aria-current={selectedKey === item.key ? 'true' : undefined}
                  onClick={() => setSelectedKey(item.key)}
                >
                  <span aria-hidden="true"><SkyIcon name="evidence" size={20} /></span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.id} · {item.kind === 'template' ? 'Requestable template' : item.recordKind}</small>
                  </span>
                  <em>{item.unread ? 'Unread · ' : ''}{item.status}</em>
                </button>
              ))}
            </div>
          </div>
        </article>
      )}

      {selected?.kind === 'template' && (
        <article
          className="sky-card span-12 sky-request-composer"
          data-tone="pink"
          data-shape="ribbon"
          data-sparkle="true"
        >
          <span className="sky-card-sheen" aria-hidden="true" />
          <SkySparkles />
          <div className="sky-card-inner">
            <header>
              <span aria-hidden="true"><SkyIcon name="evidence" size={24} /></span>
              <div>
                <small>Request Document</small>
                <h2>{selected.document.title}</h2>
                <p>This action records an outbound request only.</p>
              </div>
            </header>
            <form onSubmit={sendRequest}>
              <div className="sky-request-form-pair">
                <label>
                  <span>Delivery method</span>
                  <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                    <option>Secure upload link</option>
                    <option>Email</option>
                    <option>Mail</option>
                    <option>Customer service follow-up</option>
                  </select>
                </label>
                <label>
                  <span>Follow-up due</span>
                  <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </label>
              </div>
              <label>
                <span>Request reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button className="sky-request-send" type="submit">
                <SkyIcon name="arrow" size={19} />
                Send Request
              </button>
            </form>
          </div>
        </article>
      )}

      {selected?.kind === 'record' && (
        <section className="span-12 sky-request-detail-layout" aria-label="Selected request record">
          <article className="sky-card sky-request-history-card" data-tone="pink" data-shape="notched" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <span aria-hidden="true"><SkyIcon name="evidence" size={23} /></span>
                <div>
                  <small>Request history</small>
                  <h2>{selected.documentType}</h2>
                  <p>{selected.id}</p>
                </div>
                <strong>{selected.status}</strong>
              </header>
              <FieldList fields={[
                ['Required / optional', selected.requirement],
                ['Requested', selected.requestedDate],
                ['Due date', selected.dueDate],
                ['Received', selected.receivedDate],
                ['Delivery channel', selected.deliveryChannel],
                ['Response checked', selected.responseCheckedAt],
                ['Read at', selected.readAt],
                ['Authenticity / source status', selected.authenticity],
                ['Recorded reason', selected.reason],
                ['Reviewer notes', selected.reviewerNotes],
              ]} />
              {selected.recordKind === 'outbound-request'
                && selected.status === 'Requested'
                && !selected.responseCheckedAt ? (
                  <button className="sky-request-check" type="button" onClick={checkResponse}>
                    Check Customer Response
                  </button>
                ) : null}
            </div>
          </article>
          <article className="sky-card sky-request-preview-card" data-shape="ribbon" data-sparkle="true">
            <span className="sky-card-sheen" aria-hidden="true" />
            <div className="sky-card-inner">
              <header>
                <div>
                  <small>Document Preview</small>
                  <h2>{selectedDocument?.title ?? selected.documentType}</h2>
                  <p>{selectedDocument ? 'Source page attached' : 'No source page attached to this record'}</p>
                </div>
              </header>
              <DocumentPreviewSheet
                document={selectedDocument ?? { title: selected.documentType, type: selected.status }}
                page={selectedDocument?.pages?.[0] ?? null}
                compact
              />
            </div>
          </article>
        </section>
      )}

      {selected?.kind === 'record' && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={{
            id: selected.id,
            recordId: selected.id,
            sourceRecordId: selected.sourceDocumentId,
            attemptId: selected.attemptId,
            status: selected.status,
            detail: selected.reason,
            pinPayload: {
              id: selected.id,
              sourceRecordId: selected.id,
              value: selected.id,
              label: `${selected.id} · ${selected.documentType}`,
              query: selected.id,
            },
          }}
          pinLabel={`${selected.id} · ${selected.documentType}`}
          reviewed={reviewed}
          reference
        >
          {selected.pagesAvailable ? (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Document Viewer', selected.documentViewerId)}
            >
              Open Document Viewer
            </button>
          ) : null}
        </EvidenceActions>
      )}
    </ToolShell>
  );
}

export const FinancialIntelligenceTool = FinancialInvestigationTool;
export const BusinessIntelligenceTool = Business360Tool;

export const financialBusinessToolRegistry = Object.freeze({
  'Financial Investigation': FinancialInvestigationTool,
  'Financial Intelligence': FinancialInvestigationTool,
  'Transaction History': TransactionHistoryTool,
  'Merchant Intelligence': MerchantIntelligenceTool,
  'Payment Verification': PaymentVerificationTool,
  'Business 360': Business360Tool,
  'Business Intelligence': Business360Tool,
  'Employee Profile': EmployeeProfileTool,
  'Payroll History': PayrollHistoryTool,
  'Document Viewer': DocumentViewerTool,
  'Document Request': DocumentRequestTool,
});

export const financialBusinessToolNames = Object.freeze(
  Object.keys(financialBusinessToolRegistry),
);

export function resolveFinancialBusinessTool(toolName) {
  return financialBusinessToolRegistry[toolName]
    ?? financialBusinessToolRegistry[canonicalToolName(toolName)]
    ?? null;
}

export function FinancialBusinessToolRouter(props) {
  const Component = resolveFinancialBusinessTool(props.toolName);
  if (!Component) return null;
  return <Component {...props} toolName={canonicalToolName(props.toolName)} />;
}

export default FinancialBusinessToolRouter;
