import { evidenceRecordsByCase } from './evidenceRecords.js';

const EMPTY_LIST = Object.freeze([]);
const unavailableStatuses = /^(?:requested|missing|expired|rejected|not requested|not received|pending)$/i;

function asArray(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function clean(value) {
  return String(value ?? '').trim();
}

function caseContext(activeCase = {}) {
  return {
    person: clean(activeCase.person) || 'Training Customer',
    caseId: clean(activeCase.id) || 'FA-TRAIN-00000',
    accountId: clean(activeCase.accountId) || 'ACCT-TRAIN-0000',
    claimType: clean(activeCase.claimType ?? activeCase.type) || 'Training Review',
    opened: clean(activeCase.reportedDate ?? activeCase.opened) || 'Training date not supplied',
  };
}

function page(title, subtitle, sections, options = {}) {
  return { title, subtitle, sections, ...options };
}

function section(title, rows = [], options = {}) {
  return { title, rows, ...options };
}

function mergeDefined(base = {}, addition = {}) {
  const next = { ...base };
  Object.entries(addition ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (
      Array.isArray(value)
      && value.length === 0
      && Array.isArray(next[key])
      && next[key].length
    ) return;
    next[key] = value;
  });
  return next;
}

function isDocumentLike(item = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (item.documentId || asArray(item.pages).length) return true;
  return /document|statement|receipt|invoice|form|report|packet/i.test(
    [
      item.type,
      item.category,
      item.folder,
      item.classification,
    ].filter(Boolean).join(' '),
  );
}

function explicitDocumentSources(activeCase = {}) {
  const caseId = clean(activeCase.id);
  const toolResults = activeCase.toolResults ?? {};
  const sourceGroups = [
    evidenceRecordsByCase[caseId]?.documents,
    toolResults.evidenceDocuments,
    asArray(toolResults.evidence).filter(isDocumentLike),
    toolResults.documents,
    toolResults.documentViewer?.documents,
    toolResults.documentRequest?.documents,
    activeCase.documentRequests,
    activeCase.evidenceDocuments,
    activeCase.documents,
  ];
  const recordsById = new Map();

  sourceGroups.forEach((items) => {
    asArray(items).forEach((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const id = clean(item.id ?? item.documentId);
      if (!id) return;
      recordsById.set(id, mergeDefined(recordsById.get(id), { ...item, id }));
    });
  });

  return [...recordsById.values()];
}

function suppliedFieldRows(item = {}) {
  if (Array.isArray(item.fields)) {
    return item.fields.filter((field) => Array.isArray(field) && field.length > 1);
  }
  if (item.fields && typeof item.fields === 'object') {
    return Object.entries(item.fields);
  }
  if (clean(item.fields)) return [['Field inventory', clean(item.fields)]];
  return EMPTY_LIST;
}

function sourcePageAvailable(item = {}) {
  if (asArray(item.pages).length) return true;
  const status = clean(item.status ?? item.requestStatus);
  return Boolean(status) && !unavailableStatuses.test(status);
}

function suppliedPages(item, context, fieldRows, summary) {
  if (Array.isArray(item.pages)) return item.pages;
  if (!sourcePageAvailable(item)) return [];

  const provenanceRows = [
    ['Document ID', item.id],
    ['Status', clean(item.status) || 'Not supplied'],
    ['Source', clean(item.source) || 'Case-supplied document inventory'],
    ['Updated', clean(item.updated ?? item.received) || 'Not supplied'],
  ];
  return [
    page(
      clean(item.title ?? item.name) || item.id,
      clean(item.subtitle ?? item.classification) || 'CASE-SUPPLIED DOCUMENT RECORD',
      [
        section('Document record', provenanceRows),
        section('Supplied details', fieldRows, summary ? { paragraphs: [summary] } : {}),
      ],
      { kind: clean(item.kind) || 'case' },
    ),
  ];
}

function normalizeDocument(activeCase, item) {
  const context = caseContext(activeCase);
  const status = clean(item.status) || 'Not supplied';
  const hasPage = sourcePageAvailable(item);
  const title = clean(item.title ?? item.name) || item.id;
  const type = clean(item.type ?? item.category) || 'Case document';
  const folder = clean(item.folder ?? item.category) || 'Case Documents';
  const summary = clean(item.summary ?? item.preview ?? item.detail);
  const fieldRows = suppliedFieldRows(item);
  const received = hasPage
    ? clean(item.received ?? item.updated) || context.opened
    : clean(item.received) || 'Not received';

  return {
    customer: context.person,
    caseId: context.caseId,
    accountId: context.accountId,
    claimType: context.claimType,
    ...item,
    id: item.id,
    title,
    type,
    folder,
    reference: clean(item.reference) || item.id,
    status,
    reviewStatus: clean(item.reviewStatus) || (hasPage ? 'Pending Review' : status),
    requestStatus: clean(item.requestStatus) || status,
    source: clean(item.source) || 'Case-supplied document inventory',
    received,
    updated: clean(item.updated) || received,
    extractionConfidence: clean(item.extractionConfidence) || 'Not supplied',
    authenticity: clean(item.authenticity)
      || (hasPage
        ? 'A case-supplied document record is available for investigator review.'
        : 'No source page is attached to this case-supplied document record.'),
    summary: summary || 'No document summary was supplied in the active case record.',
    investigatorNote: clean(item.investigatorNote)
      || 'Review only the fields and pages supplied by the active case record.',
    trainingTip: clean(item.trainingTip)
      || 'Treat this source as one evidence record and compare it with the related case data.',
    relatedTools: asArray(item.relatedTools).length
      ? item.relatedTools
      : ['Document Request', 'Timeline'],
    relatedEvidence: asArray(item.relatedEvidence).length
      ? item.relatedEvidence
      : [context.caseId],
    requestEligible: item.requestEligible !== false,
    fields: fieldRows,
    pages: suppliedPages(item, context, fieldRows, summary),
  };
}

export function getCaseDocuments(activeCase = {}) {
  return explicitDocumentSources(activeCase).map((item) => normalizeDocument(activeCase, item));
}

export function getCaseDocumentRequests(activeCase = {}) {
  return getCaseDocuments(activeCase).filter((document) => document.requestEligible !== false);
}

export function documentSearchText(document = {}) {
  return [
    document.id,
    document.title,
    document.type,
    document.folder,
    document.reference,
    document.status,
    document.reviewStatus,
    document.source,
    document.customer,
    document.caseId,
    document.accountId,
    document.claimType,
    document.requestStatus,
    document.summary,
    document.authenticity,
    ...asArray(document.fields).flat(),
    ...asArray(document.relatedEvidence),
  ].filter(Boolean).join(' ').toLowerCase();
}
