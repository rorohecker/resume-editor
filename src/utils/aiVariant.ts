import type { Resume } from '@/types';
import { generateAiText, type AiSettings, type JsonSchema } from './aiByok';
import { listAllBlocks, localScoreBlocks, type BlockScore } from './blockSelection';
import { buildFeaturePrompt } from './aiGuides';
import { stripHtml } from './resumeText';

const SCORE_TASK = `You score each resume block for relevance to a job description.
Return ONLY JSON (no commentary, no fences). Prefer this object shape:
{ "scores": [
  { "entryId": "...", "bulletId": "", "score": 0-10, "reason": "" },
  { "entryId": "...", "bulletId": "...", "score": 0-10, "reason": "..." }
] }
- Score 10 = highly relevant; 0 = irrelevant.
- Include EVERY entry and EVERY bullet from the inventory (bullet rows must include bulletId).
- Prefer scoring bullets individually; still include an entry row for each entry.
- "reason" is optional, 5-12 words for bullets if you want to explain the score.
- For entry-only rows, set "bulletId" and "reason" to empty strings.
- Do not invent ids; use the exact ids provided.
- Scores must be numbers, not strings.`;

const REWRITE_TASK = `You rewrite selected resume bullets so they better match a job description.
Return ONLY JSON (no commentary, no fences). Prefer this object shape:
{ "rewrites": [
  { "bulletId": "...", "rewritten": "...", "keywordsUsed": ["keyword"] }
] }

Rules:
- Keep every claim truthful - never invent employers, metrics, tools, or outcomes.
- Weave in relevant keywords from the job description only when they honestly fit the original work.
- Keep action verb + task + impact; roughly the same length (at most ~32 words).
- Skip a bullet entirely if no honest keyword-aware rewrite helps.
- Use the exact bulletId values provided.`;

const AI_HIGH_SCORE = 8;
const AI_LOW_SCORE = 4;

const SCORE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entryId: { type: 'string' },
          bulletId: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['entryId', 'bulletId', 'score', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

const REWRITE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    rewrites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bulletId: { type: 'string' },
          rewritten: { type: 'string' },
          keywordsUsed: { type: 'array', items: { type: 'string' } },
        },
        required: ['bulletId', 'rewritten', 'keywordsUsed'],
        additionalProperties: false,
      },
    },
  },
  required: ['rewrites'],
  additionalProperties: false,
};

export interface VariantBulletRewrite {
  bulletId: string;
  original: string;
  rewritten: string;
  keywordsUsed: string[];
}

