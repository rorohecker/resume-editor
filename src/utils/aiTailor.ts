import type { Resume } from '@/types';
import { generateAiText, type AiSettings } from './aiByok';
import { resumeToPlainText } from './resumeText';

export interface TailorSuggestion {
  bulletId: string;
  sectionTitle: string;
  entryTitle: string;
  original: string;
  rewritten: string;
}

export interface TailorOutcome {
  emphasizedSkills: string[];
  deprioritizedSkills: string[];
  bulletRewrites: TailorSuggestion[];
  summary: string;
  coverLetter: string;
}

const PROMPT = `You are tailoring a resume to a specific job description.
Return a JSON object with this exact shape (no commentary, no fences):

{
  "emphasizedSkills": ["..."],
  "deprioritizedSkills": ["..."],
  "bulletRewrites": [
    { "bulletId": "<id>", "rewritten": "..." }
  ],
  "summary": "...",
  "coverLetter": "..."
}

Rules:
- Only rewrite bullets that genuinely benefit from emphasis on the role. Skip the rest.
- Each rewritten bullet must follow action verb + task + impact, be truthful, and at most ~30 words.
- "summary" is a 2-sentence professional summary tailored to the role.
- "coverLetter" is a concise letter (~150 words). Do not invent facts.
- "emphasizedSkills" / "deprioritizedSkills" are short lists (max 8 each) from the candidate's existing skills.`;

interface RawShape {
  emphasizedSkills?: string[];
  deprioritizedSkills?: string[];
  bulletRewrites?: { bulletId?: string; rewritten?: string }[];
  summary?: string;
  coverLetter?: string;
}

export async function generateTailoring(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
): Promise<TailorOutcome> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const bulletMap = new Map<string, { sectionTitle: string; entryTitle: string; content: string }>();
  for (const section of resume.sections.filter((item) => item.visible)) {
    for (const entry of section.entries.filter((item) => item.visible !== false)) {
      for (const bullet of entry.bullets ?? []) {
        if (!bullet.visible) continue;
        bulletMap.set(bullet.id, {
          sectionTitle: section.title,
          entryTitle: entry.title || entry.subtitle || section.title,
          content: bullet.content,
        });
      }
    }
  }

  const bulletInventory = Array.from(bulletMap.entries()).map(([id, info]) => ({
    id,
    section: info.sectionTitle,
    entry: info.entryTitle,
    content: info.content.replace(/<[^>]*>/g, ''),
  }));

  const prompt =
    `${PROMPT}\n\n--- JOB DESCRIPTION ---\n${jobDescription}\n\n` +
    `--- RESUME ---\n${resumeToPlainText(resume)}\n\n` +
    `--- BULLET INVENTORY (use these exact ids in bulletRewrites) ---\n` +
    JSON.stringify(bulletInventory, null, 2);

  const raw = await generateAiText(settings, prompt, 2400);
  const json = parseLooseJson(raw) as RawShape | null;
  if (!json) throw new Error('Provider returned malformed JSON.');

  const suggestions: TailorSuggestion[] = (json.bulletRewrites ?? [])
    .filter((item) => item.bulletId && item.rewritten)
    .map((item) => {
      const info = bulletMap.get(item.bulletId!);
      return {
        bulletId: item.bulletId!,
        sectionTitle: info?.sectionTitle ?? '',
        entryTitle: info?.entryTitle ?? '',
        original: info?.content.replace(/<[^>]*>/g, '') ?? '',
        rewritten: item.rewritten!,
      };
    })
    .filter((suggestion) => suggestion.sectionTitle);

  return {
    emphasizedSkills: trimList(json.emphasizedSkills),
    deprioritizedSkills: trimList(json.deprioritizedSkills),
    bulletRewrites: suggestions,
    summary: typeof json.summary === 'string' ? json.summary.trim() : '',
    coverLetter: typeof json.coverLetter === 'string' ? json.coverLetter.trim() : '',
  };
}

function trimList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 8)
    .map((item) => item.trim());
}

function parseLooseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(cleaned);
    } catch {
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
}
