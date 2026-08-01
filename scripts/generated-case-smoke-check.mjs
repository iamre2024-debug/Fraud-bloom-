const storage = new Map();
const legacyCase = {
  id: 'FA-LEGACY-G0000001',
  type: 'Legacy Generated Case',
  person: 'Legacy Learner',
  trainingId: 'TRN-LEGACY-1',
  claimId: 'CLM-LEGACY-1',
  allegation: 'Legacy local case preserved for migration coverage.',
  queueReason: 'Migration smoke coverage.',
  facts: ['No final outcome shown', 'Evidence First lock active'],
  loginHistory: [{ id: 'LEGACY-LOG-1', deviceId: 'DEV-LEGACY-1' }],
  generatedAt: 1,
};

storage.set('fraud-academy-generated-cases-v1', JSON.stringify([legacyCase]));

global.window = {
  localStorage: {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    },
    removeItem(key) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  },
};

const {
  combineCaseCatalog,
  generateAndSaveCases,
  generateAndSaveCase,
  getGeneratedCaseRepository,
  listGeneratedCases,
} = await import('../src/data/generatedCaseRepository.js');
const { coreClaimTypes } = await import('../src/data/claimRegistry.js');
const {
  CUSTOMER_TYPES,
  FINAL_FINDINGS,
  WORKFLOW_TYPES,
} = await import('../src/data/caseDomain.js');
const { getScenarioTruth } = await import('../src/data/claimScenarioCatalog.js');
const { createGeneratedCase } = await import('../src/data/generatedCases.js');
const { getCustomer360Dossier } = await import('../src/data/customer360Dossier.js');
const { getIdentityIntelReport } = await import('../src/data/identityIntelReport.js');
const { getLoginRecords } = await import('../src/data/loginRecords.js');
const { getSessionRecords } = await import('../src/data/sessionRecords.js');
const { getIpRecords } = await import('../src/data/ipRecords.js');
const { buildAccessHistoryReport } = await import('../src/data/accessHistoryReports.js');
const { enrichTrainingCases } = await import('../src/data/caseEnrichment.js');

const failures = [];
const repository = await getGeneratedCaseRepository();
const created = [];

if (repository.kind !== 'localStorage') failures.push(`Expected Node smoke fallback repository, found ${repository.kind}.`);

for (let index = 0; index < 124; index += 1) {
  created.push(await generateAndSaveCase());
}

const batch = await generateAndSaveCases({
  count: 30,
  claimTypeId: 'non-fraud-chargeback',
  scenarioId: 'ncb-recurring-cancellation',
  difficulty: 'deep',
  evidenceDepth: 'standard',
});

const saved = await listGeneratedCases();
const ids = new Set(saved.map((item) => item.id));
const enrichedSaved = enrichTrainingCases(saved);
const accountIds = new Set(enrichedSaved.map((item) => item.accountId));

if (saved.length !== 155) failures.push(`Expected 155 generated cases after single and unbounded batch generation, found ${saved.length}.`);
if (!ids.has(legacyCase.id)) failures.push('Legacy localStorage case was not preserved.');
if (ids.size !== saved.length) failures.push('Generated case IDs are not unique.');
if (accountIds.size !== enrichedSaved.length || enrichedSaved.some((item) => !item.accountId?.startsWith('ACCT-'))) failures.push('Every saved case must expose a unique Account ID after catalog enrichment.');
if (enrichedSaved.some((item) => item.customer?.relationship?.find((entry) => entry.label === 'Account ID')?.value !== item.accountId)) failures.push('Every saved case must expose its Account ID in Customer 360.');
if (saved.filter((item) => item.generatedPacketVersion).some((item) => (
  item.generatedPacketVersion !== 8
  || item.customer?.relationshipPacketVersion !== 1
  || !item.customer?.identity?.sourceRecordId
  || item.customer?.serviceContacts?.length !== 2
  || !item.customer?.relationshipProfile?.sourceRecordId
))) {
  failures.push('The generated-case repository did not persist the versioned Customer 360 source packet.');
}
if (batch[batch.length - 1]?.id !== saved[0]?.id) failures.push('Newest generated batch case was not added to the front of the queue.');
if (batch.length !== 30) failures.push('Batch generation still applies the former 25-case artificial cap.');

