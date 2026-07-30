import { getBusinessRecords } from './caseToolData.js';

export const businessResearchSections = [
  { id: 'identity', label: 'Business Identity', question: 'Which legal entity and registration identifiers are recorded?' },
  { id: 'ownership', label: 'Ownership & Control', question: 'Which owners, controlling parties, and officers are recorded?' },
  { id: 'footprint', label: 'Operating Footprint', question: 'Where and how does the business operate?' },
  { id: 'relationship', label: 'Institution Relationship', question: 'Which business accounts, products, balances, restrictions, and repayment sources are recorded?' },
  { id: 'research', label: 'Business Source Research', question: 'What did the supplied fictional sources return?' },
  { id: 'sources', label: 'Source Records', question: 'Which fictional source records support the profile?' },
];

export const lunaBusinessResearchStatuses = [
  'Verified match',
  'Partial match',
  'Conflicting information',
  'No record located',
  'Unable to verify',
  'Not applicable',
];

function stableNumber(value = '') {
  return [...String(value)].reduce((total, character) => ((total * 33) + character.charCodeAt(0)) % 100000, 19);
}

function businessAge(formationDate, checkedDate = 'Jul 24, 2026') {
  const formed = new Date(formationDate);
  const checked = new Date(checkedDate);
  if (Number.isNaN(formed.getTime()) || Number.isNaN(checked.getTime())) return 'Business age unavailable';
  let years = checked.getFullYear() - formed.getFullYear();
  let months = checked.getMonth() - formed.getMonth();
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return `${years} years, ${months} months`;
}

function identityRecord(profile) {
  return {
    id: profile.businessId,
    title: profile.legalName,
    category: profile.entityType,
    value: profile.standing,
    observed: profile.relationship.relationshipStartDate,
    detail: 'Reusable business identity and institution-relationship record.',
    fields: [
      ['Legal name', profile.legalName],
      ['DBA', profile.dba],
      ['Entity type', profile.entityType],
      ['Masked EIN', profile.ein],
      ['State registration / file number', profile.registrationId],
      ['Formation date', profile.formationDate],
      ['Formation state', profile.formationState],
      ['Standing', profile.standing],
      ['Industry', profile.industry],
      ['NAICS', profile.naics],
    ],
    relatedRecords: [profile.registrationId, profile.ownership.controllingParty.identityReference],
  };
}

function sourceRecord({ id, title, category, value, observed, detail, fields = [], relatedRecords = [] }) {
  return { id, title, category, value, observed, detail, fields, relatedRecords };
}

function researchRows(profile) {
  return profile.research.map((item) => sourceRecord({
    id: item.id,
    title: item.topic,
    category: 'Business Source Research',
    value: item.status,
    observed: item.checkedDate,
    detail: item.finding,
    fields: [
      ['Research topic', item.topic],
      ['Status', item.status],
      ['Finding', item.finding],
      ['Fictional source checked', item.source],
      ['Source type', item.sourceType],
      ['Checked date', item.checkedDate],
    ],
    relatedRecords: item.relatedRecords ?? [],
  }));
}

