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
          <img src="/assets/luna-sky-vector-v1.svg" alt="" />
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
     