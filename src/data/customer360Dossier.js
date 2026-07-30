import {
  getPersistedRelationshipAccounts,
  relationshipLengthFrom,
} from './relationshipAccounts.js';
import { containsHiddenAnswer } from './publicCaseView.js';

const unavailable = 'Not available in the current training record';
const imperativeDecisionLanguage = /^\s*(?:approve|deny|hold|release|restrict|reduce|support|do not support|escalate|maintain|request more information)\b/i;

const builtInProfiles = {
  'FA-ATO-24018': {
    identity: {
      legalName: 'Maya Sterling',
      preferredName: 'Maya',
      dob: 'Feb 14, 1988',
      age: '38',
      language: 'English',
      currentAddress: '1842 Cedar Avenue, Dallas, TX 75201 (training)',
      previousAddress: '721 Willow Training Road, Irving, TX 75039 (training)',
      mobilePhone: '(214) 555-0184',
      homePhone: '(214) 555-0112',
      email: 'maya.training@example.test',
      customerSince: 'Jul 16, 2018',
      segment: 'Personal checking and savings',
      preferredContact: 'Secure message',
      verificationStatus: 'Identity verified',
      verificationMethod: 'Fictional CIP identity and address records',
      lastVerified: 'Jun 29, 2026',
      accountStanding: 'Open — Good Standing',
    },
    relationship: {
      normalDeposits: 'Payroll deposits between $3,700 and $3,950 twice monthly',
      normalSpending: 'Groceries, fuel, utilities, and card purchases averaging $2,860 monthly',
      authorizedUsers: 'No additional checking signer recorded',
      digitalBanking: 'Online and mobile banking enrolled',
    },
    security: {
      mfaStatus: 'Face ID and password; mobile OTP available',
      passwordChanged: 'Mar 4, 2026 · customer self-service',
      lockouts: 'No account lockout in the supplied servicing history',
      alerts: 'Security alerts route to the recorded mobile phone and primary email',
      recoveryContact: '(214) 555-0184 · maya.training@example.test',
      trustedDevices: [
        {
          id: 'DEV-MAYA-IP16-001',
          name: 'Maya’s trusted phone',
          type: 'Mobile phone',
          platform: 'iOS · mobile app',
          firstSeen: 'Jan 18, 2026',
          lastSeen: 'Jun 29, 2026',
          trustStatus: 'Trusted',
          authentication: 'Face ID',
        },
      ],
    },
    serviceContacts: [
      {
        id: 'SVC-1001',
        dateTime: 'Jun 29, 2026 · 3:14 PM',
        type: 'Contact verification',
        channel: 'Mobile app',
        outcome: 'Existing phone and email confirmed',
        agent: 'Customer self-service',
        notes: 'The recorded contact values were retained without a change.',
        relatedAccountId: 'ACCT-24018-4410',
      },
      {
        id: 'SVC-1002',
        dateTime: 'Mar 4, 2026 · 7:42 PM',
        type: 'Password service',
        channel: 'Online banking',
        outcome: 'Password updated',
        agent: 'Customer self-service',
        notes: 'The profile recorded a completed password update.',
        relatedAccountId: 'ACCT-24018-4410',
      },
      {
        id: 'SVC-1003',
        dateTime: 'Jan 18, 2026 · 1:26 PM',
        type: 'Debit card servicing',
        channel: 'Phone',
        outcome: 'Replacement card activated',
        agent: 'Card servicing',
        notes: 'The replacement card was activated on the existing checking relationship.',
        relatedAccountId: 'CARD-24018-4410',
      },
    ],
  },
  'FA-CB-24007': {
    identity: {
      legalName: 'Jordan Ellis',
      preferredName: 'Jordan',
      dob: 'Nov 3, 1991',
      age: '34',
      language: 'English',
      currentAddress: '5510 Magnolia Way, Fort Worth, TX 76102 (training)',
      previousAddress: '407 Juniper Training Street, Arlington, TX 76010 (training)',
      mobilePhone: '(817) 555-0149',
      homePhone: 'No separate home phone recorded',
      email: 'jordan.training@example.test',
      customerSince: 'Sep 9, 2021',
      segment: 'Personal cardholder',
      preferredContact: 'Mobile app',
      verificationStatus: 'Identity verified',
      verificationMethod: 'Fictional CIP identity and address records',
      lastVerified: 'Jun 21, 2026',
      accountStanding: 'Open — Good Standing',
    },
    relationship: {
      normalDeposits: 'Not applicable to the card-only relationship',
      normalSpending: 'Recurring services and household purchases averaging $1,120 monthly',
      authorizedUsers: 'No authorized user recorded',
      digitalBanking: 'Online and mobile card servicing enrolled',
    },
    security: {
      mfaStatus: 'Password and biometric sign-in; mobile OTP available',
      passwordChanged: 'Feb 17, 2026 · customer self-service',
      lockouts: 'No account lockout in the supplied servicing history',
      alerts: 'Billing and security alerts route to the primary email',
      recoveryContact: '(817) 555-0149 · jordan.training@example.test',
      trustedDevices: [
        {
          id: 'DEV-JORDAN-AND-001',
          name: 'Jordan’s trusted phone',
          type: 'Mobile phone',
          platform: 'Android · mobile app',
          firstSeen: 'Oct 14, 2023',
          lastSeen: 'Jun 21, 2026',
          trustStatus: 'Trusted',
          authentication: 'Biometric',
        },
        {
          id: 'DEV-JORDAN-DSK-002',
          name: 'Jordan’s trusted computer',
          type: 'Computer',
          platform: 'Desktop browser',
          firstSeen: 'Feb 2, 2024',
          lastSeen: 'Jun 24, 2026',
          trustStatus: 'Trusted',
          authentication: 'Password + OTP',
        },
      ],
    },
    serviceContacts: [
      {
        id: 'SVC-2201',
        dateTime: 'Jun 21, 2026 · 11:14 AM',
        type: 'Contact verification',
        channel: 'Online profile',
        outcome: 'Existing contact points confirmed',
        agent: 'Customer self-service',
        notes: 'The mobile phone and primary email were retained without a change.',
        relatedAccountId: 'CARD-24007-8841',
      },
      {
        id: 'SVC-2202',
        dateTime: 'Feb 17, 2026 · 8:06 PM',
        type: 'Password service',
        channel: 'Online banking',
        outcome: 'Password updated',
        agent: 'Customer self-service',
        notes: 'The profile recorded a completed password update.',
        relatedAccountId: 'CARD-24007-8841',
      },
    ],
  },
  'FA-CR-24003': {
    identity: {
      legalName: 'Avery Brooks',
      preferredName: 'Avery',
      dob: 'Jun 22, 1995',
      age: '31',
      language: 'English',
      currentAddress: '2044 Meadow Lane, Arlington, TX 76010 (training)',
      previousAddress: '815 Lakeview Training Drive, Dallas, TX 75201 (training)',
      mobilePhone: '(682) 555-0167',
      homePhone: 'No separate home phone recorded',
      email: 'avery.training@example.test',
      customerSince: 'Jul 7, 2026',
      segment: 'Personal credit relationship',
      preferredContact: 'Email',
      verificationStatus: 'Identity verification completed',
      verificationMethod: 'Fictional onboarding identity and address records',
      lastVerified: 'Jul 7, 2026',
      accountStanding: 'Open — Limited History',
    },
    relationship: {
      normalDeposits: 'No established deposit baseline',
      normalSpending: 'No established spending baseline',
      authorizedUsers: 'No authorized user recorded',
      digitalBanking: 'Online banking enrolled',
    },
    security: {
      mfaStatus: 'Email code enrolled during profile creation',
      passwordChanged: 'Jul 7, 2026 · initial password setup',
      lockouts: 'No account lockout in the supplied servicing history',
      alerts: 'Profile and security alerts route to the primary email',
      recoveryContact: '(682) 555-0167 · avery.training@example.test',
      trustedDevices: [
        {
          id: 'DEV-AVERY-SAF-001',
          name: 'Avery’s enrolled phone',
          type: 'Mobile phone',
          platform: 'iOS · Mobile Safari',
          firstSeen: 'Jul 7, 2026',
          lastSeen: 'Jul 7, 2026',
          trustStatus: 'Trusted during onboarding',
          authentication: 'Email code',
        },
      ],
    },
    serviceContacts: [
      {
        id: 'SVC-3301',
        dateTime: 'Jul 7, 2026 · 5:18 PM',
        type: 'New relationship confirmation',
        channel: 'Email',
        outcome: 'Email and recovery phone verified',
        agent: 'Digital onboarding',
        notes: 'The customer profile and recovery contact were established.',
        relatedAccountId: 'LINE-24003-3011',
      },
      {
        id: 'SVC-3302',
        dateTime: 'Jul 7, 2026 · 5:05 PM',
        type: 'Digital profile enrollment',
        channel: 'Mobile web',
        outcome: 'Online profile created',
        agent: 'Digital onboarding',
        notes: 'A new digital-banking profile was created for the customer relationship.',
        relatedAccountId: 'LINE-24003-3011',
      },
    ],
  },
};

