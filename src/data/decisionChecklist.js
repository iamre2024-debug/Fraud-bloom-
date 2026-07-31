import { caseDomainLabels, isWorkflowEnabled } from './caseDomain.js';

const flagWeightPoints = {
  Critical: 8,
  High: 5,
  Medium: 3,
  Low: 1,
};

const flagColorMeanings = {
  red: 'Risk, exception, mismatch, or unresolved adverse evidence',
  green: 'Verified, consistent, established, or legitimate evidence',
};

export const indicatorAnswerChoices = Object.freeze([
  'Yes',
  'No',
  'Not enough evidence',
]);

const indicatorAnswerChoiceSet = new Set(indicatorAnswerChoices);

function flag(id, type, weight, prompt, evidenceHint, options = {}) {
  return { id, type, weight, prompt, evidenceHint, ...options };
}

function checklist(title, description, flags) {
  return { title, description, flags };
}

const accountTakeoverChecklist = checklist(
  'Account Takeover review checklist',
  'Compare access, authentication, profile-control, and transaction evidence without assuming compromise from the alert alone.',
  [
    flag('ato-new-access', 'red', 'High', 'Was a first-seen device, unusual IP, or unfamiliar session present during the activity window?', 'Cite the device, IP, session, location, and first-seen timestamps.'),
    flag('ato-control-change', 'red', 'Critical', 'Did a password, contact, MFA route, administrator, payee, or other control change occur without trusted verification?', 'Cite the exact change event, actor, session, verification record, and related activity.', { requiresAttention: true }),
    flag('ato-authentication-mismatch', 'red', 'High', 'Do authentication, initiator, approver, or customer statements conflict with the recorded activity?', 'Cite each source and the exact mismatch that remains unresolved.'),
    flag('ato-established-access', 'green', 'High', 'Was the access performed through a verified device, familiar location, and established session pattern?', 'Cite the device history, IP history, session, and trusted-user confirmation.'),
    flag('ato-controls-consistent', 'green', 'High', 'Were profile controls, MFA routes, administrators, and approval roles unchanged and independently verified?', 'Cite the profile history, control records, and trusted verification source.'),
    flag('ato-legitimate-activity', 'green', 'Medium', 'Do the customer or business statement and independent records consistently establish legitimate activity?', 'Cite the statement, transaction, session, and any trusted callback that agree.'),
  ],
);

const unauthorizedCardChecklist = checklist(
  'Unauthorized Card Transaction Claim checklist',
  'Compare the reported allegation with card, authorization, device, merchant, and customer evidence. Unauthorized activity is alleged, not established, at intake.',
  [
    flag('card-unrecognized-credential', 'red', 'High', 'Was a new, unrecognized, or mismatched card credential, wallet token, device, or entry mode used?', 'Cite the credential or token, entry mode, device, first-use time, and customer statement.'),
    flag('card-authentication-exception', 'red', 'High', 'Is there an unresolved authentication, authorization, location, or card-possession exception?', 'Cite the authorization, 3DS or MFA result, location, possession statement, and unresolved mismatch.'),
    flag('card-merchant-conflict', 'red', 'Medium', 'Do merchant, fulfillment, or usage records materially conflict with the known customer history?', 'Cite the merchant record, delivery or usage record, and exact conflicting customer field.'),
    flag('card-established-credential', 'green', 'High', 'Was the card credential or wallet token established, verified, and previously used consistently?', 'Cite token enrollment, prior use, trusted device history, and matching ownership evidence.'),
    flag('card-consistent-authorization', 'green', 'High', 'Do authorization, device, location, and customer records consistently establish legitimate use?', 'Cite the matching authorization, device, IP, location, and customer evidence.'),
    flag('card-independent-support', 'green', 'Medium', 'Do independent merchant or account records consistently support the established transaction history?', 'Cite fulfillment, usage, receipt, prior merchant, or account records that agree.'),
  ],
);

