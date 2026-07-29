import { WORKFLOW_TYPES } from './caseDomain.js';
import { UNKNOWN_REQUEST_METHOD } from './payrollInvestigation.js';

function clean(value, fallback = 'Not recorded in the current intake') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function documentInventory(documents = []) {
  const available = documents.filter((item) => !/requested|missing/i.test(item.status));
  const requested = documents.filter((item) => /requested|missing/i.test(item.status));
  return {
    available: available.map((item) => item.name ?? item.title).filter(Boolean),
    requested: requested.map((item) => item.name ?? item.title).filter(Boolean),
  };
}

function list(values = [], fallback = 'none listed') {
  return [...new Set(values.filter(Boolean))].join(', ') || fallback;
}

function quotedStatement(statement) {
  return `The intake statement says: "${clean(statement)}"`;
}

export function buildCaseIntakeAnswers({
  caseId,
  prompts = [],
  statement,
  person,
  entityRole,
  business,
  employer,
  city,
  channel,
  statedDevice,
  reportedDate,
  issueStartDate,
  subtype,
  transactionInfo,
  amount,
  documents = [],
  toolResults = {},
  loginHistory = [],
  profileChanges = [],
  customer = {},
  customerType,
  productType,
  workflowType,
}) {
  const transactions = toolResults.transactions ?? [];
  const transaction = transactions[0];
  const priorTransaction = transactions[1];
  const payment = toolResults.paymentVerification?.[0];
  const merchant = toolResults.merchantIntelligence?.profile;
  const authorization = toolResults.merchantIntelligence?.authorization;
  const merchantRecords = toolResults.merchantIntelligence?.records ?? [];
  const fulfillment = merchantRecords.find((item) => item.section === 'fulfillment');
  const merchantContact = merchantRecords.find((item) => item.section === 'disputes');
  const credit = toolResults.creditProfile;
  const employee = toolResults.employeeProfile?.[0];
  const businessRecord = toolResults.business360?.[0];
  const identityRecords = toolResults.identityReport ?? [];
  const inventory = documentInventory(documents);
  const currentLogin = loginHistory[0];
  const failedLogin = loginHistory.find((item) => Number(item.failedAttemptCount) > 0 || /failed|locked/i.test(item.result));
  const establishedLogin = loginHistory.find((item, index) => index > 0 && /successful/i.test(item.result)) ?? loginHistory[1];
  const profileChange = profileChanges[0];
  const contact = customer.contact ?? {};
  const role = clean(entityRole, 'case subject');
  const activity = clean(transactionInfo, `${subtype} activity for ${amount}`);
  const subject = `${clean(person, 'The case subject')} (${role})`;
  const availableDocuments = list(inventory.available);
  const requestedDocuments = list(inventory.requested);
  const transactionFact = transaction
    ? `${transaction.id} records ${transaction.merchant}, ${transaction.amount}, ${transaction.channel}, posted ${transaction.posted} at ${transaction.time}`
    : `${activity} for ${amount}`;

  return prompts.map((prompt, index) => {
    const normalized = prompt.toLowerCase();
    let answer;

    if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT && /what employee|destination|amount|timing|administrator change|who requested|request method/.test(normalized)) {
      answer = `The platform observed ${activity}. Request method: ${UNKNOWN_REQUEST_METHOD}. No request-channel evidence has been supplied at intake.`;
    } else if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT && /payroll and destination histories|employee or vendor new or established/.test(normalized)) {
      answer = `${employee ? `${employee.name} has an ${employee.status.toLowerCase()} record with ${employee.employer}` : 'Review the affected employee record'}. ${payment ? `${payment.object} was first seen ${payment.firstSeen}; ${payment.priorUse}.` : 'Review destination ownership and prior use.'}`;
    } else if (workflowType === WORKFLOW_TYPES.PAYROLL_CHANGE_ALERT && /trusted business contact|trusted contact/.test(normalized)) {
      answer = `If the activity remains risky, contact the business using a trusted, previously known contact method. The business response and how it says the change was requested have not yet been recorded.`;
    } else if (/account activity.*not authorize|what does the customer say occurred/.test(normalized)) {
      answer = `${quotedStatement(statement)}. The activity attached to the claim is ${transactionFact}.`;
    } else if (/alerts?|reset messages?|contact attempts?/.test(normalized)) {
      const loginFact = failedLogin
        ? `${failedLogin.failedAttemptCount ?? 1} failed attempt(s) appear on ${failedLogin.time} from ${failedLogin.device} in ${failedLogin.location}`
        : 'No failed authentication or lockout event is attached to this intake';
      const changes = profileChanges.slice(0, 2).map((item) => `${item.eventType} on ${item.date} at ${item.time}`).join('; ');
      answer = `${loginFact}. Profile activity: ${changes || 'no reset or profile change is recorded'}. Contact was received through ${channel} on ${reportedDate}.`;
    } else if (/devices?|locations?/.test(normalized) && !/identity/.test(normalized)) {
      const recognized = `${clean(statedDevice, establishedLogin?.device ?? 'No device was named')} in ${city} is the device/location stated at intake`;
      const history = establishedLogin
        ? `${establishedLogin.device} in ${establishedLogin.location} is the prior successful device/location record`
        : 'No earlier successful device/location record is attached';
      const current = currentLogin
        ? `${currentLogin.device} (${currentLogin.deviceId ?? 'no device ID supplied'}) in ${currentLogin.location} appears on the current ${currentLogin.eventType ?? 'login'} record`
        : 'No login device is attached to this claim lane';
      answer = `${recognized}. ${history}. ${current}.`;
    } else if (/when did.*notice|when might.*started|first notice.*billing|when did.*billing issue/.test(normalized)) {
      answer = `The activity window begins ${issueStartDate}; ${transactionFact}. The case was reported ${reportedDate} through ${channel}.`;
    } else if (/lost or stolen|cardholder possession/.test(normalized)) {
      const possession = /still have|possession/i.test(statement)
        ? 'The cardholder states the physical card remained in their possession'
        : /lost|stolen/i.test(statement)
          ? 'The intake reports a lost or stolen card'
          : 'No separate lost, stolen, or card-possession statement is recorded';
      answer = `${possession}. ${quotedStatement(statement)}. The card activity is ${transactionFact}.`;
    } else if (/anyone else.*card|access to the card|card or pin/.test(normalized)) {
      answer = `No separate authorized-user, card-sharing, or PIN-sharing statement is recorded. ${subject} is the named cardholder, and the activity in scope is ${transactionFact}.`;
    } else if (/digital wallet|last valid transaction/.test(normalized)) {
      const wallet = authorization?.walletToken && !/no wallet token/i.test(authorization.walletToken)
        ? `Wallet record: ${authorization.walletToken}; ${authorization.otp}`
        : /wallet/i.test(`${subtype} ${activity}`)
          ? `Digital-wallet activity is in scope, but no separate wallet-token record was supplied`
          : 'No digital-wallet use is identified in the intake or authorization record';
      const prior = priorTransaction
        ? `${priorTransaction.id} on ${priorTransaction.posted} for ${priorTransaction.amount} via ${priorTransaction.channel}`
        : 'no earlier valid transaction was supplied';
      answer = `${wallet}. The latest prior transaction in the packet is ${prior}.`;
    } else if (/contact.*merchant|merchant.*contact|travel near/.test(normalized)) {
      const travel = /travel/.test(normalized) ? ' No separate travel statement is recorded.' : '';
      answer = `${merchantContact?.summary ?? 'No completed merchant-contact record is listed in the current intake.'} The customer location is ${city}; ${merchant ? `${merchant.name} is recorded in ${merchant.location}` : `the transaction is ${activity}`}.${travel}`;
    } else if (/what did.*purchase|purchase, cancel, return|ask the merchant to refund/.test(normalized)) {
      answer = `${quotedStatement(statement)}. ${transactionFact}. The claim subtype is ${subtype}.`;
    } else if (/which receipt|policy, delivery|return, or refund records/.test(normalized)) {
      answer = `Available documents: ${availableDocuments}. Still requested or missing: ${requestedDocuments}. ${fulfillment ? `Merchant fulfillment record: ${fulfillment.summary}.` : `These records are attached to ${caseId}.`}`;
    } else if (/dispute reason|required evidence/.test(normalized)) {
      answer = `The dispute reason is ${subtype}. Available support: ${availableDocuments}. Required support still open: ${requestedDocuments}.`;
    } else if (/purchase, delivery|delivery, or prior claim|prior claim records/.test(normalized)) {
      answer = `${transactionFact}. ${fulfillment ? `Delivery/service record: ${fulfillment.summary}.` : 'No separate delivery or service record is attached.'} Merchant history records ${merchant?.priorTransactionCount ?? 0} prior transaction(s) and ${merchant?.priorDisputeCount ?? 0} prior dispute(s).`;
    } else if (/records should be requested|before documenting a conclusion/.test(normalized)) {
      answer = `Open document requests: ${requestedDocuments}. Available comparison records: ${availableDocuments}. The request list is tied to ${subtype} case ${caseId}.`;
    } else if (/who requested.*payroll|who requested.*destination change/.test(normalized)) {
      answer = `${subject} is named in the ${channel} intake. ${quotedStatement(statement)}. The requested change is ${activity}.`;
    } else if (/employee or vendor new or established/.test(normalized)) {
      answer = `${employee ? `${employee.name} has an ${(employee.employmentStatus ?? employee.status ?? 'recorded').toLowerCase()} record with ${employee.employer}` : `${person} is linked to ${clean(employer, business)}`}. Relationship since: ${clean(customer.relationshipSince)}. ${payment ? 'A payment destination record is attached; ownership, status, and prior-use results require an exact Payment Verification search.' : 'No destination-history record is attached.'}`;
    } else if (/trusted contact/.test(normalized)) {
      const callbackDocument = [...inventory.available, ...inventory.requested].find((item) => /callback/i.test(item));
      const callbackStatus = inventory.available.includes(callbackDocument) ? 'available' : inventory.requested.includes(callbackDocument) ? 'still requested' : 'not included';
      answer = `The contact record lists ${clean(contact.phone)} and ${clean(contact.email)} for ${clean(employer, business)}. The trusted callback record is ${callbackStatus}${callbackDocument ? ` (${callbackDocument})` : ''}.`;
    } else if (/who sent or approved|payment instruction/.test(normalized) && /who/.test(normalized)) {
      answer = `${subject} is the business contact named in the ${channel} intake; no separate approver identity is recorded. ${quotedStatement(statement)}. The instruction concerns ${activity}.`;
    } else if (/email, domain, beneficiary|email.*payment records/.test(normalized)) {
      answer = `${activity}. ${payment ? `${payment.object} is recorded for exact lookup in Payment Verification; ownership, status, and prior-use results are not shown in intake.` : 'No beneficiary destination record is attached.'} Email/payment documents available: ${availableDocuments}; still requested: ${requestedDocuments}.`;
    } else if (/type of credit request|account review opened/.test(normalized)) {
      answer = `${subtype} opened the ${credit?.relationshipStage ?? 'credit review'} for ${subject}. The requested exposure is ${credit?.requestedExposure ?? amount}; the activity is ${activity}.`;
    } else if (/employer, income source|gross\/net income|business revenue was stated/.test(normalized)) {
      answer = credit
        ? `${credit.employerOrBusiness}; stated support is ${credit.statedAnnualIncome}, verified support is ${credit.verifiedAnnualIncome}, monthly gross is ${credit.monthlyGrossIncome}, and the recorded source is ${credit.incomeSource}.`
        : `${clean(employer, business)} is the stated employer or business for ${person}; no separate income record is attached.`;
    } else if (/payment, utilization|utilization, nsf|late-payment|cash-flow history/.test(normalized)) {
      answer = credit
        ? `Utilization is ${credit.utilization}; payment history is ${credit.paymentHistory}; NSF/returns are ${credit.nsfReturns}; average monthly deposits are ${credit.averageMonthlyDeposits} and average outflow is ${credit.averageMonthlyOutflow}.`
        : `${payment ? `${payment.object} is available for exact lookup in Payment Verification` : 'No payment object is attached'}; ${transactions.length} transaction record(s) cover ${issueStartDate} through ${reportedDate}.`;
    } else if (/bank statements|paystubs|credit-file|business documents available/.test(normalized)) {
      const complete = credit?.completedDocuments ?? [];
      const missing = credit?.missingDocuments ?? [];
      answer = `Complete or available: ${list([...inventory.available, ...complete])}. Requested or missing: ${list([...inventory.requested, ...missing])}.`;
    } else if (/debt obligations|bankruptcy|public-record|business changes/.test(normalized)) {
      answer = credit
        ? `Monthly debt is ${credit.monthlyDebt}, housing expense is ${credit.housingExpense}, DTI is ${credit.dti}, and public-record status is: ${credit.bankruptcyPublicRecord}.`
        : `${profileChange ? `${profileChange.item} changed from ${profileChange.oldValue} to ${profileChange.newValue}.` : 'No business-profile change is recorded.'} The review concerns ${activity}.`;
    } else if (/documents and verification records are still needed/.test(normalized)) {
      answer = `Still needed: ${list([...inventory.requested, ...(credit?.missingDocuments ?? [])])}. Completed verification records: ${list(credit?.completedDocuments ?? inventory.available)}.`;
    } else if (/business credit event opened/.test(normalized)) {
      answer = `${subtype} opened the business credit review for ${clean(business)}. The exposure is ${credit?.requestedExposure ?? amount}; the activity is ${activity}.`;
    } else if (/owner, revenue, entity|owner.*revenue|entity.*account records/.test(normalized)) {
      answer = `${person} is the recorded owner/contact for ${clean(business)}. ${credit ? `Stated revenue is ${credit.statedAnnualIncome}; verified revenue is ${credit.verifiedAnnualIncome}.` : `The entity record is ${businessRecord?.id ?? caseId}.`} ${payment ? `Account object: ${payment.object}, ${payment.ownerMatch.toLowerCase()}.` : 'No separate payment account is attached.'}`;
    } else if (/documents are complete|remain requested/.test(normalized)) {
      answer = `Complete or available: ${list([...inventory.available, ...(credit?.completedDocuments ?? [])])}. Still requested: ${list([...inventory.requested, ...(credit?.missingDocuments ?? [])])}.`;
    } else if (/application field or document needs verification/.test(normalized)) {
      answer = `${subtype} is the application field requiring review. ${quotedStatement(statement)}. Available: ${availableDocuments}; still requested: ${requestedDocuments}.`;
    } else if (/identity, address|identity.*phone|phone, email|email, or device records/.test(normalized)) {
      answer = `${identityRecords.map((item) => `${item.label}: ${item.value}`).join('; ') || `Training identity: ${person}`}. Address: ${clean(contact.address, city)}. Phone: ${clean(contact.phone)}. Email: ${clean(contact.email)}. ${currentLogin ? `Device: ${currentLogin.device} (${currentLogin.deviceId}) in ${currentLogin.location}.` : `Device: ${clean(statedDevice)}.`}`;
    } else if (/document or verification step remains open/.test(normalized)) {
      answer = `The open item is ${requestedDocuments}. Available verification records are ${availableDocuments}. Case ${caseId} was reported through ${channel} on ${reportedDate}.`;
    } else if (/which payment rail|transaction is in scope/.test(normalized)) {
      answer = `${transactionFact}. The instrument is ${transaction?.instrument ?? payment?.object ?? 'identified in the payment instruction'}, and the claim subtype is ${subtype}.`;
    } else if (/who requested, approved|released the payment/.test(normalized)) {
      answer = `${subject} is named in the ${channel} intake; no separate releaser identity is recorded. ${quotedStatement(statement)}. The instruction concerns ${activity}.`;
    } else if (/beneficiary, callback|payment records need verification/.test(normalized)) {
      answer = `${payment ? `${payment.object} is recorded for exact lookup in Payment Verification; its ownership, status, and prior-use results remain gated until that search runs.` : 'No beneficiary object is attached.'} Callback or verification records still open: ${list(inventory.requested.filter((item) => /callback|verification|beneficiary/i.test(item)))}.`;
    } else {
      answer = `${subject} reported ${activity} for ${amount}. The activity began ${issueStartDate}, was reported ${reportedDate}, and entered through ${channel}. ${quotedStatement(statement)}.`;
    }

    return { id: `${caseId}-INT-${index + 1}`, prompt, answer };
  });
}
