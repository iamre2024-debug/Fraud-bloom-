import { useEffect, useMemo, useState } from 'react';
import { financialRecordsByCase } from '../data/financialRecords.js';
import { businessRecordsByCase } from '../data/businessRecords.js';
import {
  financialRecordSearchText,
  getFinancialInvestigation,
} from '../data/financialInvestigationRecords.js';
import {
  findPayrollRecord,
  getEmployeeProfiles,
  getPayrollHistory,
  getTransactionHistory,
} from '../data/businessPayrollWorkspace.js';
import {
  merchantIntelligenceTabs,
} from '../data/merchantIntelligenceRecords.js';
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
  documentSearchText,
  getCaseDocuments,
} from '../data/documentRecords.js';
import {
  applyCustomerResponse,
  buildCustomerResponseDocuments,
  buildPaperworkInboxRecords,
  createPaperworkAttempt,
  getPaperworkRequestTemplates,
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

function explicitMerchantSource(activeCase = {}) {
  const packet = activeCase.toolResults?.merchantIntelligence;
  return Boolean(
    packet
    || activeCase.merchantResponse
    || activeCase.merchantAuthorization
    || activeCase.chargebackDecision,
  );
}

function explicitMerchantWorkspace(activeCase = {}) {
  const packet = activeCase.toolResults?.merchantIntelligence ?? {};
  const financial = explicitFinancialSource(activeCase);
  const primaryTransaction = financial.transactions[0] ?? {};
  const profile = packet.profile ?? {};
  const response = packet.response ?? activeCase.merchantResponse ?? {};
  const authorization = packet.authorization ?? activeCase.merchantAuthorization ?? {};
  const decision = activeCase.chargebackDecision ?? {};
  const documents = asArray(
    activeCase.documents?.length
      ? activeCase.documents
      : activeCase.toolResults?.documents,
  );
  const merchantName = profile.name
    ?? primaryTransaction.merchant
    ?? clean(activeCase.transactionInfo).split(/[·-]/)[0]
    ?? '';
  return {
    profile: {
      name: merchantName,
      legalName: profile.legalName,
      descriptor: profile.descriptor,
      mcc: profile.mcc,
      category: profile.category,
      location: profile.location ?? primaryTransaction.location,
      channel: profile.channel ?? primaryTransaction.channel,
      firstUsed: profile.firstUsed,
    },
    records: asArray(packet.records),
    claimDetails: [
      ['Customer', activeCase.person],
      ['Merchant', merchantName],
      ['Transaction ID', primaryTransaction.id],
      ['Transaction date', primaryTransaction.posted ?? activeCase.claimDetails?.disputedTransactionDate],
      ['Disputed amount', primaryTransaction.amount ?? activeCase.amount],
      ['Reported allegation', activeCase.reportedAllegation ?? activeCase.allegation],
      ['Cancellation date', activeCase.claimDetails?.cancellationDate],
      ['Cancellation method', activeCase.claimDetails?.cancellationMethod],
      ['Reported', activeCase.reportedDate ?? activeCase.opened],
    ],
    network: {
      fields: [
        ['Reason-code lane', packet.reasonCode ?? decision.reasonCode],
        ['Response deadline', packet.responseDeadline ?? decision.responseDeadline],
        ['Merchant evidence requirement', decision.merchantEvidence],
        ['Authorization review requirement', decision.authorizationReview],
        ['Fulfillment review requirement', decision.fulfillmentReview],
      ],
      documents: [],
    },
    response: {
      fields: [
        ['Response status', response.status],
        ['Response received', response.receivedDate],
        ['Cancellation request found', response.cancellationRequestFound],
        ['Refund issued', response.refundIssued],
      ],
      statement: response.statement,
      documents: asArray(packet.response?.documents),
    },
    authorizationFields: [
      ['Authorization ID', authorization.id],
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
    ],
    customerDocuments: documents.map((document) => ({
      id: document.id,
      title: document.title ?? document.name,
      source: document.source ?? 'Case document inventory',
      status: document.status,
      reference: document.reference,
    })),
    customerRequirements: [],
    visa: {
      fields: [
        ['Recorded reason-code lane', packet.reasonCode ?? decision.reasonCode],
        ['Response deadline', packet.responseDeadline ?? decision.responseDeadline],
      ],
      requirements: [],
    },
    timeline: asArray(activeCase.events).map((event) => ({
      date: event.time,
      label: event.label,
      detail: event.detail,
    })),
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
    const recordId = record?.id
      ?? record?.recordId
      ?? record?.paymentRecordId
      ?? value;
    props.onPin({
      id: recordId,
      recordId,
      sourceRecordId: recordId,
      value,
      label: value,
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
}) {
  const [note, setNote] = useState('');

  useEffect(() => {
    setNote('');
  }, [props.activeCase?.id, recordId]);

  return (
    <article className="sky-card span-12">
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
            onClick={() => sendReviewed(props, toolName)}
          >
            {reviewed ? `✓ ${toolName} reviewed` : `Mark ${toolName} reviewed`}
          </button>
        </div>
      </div>
    </article>
  );
}

function ToolShell({ toolName, question, activeCase, children }) {
  return (
    <section
      className="sky-main"
      data-financial-business-tool={canonicalToolName(toolName)}
      data-case-id={activeCase?.id ?? ''}
    >
      <ToolIntro toolName={toolName} question={question} activeCase={activeCase} />
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
    setError(matches.length ? '' : 'No supplied financial record matched that search.');
  }

  const selected = results.find((record) => record.id === selectedId) ?? null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What financial activity is recorded for this product and review period?"
    >
      <SearchCard
        title="Search supplied financial records"
        description="Run a case-scoped search. Account, spending, deposit, payment, loan, and payroll facts remain hidden until a supplied record matches."
        onSubmit={runSearch}
        error={error}
        status={!hasRun ? 'No financial result is open.' : results.length ? `${results.length} supplied record(s) matched. Choose one to inspect.` : ''}
      >
        <label className="sky-field wide">
          <span>Financial record search</span>
          <input
            className="sky-search"
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
          />
        </label>
        <button className="sky-button" type="submit">Run financial search</button>
      </SearchCard>

      {results.length > 0 && (
        <article className="sky-card span-5">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div><p>Matched records</p><h3>Choose a source record</h3></div>
            </header>
            <ResultList
              records={results}
              selectedId={selectedId}
              onSelect={setSelectedId}
              getTitle={(record) => record.title ?? record.id}
              getMeta={(record) => `${record.sectionLabel} · ${record.status ?? record.period ?? 'Recorded'}`}
              ariaLabel="Financial Investigation matched records"
            />
          </div>
        </article>
      )}

      {selected && (
        <article className="sky-card span-7" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>{selected.sectionLabel}</p>
                <h3>{selected.title ?? selected.id}</h3>
                <span>{selected.detail ?? selected.observed ?? 'Supplied financial record'}</span>
              </div>
              <span className="sky-chip">{selected.status ?? 'Recorded'}</span>
            </header>
            <FieldList
              fields={[
                ['Record ID', selected.id],
                ['Observed', selected.observed ?? selected.period],
                ['Value', selected.value ?? selected.totalDisplay],
                ['Source record IDs', selected.supportRecordIds],
                ...asArray(selected.fields),
              ]}
            />
          </div>
        </article>
      )}

      {selected && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={selected}
          reviewed={reviewed}
        >
          {selected.payrollRunId && (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Payroll History', selected.payrollRunId)}
            >
              Open Payroll History
            </button>
          )}
        </EvidenceActions>
      )}
    </ToolShell>
  );
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
      setError('Enter a transaction ID, merchant, account, channel, date, or status.');
      return;
    }
    if (!records.length) {
      setResults([]);
      setError('No supplied transaction records are attached to this case.');
      return;
    }
    const matches = records.filter((record) => lower([
      record.id,
      record.merchant,
      record.instrument,
      record.channel,
      record.posted,
      record.status,
      record.category,
      record.amount,
    ].join(' ')).includes(requested));
    setResults(matches);
    setError(matches.length ? '' : 'No supplied transaction matched that search.');
  }

  const selected = results.find((record) => record.id === selectedId) ?? null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What transactions are in scope, and what details are recorded for each item?"
    >
      <SearchCard
        title="Search transaction history"
        description="Results are limited to transactions supplied on the active case. No transaction detail appears until a matching search is run."
        onSubmit={runSearch}
        error={error}
        status={!hasRun ? 'No transaction result is open.' : results.length ? `${results.length} transaction(s) matched. Choose one to inspect.` : ''}
      >
        <label className="sky-field wide">
          <span>Transaction search</span>
          <input
            className="sky-search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResults([]);
              setSelectedId('');
              setError('');
              setHasRun(false);
            }}
            placeholder="Transaction ID, merchant, account, date, channel, or status"
            aria-label="Search Transaction History"
          />
        </label>
        <button className="sky-button" type="submit">Run transaction search</button>
      </SearchCard>

      {results.length > 0 && (
        <article className="sky-card span-5">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div><p>Activity matches</p><h3>Choose a transaction</h3></div>
            </header>
            <ResultList
              records={results}
              selectedId={selectedId}
              onSelect={setSelectedId}
              getTitle={(record) => record.merchant}
              getMeta={(record) => `${record.id} · ${record.posted} · ${record.amount}`}
              ariaLabel="Transaction History results"
            />
          </div>
        </article>
      )}

      {selected && (
        <article className="sky-card span-7" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>Transaction detail</p>
                <h3>{selected.merchant}</h3>
                <span>{selected.id} · {selected.posted} {selected.time ? `at ${selected.time}` : ''}</span>
              </div>
              <span className="sky-chip">{selected.status}</span>
            </header>
            <FieldList fields={[
              ['Amount', selected.amount],
              ['Direction', selected.direction],
              ['Account / card', selected.instrument],
              ['Channel', selected.channel],
              ['Category', selected.category],
              ['Entry mode', selected.entryMode],
              ['Location', selected.location],
              ['Recorded context', selected.context],
              ['Related records', selected.relatedRecords],
            ]} />
          </div>
        </article>
      )}

      {selected && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={selected}
          pinLabel={`${selected.id} · ${selected.merchant}`}
          reviewed={reviewed}
        >
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => openRelatedTool(props, 'Financial Investigation', selected.id)}
          >
            Open Financial Investigation
          </button>
        </EvidenceActions>
      )}
    </ToolShell>
  );
}

