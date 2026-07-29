import { getCustomer360Dossier, getCustomerIdentityFacts } from './customer360Dossier.js';
import { getBusiness360Dossier } from './business360Dossier.js';
import { publicCaseTaxonomy } from './publicCaseView.js';

const builtInProfiles = {
  'FA-ATO-24018': { profileId: 'PRF-8842', confidence: 'Profile name, DOB, Training ID, phone, email, and address matched in the fictional packet', applicationHistory: 'Consumer deposit relationship opened in 2018', employer: 'Cedar Health Services', watchlist: 'No fictional training watchlist record returned' },
  'FA-CB-24007': { profileId: 'PRF-5510', confidence: 'Profile name, DOB, Training ID, phone, email, and address matched in the fictional packet', applicationHistory: 'Cardholder relationship opened in 2021', employer: 'Fort Worth Creative Studio', watchlist: 'No fictional training watchlist record returned' },
  'FA-CR-24003': { profileId: 'PRF-2044', confidence: 'New-profile fields matched with limited relationship history', applicationHistory: 'New consumer credit relationship opened in 2026', employer: 'Avery Training Consulting', watchlist: 'No fictional training watchlist record returned' },
};

const firstNames = ['Elena', 'Marcus', 'Nina', 'Caleb', 'Tessa', 'Andre', 'Monica', 'Darius'];
const vehicleModels = ['2021 Honda Accord', '2020 Toyota RAV4', '2022 Ford Escape', '2019 Nissan Altima'];
const carriers = ['Northline Mobile', 'Cedar Wireless', 'Metro Training Telecom'];

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => total + character.charCodeAt(0), 0);
}

function pick(values, seed, offset = 0) {
  return values[(seed + offset) % values.length];
}

function mask(value = '') {
  const text = String(value);
  return text ? `••••-${text.slice(-4)}` : 'Not recorded';
}

function records(fields) {
  return fields.map(([label, value]) => ({ label, value }));
}

function yearFromRelationship(value) {
  const year = Number.parseInt(String(value), 10);
  return Number.isFinite(year) ? year : 2026;
}

function reportProfile(activeCase, identity) {
  const seed = stableNumber(activeCase.id);
  return builtInProfiles[activeCase.id] ?? {
    profileId: `PRF-${String(seed).slice(-4).padStart(4, '0')}`,
    confidence: 'Fictional name, DOB, Training ID, and contact fields matched for training review',
    applicationHistory: `${publicCaseTaxonomy(activeCase).workflowType} application or relationship record`,
    employer: activeCase.profile?.employer ?? `${pick(firstNames, seed)} Training Services`,
    watchlist: 'No fictional training watchlist record returned',
    dob: identity.dob,
  };
}

function preferredName(value = '') {
  return String(value).trim().split(/\s+/)[0] || 'Training customer';
}

function suppliedOwnerRecords(owner) {
  return [
    {
      id: `${owner.id}-TRAINING-ID`,
      type: 'Training ID',
      value: owner.trainingId,
      lastSeen: owner.identityVerificationStatus,
    },
    {
      id: `${owner.id}-PHONE`,
      type: 'Phone',
      value: owner.personalPhone,
      lastSeen: owner.contactHistory?.[0]?.contactDateTime ?? owner.identityVerificationStatus,
    },
    {
      id: `${owner.id}-EMAIL`,
      type: 'Email',
      value: owner.personalEmail,
      lastSeen: owner.contactHistory?.[0]?.contactDateTime ?? owner.identityVerificationStatus,
    },
  ].filter((record) => record.value && !/not available/i.test(record.value));
}

