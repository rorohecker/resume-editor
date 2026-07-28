import type { Resume } from '@/types';
import { generateAiText, type AiSettings, type JsonSchema } from './aiByok';
import { buildFeaturePrompt } from './aiGuides';
import { resumeToPlainText, stripHtml } from './resumeText';

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

const TAILOR_TASK = `You are tailoring a resume to a specific job description.
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
- Rewrite at most 10 bullets. Choose only the highest-value changes for this exact role.
- Each rewritten bullet must follow action verb + task + impact, be truthful, and at most 32 words.
- "summary" is a 2-sentence professional summary tailored to the role.
- "coverLetter" is a concise letter (~150 words). Do not invent facts.
- "emphasizedSkills" / "deprioritizedSkills" are short lists (max 8 each) from the provided EXISTING SKILLS list only.`;

const MAX_TAILOR_REWRITES = 10;
const MAX_BULLET_WORDS = 36;
const MAX_COVER_WORDS = 190;

const TAILOR_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    emphasizedSkills: { type: 'array', items: { type: 'string' } },
    deprioritizedSkills: { type: 'array', items: { type: 'string' } },
    bulletRewrites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bulletId: { type: 'string' },
          rewritten: { type: 'string' },
        },
        required: ['bulletId', 'rewritten'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
    coverLetter: { type: 'string' },
  },
  required: ['emphasizedSkills', 'deprioritizedSkills', 'bulletRewrites', 'summary', 'coverLetter'],
  additionalProperties: false,
};

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
          content: stripHtml(bullet.content),
        });
      }
    }
  }

  const resumeText = resumeToPlainText(resume);
  const skillInventory = extractSkillInventory(resume);
  const bulletInventory = Array.from(bulletMap.entries()).map(([id, info]) => ({
    id,
    section: info.sectionTitle,
    entry: info.entryTitle,
    content: info.content,
  }));

  const prompt = buildFeaturePrompt(
    'tailor',
    TAILOR_TASK,
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- RESUME TEXT (evidence only, do not dump this back) ---\n${resumeText.slice(0, 12000)}`,
    `--- EXISTING SKILLS (use only these exact skills for skills lists) ---\n${JSON.stringify(skillInventory, null, 2)}`,
    `--- BULLET INVENTORY (use exact ids; rewrite at most ${MAX_TAILOR_REWRITES}) ---\n${JSON.stringify(bulletInventory, null, 2)}`,
  );

  const raw = await generateAiText(settings, prompt, 3600, {
    cache: false,
    jsonSchema: { name: 'resume_tailoring', schema: TAILOR_SCHEMA },
  });
  const json = parseLooseJson(raw) as RawShape | null;
  if (!json) throw new Error('Provider returned malformed JSON.');

  const seenBulletIds = new Set<string>();
  const suggestions: TailorSuggestion[] = (json.bulletRewrites ?? [])
    .filter((item) => item.bulletId && item.rewritten)
    .map((item) => {
      const info = bulletMap.get(item.bulletId!);
      const rewritten = cleanGeneratedBullet(item.rewritten!);
      return {
        bulletId: item.bulletId!,
        sectionTitle: info?.sectionTitle ?? '',
        entryTitle: info?.entryTitle ?? '',
        original: info?.content ?? '',
        rewritten,
      };
    })
    .filter((suggestion) => {
      if (!suggestion.sectionTitle || !suggestion.rewritten) return false;
      if (seenBulletIds.has(suggestion.bulletId)) return false;
      if (sameText(suggestion.original, suggestion.rewritten)) return false;
      seenBulletIds.add(suggestion.bulletId);
      return true;
    })
    .slice(0, MAX_TAILOR_REWRITES);

  return {
    emphasizedSkills: trimSkillList(json.emphasizedSkills, skillInventory, resumeText),
    deprioritizedSkills: trimSkillList(json.deprioritizedSkills, skillInventory, resumeText),
    bulletRewrites: suggestions,
    summary: typeof json.summary === 'string' ? limitSentences(json.summary, 2) : '',
    coverLetter: typeof json.coverLetter === 'string' ? trimToWords(cleanText(json.coverLetter), MAX_COVER_WORDS) : '',
  };
}

function trimSkillList(value: unknown, skillInventory: string[], resumeText: string): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Map(skillInventory.map((skill) => [skillKey(skill), skill]));
  const haystack = resumeText.toLowerCase();
  const seen = new Set<string>();
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => cleanText(item))
    .filter((item) => {
      const key = skillKey(item);
      if (!key || seen.has(key)) return false;
      const allowedSkill = allowed.get(key);
      const supported = Boolean(allowedSkill) || haystack.includes(item.toLowerCase());
      if (!supported) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
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

function extractSkillInventory(resume: Resume): string[] {
  const skills: string[] = [];
  for (const section of resume.sections.filter((item) => item.visible && item.type === 'skills')) {
    for (const entry of section.entries.filter((item) => item.visible !== false)) {
      skills.push(...splitSkills(entry.title));
      skills.push(...splitSkills(entry.subtitle));
      for (const bullet of entry.bullets ?? []) {
        if (bullet.visible) skills.push(...splitSkills(stripHtml(bullet.content)));
      }
    }
  }
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      skills.push(...(entry.tags ?? []));
      for (const bullet of entry.bullets ?? []) skills.push(...(bullet.tags ?? []));
    }
  }
  const seen = new Set<string>();
  return skills
    .map((skill) => cleanText(skill))
    .filter((skill) => {
      const key = skillKey(skill);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 80);
}

function splitSkills(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanGeneratedBullet(value: string): string {
  const cleaned = cleanText(value)
    .replace(/^[-*\d.)\s]+/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  return trimToWords(cleaned, MAX_BULLET_WORDS);
}

function cleanText(value: string): string {
  return stripHtml(value).replace(/\s+/g, ' ').trim();
}

function limitSentences(value: string, maxSentences: number): string {
  const cleaned = cleanText(value);
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [];
  return sentences
    .slice(0, maxSentences)
    .map((sentence) => sentence.trim())
    .join(' ')
    .trim();
}

function trimToWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return value.trim();
  return words.slice(0, maxWords).join(' ').replace(/[,\s]+$/, '').trim();
}

function sameText(a: string, b: string): boolean {
  return cleanText(a).toLowerCase() === cleanText(b).toLowerCase();
}

function skillKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, '');
}