const merchantDisputeChecklist = checklist(
  'Merchant / Non-Fraud Dispute checklist',
  'Apply the reported billing issue to cancellation, delivery, refund, policy, and merchant records without converting a service dispute into a fraud finding.',
  [
    flag('merchant-unresolved-mismatch', 'red', 'High', 'Is there an unresolved mismatch in the billed amount, transaction count, cancellation date, delivery, or refund status?', 'Cite the affected transaction, expected result, merchant record, and unresolved difference.'),
    flag('merchant-missing-evidence', 'red', 'Medium', 'Is material customer or merchant evidence missing, incomplete, or internally inconsistent?', 'Cite the required record and explain the verification gap without treating missing paperwork as fraud.'),
    flag('merchant-policy-exception', 'red', 'Medium', 'Does the timing or documented service history create an unresolved policy or fulfillment exception?', 'Cite the policy, billing date, contact date, and service or delivery record.'),
    flag('merchant-verified-cancellation', 'green', 'High', 'Is cancellation, return, or refund timing verified by consistent records?', 'Cite the confirmation, return tracking, refund ledger, dates, and related transaction.'),
    flag('merchant-verified-billing', 'green', 'High', 'Do transaction records establish a duplicate, incorrect amount, or unprocessed refund?', 'Cite both transactions, the agreed amount, or the verified refund record.'),
    flag('merchant-legitimate-fulfillment', 'green', 'Medium', 'Do policy, delivery, usage, and merchant records consistently establish legitimate fulfillment?', 'Cite the receipt, policy, delivery, usage, and matching customer fields.'),
  ],
);

const paymentChecklist = checklist(
  'ACH or Wire review checklist',
  'Compare authorization, ownership, beneficiary, destination, approval, timing, and recovery evidence for the applicable payment rail.',
  [
    flag('payment-new-destination', 'red', 'Critical', 'Was a new or changed originator, beneficiary, or destination used without trusted verification?', 'Cite the payment ID, destination, ownership result, approval, and verification status.', { requiresAttention: true }),
    flag('payment-authorization-gap', 'red', 'High', 'Is authorization, account ownership, callback, or approval evidence missing or inconsistent?', 'Cite the required control and the missing or contradictory record.'),
    flag('payment-unusual-pattern', 'red', 'High', 'Is the amount, timing, return activity, initiator, approver, or prior-use pattern materially unusual?', 'Cite the current payment and the established history used for comparison.'),
    flag('payment-trusted-verification', 'green', 'High', 'Was the payment or instruction verified through trusted contact and approval controls?', 'Cite the system-of-record contact, verifier, approver, time, and result.'),
    flag('payment-known-destination', 'green', 'High', 'Does the originator, beneficiary, or destination match established ownership and prior-use history?', 'Cite ownership records, prior payments, templates, and matching names.'),
    flag('payment-consistent-record', 'green', 'Medium', 'Are the payment record, return history, timing, and approval trail complete and consistent?', 'Cite the payment, return, approval, and recovery records that agree.'),
  ],
);

const payrollChangeChecklist = checklist(
  'Payroll Change Alert checklist',
  'Review the observed payroll change first, then document ownership, prior use, administrator activity, trusted contact, and any request method later supplied by the business.',
  [
    flag('payroll-change-unverified', 'red', 'Critical', 'Is a new employee or changed destination still unverified through trusted business and employee records?', 'Cite the employee, Destination ID, ownership result, prior use, and trusted-contact status.', { requiresAttention: true }),
    flag('payroll-admin-exception', 'red', 'High', 'Is there unusual administrator, initiator, approver, timing, or amount activity associated with the change?', 'Cite the actor, role, session, change time, amount, and established payroll pattern.'),
    flag('payroll-request-method-unresolved', 'red', 'Medium', 'Does the business-reported request method remain unknown, unsupported, or inconsistent after trusted contact?', 'Cite the trusted business contact record and what the business reported; do not infer email compromise.'),
    flag('payroll-trusted-confirmation', 'green', 'High', 'Did the business and affected employee confirm the change through trusted, previously known contact methods?', 'Cite each trusted contact source, participant, time, and result.'),
    flag('payroll-owned-destination', 'green', 'High', 'Does the destination match verified employee ownership and established payroll use?', 'Cite account ownership, prior deposits, employee profile, and destination history.'),
    flag('payroll-consistent-change', 'green', 'Medium', 'Are the request, administrator activity, approval, timing, and payroll history complete and consistent?', 'Cite the change record, initiator, approver, effective date, and prior payroll pattern.'),
  ],
);