function safeRecordText(value, fallback = unavailable) {
  const text = String(value ?? '').trim();
  if (!text || containsHiddenAnswer(text) || imperativeDecisionLanguage.test(text)) return fallback;
  return text;
}

function firstSupplied(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim());
}

function dateOnlyTimestamp(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const dateToken = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0]
    ?? text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}\b/i)?.[0]
    ?? text.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0];
  if (!dateToken) return null;
  const parsed = new Date(dateToken);
  if (Number.isNaN(parsed.getTime())) return null;
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

function profileUpdateIsAvailableAsOf(event, activeCase) {
  const asOf = dateOnlyTimestamp(activeCase.reportedDate)
    ?? dateOnlyTimestamp(activeCase.opened);
  if (asOf === null) return true;
  const observed = dateOnlyTimestamp(event.date ?? event.dateTime ?? event.observed);
  return observed !== null && observed <= asOf;
}

function recordDateIsAvailableAsOf(value, activeCase) {
  const asOf = dateOnlyTimestamp(activeCase.reportedDate)
    ?? dateOnlyTimestamp(activeCase.opened);
  if (asOf === null) return true;
  const observed = dateOnlyTimestamp(value);
  return observed === null || observed <= asOf;
}

function asOfText(value, activeCase, fallback = unavailable) {
  return recordDateIsAvailableAsOf(value, activeCase)
    ? safeRecordText(value, fallback)
    : fallback;
}

