export const storageKeys = {
  tray: 'fraud-academy-visual-tray-v1',
  notes: 'fraud-academy-notes-v1',
  noteDrafts: 'fraud-academy-note-drafts-v1',
  completed: 'fraud-academy-completed-tools-v1',
  decisions: 'fraud-academy-decision-drafts-v1',
  packages: 'fraud-academy-review-packages-v1',
  actions: 'fraud-academy-action-log-v1',
  documentRequests: 'fraud-academy-document-requests-v2',
  quickPad: 'fraud-academy-quick-pad-v1',
  payrollInvestigations: 'fraud-academy-payroll-investigations-v1',
  debriefs: 'fraud-academy-completed-debriefs-v1',
};

export const cloudResourceModes = {
  [storageKeys.tray]: 'array',
  [storageKeys.notes]: 'array',
  [storageKeys.noteDrafts]: 'value',
  [storageKeys.completed]: 'array',
  [storageKeys.decisions]: 'value',
  [storageKeys.packages]: 'array',
  [storageKeys.actions]: 'array',
  [storageKeys.documentRequests]: 'value',
  [storageKeys.quickPad]: 'value',
  [storageKeys.payrollInvestigations]: 'value',
  [storageKeys.debriefs]: 'array',
};

export const cloudResourceKeys = Object.keys(cloudResourceModes);