for (const item of saved) {
  for (const field of ['id', 'type', 'person', 'trainingId', 'claimId', 'allegation', 'queueReason']) {
    if (!item[field]) failures.push(`${item.id ?? 'Generated case'} is missing ${field}.`);
  }

  if (!item.facts?.includes('No final outcome shown')) failures.push(`${item.id} is missing the Evidence First outcome guard.`);
  if (!item.facts?.includes('Evidence First lock active')) failures.push(`${item.id} is missing the Evidence First lock marker.`);
  if (!item.loginHistory?.every((entry) => entry.deviceId)) failures.push(`${item.id} has a login without a Device ID.`);
}

for (const [index, claimType] of coreClaimTypes.entries()) {
  const generated = createGeneratedCase({
    index: 950000 + index,
    claimTypeId: claimType.id,
    scenarioId: claimType.scenarios[0]?.id,
    difficulty: 'deep',
    evidenceDepth: 'standard',
  });
  if (generated.claimTypeId !== claimType.id) failures.push(`${claimType.label} did not preserve its claim type ID.`);
  if (generated.type !== claimType.label) failures.push(`${claimType.label} did not preserve its official display name.`);
  if (generated.lane !== claimType.lane) failures.push(`${claimType.label} did not preserve its lane.`);
  if (!generated.statement?.value || !generated.intakeAnswers?.length || !generated.caseBriefing?.summary) {
    failures.push(`${claimType.label} is missing its complete Case Briefing intake packet.`);
  }
  if (generated.intakeAnswers.length !== claimType.intakePrompts.length || generated.intakeAnswers.some((item) => /review the related|available when that tool|available for comparison|intake channel:|fictional subject/i.test(item.answer))) {
    failures.push(`${claimType.label} has a generic or incomplete Claim Intake packet.`);
  }
  if (!generated.assignedInvestigator || !generated.assignedDate || !generated.dueDate) {
    failures.push(`${claimType.label} is missing universal Case Briefing ownership or deadline details.`);
  }
  if (generated.parties?.length < 2 || generated.parties.some((party) => !party.role || !party.name || !party.relationship || !party.source)) {
    failures.push(`${claimType.label} is missing complete Case Briefing party records.`);
  }
  const briefingRows = generated.briefingDetails?.rows ?? [];
  if (!generated.briefingDetails?.title || briefingRows.length < 6 || briefingRows.some((row) => !row.label || !row.value)) {
    failures.push(`${claimType.label} is missing structured lane-specific Case Briefing details.`);
  }
  if (!generated.requiredTools?.length || !generated.availableTools?.length || !generated.documents?.length || !generated.toolResults?.evidence?.length) {
    failures.push(`${claimType.label} is missing required investigation packet data.`);
  }
  if (generated.customer?.profileChanges?.length < 3 || generated.customer.profileChanges.some((event) => !event.eventType || !event.oldValue || !event.newValue || !event.session || !event.notes)) {
    failures.push(`${claimType.label} is missing complete generated profile-maintenance history.`);
  }
  const persistedCustomerIdentity = generated.customer?.identity;
  if (generated.generatedPacketVersion !== 8 || generated.customer?.relationshipPacketVersion !== 1) {
    failures.push(`${claimType.label} is missing the generated packet or Customer 360 source-packet version.`);
  }
  for (const field of [
    'sourceRecordId',
    'legalName',
    'dob',
    'currentAddress',
    'previousAddress',
    'mobilePhone',
    'email',
    'customerSince',
    'segment',
    'preferredContact',
    'verificationStatus',
    'lastVerified',
    'accountStanding',
    'maskedMemberId',
  ]) {
    if (!persistedCustomerIdentity?.[field]) {
      failures.push(`${claimType.label} is missing persisted Customer 360 identity field ${field}.`);
    }
  }
  if (
    persistedCustomerIdentity?.legalName !== generated.person
    || persistedCustomerIdentity?.currentAddress !== generated.customer?.contact?.address
  ) {
    failures.push(`${claimType.label} Customer 360 identity does not preserve its generated persona source.`);
  }
  const persistedServiceContacts = generated.customer?.serviceContacts ?? [];
  if (
    persistedServiceContacts.length !== 2
    || persistedServiceContacts.some((contact, contactIndex) => (
      contact.id !== `${generated.id}-SVC-${contactIndex + 1}`
      || !contact.sourceRecordId
      || !contact.dateTime
      || !contact.type
      || !contact.channel
      || !contact.notes
      || !contact.relatedAccountId
    ))
  ) {
    failures.push(`${claimType.label} is missing stable persisted Customer 360 service-contact rows.`);
  }
  for (const contact of persistedServiceContacts) {
    const matchingProfileSource = generated.customer?.profileChanges?.find(
      (event) => event.id === contact.sourceRecordId,
    );
    const matchingAccountSource = generated.toolResults?.relationshipAccounts?.find(
      (account) => account.accountId === contact.sourceRecordId,
    );
    if (!matchingProfileSource && !matchingAccountSource) {
      failures.push(`${claimType.label} service contact ${contact.id} does not trace to a persisted source row.`);
      continue;
    }
    if (matchingProfileSource && (
      contact.type !== matchingProfileSource.eventType
      || contact.channel !== matchingProfileSource.channel
    )) {
      failures.push(`${claimType.label} service contact ${contact.id} does not preserve its profile-event semantics.`);
    }
    if (matchingAccountSource && contact.type !== 'Relationship account status review') {
      failures.push(`${claimType.label} account-backed service contact ${contact.id} has the wrong semantic label.`);
    }
  }
  const relationshipProfile = generated.customer?.relationshipProfile;
  if (
    relationshipProfile?.sourceRecordId !== `${generated.id}-C360-RELATIONSHIP`
    || !relationshipProfile?.asOf
    || !relationshipProfile?.normalDeposits
    || !relationshipProfile?.normalSpending
    || !relationshipProfile?.authorizedUsers
    || !relationshipProfile?.digitalBanking
  ) {
    failures.push(`${claimType.label} is missing its persisted Customer 360 relationship profile.`);
  }
  const customerDossier = getCustomer360Dossier(generated);
  const identityReport = getIdentityIntelReport(generated);
  const loginRecords = getLoginRecords(generated);
  const sessionRecords = getSessionRecords(generated);
  const ipRecords = getIpRecords(generated);
  const usesAccessHistory = generated.availableTools.includes('Login History');
  if (!customerDossier.products.length || customerDossier.recentContacts.length < 2) failures.push(`${claimType.label} is missing generated Customer 360 depth.`);
  if (identityReport.sections.length < 17 || identityReport.sections.some((section) => !section.fields.length)) failures.push(`${claimType.label} is missing generated Identity Intel field depth.`);
  if (usesAccessHistory) {
    if (!loginRecords.some((record) => /successful/i.test(record.result)) || !loginRecords.some((record) => /failed|locked/i.test(record.result))) failures.push(`${claimType.label} is missing varied generated authentication outcomes.`);
    if (loginRecords.some((record) => !record.timestamp || !record.eventType || !record.operatingSystem || record.failedAttemptCount === undefined)) failures.push(`${claimType.label} is missing complete generated Login History fields.`);
    if (sessionRecords.length < 2 || sessionRecords.some((record) => /not recorded/i.test(`${record.end} ${record.duration} ${record.pagesViewed.join(' ')}`))) failures.push(`${claimType.label} is missing complete generated Session History paths.`);
    if (!ipRecords.length || ipRecords.some((record) => /lookup needed/i.test(`${record.city} ${record.isp} ${record.networkType} ${record.vpnProxyTor}`))) failures.push(`${claimType.label} is missing generated IP Intelligence lookup depth.`);
    for (const reportType of ['login', 'session', 'ip']) {
      const report = buildAccessHistoryReport(generated, reportType);
      if (!report.pages.length || !report.fields.length || report.folder !== 'System Reports') failures.push(`${claimType.label} is missing the ${reportType} access-history report.`);
    }
  } else if (loginRecords.length || sessionRecords.length || ipRecords.length) {
    failures.push(`${claimType.label} generated access-history records outside its selected scenario lane.`);
  }
  if (claimType.chargeback && !generated.chargebackDecision?.reasonCode) {
    failures.push(`${claimType.label} is missing chargeback reason-code packet details.`);
  }
  if (claimType.credit && !generated.creditDecision?.deadline) {
    failures.push(`${claimType.label} is missing credit decision rail details.`);
  }
}