function currentIntakeChannels(activeCase) {
  return [
    activeCase.intake?.channel,
    activeCase.statement?.source,
  ]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
}

function generatedProfileEventUsesIntake(event, activeCase) {
  if (!/generated (?:profile history|security profile)/i.test(String(event.source ?? ''))) return false;
  const channels = currentIntakeChannels(activeCase);
  if (!channels.length) return false;
  const eventText = [
    event.channel,
    event.oldValue,
    event.newValue,
    event.detail,
    event.notes,
  ].filter(Boolean).join(' ').toLowerCase();
  return channels.some((channel) => eventText.includes(channel.toLowerCase()));
}

function nonIntakeText(value, activeCase, fallback = unavailable) {
  const text = safeRecordText(value, fallback);
  if (text === fallback) return fallback;
  return currentIntakeChannels(activeCase)
    .some((channel) => text.toLowerCase().includes(channel.toLowerCase()))
    ? fallback
    : text;
}

function stableNumber(value = '') {
  return [...String(value)].reduce(
    (total, character) => ((total * 31) + character.charCodeAt(0)) % 100000,
    17,
  );
}

function suppliedIdentity(activeCase) {
  const identity = activeCase.customer?.identity
    ?? activeCase.identity
    ?? activeCase.profile?.identity
    ?? {};
  const contact = activeCase.customer?.contact ?? {};
  const legalName = safeRecordText(firstSupplied(identity.legalName, activeCase.person));
  return {
    legalName,
    preferredName: safeRecordText(identity.preferredName),
    dob: safeRecordText(firstSupplied(identity.dob, identity.dateOfBirth)),
    age: safeRecordText(identity.age),
    language: safeRecordText(identity.language),
    currentAddress: safeRecordText(firstSupplied(
      identity.currentAddress,
      identity.physicalAddress,
      contact.address,
    )),
    previousAddress: safeRecordText(identity.previousAddress),
    mobilePhone: safeRecordText(firstSupplied(identity.mobilePhone, identity.phone, contact.phone)),
    homePhone: safeRecordText(identity.homePhone),
    email: safeRecordText(firstSupplied(identity.email, contact.email)),
    customerSince: safeRecordText(firstSupplied(
      identity.customerSince,
      activeCase.customer?.relationshipSince,
    )),
    segment: safeRecordText(firstSupplied(identity.segment, activeCase.customer?.segment)),
    preferredContact: nonIntakeText(firstSupplied(
      identity.preferredContact,
      contact.preferredChannel,
    ), activeCase),
    verificationStatus: safeRecordText(firstSupplied(
      identity.verificationStatus,
      activeCase.customer?.verificationStatus,
    )),
    verificationMethod: safeRecordText(identity.verificationMethod),
    lastVerified: safeRecordText(identity.lastVerified),
    accountStanding: safeRecordText(firstSupplied(
      identity.accountStanding,
      activeCase.customer?.accountStanding,
    )),
  };
}

