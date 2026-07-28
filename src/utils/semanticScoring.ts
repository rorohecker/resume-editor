import type { Resume } from '@/types';
import { classBlocksForEntry, type BlockScore } from './blockSelection';
import { stripHtml } from './resumeText';

interface SemanticMarker {
  id: string;
  label: string;
  terms: string[];
}

export interface SemanticProfile {
  vector: Map<string, number>;
  markerIds: Set<string>;
  markerLabels: string[];
  keywords: Set<string>;
}

/**
 * Curated local marker database used as the always-available semantic model.
 * It gives the app a resume/job similarity signal even when BYOK JSON output
 * is missing, truncated, or too broad.
 */
export const SEMANTIC_MARKER_DATABASE: SemanticMarker[] = [
  {
    id: 'software',
    label: 'Software engineering',
    terms: [
      'software',
      'frontend',
      'front end',
      'backend',
      'back end',
      'full stack',
      'api',
      'apis',
      'react',
      'typescript',
      'javascript',
      'node',
      'python',
      'java',
      'c#',
      'go',
      'rust',
      'testing',
      'unit test',
      'integration test',
      'code review',
    ],
  },
  {
    id: 'data',
    label: 'Data and analytics',
    terms: [
      'data',
      'analytics',
      'analysis',
      'analyst',
      'sql',
      'dashboard',
      'dashboards',
      'reporting',
      'etl',
      'pipeline',
      'pipelines',
      'tableau',
      'power bi',
      'looker',
      'excel',
      'forecast',
      'statistics',
      'metrics',
    ],
  },
  {
    id: 'ai-ml',
    label: 'AI and machine learning',
    terms: [
      'ai',
      'ml',
      'machine learning',
      'model',
      'models',
      'llm',
      'llms',
      'nlp',
      'computer vision',
      'neural',
      'embedding',
      'embeddings',
      'classification',
      'prediction',
      'recommendation',
      'fine tune',
      'fine-tune',
    ],
  },
  {
    id: 'cloud',
    label: 'Cloud and infrastructure',
    terms: [
      'cloud',
      'aws',
      'azure',
      'gcp',
      'google cloud',
      'kubernetes',
      'docker',
      'terraform',
      'ci/cd',
      'devops',
      'infrastructure',
      'deployment',
      'serverless',
      'linux',
      'monitoring',
      'observability',
    ],
  },
  {
    id: 'security',
    label: 'Security and compliance',
    terms: [
      'security',
      'cybersecurity',
      'compliance',
      'risk',
      'audit',
      'privacy',
      'soc 2',
      'iso',
      'hipaa',
      'access control',
      'identity',
      'vulnerability',
      'incident',
      'threat',
      'governance',
    ],
  },
  {
    id: 'product',
    label: 'Product and strategy',
    terms: [
      'product',
      'roadmap',
      'strategy',
      'requirements',
      'user story',
      'user stories',
      'market',
      'launch',
      'prioritize',
      'prioritization',
      'stakeholder',
      'stakeholders',
      'feature',
      'features',
      'experiment',
      'experiments',
    ],
  },
  {
    id: 'design',
    label: 'Design and UX',
    terms: [
      'design',
      'ux',
      'ui',
      'user experience',
      'figma',
      'prototype',
      'wireframe',
      'research',
      'usability',
      'accessibility',
      'visual',
      'interaction',
      'brand',
      'creative',
    ],
  },
  {
    id: 'finance',
    label: 'Finance and accounting',
    terms: [
      'finance',
      'financial',
      'accounting',
      'budget',
      'forecasting',
      'revenue',
      'cost',
      'margin',
      'p&l',
      'valuation',
      'investment',
      'portfolio',
      'audit',
      'tax',
    ],
  },
  {
    id: 'sales',
    label: 'Sales and growth',
    terms: [
      'sales',
      'revenue',
      'pipeline',
      'crm',
      'salesforce',
      'prospect',
      'prospecting',
      'account',
      'quota',
      'customer acquisition',
      'lead generation',
      'negotiation',
      'closing',
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing and communications',
    terms: [
      'marketing',
      'campaign',
      'content',
      'seo',
      'sem',
      'brand',
      'social media',
      'email',
      'copywriting',
      'communications',
      'public relations',
      'growth',
      'conversion',
    ],
  },
  {
    id: 'operations',
    label: 'Operations and process',
    terms: [
      'operations',
      'process',
      'workflow',
      'supply chain',
      'logistics',
      'inventory',
      'procurement',
      'vendor',
      'quality',
      'optimization',
      'efficiency',
      'scheduling',
      'coordination',
    ],
  },
  {
    id: 'healthcare',
    label: 'Healthcare and life sciences',
    terms: [
      'healthcare',
      'clinical',
      'patient',
      'patients',
      'medical',
      'health',
      'biology',
      'biotech',
      'pharma',
      'laboratory',
      'lab',
      'research',
      'trial',
      'care',
    ],
  },
  {
    id: 'education',
    label: 'Education and training',
    terms: [
      'education',
      'teaching',
      'teacher',
      'student',
      'students',
      'curriculum',
      'training',
      'facilitation',
      'workshop',
      'instruction',
      'mentoring',
      'coaching',
      'learning',
    ],
  },
  {
    id: 'leadership',
    label: 'Leadership and collaboration',
    terms: [
      'leadership',
      'led',
      'lead',
      'managed',
      'manager',
      'mentored',
      'coordinated',
      'collaborated',
      'cross-functional',
      'stakeholder',
      'team',
      'teams',
      'executive',
      'strategy',
    ],
  },
  {
    id: 'impact',
    label: 'Measured impact',
    terms: [
      'reduced',
      'increased',
      'improved',
      'grew',
      'saved',
      'accelerated',
      'automated',
      'optimized',
      'launched',
      'delivered',
      'metrics',
      'kpi',
      'roi',
      '%',
      '$',
    ],
  },
];

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'your',
  'with',
  'this',
  'that',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'from',
  'into',
  'about',
  'over',
  'under',
  'our',
  'their',
  'them',
  'they',
  'what',
  'when',
  'where',
  'how',
  'all',
  'any',
  'each',
  'more',
  'most',
  'other',
  'some',
  'such',
  'only',
  'same',
  'than',
  'too',
  'very',
  'just',
  'also',
  'been',
  'being',
  'was',
  'were',
  'is',
  'be',
  'do',
  'does',
  'did',
  'a',
  'an',
  'in',
  'on',
  'at',
  'to',
  'of',
  'as',
  'by',
  'or',
  'if',
  'it',
  'we',
  'us',
  'role',
  'job',
  'work',
  'working',
  'company',
  'candidate',
  'position',
  'opportunity',
  'experience',
  'years',
  'year',
  'ability',
  'strong',
  'excellent',
  'preferred',
  'required',
  'requirements',
  'responsibilities',
  'qualifications',
  'skills',
  'knowledge',
]);

