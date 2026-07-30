import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const sourceDir = path.join(rootDir, 'src');

const protectedPhraseRules = [
  { label: 'fraud score', pattern: /fraud\s+score/i },
  { label: 'red flag wording', pattern: /red\s+flags?/i },
  { label: 'green flag wording', pattern: /green\s+flags?/i },
  { label: 'correct answer wording', pattern: /correct\s+answer/i },
  { label: 'fraud-or-non-fraud reveal wording', pattern: /fraud\s*\/\s*non[-\s]?fraud/i },
  { label: 'AI recommendation wording', pattern: /ai\s+recommendations?/i },
  { label: 'final answer wording', pattern: /final\s+answer/i },
  { label: 'decision hint wording', pattern: /decision\s+hints?/i },
  { label: 'suggested-first-tool coaching', pattern: /\b(?:open|suggested)\s+first\s+tool\b/i },
  { label: 'visible investigator-question heading', pattern: /investigator\s+question/i },
];

const allowedLockContext = /\b(no|never|not|without|locked|lock|until|after|post[-\s]?submission|before submission|before the learner submits|must not|do not reveal|stays locked|keeps? .* locked|preserving evidence first)\b/i;
const allowedPostSubmissionFiles = new Set([
  path.join('src', 'AcademyProgress.jsx'),
  path.join('src', 'data', 'lunaDebrief.js'),
]);
const allowedDecisionStageFiles = new Set([
  path.join('src', 'data', 'decisionChecklist.js'),
  path.join('src', 'data', 'reviewPackage.js'),
]);

function walkDirectory(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkDirectory(fullPath);
    if (!/\.(js|jsx|ts|tsx|css)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

function normalizeRelative(file) {
  return path.relative(rootDir, file).split(path.sep).join('/');
}

function isAllowedUse({ relativeFile, lineText }) {
  if (allowedPostSubmissionFiles.has(relativeFile)) return true;
  if (allowedDecisionStageFiles.has(relativeFile)) return true;
  return allowedLockContext.test(lineText);
}

const violations = [];

for (const file of walkDirectory(sourceDir)) {
  const relativeFile = normalizeRelative(file);
  const lines = fs.readFileSync(file, 'utf8').split('\n');

  lines.forEach((lineText, index) => {
    for (const rule of protectedPhraseRules) {
      if (!rule.pattern.test(lineText)) continue;
      if (isAllowedUse({ relativeFile, lineText })) continue;
      violations.push(`${relativeFile}:${index + 1} contains ${rule.label}: ${lineText.trim()}`);
    }
  });
}

if (violations.length) {
  console.error('Evidence First check failed. Remove pre-submission answer leaks or visible investigation coaching:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Evidence First wording check passed.');