export function getIdentityIntelContextCase(caseRecord, trainingId = '') {
  const targetTrainingId = String(trainingId ?? '').trim();
  if (!targetTrainingId || targetTrainingId === String(caseRecord.trainingId ?? '').trim()) return caseRecord;
  if (!(caseRecord.availableTools ?? []).includes('Business 360')) return caseRecord;

  const owner = getBusiness360Dossier(caseRecord).owners.find(
    (candidate) => String(candidate.trainingId ?? '').trim() === targetTrainingId,
  );
  if (!owner) return caseRecord;

  const businessName = caseRecord.profile?.business
    ?? caseRecord.businessProfile?.legalName
    ?? 'Linked training business';
  const trustedDevices = (owner.trustedDevices ?? []).map((device) => ({
    id: device.deviceId,
    name: device.deviceName,
    type: device.deviceType,
    platform: device.browserOrOperatingSystem,
    firstSeen: device.firstSeen,
    lastSeen: device.lastSeen,
    trustStatus: device.trustStatus,
    authentication: device.mfaMethod,
  }));
  const serviceContacts = (owner.contactHistory ?? []).map((contact) => ({
    id: contact.id,
    dateTime: contact.contactDateTime,
    type: contact.reasonForContact,
    channel: contact.channel,
    outcome: contact.assistanceProvided,
    agent: contact.agentOrDepartment,
    notes: contact.reportedInformation,
    relatedAccountId: contact.relatedAccountId,
  }));

  return {
    ...caseRecord,
    id: `${caseRecord.id}::${owner.trainingId}`,
    person: owner.fullLegalName,
    trainingId: owner.trainingId,
    customerType: 'personal',
    productType: owner.accounts?.[0]?.productType ?? 'deposit-account',
    amount: undefined,
    amountExposure: undefined,
    transactionInfo: undefined,
    legacyDerivedEvidence: true,
    identityContext: {
      type: 'business-owner',
      sourceCaseId: caseRecord.id,
      trainingId: owner.trainingId,
      ownerId: owner.id,
    },
    profile: {
      ...caseRecord.profile,
      employer: businessName,
      entityRole: owner.businessTitle,
    },
    customer: {
      relationshipSince: owner.ownerSince,
      segment: 'Personal relationship connected to a business owner record',
      contact: {
        address: owner.currentResidentialAddress,
        phone: owner.personalPhone,
        email: owner.personalEmail,
        preferredChannel: owner.contactHistory?.[0]?.channel,
      },
      identity: {
        legalName: owner.fullLegalName,
        preferredName: preferredName(owner.fullLegalName),
        dob: owner.dateOfBirth,
        currentAddress: owner.currentResidentialAddress,
        previousAddress: owner.previousResidentialAddress,
        mobilePhone: owner.personalPhone,
        email: owner.personalEmail,
        customerSince: owner.ownerSince,
        segment: 'Personal relationship connected to a business owner record',
        preferredContact: owner.contactHistory?.[0]?.channel,
        verificationStatus: owner.identityVerificationStatus,
        verificationMethod: owner.addressVerificationStatus,
        accountStanding: owner.accounts?.[0]?.status,
      },
      security: {
        mfaStatus: trustedDevices[0]?.authentication,
        recoveryContact: [owner.personalPhone, owner.personalEmail].filter(Boolean).join(' · '),
        trustedDevices,
      },
      serviceContacts,
      profileChanges: [],
      businessRelationships: [{
        id: `OWNER-LINK-${owner.id}`,
        businessId: caseRecord.businessId
          ?? caseRecord.businessProfile?.registrationFileNumber
          ?? caseRecord.businessProfile?.registration
          ?? caseRecord.id,
        businessName,
        relationship: owner.businessTitle,
        ownershipPercentage: owner.ownershipPercentage,
        relationshipSince: owner.ownerSince,
        status: 'Relationship record available',
      }],
    },
    toolResults: {
      ...caseRecord.toolResults,
      relationshipAccounts: owner.accounts ?? [],
    },
    relationshipAccounts: owner.accounts ?? [],
    identityRecords: suppliedOwnerRecords(owner),
    loginHistory: [],
    parties: [],
  };
}