const SYNONYMS: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  nodejs: 'node',
  node: 'node',
  py: 'python',
  postgres: 'sql',
  postgresql: 'sql',
  mysql: 'sql',
  mssql: 'sql',
  bi: 'analytics',
  kpis: 'kpi',
  dashboards: 'dashboard',
  analyses: 'analysis',
  analyzed: 'analysis',
  analysing: 'analysis',
  optimised: 'optimized',
  optimisation: 'optimization',
  learnt: 'learned',
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#%$./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .map((token) => token.replace(/^[-./]+|[-./]+$/g, ''))
    .map(normalizeToken)
    .filter(isMeaningfulToken);
}

function normalizeToken(token: string): string {
  const clean = token.trim();
  if (!clean) return '';
  const mapped = SYNONYMS[clean] ?? clean;
  if (/[+#%$]/.test(mapped)) return mapped;
  if (mapped.length > 5 && mapped.endsWith('ies')) return `${mapped.slice(0, -3)}y`;
  if (mapped.length > 5 && mapped.endsWith('ing')) return mapped.slice(0, -3);
  if (mapped.length > 4 && mapped.endsWith('ed')) return mapped.slice(0, -2);
  if (mapped.length > 4 && mapped.endsWith('s')) return mapped.slice(0, -1);
  return mapped;
}

function isMeaningfulToken(token: string): boolean {
  if (!token || STOPWORDS.has(token)) return false;
  if (/[+#%$]/.test(token)) return true;
  return token.length >= 3;
}

function addWeight(vector: Map<string, number>, key: string, weight: number): void {
  vector.set(key, (vector.get(key) ?? 0) + weight);
}

export function buildSemanticProfile(text: string): SemanticProfile {
  const tokens = tokenize(text);
  const vector = new Map<string, number>();
  const keywords = new Set<string>();
  const normalized = ` ${normalizeText(text)} `;
  const markerIds = new Set<string>();
  const markerLabels: string[] = [];

  for (const token of tokens) {
    keywords.add(token);
    addWeight(vector, `tok:${token}`, 1);
  }

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const bigram = `${tokens[index]} ${tokens[index + 1]}`;
    keywords.add(bigram);
    addWeight(vector, `phrase:${bigram}`, 1.35);
  }

  for (let index = 0; index < tokens.length - 2; index += 1) {
    const trigram = `${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`;
    addWeight(vector, `phrase:${trigram}`, 1.6);
  }

  for (const marker of SEMANTIC_MARKER_DATABASE) {
    let hits = 0;
    for (const term of marker.terms) {
      if (term.length === 1 && term !== '%' && term !== '$') continue;
      const normalizedTerm = normalizeText(term);
      const found = normalizedTerm.length <= 2
        ? tokens.includes(normalizeToken(normalizedTerm))
        : normalized.includes(` ${normalizedTerm} `);
      if (!found) continue;
      hits += 1;
      addWeight(vector, `marker:${marker.id}:${normalizeToken(normalizedTerm)}`, 1.1);
    }
    if (hits > 0) {
      markerIds.add(marker.id);
      markerLabels.push(marker.label);
      addWeight(vector, `marker:${marker.id}`, 1.8 + Math.min(3, hits) * 0.65);
    }
  }

  return { vector, markerIds, markerLabels, keywords };
}

export function semanticMarkersForText(text: string, limit = 8): string[] {
  return buildSemanticProfile(text).markerLabels.slice(0, limit);
}

export function semanticScoreBlocks(resume: Resume, jobDescription: string): BlockScore[] {
  const jobProfile = buildSemanticProfile(jobDescription);
  const scores: BlockScore[] = [];

  for (const section of resume.sections) {
    for (const entry of section.entries) {
      const entryText = [
        section.title,
        section.type,
        entry.title,
        entry.subtitle,
        entry.location,
        entry.tags?.join(' '),
        Object.values(entry.customFields ?? {}).join(' '),
        (entry.bullets ?? []).map((bullet) => stripHtml(bullet.content)).join(' '),
      ]
        .filter(Boolean)
        .join(' ');
      const entryScore = scoreTextAgainstProfile(entryText, jobProfile);
      scores.push({
        entryId: entry.id,
        score: entryScore.score,
        reason: entryScore.reason,
      });

      for (const bullet of entry.bullets ?? []) {
        const bulletText = [
          section.title,
          section.type,
          entry.title,
          entry.subtitle,
          bullet.tags?.join(' '),
          stripHtml(bullet.content),
        ]
          .filter(Boolean)
          .join(' ');
        const bulletScore = scoreTextAgainstProfile(bulletText, jobProfile);
        scores.push({
          entryId: entry.id,
          bulletId: bullet.id,
          score: bulletScore.score,
          reason: bulletScore.reason,
        });
      }

      for (const classBlock of classBlocksForEntry(section, entry)) {
        const classScore = scoreTextAgainstProfile(
          [section.title, entry.title, entry.subtitle, classBlock.label, classBlock.value]
            .filter(Boolean)
            .join(' '),
          jobProfile,
        );
        scores.push({
          entryId: entry.id,
          classId: classBlock.classId,
          score: classScore.score,
          reason: classScore.reason,
        });
      }
    }
  }

  return scores;
}

function scoreTextAgainstProfile(
  text: string,
  jobProfile: SemanticProfile,
): { score: number; reason: string } {
  const blockProfile = buildSemanticProfile(text);
  const vectorSimilarity = cosineSimilarity(blockProfile.vector, jobProfile.vector);
  const markerOverlap = overlapRatio(blockProfile.markerIds, jobProfile.markerIds);
  const keywordOverlap = overlapRatio(blockProfile.keywords, jobProfile.keywords);
  const score = clampScore(
    vectorSimilarity * 7.2 +
      markerOverlap * 2.4 +
      Math.min(1, keywordOverlap * 2.2) * 1.2,
  );
  const markers = blockProfile.markerLabels.filter((label) => jobProfile.markerLabels.includes(label));
  const reason = markers.length > 0
    ? `Semantic markers: ${markers.slice(0, 3).join(', ')}`
    : 'Semantic similarity fallback';
  return { score, reason };
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (const value of a.values()) aNorm += value * value;
  for (const value of b.values()) bNorm += value * value;
  for (const [key, value] of a) dot += value * (b.get(key) ?? 0);
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / Math.sqrt(aNorm * bNorm);
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const value of a) if (b.has(value)) hits += 1;
  return hits / Math.min(a.size, b.size);
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}
