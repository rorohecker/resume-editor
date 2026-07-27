import type { Resume } from '@/types';
import { generateAiText, type AiSettings } from './aiByok';
import { listAllBlocks, type BlockScore } from './blockSelection';
import { stripHtml } from './resumeText';

const PROMPT = `You score each resume block for relevance to a job description.
Return ONLY a JSON array (no commentary, no fences) of objects:
[
  { "entryId": "...", "score": 0-10 },
  { "entryId": "...", "bulletId": "...", "score": 0-10, "reason": "..." }
]
- Score 10 = highly relevant; 0 = irrelevant.
- Include EVERY entry and EVERY bullet from the inventory (bullet rows must include bulletId).
- Prefer scoring bullets individually; still include an entry row for each entry.
- "reason" is optional, 5-12 words for bullets if you want to explain the score.
- Do not invent ids; use the exact ids provided.
- Scores may be numbers (preferred).`;

const REWRITE_PROMPT = `You rewrite selected resume bullets so they better match a job description.
Return ONLY a JSON array (no commentary, no fences):
[
  { "bulletId": "...", "rewritten": "...", "keywordsUsed": ["keyword"] }
]

Rules:
- Keep every claim truthful — never invent employers, metrics, tools, or outcomes.
- Weave in relevant keywords from the job description only when they honestly fit the original work.
- Keep action verb + task + impact; roughly the same length (at most ~32 words).
- Skip a bullet entirely if no honest keyword-aware rewrite helps.
- Use the exact bulletId values provided.`;

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

  const prompt =
    `${PROMPT}\n\n--- JOB DESCRIPTION ---\n${jobDescription}\n\n` +
    `--- BLOCK INVENTORY ---\n${JSON.stringify(inventory, null, 2)}`;

  // Large JSON inventories need headroom, especially on reasoning models.
  const raw = await generateAiText(settings, prompt, 4500);
  const parsed = parseLooseJsonArray(raw);
  if (!parsed) throw new Error('Provider returned malformed JSON. Try again or switch models.');

  const knownEntries = new Set(blocks.entries.map(({ entry }) => entry.id));
  const knownBullets = new Set(blocks.bullets.map(({ bullet }) => bullet.id));

  const scores: BlockScore[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const entryId = typeof entry.entryId === 'string' ? entry.entryId : '';
    if (!entryId || !knownEntries.has(entryId)) continue;
    const scoreNum =
      typeof entry.score === 'number'
        ? entry.score
        : typeof entry.score === 'string'
          ? Number(entry.score)
          : NaN;
    if (!Number.isFinite(scoreNum)) continue;
    const bulletId = typeof entry.bulletId === 'string' ? entry.bulletId : undefined;
    if (bulletId && !knownBullets.has(bulletId)) continue;
    scores.push({
      entryId,
      bulletId,
      score: Math.max(0, Math.min(10, scoreNum)),
      reason: typeof entry.reason === 'string' ? entry.reason : undefined,
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
    for (const score of scores) {
      if (!score.bulletId) entryScore.set(score.entryId, score.score);
    }
    for (const { entry, bullet } of blocks.bullets) {
      if (scoredBulletIds.has(bullet.id)) continue;
      const base = entryScore.get(entry.id) ?? 3;
      scores.push({
        entryId: entry.id,
        bulletId: bullet.id,
        score: Math.max(1, base * 0.7),
        reason: 'Filled from entry relevance',
      });
    }
  }

  return scores;
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
  const prompt =
    `${REWRITE_PROMPT}\n\n--- JOB DESCRIPTION ---\n${jobDescription}\n\n` +
    `--- BULLETS TO CONSIDER ---\n${JSON.stringify(batch, null, 2)}`;

  const raw = await generateAiText(settings, prompt, 4000);
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

function parseLooseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
  ];
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  const objStart = trimmed.indexOf('{');
  const objEnd = trimmed.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    candidates.push(trimmed.slice(objStart, objEnd + 1));
  }
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (Array.isArray(data)) return data;
      if (data && typeof data === 'object') {
        const record = data as Record<string, unknown>;
        for (const key of ['scores', 'blocks', 'items', 'results', 'rewrites', 'bullets']) {
          const value = record[key];
          if (Array.isArray(value)) return value;
        }
      }
    } catch {
      // try next
    }
  }
  return null;
}