function MerchantSection({ workspace, section }) {
  if (section === 'claim-details') {
    return <FieldList fields={workspace.claimDetails} />;
  }
  if (section === 'network-submission') {
    return (
      <>
        <FieldList fields={workspace.network?.fields} />
        <DocumentRows documents={workspace.network?.documents} />
      </>
    );
  }
  if (section === 'merchant-response') {
    return (
      <>
        <FieldList fields={workspace.response?.fields} />
        {workspace.response?.statement && <div className="sky-notice">{workspace.response.statement}</div>}
        <DocumentRows documents={workspace.response?.documents} />
      </>
    );
  }
  if (section === 'customer-evidence') {
    return (
      <>
        <DocumentRows documents={workspace.customerDocuments} />
        <FieldList fields={asArray(workspace.customerRequirements).map((item, index) => [`Required item ${index + 1}`, item])} />
      </>
    );
  }
  if (section === 'visa-requirements') {
    return (
      <>
        <div className="sky-notice">Guidance only. This section does not select a reason code or decide the claim.</div>
        <FieldList fields={[
          ...asArray(workspace.visa?.fields),
          ...asArray(workspace.visa?.requirements).map((item, index) => [`Checklist item ${index + 1}`, item]),
        ]} />
      </>
    );
  }
  return (
    <FieldList fields={asArray(workspace.timeline).map((item) => [
      item.date ?? 'Recorded event',
      `${item.label ?? 'Case event'}${item.detail ? ` · ${item.detail}` : ''}`,
    ])} />
  );
}

