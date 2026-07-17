import type { Resume } from '@/types';
import { collectBullets, resumeToPlainText, stripHtml } from './resumeText';

export const ACTION_VERBS = {
  Leadership: ['Directed', 'Spearheaded', 'Orchestrated', 'Championed', 'Mentored'],
  Engineering: ['Engineered', 'Architected', 'Deployed', 'Optimized', 'Automated', 'Debugged', 'Implemented'],
  Analysis: ['Analyzed', 'Evaluated', 'Forecasted', 'Identified', 'Quantified'],
  Creation: ['Designed', 'Developed', 'Built', 'Launched', 'Produced'],
  Collaboration: ['Partnered', 'Coordinated', 'Facilitated', 'Unified'],
  Impact: ['Reduced', 'Increased', 'Generated', 'Improved', 'Accelerated', 'Delivered'],
} as const;

export const WEAK_LANGUAGE = [
  { phrase: 'helped', replacements: ['Supported', 'Contributed to', 'Enabled'] },
  { phrase: 'worked on', replacements: ['Developed', 'Built', 'Advanced'] },
  { phrase: 'assisted', replacements: ['Coordinated', 'Supported', 'Executed'] },
  { phrase: 'was responsible for', replacements: ['Owned', 'Managed', 'Led'] },
  { phrase: 'responsibilities included', replacements: ['Owned', 'Managed', 'Led'] },
  { phrase: 'participated in', replacements: ['Collaborated on', 'Contributed to', 'Executed'] },
  { phrase: 'involved in', replacements: ['Contributed to', 'Supported', 'Advanced'] },
  { phrase: 'team player', replacements: ['Collaborated with', 'Partnered with', 'Coordinated across'] },
  { phrase: 'hard worker', replacements: ['Delivered', 'Executed', 'Drove'] },
  { phrase: 'self-starter', replacements: ['Initiated', 'Launched', 'Owned'] },
  { phrase: 'detail-oriented', replacements: ['Audited', 'Validated', 'Reviewed'] },
  { phrase: 'duties included', replacements: ['Owned', 'Managed', 'Executed'] },
] as const;

export type WeakLanguageRule = (typeof WEAK_LANGUAGE)[number];

/** Find weak phrases in a single bullet/string (for inline coaching UI). */
export function findWeakPhrasesInText(content: string): WeakLanguageRule[] {
  const plain = stripHtml(content);
  return WEAK_LANGUAGE.filter((weak) =>
    new RegExp(`\\b${escapeRegex(weak.phrase)}\\b`, 'i').test(plain),
  );
}

export function replaceWeakPhrase(content: string, phrase: string, replacement: string): string {
  return content.replace(new RegExp(`\\b${escapeRegex(phrase)}\\b`, 'i'), replacement);
}

const STOP_WORDS = new Set([
  'and',
  'the',
  'with',
  'for',
  'from',
  'that',
  'this',
  'into',
  'using',
  'will',
  'your',
  'you',
  'are',
  'our',
  'their',
  'have',
  'has',
  'job',
  'role',
  'team',
  'work',
]);

export interface BulletAnalysis {
  id: string;
  label: string;
  content: string;
  hasMetric: boolean;
  startsWithAction: boolean;
  suggestions: BulletSuggestion[];
}

export type BulletSuggestion = 'actionVerb' | 'metric' | 'length';

export interface WeakLanguageHit {
  phrase: string;
  replacementOptions: string[];
  bulletLabel: string;
  content: string;
}

export interface KeywordHit {
  keyword: string;
  found: boolean;
  suggestedSection: string;
}

export function rewriteBullet(content: string, instruction: string): string[] {
  const clean = stripHtml(content);
  const object = clean.replace(/^(helped|worked on|assisted|was responsible for|participated in|involved in)\s+/i, '');
  const metricHint = /\d|%|\$|users?|customers?|hours?|minutes?/i.test(clean)
    ? ''
    : ' to improve measurable team outcomes';
  const concise = instruction.toLowerCase().includes('concise');

  const options = [
    `Improved ${lowercaseFirst(object)}${metricHint}`,
    `Delivered ${lowercaseFirst(object)}${metricHint}`,
    `Optimized ${lowercaseFirst(object)}${metricHint}`,
  ].map((value) => (concise ? trimToWords(value, 18) : value));

  return Array.from(new Set(options));
}

