import type { Bullet, Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { displayContactValue } from './contactIcon';

export interface ResumeBulletRef {
  sectionId: string;
  sectionTitle: string;
  entryId: string;
  entryTitle: string;
  bulletId: string;
  content: string;
}

export function resumeToPlainText(resume: Resume): string {
  const lines: string[] = [];
  const contacts = resume.header.contactFields
    .filter((field) => field.visible && field.value.trim())
    .sort((a, b) => a.order - b.order)
    .map((field) => displayContactValue(field.type, field.value.trim()));

  if (resume.header.name.trim()) lines.push(resume.header.name.trim());
  if (contacts.length > 0) lines.push(contacts.join(' | '));

  for (const section of resume.sections.filter((s) => s.visible).sort((a, b) => a.order - b.order)) {
    const sectionText = sectionToPlainText(section, resume);
    if (!sectionText) continue;
    lines.push('', section.title.toUpperCase(), sectionText);
  }

  return lines.join('\n');
}

export function collectBullets(resume: Resume): ResumeBulletRef[] {
  return resume.sections.filter((section) => section.visible).flatMap((section) =>
    section.entries.filter((entry) => entry.visible !== false).flatMap((entry) =>
      (entry.bullets ?? [])
        .filter((bullet) => bullet.visible && stripHtml(bullet.content).trim())
        .sort((a, b) => a.order - b.order)
        .map((bullet) => ({
          sectionId: section.id,
          sectionTitle: section.title,
          entryId: entry.id,
          entryTitle: entry.title || entry.subtitle || section.title,
          bulletId: bullet.id,
          content: stripHtml(bullet.content).trim(),
        })),
    ),
  );
}

export function replaceBulletContent(resume: Resume, bulletId: string, content: string): Resume {
  return {
    ...resume,
    sections: resume.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        bullets: entry.bullets?.map((bullet) =>
          bullet.id === bulletId ? { ...bullet, content } : bullet,
        ),
      })),
    })),
  };
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function sectionToPlainText(section: Section, resume: Resume): string {
  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return section.entries
      .filter(entryHasContent)
      .map((entry) => `${entry.title || 'Skills'}: ${entry.subtitle ?? ''}`.trim())
      .join('\n');
  }

  if (section.type === 'summary' || section.layout === 'text-block') {
    return section.entries.find(entryHasContent)?.title?.trim() ?? '';
  }

  if (section.layout === 'bullet-list') {
    const entry = section.entries.find((item) => item.visible !== false);
    return bulletsToText(entry?.bullets ?? []);
  }

  return section.entries.filter(entryHasContent).map((entry) => entryToText(entry, resume)).join('\n');
}

function entryToText(entry: Entry, resume: Resume): string {
  const date = formatDateRange(entry.startDate, entry.endDate, entry.current, resume.styles.dateFormat);
  const header = [entry.title, entry.subtitle, entry.location, date].filter(Boolean).join(' | ');
  const details = Object.entries(entry.customFields ?? {})
    .filter(([, value]) => value.trim())
    .map(([key, value]) => `${labelFromKey(key)}: ${value}`)
    .join('\n');
  const bullets = bulletsToText(entry.bullets ?? []);
  return [header, details, bullets].filter(Boolean).join('\n');
}

function bulletsToText(bullets: Bullet[]): string {
  return bullets
    .filter((bullet) => bullet.visible && stripHtml(bullet.content))
    .sort((a, b) => a.order - b.order)
    .map((bullet) => `- ${stripHtml(bullet.content)}`)
    .join('\n');
}

function entryHasContent(entry: Entry): boolean {
  if (entry.visible === false) return false;
  return Boolean(
    entry.title?.trim() ||
      entry.subtitle?.trim() ||
      entry.location?.trim() ||
      entry.startDate?.trim() ||
      entry.endDate?.trim() ||
      entry.url?.trim() ||
      Object.values(entry.customFields ?? {}).some((value) => value.trim()) ||
      entry.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)),
  );
}

function labelFromKey(key: string): string {
  const labels: Record<string, string> = {
    doiUrl: 'DOI / URL',
    githubUrl: 'GitHub URL',
    gpa: 'GPA',
    url: 'URL',
  };
  if (labels[key]) return labels[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
