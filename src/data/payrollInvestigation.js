import { WORKFLOW_TYPES } from './caseDomain.js';

export const UNKNOWN_REQUEST_METHOD = 'Unknown at intake';

export const defaultPayrollInvestigationState = Object.freeze({
  trustedContactStarted: false,
  requestMethod: 'Not yet recorded',
  businessStatement: '',
  emailEvidenceProvided: false,
  businessResponseSaved: false,
});

export function normalizePayrollInvestigationState(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const requestMethod = ['Not yet recorded', 'Phone', 'Payroll portal', 'Email', 'Other business channel']
    .includes(source.requestMethod)
    ? source.requestMethod
    : defaultPayrollInvestigationState.requestMethod;
  return {
    trustedContactStarted: Boolean(source.trustedContactStarted),
    requestMethod,
    businessStatement: String(source.businessStatement ?? ''),
    emailEvidenceProvided: requestMethod === 'Email' && Boolean(source.emailEvidenceProvided),
    businessResponseSaved: requestMethod !== 'Not yet recorded' && Boolean(source.businessResponseSaved),
  };
}

export function payrollIntakeDisclosure(activeCase = {}) {
  const workflowType = activeCase.workflowType;
  if (workflowType !== WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT) {
    return {
      requestMethod: 'Not established',
      businessContactCompleted: false,
      emailEvidenceAvailable: false,
      emailEvidence: null,
    };
  }
  return {
    requestMethod: UNKNOWN_REQUEST_METHOD,
    businessContactCompleted: false,
    emailEvidenceAvailable: false,
    emailEvidence: null,
  };
}

export function recordTrustedBusinessResponse({
  requestMethod = 'Not established',
  businessContactMethod = 'Previously known business contact',
  businessStatement = '',
  emailEvidence,
} = {}) {
  const normalizedMethod = String(requestMethod).trim().toLowerCase();
  const emailReported = normalizedMethod === 'email';
  const suppliedEmailEvidence = emailReported && emailEvidence && typeof emailEvidence === 'object'
    ? {
        source: 'Business-supplied evidence after trusted contact',
        headerFrom: emailEvidence.headerFrom ?? 'Not supplied',
        headerReplyTo: emailEvidence.headerReplyTo ?? 'Not supplied',
        received: emailEvidence.received ?? 'Not supplied',
        mailboxNote: emailEvidence.mailboxNote ?? 'Not supplied',
      }
    : null;
  return {
    requestMethod,
    businessContactCompleted: true,
    businessContactMethod,
    businessStatement,
    employeeCallbackInstruction: emailReported
      ? 'Instruct the business to call the employee using a trusted, previously known phone number.'
      : '',
    emailEvidenceAvailable: Boolean(suppliedEmailEvidence),
    emailEvidence: suppliedEmailEvidence,
  };
}

export function visiblePayrollEmailEvidence(response = {}) {
  const source = response && typeof response === 'object' && !Array.isArray(response) ? response : {};
  return source.businessContactCompleted && source.requestMethod?.toLowerCase() === 'email' && source.emailEvidenceAvailable
    ? source.emailEvidence
    : null;
}
