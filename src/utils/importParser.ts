import type { ContactField, ContactFieldType, Entry, Resume, Section, SectionLayout, SectionType } from '@/types';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { normalizeResume } from '@/types/schema';
import { defaultLabelForContactType } from './contactIcon';
import { makeId } from './id';
import {
  LINKEDIN_SECTION_LABELS,
  fuzzyMatchSectionType,
  matchSectionType,
  normalizeHeadingKey,
  SECTION_LEXICON,
} from './resumeSectionLexicon';

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

// Month names + numeric dates + seasons + Present/Current/Now/Ongoing.
// Ranges accept -, –, —, or "to" with optional spaces.
const MONTH =
  '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const SEASON = '(spring|summer|fall|autumn|winter)';
const YEAR = '((?:19|20)\\d{2})';
const DATE_ATOM = `(?:${MONTH}\\.?\\s+${YEAR}|${SEASON}\\s+${YEAR}|${YEAR}|\\d{1,2}\\/${YEAR}|\\d{1,2}\\/\\d{1,2}\\/${YEAR})`;
const DATE_PATTERN = new RegExp(
  `\\b(?:${DATE_ATOM})(?:\\s*[-–—]\\s*|\\s+to\\s+)(?:present|current|now|ongoing|${DATE_ATOM})?|\\b(?:${DATE_ATOM})\\b`,
  'i',
);

const BULLET_PATTERN =
  /^\s*(?:[-*\uF0B7\uF0A7\u25CF\u25A0\u25AA\u2022\u2023\u2043•▪◦●‣∙·]|[oO0°¢|](?=\s)|(?:\d{1,2}|[a-z])[.)])\s+/i;