function recordsFor(profile) {
  const identity = [identityRecord(profile), sourceRecord({
    id: profile.registrationId,
    title: `${profile.formationState} entity registration`,
    category: 'Entity registration',
    value: profile.standing,
    observed: profile.formationDate,
    detail: 'Fictional state-registry record used for entity comparison.',
    fields: [
      ['Registration / file number', profile.registrationId],
      ['Legal name', profile.legalName],
      ['Formation date', profile.formationDate],
      ['Formation state', profile.formationState],
      ['Standing', profile.standing],
      ['Masked EIN', profile.ein],
    ],
    relatedRecords: [profile.businessId],
  })];

  const ownership = [
    ...profile.ownership.beneficialOwners.map((owner) => sourceRecord({
      id: owner.id,
      title: owner.name,
      category: owner.role,
      value: `${owner.ownershipPercentage}%`,
      observed: owner.firstRecorded,
      detail: `${owner.verificationStatus}; identity reference ${owner.identityReference}.`,
      fields: [
        ['Name', owner.name],
        ['Ownership', `${owner.ownershipPercentage}%`],
        ['Role', owner.role],
        ['Owner verification', owner.verificationStatus],
        ['Identity reference', owner.identityReference],
        ['First recorded', owner.firstRecorded],
      ],
      relatedRecords: [owner.identityReference, profile.registrationId],
    })),
    ...profile.ownership.officers.map((officer) => sourceRecord({
      id: officer.id,
      title: officer.name,
      category: 'Officer',
      value: officer.title,
      observed: officer.firstRecorded,
      detail: 'Officer record supplied by the fictional business onboarding source.',
      fields: [['Name', officer.name], ['Title', officer.title], ['First recorded', officer.firstRecorded]],
      relatedRecords: [profile.businessId],
    })),
  ];

  const footprint = [
    sourceRecord({
      id: `${profile.businessId}-LOCATION`,
      title: 'Operating footprint',
      category: 'Business contact and locations',
      value: profile.footprint.physicalAddress,
      observed: profile.relationship.relationshipStartDate,
      detail: 'Physical, mailing, contact, website, location, and employee-count records.',
      fields: [
        ['Physical address', profile.footprint.physicalAddress],
        ['Mailing address', profile.footprint.mailingAddress],
        ['Registered agent', profile.footprint.registeredAgent],
        ['Phone', profile.footprint.phone],
        ['Business email', profile.footprint.email],
        ['Website', profile.footprint.website],
        ['Business age', profile.footprint.businessAge],
        ['Operating locations', profile.footprint.operatingLocations.join(' · ')],
        ['Estimated employee count', String(profile.footprint.estimatedEmployeeCount)],
      ],
      relatedRecords: profile.sourceRecords.filter((item) => /domain|directory/i.test(item.category)).map((item) => item.id),
    }),
  ];

  const relationship = profile.relationship.accounts.map((account) => sourceRecord({
    id: account.id,
    title: account.product,
    category: 'Institution relationship',
    value: account.status,
    observed: profile.relationship.relationshipStartDate,
    detail: 'Business account and product record retained independently of the current case.',
    fields: [
      ['Product', account.product],
      ['Status', account.status],
      ['Limit', account.limit],
      ['Balance', account.balance],
      ['Restrictions or holds', account.restrictions],
      ['NSF / returned-payment context', account.nsfContext],
      ['Recorded repayment source', account.repaymentSource],
    ],
    relatedRecords: [profile.businessId],
  }));

  const sources = profile.sourceRecords.map((item) => sourceRecord({
    id: item.id,
    title: item.title,
    category: item.category,
    value: item.value,
    observed: item.checkedDate,
    detail: item.detail,
    fields: [
      ['Record', item.title],
      ['Category', item.category],
      ['Recorded value', item.value],
      ['Fictional source', item.source],
      ['Checked date', item.checkedDate],
      ['Source note', item.detail],
    ],
    relatedRecords: item.relatedRecords ?? [],
  }));

  return { identity, ownership, footprint, relationship, research: researchRows(profile), sources };
}

function makeProfile(input) {
  const checkedDate = input.checkedDate ?? 'Jul 24, 2026';
  const profile = {
    ...input,
    footprint: {
      ...input.footprint,
      businessAge: input.footprint.businessAge ?? businessAge(input.formationDate, checkedDate),
    },
  };
  return { ...profile, recordsBySection: recordsFor(profile) };
}

