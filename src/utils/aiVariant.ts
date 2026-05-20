import type { Resume } from '@/types';
import { generateAiText, type AiSettings } from './aiByok';
import { listAllBlocks, type BlockScore } from './blockSelection';

const PROMPT = `You score each resume block for relevance to a job description.
Return ONLY a JSON array (no commentary, no fences) of objects:
[
  { "entryId": "...", "score": 0-10 },
  { "entryId": "...", "bulletId": "...", "score": 0-10, "reason": "..." }
]
- Score 10 = highly relevant; 0 = irrelevant.
- Include every entry and bullet from the inventory.
- "reason" is optional, 5-12 words for bullets if you want to explain the score.
- Do not invent ids; use the exact ids provided.`;

export async function scoreBlocksWithAi(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
): Promise<BlockScore[]> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const blocks = listAllBlocks(resume);
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
      content: bullet.content.replace(/<[^>]*>/g, ''),
      tags: bullet.tags,
    })),
  };

  const prompt =
    `${PROMPT}\n\n--- JOB DESCRIPTION ---\n${jobDescription}\n\n` +
    `--- BLOCK INVENTORY ---\n${JSON.stringify(inventory, null, 2)}`;

  const raw = await generateAiText(settings, prompt, 3200);
  const parsed = parseLooseJsonArray(raw);
  if (!parsed) throw new Error('Provider returned malformed JSON.');
  return parsed
    .filter((entry): entry is BlockScore => typeof entry.entryId === 'string' && typeof entry.score === 'number')
    .map((entry) => ({
      entryId: entry.entryId,
      bulletId: typeof entry.bulletId === 'string' ? entry.bulletId : undefined,
      score: Math.max(0, Math.min(10, entry.score)),
      reason: typeof entry.reason === 'string' ? entry.reason : undefined,
    }));
}

function parseLooseJsonArray(text: string): BlockScore[] | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
  ];
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) candidates.push(trimmed.slice(start, end + 1));
  for (const candidate of candidates) {
    try {
      const data = JSON.parse(candidate);
      if (Array.isArray(data)) return data as BlockScore[];
    } catch {
      // try next
    }
  }
  return null;
}