function sanitizeIdentity(identity = {}) {
  return {
    legalName: safeRecordText(identity.legalName),
    preferredName: safeRecordText(identity.preferredName),
    dob: safeRecordText(identity.dob),
    age: safeRecordText(identity.age),
    language: safeRecordText(identity.language),
    currentAddress: safeRecordText(identity.currentAddress),
    previousAddress: safeRecordText(identity.previousAddress),
    mobilePhone: safeRecordText(identity.mobilePhone),
    homePhone: safeRecordText(identity.homePhone),
    email: safeRecordText(identity.email),
    customerSince: safeRecordText(identity.customerSince),
    segment: safeRecordText(identity.segment),
    preferredContact: safeRecordText(identity.preferredContact),
    verificationStatus: safeRecordText(identity.verificationStatus),
    verificationMethod: safeRecordText(identity.verificationMethod),
    lastVerified: safeRecordText(identity.lastVerified),
    accountStanding: safeRecordText(identity.accountStanding),
  };
}

function normalizeProfileUpdates(activeCase) {
  const allowed = /address|phone|email|contact|statement|language|preference|password|recovery|mfa|authentication|security setting|authorized user|external (?:payment )?(?:account|destination)|payment destination|profile creation/i;
  const profileSeed = stableNumber(activeCase.trainingId ?? activeCase.person ?? activeCase.id);
  const sourceEvents = Array.isArray(activeCase.customer?.profileChanges)
    ? activeCase.customer.profileChanges
    : [];
  const provided = sourceEvents
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => allowed.test(`${event.eventType ?? ''} ${event.item ?? ''}`))
    .filter(({ event }) => profileUpdateIsAvailableAsOf(event, activeCase))
    .filter(({ event }) => !generatedProfileEventUsesIntake(event, activeCase))
    .map(({ event, index }) => ({
      id: safeRecordText(
        event.id,
        `PROFILE-${String(profileSeed).padStart(5, '0')}-${index + 1}`,
      ),
      updateType: safeRecordText(firstSupplied(event.eventType, event.item), 'Profile maintenance'),
      item: safeRecordText(firstSupplied(event.item, event.eventType), 'Profile record'),
      previousValue: safeRecordText(event.oldValue, 'Not recorded'),
      newValue: safeRecordText(event.newValue, 'Not recorded'),
      dateTime: safeRecordText(
        firstSupplied(
          event.dateTime,
          `${event.date ?? 'Date not recorded'}${event.time ? ` · ${event.time}` : ''}`,
        ),
        'Date not recorded',
      ),
      channel: safeRecordText(event.channel, 'Customer profile'),
      source: safeRecordText(event.source, 'Relationship servicing'),
      actor: safeRecordText(event.user, 'Customer or authorized servicing user'),
      deviceId: safeRecordText(event.device, 'Device not recorded'),
      sessionId: safeRecordText(event.session, 'Session not recorded'),
      authentication: safeRecordText(event.mfaMethod, 'Authentication method not recorded'),
    }));

  // Filtering supplied rows must never trigger replacement evidence. Missing
  // history stays missing until a durable source packet supplies it.
  return provided;
}