export function parseResumeText(
  raw: string,
  sourceName = 'Imported Resume',
  hints?: ImportParseResult['hints'],
): ImportParseResult {
  const normalized = normalizeResumeText(raw);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const flags: ConfidenceFlag[] = [];
  const base = createResumeFromTemplate('general');
  base.name = sourceName.replace(/\.[^.]+$/, '') || 'Imported Resume';

  const { name, confidence: nameConfidence } = detectName(lines);
  base.header.name = name;
  if (!name) {
    flags.push({ path: 'header.name', severity: 'low', message: 'Could not detect a name in the header.' });
  } else if (nameConfidence < 0.7) {
    flags.push({
      path: 'header.name',
      severity: 'medium',
      message: 'Name detection was uncertain — please verify.',
    });
  }

  base.header.contactFields = detectContactFields(lines).slice(0, 8);
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
            bullets: lines.slice(name ? 1 : 0).map((line, order) => ({
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
    // Drop PDF page chrome before structure detection.
    .replace(/^[ \t]*(?:--\s*)?(?:page\s+)?\d+\s*(?:of|\/)\s*\d+\s*(?:--)?[ \t]*$/gim, '')
    .replace(/^[ \t]*page\s+\d+[ \t]*$/gim, '')
    // Common OCR / PDF / Word bullet artifacts → standard dash bullets.
    // Includes Wingdings private-use bullet (\uF0B7) often extracted as .
    .replace(/[\uF0B7\uF0A7\u25CF\u25A0\u25AA\u2022\u2023\u2043•▪◦●‣∙·○◼︎□■◆◇►▸➢✔✓☑︎]\s*/g, '- ')
    .replace(/(^|\n)\s*[oO0°¢|]\s+(?=[A-Za-z])/g, '$1- ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function detectName(lines: string[]): { name: string; confidence: number } {
  const top = lines.slice(0, 6);
  for (const line of top) {
    if (isContactHeavy(line)) continue;
    if (matchSectionType(line) || fuzzyMatchSectionType(line)) continue;
    if (line.length > 60) continue;
    const wordCount = line.split(/\s+/).length;
    if (wordCount < 2 || wordCount > 5) continue;
    // Prefer Title Case / ALL CAPS name lines over sentence fragments.
    const titleLike =
      /^[A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+){1,4}$/.test(line) ||
      /^[A-Z][A-Z\s'’-]+$/.test(line);
    return { name: toNameCase(line), confidence: titleLike ? 0.92 : 0.75 };
  }
  const fallback = lines.find(
    (line) => !isContactHeavy(line) && !matchSectionType(line) && line.length < 80,
  );
  return { name: fallback ? toNameCase(fallback) : '', confidence: fallback ? 0.45 : 0 };
}

function isContactHeavy(line: string): boolean {
  return /@|linkedin|github|www\.|https?:|\+?\d[\d\s().-]{7,}\d/i.test(line);
}

function detectContactFields(lines: string[]): ContactField[] {
  // Scan until the first section heading (or first 20 lines) so wrapped contact
  // blocks and LinkedIn-style headers still get emails / phones / links.
  let end = lines.length;
  for (let i = 0; i < Math.min(lines.length, 20); i += 1) {
    if (i > 0 && (matchSectionType(lines[i]) || fuzzyMatchSectionType(lines[i]))) {
      end = i;
      break;
    }
  }
  const headerLines = lines.slice(0, Math.max(end, Math.min(12, lines.length)));
  const text = headerLines.join(' | ');

  const seen = new Set<string>();
  const fields: Omit<ContactField, 'id' | 'label' | 'visible' | 'order'>[] = [];

  const push = (type: ContactFieldType, value: string) => {
    const cleaned = value.replace(/[),.;]+$/, '').trim();
    if (!cleaned) return;
    const key = `${type}:${cleaned.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    fields.push({ type, value: cleaned });
  };

  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    push('email', match[0]);
  }

  // NANP + common intl formats (+44..., +91..., etc.).
  for (const match of text.matchAll(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}(?:\s*(?:x|ext\.?)\s*\d+)?/gi,
  )) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) continue;
    push('phone', match[0].trim());
  }

  for (const match of text.matchAll(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/gi,
  )) {
    push('linkedin', match[0]);
  }
  for (const match of text.matchAll(
    /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/gi,
  )) {
    push('github', match[0]);
  }

  for (const match of text.matchAll(
    /(?:https?:\/\/)?(?:www\.)?(?!linkedin\.com|github\.com)[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s|,]*)?/gi,
  )) {
    const value = match[0];
    if (/@/.test(value)) continue;
    push('website', value);
  }

  // Prefer metro-style places, then City, ST / City, State. Avoid skill-list commas.
  const location =
    text.match(
      /\b((?:[A-Z][a-zA-Z]+(?:[\s-][A-Z]?[a-zA-Z]+){0,3})\s+(?:Metroplex|Metro(?:politan)?(?:\s+Area)?|Bay Area|Area|Region|Valley))\b/,
    )?.[1] ??
    text.match(
      /\b([A-Z][a-zA-Z .'-]+,\s*(?:[A-Z]{2}|[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)(?:\s+\d{5}(?:-\d{4})?)?)\b/,
    )?.[1];
  if (
    location &&
    !/@/.test(location) &&
    !/linkedin|github|http/i.test(location) &&
    !/\b(experience|strategy|management|skills|product|customer)\b/i.test(location)
  ) {
    push('location', location);
  }

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
  let preamble: string[] = [];

  for (const line of lines) {
    const detected = detectHeading(line);
    if (detected) {
      current = { title: detected.title, type: detected.type, lines: [] };
      groups.push(current);
      continue;
    }
    if (current) current.lines.push(line);
    else preamble.push(line);
  }

  // Content above the first heading (objective / summary blurbs) used to be
  // discarded — keep it as a Summary when it looks like prose.
  if (preamble.length > 0) {
    const body = preamble.filter((line, index) => {
      if (index === 0 && looksLikePersonName(line)) return false;
      return !isContactHeavy(line);
    });
    if (body.length > 0) {
      const joined = body.join(' ');
      const looksLikeSummary =
        joined.length >= 40 ||
        looksLikeJobTitleHeadline(joined) ||
        /\b(experienced|experience|seeking|passionate|results|professional|engineer|developer|manager|executive)\b/i.test(
          joined,
        );
      if (looksLikeSummary) {
        groups.unshift({
          title: 'Summary',
          type: 'summary',
          lines: body,
        });
      } else if (groups.length === 0) {
        groups.push({ title: 'Imported Content', type: 'custom', lines: body });
      }
    }
  }

  return groups;
}

function groupLinkedInSections(lines: string[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  let current: SectionGroup | null = null;
  for (const line of lines) {
    const normalized = line.toLowerCase().trim().replace(/\s+\(\d+\)$/, '');
    const matched = LINKEDIN_SECTION_LABELS.find(
      (item) => item.label.toLowerCase() === normalized,
    );
    if (matched) {
      if (matched.label === 'Contact') {
        current = null;
        continue;
      }
      current = { title: matched.label, type: matched.type, lines: [] };
      groups.push(current);
      continue;
    }
    const fallback = detectHeading(line);
    if (fallback) {
      current = { title: fallback.title, type: fallback.type, lines: [] };
      groups.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return groups.length > 0 ? groups : groupLinesBySection(lines);
}

function detectHeading(line: string): { title: string; type: SectionType } | null {
  const trimmed = line.trim();
  if (trimmed.length > 48) return null;
  if (BULLET_PATTERN.test(trimmed)) return null;
  if (isContactHeavy(trimmed) && /@|linkedin|github/i.test(trimmed)) return null;

  // Lexicon match first — before name heuristics (e.g. "Work Experience").
  const exact = matchSectionType(trimmed);
  if (exact) return { title: titleCase(trimmed), type: exact };

  const fuzzyEarly = fuzzyMatchSectionType(trimmed);
  if (fuzzyEarly) return { title: titleCase(trimmed), type: fuzzyEarly };

  // Person names (2–4 capitalized words) are not section headings.
  if (looksLikePersonName(trimmed)) return null;

  // OpenResume-style: short ALL-CAPS or Title-Case standalone lines.
  const isAllCaps = /^[A-Z][A-Z0-9\s&/'-]+$/.test(trimmed) && /[A-Z]{3,}/.test(trimmed);
  const isTitleCase =
    /^[A-Z][a-z]+(?:\s+(?:[&/]|[A-Z][a-z]+))+/.test(trimmed) &&
    trimmed.split(/\s+/).length <= 5 &&
    !trimmed.endsWith('.');

  if (isAllCaps || isTitleCase) {
    const words = trimmed.split(/\s+/).filter((w) => w !== '&' && w !== '/');
    // Job-title headlines (PRODUCT … EXECUTIVE) belong in summary preamble, not as sections.
    if (looksLikeJobTitleHeadline(trimmed)) return null;
    // Unknown ALL-CAPS labels: allow 2–4 words (e.g. KEY ACHIEVEMENTS).
    // 2-word Title Case names are already excluded by looksLikePersonName.
    if (isAllCaps && trimmed.length < 40 && words.length >= 1 && words.length <= 4) {
      return { title: titleCase(trimmed), type: 'custom' };
    }
  }

  return null;
}

function looksLikeJobTitleHeadline(line: string): boolean {
  return /\b(executive|director|manager|engineer|analyst|specialist|consultant|officer|president|founder|lead|head|vp|svp|evp)\b/i.test(
    line,
  );
}

export function isUnclassified(section: { type: SectionType; title: string }): boolean {
  if (section.type !== 'custom') return false;
  const normalized = normalizeHeadingKey(section.title);
  return !Object.keys(SECTION_LEXICON).some(
    (k) => normalized === k || normalized.includes(k) || k.includes(normalized),
  );
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
    const cleaned = cleanBullet(line);
    if (/[,;•|]/.test(cleaned) && !cleaned.includes(':')) {
      return cleaned.split(/[,;•|]/).map((part) => ({
        id: makeId(),
        title: 'General',
        subtitle: part.trim(),
      }));
    }
    const [category, ...rest] = cleaned.split(':');
    if (rest.length > 0) {
      return [{ id: makeId(), title: category.trim(), subtitle: rest.join(':').trim() }];
    }
    return cleaned.split('|').map((part) => ({
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
  // When a company header nests multiple roles, keep the employer for siblings.
  let employerContext: { subtitle: string; location: string } | null = null;

  for (const line of lines) {
    if (BULLET_PATTERN.test(line)) {
      if (!active) {
        active = emptyEntry();
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

    // Standalone date line under a title → attach to the active entry.
    if (active && isDateOnlyLine(line)) {
      applyDateToEntry(active, line);
      continue;
    }

    if (!active || looksLikeEntryHeader(line)) {
      const next = parseEntryHeader(type, line);

      // Company line then role line (common PDF layout): title=role, subtitle=company.
      if (
        type === 'experience' &&
        active &&
        (active.bullets?.length ?? 0) === 0 &&
        looksLikeCompanyThenRole(active, next)
      ) {
        const companyName = active.title ?? '';
        const companyLocation = active.location;
        const companyStart = active.startDate;
        const companyEnd = active.endDate;
        const companyCurrent = active.current;
        active.title = next.title;
        active.subtitle = companyName;
        active.location = next.location || companyLocation || '';
        active.startDate = next.startDate || companyStart;
        active.endDate = next.endDate || companyEnd;
        active.current = next.current ?? companyCurrent;
        if (active.current) active.endDate = 'Present';
        employerContext = { subtitle: companyName, location: active.location || '' };
        continue;
      }

      // Another role under the same employer (after bullets on the previous role).
      if (
        type === 'experience' &&
        employerContext &&
        active &&
        (active.bullets?.length ?? 0) > 0 &&
        looksLikeSiblingRole(next, employerContext)
      ) {
        next.subtitle = next.subtitle || employerContext.subtitle;
        next.location = next.location || employerContext.location;
        active = next;
        entries.push(active);
        continue;
      }

      if (type === 'experience' && looksLikeOrgName(next.title ?? '') && !next.subtitle) {
        employerContext = { subtitle: next.title ?? '', location: next.location || '' };
      } else if (type === 'experience' && next.subtitle && looksLikeOrgName(next.subtitle)) {
        employerContext = { subtitle: next.subtitle, location: next.location || '' };
      } else if (!looksLikeSiblingRole(next, employerContext ?? { subtitle: '', location: '' })) {
        employerContext = null;
      }

      active = next;
      entries.push(active);
      continue;
    }

    // Company + dates already set; next short line is the role title.
    if (
      type === 'experience' &&
      active &&
      active.title &&
      !active.subtitle &&
      (active.bullets?.length ?? 0) === 0 &&
      looksLikeRoleTitle(line) &&
      line.length < 90 &&
      !/[.!?]$/.test(line)
    ) {
      active.subtitle = active.title;
      active.title = line;
      employerContext = {
        subtitle: active.subtitle,
        location: active.location || '',
      };
      continue;
    }

    if (!active.subtitle && line.length < 90 && !/[.!?]$/.test(line)) {
      active.subtitle = line;
      if (type === 'experience' && looksLikeOrgName(line)) {
        employerContext = { subtitle: line, location: active.location || '' };
      }
    } else {
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

  return entries
    .filter((entry) => Boolean(entry.title || entry.subtitle || entry.bullets?.length))
    .map((entry, index) => {
      if (!entry.title && !entry.startDate) {
        flags.push({
          path: `sections.${sectionPath}.entries.${index}.title`,
          severity: 'medium',
          message: 'Entry title and date were both empty after parsing.',
        });
      } else if (
        !entry.startDate &&
        (type === 'experience' || type === 'education' || type === 'projects')
      ) {
        // Flagged only now, after date-only lines have had a chance to attach.
        flags.push({
          path: `sections.${sectionPath}.entries.${index}.dates`,
          severity: 'low',
          message: 'No date range detected for this entry.',
        });
      }
      return entry;
    });
}

function isLocationLike(value: string): boolean {
  return (
    /^[A-Z].+,\s*[A-Z]{2}\b/.test(value) ||
    /\b(?:Metroplex|Metro(?:politan)?(?:\s+Area)?|Bay Area|Area|Region|Valley)\b/i.test(value)
  );
}

function looksLikeOrgName(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (looksLikeRoleTitle(trimmed)) return false;
  if (
    /\b(inc|llc|ltd|corp|corporation|company|co|group|labs|lab|technologies|technology|systems|solutions|partners|university|college|hospital|clinic|agency|studio|ventures|holdings)\b\.?$/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  // ALL-CAPS employer lines are common in PDF extracts.
  return /^[A-Z][A-Z0-9][A-Z0-9\s&.,'-]+$/.test(trimmed) && trimmed.split(/\s+/).length <= 8;
}

function looksLikeRoleTitle(title: string): boolean {
  return (
    looksLikeJobTitleHeadline(title) ||
    /\b(engineer|manager|director|analyst|designer|developer|specialist|consultant|intern|associate|architect|scientist|coordinator|administrator|producer|strategist|researcher|technician|advisor|accountant|attorney|nurse|teacher|professor)\b/i.test(
      title,
    )
  );
}

function looksLikeCompanyThenRole(company: Entry, role: Entry): boolean {
  if (!company.title || !role.title) return false;
  if ((company.bullets?.length ?? 0) > 0) return false;
  if (company.subtitle && !isLocationLike(company.subtitle)) return false;
  // Already parsed as "Role — Company".
  if (looksLikeRoleTitle(company.title) && company.subtitle) return false;
  return (
    looksLikeOrgName(company.title) ||
    looksLikeRoleTitle(role.title) ||
    Boolean(company.startDate && role.startDate && company.title !== role.title)
  );
}

function looksLikeSiblingRole(
  role: Entry,
  employer: { subtitle: string; location: string },
): boolean {
  if (!employer.subtitle || !role.title) return false;
  if (role.subtitle && !isLocationLike(role.subtitle)) return false;
  if (looksLikeOrgName(role.title) && !looksLikeRoleTitle(role.title)) return false;
  return Boolean(role.startDate) || looksLikeRoleTitle(role.title);
}

function parseEntryHeader(type: SectionType, line: string): Entry {
  const dateMatch = line.match(DATE_PATTERN);
  const date = dateMatch?.[0] ?? '';
  const withoutDate = date
    ? line.replace(date, '').replace(/[\s|,\-–—]+$/g, '').trim()
    : line;

  // Prefer | and " - " / " – " separators; avoid splitting "Austin, TX" on commas
  // unless there are clearly 3+ comma-separated fields.
  let parts: string[];
  if (/\s+\|\s+/.test(withoutDate)) {
    parts = withoutDate.split(/\s+\|\s+/).map((p) => p.trim()).filter(Boolean);
  } else if (/\s+[-–—]\s+/.test(withoutDate)) {
    parts = withoutDate.split(/\s+[-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  } else if ((withoutDate.match(/,/g) ?? []).length >= 2) {
    parts = withoutDate.split(/,\s+/).map((p) => p.trim()).filter(Boolean);
  } else if (
    (type === 'experience' || type === 'education') &&
    /^[^,]+,\s+[^,]+$/.test(withoutDate)
  ) {
    // "Software Engineer, Acme Corp" / "B.S. Computer Science, State U"
    const [left, right] = withoutDate.split(/,\s+/);
    if (left && right && !/^[A-Z]{2}$/.test(right) && !isLocationLike(right)) {
      parts = [left, right];
    } else {
      parts = [withoutDate];
    }
  } else {
    parts = [withoutDate];
  }

  const entry = emptyEntry();
  entry.title = parts[0] ?? withoutDate;
  entry.subtitle = parts[1] ?? '';
  entry.location = parts[2] ?? '';

  // If subtitle looks like a location (City, ST), promote it.
  if (!entry.location && entry.subtitle && /^[A-Z].+,\s*[A-Z]{2}\b/.test(entry.subtitle)) {
    entry.location = entry.subtitle;
    entry.subtitle = '';
  }

  if (date) {
    const rangeParts = date.split(/\s*(?:[-–—]|to)\s*/i);
    entry.startDate = normalizeDateToken(rangeParts[0] ?? '');
    entry.endDate = normalizeDateToken(rangeParts[1] ?? '');
    entry.current = /present|current|now|ongoing/i.test(entry.endDate);
    if (entry.current) entry.endDate = 'Present';
  }
  // Note: a "no date" flag is intentionally NOT added here. A date often lives
  // on the following standalone line and is attached later; flagging now would
  // produce false positives. Missing dates are flagged after assembly below.
  return entry;
}

function normalizeDateToken(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/present|current|now|ongoing/i.test(trimmed)) return 'Present';
  return trimmed.replace(/\s+/g, ' ');
}

function emptyEntry(): Entry {
  return {
    id: makeId(),
    title: '',
    subtitle: '',
    location: '',
    bullets: [],
    customFields: {},
  };
}

function looksLikeEntryHeader(line: string): boolean {
  if (BULLET_PATTERN.test(line)) return false;
  if (line.length > 100) return false;
  if (/[.!?]$/.test(line)) return false;
  if (detectHeading(line)) return false;
  if (isDateOnlyLine(line)) return false;

  // Prose with an incidental year ("…since 2020…") is not an entry header.
  if (DATE_PATTERN.test(line) && !dateLooksLikeHeader(line)) return false;

  const words = line.split(/\s+/);
  if (words.length > 12) return false;

  const hasRoleSeparator = /\s+[|–—-]\s+/.test(line);
  const startsCapitalized = /^[A-Z0-9]/.test(line);
  const mostlyTitleCase =
    words.filter((w) => /^[A-Z]/.test(w)).length >= Math.ceil(words.length * 0.5);

  return startsCapitalized && (hasRoleSeparator || mostlyTitleCase || words.length <= 6);
}

function isDateOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (!DATE_PATTERN.test(trimmed)) return false;
  const withoutDates = trimmed
    .replace(new RegExp(DATE_PATTERN.source, 'gi'), '')
    .replace(/[-–—]|to|present|current|now|ongoing/gi, '')
    .trim();
  return withoutDates.length === 0;
}

function dateLooksLikeHeader(line: string): boolean {
  return (
    /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|spring|summer|fall|autumn|winter|\d{4}|\d{1,2}\/)/i.test(
      line.trim(),
    ) || /[-–—]\s*(?:present|current|\d{4})/i.test(line)
  );
}

function applyDateToEntry(entry: Entry, line: string): void {
  const date = line.match(DATE_PATTERN)?.[0] ?? line;
  const rangeParts = date.split(/\s*(?:[-–—]|to)\s*/i);
  entry.startDate = normalizeDateToken(rangeParts[0] ?? '');
  entry.endDate = normalizeDateToken(rangeParts[1] ?? '');
  entry.current = /present|current|now|ongoing/i.test(entry.endDate);
  if (entry.current) entry.endDate = 'Present';
}

function looksLikePersonName(line: string): boolean {
  if (matchSectionType(line) || fuzzyMatchSectionType(line)) return false;
  if (looksLikeJobTitleHeadline(line) || looksLikeRoleTitle(line)) return false;
  const words = line.trim().split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (isContactHeavy(line) || DATE_PATTERN.test(line)) return false;
  // Section-ish phrases ("Selected Work", "KEY ACHIEVEMENTS") are not names.
  if (
    /\b(work|works|projects?|skills?|experience|education|summary|awards?|honors?|affiliations?|achievements?|publications?|certifications?|selected|additional|relevant|professional|technical|leadership|volunteer|languages?|interests?|references?|key)\b/i.test(
      line,
    )
  ) {
    return false;
  }
  // Prefer name-like tokens (letters / hyphen / apostrophe only).
  return words.every((w) => /^[A-Z][a-zA-Z'’-]*$/.test(w) || /^[A-Z]\.?$/.test(w));
}

function cleanBullet(line: string): string {
  return line.replace(BULLET_PATTERN, '').trim();
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
    .map((word) => {
      if (word === '&' || word === '/') return word;
      if (word === 'and') return 'and';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function toNameCase(value: string): string {
  if (/^[A-Z\s'’-]+$/.test(value) && value === value.toUpperCase()) {
    return titleCase(value);
  }
  return value.trim();
}