for (const workflowType of [
  'card-account-takeover',
  'personal-account-takeover',
  'business-account-takeover',
  'payroll-account-takeover',
]) {
  const atoWorkflow = coreClaimTypes.find((claimType) => claimType.id === workflowType);
  if (!atoWorkflow?.requiredTools.includes('Session History')) {
    failures.push(`${workflowType} must require Session History review.`);
  }
  if (!atoWorkflow?.requiredTools.includes('IP Intelligence')) {
    failures.push(`${workflowType} must require IP Intelligence review.`);
  }
}

const applicationClaim = coreClaimTypes.find((claimType) => claimType.id === WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW);
const confirmedApplicationScenarios = applicationClaim.scenarios.filter((scenario) => (
  getScenarioTruth(applicationClaim.id, scenario.id)?.finalFinding === FINAL_FINDINGS.FRAUD_CONFIRMED
));
const confirmedApplicationCustomerTypes = new Set();
const hiddenApplicationLabels = /\b(synthetic identity|stolen identity|fabricated business information|bust[- ]out|mule activity|money mule)\b/i;

for (const [scenarioIndex, scenario] of confirmedApplicationScenarios.entries()) {
  const customerType = scenario.customerTypes[0];
  const productType = scenario.productTypes[0];
  const generated = createGeneratedCase({
    index: 975000 + scenarioIndex,
    customerType,
    productType,
    workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
    scenarioId: scenario.id,
    difficulty: 'deep',
    evidenceDepth: 'deep',
  });
  const records = generated.toolResults?.applicationVerification ?? [];
  const credit = generated.toolResults?.creditProfile;
  confirmedApplicationCustomerTypes.add(customerType);

  if (records.length < 2) {
    failures.push(`${scenario.id} must include at least two evidence-backed application comparison records.`);
  }
  for (const record of records) {
    if (!record.id || record.basisCategory !== 'Independent source mismatch') {
      failures.push(`${scenario.id} application evidence must identify an independent source-mismatch basis.`);
    }
    if (!/mismatch corroborated/i.test(record.comparisonStatus) || !record.corroboration) {
      failures.push(`${scenario.id}/${record.id} must explain the independent corroboration.`);
    }
    if (!Array.isArray(record.sourceRecordIds) || record.sourceRecordIds.length < 2 || record.sourceRecordIds.some((sourceId) => !/^[A-Z]{3}-\d{6}$/.test(sourceId))) {
      failures.push(`${scenario.id}/${record.id} must expose exact fictional source record IDs.`);
    }
    if (!Array.isArray(record.sourceSystems) || record.sourceSystems.length < 2) {
      failures.push(`${scenario.id}/${record.id} must identify at least two independent source systems.`);
    }
    if ((record.sourceRecordIds ?? []).some((sourceId) => !`${record.value} ${record.context}`.includes(sourceId))) {
      failures.push(`${scenario.id}/${record.id} must tie every source record ID to its comparison detail.`);
    }
    if (!/document completeness and credit strength are separate/i.test(record.conclusionBoundary)) {
      failures.push(`${scenario.id}/${record.id} must keep paperwork and credit weakness separate from the source finding.`);
    }
  }
  if (credit?.missingDocuments?.length || credit?.delinquencies || credit?.nsfReturns || /below 620/i.test(credit?.creditScoreBand ?? '')) {
    failures.push(`${scenario.id} must not use missing paperwork or weak credit as the basis for a confirmed application finding.`);
  }
  if (hiddenApplicationLabels.test(JSON.stringify(records))) {
    failures.push(`${scenario.id} exposes a hidden scenario label in its pre-submission application evidence.`);
  }
  if (customerType === CUSTOMER_TYPES.BUSINESS && records.some((record) => !generated.toolResults.applicationVerification?.some((item) => item.id === record.id))) {
    failures.push(`${scenario.id} business comparison evidence must remain available to Business 360 and the application review.`);
  }
  if (records.some((record) => !generated.identityRecords?.some((item) => item.id === record.id))) {
    failures.push(`${scenario.id} application comparison evidence must be available in the identity source record packet.`);
  }
}