function suppliedSecuritySummary(activeCase) {
  const security = activeCase.customer?.security
    ?? activeCase.security
    ?? activeCase.profile?.security
    ?? {};
  const devices = Array.isArray(security.trustedDevices) ? security.trustedDevices : [];
  return {
    mfaStatus: safeRecordText(security.mfaStatus),
    passwordChanged: safeRecordText(security.passwordChanged),
    lockouts: safeRecordText(security.lockouts),
    alerts: safeRecordText(security.alerts),
    recoveryContact: safeRecordText(security.recoveryContact),
    trustedPhone: safeRecordText(security.trustedPhone),
    trustedEmail: safeRecordText(security.trustedEmail),
    recentPasswordReset: safeRecordText(firstSupplied(
      security.recentPasswordReset,
      security.passwordChanged,
    )),
    securityAlertsSent: safeRecordText(firstSupplied(
      security.securityAlertsSent,
      security.alerts,
    )),
    trustedDevices: devices
      .filter((device) => recordDateIsAvailableAsOf(device.firstSeen, activeCase))
      .map((device, index) => ({
      id: safeRecordText(device.id, `DEVICE-SUPPLIED-${index + 1}`),
      name: safeRecordText(device.name),
      type: safeRecordText(device.type),
      platform: safeRecordText(firstSupplied(
        device.platform,
        device.browserOrOperatingSystem,
      )),
      browserOrOperatingSystem: safeRecordText(firstSupplied(
        device.browserOrOperatingSystem,
        device.platform,
      )),
      firstSeen: asOfText(device.firstSeen, activeCase),
      lastSeen: asOfText(device.lastSeen, activeCase),
      mostRecentSuccessfulLogin: asOfText(firstSupplied(
        device.mostRecentSuccessfulLogin,
        device.lastSeen,
      ), activeCase),
      trustStatus: safeRecordText(device.trustStatus),
      authentication: safeRecordText(firstSupplied(
        device.authentication,
        device.mfaMethod,
      )),
      mfaMethod: safeRecordText(firstSupplied(
        device.mfaMethod,
        device.authentication,
      )),
    })),
  };
}

function suppliedServiceContacts(activeCase) {
  const records = firstSupplied(
    activeCase.customer?.serviceContacts,
    activeCase.customer?.contactHistory,
    activeCase.serviceContacts,
    activeCase.contactHistory,
  );
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => recordDateIsAvailableAsOf(
      firstSupplied(record.dateTime, record.date, record.observed),
      activeCase,
    ))
    .map((record, index) => ({
    id: safeRecordText(record.id, `SERVICE-SUPPLIED-${index + 1}`),
    dateTime: safeRecordText(firstSupplied(
      record.dateTime,
      record.date && `${record.date}${record.time ? ` · ${record.time}` : ''}`,
    )),
    type: safeRecordText(record.type),
    channel: safeRecordText(record.channel),
    outcome: safeRecordText(record.outcome),
    agent: safeRecordText(record.agent),
    notes: safeRecordText(record.notes),
    relatedAccountId: safeRecordText(record.relatedAccountId),
    reasonForContact: safeRecordText(record.reasonForContact),
    reportedInformation: safeRecordText(firstSupplied(
      record.reportedInformation,
      record.customerReported,
    )),
    assistanceProvided: safeRecordText(record.assistanceProvided),
    documentsRequested: safeRecordText(record.documentsRequested),
    followUpStatus: safeRecordText(record.followUpStatus),
    agentOrDepartment: safeRecordText(firstSupplied(
      record.agentOrDepartment,
      record.agent,
    )),
  }));
}

function suppliedRelationshipSummary(activeCase) {
  const relationship = activeCase.customer?.relationshipProfile
    ?? activeCase.customer?.relationshipSummary
    ?? activeCase.relationshipProfile
    ?? {};
  const rows = Array.isArray(activeCase.customer?.relationship)
    ? activeCase.customer.relationship
    : [];
  const rowValue = (pattern) => rows.find((row) => pattern.test(String(row.label ?? '')))?.value;
  return {
    normalDeposits: safeRecordText(firstSupplied(
      relationship.normalDeposits,
      activeCase.customer?.normalDeposits,
      rowValue(/normal deposit/i),
    )),
    normalSpending: safeRecordText(firstSupplied(
      relationship.normalSpending,
      activeCase.customer?.normalSpending,
      rowValue(/normal spending/i),
    )),
    authorizedUsers: safeRecordText(firstSupplied(
      relationship.authorizedUsers,
      activeCase.customer?.authorizedUsers,
      rowValue(/authorized user|additional signer/i),
    )),
    digitalBanking: safeRecordText(firstSupplied(
      relationship.digitalBanking,
      activeCase.customer?.digitalBanking,
      rowValue(/digital banking|online banking/i),
    )),
  };
}

function suppliedRelationshipFacts(activeCase) {
  const rows = Array.isArray(activeCase.customer?.relationship)
    ? activeCase.customer.relationship
    : [];
  return rows
    .map((row) => ({
      label: safeRecordText(row?.label),
      value: safeRecordText(row?.value),
    }))
    .filter((row) => row.label !== unavailable && row.value !== unavailable);
}

