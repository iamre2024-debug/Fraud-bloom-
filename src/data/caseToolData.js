import { businessRecordsByCase } from './businessRecords.js';
import { evidenceRecordsByCase } from './evidenceRecords.js';
import { financialRecordsByCase } from './financialRecords.js';
import { normalizePaymentRecords } from './paymentVerification.js';

function fallbackBusiness(activeCase) {
  const entity = activeCase.profile?.business ?? activeCase.businessProfile?.legalName ?? '';
  return {
    business360: entity ? [{
      id: `BIZ-${String(entity).replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 10) || 'TRAINING'}`,
      entity,
      relationship: 'Institution business relationship',
      status: 'Record available',
      observed: activeCase.opened ?? 'Training date',
      context: 'Business relationship recorded in the active case packet.',
    }] : [],
    employeeProfile: [],
    companyPayrollProfile: null,
    payrollRuns: [],
  };
}

function fallbackEvidence(activeCase) {
  const documents = activeCase.documentRequests ?? (activeCase.documents ?? []).map((item) => ({
    id: item.id,
    title: item.title ?? item.name,
    category: 'Case document',
    status: item.status ?? 'Available',
    updated: activeCase.reportedDate ?? activeCase.opened ?? 'Training date',
    preview: item.detail ?? 'Training case document available for review.',
    fields: 'Case ID, training packet status',
  }));
  return {
    evidence: documents.map((document) => ({
      id: `${document.id}-EVD`,
      status: document.status,
      type: document.category ?? 'Case document',
      name: document.title ?? document.name,
      source: 'Generated training packet',
      received: document.status === 'Requested' ? 'Pending' : document.updated ?? activeCase.reportedDate ?? activeCase.opened ?? 'Training date',
      summary: document.preview ?? document.detail ?? 'Training case document available for review.',
      linkedObject: activeCase.id,
    })),
    documents,
  };
}

function generatedResults(activeCase) {
  return activeCase.toolResults ?? {};
}

export function getFinancialRecords(activeCase = {}) {
  const staticRecords = financialRecordsByCase[activeCase.id];
  if (staticRecords) {
    return {
      ...staticRecords,
      paymentVerification: normalizePaymentRecords(staticRecords.paymentVerification, activeCase),
    };
  }
  const generated = generatedResults(activeCase);
  return {
    transactions: generated.transactions?.length ? generated.transactions : [],
    financialIntel: generated.financialIntel?.length ? generated.financialIntel : [],
    paymentVerification: normalizePaymentRecords(
      generated.paymentVerification?.length ? generated.paymentVerification : [],
      activeCase,
    ),
  };
}

export function getBusinessRecords(activeCase = {}) {
  const staticRecords = businessRecordsByCase[activeCase.id];
  if (staticRecords) return staticRecords;
  const generated = generatedResults(activeCase);
  const fallback = fallbackBusiness(activeCase);
  return {
    business360: generated.business360?.length ? generated.business360 : fallback.business360,
    employeeProfile: generated.employeeProfile?.length ? generated.employeeProfile : fallback.employeeProfile,
    companyPayrollProfile: generated.companyPayrollProfile ?? fallback.companyPayrollProfile,
    payrollRuns: generated.payrollRuns?.length ? generated.payrollRuns : fallback.payrollRuns,
  };
}

export function getEvidenceRecords(activeCase = {}) {
  const staticRecords = evidenceRecordsByCase[activeCase.id];
  if (staticRecords) return staticRecords;
  const generated = generatedResults(activeCase);
  const fallback = fallbackEvidence(activeCase);
  return {
    evidence: generated.evidence?.length ? generated.evidence : fallback.evidence,
    documents: generated.documents?.length ? generated.documents : fallback.documents,
  };
}
