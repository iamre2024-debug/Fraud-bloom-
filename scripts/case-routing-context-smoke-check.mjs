import assert from 'node:assert/strict';

import { enrichTrainingCases } from '../src/data/caseEnrichment.js';
import { trainingCases } from '../src/data/cases.js';
import { coreClaimTypes } from '../src/data/claimRegistry.js';
import { createGeneratedCase } from '../src/data/generatedCases.js';
import { containsHiddenAnswer } from '../src/data/publicCaseView.js';

const builtIns = enrichTrainingCases(trainingCases);
const generated = [];
let index = 4_200_000;

for (const claimType of coreClaimTypes) {
  for (const scenario of claimType.scenarios) {
    for (const field of ['caseOriginType', 'caseOrigin', 'caseEscalationReason', 'alertHandlingNote']) {
      assert.ok(String(scenario[field] ?? '').trim(), `${scenario.id} is missing ${field}.`);
    }
    assert.ok(scenario.caseEscalationReason.length >= 90, `${scenario.id} needs a detailed escalation explanation.`);
    assert.equal(containsHiddenAnswer(scenario.caseEscalationReason), false, `${scenario.id} exposes hidden truth in its escalation explanation.`);
    assert.equal(containsHiddenAnswer(scenario.alertHandlingNote), false, `${scenario.id} exposes hidden truth in its routing boundary.`);
    if (scenario.caseOriginType === 'operations-alert') {
      assert.match(scenario.alertHandlingNote, /not every alert becomes a case/i, `${scenario.id} must explain the alert-to-case boundary.`);
    }
    if (scenario.caseOriginType === 'credit-policy-review') {
      assert.match(scenario.alertHandlingNote, /can be normal/i, `${scenario.id} must explain that the reviewed credit activity can be normal.`);
    }

    const item = createGeneratedCase({
      index: index += 1,
      claimTypeId: claimType.id,
      scenarioId: scenario.id,
      difficulty: 'standard',
      evidenceDepth: 'standard',
    });
    generated.push(item);
    assert.equal(item.caseOriginType, scenario.caseOriginType, `${scenario.id} lost its origin type during generation.`);
    if (scenario.caseEscalationReason.includes(scenario.amount)) {
      assert.ok(item.caseEscalationReason.includes(item.amount), `${scenario.id} escalation context does not use the generated amount.`);
    }
    assert.equal(item.events.some((event) => event.label === 'Alerted activity recorded'), false, `${scenario.id} still treats ordinary activity as an alert by itself.`);
    assert.match(item.events[0].detail, /activity alone is not a finding/i, `${scenario.id} does not preserve the activity/finding boundary.`);
  }
}

for (const item of builtIns) {
  assert.ok(item.caseOriginType, `${item.id} is missing a case origin type.`);
  assert.ok(item.caseOrigin, `${item.id} is missing a case origin.`);
  assert.ok(item.caseEscalationReason, `${item.id} is missing escalation context.`);
  assert.ok(item.alertHandlingNote, `${item.id} is missing a routing boundary.`);
}

const avery = builtIns.find((item) => item.id === 'FA-CR-24003');
assert.match(avery.caseEscalationReason, /one-day-old.*\$8,000.*five minutes.*new external destination/i);
assert.match(avery.alertHandlingNote, /draw alone would not become a case/i);

console.log(`Case routing context smoke check passed for ${builtIns.length} built-in cases and ${generated.length} unlimited-catalog scenarios.`);