function sanitizeRelationshipSummary(relationship = {}) {
  return {
    normalDeposits: safeRecordText(relationship.normalDeposits),
    normalSpending: safeRecordText(relationship.normalSpending),
    authorizedUsers: safeRecordText(relationship.authorizedUsers),
    digitalBanking: safeRecordText(relationship.digitalBanking),
  };
}

function completeSecuritySummary(security, identity, activeCase) {
  return {
    mfaStatus: safeRecordText(security.mfaStatus),
    passwordChanged: safeRecordText(security.passwordChanged),
    lockouts: safeRecordText(security.lockouts),
    alerts: safeRecordText(security.alerts),
    recoveryContact: safeRecordText(security.recoveryContact),
    trustedPhone: safeRecordText(security.trustedPhone ?? identity.mobilePhone),
    trustedEmail: safeRecordText(security.trustedEmail ?? identity.email),
    recentPasswordReset: safeRecordText(security.recentPasswordReset ?? security.passwordChanged),
    securityAlertsSent: safeRecordText(security.securityAlertsSent ?? security.alerts),
    trustedDevices: (security.trustedDevices ?? [])
      .filter((device) => recordDateIsAvailableAsOf(device.firstSeen, activeCase))
      .map((device) => ({
      id: safeRecordText(device.id),
      name: safeRecordText(device.name),
      type: safeRecordText(device.type),
      platform: safeRecordText(device.platform ?? device.browserOrOperatingSystem),
      browserOrOperatingSystem: safeRecordText(device.browserOrOperatingSystem ?? device.platform),
      firstSeen: asOfText(device.firstSeen, activeCase),
      lastSeen: asOfText(device.lastSeen, activeCase),
      mostRecentSuccessfulLogin: asOfText(device.mostRecentSuccessfulLogin ?? device.lastSeen, activeCase),
      trustStatus: safeRecordText(device.trustStatus),
      authentication: safeRecordText(device.authentication ?? device.mfaMethod),
      mfaMethod: safeRecordText(device.mfaMethod ?? device.authentication),
    })),
  };
}

function completeServiceContacts(records = [], activeCase) {
  return records
    .filter((record) => recordDateIsAvailableAsOf(
      record.dateTime ?? record.date ?? record.observed,
      activeCase,
    ))
    .map((record) => ({
    id: safeRecordText(record.id),
    dateTime: safeRecordText(record.dateTime),
    type: safeRecordText(record.type),
    channel: safeRecordText(record.channel),
    outcome: safeRecordText(record.outcome),
    agent: safeRecordText(record.agent),
    notes: safeRecordText(record.notes),
    relatedAccountId: safeRecordText(record.relatedAccountId),
    reasonForContact: safeRecordText(record.reasonForContact ?? record.type),
    reportedInformation: safeRecordText(record.reportedInformation ?? record.customerReported ?? record.notes),
    assistanceProvided: safeRecordText(record.assistanceProvided ?? record.outcome),
    documentsRequested: safeRecordText(record.documentsRequested ?? 'None recorded'),
    followUpStatus: safeRecordText(record.followUpStatus ?? (
      /pending|requested|follow-up/i.test(`${record.outcome ?? ''} ${record.notes ?? ''}`)
        ? 'Follow-up recorded'
        : 'Completed'
    )),
    agentOrDepartment: safeRecordText(record.agentOrDepartment ?? record.agent),
  }));
}

function normalizeBusinessLink(raw, index) {
  const relationship = raw.relationshipType
    ?? raw.relationship
    ?? raw.role
    ?? raw.linkType
    ?? '';
  const businessId = raw.businessId ?? raw.id ?? raw.entityId;
  const businessName = raw.businessName ?? raw.legalName ?? raw.name ?? raw.entity;
  if (!businessId || !businessName) return null;
  const isOwnershipRelationship = /owner|ownership|beneficial|control/i.test(relationship);
  return {
    id: raw.id ?? `BUSINESS-LINK-${index + 1}`,
    businessId,
    businessName,
    relationship,
    ownershipPercentage: raw.ownershipPercentage
      ?? raw.ownership
      ?? (isOwnershipRelationship ? 'Not recorded' : 'Not applicable'),
    relationshipSince: raw.relationshipSince ?? raw.since ?? 'Not recorded',
    status: raw.status ?? 'Relationship record available',
  };
}