export function getIdentityIntelReport(caseRecord, { trainingId = '' } = {}) {
  const activeCase = getIdentityIntelContextCase(caseRecord, trainingId);
  const seed = stableNumber(activeCase.id);
  const identity = getCustomerIdentityFacts(activeCase);
  const customerDossier = activeCase.identityContext?.type === 'business-owner'
    ? { contact: { physicalAddress: activeCase.customer?.contact?.address } }
    : getCustomer360Dossier(activeCase);
  const profile = { ...reportProfile(activeCase, identity), dob: identity.dob };
  const contact = activeCase.customer?.contact ?? {};
  const address = customerDossier.contact.physicalAddress ?? contact.address ?? activeCase.intake?.customerLocation ?? 'Training address not supplied';
  const city = activeCase.intake?.customerLocation ?? activeCase.profile?.city ?? 'Training city';
  const firstName = String(activeCase.person ?? 'Training').split(' ')[0];
  const lastName = String(activeCase.person ?? 'Profile').split(' ').slice(-1)[0];
  const email = contact.email ?? activeCase.identityRecords?.find((item) => /email/i.test(item.type))?.value ?? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@training.example.test`;
  const phone = contact.phone ?? activeCase.identityRecords?.find((item) => /phone/i.test(item.type))?.value ?? `(555) 010-${String(seed).slice(-4).padStart(4, '0')}`;
  const devices = [...new Set((activeCase.loginHistory ?? []).map((item) => item.deviceId ?? item.device).filter(Boolean))];
  const locations = [...new Set((activeCase.loginHistory ?? []).map((item) => item.location).filter(Boolean))];
  const relationshipYear = yearFromRelationship(activeCase.customer?.relationshipSince);
  const taxonomy = publicCaseTaxonomy(activeCase);
  const businessCase = activeCase.customerType === 'business';
  const businessName = activeCase.profile?.business ?? (businessCase ? `${lastName} Training Services LLC` : 'No business ownership record returned');
  const businessFound = !businessName.startsWith('No ');
  const relevantParties = activeCase.parties ?? [];
  const businessOwner = relevantParties.find((party) => /beneficial owner|control person|owner/i.test(party.role ?? ''));
  const businessOfficer = relevantParties.find((party) => /control person|officer|administrator/i.test(party.role ?? ''));
  const previousAddress = `${120 + (seed % 700)} Archive Street, ${city} (training)`;
  const spouse = seed % 3 === 0 ? `${pick(firstNames, seed, 2)} ${lastName}` : 'No spouse record returned';
  const propertyCount = seed % 4 === 0 ? 2 : 1;
  const bankruptcyFound = seed % 11 === 0;
  const lienFound = seed % 13 === 0;
  const licenseFound = seed % 3 !== 0;
  const historicalEmail = `${firstName.toLowerCase()}.${String(seed).slice(-3)}@archive.training.example.test`;

  return {
    subject: {
      name: activeCase.person,
      trainingId: activeCase.trainingId,
      contextType: activeCase.identityContext?.type ?? 'case-customer',
      sourceCaseId: activeCase.identityContext?.sourceCaseId ?? activeCase.id,
    },
    sourceRecords: activeCase.identityRecords ?? [],
    profile,
    searchIds: [activeCase.trainingId, profile.profileId, mask(activeCase.trainingId)],
    searchName: activeCase.person,
    searchDob: profile.dob,
    searchKeys: [activeCase.person, activeCase.trainingId, email, phone, profile.dob, profile.profileId],
    summary: [
      ['Name / DOB match', `${activeCase.person} · ${profile.dob}`],
      ['Masked ID', mask(activeCase.trainingId)],
      ['Address stability', `${address} · ${Math.max(0, 2026 - relationshipYear)}-year relationship reference`],
      ['Phone age', `First seen ${relationshipYear} · ${pick(carriers, seed)}`],
      ['Email age', `First seen ${relationshipYear} · established training domain`],
      ['Source match', profile.confidence],
      ['Linked profiles', 'One active fictional customer profile'],
      ['Application history', profile.applicationHistory],
      ['Watchlist / OFAC training result', profile.watchlist],
      ['Public record summary', `${propertyCount} property record${propertyCount === 1 ? '' : 's'} · ${licenseFound ? 'license record available' : 'no professional license returned'}`],
    ],
    counts: [
      ['Addresses', 2], ['Phones', 1], ['Emails', 2], ['Associates', 4], ['Businesses', businessFound ? 1 : 0], ['Properties', propertyCount], ['Vehicles', 1], ['Licenses', licenseFound ? 1 : 0], ['Public records', 2], ['Bankruptcies', bankruptcyFound ? 1 : 0], ['Liens / judgments', lienFound ? 1 : 0], ['Social / digital', Math.max(2, devices.length)],
    ],
    sections: [
      { id: 'identity-summary', title: 'Identity Summary', fields: records([['Full name', activeCase.person], ['DOB', profile.dob], ['Profile ID', profile.profileId], ['Training ID', mask(activeCase.trainingId)], ['Primary address', address], ['Verification status', identity.verificationStatus], ['Source match', profile.confidence]]) },
      { id: 'address-history', title: 'Address History', fields: records([['Current address', address], ['Previous address', previousAddress], ['Move date', `${pick(['Mar', 'Jun', 'Sep', 'Nov'], seed)} ${relationshipYear + 1}`], ['Address stability', `Current address appears across ${Math.max(1, 2026 - relationshipYear)} years of fictional relationship data`], ['Linked applications', profile.applicationHistory], ['Unit / apartment indicator', seed % 2 ? 'Single-unit residential record' : 'Unit number verified'], ['Mail-drop indicator', 'No fictional mail-drop indicator returned']]) },
      { id: 'phone-numbers', title: 'Phone Numbers', fields: records([['Primary phone', phone], ['Carrier', pick(carriers, seed)], ['Line type', 'Mobile'], ['First seen', `Jul ${relationshipYear}`], ['Last seen', activeCase.reportedDate ?? activeCase.opened], ['Ownership source match', `Name and address matched fictional carrier profile ${profile.profileId}`], ['Linked profiles', profile.profileId], ['Recent changes', (activeCase.customer?.profileChanges ?? []).filter((item) => /phone/i.test(`${item.eventType} ${item.item}`)).map((item) => `${item.date}: ${item.item}`).join(' · ') || 'No phone-value change returned'], ['OTP delivery history', 'Review Login History and profile-maintenance records']]) },
      { id: 'email-history', title: 'Email History', fields: records([['Primary email', email], ['Business email', businessFound ? `contact@${lastName.toLowerCase()}-training.example.test` : 'No business email returned'], ['Historical emails', historicalEmail], ['First seen', `Jul ${relationshipYear}`], ['Last seen', activeCase.reportedDate ?? activeCase.opened], ['Domain type', 'Established fictional training domain'], ['Linked profiles', profile.profileId], ['Recent changes', (activeCase.customer?.profileChanges ?? []).filter((item) => /email/i.test(`${item.eventType} ${item.item}`)).map((item) => `${item.date}: ${item.item}`).join(' · ') || 'No email-value change returned'], ['Breach indicators', 'No fictional breach indicator returned'], ['Disposable email check', 'Not disposable in the fictional training source']]) },
      { id: 'associates', title: 'Associates & Relatives', fields: records([['Mother', `${pick(firstNames, seed)} ${lastName}`], ['Father', `${pick(firstNames, seed, 1)} ${lastName}`], ['Spouse', spouse], ['Children', seed % 2 ? 'One fictional household relationship' : 'No child record returned'], ['Business associates', businessFound ? `${pick(firstNames, seed, 3)} ${lastName} · registered officer` : 'No business associate returned'], ['Known roommates', seed % 5 === 0 ? `${pick(firstNames, seed, 4)} Reed` : 'No roommate record returned'], ['Shared addresses', previousAddress], ['Shared phone numbers', 'No shared phone record returned'], ['Emergency contacts', `${pick(firstNames, seed, 5)} ${lastName}`]]) },
      { id: 'employment', title: 'Employment History', fields: records([['Current employer', profile.employer], ['Position', activeCase.profile?.entityRole ?? 'Operations specialist'], ['Hire date', `${pick(['Jan', 'Apr', 'Aug', 'Oct'], seed)} ${2017 + (seed % 7)}`], ['Previous employers', `${pick(firstNames, seed, 6)} Training Group`], ['Employment timeline', `${2013 + (seed % 5)}-${2019 + (seed % 4)} previous · current employer thereafter`], ['Estimated income range', `$${45 + (seed % 35)},000-$${65 + (seed % 40)},000`], ['Business owner', businessFound ? businessOwner?.name ?? 'Owner record available in KYB Review' : 'No business-owner record returned'], ['Officer positions', businessFound ? `${businessName} · ${businessOfficer?.role ?? 'control-person record available'}` : 'No officer position returned'], ['Payroll relationships', activeCase.workflowType?.includes('payroll') ? 'Payroll relationship records available in Employee Profile and Payroll History' : 'No payroll relationship in the current identity source']]) },
      { id: 'business-records', title: 'Businesses & Ownership', fields: records([['Business name', businessName], ['Entity type', businessFound ? 'Training limited liability company' : 'No entity returned'], ['SOS status', businessFound ? 'Active fictional state filing' : 'No state filing returned'], ['EIN masked', businessFound ? `••-•••${String(seed).slice(-4).padStart(4, '0')}` : 'Not applicable'], ['Owner', businessFound ? businessOwner?.name ?? 'Review owner records' : 'Not applicable'], ['Officer', businessFound ? businessOfficer?.name ?? 'Review control-person records' : 'Not applicable'], ['Registered agent', businessFound ? `${pick(firstNames, seed, 7)} Training Agent` : 'Not applicable'], ['Business address', businessFound ? address : 'Not applicable'], ['State filing date', businessFound ? `May ${2018 + (seed % 7)}` : 'Not applicable'], ['Business standing', businessFound ? 'Active fictional record' : 'No entity returned']]) },
      { id: 'licenses', title: 'Professional Licenses', fields: records([['License number', licenseFound ? `LIC-••••-${String(seed).slice(-3).padStart(3, '0')}` : 'No professional license returned'], ['License type', licenseFound ? 'Fictional occupational license' : 'Not applicable'], ['Status', licenseFound ? 'Active' : 'Not applicable'], ['Expiration', licenseFound ? `Dec 31, ${2027 + (seed % 3)}` : 'Not applicable'], ['Issuing agency', licenseFound ? 'Training State Licensing Board' : 'Not applicable'], ['Disciplinary actions', 'No fictional disciplinary action returned']]) },
      { id: 'properties', title: 'Property Records', fields: records([['Current residence', address], ['Purchase date', `Aug ${2018 + (seed % 5)}`], ['Purchase price', `$${180 + (seed % 170)},000`], ['Estimated value', `$${240 + (seed % 210)},000`], ['Mortgage holder', 'Training Community Mortgage'], ['Tax assessment', `$${220 + (seed % 190)},000`], ['Rental properties', propertyCount > 1 ? previousAddress : 'No rental property returned'], ['Commercial properties', businessFound && seed % 2 === 0 ? `${businessName} office parcel` : 'No commercial property returned']]) },
      { id: 'vehicles', title: 'Vehicle Records', fields: records([['Vehicle', pick(vehicleModels, seed)], ['VIN masked', `•••••••••••${String(seed).slice(-4).padStart(4, '0')}`], ['Registration', city], ['Title status', 'Clear fictional title record'], ['Lien holder', seed % 2 ? 'Training Auto Finance' : 'No lien holder returned'], ['Plate history', `TX-TRN-${String(seed).slice(-3).padStart(3, '0')} · one current plate`]]) },
      { id: 'credit-summary', title: 'Credit & Financial Summary', fields: records([['Credit relationship', activeCase.customer?.segment ?? 'Training relationship'], ['Account standing', identity.accountStanding], ['Current exposure', activeCase.amount ?? 'Not supplied'], ['Application history', profile.applicationHistory], ['Estimated income range', `$${45 + (seed % 35)},000-$${65 + (seed % 40)},000`], ['Financial context', 'Open Financial Investigation for account-level evidence']]) },
      { id: 'bankruptcies', title: 'Bankruptcy Records', fields: records([['Chapter', bankruptcyFound ? 'Chapter 7 fictional training record' : 'No fictional bankruptcy record returned'], ['Filed', bankruptcyFound ? 'Mar 2020' : 'Not applicable'], ['Discharged', bankruptcyFound ? 'Aug 2020' : 'Not applicable'], ['Case number', bankruptcyFound ? `BK-TRN-${String(seed).slice(-5)}` : 'Not applicable'], ['Court', bankruptcyFound ? 'Training District Court' : 'Not applicable'], ['Status', bankruptcyFound ? 'Discharged' : 'No record returned']]) },
      { id: 'liens-judgments', title: 'Liens / Judgments', fields: records([['Federal', 'No record returned'], ['State', lienFound ? 'One satisfied fictional state lien' : 'No record returned'], ['Civil', 'No record returned'], ['Tax', lienFound ? 'Training tax lien · satisfied' : 'No record returned'], ['Satisfied', lienFound ? 'Yes · 2022' : 'No record returned'], ['Outstanding', 'No outstanding fictional record returned']]) },
      { id: 'criminal', title: 'Criminal Records (Training Only)', fields: records([['Record found', 'No fictional criminal record returned'], ['Jurisdiction', 'Not applicable'], ['Offense type', 'Not applicable'], ['Disposition', 'Not applicable'], ['Sentence', 'Not applicable'], ['Case number', 'Not applicable']]) },
      { id: 'public-records', title: 'Public Records', fields: records([['Marriage', spouse.startsWith('No ') ? 'No marriage record returned' : `Fictional marriage record · ${spouse}`], ['Divorce', 'No divorce record returned'], ['Court filings', bankruptcyFound ? 'Bankruptcy filing listed in separate section' : 'No court filing returned'], ['Civil cases', 'No civil case returned'], ['Professional discipline', 'No fictional professional discipline returned'], ['Voter registration', `${city} · fictional active registration`]]) },
      { id: 'social-digital', title: 'Social & Digital Presence', fields: records([['Known devices', devices.join(' · ') || 'No device object returned'], ['Known locations', locations.join(' · ') || city], ['Digital profile links', activeCase.identityRecords?.map((item) => item.id).join(' · ') || profile.profileId], ['Email domain history', `${email.split('@')[1]} · established fictional training domain`], ['Application activity', profile.applicationHistory]]) },
      { id: 'additional-sources', title: 'Additional Data Sources', fields: records([['Current case', activeCase.identityContext?.sourceCaseId ?? activeCase.id], ['Customer type', taxonomy.customerType], ['Product', taxonomy.productType], ['Review workflow', taxonomy.workflowType], ['Source note', 'All records in this report are fictional training data'], ['Related tools', 'Customer 360 · Document Viewer · Login History · Device Intelligence']]) },
    ],
  };
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function matchesIdentityIntelSearch(report, criteria) {
  if (typeof criteria === 'string') {
    const query = String(criteria).trim().toLowerCase();
    return Boolean(query && report.searchKeys.some((key) => String(key ?? '').toLowerCase().includes(query)));
  }
  if (criteria?.mode === 'id') {
    const query = normalize(criteria.id);
    return Boolean(query && report.searchIds.some((value) => normalize(value).includes(query)));
  }
  const name = normalize(criteria?.name);
  const dob = normalize(criteria?.dob);
  return Boolean(name && dob && normalize(report.searchName).includes(name) && normalize(report.searchDob) === dob);
}
