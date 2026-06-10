import type { Resume } from '@/types';
import { resumeToPlainText } from './resumeText';

// Fully local, no-AI ATS-style keyword matcher. Pulls the most salient terms
// out of a pasted job description and checks which ones already appear in the
// resume. Gives users an instant "are my keywords covered?" signal without
// needing a BYOK key or sending their resume anywhere.

export interface KeywordMatchResult {
  score: number; // 0-100, share of weighted keywords found in the resume
  matched: string[]; // keywords present in the resume (highest-weight first)
  missing: string[]; // keywords absent from the resume (highest-weight first)
  total: number; // number of keywords considered
}

// Common English + resume/JD boilerplate words that carry no signal. Kept
// inline (no dependency) and lowercased.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'your', 'with', 'this', 'that',
  'have', 'has', 'had', 'will', 'would', 'can', 'could', 'should', 'may', 'might',
  'from', 'into', 'about', 'over', 'under', 'out', 'our', 'their', 'them', 'they',
  'who', 'whom', 'which', 'what', 'when', 'where', 'how', 'all', 'any', 'each',
  'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same', 'than', 'too',
  'very', 'just', 'also', 'been', 'being', 'was', 'were', 'is', 'be', 'do', 'does',
  'did', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'as', 'by', 'or', 'if', 'it',
  'we', 'us', 'i', 'me', 'my', 'he', 'she', 'his', 'her', 'its',
  // JD boilerplate
  'role', 'job', 'work', 'working', 'team', 'teams', 'company', 'candidate',
  'candidates', 'position', 'opportunity', 'experience', 'experienced', 'years',
  'year', 'ability', 'able', 'strong', 'excellent', 'good', 'great', 'including',
  'include', 'includes', 'etc', 'plus', 'preferred', 'required', 'requirements',
  'responsibilities', 'qualifications', 'skills', 'skill', 'knowledge', 'looking',
  'seeking', 'join', 'help', 'across', 'within', 'using', 'use', 'used', 'new',
  'must', 'well', 'while', 'both', 'per', 'via', 'self', 'day', 'days', 'time',
  'environment', 'based', 'related', 'similar', 'business', 'product', 'products',
  'service', 'services', 'support', 'develop', 'development', 'build', 'building',
  'design', 'designing', 'manage', 'management', 'ensure', 'provide', 'deliver',
  'drive', 'lead', 'leading', 'partner', 'partners', 'stakeholders', 'including',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[-./]+|[-./]+$/g, ''))
    .filter(Boolean);
}

function isMeaningful(word: string): boolean {
  if (STOPWORDS.has(word)) return false;
  // Keep short tech tokens like "go", "r", "c#", "qa", "ml", "ci", "ux" only if
  // they contain a special char; otherwise require length >= 3.
  if (/[+#]/.test(word)) return true;
  return word.length >= 3;
}

// Build a frequency-weighted, ranked keyword list from the job description.
export function extractKeywords(jobDescription: string, limit = 30): { term: string; weight: number }[] {
  const tokens = tokenize(jobDescription);
  const counts = new Map<string, number>();

  for (const token of tokens) {
    if (!isMeaningful(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  // Bigrams catch multi-word skills ("machine learning", "data analysis").
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!isMeaningful(a) || !isMeaningful(b)) continue;
    const bigram = `${a} ${b}`;
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([term, count]) => count > 1 || !term.includes(' ')) // keep one-off unigrams, require repeats for bigrams
    .map(([term, count]) => ({
      // Weight bigrams a bit higher — they're more specific/valuable.
      term,
      weight: count * (term.includes(' ') ? 2 : 1),
    }))
    .sort((a, b) => b.weight - a.weight || a.term.localeCompare(b.term))
    .slice(0, limit);
}

function containsTerm(haystack: string, term: string): boolean {
  if (term.includes(' ')) return haystack.includes(term);
  // Word-boundary match for single tokens so "java" doesn't match "javascript".
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}

export function matchKeywords(resume: Resume, jobDescription: string): KeywordMatchResult {
  const keywords = extractKeywords(jobDescription);
  const haystack = ` ${resumeToPlainText(resume).toLowerCase()} `;

  const matched: string[] = [];
  const missing: string[] = [];
  let matchedWeight = 0;
  let totalWeight = 0;

  for (const { term, weight } of keywords) {
    totalWeight += weight;
    if (containsTerm(haystack, term)) {
      matched.push(term);
      matchedWeight += weight;
    } else {
      missing.push(term);
    }
  }

  const score = totalWeight === 0 ? 0 : Math.round((matchedWeight / totalWeight) * 100);
  return { score, matched, missing, total: keywords.length };
}