export async function scoreBlocksWithAi(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
): Promise<BlockScore[]> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const blocks = listAllBlocks(resume);
  if (blocks.entries.length === 0 && blocks.bullets.length === 0) {
    throw new Error('This resume has no entries or bullets to score.');
  }

  const inventory = {
    entries: blocks.entries.map(({ section, entry }) => ({
      entryId: entry.id,
      section: section.title,
      title: entry.title,
      subtitle: entry.subtitle,
      tags: entry.tags,
    })),
    bullets: blocks.bullets.map(({ entry, bullet }) => ({
      entryId: entry.id,
      bulletId: bullet.id,
      content: stripHtml(bullet.content),
      tags: bullet.tags,
    })),
  };

  const prompt = buildFeaturePrompt(
    'variant-score',
    SCORE_TASK,
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- BLOCK INVENTORY ---\n${JSON.stringify(inventory, null, 2)}`,
  );

  // Large JSON inventories need headroom, especially on reasoning models.
  let raw: string;
  try {
    raw = await generateAiText(settings, prompt, 4500, {
      cache: false,
      jsonSchema: { name: 'resume_variant_scores', schema: SCORE_SCHEMA },
    });
  } catch (error) {
    if (!isStructuredOutputCompatibilityError(error)) throw error;
    raw = await generateAiText(settings, prompt, 4500, { cache: false });
  }
  let parsed = parseLooseJsonArray(raw);
  if (!parsed) {
    raw = await generateAiText(settings, retryScorePrompt(jobDescription, inventory), 4500, {
      cache: false,
    });
    parsed = parseLooseJsonArray(raw);
  }
  if (!parsed) {
    throw new Error(
      'Provider returned malformed scoring JSON twice. Local scoring was used for this run.',
    );
  }

  const knownEntries = new Set(blocks.entries.map(({ entry }) => entry.id));
  const knownBullets = new Set(blocks.bullets.map(({ bullet }) => bullet.id));
  const bulletParent = new Map(blocks.bullets.map(({ entry, bullet }) => [bullet.id, entry.id]));

  const scores: BlockScore[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const bulletIdRaw = readString(row, 'bulletId', 'bullet_id', 'bulletID', 'bullet');
    const bulletId = bulletIdRaw && knownBullets.has(bulletIdRaw) ? bulletIdRaw : undefined;
    const entryId =
      readString(row, 'entryId', 'entry_id', 'entryID', 'entry', 'blockId', 'block_id') ||
      (bulletId ? (bulletParent.get(bulletId) ?? '') : '');
    if (!entryId || !knownEntries.has(entryId)) continue;
    const scoreNum = readNumber(row, 'score', 'relevanceScore', 'relevance_score', 'rating', 'fit', 'fitScore');
    if (!Number.isFinite(scoreNum)) continue;
    scores.push({
      entryId,
      bulletId,
      score: Math.max(0, Math.min(10, scoreNum)),
      reason: readString(row, 'reason', 'rationale', 'explanation') || undefined,
    });
  }

  if (scores.length === 0) {
    throw new Error('AI scoring returned no usable block scores. Try again or use local scoring.');
  }

  // If the model skipped bullet rows, fill gaps with a mild default so packing
  // still has something to select under each scored entry.
  if (blocks.bullets.length > 0) {
    const scoredBulletIds = new Set(scores.map((s) => s.bulletId).filter(Boolean));
    const entryScore = new Map<string, number>();
    const localScore = new Map<string, number>();
    for (const score of localScoreBlocks(resume, jobDescription)) {
      if (score.bulletId) localScore.set(score.bulletId, score.score);
    }
    for (const score of scores) {
      if (!score.bulletId) entryScore.set(score.entryId, score.score);
    }
    for (const { entry, bullet } of blocks.bullets) {
      if (scoredBulletIds.has(bullet.id)) continue;
      const base = entryScore.get(entry.id) ?? 3;
      const local = localScore.get(bullet.id) ?? 3;
      scores.push({
        entryId: entry.id,
        bulletId: bullet.id,
        score: Math.max(1, Math.min(6, base * 0.45 + local * 0.55)),
        reason: 'Conservative fill from local relevance',
      });
    }
  }

  return calibrateAiBlockScores(scores, resume, jobDescription);
}

/** Rewrite included bullets with job keywords. Only touches the provided bullet IDs. */
export async function rewriteVariantBulletsWithAi(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
  bulletIds: string[],
): Promise<VariantBulletRewrite[]> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');
  if (bulletIds.length === 0) return [];

  const wanted = new Set(bulletIds);
  const inventory: { bulletId: string; section: string; entry: string; content: string }[] = [];
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets ?? []) {
        if (!wanted.has(bullet.id)) continue;
        inventory.push({
          bulletId: bullet.id,
          section: section.title,
          entry: entry.title || entry.subtitle || section.title,
          content: stripHtml(bullet.content),
        });
      }
    }
  }
  if (inventory.length === 0) return [];

  // Cap payload size so rewrite stays reliable on smaller models.
  const batch = inventory.slice(0, 40);
  const prompt = buildFeaturePrompt(
    'variant-rewrite',
    REWRITE_TASK,
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- BULLETS TO CONSIDER ---\n${JSON.stringify(batch, null, 2)}`,
  );

  const raw = await generateAiText(settings, prompt, 4000, {
    cache: false,
    jsonSchema: { name: 'resume_variant_rewrites', schema: REWRITE_SCHEMA },
  });
  const parsed = parseLooseJsonArray(raw);
  if (!parsed) throw new Error('Provider returned malformed rewrite JSON.');

  const byId = new Map(batch.map((item) => [item.bulletId, item]));
  const out: VariantBulletRewrite[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const bulletId = typeof row.bulletId === 'string' ? row.bulletId : '';
    const rewritten = typeof row.rewritten === 'string' ? row.rewritten.trim() : '';
    if (!bulletId || !rewritten || !byId.has(bulletId)) continue;
    const original = byId.get(bulletId)!.content;
    if (rewritten === original) continue;
    out.push({
      bulletId,
      original,
      rewritten,
      keywordsUsed: Array.isArray(row.keywordsUsed)
        ? row.keywordsUsed
            .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0)
            .map((kw) => kw.trim())
            .slice(0, 6)
        : [],
    });
  }
  return out;
}

