import type { ContactField, ContactFieldType, Entry, Resume, Section, SectionLayout, SectionType } from '@/types';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { normalizeResume } from '@/types/schema';
import { defaultLabelForContactType } from './contactIcon';
import { makeId } from './id';

export interface ConfidenceFlag {
  path: string;
  message: string;
  severity: 'low' | 'medium';
}

export interface ImportParseResult {
  resume: Resume;
  rawText: string;
  stats: {
    contactFields: number;
    sections: number;
    entries: number;
    bullets: number;
  };
  warnings: string[];
  flags: ConfidenceFlag[];
  hints?: {
    isLikelyLinkedIn?: boolean;
    twoColumnDetected?: boolean;
    ocrConfidence?: number;
  };
}

const SECTION_KEYWORDS: Record<string, SectionType> = {
  experience: 'experience',
  work: 'experience',
  employment: 'experience',
  'professional experience': 'experience',
  education: 'education',
  projects: 'projects',
  'personal projects': 'projects',
  skills: 'skills',
  'technical skills': 'skills',
  leadership: 'leadership',
  activities: 'leadership',
  extracurriculars: 'leadership',
  'volunteer experience': 'leadership',
  research: 'research',
  awards: 'awards',
  honors: 'awards',
  'honors & awards': 'awards',
  certifications: 'certifications',
  certificates: 'certifications',
  publications: 'publications',
  summary: 'summary',
  objective: 'summary',
};

const DATE_PATTERN =
  /\b((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(19|20)\d{2}\b(?:\s*[-–—]\s*(present|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?(19|20)\d{2}))?/i;

export function parseResumeText(
  raw: string,
  sourceName = 'Imported Resume',
  hints?: ImportParseResult['hints'],
): ImportParseResult {
  const normalized = normalizeResumeText(raw);
  const lines = normalized.split('\n').map((line) => line.trim()).filter(Boolean);
  const warnings: string[] = [];
  const flags: ConfidenceFlag[] = [];
  const base = createResumeFromTemplate('general');
  base.name = sourceName.replace(/\.[^.]+$/, '') || 'Imported Resume';

  const { name, confidence: nameConfidence } = detectName(lines);
  base.header.name = name;
  if (!name) {
    flags.push({ path: 'header.name', severity: 'low', message: 'Could not detect a name in the header.' });
  } else if (nameConfidence < 0.7) {
    flags.push({ path: 'header.name', severity: 'medium', message: 'Name detection was uncertain — please verify.' });
  }

  base.header.contactFields = detectContactFields(lines).slice(0, 7);
  if (base.header.contactFields.length === 0) {
    flags.push({ path: 'header.contactFields', severity: 'low', message: 'No contact fields detected.' });
  }

  const sectionGroups = hints?.isLikelyLinkedIn
    ? groupLinkedInSections(lines)
    : groupLinesBySection(lines);

  base.sections = sectionGroups
    .map((group, order) => parseSection(group, order, flags))
    .filter(Boolean) as Section[];

  if (base.sections.length === 0) {
    warnings.push('No clear section headers were found, so content was placed in a custom section.');
    base.sections = [
      {
        id: makeId(),
        type: 'custom',
        title: 'Imported Content',
        visible: true,
        order: 0,
        layout: 'bullet-list',
        entries: [
          {
            id: makeId(),
            bullets: lines.slice(1).map((line, order) => ({
              id: makeId(),
              content: cleanBullet(line),
              visible: true,
              order,
            })),
          },
        ],
      },
    ];
    flags.push({
      path: 'sections',
      severity: 'medium',
      message: 'No section headers detected; everything was placed in a single custom section.',
    });
  }

  const stats = {
    contactFields: base.header.contactFields.length,
    sections: base.sections.length,
    entries: base.sections.reduce((sum, section) => sum + section.entries.length, 0),
    bullets: base.sections.reduce(
      (sum, section) =>
        sum + section.entries.reduce((entrySum, entry) => entrySum + (entry.bullets?.length ?? 0), 0),
      0,
    ),
  };

  return { resume: base, rawText: normalized, stats, warnings, flags, hints };
}

export function parseResumeJson(raw: string): ImportParseResult | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    const normalized = normalizeResume(parsed);
    if (!normalized) return null;
    const resume = { ...normalized, updatedAt: new Date().toISOString() };
    return {
      resume,
      rawText: JSON.stringify(resume, null, 2),
      stats: {
        contactFields: resume.header.contactFields.length,
        sections: resume.sections.length,
        entries: resume.sections.reduce((sum, section) => sum + section.entries.length, 0),
        bullets: resume.sections.reduce(
          (sum, section) =>
            sum +
            section.entries.reduce(
              (entrySum, entry) => entrySum + (entry.bullets?.length ?? 0),
              0,
            ),
          0,
        ),
      },
      warnings: [],
      flags: [],
    };
  } catch {
    return null;
  }
}