// One-line fit threshold. EB Garamond at 10pt on a 6.5in body fits roughly
// 95-110 plain-text characters per line. We use 100 as the conservative cutoff
// for warning the user that their bullet probably wraps.
export const ONE_LINE_TARGET = 100;

// Local heuristic shortener: removes redundant fillers, collapses common
// long phrases, and trims helping verbs that pad without adding meaning.
// Pure text-in / text-out so it can run offline (no AI key needed). Returns
// the original content untouched if it can't shave anything off.
export function shortenBullet(rawHtml: string, target = ONE_LINE_TARGET): string {
  const clean = stripHtml(rawHtml).trim();
  if (clean.length <= target) return clean;

  let next = clean;
  // Drop weak fillers (whole-word, case-insensitive).
  const fillers = [
    /\b(very|really|just|simply|truly|actually|literally|quite|basically|currently)\s/gi,
    /\b(in order to)\b/gi,
    /\b(was able to|were able to)\b/gi,
    /\b(a lot of|lots of)\b/gi,
    /\b(due to the fact that)\b/gi,
    /\b(at the time of|at this time)\b/gi,
    /\b(as well as)\b/gi,
    /\b(in addition to)\b/gi,
    /\b(approximately|roughly|around)\b/gi,
    /\b(of the|of a|of an)\b/gi,
  ];
  const replacements: [RegExp, string][] = [
    [/\b(in order to)\b/gi, 'to'],
    [/\b(was able to|were able to)\b/gi, ''],
    [/\b(a lot of|lots of)\b/gi, 'many'],
    [/\b(due to the fact that)\b/gi, 'because'],
    [/\b(at the time of|at this time)\b/gi, 'when'],
    [/\b(as well as)\b/gi, 'and'],
    [/\b(in addition to)\b/gi, 'and'],
    [/\b(approximately|roughly|around)\b/gi, '~'],
  ];
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }
  for (const filler of fillers) {
    if (next.length <= target) break;
    next = next.replace(filler, ' ');
  }
  next = next.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

  // Still too long? Trim trailing parenthetical / "to..." clauses.
  if (next.length > target) {
    next = next.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }
  if (next.length > target) {
    next = next.replace(/,\s*[^,]{0,80}$/, '').trim();
  }
  return next || clean;
}

export function analyzeSingleBullet(rawHtml: string): BulletAnalysis {
  const content = stripHtml(rawHtml);
  const firstWord = content.split(/\s+/)[0]?.replace(/[^a-z]/gi, '');
  const hasMetric = /\d|%|\$|users?|customers?|hours?|minutes?|revenue|cost|latency|growth/i.test(content);
  const startsWithAction = allActionVerbs().some(
    (verb) => verb.toLowerCase() === firstWord?.toLowerCase(),
  );
  const suggestions: BulletSuggestion[] = [];
  if (!startsWithAction && content.trim().length > 0) suggestions.push('actionVerb');
  if (!hasMetric && content.trim().length > 0)
    suggestions.push('metric');
  if (content.length > 200) suggestions.push('length');
  return {
    id: '',
    label: '',
    content,
    hasMetric,
    startsWithAction,
    suggestions,
  };
}

export function analyzeBullets(resume: Resume): BulletAnalysis[] {
  return collectBullets(resume).map((bullet) => {
    const firstWord = bullet.content.split(/\s+/)[0]?.replace(/[^a-z]/gi, '');
    const hasMetric = /\d|%|\$|users?|customers?|hours?|minutes?|revenue|cost|latency|growth/i.test(bullet.content);
    const startsWithAction = allActionVerbs().some(
      (verb) => verb.toLowerCase() === firstWord?.toLowerCase(),
    );
    const suggestions: BulletSuggestion[] = [];
    if (!startsWithAction) suggestions.push('actionVerb');
    if (!hasMetric) suggestions.push('metric');
    if (bullet.content.length > 200) suggestions.push('length');

    return {
      id: bullet.bulletId,
      label: `${bullet.sectionTitle} - ${bullet.entryTitle}`,
      content: bullet.content,
      hasMetric,
      startsWithAction,
      suggestions,
    };
  });
}

