import type { Entry, Section } from '@/types';

// Shared text-composition helpers used by BOTH the PDF renderer (pdfExport.tsx)
// and the DOCX renderer (exportFiles.ts). Keeping a single source of truth here
// means the two exports — and the on-screen preview they mirror — compose the
// same title/subtitle/tertiary lines instead of drifting apart (which is how the
// Word export ended up stacking raw "Major:/Minor:" label lines while the PDF
// folded them into the degree line).

export function mccombsSwapBold(type: Section['type']): boolean {
  return type === 'experience' || type === 'leadership' || type === 'research';
}

export function sectionHasBullets(section: Section): boolean {
  return (
    section.type === 'experience' ||
    section.type === 'projects' ||
    section.type === 'leadership' ||
    section.type === 'research' ||
    (section.type === 'custom' && section.layout === 'entry-based')
  );
}

export function titleForPreview(entry: Entry, section: Section): string {
  if (section.type === 'education') {
    const majors = [entry.customFields?.major, entry.customFields?.secondMajor]
      .map((major) => major?.trim())
      .filter(Boolean);
    const minor = entry.customFields?.minor?.trim();
    const parts = [entry.title?.trim() || ''].filter(Boolean);
    if (majors.length > 0) parts.push(majors.join(' & '));
    if (minor) parts.push(`Minor in ${minor}`);
    return parts.join(', ');
  }
  return entry.title?.trim() ?? '';
}

export function subtitleForPreview(entry: Entry, section: Section): string {
  if (section.type === 'publications') {
    return [entry.subtitle?.trim(), entry.customFields?.venue?.trim()].filter(Boolean).join(' - ');
  }
  return entry.subtitle?.trim() ?? '';
}

export function tertiaryForPreview(entry: Entry, section: Section): string {
  if (section.type === 'education') {
    return [
      entry.location?.trim(),
      entry.customFields?.gpa ? `GPA: ${entry.customFields.gpa.trim()}` : '',
      entry.customFields?.coursework ? `Coursework: ${entry.customFields.coursework.trim()}` : '',
      entry.customFields?.studyAbroad ? `Study abroad: ${entry.customFields.studyAbroad.trim()}` : '',
      entry.customFields?.honors ? `Honors: ${entry.customFields.honors.trim()}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  if (section.type === 'study-abroad') return '';
  return entry.location?.trim() ?? '';
}

export function studyAbroadLine(entry: Entry): string {
  const customFields = entry.customFields ?? {};
  const program = entry.title?.trim();
  const location = entry.location?.trim();
  const header = program && location ? `${program} in ${location}` : program || location || '';
  return [
    header,
    customFields.gpa?.trim() ? `GPA: ${customFields.gpa.trim()}` : '',
    customFields.language?.trim() ? customFields.language.trim() : '',
    customFields.coursework?.trim() ? `Courses: ${customFields.coursework.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

// Custom-field keys that are folded into the title/subtitle/tertiary lines (or
// are internal metadata) and so must NOT be re-emitted as standalone
// "Label: value" rows.
export const HIDDEN_CUSTOM_FIELD_KEYS = new Set([
  'kind',
  'major',
  'secondMajor',
  'minor',
  'certificate',
  'track',
  'mccombsTrack',
  'additionalCoursework',
  'studyAbroad',
  'honors',
  'coursework',
  'language',
  'gpa',
  'venue',
  'year',
  'githubUrl',
]);

// The custom-field rows that should render as their own "Label: value" lines for
// a given entry/section (everything not already folded into the headline lines).
export function visibleCustomFieldRows(entry: Entry, section: Section): [string, string][] {
  return Object.entries(entry.customFields ?? {})
    .map(([key, value]) => [key, value.trim()] as [string, string])
    .filter(([key, value]) => value && !HIDDEN_CUSTOM_FIELD_KEYS.has(key) && section.type !== 'education');
}

export function labelFromKey(key: string): string {
  const labels: Record<string, string> = {
    doiUrl: 'DOI / URL',
    githubUrl: 'GitHub URL',
    gpa: 'GPA',
    url: 'URL',
  };
  if (labels[key]) return labels[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