const builtInProfiles = {
  'FA-ATO-24018': makeProfile({
    businessId: 'BIZ-NS-7318',
    legalName: 'Northstar Digital Market LLC',
    dba: 'Northstar Digital Market',
    entityType: 'Limited liability company',
    ein: '**-***7318',
    registrationId: 'TX-SOS-8042917',
    formationDate: 'Apr 11, 2021',
    formationState: 'Texas',
    standing: 'Active',
    industry: 'Digital goods marketplace',
    naics: '459999 · All other miscellaneous retailers',
    ownership: {
      beneficialOwners: [
        { id: 'OWN-NS-01', name: 'Elena Park', ownershipPercentage: 62, role: 'Managing member', verificationStatus: 'Identity record located', identityReference: 'OID-NS-ELENA-01', firstRecorded: 'Apr 11, 2021' },
        { id: 'OWN-NS-02', name: 'Marcus Hill', ownershipPercentage: 38, role: 'Member', verificationStatus: 'Identity record located', identityReference: 'OID-NS-MARCUS-02', firstRecorded: 'Apr 11, 2021' },
      ],
      controllingParty: { name: 'Elena Park', title: 'Managing member', identityReference: 'OID-NS-ELENA-01' },
      officers: [{ id: 'OFF-NS-01', name: 'Elena Park', title: 'Managing Member', firstRecorded: 'Apr 11, 2021' }],
    },
    footprint: {
      physicalAddress: '2800 Commerce Training Way, Dallas, TX 75201',
      mailingAddress: 'PO Box 7318, Dallas, TX 75221',
      registeredAgent: 'Red Oak Registered Agent Services',
      phone: '(214) 555-0126',
      email: 'operations@northstar-market.training.example',
      website: 'https://northstar-market.training.example',
      operatingLocations: ['Dallas, TX', 'Austin, TX'],
      estimatedEmployeeCount: 14,
    },
    relationship: {
      relationshipStartDate: 'May 2, 2021',
      accounts: [
        { id: 'REL-NS-3904', product: 'Merchant settlement account ending 3904', status: 'Open · good standing', limit: 'Not applicable', balance: '$148,240.00', restrictions: 'None recorded', nsfContext: 'No returned settlement debit in the prior 90 days', repaymentSource: 'Daily processor settlements' },
      ],
    },
    research: [
      { id: 'LBR-NS-OWNER', topic: 'Owner linkage', status: 'Verified match', finding: 'Elena Park appears as managing member in the entity and onboarding records.', source: 'Texas Entity Registry Simulator · Record TX-SOS-8042917', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['OWN-NS-01', 'TX-SOS-8042917'] },
      { id: 'LBR-NS-REG', topic: 'Entity registration', status: 'Verified match', finding: 'A Texas entity-registration record is located for the exact legal name.', source: 'Texas Entity Registry Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['TX-SOS-8042917'] },
      { id: 'LBR-NS-LICENSE', topic: 'Industry or professional license', status: 'Not applicable', finding: 'The tested general retail license is not required for this online retail entity type in the simulated jurisdiction.', source: 'Texas License Requirement Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-NS-WEB', topic: 'Web presence', status: 'Verified match', finding: 'The domain and directory listing use the legal name, phone, and Dallas operating address.', source: 'Training Domain & Directory Index', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['WEB-NS-01', 'DIR-NS-01'] },
      { id: 'LBR-NS-CONSISTENCY', topic: 'Cross-source consistency', status: 'Verified match', finding: 'Names, owner, address, phone, and formation year align across the checked fictional sources.', source: 'Luna simulated source comparison', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
    ],
    sourceRecords: [
      { id: 'WEB-NS-01', title: 'northstar-market.training.example', category: 'Domain record', value: 'Registered to Northstar Digital Market LLC', source: 'Training Domain Registry', checkedDate: 'Jul 24, 2026', detail: 'Fictional domain record; no live internet search occurred.' },
      { id: 'DIR-NS-01', title: 'Northstar Digital Market directory listing', category: 'Business directory', value: '(214) 555-0126', source: 'Training Business Directory', checkedDate: 'Jul 24, 2026', detail: 'Fictional directory listing with Dallas operating address.' },
      { id: 'EIN-NS-7318', title: 'Masked EIN source record', category: 'EIN record', value: '**-***7318', source: 'Training tax-onboarding record', checkedDate: 'Jul 24, 2026', detail: 'Masked fictional identifier retained for profile comparison.' },
    ],
  }),
  'FA-CB-24007': makeProfile({
    businessId: 'BIZ-SB-2207',
    legalName: 'StreamBox Premium Media LLC',
    dba: 'StreamBox Premium',
    entityType: 'Limited liability company',
    ein: '**-***2207',
    registrationId: 'DE-FILE-6118032',
    formationDate: 'Aug 19, 2019',
    formationState: 'Delaware',
    standing: 'Good standing',
    industry: 'Subscription media services',
    naics: '516210 · Media streaming distribution services',
    ownership: {
      beneficialOwners: [
        { id: 'OWN-SB-01', name: 'Cameron Reed', ownershipPercentage: 55, role: 'Chief executive officer', verificationStatus: 'Identity record located', identityReference: 'OID-SB-CAMERON-01', firstRecorded: 'Aug 19, 2019' },
        { id: 'OWN-SB-02', name: 'Taylor Morgan', ownershipPercentage: 45, role: 'Managing member', verificationStatus: 'Identity record located', identityReference: 'OID-SB-TAYLOR-02', firstRecorded: 'Aug 19, 2019' },
      ],
      controllingParty: { name: 'Cameron Reed', title: 'Chief Executive Officer', identityReference: 'OID-SB-CAMERON-01' },
      officers: [{ id: 'OFF-SB-01', name: 'Cameron Reed', title: 'Chief Executive Officer', firstRecorded: 'Aug 19, 2019' }],
    },
    footprint: {
      physicalAddress: '1600 Media Training Plaza, Wilmington, DE 19801',
      mailingAddress: 'PO Box 2207, Wilmington, DE 19899',
      registeredAgent: 'First State Agent Cooperative',
      phone: '(302) 555-0144',
      email: 'business@streambox-premium.training.example',
      website: 'https://streambox-premium.training.example',
      operatingLocations: ['Wilmington, DE', 'San Jose, CA'],
      estimatedEmployeeCount: 28,
    },
    relationship: {
      relationshipStartDate: 'Sep 9, 2019',
      accounts: [
        { id: 'REL-SB-2207', product: 'Merchant operating account ending 2207', status: 'Open · good standing', limit: '$500,000 monthly processing limit', balance: '$361,440.00', restrictions: 'Rolling reserve recorded', nsfContext: 'One returned processor debit in the prior 12 months', repaymentSource: 'Subscription processor settlements' },
      ],
    },
    research: [
      { id: 'LBR-SB-OWNER', topic: 'Owner linkage', status: 'Verified match', finding: 'Cameron Reed appears in the formation and merchant-onboarding records.', source: 'Delaware Entity Registry Simulator · File 6118032', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-SB-REG', topic: 'Entity registration', status: 'Verified match', finding: 'A Delaware entity-registration record is located for the exact legal name.', source: 'Delaware Entity Registry Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-SB-LICENSE', topic: 'Industry or professional license', status: 'Not applicable', finding: 'The tested professional license is not applicable to the simulated subscription-media activity.', source: 'Delaware License Requirement Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-SB-WEB', topic: 'Web presence', status: 'Partial match', finding: 'The domain uses the DBA and phone; its public mailing address differs from the registered-agent address.', source: 'Training Domain & Directory Index', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-SB-CONSISTENCY', topic: 'Cross-source consistency', status: 'Partial match', finding: 'Legal name, owners, phone, and formation date align; operating and registered-agent addresses serve different purposes.', source: 'Luna simulated source comparison', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
    ],
    sourceRecords: [
      { id: 'WEB-SB-01', title: 'streambox-premium.training.example', category: 'Domain record', value: 'StreamBox Premium Media LLC', source: 'Training Domain Registry', checkedDate: 'Jul 24, 2026', detail: 'Fictional domain record; no live internet search occurred.' },
      { id: 'DIR-SB-01', title: 'StreamBox Premium directory listing', category: 'Business directory', value: '(302) 555-0144', source: 'Training Business Directory', checkedDate: 'Jul 24, 2026', detail: 'Fictional directory listing with Wilmington contact details.' },
      { id: 'EIN-SB-2207', title: 'Masked EIN source record', category: 'EIN record', value: '**-***2207', source: 'Training tax-onboarding record', checkedDate: 'Jul 24, 2026', detail: 'Masked fictional identifier retained for profile comparison.' },
    ],
  }),
  'FA-CR-24003': makeProfile({
    businessId: 'BIZ-LS-4821',
    legalName: 'Lakeside Office Supply LLC',
    dba: 'Lakeside Office Supply',
    entityType: 'Limited liability company',
    ein: '**-***4821',
    registrationId: 'TX-SOS-4821044',
    formationDate: 'Mar 12, 2022',
    formationState: 'Texas',
    standing: 'Active',
    industry: 'Office supplies and business services',
    naics: '459410 · Office supplies and stationery retailers',
    ownership: {
      beneficialOwners: [
        { id: 'OWN-LS-01', name: 'Renee Wallace', ownershipPercentage: 70, role: 'Managing member', verificationStatus: 'Identity record located', identityReference: 'OID-LS-RENEE-01', firstRecorded: 'Mar 12, 2022' },
        { id: 'OWN-LS-02', name: 'Devon Price', ownershipPercentage: 30, role: 'Operations member', verificationStatus: 'Identity record located', identityReference: 'OID-LS-DEVON-02', firstRecorded: 'Mar 12, 2022' },
      ],
      controllingParty: { name: 'Renee Wallace', title: 'Managing Member', identityReference: 'OID-LS-RENEE-01' },
      officers: [
        { id: 'OFF-LS-01', name: 'Renee Wallace', title: 'Managing Member', firstRecorded: 'Mar 12, 2022' },
        { id: 'OFF-LS-02', name: 'Devon Price', title: 'Operations Officer', firstRecorded: 'Mar 12, 2022' },
      ],
    },
    footprint: {
      physicalAddress: '4400 Lakeside Training Drive, Arlington, TX 76010',
      mailingAddress: 'PO Box 4821, Arlington, TX 76004',
      registeredAgent: 'Arlington Business Agent Group',
      phone: '(682) 555-0128',
      email: 'payroll@lakeside-office.training.example',
      website: 'https://lakeside-office.training.example',
      operatingLocations: ['Arlington, TX', 'Grand Prairie, TX'],
      estimatedEmployeeCount: 3,
    },
    relationship: {
      relationshipStartDate: 'Mar 22, 2022',
      accounts: [
        { id: 'REL-LS-4821', product: 'Business operating checking ending 4821', status: 'Open · good standing', limit: '$25,000 daily ACH limit', balance: '$63,840.00', restrictions: 'No active restriction or hold', nsfContext: 'One returned vendor debit in Mar 2026; resolved in two business days', repaymentSource: 'Operating deposits and customer receivables' },
        { id: 'REL-LS-8840', product: 'Payroll services · PAYROLL-LS-8840', status: 'Active', limit: '$45,000 per payroll run', balance: 'Not applicable', restrictions: 'Dual approval required', nsfContext: 'No returned payroll funding debit in the prior 12 months', repaymentSource: 'Operating checking ending 4821' },
      ],
    },
    research: [
      { id: 'LBR-LS-OWNER', topic: 'Owner linkage', status: 'Verified match', finding: 'Renee Wallace appears as the managing member in the entity-registration, bank-onboarding, and payroll-administrator records.', source: 'Texas Entity Registry Simulator · Record TX-SOS-4821044', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['OWN-LS-01', 'TX-SOS-4821044'] },
      { id: 'LBR-LS-REG', topic: 'Entity registration', status: 'Verified match', finding: 'A Texas entity-registration record is located for Lakeside Office Supply LLC.', source: 'Texas Entity Registry Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['TX-SOS-4821044'] },
      { id: 'LBR-LS-LICENSE', topic: 'Industry or professional license', status: 'Not applicable', finding: 'The tested professional license is not applicable to office-supply retail and distribution in the simulated jurisdiction.', source: 'Texas License Requirement Simulator', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
      { id: 'LBR-LS-WEB', topic: 'Web presence', status: 'Verified match', finding: 'The website, domain, and directory listing use the DBA, phone, and Arlington operating address.', source: 'Training Domain & Directory Index', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026', relatedRecords: ['WEB-LS-01', 'DIR-LS-01'] },
      { id: 'LBR-LS-CONSISTENCY', topic: 'Cross-source consistency', status: 'Verified match', finding: 'Legal name, DBA, owners, addresses, phone, formation date, and website align across the checked fictional sources.', source: 'Luna simulated source comparison', sourceType: 'Fictional training source', checkedDate: 'Jul 24, 2026' },
    ],
    sourceRecords: [
      { id: 'WEB-LS-01', title: 'lakeside-office.training.example', category: 'Domain record', value: 'Lakeside Office Supply LLC', source: 'Training Domain Registry', checkedDate: 'Jul 24, 2026', detail: 'Fictional domain record; no live internet search occurred.' },
      { id: 'DIR-LS-01', title: 'Lakeside Office Supply directory listing', category: 'Business directory', value: '(682) 555-0128', source: 'Training Business Directory', checkedDate: 'Jul 24, 2026', detail: 'Fictional directory listing with Arlington operating address.' },
      { id: 'EIN-LS-4821', title: 'Masked EIN source record', category: 'EIN record', value: '**-***4821', source: 'Training tax-onboarding record', checkedDate: 'Jul 24, 2026', detail: 'Masked fictional identifier retained for profile comparison.' },
      { id: 'BNK-LS-4821', title: 'Business account title record', category: 'Bank ownership record', value: 'Lakeside Office Supply LLC', source: 'Training institution onboarding ledger', checkedDate: 'Jul 24, 2026', detail: 'Account title matches the recorded legal entity; no employee payment destination is included.' },
    ],
  }),
};

function generatedProfile(activeCase, businessRecords) {
  const payrollContext = /payroll|employee|employment/i.test([
    activeCase.claimTypeId,
    activeCase.lane,
    activeCase.profile?.entityRole,
  ].join(' '));
  const sourceEntity = payrollContext
    ? businessRecords.business360?.[0]?.entity
      ?? activeCase.profile?.employer
      ?? activeCase.profile?.business
      ?? 'Harbor Business Services LLC'
    : activeCase.profile?.business
      ?? businessRecords.business360?.[0]?.entity
      ?? activeCase.profile?.employer
      ?? 'Harbor Business Services LLC';
  const seed = stableNumber(sourceEntity);
  const suffix = String(seed).padStart(5, '0').slice(-5);
  const legalName = /llc|inc\.?|corp\.?|company|co\./i.test(sourceEntity) ? sourceEntity : `${sourceEntity} LLC`;
  const dba = legalName.replace(/\s+(LLC|Inc\.?|Corp\.?|Company|Co\.)$/i, '');
  const formationState = activeCase.intake?.customerLocation?.split(',').at(-1)?.trim() || 'Texas';
  const entityType = /inc\.?|corp/i.test(legalName) ? 'Corporation' : 'Limited liability company';
  const formationDate = `${['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov'][seed % 6]} ${8 + (seed % 18)}, ${2018 + (seed % 6)}`;
  const ownerIsNamedParty = /owner|business applicant|business contact|managing member|borrower/i.test(activeCase.profile?.entityRole ?? activeCase.scenarioFamily ?? '');
  const primaryOwner = ownerIsNamedParty ? activeCase.person : `Morgan ${['Hayes', 'Reed', 'Stone', 'Price'][seed % 4]}`;
  const physicalAddress = `${200 + (seed % 7600)} ${['Cedar', 'Willow', 'Harbor', 'Lakeside'][seed % 4]} Training Parkway, ${activeCase.intake?.customerLocation ?? 'Dallas, TX'}`;
  const domainStem = dba.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  const businessId = `BIZ-${suffix}`;
  const registrationId = `${formationState.slice(0, 2).toUpperCase()}-SOS-${suffix}`;
  const checkedDate = activeCase.reportedDate ?? 'Jul 24, 2026';
  const licenseApplicable = /health|medical|construction|electrical|plumb|legal|accounting/i.test(activeCase.taxonomy?.claimFamily ?? activeCase.scenarioFamily ?? '');
  const accountBalance = `$${(42000 + (seed % 38000)).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  return makeProfile({
    businessId,
    legalName,
    dba,
    entityType,
    ein: `**-***${suffix.slice(-4)}`,
    registrationId,
    formationDate,
    formationState,
    standing: seed % 7 === 0 ? 'Active · annual report due' : 'Active',
    industry: activeCase.scenarioFamily ?? activeCase.taxonomy?.claimFamily ?? 'Business services',
    naics: `${440000 + (seed % 9000)} · Business services classification`,
    ownership: {
      beneficialOwners: [
        { id: `OWN-${suffix}-01`, name: primaryOwner, ownershipPercentage: 70, role: 'Managing member', verificationStatus: 'Identity record located', identityReference: `OID-${suffix}-01`, firstRecorded: formationDate },
        { id: `OWN-${suffix}-02`, name: `Taylor ${['Monroe', 'Bennett', 'Lane', 'Grant'][seed % 4]}`, ownershipPercentage: 30, role: 'Member', verificationStatus: seed % 5 === 0 ? 'Additional source requested' : 'Identity record located', identityReference: `OID-${suffix}-02`, firstRecorded: formationDate },
      ],
      controllingParty: { name: primaryOwner, title: 'Managing Member', identityReference: `OID-${suffix}-01` },
      officers: [{ id: `OFF-${suffix}-01`, name: primaryOwner, title: 'Managing Member', firstRecorded: formationDate }],
    },
    footprint: {
      physicalAddress,
      mailingAddress: `PO Box ${suffix.slice(-4)}, ${activeCase.intake?.customerLocation ?? 'Dallas, TX'}`,
      registeredAgent: `${['Cedar', 'Willow', 'Harbor', 'Lakeside'][seed % 4]} Registered Agent Services`,
      phone: `(555) 01${suffix.slice(-2)}-${suffix.slice(-4)}`,
      email: `operations@${domainStem}.training.example`,
      website: `https://${domainStem}.training.example`,
      operatingLocations: [activeCase.intake?.customerLocation ?? 'Dallas, TX'],
      estimatedEmployeeCount: Math.max(3, businessRecords.companyPayrollProfile?.activeEmployeeCount ?? (3 + (seed % 28))),
    },
    relationship: {
      relationshipStartDate: `${['Feb', 'Apr', 'Jun', 'Aug'][seed % 4]} ${4 + (seed % 20)}, ${2019 + (seed % 5)}`,
      accounts: [
        { id: `REL-${suffix}-OPERATING`, product: `Business operating checking ending ${suffix.slice(-4)}`, status: 'Open · good standing', limit: '$25,000 daily ACH limit', balance: accountBalance, restrictions: seed % 6 === 0 ? 'Document refresh due' : 'None recorded', nsfContext: seed % 4 === 0 ? 'One resolved returned payment in the prior 12 months' : 'No returned payment in the prior 12 months', repaymentSource: 'Operating deposits and receivables' },
        ...(businessRecords.companyPayrollProfile ? [{ id: `REL-${suffix}-PAYROLL`, product: `Payroll services · ${businessRecords.companyPayrollProfile.payrollId}`, status: 'Active', limit: '$50,000 per payroll run', balance: 'Not applicable', restrictions: 'Dual approval required', nsfContext: 'No returned payroll funding debit in the prior 12 months', repaymentSource: `Operating checking ending ${suffix.slice(-4)}` }] : []),
      ],
    },
    research: [
      { id: `LBR-${suffix}-OWNER`, topic: 'Owner linkage', status: seed % 5 === 0 ? 'Partial match' : 'Verified match', finding: `${primaryOwner} appears in the fictional entity and institution-onboarding records${seed % 5 === 0 ? '; the directory listing abbreviates the middle name' : ''}.`, source: `${formationState} Entity Registry Simulator · ${registrationId}`, sourceType: 'Fictional training source', checkedDate, relatedRecords: [`OWN-${suffix}-01`, registrationId] },
      { id: `LBR-${suffix}-REG`, topic: 'Entity registration', status: 'Verified match', finding: `An entity-registration record is located for the exact legal name in ${formationState}.`, source: `${formationState} Entity Registry Simulator`, sourceType: 'Fictional training source', checkedDate, relatedRecords: [registrationId] },
      { id: `LBR-${suffix}-LICENSE`, topic: 'Industry or professional license', status: licenseApplicable ? (seed % 6 === 0 ? 'No record located' : 'Verified match') : 'Not applicable', finding: licenseApplicable ? (seed % 6 === 0 ? 'No matching simulated professional-license record was located; this result requires other-source review.' : 'A matching simulated professional-license record is located for the business and controlling party.') : 'The professional license tested is not applicable to this business type in the simulated jurisdiction.', source: `${formationState} License Registry Simulator`, sourceType: 'Fictional training source', checkedDate },
      { id: `LBR-${suffix}-WEB`, topic: 'Web presence', status: seed % 7 === 0 ? 'Partial match' : 'Verified match', finding: `A fictional domain and directory listing are located for ${dba}; the legal name and phone are present.`, source: 'Training Domain & Directory Index', sourceType: 'Fictional training source', checkedDate, relatedRecords: [`WEB-${suffix}-01`, `DIR-${suffix}-01`] },
      { id: `LBR-${suffix}-CONSISTENCY`, topic: 'Cross-source consistency', status: seed % 7 === 0 ? 'Partial match' : 'Verified match', finding: seed % 7 === 0 ? 'Legal name, owner, and phone align; one directory address reflects a prior operating location.' : 'Names, addresses, phone, email, owner, and formation date align across the checked fictional sources.', source: 'Luna simulated source comparison', sourceType: 'Fictional training source', checkedDate },
    ],
    sourceRecords: [
      { id: `WEB-${suffix}-01`, title: `${domainStem}.training.example`, category: 'Domain record', value: legalName, source: 'Training Domain Registry', checkedDate, detail: 'Fictional domain record; no live internet search occurred.' },
      { id: `DIR-${suffix}-01`, title: `${dba} directory listing`, category: 'Business directory', value: `(555) 01${suffix.slice(-2)}-${suffix.slice(-4)}`, source: 'Training Business Directory', checkedDate, detail: 'Fictional directory record used for contact comparison.' },
      { id: `EIN-${suffix}`, title: 'Masked EIN source record', category: 'EIN record', value: `**-***${suffix.slice(-4)}`, source: 'Training tax-onboarding record', checkedDate, detail: 'Masked fictional identifier retained for profile comparison.' },
      { id: `BNK-${suffix}`, title: 'Business account title record', category: 'Bank ownership record', value: legalName, source: 'Training institution onboarding ledger', checkedDate, detail: 'Institution account title record; employee payment destinations are not included.' },
    ],
  });
}

export function getBusinessResearch(activeCase = {}) {
  const businessRecords = getBusinessRecords(activeCase);
  const profile = builtInProfiles[activeCase.id] ?? generatedProfile(activeCase, businessRecords);
  return {
    profile,
    recordsBySection: profile.recordsBySection,
    lookupValues: [profile.legalName, profile.dba, profile.ein, profile.registrationId, profile.footprint.physicalAddress],
    counts: {
      owners: profile.ownership.beneficialOwners.length,
      accounts: profile.relationship.accounts.length,
      researchChecks: profile.research.length,
      sourceRecords: profile.sourceRecords.length,
    },
  };
}

// Business 360 consumes a neutral, flattened compatibility shape while the
// Business Intelligence workspace keeps the richer nested research model.
export function getKybReview(activeCase = {}) {
  const workspace = getBusinessResearch(activeCase);
  const { profile } = workspace;
  return {
    profile: {
      businessId: profile.businessId,
      legalName: profile.legalName,
      dba: profile.dba,
      entityType: profile.entityType,
      registrationId: profile.registrationId,
      jurisdiction: profile.formationState,
      formationDate: profile.formationDate,
      standing: profile.standing,
      ein: profile.ein,
      address: profile.footprint.physicalAddress,
      mailingAddress: profile.footprint.mailingAddress,
      registeredAgent: profile.footprint.registeredAgent,
      phone: profile.footprint.phone,
      email: profile.footprint.email,
      website: profile.footprint.website,
      operatingLocations: profile.footprint.operatingLocations,
      estimatedEmployeeCount: profile.footprint.estimatedEmployeeCount,
      industry: profile.industry,
      naics: profile.naics,
      relationshipStartDate: profile.relationship.relationshipStartDate,
      relationshipAccounts: profile.relationship.accounts,
      source: 'Business 360 reusable profile and fictional source records',
      observed: activeCase.reportedDate ?? activeCase.opened ?? 'Jul 24, 2026',
      owners: profile.ownership.beneficialOwners.map((owner) => [
        owner.id,
        owner.legalName,
        owner.title,
        `${owner.ownershipPercentage}%`,
        owner.verificationDetails,
        owner.firstRecorded,
        owner.trainingId,
        owner,
      ]),
    },
    recordsByTab: workspace.recordsBySection,
    lookupValues: workspace.lookupValues,
    counts: workspace.counts,
    reviewedFacts: [],
  };
}

export function matchesBusinessResearchLookup(workspace, query = '') {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return false;
  return workspace.lookupValues.some((value) => String(value).trim().toLowerCase() === normalized);
}

export function businessRecordSearchText(record = {}) {
  return [record.id, record.title, record.category, record.value, record.observed, record.detail, ...(record.fields ?? []).flat(), ...(record.relatedRecords ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