function DocumentRows({ documents = [] }) {
  const rows = asArray(documents);
  if (!rows.length) return <div className="sky-empty">No source document is supplied for this section.</div>;
  return (
    <div className="sky-record-list" aria-label="Supplied documents">
      {rows.map((document) => (
        <div className="sky-data-row" key={document.id ?? document.reference ?? document.title}>
          <dt>{document.title ?? document.id}</dt>
          <dd>{displayValue([document.source, document.status, document.reference])}</dd>
        </div>
      ))}
    </div>
  );
}

export function MerchantIntelligenceTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Merchant Intelligence';
  const supplied = useMemo(() => explicitMerchantSource(activeCase), [activeCase]);
  const workspace = useMemo(
    () => (supplied ? explicitMerchantWorkspace(activeCase) : null),
    [activeCase, supplied],
  );
  const [input, setInput] = useState(query);
  const [opened, setOpened] = useState(false);
  const [section, setSection] = useState('claim-details');
  const [error, setError] = useState('');

  useEffect(() => {
    setInput(query);
    setOpened(false);
    setSection('claim-details');
    setError('');
  }, [activeCase.id, query]);

  function runSearch(event) {
    event.preventDefault();
    const requested = lower(input);
    setOpened(false);
    if (!requested) {
      setError('Enter a merchant name, descriptor, MCC, or supplied merchant record ID.');
      return;
    }
    if (!workspace) {
      setError('No supplied merchant intelligence packet is attached to this case.');
      return;
    }
    const searchable = lower([
      workspace.profile?.name,
      workspace.profile?.legalName,
      workspace.profile?.descriptor,
      workspace.profile?.mcc,
      ...asArray(workspace.authorizationFields).flat(),
      ...asArray(workspace.response?.fields).flat(),
      ...asArray(workspace.records).flatMap((record) => [
        record.id,
        record.title,
        record.section,
        ...asArray(record.fields).flat(),
      ]),
    ].join(' '));
    if (!searchable.includes(requested)) {
      setError('No supplied merchant record matched that search.');
      return;
    }
    setError('');
    setOpened(true);
  }

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What merchant, authorization, fulfillment, refund, and dispute evidence is supplied?"
    >
      <SearchCard
        title="Search merchant records"
        description="Merchant lifecycle facts remain hidden until a case-supplied merchant value matches."
        onSubmit={runSearch}
        error={error}
        status={!opened ? 'No merchant result is open.' : ''}
      >
        <label className="sky-field wide">
          <span>Merchant search</span>
          <input
            className="sky-search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setOpened(false);
              setSection('claim-details');
              setError('');
            }}
            placeholder="Merchant name, descriptor, MCC, or record ID"
            aria-label="Search Merchant Intelligence"
          />
        </label>
        <button className="sky-button" type="submit">Run merchant search</button>
      </SearchCard>

      {opened && workspace && (
        <article className="sky-card span-12" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>Matched merchant</p>
                <h3>{workspace.profile.name}</h3>
                <span>{[
                  workspace.profile.descriptor,
                  workspace.profile.category,
                ].filter(Boolean).join(' · ') || 'Supplied merchant relationship'}</span>
              </div>
              <span className="sky-chip">Evidence First</span>
            </header>
            <FieldList fields={[
              ['Legal name', workspace.profile.legalName],
              ['MCC', workspace.profile.mcc],
              ['Location', workspace.profile.location],
              ['Channel', workspace.profile.channel],
              ['First recorded use', workspace.profile.firstUsed],
              ...workspace.authorizationFields,
            ]} />
          </div>
        </article>
      )}

      {opened && workspace && (
        <article className="sky-card span-12">
          <div className="sky-card-inner">
            <nav className="sky-tabs" aria-label="Merchant Intelligence sections">
              {merchantIntelligenceTabs.map((tab) => (
                <button
                  className="sky-tab"
                  type="button"
                  key={tab.id}
                  aria-selected={section === tab.id}
                  onClick={() => setSection(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
            <div className="sky-card-inner">
              <MerchantSection workspace={workspace} section={section} />
            </div>
          </div>
        </article>
      )}

      {opened && workspace && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={workspace.profile.name}
          record={workspace}
          pinLabel={`${workspace.profile.name} · merchant packet`}
          reviewed={reviewed}
        >
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => openRelatedTool(props, 'Document Viewer')}
          >
            Open Document Viewer
          </button>
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => openRelatedTool(props, 'Document Request')}
          >
            Open Document Request
          </button>
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

  useEffect(() => {
    setLookup({
      bankCode: routedPrefill?.bankCode ?? '',
      destinationId: routedPrefill?.destinationId ?? '',
      ownerName: routedPrefill?.ownerName ?? '',
    });
    setResult(null);
    setError('');
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
  }

  const record = result?.state === 'found' ? result.record : null;

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What does the exact payment destination record show?"
    >
      <SearchCard
        title="Verify a specific payment destination"
        description="Enter the exact Bank Code and Destination ID. An optional name adds a relationship-aware comparison. No ownership, standing, prior-use, return, or account-age detail appears before Run verification."
        onSubmit={runLookup}
        error={error}
        status={!result ? 'Verification result is hidden.' : ''}
      >
        <label className="sky-field">
          <span>Bank Code</span>
          <input
            value={lookup.bankCode}
            onChange={(event) => updateLookup('bankCode', event.target.value)}
            placeholder="Enter Bank Code"
            aria-label="Bank Code"
            autoComplete="off"
          />
        </label>
        <label className="sky-field">
          <span>Destination ID</span>
          <input
            value={lookup.destinationId}
            onChange={(event) => updateLookup('destinationId', event.target.value)}
            placeholder="Enter Destination ID"
            aria-label="Destination ID"
            autoComplete="off"
          />
        </label>
        <label className="sky-field">
          <span>{relationshipLabel}</span>
          <input
            value={lookup.ownerName}
            onChange={(event) => updateLookup('ownerName', event.target.value)}
            placeholder="Optional name comparison"
            aria-label="Optional payment relationship name"
            autoComplete="off"
          />
        </label>
        <button className="sky-button" type="submit">Run verification</button>
      </SearchCard>

      {result?.state === 'not-found' && (
        <article className="sky-card span-12">
          <div className="sky-card-inner">
            <div className="sky-notice" role="status">
              No exact Bank Code and Destination ID pair was found in the supplied case records. A missing destination does not determine the case outcome.
            </div>
          </div>
        </article>
      )}

      {record && (
        <>
          <article className="sky-card span-12" data-tone="pink">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div>
                  <p>Exact destination result</p>
                  <h3>{record.type}</h3>
                  <span>{result.bankCode} · {result.destinationId}</span>
                </div>
                <span className="sky-chip" data-tone="pink">
                  {lookup.ownerName ? result.nameMatchResult : 'Name not compared'}
                </span>
              </header>
              <div className="sky-metric-grid">
                <article className="sky-metric">
                  <span>Name relationship</span>
                  <strong>{lookup.ownerName ? result.nameMatchResult : 'Not requested'}</strong>
                  <small>{lookup.ownerName ? result.matchedPartyType : 'Optional comparison omitted'}</small>
                </article>
                <article className="sky-metric">
                  <span>Account status</span>
                  <strong>{result.accountState}</strong>
                  <small>As of {result.statusAsOf}</small>
                </article>
                <article className="sky-metric">
                  <span>NSF result</span>
                  <strong>{result.nsfStatus}</strong>
                  <small>Separate from operational status</small>
                </article>
                <article className="sky-metric">
                  <span>Time on record</span>
                  <strong>{result.accountAgeLabel}</strong>
                  <small>{record.firstSeen}</small>
                </article>
              </div>
            </div>
          </article>

          <article className="sky-card span-6">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Ownership and use</p><h3>Supplied account evidence</h3></div>
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

          <article className="sky-card span-6">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Standing and changes</p><h3>Destination record</h3></div>
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

          <article className="sky-card span-12">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Verification activity</p><h3>Recorded attempts</h3></div>
              </header>
              {record.verificationAttempts.length ? (
                <FieldList fields={record.verificationAttempts.map((attempt) => [
                  `${attempt.time} · ${attempt.method}`,
                  `${attempt.result} · ${attempt.note}`,
                ])} />
              ) : <div className="sky-empty">No verification attempts are supplied.</div>}
            </div>
          </article>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={record.id}
            record={record}
            pinLabel={`${record.id} · ${result.bankCode} · ${result.destinationId}`}
            reviewed={reviewed}
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

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Which supplied business identity and relationship facts match this search?"
    >
      <SearchCard
        title="Search a business relationship"
        description="Enter an exact business name plus one supplied secondary value. Business identity and relationship details stay hidden until both values match."
        onSubmit={runSearch}
        error={error}
        status={!opened ? 'No business profile is open.' : ''}
      >
        <label className="sky-field">
          <span>Business name</span>
          <input
            value={lookup.businessName}
            onChange={(event) => updateBusinessLookup({ businessName: event.target.value })}
            placeholder="Enter exact business name"
            aria-label="Business name"
          />
        </label>
        <label className="sky-field">
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
        <label className="sky-field">
          <span>{businessSearchModes[lookup.mode].label}</span>
          <input
            value={lookup.secondary}
            onChange={(event) => updateBusinessLookup({ secondary: event.target.value })}
            placeholder="Enter exact supplied value"
            aria-label="Business secondary search value"
          />
        </label>
        <button className="sky-button" type="submit">Run business search</button>
      </SearchCard>

      {opened && (
        <>
          <article className="sky-card span-7" data-tone="pink">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div>
                  <p>Matched business</p>
                  <h3>{profile.legalName}</h3>
                  <span>{profile.relationship ?? 'Supplied relationship record'}</span>
                </div>
                <span className="sky-chip">{profile.standing ?? 'Recorded'}</span>
              </header>
              <FieldList fields={[
                ['Business ID', profile.businessId],
                ['DBA', profile.dba],
                ['Entity type', profile.entityType],
                ['Registration ID', profile.registrationId],
                ['Masked EIN', profile.maskedEin],
                ['Address', profile.address],
                ['Phone', profile.phone],
                ['Email', profile.email],
                ['Website', profile.website],
                ['Observed', profile.observed],
                ['Recorded context', profile.context],
              ]} />
            </div>
          </article>

          <article className="sky-card span-5">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Relationship records</p><h3>Supplied business objects</h3></div>
              </header>
              {source.business360.length ? (
                <FieldList fields={source.business360.map((record) => [
                  record.id,
                  [record.entity, record.relationship, record.status, record.observed].filter(Boolean).join(' · '),
                ])} />
              ) : <div className="sky-empty">No additional business objects are supplied.</div>}
              {source.companyPayrollProfile && (
                <FieldList fields={[
                  ['Payroll ID', profile.payrollId],
                  ['Pay schedule', profile.paySchedule],
                  ['Active employee count', profile.activeEmployeeCount],
                ]} />
              )}
            </div>
          </article>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={profile.businessId ?? profile.legalName}
            record={{ profile, source }}
            pinLabel={`${profile.businessId ?? 'Business'} · ${profile.legalName}`}
            reviewed={reviewed}
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
    const match = records.find((item) => (
      lower(item.id) === requested || lower(item.name) === requested
    ));
    if (!match) {
      setError('No supplied employee profile matched that exact ID or name.');
      return;
    }
    setError('');
    setRecord(match);
  }

  const currentPayment = record?.paymentHistory?.at(-1);
  const currentDestination = currentPayment?.destinations?.[0];
  const paymentHint = currentDestination?.bankCode && currentDestination?.destinationId
    ? buildPaymentLookupHint({
        bankCode: currentDestination.bankCode,
        destinationId: currentDestination.destinationId,
        ownerName: record.name,
      })
    : '';

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="Which supplied employee facts connect to the active business and payroll relationship?"
    >
      <SearchCard
        title="Find an employee profile"
        description="Run an exact employee ID or name search. Employment, tax, pay, and payment-history fields remain hidden until a profile matches."
        onSubmit={runSearch}
        error={error}
        status={!record ? 'No employee profile is open.' : ''}
      >
        <label className="sky-field wide">
          <span>Employee ID or name</span>
          <input
            className="sky-search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setRecord(null);
              setError('');
            }}
            placeholder="Enter exact employee ID or name"
            aria-label="Search Employee Profile"
          />
        </label>
        <button className="sky-button" type="submit">Run employee search</button>
      </SearchCard>

      {record && (
        <>
          <article className="sky-card span-7" data-tone="pink">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div>
                  <p>Employee profile</p>
                  <h3>{record.name}</h3>
                  <span>{record.role} · {record.employer}</span>
                </div>
                <span className="sky-chip">{record.status}</span>
              </header>
              <FieldList fields={[
                ['Employee ID', record.id],
                ['Employer', record.employer],
                ['Position', record.position ?? record.role],
                ['Department', record.department],
                ['Employment status', record.employmentStatus ?? record.status],
                ['Hire date', record.hireDate],
                ['Address', record.address],
                ['Pay type', record.payType],
                ['Pay schedule', record.paySchedule],
                ['Current rate', record.currentRate],
                ['W-4 setup', record.w4Setup],
                ['Tax elections', record.taxElections],
                ['Official contact', record.officialContact],
              ]} />
            </div>
          </article>

          <article className="sky-card span-5">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Payroll links</p><h3>Supplied employment history</h3></div>
              </header>
              <FieldList fields={[
                ['Linked payroll records', record.linkedPayroll],
                ['Rate history', asArray(record.rateHistory).map((item) => `${item.effectiveDate}: ${formatMoney(item.value)}`)],
                ['Payment method', currentPayment?.method],
                ['Payment effective date', currentPayment?.effectiveDate],
                ['Payment record ID', currentPayment?.paymentRecordId],
                ['Bank Code', currentDestination?.bankCode],
                ['Destination ID', currentDestination?.destinationId],
              ]} />
            </div>
          </article>

          <EvidenceActions
            props={props}
            toolName={toolName}
            recordId={record.id}
            record={record}
            pinLabel={`${record.id} · ${record.name}`}
            reviewed={reviewed}
          >
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Payroll History', record.id)}
            >
              Open Payroll History
            </button>
            {paymentHint && (
              <button
                className="sky-button-secondary"
                type="button"
                onClick={() => openRelatedTool(props, 'Payment Verification', paymentHint)}
              >
                Open Payment Verification
              </button>
            )}
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
    <article className="sky-card span-6">
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div><p>Paystub detail</p><h3>{title}</h3></div>
        </header>
        <FieldList fields={values.map((item, index) => [
          item.type ?? item.label ?? `${title} ${index + 1}`,
          [
            item.current !== undefined ? `Current ${formatMoney(item.current)}` : '',
            item.ytd !== undefined ? `YTD ${formatMoney(item.ytd)}` : '',
            item.hours !== undefined ? `${item.hours} hours` : '',
            item.rate !== undefined ? `Rate ${formatMoney(item.rate)}` : '',
          ].filter(Boolean).join(' · '),
        ])} />
      </div>
    </article>
  );
}

export function PayrollHistoryTool(props) {
  const { activeCase = {}, query = '', reviewed = false } = props;
  const toolName = 'Payroll History';
  const source = useMemo(() => explicitBusinessSource(activeCase), [activeCase]);
  const workspace = useMemo(
    () => (source.payrollRuns.length ? getPayrollHistory(activeCase) : null),
    [activeCase, source.payrollRuns.length],
  );
  const [input, setInput] = useState(query);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setInput(query);
    setResult(null);
    setError('');
  }, [activeCase.id, query]);

  function runSearch(event) {
    event.preventDefault();
    const requested = clean(input);
    setResult(null);
    if (!requested) {
      setError('Enter an exact payroll run ID, employee ID, paystub ID, Bank Code, Destination ID, or payment record ID.');
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
    setError('');
    setResult(match);
  }

  const run = result?.run ?? null;
  const employee = result?.employee ?? run?.employees?.[0] ?? null;
  const paystub = result?.paystub ?? employee?.paystub ?? null;
  const destination = result?.destination ?? paystub?.paymentDestinations?.[0] ?? null;
  const resultId = paystub?.id ?? employee?.employeeId ?? run?.id ?? '';
  const paymentHint = destination?.bankCode && destination?.destinationId
    ? buildPaymentLookupHint({
        bankCode: destination.bankCode,
        destinationId: destination.destinationId,
        ownerName: paystub?.employee?.legalName ?? employee?.name ?? '',
      })
    : '';

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What immutable payroll run, employee, paystub, and destination facts are supplied?"
    >
      <SearchCard
        title="Search payroll history"
        description="Run an exact identifier search. Payroll totals, paystub breakdowns, and destination details remain hidden until a supplied record matches."
        onSubmit={runSearch}
        error={error}
        status={!result ? 'No payroll result is open.' : ''}
      >
        <label className="sky-field wide">
          <span>Payroll identifier</span>
          <input
            className="sky-search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResult(null);
              setError('');
            }}
            placeholder="Payroll run, employee, paystub, Bank Code, Destination ID, or payment record ID"
            aria-label="Search Payroll History"
          />
        </label>
        <button className="sky-button" type="submit">Run payroll search</button>
      </SearchCard>

      {run && (
        <article className="sky-card span-12" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>Matched payroll run</p>
                <h3>{run.id}</h3>
                <span>{run.payPeriodLabel ?? run.payPeriod?.label} · Pay date {run.payDate ?? run.processedDate}</span>
              </div>
              <span className="sky-chip">{run.runStatus ?? run.status}</span>
            </header>
            <div className="sky-metric-grid">
              {[
                ['Gross wages', formatMoney(run.grossWages)],
                ['Net pay', formatMoney(run.netPay ?? run.netPayroll)],
                ['Company debit', formatMoney(run.totalCompanyDebit ?? run.amount)],
                ['Employees', run.employeeCount],
              ].map(([label, value]) => (
                <article className="sky-metric" key={label}>
                  <span>{label}</span>
                  <strong>{displayValue(value)}</strong>
                  <small>Supplied run value</small>
                </article>
              ))}
            </div>
            <FieldList fields={[
              ['Employer', run.employer ?? workspace.companyPayrollProfile?.legalName],
              ['Run type', run.runType],
              ['Pay period start', run.payPeriodStart ?? run.payPeriod?.start],
              ['Pay period end', run.payPeriodEnd ?? run.payPeriod?.end],
              ['Submission date', run.submissionDate],
              ['Settlement date', run.settlementDate],
              ['Submitted by', run.submittedBy],
              ['Approved by', run.approvedBy],
              ['Funding Bank Code', run.companyFunding?.bankCode ?? run.fundingSource],
              ['Funding account', run.companyFunding?.accountUsed],
              ['Funding payment record', run.companyFunding?.paymentRecordId],
            ]} />
          </div>
        </article>
      )}

      {paystub && (
        <>
          <article className="sky-card span-6">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div>
                  <p>Immutable paystub</p>
                  <h3>{paystub.id}</h3>
                  <span>{paystub.employee?.legalName ?? employee?.name}</span>
                </div>
              </header>
              <FieldList fields={[
                ['Employer', paystub.employer?.legalName],
                ['Employer address', paystub.employer?.address],
                ['Masked EIN', paystub.employer?.maskedEin],
                ['Employee', paystub.employee?.legalName],
                ['Employee ID', paystub.employee?.employeeId ?? employee?.employeeId],
                ['Employee address', paystub.employee?.address],
                ['Payroll type', paystub.payrollType],
                ['Pay period', paystub.payPeriod?.label],
                ['Pay date', paystub.payDate],
              ]} />
            </div>
          </article>

          <article className="sky-card span-6">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Paystub totals</p><h3>Current and YTD snapshot</h3></div>
              </header>
              <FieldList fields={[
                ['Gross pay', formatMoney(paystub.summary?.grossPay)],
                ['Employee taxes', formatMoney(paystub.summary?.employeeTaxes)],
                ['Employee deductions', formatMoney(paystub.summary?.employeeDeductions)],
                ['Employer contributions', formatMoney(paystub.summary?.employerContributions)],
                ['Reimbursements', formatMoney(paystub.summary?.reimbursements)],
                ['Net pay', formatMoney(paystub.summary?.netPay)],
                ['Total payroll cost', formatMoney(paystub.summary?.totalPayrollCost)],
                ['YTD gross', formatMoney(paystub.ytdSnapshot?.grossPay)],
                ['YTD net', formatMoney(paystub.ytdSnapshot?.netPay)],
              ]} />
            </div>
          </article>

          <PayrollBreakdown title="Earnings" rows={paystub.earnings} />
          <PayrollBreakdown title="Taxes" rows={paystub.taxes} />
          <PayrollBreakdown title="Deductions" rows={paystub.deductions} />
          <PayrollBreakdown title="Employer contributions" rows={paystub.employerContributions} />
          <PayrollBreakdown title="Reimbursements" rows={paystub.reimbursements} />
          <PayrollBreakdown title="Adjustments" rows={paystub.adjustments} />

          <article className="sky-card span-12">
            <div className="sky-card-inner">
              <header className="sky-section-heading">
                <div><p>Payment destinations</p><h3>Immutable disbursement records</h3></div>
              </header>
              <FieldList fields={asArray(paystub.paymentDestinations).flatMap((item, index) => [
                [`Destination ${index + 1} method`, item.method],
                [`Destination ${index + 1} Bank Code`, item.bankCode],
                [`Destination ${index + 1} ID`, item.destinationId],
                [`Destination ${index + 1} amount`, formatMoney(item.amount)],
                [`Destination ${index + 1} status`, item.status],
                [`Destination ${index + 1} first seen`, item.firstSeen],
                [`Destination ${index + 1} payment record`, item.paymentRecordId],
                [`Destination ${index + 1} check number`, item.checkNumber],
              ])} />
            </div>
          </article>
        </>
      )}

      {result && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={resultId}
          record={result}
          pinLabel={`${resultId} · payroll evidence`}
          reviewed={reviewed}
        >
          {paymentHint && (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Payment Verification', paymentHint)}
            >
              Open Payment Verification
            </button>
          )}
        </EvidenceActions>
      )}
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

function DocumentPage({ document, page, index }) {
  if (!page) {
    return <div className="sky-empty">No source page is supplied for this document.</div>;
  }
  return (
    <article className="sky-card span-12">
      <div className="sky-card-inner">
        <header className="sky-section-heading">
          <div>
            <p>Page {index + 1} of {asArray(document.pages).length}</p>
            <h3>{page.title ?? document.title}</h3>
            <span>{page.subtitle ?? page.reference ?? document.reference}</span>
          </div>
        </header>
        {asArray(page.sections).map((section, sectionIndex) => (
          <section key={`${section.title}-${sectionIndex}`}>
            <h3>{section.title}</h3>
            <FieldList fields={section.rows} />
            {asArray(section.paragraphs).map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.table && (
              <FieldList fields={asArray(section.table.rows).map((row, rowIndex) => [
                `${section.table.columns?.[0] ?? 'Row'} ${rowIndex + 1}`,
                row.join(' · '),
              ])} />
            )}
          </section>
        ))}
      </div>
    </article>
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
    cases = [],
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

  useEffect(() => {
    setAccountId(routedIdentifier);
    setMatchedCase(null);
    setDocuments([]);
    setSelectedId('');
    setPageIndex(0);
    setFilter('');
    setError('');
  }, [activeCase.id, routedIdentifier]);

  function runAccountSearch(event) {
    event.preventDefault();
    setMatchedCase(null);
    setDocuments([]);
    setSelectedId('');
    setPageIndex(0);
    const requested = clean(accountId).toUpperCase();
    if (!requested) {
      setError('Enter an exact Account ID or Document ID.');
      return;
    }
    const candidates = [activeCase, ...asArray(cases).filter((item) => item.id !== activeCase.id)];
    let match = candidates.find((item) => clean(item.accountId).toUpperCase() === requested) ?? null;
    let suppliedDocuments = [];
    let matchedDocument = null;

    if (match) {
      const requestState = requestStateForCase(documentRequests, match.id);
      if (explicitDocumentSource(match, requestState)) {
        suppliedDocuments = [
          ...getCaseDocuments(match),
          ...buildCustomerResponseDocuments(match, requestState),
        ].filter((item, index, items) => (
          items.findIndex((candidate) => candidate.id === item.id) === index
        ));
      }
    } else {
      for (const candidate of candidates) {
        const requestState = requestStateForCase(documentRequests, candidate.id);
        if (!explicitDocumentSource(candidate, requestState)) continue;
        const candidateDocuments = [
          ...getCaseDocuments(candidate),
          ...buildCustomerResponseDocuments(candidate, requestState),
        ].filter((item, index, items) => (
          items.findIndex((document) => document.id === item.id) === index
        ));
        const exactDocument = candidateDocuments.find(
          (document) => clean(document.id).toUpperCase() === requested,
        );
        if (!exactDocument) continue;
        match = candidate;
        suppliedDocuments = candidateDocuments;
        matchedDocument = exactDocument;
        break;
      }
    }

    if (!match) {
      setError('No supplied account or document matched that exact identifier.');
      return;
    }
    if (!suppliedDocuments.length) {
      setError('The matched case has no supplied source documents.');
      return;
    }
    setError('');
    setMatchedCase(match);
    setDocuments(suppliedDocuments);
    setSelectedId(matchedDocument?.id ?? '');
    props.onSelectCase?.(match.id, { sourceTool: toolName });
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
    >
      <SearchCard
        title="Search for customer documents"
        description="Enter an exact Account ID or Document ID. Document titles, pages, fields, sources, and statuses remain hidden until the identifier matches."
        onSubmit={runAccountSearch}
        error={error}
        status={!matchedCase ? 'Customer documents are locked.' : `${documents.length} supplied document(s) are available for the matched account.`}
      >
        <label className="sky-field wide">
          <span>Account ID or Document ID</span>
          <input
            className="sky-search"
            value={accountId}
            onChange={(event) => {
              setAccountId(event.target.value);
              setMatchedCase(null);
              setDocuments([]);
              setSelectedId('');
              setPageIndex(0);
              setFilter('');
              setError('');
            }}
            placeholder="Enter exact Account ID or Document ID"
            aria-label="Search Document Viewer by Account ID or Document ID"
            autoComplete="off"
          />
        </label>
        <button className="sky-button" type="submit">Run exact search</button>
      </SearchCard>

      {matchedCase && (
        <article className="sky-card span-12">
          <div className="sky-card-inner">
            <label className="sky-field wide">
              <span>Filter matched documents</span>
              <input
                className="sky-search"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setSelectedId('');
                }}
                placeholder="Title, reference, status, source, or extracted field"
                aria-label="Filter matched documents"
              />
            </label>
          </div>
        </article>
      )}

      {matchedCase && visibleDocuments.length > 0 && (
        <article className="sky-card span-5">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div><p>Matched account</p><h3>Choose a document</h3></div>
            </header>
            <ResultList
              records={visibleDocuments}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setPageIndex(0);
              }}
              getTitle={(document) => document.title}
              getMeta={(document) => `${document.source} · ${document.status}`}
              ariaLabel="Document Viewer results"
            />
          </div>
        </article>
      )}

      {selected && (
        <article className="sky-card span-7" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>{selected.type}</p>
                <h3>{selected.title}</h3>
                <span>{selected.source} · {selected.reviewStatus}</span>
              </div>
              <span className="sky-chip">{asArray(selected.pages).length} page(s)</span>
            </header>
            <FieldList fields={documentFields(selected)} />
            <div className="sky-action-row">
              <button
                className="sky-button-secondary"
                type="button"
                disabled={pageIndex <= 0}
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              >
                Previous page
              </button>
              <button
                className="sky-button-secondary"
                type="button"
                disabled={pageIndex >= asArray(selected.pages).length - 1}
                onClick={() => setPageIndex((current) => Math.min(asArray(selected.pages).length - 1, current + 1))}
              >
                Next page
              </button>
              <button
                className="sky-button-secondary"
                type="button"
                onClick={() => downloadDocument(selected)}
              >
                Export text copy
              </button>
            </div>
          </div>
        </article>
      )}

      {selected && <DocumentPage document={selected} page={page} index={pageIndex} />}

      {selected && (
        <EvidenceActions
          props={{ ...props, activeCase: matchedCase }}
          toolName={toolName}
          recordId={selected.id}
          record={selected}
          pinLabel={`${selected.id} · ${selected.title}`}
          reviewed={reviewed}
        >
          <button
            className="sky-button-secondary"
            type="button"
            onClick={() => openRelatedTool(props, 'Document Request', selected.id)}
          >
            Open Document Request
          </button>
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
  }, [activeCase.id, routedIdentifier]);

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
      status: 'Not requested',
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
    setError(matches.length ? '' : 'No supplied document-request record matched that search.');
  }

  const selected = results.find((item) => item.key === selectedKey) ?? null;

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
    setResults([]);
    setSelectedKey('');
    setInput('');
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
    setResults([]);
    setSelectedKey('');
  }

  return (
    <ToolShell
      toolName={toolName}
      activeCase={activeCase}
      question="What paperwork has been requested, received, or left pending for this case?"
    >
      <SearchCard
        title="Search requestable paperwork and request history"
        description="Search the supplied document inventory first. Sending a request is an explicit action; it never creates a customer response or source document."
        onSubmit={runSearch}
        error={error}
        status={confirmation || (!results.length ? 'No document-request result is open.' : `${results.length} request or template record(s) matched.`)}
      >
        <label className="sky-field wide">
          <span>Document request search</span>
          <input
            className="sky-search"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResults([]);
              setSelectedKey('');
              setError('');
              setConfirmation('');
              setDueDate('');
              setReason('');
            }}
            placeholder="Document title, type, status, category, or request ID"
            aria-label="Search Document Request"
          />
        </label>
        <button className="sky-button" type="submit">Run document search</button>
      </SearchCard>

      {results.length > 0 && (
        <article className="sky-card span-5">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div><p>Request center</p><h3>Choose a record</h3></div>
            </header>
            <ResultList
              records={results}
              selectedId={selectedKey}
              onSelect={setSelectedKey}
              getId={(item) => item.key}
              getTitle={(item) => item.title}
              getMeta={(item) => `${item.kind === 'template' ? 'Requestable template' : 'Request history'} · ${item.status}`}
              ariaLabel="Document Request results"
            />
          </div>
        </article>
      )}

      {selected?.kind === 'template' && (
        <article className="sky-card span-7" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>New paperwork request</p>
                <h3>{selected.document.title}</h3>
                <span>This action records an outbound request only.</span>
              </div>
            </header>
            <form className="sky-form-grid" onSubmit={sendRequest}>
              <label className="sky-field">
                <span>Delivery method</span>
                <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                  <option>Secure upload link</option>
                  <option>Email</option>
                  <option>Mail</option>
                  <option>Customer service follow-up</option>
                </select>
              </label>
              <label className="sky-field">
                <span>Follow-up due</span>
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </label>
              <label className="sky-field wide">
                <span>Request reason</span>
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button className="sky-button" type="submit">Send Request</button>
            </form>
          </div>
        </article>
      )}

      {selected?.kind === 'record' && (
        <article className="sky-card span-7" data-tone="pink">
          <div className="sky-card-inner">
            <header className="sky-section-heading">
              <div>
                <p>Request history</p>
                <h3>{selected.documentType}</h3>
                <span>{selected.id}</span>
              </div>
              <span className="sky-chip">{selected.status}</span>
            </header>
            <FieldList fields={[
              ['Document type', selected.documentType],
              ['Required / optional', selected.requirement],
              ['Requested', selected.requestedDate],
              ['Due date', selected.dueDate],
              ['Received', selected.receivedDate],
              ['Delivery channel', selected.deliveryChannel],
              ['Response checked', selected.responseCheckedAt],
              ['Authenticity / source status', selected.authenticity],
              ['Linked case', selected.linkedCase],
              ['Recorded reason', selected.reason],
              ['Reviewer notes', selected.reviewerNotes],
            ]} />
            {selected.recordKind === 'outbound-request'
              && selected.status === 'Requested'
              && !selected.responseCheckedAt && (
                <div className="sky-action-row">
                  <button className="sky-button" type="button" onClick={checkResponse}>
                    Check Customer Response
                  </button>
                </div>
              )}
          </div>
        </article>
      )}

      {selected?.kind === 'record' && (
        <EvidenceActions
          props={props}
          toolName={toolName}
          recordId={selected.id}
          record={selected}
          pinLabel={`${selected.id} · ${selected.documentType}`}
          reviewed={reviewed}
        >
          {selected.pagesAvailable && (
            <button
              className="sky-button-secondary"
              type="button"
              onClick={() => openRelatedTool(props, 'Document Viewer', selected.documentViewerId)}
            >
              Open Document Viewer
            </button>
          )}
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