export function detectWeakLanguage(resume: Resume): WeakLanguageHit[] {
  const bullets = collectBullets(resume);
  return bullets.flatMap((bullet) =>
    WEAK_LANGUAGE.filter((weak) => new RegExp(`\\b${escapeRegex(weak.phrase)}\\b`, 'i').test(bullet.content)).map(
      (weak) => ({
        phrase: weak.phrase,
        replacementOptions: weak.replacements,
        bulletLabel: `${bullet.sectionTitle} - ${bullet.entryTitle}`,
        content: bullet.content,
      }),
    ),
  );
}

export function scanAtsKeywords(resume: Resume, jobDescription: string): KeywordHit[] {
  const resumeText = resumeToPlainText(resume).toLowerCase();
  return extractKeywords(jobDescription).map((keyword) => ({
    keyword,
    found: resumeText.includes(keyword.toLowerCase()),
    suggestedSection: suggestedSectionForKeyword(keyword),
  }));
}

export function generateSummary(resume: Resume): string {
  const skills = resume.sections
    .filter((section) => section.visible && section.type === 'skills')
    .flatMap((section) =>
      section.entries
        .filter((entry) => entry.visible !== false)
        .map((entry) => entry.subtitle ?? ''),
    )
    .join(', ')
    .split(',')
    .map((skill) => skill.trim())
    .filter(Boolean)
    .slice(0, 6);

  const experience = resume.sections
    .find((section) => section.visible && section.type === 'experience')
    ?.entries.find((entry) => entry.visible !== false && (entry.title || entry.subtitle));

  const role = experience?.title || 'Early-career professional';
  const company = experience?.subtitle ? ` with experience at ${experience.subtitle}` : '';
  const skillText = skills.length > 0 ? ` Skilled in ${skills.join(', ')}.` : '';

  return `${role}${company} focused on clear execution, measurable impact, and collaborative problem solving.${skillText}`;
}

export function generateCoverLetter(resume: Resume, jobDescription: string): string {
  const name = resume.header.name || 'Candidate';
  const summary = generateSummary(resume);
  const keywords = extractKeywords(jobDescription).slice(0, 5);

  return [
    `Dear Hiring Team,`,
    ``,
    `I am excited to apply for this opportunity. ${summary}`,
    ``,
    keywords.length > 0
      ? `The role's emphasis on ${keywords.join(', ')} aligns with the projects, experience, and skills reflected in my resume.`
      : `The role aligns with my background and my interest in contributing meaningful, well-executed work.`,
    `I would welcome the opportunity to discuss how my experience can support your team's goals.`,
    ``,
    `Sincerely,`,
    name,
  ].join('\n');
}

function extractKeywords(text: string): string[] {
  const phrases = text
    .match(/\b[A-Z][A-Za-z+#.]*(?:\s+[A-Z]?[A-Za-z+#.]*){0,2}\b/g)
    ?.map((value) => value.trim())
    .filter((value) => value.length > 2) ?? [];

  const words = text
    .toLowerCase()
    .match(/[a-z][a-z+#.]{2,}/g)
    ?.filter((word) => !STOP_WORDS.has(word)) ?? [];

  const counts = new Map<string, number>();
  for (const phrase of phrases) counts.set(phrase, (counts.get(phrase) ?? 0) + 2);
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([keyword]) => keyword)
    .filter((keyword, index, all) => all.findIndex((item) => item.toLowerCase() === keyword.toLowerCase()) === index)
    .slice(0, 20);
}

function suggestedSectionForKeyword(keyword: string): string {
  if (/react|python|sql|java|typescript|excel|aws|git|tableau|figma|node|cloud/i.test(keyword)) {
    return 'Skills';
  }
  if (/research|lab|analysis|experiment|publication/i.test(keyword)) return 'Research';
  if (/lead|mentor|manage|coordinate/i.test(keyword)) return 'Leadership';
  return 'Experience';
}

function allActionVerbs(): string[] {
  return Object.values(ACTION_VERBS).flat();
}

function lowercaseFirst(value: string): string {
  if (!value) return 'cross-functional work';
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function trimToWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/);
  return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}` : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