function linkedBusinesses(activeCase) {
  const candidates = [
    ...(activeCase.customer?.businessRelationships ?? []),
    ...(activeCase.businessRelationships ?? []),
    ...(activeCase.linkedBusinesses ?? []),
    ...(activeCase.relationships ?? []),
  ];
  return candidates
    .map(normalizeBusinessLink)
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((candidate) => candidate.businessId === item.businessId) === index);
}

export function getCustomerIdentityFacts(activeCase) {
  const profile = builtInProfiles[activeCase.id];
  const identity = sanitizeIdentity(profile?.identity
    ?? suppliedIdentity(activeCase));
  const trainingId = safeRecordText(activeCase.trainingId);
  const suppliedMaskedMemberId = activeCase.customer?.identity?.maskedMemberId
    ?? activeCase.identity?.maskedMemberId
    ?? activeCase.profile?.identity?.maskedMemberId;
  return {
    ...identity,
    trainingId,
    relationshipLength: /\b(?:19|20)\d{2}\b/.test(identity.customerSince)
      ? relationshipLengthFrom(identity.customerSince)
      : unavailable,
    maskedMemberId: safeRecordText(suppliedMaskedMemberId),
  };
}

export function getCustomer360Dossier(activeCase) {
  const accounts = getPersistedRelationshipAccounts(activeCase);
  const preset = builtInProfiles[activeCase.id];
  const identity = getCustomerIdentityFacts(activeCase);
  const security = preset
    ? completeSecuritySummary(
      preset.security,
      identity,
      activeCase,
    )
    : suppliedSecuritySummary(activeCase);
  const serviceContacts = preset
    ? completeServiceContacts(
      preset.serviceContacts,
      activeCase,
    )
    : suppliedServiceContacts(activeCase);
  const profileUpdates = normalizeProfileUpdates(activeCase);
  const businessRelationships = linkedBusinesses(activeCase);
  const relationshipFacts = suppliedRelationshipFacts(activeCase);
  const relationshipSource = preset?.relationship
    ?? suppliedRelationshipSummary(activeCase);
  const relationship = sanitizeRelationshipSummary(relationshipSource);
  const asOf = safeRecordText(activeCase.reportedDate ?? activeCase.opened);
  const hasPersistedIdentityPacket = Boolean(
    activeCase.customer?.identity?.sourceRecordId
    || activeCase.customer?.identity?.legalName,
  );

  return {
    identity,
    contact: {
      mobilePhone: identity.mobilePhone,
      homePhone: identity.homePhone,
      email: identity.email,
      mailingAddress: identity.currentAddress,
      physicalAddress: identity.currentAddress,
      previousAddress: identity.previousAddress,
      preferredContact: identity.preferredContact,
      verificationStatus: identity.verificationStatus,
    },
    accounts,
    products: accounts,
    relationship: {
      ...relationship,
      businessRelationships,
      facts: relationshipFacts,
    },
    security,
    profileUpdates,
    serviceContacts,
    recentContacts: serviceContacts,
    priorClaims: [],
    coverage: {
      asOf,
      sourceMode: preset
        ? 'Built-in training profile'
        : hasPersistedIdentityPacket
          ? 'Persisted training packet'
          : 'Supplied records only',
      identity: preset
        ? 'Training identity profile available.'
        : hasPersistedIdentityPacket
          ? 'Persisted training identity fields are available.'
          : 'Unsupplied identity fields are explicitly unavailable.',
      accounts: accounts.length
        ? `${accounts.length} persisted relationship account${accounts.length === 1 ? '' : 's'} available.`
        : 'No relationship-account snapshot is supplied.',
      profileUpdates: profileUpdates.length
        ? `${profileUpdates.length} profile update record${profileUpdates.length === 1 ? '' : 's'} available through ${asOf}.`
        : `No profile update record is supplied through ${asOf}.`,
      security: security.trustedDevices.length
        ? `${security.trustedDevices.length} trusted-device record${security.trustedDevices.length === 1 ? '' : 's'} supplied.`
        : 'No trusted-device record is supplied.',
      serviceContacts: serviceContacts.length
        ? `${serviceContacts.length} service-contact record${serviceContacts.length === 1 ? '' : 's'} supplied.`
        : 'No service-contact record is supplied.',
    },
    atAGlance: [
      ['Relationship length', identity.relationshipLength],
      ['Products', accounts.length],
      ['Trusted devices', security.trustedDevices.length],
      ['Service contacts', serviceContacts.length],
    ],
  };
}