// Heuristic: does this text look like it was meant to be a JSON resume export
// (so a failed parse should be reported, not silently treated as prose)?
export function looksLikeJson(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}') && /"sections"|"header"|"styles"/.test(trimmed);
}

export function normalizeResumeText(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[•▪◦●]/g, '-')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectName(lines: string[]): { name: string; confidence: number } {
  // Highest-confidence pick: a short top line that doesn't contain contact patterns.
  const top = lines.slice(0, 5);
  for (const line of top) {
    if (/@|linkedin|github|www\.|https?:|(\d{3}[\s.-]\d{3}[\s.-]\d{4})/i.test(line)) continue;
    if (line.length > 60) continue;
    const wordCount = line.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 5) continue;
    return { name: line, confidence: 0.9 };
  }
  // Fallback: first non-contact line, lower confidence.
  const fallback = lines.find(
    (line) => !/@|linkedin|github|www\.|https?:|(\d{3}[\s.-]\d{3}[\s.-]\d{4})/i.test(line),
  );
  return { name: fallback ?? '', confidence: fallback ? 0.5 : 0 };
}

function detectContactFields(lines: string[]): ContactField[] {
  const text = lines.slice(0, 8).join(' ');
  const fields: Omit<ContactField, 'id' | 'label' | 'visible' | 'order'>[] = [];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const phone = text.match(/(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/)?.[0];
  const linkedin = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[^\s|]+/i)?.[0];
  const github = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|]+/i)?.[0];
  const website = text.match(
    /(?:https?:\/\/)?(?:www\.)?(?!linkedin\.com|github\.com)[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s|]*)?/i,
  )?.[0];
  const location = text.match(/\b[A-Z][a-zA-Z .'-]+,\s*[A-Z]{2}\b/)?.[0];

  if (email) fields.push({ type: 'email', value: email });
  if (phone) fields.push({ type: 'phone', value: phone });
  if (linkedin) fields.push({ type: 'linkedin', value: linkedin });
  if (github) fields.push({ type: 'github', value: github });
  if (website && !email?.endsWith(website)) fields.push({ type: 'website', value: website });
  if (location) fields.push({ type: 'location', value: location });

  return fields.map((field, order) => ({
    ...field,
    id: makeId(),
    label: defaultLabelForContactType(field.type as ContactFieldType),
    visible: true,
    order,
  }));
}

interface SectionGroup {
  title: string;
  type: SectionType;
  lines: string[];
}

function groupLinesBySection(lines: string[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (const line of lines) {
    const sectionType = sectionTypeForLine(line);
    if (sectionType) {
      current = { title: titleCase(line), type: sectionType, lines: [] };
      groups.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return groups;
}

// LinkedIn PDFs use a predictable set of section labels and consistent whitespace.
function groupLinkedInSections(lines: string[]): SectionGroup[] {
  const knownLabels = [
    'Contact',
    'Top Skills',
    'Languages',
    'Summary',
    'Experience',
    'Education',
    'Certifications',
    'Honors & Awards',
    'Honors and Awards',
    'Publications',
    'Volunteer Experience',
    'Projects',
    'Courses',
    'Organizations',
  ];
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (const line of lines) {
    const matched = knownLabels.find(
      (label) => line.toLowerCase().trim() === label.toLowerCase(),
    );
    if (matched) {
      const type = SECTION_KEYWORDS[matched.toLowerCase()] ?? 'custom';
      current = { title: matched, type, lines: [] };
      groups.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return groups.length > 0 ? groups : groupLinesBySection(lines);
}

function sectionTypeForLine(line: string): SectionType | null {
  const normalized = line.toLowerCase().replace(/[^a-z &]/g, '').trim();
  if (normalized.length > 40) return null;
  const key = Object.keys(SECTION_KEYWORDS).find(
    (keyword) =>
      normalized === keyword || normalized.endsWith(keyword) || normalized.startsWith(keyword),
  );
  if (key) return SECTION_KEYWORDS[key];
  // Heading-shaped but unrecognized → custom (will be flagged for the user to
  // re-classify in the import review per §12.3).
  if (/^[A-Z][A-Z\s&]+$/.test(line) && line.length < 40) return 'custom';
  return null;
}

export function isUnclassified(section: { type: SectionType; title: string }): boolean {
  if (section.type !== 'custom') return false;
  // If the title matches a known keyword we trust the classification; otherwise
  // it's an unrecognized heading the user should triage.
  const normalized = section.title.toLowerCase().replace(/[^a-z &]/g, '').trim();
  return !Object.keys(SECTION_KEYWORDS).some((k) => normalized.includes(k));
}

function parseSection(
  group: SectionGroup,
  order: number,
  flags: ConfidenceFlag[],
): Section | null {
  const layout = layoutForType(group.type);
  if (group.lines.length === 0) return null;

  if (group.type === 'skills') {
    return {
      id: makeId(),
      type: 'skills',
      title: group.title,
      visible: true,
      order,
      layout,
      entries: parseSkills(group.lines),
    };
  }

  if (group.type === 'summary') {
    return {
      id: makeId(),
      type: 'summary',
      title: group.title,
      visible: true,
      order,
      layout,
      entries: [{ id: makeId(), title: group.lines.join(' ') }],
    };
  }

  const sectionPath = group.title.toLowerCase().replace(/\s+/g, '-');
  return {
    id: makeId(),
    type: group.type,
    title: group.title,
    visible: true,
    order,
    layout,
    entries: parseEntries(group.type, group.lines, sectionPath, flags),
  };
}

function parseSkills(lines: string[]): Entry[] {
  const entries = lines.flatMap((line) => {
    const [category, ...rest] = line.split(':');
    if (rest.length > 0) {
      return [{ id: makeId(), title: category.trim(), subtitle: rest.join(':').trim() }];
    }
    return line.split('|').map((part) => ({
      id: makeId(),
      title: 'General',
      subtitle: part.trim(),
    }));
  });
  return entries.filter((entry) => entry.subtitle);
}

function parseEntries(
  type: SectionType,
  lines: string[],
  sectionPath: string,
  flags: ConfidenceFlag[],
): Entry[] {
  const entries: Entry[] = [];
  let active: Entry | null = null;

  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      if (!active) {
        active = emptyEntry(type);
        entries.push(active);
      }
      active.bullets = [
        ...(active.bullets ?? []),
        {
          id: makeId(),
          content: cleanBullet(line),
          visible: true,
          order: active.bullets?.length ?? 0,
        },
      ];
      continue;
    }

    if (DATE_PATTERN.test(line) || !active || looksLikeEntryHeader(line)) {
      active = parseEntryHeader(type, line, sectionPath, entries.length, flags);
      entries.push(active);
      continue;
    }

    if (active) {
      if (!active.subtitle) active.subtitle = line;
      else {
        active.bullets = [
          ...(active.bullets ?? []),
          {
            id: makeId(),
            content: cleanBullet(line),
            visible: true,
            order: active.bullets?.length ?? 0,
          },
        ];
      }
    }
  }

  return entries
    .filter((entry) => Boolean(entry.title || entry.subtitle || entry.bullets?.length))
    .map((entry, index) => {
      if (!entry.title && !entry.startDate) {
        flags.push({
          path: `sections.${sectionPath}.entries.${index}.title`,
          severity: 'medium',
          message: 'Entry title and date were both empty after parsing.',
        });
      }
      return entry;
    });
}

function parseEntryHeader(
  type: SectionType,
  line: string,
  sectionPath: string,
  index: number,
  flags: ConfidenceFlag[],
): Entry {
  const date = line.match(DATE_PATTERN)?.[0] ?? '';
  const withoutDate = date ? line.replace(date, '').replace(/\s+[-|]\s*$/, '').trim() : line;
  const parts = withoutDate.split(/\s+\|\s+|\s+-\s+|,\s+/).map((part) => part.trim()).filter(Boolean);
  const entry = emptyEntry(type);
  entry.title = parts[0] ?? withoutDate;
  entry.subtitle = parts[1] ?? '';
  entry.location = parts[2] ?? '';
  if (date) {
    const [start, end] = date.split(/\s+-\s+/);
    entry.startDate = start?.trim() ?? '';
    entry.endDate = end?.trim() ?? '';
    entry.current = /present/i.test(entry.endDate);
  } else if (type === 'experience' || type === 'education' || type === 'projects') {
    flags.push({
      path: `sections.${sectionPath}.entries.${index}.dates`,
      severity: 'low',
      message: 'No date range detected for this entry.',
    });
  }
  return entry;
}

function emptyEntry(type: SectionType): Entry {
  return {
    id: makeId(),
    title: '',
    subtitle: '',
    location: '',
    bullets:
      type === 'awards' || type === 'certifications' || type === 'publications' ? [] : [],
    customFields: {},
  };
}

function looksLikeEntryHeader(line: string): boolean {
  return line.length < 100 && /^[A-Z0-9]/.test(line) && !line.endsWith('.');
}

function cleanBullet(line: string): string {
  return line.replace(/^[-*]\s*/, '').trim();
}

function layoutForType(type: SectionType): SectionLayout {
  if (type === 'skills') return 'skills-grid';
  if (type === 'summary') return 'text-block';
  return 'entry-based';
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