const payrollAtoChecklist = checklist(
  'Payroll Account Takeover checklist',
  'Evaluate payroll access and control activity separately from a normal employee destination-change alert.',
  [
    flag('payroll-ato-new-access', 'red', 'High', 'Was payroll accessed from a new device, IP, location, or session during the activity window?', 'Cite the device, IP, session, actor, first-seen date, and normal-access comparison.'),
    flag('payroll-ato-multiple-changes', 'red', 'Critical', 'Were multiple employees, destinations, administrators, or profile controls changed in an unusual sequence?', 'Cite each change, actor, session, timing, and affected payroll record.', { requiresAttention: true }),
    flag('payroll-ato-control-conflict', 'red', 'High', 'Did one person initiate and approve activity when that conflicts with established controls?', 'Cite initiator, approver, role history, approval policy, and the exception.'),
    flag('payroll-ato-established-access', 'green', 'High', 'Do device, IP, session, and administrator history consistently establish trusted access?', 'Cite established devices, locations, administrator records, and prior sessions.'),
    flag('payroll-ato-separated-controls', 'green', 'High', 'Were initiator and approver roles independently verified and consistent with normal controls?', 'Cite both actors, roles, approval records, and prior payroll practice.'),
    flag('payroll-ato-legitimate-run', 'green', 'Medium', 'Do payroll amount, employee roster, destinations, funds status, and timing match established history?', 'Cite the payroll run and the historical comparison records.'),
  ],
);

const personalApplicationChecklist = checklist(
  'Personal Credit Application Review checklist',
  'Review origination, identity, eligibility, application information, and repayment evidence using fictional policy. Missing paperwork means verification is incomplete, not fraud.',
  [
    flag('application-identity-mismatch', 'red', 'High', 'Do identity, address, phone, email, device, or application records materially conflict?', 'Cite the application and each independent source containing the mismatch.'),
    flag('application-unverifiable-information', 'red', 'High', 'Is material application information unverifiable or inconsistent after available checks?', 'Cite the field, attempted sources, and unresolved result.'),
    flag('application-paperwork-gap', 'red', 'Medium', 'Is required paperwork still missing or incomplete?', 'Cite the requested document and status. Record Verification Incomplete when appropriate; missing paperwork alone is not fraud.'),
    flag('application-verified-identity', 'green', 'High', 'Are identity and contact fields verified consistently across independent sources?', 'Cite the identity, address, phone, email, and document matches.'),
    flag('application-supported-information', 'green', 'High', 'Are application, income, credit, and repayment fields supported by appropriate fictional records?', 'Cite the application fields and supporting credit, income, or payment records.'),
    flag('application-legitimate-link-history', 'green', 'Medium', 'Do link and prior-use records establish a consistent legitimate identity history?', 'Cite the searched identifiers, matched accounts, dates, and verified relationship.'),
  ],
);

const businessApplicationChecklist = checklist(
  'Business Credit Application Review checklist',
  'Review the entity and every relevant submitter, beneficial owner, control person, guarantor, and administrator. Missing paperwork means incomplete verification, not fraud.',
  [
    flag('business-entity-mismatch', 'red', 'High', 'Do registration, identifying information, address, web presence, or bank ownership records materially conflict?', 'Cite the entity filing and each independent record containing the mismatch.'),
    flag('business-party-mismatch', 'red', 'High', 'Does a submitter, beneficial owner, control person, guarantor, or administrator fail identity or role verification?', 'Cite the person, stated role, identity record, entity record, and exact mismatch.'),
    flag('business-application-paperwork-gap', 'red', 'Medium', 'Is entity or party paperwork still missing or incomplete?', 'Cite the requested document and status. Record Verification Incomplete when appropriate; missing paperwork alone is not fraud.'),
    flag('business-verified-entity', 'green', 'High', 'Are registration, identifying information, address, web presence, and bank ownership independently verified?', 'Cite the registration, KYB, address, web, and bank records.'),
    flag('business-verified-parties', 'green', 'High', 'Are all relevant owners, control persons, guarantors, submitters, and administrators verified in their distinct roles?', 'Cite each person, role, identity record, and entity relationship.'),
    flag('business-supported-credit', 'green', 'Medium', 'Do credit and repayment records appropriately support the fictional product review?', 'Cite the applicable credit, revenue, cash-flow, repayment, and application records without applying real-company policy.'),
  ],
);