if (!confirmedApplicationCustomerTypes.has(CUSTOMER_TYPES.PERSONAL) || !confirmedApplicationCustomerTypes.has(CUSTOMER_TYPES.BUSINESS)) {
  failures.push('Confirmed application scenarios must cover evidence-backed personal and business reviews.');
}

const incompleteApplicationScenario = applicationClaim.scenarios.find((scenario) => (
  getScenarioTruth(applicationClaim.id, scenario.id)?.finalFinding === FINAL_FINDINGS.VERIFICATION_INCOMPLETE
));
const incompleteApplicationCase = createGeneratedCase({
  index: 975100,
  customerType: incompleteApplicationScenario.customerTypes[0],
  productType: incompleteApplicationScenario.productTypes[0],
  workflowType: WORKFLOW_TYPES.CREDIT_APPLICATION_REVIEW,
  scenarioId: incompleteApplicationScenario.id,
  difficulty: 'deep',
  evidenceDepth: 'deep',
});
if (incompleteApplicationCase.toolResults?.applicationVerification?.length) {
  failures.push('Missing or incomplete application verification must not generate confirmed-finding comparison records.');
}

const focusedCase = createGeneratedCase({
  index: 980001,
  claimTypeId: 'account-takeover',
  scenarioId: 'ato-phishing-wallet',
  difficulty: 'light',
  evidenceDepth: 'light',
});
const complexCase = createGeneratedCase({
  index: 980002,
  claimTypeId: 'account-takeover',
  scenarioId: 'ato-phishing-wallet',
  difficulty: 'deep',
  evidenceDepth: 'light',
});
if (complexCase.toolResults.transactions.length <= focusedCase.toolResults.transactions.length) {
  failures.push('Difficulty should increase cross-record investigation complexity without changing the claim lane.');
}

const baseCases = [{ id: saved[0].id }, { id: 'BUILT-IN-CASE' }];
const combined = combineCaseCatalog(baseCases, saved);
const combinedIds = combined.map((item) => item.id);

if (combinedIds.filter((id) => id === saved[0].id).length !== 1) failures.push('combineCaseCatalog duplicated an existing case ID.');
if (!combinedIds.includes('BUILT-IN-CASE')) failures.push('combineCaseCatalog removed a built-in case.');

if (failures.length) {
  console.error('Generated case smoke check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Generated case smoke check passed. The repository adapter preserves legacy cases and keeps an unbounded queue of unique Evidence First cases.');
