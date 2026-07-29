import {
  getRelationshipAccounts,
  formatMoney,
  moneyNumber,
  relationshipLengthFrom,
} from './relationshipAccounts.js';
import { buildCaseParties } from './caseParties.js';
import { getKybReview } from './businessResearchRecords.js';
import { getPayrollHistory } from './businessPayrollWorkspace.js';
import { CUSTOMER_TYPES, PRODUCT_TYPES } from './caseDomain.js';
import { containsHiddenAnswer } from './publicCaseView.js';

const unavailable = 'Not available in the current training record';
const allowedResearchStatuses = new Set([
  'Verified match',
  'Partial match',
  'Conflicting information',
  'No record located',
  'Unable to verify',
  'Not applicable',
]);

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) % 100000, 23);
}

function publicRelationshipIdentifier(activeCase, value, prefix, salt = '') {
  const supplied = String(value ?? '').trim();
  if (supplied && (!activeCase.id || !supplied.includes(activeCase.id))) return supplied;
  const seed = stableNumber(`${activeCase.id}-${supplied}-${prefix}-${salt}`);
  return `${prefix}-REL-${String(seed).padStart(6, '0').slice(-6)}`;
}

function phoneFor(seed) {
  return `(555) 01${String(seed % 100).padStart(2, '0')}-${String(seed).padStart(4, '0').slice(-4)}`;
}

function nameParts(name = 'Morgan Reed') {
  const parts = String(name).trim().split(/\s+/);
  return {
    first: parts[0] ?? 'Morgan',
    last: parts.at(-1) ?? 'Reed',
  };
}

function addressFor(seed, label = 'Residence') {
  const streetNames = ['Juniper', 'Willow', 'Crescent', 'Harbor', 'Maple', 'Parkview', 'Cedar', 'Lakeview'];
  const cities = ['Dallas, TX 75201', 'Arlington, TX 76010', 'Irving, TX 75039', 'Fort Worth, TX 76102'];
  return `${120 + (seed % 8700)} ${streetNames[seed % streetNames.length]} ${label} Lane, ${cities[(seed + 2) % cities.length]} (training)`;
}

function businessAddress(base, suffix) {
  const text = String(base ?? '').replace(/\s+\(training\)$/i, '');
  if (!text || /not available/i.test(text)) return `${400 + (suffix % 5000)} Commerce Training Drive, Dallas, TX 75201`;
  return text;
}