const creditRiskChecklist = checklist(
  'Credit Risk Review checklist',
  'Review an existing exposure, repayment behavior, NSF activity, utilization, cash flow, debt stacking, and unusual post-approval activity separately from application origination.',
  [
    flag('credit-payment-risk', 'red', 'High', 'Do missed payments, NSF activity, returns, or repayment changes create an unresolved credit concern?', 'Cite the payment dates, return codes, balances, and established repayment schedule.'),
    flag('credit-exposure-risk', 'red', 'High', 'Did utilization, draws, debt stacking, or exposure increase unusually after approval?', 'Cite exposure, limits, draws, inquiries or obligations, timing, and prior baseline.'),
    flag('credit-cashflow-risk', 'red', 'High', 'Do cash-flow volatility, declining deposits, unusual transfers, or unexplained activity weaken repayment support?', 'Cite the reviewed period, deposits, outflows, transfers, balances, and unresolved explanation.'),
    flag('credit-stable-performance', 'green', 'High', 'Are payment history, utilization, and existing exposure stable and consistently supported?', 'Cite payment history, utilization, balances, and prior performance.'),
    flag('credit-supported-cashflow', 'green', 'High', 'Do operating or personal cash-flow records consistently support repayment capacity?', 'Cite deposits, income or revenue, outflows, obligations, and the reviewed period.'),
    flag('credit-legitimate-explanation', 'green', 'Medium', 'Is unusual post-approval activity supported by verified, legitimate records?', 'Cite the explanation and independent contracts, invoices, payroll, bank, or account records that confirm it.'),
  ],
);

const checklistByWorkflow = {
  'unauthorized-card-transaction-claim': unauthorizedCardChecklist,
  'merchant-non-fraud-dispute': merchantDisputeChecklist,
  'card-account-takeover': accountTakeoverChecklist,
  'personal-account-takeover': accountTakeoverChecklist,
  'business-account-takeover': checklist(
    'Business Account Takeover checklist',
    accountTakeoverChecklist.description,
    accountTakeoverChecklist.flags,
  ),
  'ach-transaction-claim': paymentChecklist,
  'wire-transaction-claim': paymentChecklist,
  'business-payment-instruction-change-alert': checklist(
    'Business Payment or Instruction-Change Alert checklist',
    paymentChecklist.description,
    paymentChecklist.flags,
  ),
  'ach-transaction-review': paymentChecklist,
  'wire-transaction-review': paymentChecklist,
  'payroll-change-alert': payrollChangeChecklist,
  'payroll-account-takeover': payrollAtoChecklist,
  'credit-application-review': personalApplicationChecklist,
  'credit-risk-review': creditRiskChecklist,
};

const legacyDomainByClaimTypeId = {
  'account-takeover': { customerType: 'personal', productType: 'deposit-account', workflowType: 'personal-account-takeover' },
  'fraud-chargeback': { customerType: 'personal', productType: 'credit-card', workflowType: 'unauthorized-card-transaction-claim' },
  'non-fraud-chargeback': { customerType: 'personal', productType: 'credit-card', workflowType: 'merchant-non-fraud-dispute' },
  'first-party-fraud': { customerType: 'personal', productType: 'credit-card', workflowType: 'unauthorized-card-transaction-claim' },
  'payroll-direct-deposit': { customerType: 'business', productType: 'payroll-product', workflowType: 'payroll-change-alert' },
  'email-bec': { customerType: 'business', productType: 'business-account', workflowType: 'business-payment-instruction-change-alert' },
  'credit-risk': { customerType: 'personal', productType: 'credit-card', workflowType: 'credit-risk-review' },
  'business-loan-bust-out': { customerType: 'business', productType: 'business-loan', workflowType: 'credit-risk-review' },
  'application-verification': { customerType: 'personal', productType: 'credit-card', workflowType: 'credit-application-review' },
  'ach-wire-check': { customerType: 'business', productType: 'business-account', workflowType: 'wire-transaction-review' },
};

const defaultChecklist = checklist(
  'Case decision checklist',
  'Document risk or unresolved exceptions separately from verified or legitimate evidence. Checklist points support coaching and never determine fraud.',
  [
    flag('case-material-risk', 'red', 'High', 'Is there a material mismatch, exception, or unresolved adverse record?', 'Cite the exact source, field, amount, or timestamp and explain what remains unresolved.'),
    flag('case-independent-verification', 'green', 'High', 'Does an independent record verify a consistent or legitimate fact?', 'Cite the independent source and explain how it connects to the activity in scope.'),
  ],
);

export function resolveDecisionDomain(activeCase = {}) {
  const legacy = legacyDomainByClaimTypeId[activeCase.claimTypeId] ?? {};
  return {
    customerType: activeCase.customerType ?? legacy.customerType ?? 'personal',
    productType: activeCase.productType ?? legacy.productType ?? 'deposit-account',
    workflowType: activeCase.workflowType ?? legacy.workflowType ?? '',
  };
}

