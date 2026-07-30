export const investigationToolGroups = [
  {
    key: 'identity',
    label: 'Identity & Customer',
    icon: '👤',
    question: 'Who is the customer, and which identity records are available for review?',
    tools: ['Customer 360', 'Identity Intel / People Search'],
  },
  {
    key: 'digital',
    label: 'Login, Session, Device & IP',
    icon: '📱',
    question: 'What access activity, devices, sessions, and network locations are recorded?',
    tools: ['Login History', 'Session History', 'Device Intelligence', 'IP Intelligence'],
  },
  {
    key: 'financial',
    label: 'Transactions & Financial',
    icon: '💳',
    question: 'What transaction and financial records are in scope for this case?',
    tools: ['Transaction History', 'Financial Investigation'],
  },
  {
    key: 'merchant',
    label: 'Merchant & Disputes',
    icon: '🏪',
    question: 'What merchant, authorization, fulfillment, refund, and dispute evidence is available?',
    tools: ['Merchant Intelligence'],
  },
  {
    key: 'business',
    label: 'Business & Payment Verification',
    icon: '🏢',
    question: 'What business, employee, payroll, and payment-verification facts are available?',
    tools: ['Payment Verification', 'Business 360', 'Employee Profile', 'Payroll History'],
  },
  {
    key: 'evidence',
    label: 'Documents & Requests',
    icon: '📎',
    question: 'Which case documents are available, requested, pending, or ready to compare?',
    tools: ['Document Viewer', 'Document Request'],
  },
  {
    key: 'connections',
    label: 'Links & Related Cases',
    icon: '🔗',
    question: 'Which case objects, access records, and related identifiers connect?',
    tools: ['Link Analysis', 'System Access Lane'],
  },
];

export const workflowReviewGroup = {
  key: 'workflow',
  label: 'Workflow Review',
  icon: '🧭',
  question: 'How should reviewed records move into the timeline and decision workflow?',
  tools: ['Timeline'],
};

export const workspaceMapBlueprints = Object.freeze([
  {
    key: 'identity',
    label: 'Identity & Customer',
    icon: 'user',
    sourceGroups: ['identity'],
    tone: 'violet',
  },
  {
    key: 'digital',
    label: 'Login, Session, Device & IP',
    icon: 'channel',
    sourceGroups: ['digital'],
    tone: 'cyan',
  },
  {
    key: 'financial',
    label: 'Transactions, Merchant & Financial',
    icon: 'payment',
    sourceGroups: ['financial', 'merchant'],
    tone: 'amber',
  },
  {
    key: 'business',
    label: 'Business & Payment Verification',
    icon: 'merchant',
    sourceGroups: ['business'],
    tone: 'mint',
  },
  {
    key: 'evidence',
    label: 'Evidence, Links & Workflow',
    icon: 'evidence',
    sourceGroups: ['evidence', 'connections', 'workflow'],
    tone: 'pink',
  },
]);

export const workspaceTools = [
  ...investigationToolGroups.flatMap((group) => group.tools),
  ...workflowReviewGroup.tools,
];

export const legacyToolAliases = {
  'Evidence Center': 'Document Viewer',
  'Financial Intelligence': 'Financial Investigation',
  'Identity Intelligence': 'Identity Intel / People Search',
  'Business Intelligence': 'Business 360',
  'KYB Review': 'Business 360',
};

export function canonicalToolName(toolName) {
  return legacyToolAliases[toolName] ?? toolName;
}

export function canonicalToolNames(toolNames = []) {
  return [...new Set(toolNames.map(canonicalToolName))];
}

export function groupForTool(toolName) {
  const canonicalName = canonicalToolName(toolName);
  return investigationToolGroups.find((group) => group.tools.includes(canonicalName))
    ?? (workflowReviewGroup.tools.includes(canonicalName) ? workflowReviewGroup : null);
}