function websiteHost(value) {
  const host = String(value ?? '')
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .split(/[/?#]/)[0]
    .replace(/[^a-z0-9.-]/gi, '');
  return host.includes('.') ? host : 'training-business.example.test';
}

function businessNameKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(?:limited liability company|llc|incorporated|inc|corporation|corp|company|co)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function dateYear(value) {
  return String(value ?? '').match(/\b(19|20)\d{2}\b/)?.[0] ?? '2022';
}

function timestamp(value) {
  const parsed = new Date(String(value ?? '').replace(/\s+·\s+/, ' '));
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function payrollRunTimestamp(run = {}) {
  const source = run.processedDate
    ?? run.effectiveDate
    ?? run.payPeriodEnd
    ?? run.periodEnd
    ?? run.period;
  const text = String(source ?? '').replace(/\s+·.*$/, '').trim();
  const range = text.match(
    /^([A-Za-z]{3,9})\s+\d{1,2}\s*[–—-]\s*(?:([A-Za-z]{3,9})\s+)?(\d{1,2}),?\s+((?:19|20)\d{2})\b/,
  );
  if (range) {
    return timestamp(`${range[2] ?? range[1]} ${range[3]}, ${range[4]}`);
  }
  return timestamp(text);
}

function newestPayrollRuns(runs = []) {
  return runs
    .map((run, index) => ({ run, index, observed: payrollRunTimestamp(run) }))
    .sort((left, right) => {
      if (left.observed !== null && right.observed !== null) return right.observed - left.observed;
      if (left.observed !== null) return -1;
      if (right.observed !== null) return 1;
      return left.index - right.index;
    })
    .map(({ run }) => run);
}

function isCompletedPayrollRun(run = {}) {
  const lifecycleStatus = `${run.runStatus ?? ''} ${run.status ?? ''}`;
  if (/pending|scheduled|draft|processing|cancell?ed/i.test(lifecycleStatus)) return false;
  if (/posted|completed?|settled/i.test(lifecycleStatus)) return true;
  const fundingStatus = String(run.fundingStatus ?? '');
  if (/pending|scheduled|draft|processing|failed|returned|reversed|cancell?ed/i.test(fundingStatus)) {
    return false;
  }
  return /completed?|settled|funded/i.test(fundingStatus);
}

function caseAsOf(activeCase) {
  const source = String(activeCase.reportedDate ?? activeCase.opened ?? '').trim();
  const observed = timestamp(source);
  if (observed === null) return null;
  const includesTime = /T\d{1,2}:\d{2}|\b\d{1,2}:\d{2}\b/i.test(source);
  return includesTime ? observed : observed + (24 * 60 * 60 * 1000) - 1;
}

function isOnOrBeforeCase(activeCase, value) {
  const asOf = caseAsOf(activeCase);
  const observed = timestamp(value);
  return asOf === null || observed === null || observed <= asOf;
}

function dateBeforeCase(activeCase, daysBefore, time = '') {
  const asOf = caseAsOf(activeCase);
  if (asOf === null) return unavailable;
  const value = new Date(asOf - (daysBefore * 24 * 60 * 60 * 1000));
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
  return time ? `${date} · ${time}` : date;
}

function safeRelationshipNote(value, fallback = unavailable) {
  const text = String(value ?? '').trim();
  if (!text || containsHiddenAnswer(text)) return fallback;
  const words = new Set(text.toLowerCase().replace(/[^a-z]+/g, ' ').trim().split(/\s+/));
  const exposesOutcome = (
    words.has('fraud') && (
      words.has('confirmed')
      || words.has('established')
      || words.has('proven')
      || words.has('rule')
      || words.has('score')
    )
  ) || words.has('fraudulent') || (
    words.has('accepted') && words.has('determination')
  ) || (
    words.has('correct') && (words.has('determination') || words.has('answer'))
  ) || (
    words.has('hidden') && words.has('truth')
  ) || (
    words.has('final') && words.has('finding')
  ) || (
    words.has('automatic') && words.has('risk')
  );
  const directsDecision = (
    words.has('told')
    || words.has('instructed')
    || words.has('recommended')
    || words.has('recommend')
    || words.has('recommendation')
    || words.has('should')
    || words.has('must')
  ) && (
    words.has('close') || words.has('deny') || words.has('approve') || words.has('release') || words.has('hold')
  );
  const bareImperative = /^(?:please\s+)?(?:close|deny|approve|release|hold|restrict|reduce|support|do\s+not\s+support)\b/i.test(text);
  return exposesOutcome || directsDecision || bareImperative ? fallback : text;
}

function safeRelationshipList(values = []) {
  return values
    .map((value) => safeRelationshipNote(value, ''))
    .filter(Boolean);
}

function recordHasEvidenceAsOf(activeCase, values = []) {
  const dated = values
    .map((value) => ({ value, observed: timestamp(value) }))
    .filter((item) => item.observed !== null);
  if (!dated.length) return true;
  const asOf = caseAsOf(activeCase);
  return asOf === null || dated.some((item) => item.observed <= asOf);
}

function asOfValue(activeCase, value, fallback = unavailable) {
  if (!value || !isOnOrBeforeCase(activeCase, value)) return fallback;
  return safeRelationshipNote(value, fallback);
}

function normalizeContactNote(activeCase, item, index) {
  return {
    id: item.id ?? `BUSINESS-CONTACT-PRESERVED-${index + 1}`,
    contactDate: safeRelationshipNote(
      item.contactDate ?? item.contactDateTime ?? item.date,
      unavailable,
    ),
    personContacted: safeRelationshipNote(item.personContacted ?? item.person, 'Authorized business contact'),
    businessRole: safeRelationshipNote(item.businessRole ?? item.role, 'Business role not supplied'),
    contactChannel: safeRelationshipNote(item.contactChannel ?? item.channel, 'Contact channel not supplied'),
    reasonForContact: safeRelationshipNote(item.reasonForContact ?? item.reason, 'Relationship servicing contact'),
    informationSupplied: safeRelationshipNote(
      item.informationSupplied ?? item.reportedInformation,
      'The supplied note was withheld because it contained case-outcome language rather than relationship evidence.',
    ),
    assistanceProvided: safeRelationshipNote(
      item.assistanceProvided,
      'Servicing assistance detail was not available as neutral relationship evidence.',
    ),
    documentsRequested: safeRelationshipNote(item.documentsRequested, 'No document request recorded'),
    followUpStatus: safeRelationshipNote(item.followUpStatus, 'Follow-up status not supplied'),
    agentOrDepartment: safeRelationshipNote(item.agentOrDepartment ?? item.agent, 'Department not supplied'),
  };
}

function normalizeProfile(activeCase, sourceProfile) {
  const legalName = sourceProfile.legalName ?? activeCase.profile?.business ?? 'Cedar Ridge Services LLC';
  const seed = stableNumber(`${activeCase.id}-${legalName}`);
  const operatingAddress = businessAddress(sourceProfile.address, seed);
  const mailingAddress = sourceProfile.mailingAddress
    ?? `${620 + (seed % 3200)} Market Training Plaza, Suite ${100 + (seed % 700)}, Dallas, TX 75201`;
  const formationState = sourceProfile.jurisdiction ?? 'Texas';
  const formationDate = sourceProfile.formationDate ?? `Apr ${1 + (seed % 24)}, ${2017 + (seed % 7)}`;
  const customerSince = sourceProfile.relationshipStartDate
    ?? activeCase.customer?.relationshipSince
    ?? dateYear(formationDate);
  const registeredAgent = sourceProfile.registeredAgent;
  const registeredAgentName = typeof registeredAgent === 'string'
    ? registeredAgent
    : registeredAgent?.name;
  const registeredAgentAddress = typeof registeredAgent === 'object'
    ? registeredAgent?.address
    : null;
  const operatingLocations = Array.isArray(sourceProfile.operatingLocations)
    && sourceProfile.operatingLocations.length
    ? sourceProfile.operatingLocations
    : [
        operatingAddress,
        `${780 + (seed % 4000)} Fulfillment Training Road, ${seed % 2 ? 'Arlington, TX 76010' : 'Irving, TX 75039'}`,
      ];
  return {
    businessId: sourceProfile.businessId
      ?? publicRelationshipIdentifier(activeCase, null, 'BIZ', legalName),
    legalName,
    dba: sourceProfile.dba ?? legalName.replace(/\s+(LLC|Inc\.?|Corp\.?)$/i, ''),
    entityType: /training business entity/i.test(sourceProfile.entityType ?? '')
      ? ['Limited liability company', 'Corporation', 'Limited partnership'][seed % 3]
      : sourceProfile.entityType ?? 'Limited liability company',
    maskedEin: sourceProfile.ein ?? `**-***${String(seed).padStart(5, '0').slice(-4)}`,
    formationDate,
    formationState,
    registrationFileNumber: sourceProfile.registrationId ?? `${formationState.slice(0, 2).toUpperCase()}-REG-${String(seed).padStart(6, '0')}`,
    standing: sourceProfile.standing ?? 'Active fictional registration',
    industry: sourceProfile.industry ?? 'Business services',
    naics: sourceProfile.naics ?? `${440000 + (seed % 9000)} — Business services`,
    operatingAddress,
    mailingAddress,
    registeredAgent: {
      name: registeredAgentName
        ?? `${['Meridian', 'Bluebonnet', 'Lone Star', 'Crescent'][seed % 4]} Registered Agent Services`,
      address: registeredAgentAddress
        ?? `${900 + (seed % 7000)} Capitol Training Avenue, Austin, TX 78701`,
    },
    phone: sourceProfile.phone ?? phoneFor(seed),
    email: sourceProfile.email
      ?? `service+${String(seed).slice(-4)}@${websiteHost(sourceProfile.website)}`,
    website: sourceProfile.website ?? `business-${String(seed).slice(-5)}.training.example.test`,
    businessAge: relationshipLengthFrom(formationDate),
    customerSince,
    relationshipLength: relationshipLengthFrom(customerSince),
    operatingLocations,
    estimatedEmployeeCount: sourceProfile.estimatedEmployeeCount
      ?? Math.max(4, 8 + (seed % 42)),
    sourceChecked: sourceProfile.source ?? 'Fictional entity-registration and relationship records',
    dateChecked: sourceProfile.observed ?? activeCase.reportedDate ?? activeCase.opened ?? 'Jul 2026',
    registrationSearchCompleted: sourceProfile.registrationSearchCompleted ?? Boolean(sourceProfile.source),
    onlineSearchCompleted: sourceProfile.onlineSearchCompleted ?? Boolean(sourceProfile.online?.length),
    ownerSearchCompleted: sourceProfile.ownerSearchCompleted ?? Boolean(sourceProfile.owners),
    licenseSearchCompleted: sourceProfile.licenseSearchCompleted ?? false,
    licenseApplicable: sourceProfile.licenseApplicable,
  };
}

function ownerAccount(owner, seed) {
  const accountId = `OWN-ACCT-${String(seed).padStart(6, '0').slice(-6)}`;
  const isCredit = seed % 2 === 0;
  const balance = 1800 + (seed % 5400);
  const limit = isCredit ? Math.max(5000, balance * 2) : null;
  return getRelationshipAccounts({
    customerType: CUSTOMER_TYPES.PERSONAL,
    productType: isCredit ? PRODUCT_TYPES.CREDIT_CARD : PRODUCT_TYPES.DEPOSIT_ACCOUNT,
    toolResults: {
      relationshipAccounts: [{
        relationshipDataVersion: 1,
        accountId,
        productType: isCredit ? PRODUCT_TYPES.CREDIT_CARD : PRODUCT_TYPES.DEPOSIT_ACCOUNT,
        productKind: isCredit ? 'credit-card' : 'checking',
        productLabel: isCredit ? 'Personal Credit Card' : 'Personal Checking',
        status: 'Open — Good Standing',
        openDate: `May ${2 + (seed % 20)}, ${2019 + (seed % 5)}`,
        currentBalance: balance,
        availableBalance: isCredit ? null : 1600 + (seed % 4700),
        creditLimit: limit,
        availableCredit: isCredit ? Math.max(0, limit - balance) : null,
        scheduledPayment: isCredit ? Math.max(35, Math.round(balance * 0.03 * 100) / 100) : null,
        nextPaymentDueDate: isCredit ? 'Aug 18, 2026' : null,
        paymentStatus: isCredit ? 'Current' : 'Not applicable',
        pastDueAmount: 0,
        restrictions: 'None recorded',
        holds: 'None recorded',
        isPrimary: true,
      }],
    },
  })[0];
}

function ownerFromRecord(activeCase, profile, rawOwner, index, parties) {
  const [
    id,
    rawName,
    rawRole,
    rawOwnership,
    rawIdentityStatus,
    ownerSince,
    rawTrainingId,
    suppliedOwner = {},
  ] = rawOwner;
  const name = suppliedOwner.legalName
    ?? suppliedOwner.name
    ?? rawName
    ?? ['Morgan Reed', 'Cameron Patel', 'Riley Navarro'][index % 3];
  const party = parties.find((item) => item.name === name || item.id === id);
  const seed = stableNumber(`${activeCase.id}-${id}-${name}`);
  const names = nameParts(name);
  const currentAddress = addressFor(seed, 'Residence');
  const previousAddress = seed % 3 === 0 ? addressFor(seed + 17, 'Former Residence') : unavailable;
  const matchesMailing = seed % 5 === 0;
  const residentialAddress = suppliedOwner.currentResidentialAddress
    ?? (matchesMailing ? profile.mailingAddress : currentAddress);
  const priorResidentialAddress = suppliedOwner.previousResidentialAddress ?? previousAddress;
  const role = suppliedOwner.title ?? party?.role ?? rawRole ?? 'Beneficial owner';
  const ownership = suppliedOwner.ownershipPercentage !== undefined
    ? `${suppliedOwner.ownershipPercentage}%`
    : party?.ownership ?? rawOwnership ?? `${25 + (seed % 51)}%`;
  const suppliedAccounts = Array.isArray(suppliedOwner.personalAccounts)
    ? suppliedOwner.personalAccounts
    : [];
  const personalAccounts = suppliedAccounts.length
    ? getRelationshipAccounts({
        customerType: CUSTOMER_TYPES.PERSONAL,
        productType: /credit|loan|line/i.test(suppliedAccounts[0]?.product ?? '')
          ? PRODUCT_TYPES.CREDIT_CARD
          : PRODUCT_TYPES.DEPOSIT_ACCOUNT,
        toolResults: {
          relationshipAccounts: suppliedAccounts.map((account, accountIndex) => {
            const isCredit = /credit|loan|line/i.test(account.product ?? '');
            return {
              accountId: account.id ?? account.accountId,
              destinationId: account.destinationId ?? account.id ?? account.accountId,
              bankCode: account.bankCode,
              productType: isCredit ? PRODUCT_TYPES.CREDIT_CARD : PRODUCT_TYPES.DEPOSIT_ACCOUNT,
              productKind: isCredit ? 'credit-card' : 'checking',
              productLabel: account.product ?? 'Owner personal relationship',
              openDate: account.openDate,
              status: account.status,
              currentBalance: account.currentBalance ?? null,
              availableBalance: account.availableBalance ?? null,
              creditLimit: account.creditLimit ?? null,
              paymentStatus: account.paymentStatus,
              restrictions: account.restrictions,
              holds: account.holds,
              isPrimary: accountIndex === 0,
              legacyCoverage: true,
              evidenceCoverage: 'Only owner-account fields supplied by the reusable owner record are shown.',
            };
          }),
        },
      })
    : [ownerAccount(name, seed)];
  const suppliedDevices = Array.isArray(suppliedOwner.trustedDevices)
    ? suppliedOwner.trustedDevices
    : [];
  const trustedDevices = suppliedDevices.length
    ? suppliedDevices.map((device, deviceIndex) => ({
        deviceName: device.deviceName ?? device.device ?? device.name ?? 'Owner trusted device',
        deviceId: device.deviceId ?? device.id ?? `DEV-OWNER-PRESERVED-${deviceIndex + 1}`,
        deviceType: device.deviceType ?? (/mobile|phone|iphone|android/i.test(device.device ?? '') ? 'Mobile phone' : unavailable),
        browserOrOperatingSystem: device.browserOrOperatingSystem ?? device.platform ?? unavailable,
        firstSeen: device.firstSeen ?? unavailable,
        lastSeen: device.lastSeen ?? unavailable,
        trustStatus: device.trustStatus ?? device.status ?? unavailable,
        mfaMethod: device.mfaMethod ?? unavailable,
      }))
    : [{
        deviceName: `${names.first}'s trusted phone`,
        deviceId: `DEV-OWN-${String(seed).padStart(6, '0').slice(-6)}`,
        deviceType: 'Mobile phone',
        browserOrOperatingSystem: seed % 2 ? 'iOS · Mobile Safari' : 'Android · Chrome Mobile',
        firstSeen: `Mar ${1 + (seed % 20)}, 2024`,
        lastSeen: profile.dateChecked,
        trustStatus: 'Trusted on personal profile',
        mfaMethod: seed % 2 ? 'Biometric + OTP' : 'Password + OTP',
      }];
  const suppliedContacts = Array.isArray(suppliedOwner.contactHistory)
    ? suppliedOwner.contactHistory
    : [];
  const contactHistory = suppliedContacts.length
    ? suppliedContacts.map((contact, contactIndex) => ({
        id: contact.id ?? `OWNER-CONTACT-PRESERVED-${contactIndex + 1}`,
        contactDateTime: contact.contactDateTime ?? contact.date ?? unavailable,
        channel: contact.channel ?? unavailable,
        reasonForContact: contact.reasonForContact ?? contact.reason ?? 'Personal profile service',
        reportedInformation: contact.reportedInformation ?? contact.note ?? unavailable,
        assistanceProvided: contact.assistanceProvided ?? unavailable,
        documentsRequested: contact.documentsRequested ?? unavailable,
        followUpStatus: contact.followUpStatus ?? unavailable,
        agentOrDepartment: contact.agentOrDepartment ?? unavailable,
        relatedAccountId: contact.relatedAccountId ?? personalAccounts[0]?.maskedDestinationId ?? unavailable,
      }))
    : [{
        id: publicRelationshipIdentifier(activeCase, `${id}-CONTACT-1`, 'OWNER-CONTACT', index),
        contactDateTime: `Jun ${10 + (seed % 12)}, 2026 · 2:${String(seed % 60).padStart(2, '0')} PM`,
        channel: 'Secure message',
        reasonForContact: 'Personal profile service',
        reportedInformation: 'Owner confirmed the recorded personal contact information.',
        assistanceProvided: 'Profile values were reviewed; no business record was changed.',
        documentsRequested: 'None',
        followUpStatus: 'Completed',
        agentOrDepartment: 'Relationship servicing',
        relatedAccountId: personalAccounts[0]?.maskedDestinationId ?? unavailable,
      }];
  return {
    id: publicRelationshipIdentifier(activeCase, id, 'OWNER', index),
    fullLegalName: name,
    dateOfBirth: suppliedOwner.dateOfBirth
      ?? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'][seed % 8]} ${1 + (seed % 27)}, ${1968 + (seed % 27)}`,
    trainingId: party?.trainingId
      ?? suppliedOwner.trainingId
      ?? rawTrainingId
      ?? `TRN-OWN-${String(seed).padStart(6, '0').slice(-6)}`,
    ownershipPercentage: ownership,
    businessTitle: role,
    officerStatus: suppliedOwner.officerStatus
      ?? (/officer|president|treasurer|secretary|chief/i.test(role) ? 'Officer on file' : 'Not listed as an officer'),
    controllingPartyStatus: suppliedOwner.controlStatus
      ?? (/control|managing|president|chief|51|owner/i.test(`${role} ${ownership}`) ? 'Controlling party on file' : 'Not listed as the control person'),
    guarantorStatus: suppliedOwner.guarantorStatus
      ?? (/guarantor/i.test(role) ? 'Personal guarantor on file' : 'No guarantor role recorded'),
    currentResidentialAddress: residentialAddress,
    previousResidentialAddress: priorResidentialAddress,
    personalPhone: suppliedOwner.phone ?? phoneFor(seed),
    personalEmail: suppliedOwner.email
      ?? `${names.first}.${names.last}.${String(seed).slice(-3)}@owner.training.example.test`.toLowerCase(),
    identityVerificationStatus: party?.verificationStatus
      ?? suppliedOwner.verificationStatus
      ?? rawIdentityStatus
      ?? 'Training identity verification completed',
    addressVerificationStatus: residentialAddress === profile.mailingAddress ? 'Address appears in both owner and business-mailing records' : 'Residential address recorded separately',
    ownerSince: timestamp(suppliedOwner.firstRecorded ?? ownerSince) === null
      ? profile.formationDate
      : suppliedOwner.firstRecorded ?? ownerSince,
    addressComparison: residentialAddress === profile.mailingAddress
      ? 'Owner residential address matches the business mailing address.'
      : residentialAddress === profile.operatingAddress
        ? 'Owner residential address matches the business operating address.'
        : 'Owner residential address differs from the business operating and mailing addresses.',
    accounts: personalAccounts,
    trustedDevices,
    contactHistory,
  };
}

function profileUpdates(activeCase) {
  const provided = activeCase.businessProfile?.profileUpdates
    ?? (activeCase.customerType === CUSTOMER_TYPES.BUSINESS
      ? activeCase.customer?.profileChanges
      : [])
    ?? [];
  const neutral = provided
    .filter((item) => isOnOrBeforeCase(activeCase, `${item.date ?? ''} ${item.time ?? ''}`))
    .map((item, index) => ({
      id: publicRelationshipIdentifier(activeCase, item.id, 'PROFILE', index),
      updateType: safeRelationshipNote(item.eventType ?? item.item, 'Business profile maintenance'),
      previousValue: safeRelationshipNote(item.oldValue, 'Previous value not available as neutral relationship evidence'),
      newValue: safeRelationshipNote(item.newValue ?? item.detail, 'New value not available as neutral relationship evidence'),
      dateTime: safeRelationshipNote(
        `${item.date ?? activeCase.opened ?? 'Training date'}${item.time ? ` · ${item.time}` : ''}`,
        unavailable,
      ),
      channel: safeRelationshipNote(item.channel, 'Business servicing'),
      source: safeRelationshipNote(item.source, 'Business profile'),
      user: safeRelationshipNote(item.user, 'Authorized business user'),
      linkedSession: item.session
        ? publicRelationshipIdentifier(
            activeCase,
            safeRelationshipNote(item.session, ''),
            'SESSION',
            index,
          )
        : 'Session not recorded',
      linkedDevice: item.device
        ? publicRelationshipIdentifier(
            activeCase,
            safeRelationshipNote(item.device, ''),
            'DEVICE',
            index,
          )
        : 'Device not recorded',
  }));
  if (neutral.length) return neutral;
  return [];
}

function accessRecords(activeCase, parties, owners) {
  const isBusinessCase = activeCase.customerType === CUSTOMER_TYPES.BUSINESS;
  const suppliedAuthorizedUsers = activeCase.businessProfile?.authorizedUsers
    ?? (isBusinessCase ? activeCase.customer?.authorizedUsers : [])
    ?? [];
  const authorizedUsers = parties
    .filter((party) => /owner|control|administrator|approver|initiator|authorized/i.test(party.role ?? ''))
    .map((party) => ({
      id: publicRelationshipIdentifier(activeCase, party.id, 'USER', party.name),
      name: party.name,
      role: party.role,
      permissions: party.permissions
        ?? (/owner|control/i.test(party.role ?? '') ? 'Account administration and product access' : 'Role-based business access'),
      mfaMethod: party.mfaMethod ?? 'MFA method not supplied',
      lastSuccessfulLogin: party.lastSuccessfulLogin ?? 'No successful login supplied for this user',
    }));
  for (const [index, user] of suppliedAuthorizedUsers.entries()) {
    if (authorizedUsers.some((existing) => existing.id === user.id || existing.name === user.name)) continue;
    authorizedUsers.push({
      id: publicRelationshipIdentifier(activeCase, user.id, 'USER', index),
      name: user.name ?? 'Authorized business user',
      role: user.role ?? 'Authorized user',
      permissions: user.permissions ?? 'Permissions not supplied',
      mfaMethod: user.mfaMethod ?? 'MFA method not supplied',
      lastSuccessfulLogin: user.lastSuccessfulLogin ?? 'No successful login supplied for this user',
    });
  }
  if (!authorizedUsers.length && owners[0]) {
    authorizedUsers.push({
      id: owners[0].id,
      name: owners[0].fullLegalName,
      role: owners[0].businessTitle,
      permissions: 'Account administration and product access',
      mfaMethod: activeCase.legacyDerivedEvidence === true ? unavailable : 'Password + OTP',
      lastSuccessfulLogin: activeCase.legacyDerivedEvidence === true ? unavailable : dateBeforeCase(activeCase, 8, '9:14 AM'),
    });
  }
  const suppliedDevices = [
    ...(activeCase.businessProfile?.trustedDevices ?? []),
    ...(isBusinessCase ? activeCase.customer?.trustedDevices ?? [] : []),
    ...(isBusinessCase ? activeCase.customer?.security?.trustedDevices ?? [] : []),
    ...(isBusinessCase ? activeCase.toolResults?.trustedDevices ?? [] : []),
  ].filter((item) => isOnOrBeforeCase(activeCase, item.lastSeen ?? item.mostRecentSuccessfulLogin ?? item.firstSeen));
  const devicesById = new Map();
  suppliedDevices.forEach((item, index) => {
    // Device IDs are shared evidence keys. Preserve the exact persisted value so
    // Business 360 can reconcile to Device, Login, and Session History.
    const id = safeRelationshipNote(
      item.deviceId ?? item.id ?? item.device,
      `DEVICE-PRESERVED-${index + 1}`,
    );
    const previous = devicesById.get(id);
    const observedFirst = item.firstSeen ?? item.time;
    const observedLast = item.lastSeen ?? item.mostRecentSuccessfulLogin ?? item.time;
    const firstSeen = [previous?.firstSeen, observedFirst]
      .filter(Boolean)
      .sort((left, right) => (timestamp(left) ?? Number.MAX_SAFE_INTEGER) - (timestamp(right) ?? Number.MAX_SAFE_INTEGER))[0]
      ?? unavailable;
    const lastSeen = [previous?.lastSeen, observedLast]
      .filter(Boolean)
      .sort((left, right) => (timestamp(right) ?? 0) - (timestamp(left) ?? 0))[0]
      ?? unavailable;
    devicesById.set(id, {
      deviceName: item.deviceName ?? item.name ?? item.device ?? previous?.deviceName ?? 'Business access device',
      deviceId: id,
      deviceType: item.deviceType ?? item.type ?? (/mobile|iphone|android/i.test(`${item.device ?? ''} ${item.name ?? ''}`) ? 'Mobile' : 'Computer'),
      browserOrOperatingSystem: item.browserOrOperatingSystem
        ?? item.platform
        ?? ([item.operatingSystem, item.browserSource].filter(Boolean).join(' · ')
          || item.device
          || unavailable),
      firstSeen,
      lastSeen,
      trustStatus: item.trustStatus ?? 'Trust status not supplied',
      mfaMethod: item.mfaMethod ?? item.authentication ?? item.mfaStatus ?? item.method ?? unavailable,
      linkedSession: item.session
        ? safeRelationshipNote(item.session, unavailable)
        : unavailable,
    });
  });
  const devices = [...devicesById.values()];
  return {
    authorizedUsers,
    trustedDevices: devices,
    passwordOrAccessResets: profileUpdates(activeCase).filter((item) => /password|access|administrator|permission/i.test(item.updateType)),
  };
}

function contactNotes(activeCase, profile, parties) {
  const supplied = activeCase.businessProfile?.contactHistory;
  if (Array.isArray(supplied) && supplied.length) {
    return supplied
      .filter((item) => isOnOrBeforeCase(
        activeCase,
        item.contactDate ?? item.contactDateTime ?? item.date,
      ))
      .map((item, index) => normalizeContactNote(activeCase, item, index));
  }
  if (activeCase.legacyDerivedEvidence === true) return [];
  const primary = parties.find((party) => /owner|control|administrator/i.test(party.role ?? ''));
  return [
    {
      id: publicRelationshipIdentifier(activeCase, null, 'CONTACT', 1),
      contactDate: dateBeforeCase(activeCase, 18, '11:20 AM'),
      personContacted: primary?.name ?? 'Authorized business contact',
      businessRole: primary?.role ?? 'Business administrator',
      contactChannel: 'Trusted phone record',
      reasonForContact: 'Annual business profile review',
      informationSupplied: 'Business contact and authorized-user roster were reviewed.',
      assistanceProvided: 'Servicing team recorded the completed profile review.',
      documentsRequested: 'None',
      followUpStatus: 'Completed',
      agentOrDepartment: 'Business relationship servicing',
    },
    {
      id: publicRelationshipIdentifier(activeCase, null, 'CONTACT', 2),
      contactDate: dateBeforeCase(activeCase, 96, '3:05 PM'),
      personContacted: primary?.name ?? 'Authorized business contact',
      businessRole: primary?.role ?? 'Business administrator',
      contactChannel: 'Secure message',
      reasonForContact: 'Statement delivery preference',
      informationSupplied: `The business confirmed delivery to ${profile.email}.`,
      assistanceProvided: 'Statement-delivery preference was confirmed.',
      documentsRequested: 'None',
      followUpStatus: 'Completed',
      agentOrDepartment: 'Business digital servicing',
    },
  ];
}

function payrollRelationship(activeCase, profile, access, accounts) {
  const payrollEnabled = activeCase.productType === 'payroll-product'
    || activeCase.availableTools?.includes('Payroll History');
  if (!payrollEnabled) return null;
  const runs = getPayrollHistory(activeCase).payrollRuns.filter((run) => {
    const observed = payrollRunTimestamp(run);
    const asOf = caseAsOf(activeCase);
    return asOf === null || observed === null || observed <= asOf;
  });
  const allRuns = newestPayrollRuns(runs);
  const relationshipRuns = newestPayrollRuns(runs.filter(isCompletedPayrollRun));
  const amountValues = relationshipRuns.map((run) => Number(String(run.totalCompanyDebit ?? run.amount).replace(/[^0-9.]/g, '')) || 0);
  const lastRun = relationshipRuns[0];
  const latestObservedRun = allRuns[0];
  const monthTotals = [...relationshipRuns.reduce((totals, run) => {
    const month = suppliedPayrollMonth(run) ?? 'Month not supplied';
    const amount = Number(String(run.totalCompanyDebit ?? run.amount).replace(/[^0-9.]/g, '')) || 0;
    totals.set(month, (totals.get(month) ?? 0) + amount);
    return totals;
  }, new Map()).values()];
  const average = monthTotals.length
    ? monthTotals.reduce((sum, value) => sum + value, 0) / monthTotals.length
    : 0;
  const employeeCount = Number(lastRun?.employeeCount)
    || Number(latestObservedRun?.employeeCount)
    || Number(profile.estimatedEmployeeCount)
    || null;
  const payrollAccount = accounts.find((account) => (
    account.productType === PRODUCT_TYPES.PAYROLL_PRODUCT
    || account.productKind === 'payroll-account'
  ));
  return {
    payrollAccountStatus: payrollAccount?.status ?? unavailable,
    payrollCustomerSince: payrollAccount?.openDate ?? profile.customerSince,
    paySchedule: lastRun?.paySchedule ?? latestObservedRun?.paySchedule ?? 'Twice monthly',
    nextScheduledPayroll: latestObservedRun?.nextScheduledPayroll ?? lastRun?.nextScheduledPayroll ?? 'Not supplied',
    activeEmployeeCount: employeeCount ?? unavailable,
    lastCompletedPayrollDate: lastRun?.processedDate ?? lastRun?.period ?? 'No completed run supplied',
    lastPayrollAmount: lastRun ? formatMoney(amountValues[0] ?? 0) : unavailable,
    averageMonthlyPayroll: monthTotals.size ? formatMoney(average) : unavailable,
    payrollFundingStatus: lastRun?.fundingStatus ?? unavailable,
    payrollAdministrator: access.authorizedUsers.find((user) => /administrator/i.test(user.role))?.name ?? unavailable,
    authorizedPayrollUsers: access.authorizedUsers.filter((user) => /payroll|administrator|approver|initiator|owner|control/i.test(user.role)).map((user) => user.name),
    employerTaxProfileStatus: safeRelationshipNote(
      activeCase.businessProfile?.employerTaxProfileStatus
        ?? activeCase.toolResults?.employerTaxProfileStatus,
      unavailable,
    ),
  };
}

function researchChecks(profile, owners) {
  const hasValue = (value) => Boolean(value && value !== unavailable && !/not (?:available|supplied|recorded)/i.test(String(value)));
  const ownerStatus = owners.length
    ? 'Verified match'
    : profile.ownerSearchCompleted ? 'No record located' : 'Unable to verify';
  const checks = [
    {
      id: 'owner-link',
      subject: 'Owner-to-business relationship',
      status: ownerStatus,
      sourceChecked: 'Fictional ownership and control-person register',
      dateChecked: profile.dateChecked,
      detail: owners.length ? `${owners.length} owner or controlling-party record(s) are linked to the entity.` : 'No ownership record was available in the supplied sources.',
    },
    {
      id: 'registration',
      subject: 'State entity registration',
      status: hasValue(profile.registrationFileNumber)
        ? 'Verified match'
        : profile.registrationSearchCompleted ? 'No record located' : 'Unable to verify',
      sourceChecked: hasValue(profile.formationState)
        ? `${profile.formationState} fictional entity registry`
        : 'No completed registration source supplied',
      dateChecked: profile.dateChecked,
      detail: hasValue(profile.registrationFileNumber)
        ? `Registration ${profile.registrationFileNumber} uses the recorded legal name.`
        : profile.registrationSearchCompleted
          ? 'No registration record was returned by the completed fictional source check.'
          : 'No completed registration-source check was supplied.',
    },
    {
      id: 'license',
      subject: 'Professional or industry license',
      status: profile.licenseApplicable === false
        ? 'Not applicable'
        : profile.licenseSearchCompleted ? 'No record located' : 'Unable to verify',
      sourceChecked: profile.licenseSearchCompleted || profile.licenseApplicable === false
        ? 'Fictional licensing directory'
        : 'No completed licensing source supplied',
      dateChecked: profile.dateChecked,
      detail: profile.licenseApplicable === false
        ? 'The supplied fictional industry record states that this license check is not applicable.'
        : profile.licenseSearchCompleted
          ? 'No license record was returned by the completed fictional source check.'
          : 'License applicability or a completed source check was not supplied.',
    },
    {
      id: 'online-presence',
      subject: 'Website, domain, or directory presence',
      status: hasValue(profile.website)
        ? 'Partial match'
        : profile.onlineSearchCompleted ? 'No record located' : 'Unable to verify',
      sourceChecked: profile.onlineSearchCompleted || hasValue(profile.website)
        ? 'Fictional domain and business-directory records'
        : 'No completed online-presence source supplied',
      dateChecked: profile.dateChecked,
      detail: hasValue(profile.website)
        ? `${profile.website} uses the recorded DBA; independent ownership fields are limited.`
        : profile.onlineSearchCompleted
          ? 'No website or directory record was returned by the completed fictional source check.'
          : 'No completed website, domain, or directory source check was supplied.',
    },
    {
      id: 'cross-source',
      subject: 'Name, address, phone, email, owners, and dates',
      status: owners.length && hasValue(profile.phone) && hasValue(profile.operatingAddress) ? 'Verified match' : 'Unable to verify',
      sourceChecked: profile.sourceChecked,
      dateChecked: profile.dateChecked,
      detail: 'The displayed status records source-field agreement only and is not a conclusion about the business.',
    },
  ];
  return checks.map((item) => ({
    ...item,
    status: allowedResearchStatuses.has(item.status) ? item.status : 'Unable to verify',
  }));
}

function updateObservedAt(item = {}) {
  return `${item.dateTime ?? item.date ?? item.observed ?? ''}${item.time ? ` ${item.time}` : ''}`.trim();
}

function futureUpdates(activeCase, records = []) {
  const asOf = caseAsOf(activeCase);
  if (asOf === null) return [];
  return records
    .map((item) => ({ item, observed: timestamp(updateObservedAt(item)) }))
    .filter(({ observed }) => observed !== null && observed > asOf)
    .sort((left, right) => right.observed - left.observed)
    .map(({ item }) => item);
}

function rollbackSnapshotFields(source = {}, updates = [], mappings = []) {
  const snapshot = { ...source };
  for (const update of updates) {
    const updateType = String(
      update.updateType ?? update.eventType ?? update.item ?? update.type ?? '',
    );
    const mapping = mappings.find(({ pattern }) => pattern.test(updateType));
    if (!mapping) continue;
    const oldValue = update.oldValue ?? update.previousValue;
    const newValue = update.newValue;
    if (oldValue === null || oldValue === undefined || oldValue === '') continue;
    const key = mapping.fields.find((candidate) => (
      snapshot[candidate] !== null && snapshot[candidate] !== undefined && snapshot[candidate] !== ''
    ));
    if (!key) continue;
    const current = String(snapshot[key]).trim().toLowerCase();
    const future = String(newValue ?? '').trim().toLowerCase();
    if (future && current !== future) continue;
    snapshot[key] = oldValue;
  }
  return snapshot;
}

const businessSnapshotMappings = [
  { pattern: /\boperating\b.*\baddress\b|\bphysical\b.*\baddress\b/i, fields: ['operatingAddress', 'physicalOperatingAddress', 'address'] },
  { pattern: /\bmailing\b.*\baddress\b/i, fields: ['mailingAddress'] },
  { pattern: /\bregistered[- ]agent\b.*\baddress\b/i, fields: ['registeredAgentAddress'] },
  { pattern: /\bphone\b/i, fields: ['phone', 'businessPhone'] },
  { pattern: /\bemail\b/i, fields: ['email', 'businessEmail'] },
  { pattern: /\bwebsite\b/i, fields: ['website'] },
  { pattern: /\bdba\b/i, fields: ['dba'] },
  { pattern: /\bentity\b.*\btype\b/i, fields: ['entityType'] },
];

const ownerSnapshotMappings = [
  { pattern: /\b(?:residential|personal)\b.*\baddress\b/i, fields: ['currentResidentialAddress', 'residentialAddress'] },
  { pattern: /\b(?:personal|owner)\b.*\bphone\b/i, fields: ['personalPhone'] },
  { pattern: /\b(?:personal|owner)\b.*\bemail\b/i, fields: ['personalEmail'] },
  { pattern: /\bownership\b/i, fields: ['ownershipPercentage', 'ownership'] },
  { pattern: /\b(?:owner|officer|control|guarantor)\b.*\b(?:title|role|status)\b/i, fields: ['businessTitle', 'role'] },
];

function rollbackFutureBusinessProfile(activeCase, source = {}) {
  const updates = (Array.isArray(source.profileUpdates) ? source.profileUpdates : [])
    .filter((update) => {
      const updateType = String(
        update.updateType ?? update.eventType ?? update.item ?? update.type ?? '',
      );
      return !/\b(owner|employee|personal|residential)\b/i.test(updateType);
    });
  return rollbackSnapshotFields(
    source,
    futureUpdates(activeCase, updates),
    businessSnapshotMappings,
  );
}

function sharedUpdateTargetsOwner(update = {}, owner = {}) {
  const suppliedTarget = update.ownerId
    ?? update.partyId
    ?? update.trainingId
    ?? update.person
    ?? update.ownerName;
  if (suppliedTarget) {
    return [
      owner.id,
      owner.trainingId,
      owner.fullLegalName,
      owner.name,
    ].some((value) => String(value ?? '').trim() === String(suppliedTarget).trim());
  }
  const updateType = String(
    update.updateType ?? update.eventType ?? update.item ?? update.type ?? '',
  );
  return /\b(owner|officer|control|guarantor|beneficial|personal|residential)\b/i.test(updateType);
}

function rollbackFutureOwner(activeCase, owner = {}, sharedUpdates = []) {
  const ownerUpdates = Array.isArray(owner.profileUpdates) ? owner.profileUpdates : [];
  const applicableShared = sharedUpdates.filter((update) => sharedUpdateTargetsOwner(update, owner));
  return rollbackSnapshotFields(
    owner,
    futureUpdates(activeCase, [...ownerUpdates, ...applicableShared]),
    ownerSnapshotMappings,
  );
}

function explicitProfile(activeCase, source = {}) {
  const legalName = safeRelationshipNote(
    source.legalName
    ?? source.businessName
    ?? source.name
    ?? activeCase.profile?.business
    ?? unavailable,
    unavailable,
  );
  const formationDate = safeRelationshipNote(source.formationDate ?? source.filingDate, unavailable);
  const customerSince = safeRelationshipNote(
    source.customerSince ?? activeCase.customer?.relationshipSince,
    unavailable,
  );
  const operatingAddress = safeRelationshipNote(
    source.operatingAddress ?? source.physicalOperatingAddress ?? source.address,
    unavailable,
  );
  const mailingAddress = safeRelationshipNote(source.mailingAddress, unavailable);
  const registeredAgentValue = source.registeredAgent;
  const registeredAgent = registeredAgentValue && typeof registeredAgentValue === 'object'
    ? registeredAgentValue
    : {
        name: source.registeredAgentName ?? registeredAgentValue ?? unavailable,
        address: source.registeredAgentAddress ?? unavailable,
      };
  const rawOperatingLocations = Array.isArray(source.operatingLocations)
    ? source.operatingLocations
    : operatingAddress === unavailable ? [] : [operatingAddress];
  const operatingLocations = safeRelationshipList(rawOperatingLocations);
  return {
    businessId: safeRelationshipNote(
      source.businessId ?? source.entityId ?? source.id,
      unavailable,
    ),
    legalName,
    dba: safeRelationshipNote(source.dba, unavailable),
    entityType: safeRelationshipNote(source.entityType, unavailable),
    maskedEin: safeRelationshipNote(source.maskedEin ?? source.ein, unavailable),
    formationDate,
    formationState: safeRelationshipNote(source.formationState ?? source.jurisdiction, unavailable),
    registrationFileNumber: safeRelationshipNote(
      source.registrationFileNumber ?? source.registrationId ?? source.registration,
      unavailable,
    ),
    standing: safeRelationshipNote(source.standing, unavailable),
    industry: safeRelationshipNote(source.industry, unavailable),
    naics: safeRelationshipNote(source.naics, unavailable),
    operatingAddress,
    mailingAddress,
    registeredAgent: {
      name: safeRelationshipNote(registeredAgent.name, unavailable),
      address: safeRelationshipNote(registeredAgent.address, unavailable),
    },
    phone: safeRelationshipNote(source.phone ?? source.businessPhone, unavailable),
    email: safeRelationshipNote(source.email ?? source.businessEmail, unavailable),
    website: safeRelationshipNote(source.website, unavailable),
    businessAge: formationDate === unavailable ? unavailable : relationshipLengthFrom(formationDate),
    customerSince,
    relationshipLength: customerSince === unavailable ? unavailable : relationshipLengthFrom(customerSince),
    operatingLocations,
    estimatedEmployeeCount: typeof (source.estimatedEmployeeCount ?? source.employeeCount) === 'number'
      ? (source.estimatedEmployeeCount ?? source.employeeCount)
      : safeRelationshipNote(source.estimatedEmployeeCount ?? source.employeeCount, unavailable),
    sourceChecked: safeRelationshipNote(
      source.sourceChecked ?? source.source,
      'Preserved business relationship record',
    ),
    dateChecked: asOfValue(
      activeCase,
      source.dateChecked ?? source.observed ?? activeCase.reportedDate ?? activeCase.opened,
      unavailable,
    ),
    registrationSearchCompleted: source.registrationSearchCompleted === true,
    onlineSearchCompleted: source.onlineSearchCompleted === true,
    ownerSearchCompleted: source.ownerSearchCompleted === true,
    licenseSearchCompleted: source.licenseSearchCompleted === true,
    licenseApplicable: typeof source.licenseApplicable === 'boolean'
      ? source.licenseApplicable
      : null,
  };
}

function normalizePreservedDevices(activeCase, records = [], fallbackPrefix = 'DEVICE-PRESERVED') {
  const byId = new Map();
  records
    .filter((item) => recordHasEvidenceAsOf(activeCase, [
      item.firstSeen,
      item.lastSeen,
      item.mostRecentSuccessfulLogin,
      item.time,
      item.date,
    ]))
    .forEach((item, index) => {
      const deviceId = safeRelationshipNote(
        item.deviceId ?? item.id ?? item.device,
        `${fallbackPrefix}-${index + 1}`,
      );
      const previous = byId.get(deviceId);
      const firstSeenCandidates = [previous?.firstSeen, item.firstSeen, item.time, item.date]
        .filter((value) => value && value !== unavailable && isOnOrBeforeCase(activeCase, value));
      const lastSeenCandidates = [
        previous?.lastSeen,
        item.lastSeen,
        item.mostRecentSuccessfulLogin,
        item.time,
        item.date,
      ].filter((value) => value && value !== unavailable && isOnOrBeforeCase(activeCase, value));
      const firstSeen = firstSeenCandidates
        .sort((left, right) => (timestamp(left) ?? Number.MAX_SAFE_INTEGER) - (timestamp(right) ?? Number.MAX_SAFE_INTEGER))[0]
        ?? unavailable;
      const lastSeen = lastSeenCandidates
        .sort((left, right) => (timestamp(right) ?? 0) - (timestamp(left) ?? 0))[0]
        ?? unavailable;
      byId.set(deviceId, {
        deviceName: safeRelationshipNote(
          item.deviceName ?? item.name ?? item.device ?? previous?.deviceName,
          'Relationship access device',
        ),
        deviceId,
        deviceType: safeRelationshipNote(
          item.deviceType ?? item.type ?? previous?.deviceType,
          unavailable,
        ),
        browserOrOperatingSystem: safeRelationshipNote(
          item.browserOrOperatingSystem
            ?? item.platform
            ?? [item.operatingSystem, item.browserSource].filter(Boolean).join(' · ')
            ?? previous?.browserOrOperatingSystem,
          unavailable,
        ),
        firstSeen: safeRelationshipNote(firstSeen, unavailable),
        lastSeen: safeRelationshipNote(lastSeen, unavailable),
        mostRecentSuccessfulLogin: asOfValue(
          activeCase,
          item.mostRecentSuccessfulLogin ?? previous?.mostRecentSuccessfulLogin,
          unavailable,
        ),
        trustStatus: safeRelationshipNote(item.trustStatus ?? previous?.trustStatus, unavailable),
        mfaMethod: safeRelationshipNote(
          item.mfaMethod ?? item.authentication ?? item.mfaStatus ?? item.method ?? previous?.mfaMethod,
          unavailable,
        ),
        linkedSession: safeRelationshipNote(
          item.linkedSession ?? item.session ?? previous?.linkedSession,
          unavailable,
        ),
      });
    });
  return [...byId.values()];
}

function normalizePreservedOwnerContacts(activeCase, records = []) {
  return records
    .filter((item) => isOnOrBeforeCase(
      activeCase,
      item.contactDateTime ?? item.contactDate ?? item.date,
    ))
    .map((item, index) => ({
      id: item.id ?? `OWNER-CONTACT-PRESERVED-${index + 1}`,
      contactDateTime: safeRelationshipNote(
        item.contactDateTime ?? item.contactDate ?? item.date,
        unavailable,
      ),
      channel: safeRelationshipNote(item.channel ?? item.contactChannel, unavailable),
      reasonForContact: safeRelationshipNote(
        item.reasonForContact ?? item.reason,
        'Relationship servicing contact',
      ),
      reportedInformation: safeRelationshipNote(
        item.reportedInformation ?? item.informationSupplied,
        'No neutral information was supplied in the preserved record.',
      ),
      assistanceProvided: safeRelationshipNote(
        item.assistanceProvided,
        'No neutral assistance detail was supplied in the preserved record.',
      ),
      documentsRequested: safeRelationshipNote(item.documentsRequested, 'No document request recorded'),
      followUpStatus: safeRelationshipNote(item.followUpStatus, unavailable),
      agentOrDepartment: safeRelationshipNote(item.agentOrDepartment ?? item.agent, unavailable),
      relatedAccountId: safeRelationshipNote(item.relatedAccountId ?? item.accountId, unavailable),
    }));
}

function explicitOwner(activeCase, profile, raw = {}, index = 0, fallback = {}) {
  const role = safeRelationshipNote(
    raw.businessTitle ?? raw.role ?? fallback.relationship,
    'Owner relationship recorded',
  );
  const ownership = safeRelationshipNote(
    raw.ownershipPercentage ?? raw.ownership ?? fallback.ownershipPercentage,
    unavailable,
  );
  const currentAddress = safeRelationshipNote(
    raw.currentResidentialAddress ?? raw.residentialAddress,
    unavailable,
  );
  const previousAddress = safeRelationshipNote(
    raw.previousResidentialAddress ?? raw.previousAddress,
    unavailable,
  );
  const ownerName = safeRelationshipNote(raw.fullLegalName ?? raw.name, unavailable);
  const ownerAccounts = Array.isArray(raw.accounts) && raw.accounts.length
    ? getRelationshipAccounts({
        customerType: CUSTOMER_TYPES.PERSONAL,
        productType: raw.accounts[0]?.productType ?? PRODUCT_TYPES.DEPOSIT_ACCOUNT,
        toolResults: { relationshipAccounts: raw.accounts },
      })
    : [];
  const comparison = currentAddress === unavailable
    ? 'Address comparison was unavailable.'
    : currentAddress === profile.mailingAddress
      ? 'Owner residential address matches the business mailing address.'
      : currentAddress === profile.operatingAddress
        ? 'Owner residential address matches the business operating address.'
        : profile.mailingAddress === unavailable && profile.operatingAddress === unavailable
          ? 'Address comparison was unavailable.'
          : 'Owner residential address differs from the business operating and mailing addresses.';
  return {
    id: raw.id ?? fallback.id ?? `OWNER-PRESERVED-${index + 1}`,
    fullLegalName: ownerName,
    dateOfBirth: safeRelationshipNote(raw.dateOfBirth ?? raw.dob, unavailable),
    trainingId: safeRelationshipNote(raw.trainingId, unavailable),
    ownershipPercentage: ownership,
    businessTitle: role,
    officerStatus: safeRelationshipNote(
      raw.officerStatus,
      /officer|president|chief/i.test(role) ? 'Officer on file' : unavailable,
    ),
    controllingPartyStatus: safeRelationshipNote(
      raw.controllingPartyStatus,
      /control|managing|owner/i.test(role) ? 'Controlling-party relationship on file' : unavailable,
    ),
    guarantorStatus: safeRelationshipNote(
      raw.guarantorStatus,
      /guarantor/i.test(role) ? 'Personal guarantor on file' : unavailable,
    ),
    currentResidentialAddress: currentAddress,
    previousResidentialAddress: previousAddress,
    personalPhone: safeRelationshipNote(raw.personalPhone, unavailable),
    personalEmail: safeRelationshipNote(raw.personalEmail, unavailable),
    identityVerificationStatus: safeRelationshipNote(
      raw.identityVerificationStatus ?? raw.verificationStatus,
      unavailable,
    ),
    addressVerificationStatus: safeRelationshipNote(raw.addressVerificationStatus, unavailable),
    ownerSince: safeRelationshipNote(raw.ownerSince ?? fallback.relationshipSince, unavailable),
    addressComparison: comparison,
    accounts: ownerAccounts,
    trustedDevices: normalizePreservedDevices(
      activeCase,
      Array.isArray(raw.trustedDevices) ? raw.trustedDevices : [],
      `OWNER-${index + 1}-DEVICE`,
    ),
    contactHistory: normalizePreservedOwnerContacts(
      activeCase,
      Array.isArray(raw.contactHistory) ? raw.contactHistory : [],
    ),
  };
}

function emptyAccess(activeCase, suppliedUpdates = profileUpdates(activeCase)) {
  const resets = suppliedUpdates
    .filter((item) => /password|access|administrator|permission/i.test(item.updateType));
  return {
    authorizedUsers: [],
    trustedDevices: [],
    passwordOrAccessResets: resets,
  };
}

function normalizePreservedAccess(activeCase, raw = {}) {
  const usersById = new Map();
  (Array.isArray(raw.authorizedUsers) ? raw.authorizedUsers : [])
    .forEach((item, index) => {
      const user = item && typeof item === 'object' ? item : { name: item };
      const id = user.id ?? `BUSINESS-USER-PRESERVED-${index + 1}`;
      usersById.set(id, {
        id,
        name: safeRelationshipNote(user.name, 'Authorized business user'),
        role: safeRelationshipNote(user.role, 'Authorized user'),
        permissions: safeRelationshipNote(user.permissions, unavailable),
        mfaMethod: safeRelationshipNote(user.mfaMethod, unavailable),
        lastSuccessfulLogin: asOfValue(activeCase, user.lastSuccessfulLogin, unavailable),
      });
    });

  const resetsById = new Map();
  (Array.isArray(raw.passwordOrAccessResets) ? raw.passwordOrAccessResets : [])
    .map((item) => (item && typeof item === 'object' ? item : { updateType: item }))
    .filter((item) => isOnOrBeforeCase(
      activeCase,
      item.dateTime ?? item.date ?? item.observed,
    ))
    .forEach((item, index) => {
      const id = item.id ?? `BUSINESS-ACCESS-UPDATE-PRESERVED-${index + 1}`;
      resetsById.set(id, {
        id,
        updateType: safeRelationshipNote(
          item.updateType ?? item.eventType ?? item.type,
          'Business access maintenance',
        ),
        previousValue: safeRelationshipNote(item.previousValue ?? item.oldValue, unavailable),
        newValue: safeRelationshipNote(item.newValue, unavailable),
        dateTime: safeRelationshipNote(
          item.dateTime ?? item.date ?? item.observed,
          unavailable,
        ),
        channel: safeRelationshipNote(item.channel, unavailable),
        source: safeRelationshipNote(item.source, 'Business relationship record'),
        user: safeRelationshipNote(item.user, unavailable),
        linkedSession: safeRelationshipNote(item.linkedSession ?? item.session, unavailable),
        linkedDevice: safeRelationshipNote(item.linkedDevice ?? item.device, unavailable),
      });
    });

  return {
    authorizedUsers: [...usersById.values()],
    trustedDevices: normalizePreservedDevices(
      activeCase,
      Array.isArray(raw.trustedDevices) ? raw.trustedDevices : [],
      'BUSINESS-DEVICE-PRESERVED',
    ),
    passwordOrAccessResets: [...resetsById.values()],
  };
}

function hasPreservedAccountEvidence(activeCase = {}) {
  if (Array.isArray(activeCase.toolResults?.relationshipAccounts)
    && activeCase.toolResults.relationshipAccounts.length) return true;
  if (Array.isArray(activeCase.relationshipAccounts)
    && activeCase.relationshipAccounts.length) return true;
  if (activeCase.account && typeof activeCase.account === 'object'
    && Object.values(activeCase.account).some((value) => value !== null && value !== undefined && value !== '')) {
    return true;
  }
  return [
    'accountId',
    'accountOpenDate',
    'accountStatus',
    'currentBalance',
    'availableBalance',
    'availableCredit',
    'creditLimit',
    'originalLoanAmount',
    'scheduledPayment',
    'nextPaymentDueDate',
    'paymentStatus',
    'pastDueAmount',
    'restrictions',
    'holds',
  ].some((field) => activeCase[field] !== null
    && activeCase[field] !== undefined
    && activeCase[field] !== '');
}

function suppliedNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function suppliedPayrollMonth(run = {}) {
  const source = String(run.month ?? run.processedDate ?? run.period ?? '').trim();
  const iso = source.match(/\b((?:19|20)\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const named = source.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b.*\b((?:19|20)\d{2})\b/i);
  if (!named) return null;
  const month = [
    'jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  ].indexOf(named[1].slice(0, 3).toLowerCase()) + 1;
  return `${named[2]}-${String(month).padStart(2, '0')}`;
}

function preservedPayrollRelationship(activeCase, source, access, accounts = []) {
  const payrollAccount = accounts.find((account) => (
    account.productType === PRODUCT_TYPES.PAYROLL_PRODUCT
    || account.productKind === 'payroll-account'
  ));
  const supplied = source.payrollRelationship && typeof source.payrollRelationship === 'object'
    ? source.payrollRelationship
    : null;
  const allRuns = Array.isArray(activeCase.toolResults?.payrollHistory)
    ? newestPayrollRuns(activeCase.toolResults.payrollHistory.filter((run) => {
        const observed = payrollRunTimestamp(run);
        const asOf = caseAsOf(activeCase);
        return asOf === null || observed === null || observed <= asOf;
      }))
    : [];
  if (!allRuns.length && supplied) {
    return {
      payrollAccountStatus: safeRelationshipNote(
        payrollAccount?.status ?? supplied.payrollAccountStatus,
        unavailable,
      ),
      payrollCustomerSince: asOfValue(
        activeCase,
        payrollAccount?.openDate ?? supplied.payrollCustomerSince,
        unavailable,
      ),
      paySchedule: safeRelationshipNote(supplied.paySchedule, unavailable),
      nextScheduledPayroll: safeRelationshipNote(supplied.nextScheduledPayroll, unavailable),
      activeEmployeeCount: typeof supplied.activeEmployeeCount === 'number'
        ? supplied.activeEmployeeCount
        : safeRelationshipNote(supplied.activeEmployeeCount, unavailable),
      lastCompletedPayrollDate: asOfValue(
        activeCase,
        supplied.lastCompletedPayrollDate,
        unavailable,
      ),
      lastPayrollAmount: safeRelationshipNote(supplied.lastPayrollAmount, unavailable),
      averageMonthlyPayroll: safeRelationshipNote(supplied.averageMonthlyPayroll, unavailable),
      payrollFundingStatus: safeRelationshipNote(supplied.payrollFundingStatus, unavailable),
      payrollAdministrator: safeRelationshipNote(supplied.payrollAdministrator, unavailable),
      authorizedPayrollUsers: Array.isArray(supplied.authorizedPayrollUsers)
        ? safeRelationshipList(supplied.authorizedPayrollUsers)
        : [],
      employerTaxProfileStatus: safeRelationshipNote(supplied.employerTaxProfileStatus, unavailable),
    };
  }
  if (!allRuns.length) return null;

  const runs = newestPayrollRuns(allRuns.filter(isCompletedPayrollRun));

  const rowsWithTotals = runs
    .map((run) => ({
      run,
      amount: suppliedNumber(run.totalCompanyDebit, run.companyDebit, run.fundingAmount),
      month: suppliedPayrollMonth(run),
    }))
    .filter((row) => row.amount !== null);
  const monthTotals = new Map();
  for (const row of rowsWithTotals) {
    if (!row.month) continue;
    monthTotals.set(row.month, (monthTotals.get(row.month) ?? 0) + row.amount);
  }
  const monthlyValues = [...monthTotals.values()];
  const lastRun = runs[0] ?? {};
  const lastAmount = suppliedNumber(
    lastRun.totalCompanyDebit,
    lastRun.companyDebit,
    lastRun.fundingAmount,
  );
  const employeeCount = suppliedNumber(lastRun.employeeCount, lastRun.activeEmployeeCount);
  const payrollUsers = access.authorizedUsers
    .filter((user) => /payroll|administrator|approver|initiator/i.test(user.role ?? ''))
    .map((user) => user.name);
  const suppliedPayrollUsers = Array.isArray(supplied?.authorizedPayrollUsers)
    ? safeRelationshipList(supplied.authorizedPayrollUsers)
    : [];

  return {
    payrollAccountStatus: safeRelationshipNote(
      payrollAccount?.status
        ?? source.payrollAccountStatus
        ?? supplied?.payrollAccountStatus
        ?? (activeCase.productType === PRODUCT_TYPES.PAYROLL_PRODUCT
          ? activeCase.accountStatus
          : null),
      unavailable,
    ),
    payrollCustomerSince: safeRelationshipNote(
      payrollAccount?.openDate
        ?? source.payrollCustomerSince
        ?? source.customerSince
        ?? supplied?.payrollCustomerSince
        ?? activeCase.customer?.relationshipSince,
      unavailable,
    ),
    paySchedule: safeRelationshipNote(
      lastRun.paySchedule ?? source.paySchedule ?? supplied?.paySchedule,
      unavailable,
    ),
    nextScheduledPayroll: safeRelationshipNote(
      lastRun.nextScheduledPayroll
        ?? source.nextScheduledPayroll
        ?? supplied?.nextScheduledPayroll,
      unavailable,
    ),
    activeEmployeeCount: employeeCount ?? unavailable,
    lastCompletedPayrollDate: safeRelationshipNote(
      lastRun.processedDate ?? lastRun.period,
      unavailable,
    ),
    lastPayrollAmount: lastAmount === null ? unavailable : formatMoney(lastAmount),
    averageMonthlyPayroll: monthlyValues.length
      ? formatMoney(monthlyValues.reduce((sum, value) => sum + value, 0) / monthlyValues.length)
      : unavailable,
    payrollFundingStatus: safeRelationshipNote(
      lastRun.fundingStatus ?? lastRun.runStatus ?? lastRun.status,
      unavailable,
    ),
    payrollAdministrator: safeRelationshipNote(
      source.payrollAdministrator
        ?? access.authorizedUsers.find((user) => /payroll administrator/i.test(user.role ?? ''))?.name
        ?? supplied?.payrollAdministrator,
      unavailable,
    ),
    authorizedPayrollUsers: payrollUsers.length ? payrollUsers : suppliedPayrollUsers,
    employerTaxProfileStatus: safeRelationshipNote(
      source.employerTaxProfileStatus ?? supplied?.employerTaxProfileStatus,
      unavailable,
    ),
  };
}

function explicitBusinessDossier(activeCase, source, { relationship } = {}) {
  const linkedProfileUpdates = Array.isArray(source.profileUpdates) ? source.profileUpdates : [];
  const dossierCase = relationship
    ? {
        ...activeCase,
        profile: {},
        customer: {},
        businessProfile: { profileUpdates: linkedProfileUpdates },
        parties: [],
        account: null,
        accountId: null,
        relationshipAccounts: [],
        toolResults: {
          payrollHistory: source.toolResults?.payrollHistory ?? source.payrollHistory ?? [],
        },
        productType: source.productType,
        accountStatus: source.accountStatus,
        legacyDerivedEvidence: true,
      }
    : activeCase;
  const snapshotSource = rollbackFutureBusinessProfile(dossierCase, source);
  const profile = explicitProfile(dossierCase, snapshotSource);
  const sharedOwnerUpdates = Array.isArray(source.profileUpdates) ? source.profileUpdates : [];
  const rawOwners = Array.isArray(snapshotSource.owners)
    ? snapshotSource.owners
    : relationship
      ? [relationship]
      : (dossierCase.parties ?? []).filter((party) => /owner|control/i.test(party.role ?? ''));
  const owners = rawOwners
    .filter((owner) => isOnOrBeforeCase(
      dossierCase,
      owner.ownerSince ?? owner.relationshipSince,
    ))
    .map((owner, index) => explicitOwner(
      dossierCase,
      profile,
      rollbackFutureOwner(dossierCase, owner, sharedOwnerUpdates),
      index,
      relationship ?? {},
    ));
  const accountSource = snapshotSource.accounts ?? snapshotSource.products ?? [];
  const sourceAccounts = Array.isArray(accountSource) && accountSource.length
    ? getRelationshipAccounts({
        customerType: CUSTOMER_TYPES.BUSINESS,
        productType: accountSource[0]?.productType ?? PRODUCT_TYPES.BUSINESS_ACCOUNT,
        toolResults: { relationshipAccounts: accountSource },
      })
    : [];
  const accounts = relationship
    ? sourceAccounts
    : hasPreservedAccountEvidence(dossierCase)
      ? getRelationshipAccounts(dossierCase)
      : sourceAccounts;
  const sourceAccess = snapshotSource.access && typeof snapshotSource.access === 'object'
    ? snapshotSource.access
    : {
        authorizedUsers: snapshotSource.authorizedUsers,
        trustedDevices: snapshotSource.trustedDevices,
        passwordOrAccessResets: snapshotSource.passwordOrAccessResets,
      };
  const hasSourceAccess = ['authorizedUsers', 'trustedDevices', 'passwordOrAccessResets']
    .some((field) => Array.isArray(sourceAccess[field]));
  const dossierProfileUpdates = profileUpdates(dossierCase);
  const access = hasSourceAccess
    ? normalizePreservedAccess(dossierCase, sourceAccess)
    : emptyAccess(dossierCase, dossierProfileUpdates);
  return {
    profile,
    owners,
    accounts,
    profileUpdates: dossierProfileUpdates,
    access,
    contactNotes: Array.isArray(snapshotSource.contactHistory)
      ? snapshotSource.contactHistory
          .filter((item) => isOnOrBeforeCase(
            dossierCase,
            item.contactDate ?? item.contactDateTime ?? item.date,
          ))
          .map((item, index) => normalizeContactNote(dossierCase, item, index))
      : [],
    payrollRelationship: preservedPayrollRelationship(
      dossierCase,
      snapshotSource,
      access,
      accounts,
    ),
    researchChecks: researchChecks(profile, owners),
    coverageNotice: 'Only business relationship fields preserved in the saved record are shown; missing fields were not synthesized.',
  };
}

function linkedBusiness(activeCase, relationshipId) {
  if (!relationshipId) return null;
  const relationships = [
    ...(activeCase.customer?.businessRelationships ?? []),
    ...(activeCase.businessRelationships ?? []),
    ...(activeCase.linkedBusinesses ?? []),
    ...(activeCase.relationships ?? []),
  ];
  return relationships.find((item) => (
    String(item.businessId ?? item.entityId ?? item.id) === String(relationshipId)
  )) ?? null;
}

function businessRelationshipMatchesProfile(relationship, sourceProfile) {
  if (!relationship) return false;
  const relationshipId = String(
    relationship.businessId ?? relationship.entityId ?? relationship.id ?? '',
  ).trim();
  const profileId = String(sourceProfile.businessId ?? '').trim();
  if (relationshipId && profileId && relationshipId === profileId) return true;
  const relationshipName = relationship.businessName
    ?? relationship.legalName
    ?? relationship.name;
  return Boolean(
    businessNameKey(relationshipName)
    && businessNameKey(relationshipName) === businessNameKey(sourceProfile.legalName),
  );
}

function relationshipAccountProduct(account = {}) {
  const product = String(account.product ?? account.productLabel ?? '').toLowerCase();
  if (/payroll/.test(product)) {
    return {
      productType: PRODUCT_TYPES.PAYROLL_PRODUCT,
      productKind: 'payroll-account',
    };
  }
  if (/credit card/.test(product)) {
    return {
      productType: PRODUCT_TYPES.BUSINESS_CREDIT_CARD,
      productKind: 'business-credit-card',
    };
  }
  if (/loan|line|revolving credit/.test(product)) {
    return {
      productType: PRODUCT_TYPES.BUSINESS_LOAN,
      productKind: /line|revolving/.test(product)
        ? 'revolving-credit-line'
        : 'business-installment-loan',
    };
  }
  return {
    productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
    productKind: /saving|reserve/.test(product)
      ? 'business-savings'
      : 'business-checking',
  };
}

function suppliedMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  if (/not (?:available|applicable|supplied|recorded)/i.test(String(value))) return null;
  return /-?\d/.test(String(value)) ? moneyNumber(value) : null;
}

function canonicalBusinessAccounts(sourceProfile = {}) {
  const relationshipAccounts = Array.isArray(sourceProfile.relationshipAccounts)
    ? sourceProfile.relationshipAccounts
    : [];
  if (!relationshipAccounts.length) return [];
  return getRelationshipAccounts({
    customerType: CUSTOMER_TYPES.BUSINESS,
    productType: PRODUCT_TYPES.BUSINESS_ACCOUNT,
    toolResults: {
      relationshipAccounts: relationshipAccounts.map((account, index) => {
        const product = relationshipAccountProduct(account);
        const currentBalance = suppliedMoney(account.balance ?? account.currentBalance);
        return {
          accountId: account.id ?? account.accountId,
          destinationId: account.destinationId ?? account.id ?? account.accountId,
          bankCode: account.bankCode,
          productType: product.productType,
          productKind: product.productKind,
          productLabel: account.product ?? account.productLabel ?? 'Business relationship account',
          openDate: account.openDate ?? sourceProfile.relationshipStartDate,
          status: account.status,
          currentBalance,
          availableBalance: product.productType === PRODUCT_TYPES.BUSINESS_ACCOUNT
            ? currentBalance
            : null,
          availableCredit: account.availableCredit ?? null,
          creditLimit: account.creditLimit ?? null,
          originalLoanAmount: account.originalLoanAmount ?? null,
          scheduledPayment: account.scheduledPayment ?? null,
          nextPaymentDueDate: account.nextPaymentDueDate ?? null,
          paymentStatus: account.paymentStatus ?? 'Not applicable',
          pastDueAmount: account.pastDueAmount ?? null,
          restrictions: account.restrictions,
          holds: account.holds,
          relationshipLimit: account.limit,
          nsfContext: account.nsfContext,
          repaymentSource: account.repaymentSource,
          isPrimary: index === 0,
        };
      }),
    },
  });
}

export function getBusiness360Dossier(activeCase = {}, { relationshipId } = {}) {
  const relationship = linkedBusiness(activeCase, relationshipId);
  if (activeCase.legacyDerivedEvidence === true && relationship) {
    return explicitBusinessDossier(activeCase, {
      ...relationship,
      legalName: relationship.businessName ?? relationship.legalName ?? relationship.name,
    }, { relationship });
  }
  if (activeCase.legacyDerivedEvidence === true) {
    return explicitBusinessDossier(activeCase, activeCase.businessProfile ?? {});
  }
  const kyb = getKybReview(activeCase);
  if (relationship && !businessRelationshipMatchesProfile(relationship, kyb.profile)) {
    return explicitBusinessDossier(activeCase, {
      ...relationship,
      legalName: relationship.businessName ?? relationship.legalName ?? relationship.name,
    }, { relationship });
  }
  let profile = normalizeProfile(activeCase, kyb.profile);
  const parties = buildCaseParties(activeCase);
  const owners = (kyb.profile.owners ?? []).map((owner, index) => ownerFromRecord(activeCase, profile, owner, index, parties));
  const ownerNames = new Set(owners.map((owner) => owner.fullLegalName.toLowerCase()));
  const scopedParties = activeCase.customerType === CUSTOMER_TYPES.BUSINESS
    ? parties
    : parties.filter((party) => ownerNames.has(String(party.name ?? '').toLowerCase()));
  const businessParties = scopedParties.length
    ? scopedParties
    : owners.map((owner) => ({
        id: owner.id,
        name: owner.fullLegalName,
        role: owner.businessTitle,
      }));
  const access = accessRecords(activeCase, businessParties, owners);
  const accounts = activeCase.customerType === CUSTOMER_TYPES.BUSINESS
    ? getRelationshipAccounts(activeCase)
    : canonicalBusinessAccounts(kyb.profile);
  const payroll = payrollRelationship(activeCase, profile, access, accounts);
  if (payroll && Number.isFinite(Number(payroll.activeEmployeeCount))) {
    profile = { ...profile, estimatedEmployeeCount: Number(payroll.activeEmployeeCount) };
  }
  return {
    profile,
    owners,
    accounts,
    profileUpdates: profileUpdates(activeCase),
    access,
    contactNotes: contactNotes(activeCase, profile, businessParties),
    payrollRelationship: payroll,
    researchChecks: researchChecks(profile, owners),
  };
}