function retryScorePrompt(jobDescription: string, inventory: unknown): string {
  return buildFeaturePrompt(
    'variant-score',
    'Your last scoring response could not be parsed by JSON.parse.',
    'Return ONLY compact valid JSON now. No markdown, no comments, no prose.',
    'Required shape: {"scores":[{"entryId":"...","bulletId":"","score":0,"reason":""}]}',
    'For entry rows, use empty strings for bulletId and reason.',
    'For bullet rows, use the exact bulletId from the inventory.',
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- BLOCK INVENTORY ---\n${JSON.stringify(inventory, null, 2)}`,
  );
}

function isStructuredOutputCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /json_schema|response_schema|output_config|structured output|unsupported.*schema|invalid.*schema|invalid.*parameter/i.test(
    message,
  );
}

/**
 * AI models sometimes return non-discriminating scores ("everything is 7-9").
 * Resume packing needs contrast, so calibrate clustered AI output with a ranked
 * curve and a light local keyword tie-breaker. Well-spread model scores are left
 * intact except for normal 0-10 clamping.
 */
export function calibrateAiBlockScores(
  scores: BlockScore[],
  resume: Resume,
  jobDescription: string,
): BlockScore[] {
  if (scores.length <= 2) return scores.map((score) => ({ ...score, score: clampScore(score.score) }));

  const clamped = scores.map((score, index) => ({
    ...score,
    index,
    score: clampScore(score.score),
  }));
  const values = clamped.map((score) => score.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const highShare = values.filter((score) => score >= AI_HIGH_SCORE).length / values.length;
  const lowShare = values.filter((score) => score <= AI_LOW_SCORE).length / values.length;
  const range = max - min;
  const needsCalibration =
    range < 2 ||
    min >= 5 ||
    highShare > 0.35 ||
    lowShare < 0.25;

  if (!needsCalibration) {
    return clamped.map(toBlockScore);
  }

  const localByKey = new Map<string, number>();
  for (const local of localScoreBlocks(resume, jobDescription)) {
    localByKey.set(scoreKey(local), clampScore(local.score));
  }

  const ranked = clamped
    .map((score) => {
      const local = localByKey.get(scoreKey(score)) ?? 0;
      return {
        ...score,
        sortScore: score.score * 0.72 + local * 0.28,
      };
    })
    .sort((a, b) => b.sortScore - a.sortScore || a.index - b.index);

  const calibrated = new Map<number, number>();
  for (let rank = 0; rank < ranked.length; rank += 1) {
    const row = ranked[rank]!;
    calibrated.set(row.index, scoreForRank(rank, ranked.length));
  }

  return clamped.map((score) => toBlockScore({ ...score, score: calibrated.get(score.index) ?? score.score }));
}

function toBlockScore(score: BlockScore & { index?: number; sortScore?: number }): BlockScore {
  return {
    entryId: score.entryId,
    bulletId: score.bulletId,
    score: score.score,
    reason: score.reason,
  };
}

function scoreForRank(rank: number, total: number): number {
  if (total <= 1) return 8;
  const p = rank / (total - 1);
  let score: number;
  if (p < 0.12) {
    score = 9.4 - (p / 0.12) * 1.1;
  } else if (p < 0.3) {
    score = 8 - ((p - 0.12) / 0.18) * 1.2;
  } else if (p < 0.6) {
    score = 6.2 - ((p - 0.3) / 0.3) * 2.2;
  } else {
    score = 3.8 - ((p - 0.6) / 0.4) * 3;
  }
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function scoreKey(score: Pick<BlockScore, 'entryId' | 'bulletId'>): string {
  return score.bulletId ? `${score.entryId}:${score.bulletId}` : score.entryId;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function readString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
}

export function parseLooseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const candidate of jsonCandidates(trimmed)) {
    try {
      const extracted = extractResultArray(JSON.parse(candidate));
      if (extracted) return extracted;
    } catch {
      // try next
    }
  }
  return null;
}

function jsonCandidates(trimmed: string): string[] {
  const candidates = new Set<string>();
  candidates.add(trimmed);
  candidates.add(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.add(fenced[1].trim());

  const objectCandidate = balancedJsonSlice(trimmed, '{', '}');
  if (objectCandidate) candidates.add(objectCandidate);
  const arrayCandidate = balancedJsonSlice(trimmed, '[', ']');
  if (arrayCandidate) candidates.add(arrayCandidate);

  return [...candidates].filter(Boolean);
}

function balancedJsonSlice(text: string, open: '{' | '[', close: '}' | ']'): string | null {
  const start = text.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function extractResultArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    'scores',
    'scoreRows',
    'blockScores',
    'entryScores',
    'bulletScores',
    'blocks',
    'items',
    'results',
    'rewrites',
    'bullets',
    'entries',
  ];

  const combined: unknown[] = [];
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) combined.push(...value);
    else if (value && typeof value === 'object') {
      const nested = extractResultArray(value);
      if (nested) combined.push(...nested);
    }
  }
  if (combined.length > 0) return combined;

  const arrays = collectResultArrays(record);
  return arrays.length > 0 ? arrays.flat() : null;
}

function collectResultArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) {
    return value.some(looksLikeResultRow) ? [value] : value.flatMap(collectResultArrays);
  }
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectResultArrays);
}

function looksLikeResultRow(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    'score' in row ||
    'rewritten' in row ||
    'entryId' in row ||
    'entry_id' in row ||
    'bulletId' in row ||
    'bullet_id' in row
  );
}