function resolveChecklistDefinition(activeCase = {}) {
  const domain = resolveDecisionDomain(activeCase);
  const workflowEnabled = isWorkflowEnabled(domain.customerType, domain.productType, domain.workflowType);
  const base = !workflowEnabled
    ? defaultChecklist
    : domain.workflowType === 'credit-application-review' && domain.customerType === 'business'
      ? businessApplicationChecklist
      : checklistByWorkflow[domain.workflowType] ?? defaultChecklist;
  return { base, domain };
}

function publicChecklistFlag(item = {}) {
  return {
    id: item.id,
    prompt: item.prompt,
    evidenceHint: item.evidenceHint,
    answerChoices: [...indicatorAnswerChoices],
  };
}

function alternateChecklistPerspectives(flags = []) {
  const concernPrompts = flags.filter((item) => item.type === 'red');
  const legitimatePrompts = flags.filter((item) => item.type === 'green');
  const remainingPrompts = flags.filter((item) => item.type !== 'red' && item.type !== 'green');
  const balanced = [];
  const count = Math.max(concernPrompts.length, legitimatePrompts.length);
  for (let index = 0; index < count; index += 1) {
    if (concernPrompts[index]) balanced.push(concernPrompts[index]);
    if (legitimatePrompts[index]) balanced.push(legitimatePrompts[index]);
  }
  return [...balanced, ...remainingPrompts];
}

export function getDecisionChecklist(activeCase = {}) {
  const { base, domain } = resolveChecklistDefinition(activeCase);
  const labels = caseDomainLabels(domain);

  return {
    title: base.title,
    description: base.description,
    flags: alternateChecklistPerspectives(base.flags).map(publicChecklistFlag),
    customerType: domain.customerType,
    productType: domain.productType,
    workflowType: domain.workflowType,
    scopeLabel: [
      labels.customerTypeLabel || 'Customer type not supplied',
      labels.productTypeLabel || 'Product not supplied',
      labels.workflowTypeLabel || 'Workflow not supplied',
    ].join(' · '),
    responsePurpose: 'Record a learner assessment for each prompt. Expected classifications and coaching weights remain unavailable until after submission.',
  };
}

export function normalizeIndicatorAnswer(answer = {}) {
  const source = typeof answer === 'string'
    ? { answer }
    : answer && typeof answer === 'object' && !Array.isArray(answer)
      ? answer
      : {};
  const supplied = String(
    source.answer
    ?? source.response
    ?? source.value
    ?? (source.selected === true ? 'Yes' : ''),
  ).trim();
  const normalized = indicatorAnswerChoices.find(
    (choice) => choice.toLowerCase() === supplied.toLowerCase(),
  ) ?? '';

  return {
    answer: indicatorAnswerChoiceSet.has(normalized) ? normalized : '',
    proof: String(source.proof ?? '').trim(),
    explanation: String(source.explanation ?? '').trim(),
  };
}

export function summarizeDecisionIndicators(activeCase = {}, indicatorAnswers = {}) {
  const { base } = resolveChecklistDefinition(activeCase);
  const checklistResult = getDecisionChecklist(activeCase);
  const answeredIndicators = base.flags
    .map((item) => {
      const normalized = normalizeIndicatorAnswer(indicatorAnswers[item.id]);
      if (!normalized.answer) return null;
      return {
        ...publicChecklistFlag(item),
        answer: normalized.answer,
        proof: normalized.proof,
        explanation: normalized.explanation,
      };
    })
    .filter(Boolean);
  const answeredIds = new Set(answeredIndicators.map((item) => item.id));
  const unansweredIndicators = checklistResult.flags.filter((item) => !answeredIds.has(item.id));
  const incompleteIndicators = answeredIndicators.filter((item) => (
    !item.explanation
    || (item.answer !== 'Not enough evidence' && !item.proof)
  ));
  const answerCounts = Object.fromEntries(indicatorAnswerChoices.map((choice) => [
    choice,
    answeredIndicators.filter((item) => item.answer === choice).length,
  ]));

  return {
    checklist: checklistResult,
    answeredIndicators,
    unansweredIndicators,
    incompleteIndicators,
    answerCounts,
    answeredCount: answeredIndicators.length,
    unansweredCount: unansweredIndicators.length,
    selectedCount: answeredIndicators.length,
    advisoryOnly: true,
  };
}
