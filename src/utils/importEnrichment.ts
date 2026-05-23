import { normalizeResume } from '@/types/schema';
import { generateAiText, type AiSettings } from './aiByok';
import { defaultLabelForContactType } from './contactIcon';
import { makeId } from './id';
import type { ContactFieldType, SectionType } from '@/types';
import type { ImportParseResult } from './importParser';

const SYSTEM_PROMPT = `You are a resume parser. Receive raw resume text and a preliminary structural parse.
Return a corrected JSON object with this exact shape:

{
  "header": { "name": "...", "contactFields": [{ "type": "email|phone|linkedin|github|website|location|twitter|custom", "value": "..." }] },
  "sections": [
    {
      "type": "experience|education|projects|skills|leadership|research|awards|certifications|publications|summary|custom",
      "title": "...",
      "entries": [
        {
          "title": "...",
          "subtitle": "...",
          "location": "...",
          "startDate": "Mon YYYY",
          "endDate": "Mon YYYY or Present",
          "current": true/false,
          "bullets": ["..."]
        }
      ]
    }
  ]
}

Rules:
- Preserve original bullet text exactly.
- Normalize dates to "Mon YYYY" format where possible.
- For skills sections, set entries[].title to the category and entries[].subtitle to the comma-separated skills.
- If a field cannot be determined, omit it.
- Return ONLY the JSON object, no commentary, no code fences.`;

export interface EnrichmentOutcome {
  result: ImportParseResult;
  applied: boolean;
  error?: string;
}

export async function enrichWithBYOK(
  settings: AiSettings,
  base: ImportParseResult,
): Promise<EnrichmentOutcome> {
  if (!settings.apiKey.trim()) {
    return { result: base, applied: false, error: 'No API key set.' };
  }
  try {
    const prompt =
      `${SYSTEM_PROMPT}\n\n--- RAW TEXT ---\n${base.rawText.slice(0, 8000)}\n\n` +
      `--- PRELIMINARY PARSE ---\n${JSON.stringify(condenseForPrompt(base), null, 2)}`;
    const raw = await generateAiText(settings, prompt, 1800);
    const json = extractJson(raw);
    if (!json) {
      return { result: base, applied: false, error: 'Provider response was not valid JSON.' };
    }
    // Merge into the existing base resume to preserve generated IDs.
    const merged = {
      ...base.resume,
      header: {
        ...base.resume.header,
        name: typeof json.header?.name === 'string' && json.header.name ? json.header.name : base.resume.header.name,
        contactFields: Array.isArray(json.header?.contactFields)
          ? json.header.contactFields
              .slice(0, 7)
              .map((field, index: number) => ({
                id: existingOrNewId(base.resume.header.contactFields[index]?.id),
                type: contactTypeOrCustom(field.type),
                value: typeof field.value === 'string' ? field.value : '',
                label:
                  typeof field.label === 'string' && field.label.trim()
                    ? field.label
                    : defaultLabelForContactType(contactTypeOrCustom(field.type)),
                visible: true,
                order: index,
              }))
              .filter((field) => field.value)
          : base.resume.header.contactFields,
      },
      sections: Array.isArray(json.sections)
        ? json.sections.map((section, sIdx: number) => {
            const sectionType = sectionTypeOrCustom(section.type);
            return {
            id: existingOrNewId(base.resume.sections[sIdx]?.id),
            type: sectionType,
            title: typeof section.title === 'string' ? section.title : 'Custom Section',
            visible: true,
            order: sIdx,
            layout:
              sectionType === 'skills'
                ? 'skills-grid'
                : sectionType === 'summary'
                ? 'text-block'
                : 'entry-based',
            entries: Array.isArray(section.entries)
              ? section.entries.map((entry, eIdx: number) => ({
                  id: existingOrNewId(base.resume.sections[sIdx]?.entries[eIdx]?.id),
                  title: entry.title ?? '',
                  subtitle: entry.subtitle ?? '',
                  location: entry.location ?? '',
                  startDate: entry.startDate ?? '',
                  endDate: entry.endDate ?? '',
                  current: Boolean(entry.current),
                  url: entry.url ?? '',
                  bullets: Array.isArray(entry.bullets)
                    ? entry.bullets
                      .filter((content): content is string => typeof content === 'string')
                      .map((content: string, bIdx: number) => ({
                        id: existingOrNewId(base.resume.sections[sIdx]?.entries[eIdx]?.bullets?.[bIdx]?.id),
                        content,
                        visible: true,
                        order: bIdx,
                      }))
                    : [],
                  customFields: {},
                }))
              : [],
            };
          })
        : base.resume.sections,
    };

    const normalized = normalizeResume(merged);
    if (!normalized) {
      return { result: base, applied: false, error: 'Provider returned data that failed schema validation.' };
    }
    return {
      result: { ...base, resume: normalized, flags: base.flags.filter((flag) => flag.severity === 'low') },
      applied: true,
    };
  } catch (err) {
    return {
      result: base,
      applied: false,
      error: err instanceof Error ? err.message : 'Enrichment failed.',
    };
  }
}

const CONTACT_TYPES: ContactFieldType[] = [
  'email',
  'phone',
  'linkedin',
  'github',
  'website',
  'location',
  'twitter',
  'custom',
];

const SECTION_TYPES: SectionType[] = [
  'experience',
  'education',
  'study-abroad',
  'projects',
  'skills',
  'leadership',
  'research',
  'awards',
  'certifications',
  'publications',
  'summary',
  'custom',
];

function existingOrNewId(value: string | undefined): string {
  return value && value.trim() ? value : makeId();
}

function contactTypeOrCustom(value: unknown): ContactFieldType {
  return CONTACT_TYPES.includes(value as ContactFieldType) ? (value as ContactFieldType) : 'custom';
}

function sectionTypeOrCustom(value: unknown): SectionType {
  return SECTION_TYPES.includes(value as SectionType) ? (value as SectionType) : 'custom';
}

interface RawJsonShape {
  header?: {
    name?: string;
    contactFields?: { type?: string; value?: string; label?: string }[];
  };
  sections?: {
    type?: string;
    title?: string;
    entries?: {
      title?: string;
      subtitle?: string;
      location?: string;
      startDate?: string;
      endDate?: string;
      current?: boolean;
      url?: string;
      bullets?: string[];
    }[];
  }[];
}

function extractJson(text: string): RawJsonShape | null {
  const trimmed = text.trim();
  // Try direct JSON parse first.
  try {
    return JSON.parse(trimmed) as RawJsonShape;
  } catch {
    // Strip code fences if present.
    const cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    try {
      return JSON.parse(cleaned) as RawJsonShape;
    } catch {
      // Last resort: find the first { ... last } substring.
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start === -1 || end === -1) return null;
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as RawJsonShape;
      } catch {
        return null;
      }
    }
  }
}

function condenseForPrompt(base: ImportParseResult) {
  return {
    header: {
      name: base.resume.header.name,
      contactFields: base.resume.header.contactFields.map((f) => ({
        type: f.type,
        value: f.value,
      })),
    },
    sections: base.resume.sections.map((s) => ({
      type: s.type,
      title: s.title,
      entries: s.entries.map((e) => ({
        title: e.title,
        subtitle: e.subtitle,
        location: e.location,
        startDate: e.startDate,
        endDate: e.endDate,
        bullets: e.bullets?.map((b) => b.content),
      })),
    })),
  };
}
