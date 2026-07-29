import { getBusinessResearch } from './businessResearchRecords.js';

const storageKey = 'fraud-academy-business-360-reports-v1';
const legacyStorageKey = 'fraud-academy-generated-kyb-reports-v1';

function page(title, subtitle, sections) {
  return { title, subtitle, kind: 'case', sections };
}

function section(title, rows = [], options = {}) {
  return { title, rows, ...options };
}

function generatedAt() {
  return new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

export function buildBusiness360Report(activeCase = {}) {
  const workspace = getBusinessResearch(activeCase);
  const { profile } = workspace;
  const generated = generatedAt();
  return {
    id: `${profile.businessId}-RPT-B360`,
    title: 'Business 360 Research Report',
    type: 'Business profile and source research report',
    folder: 'System Reports',
    reference: `RPT-B360-${profile.businessId}`,
    status: 'Generated',
    reviewStatus: 'Ready for Review',
    extractionConfidence: 'System generated',
    source: 'Fraud Academy Business 360',
    received: generated,
    updated: generated,
    customer: profile.legalName,
    caseId: activeCase.id ?? 'FA-TRAIN-00000',
    accountId: activeCase.accountId ?? 'ACCT-TRAIN-0000',
    claimType: activeCase.claimType ?? activeCase.type ?? 'Training review',
    requestStatus: 'Generated',
    authenticity: 'System-generated from fictional training sources. No live government, licensing, domain, directory, or internet search occurred.',
    summary: `Reusable business identity, ownership, operating-footprint, institution-relationship, and Luna research records for ${profile.legalName}.`,
    investigatorNote: 'Compare the dated fictional sources with Identity Intel, Payment Verification, Financial Investigation, Payroll History, and source documents when those tools are relevant.',
    trainingTip: 'This report organizes factual business records. It does not assign an investigation outcome.',
    relatedTools: ['Business 360', 'Identity Intel / People Search', 'Payment Verification', 'Financial Investigation', 'Payroll History'],
    relatedEvidence: [
      profile.businessId,
      profile.registrationId,
      profile.ein,
      ...profile.ownership.beneficialOwners.map((owner) => owner.id),
      ...profile.sourceRecords.map((record) => record.id),
    ],
    fields: [
      ['Generated', generated],
      ['Training label', 'Fictional data · not valid for real-world use'],
      ['Legal business name', profile.legalName],
      ['DBA', profile.dba],
      ['Masked EIN', profile.ein],
      ['Registration / file number', profile.registrationId],
      ['Formation state', profile.formationState],
      ['Registration standing', profile.standing],
      ['Physical address', profile.footprint.physicalAddress],
      ['Business phone', profile.footprint.phone],
      ['Website', profile.footprint.website],
      ['Beneficial-owner records', String(profile.ownership.beneficialOwners.length)],
    ],
    pages: [
      page('Business 360 Research Report', 'ENTITY AND REGISTRATION · FICTIONAL TRAINING SOURCES', [
        section('Business identity', [
          ['Legal name', profile.legalName],
          ['DBA', profile.dba],
          ['Entity type', profile.entityType],
          ['Industry', profile.industry],
          ['NAICS', profile.naics],
          ['Masked EIN', profile.ein],
        ]),
        section('Registration record', [
          ['Registration / file number', profile.registrationId],
          ['Formation state', profile.formationState],
          ['Formation date', profile.formationDate],
          ['Standing', profile.standing],
        ]),
        section('Operating footprint', [
          ['Physical address', profile.footprint.physicalAddress],
          ['Mailing address', profile.footprint.mailingAddress],
          ['Registered agent', profile.footprint.registeredAgent],
          ['Phone', profile.footprint.phone],
          ['Email', profile.footprint.email],
          ['Website', profile.footprint.website],
          ['Business age', profile.footprint.businessAge],
          ['Estimated employees', String(profile.footprint.estimatedEmployeeCount)],
        ]),
      ]),
      page('Ownership and Institution Relationship', 'OWNERS, OFFICERS, ACCOUNTS, AND PRODUCTS · FICTIONAL TRAINING SOURCES', [
        section('Beneficial owners', [], {
          table: {
            columns: ['Record', 'Name', 'Role', 'Ownership', 'Owner verification', 'Identity reference'],
            rows: profile.ownership.beneficialOwners.map((owner) => [
              owner.id,
              owner.name,
              owner.role,
              `${owner.ownershipPercentage}%`,
              owner.verificationStatus,
              owner.identityReference,
            ]),
          },
        }),
        section('Officers', [], {
          table: {
            columns: ['Record', 'Name', 'Title', 'First recorded'],
            rows: profile.ownership.officers.map((officer) => [officer.id, officer.name, officer.title, officer.firstRecorded]),
          },
        }),
        section('Institution relationship', [], {
          table: {
            columns: ['Account / product', 'Status', 'Limit', 'Balance', 'Restrictions', 'NSF / returns', 'Repayment source'],
            rows: profile.relationship.accounts.map((account) => [
              account.product,
              account.status,
              account.limit,
              account.balance,
              account.restrictions,
              account.nsfContext,
              account.repaymentSource,
            ]),
          },
        }),
      ]),
      page('Business Source Research', 'SIMULATED SOURCE RESEARCH · NO LIVE SEARCH OCCURRED', [
        section('Research results', [], {
          table: {
            columns: ['Topic', 'Status', 'Finding', 'Fictional source', 'Checked date'],
            rows: profile.research.map((item) => [item.topic, item.status, item.finding, item.source, item.checkedDate]),
          },
        }),
        section('Source inventory', [], {
          table: {
            columns: ['Record', 'Category', 'Value', 'Fictional source', 'Checked date'],
            rows: profile.sourceRecords.map((record) => [record.id, record.category, record.value, record.source, record.checkedDate]),
          },
        }),
        section('Research boundary', [
          ['Live search', 'Not performed'],
          ['No record located', 'A source result only; it is not proof that a business does not exist'],
          ['Investigation outcome', 'Not assigned in Business 360'],
        ]),
      ]),
    ],
  };
}

function readRegistryKey(key) {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

function readRegistry() {
  return [...new Set([...readRegistryKey(storageKey), ...readRegistryKey(legacyStorageKey)])];
}

export function hasGeneratedBusiness360Report(caseId) {
  return readRegistry().includes(caseId);
}

export function generateBusiness360Report(activeCase) {
  if (typeof window !== 'undefined') {
    const registry = [...new Set([...readRegistry(), activeCase.id])];
    window.localStorage.setItem(storageKey, JSON.stringify(registry));
  }
  return buildBusiness360Report(activeCase);
}

export function getGeneratedBusiness360ReportDocuments(activeCase) {
  return hasGeneratedBusiness360Report(activeCase.id) ? [buildBusiness360Report(activeCase)] : [];
}

export function business360ReportExportText(report) {
  const lines = [report.title, `Reference: ${report.reference}`, `Business: ${report.customer}`, '', report.summary];
  for (const [label, value] of report.fields) lines.push(`${label}: ${value}`);
  for (const reportPage of report.pages) {
    lines.push('', reportPage.title, reportPage.subtitle);
    for (const reportSection of reportPage.sections) {
      lines.push('', reportSection.title);
      for (const [label, value] of reportSection.rows ?? []) lines.push(`${label}: ${value}`);
      if (reportSection.table) {
        lines.push(reportSection.table.columns.join(' | '));
        for (const row of reportSection.table.rows) lines.push(row.join(' | '));
      }
    }
  }
  lines.push('', `Investigator note: ${report.investigatorNote}`, `Training tip: ${report.trainingTip}`);
  return lines.join('\n');
}
