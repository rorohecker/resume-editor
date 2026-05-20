import { createElement } from 'react';
import type { Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { pdfFamilyKey } from './pdfFonts';
import { stripHtml } from './resumeText';

type PdfModule = typeof import('@react-pdf/renderer');
type PdfStyles = ReturnType<PdfModule['StyleSheet']['create']>;

export function createPdfDocumentFor(resume: Resume, pdfModule: PdfModule): ReturnType<typeof createElement> {
  const { Document, Page, StyleSheet, Text } = pdfModule;
  const styles = StyleSheet.create({
    page: {
      paddingTop: resume.styles.margins.top * 72,
      paddingRight: resume.styles.margins.right * 72,
      paddingBottom: resume.styles.margins.bottom * 72,
      paddingLeft: resume.styles.margins.left * 72,
      fontFamily: pdfFamilyKey(resume.styles.font),
      fontSize: resume.styles.fontSize.body,
      color: resume.styles.colors.body,
      lineHeight: resume.styles.spacing.bullet,
      backgroundColor: '#ffffff',
    },
    pageNumber: {
      position: 'absolute',
      bottom: resume.styles.margins.bottom * 36,
      left: 0,
      right: 0,
      textAlign: 'center',
      fontSize: Math.max(8, resume.styles.fontSize.body - 1),
      color: '#666666',
    },
    header: {
      textAlign: resume.template === 'cs-swe' ? 'left' : 'center',
      marginBottom: 8,
    },
    name: {
      fontSize: resume.styles.fontSize.name,
      fontWeight: 700,
      color: resume.styles.colors.name,
    },
    contactLine: {
      marginTop: 4,
      fontSize: resume.styles.fontSize.contactLine,
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: resume.template === 'cs-swe' ? 'flex-start' : 'center',
    },
    section: {
      marginTop: resume.styles.spacing.section,
    },
    sectionTitle: {
      fontSize: resume.styles.fontSize.sectionHeader,
      fontWeight: 700,
      color: resume.styles.colors.sectionHeader,
      textTransform: 'uppercase',
    },
    rule: {
      borderTopWidth: ruleWidth(resume),
      borderTopColor: resume.styles.colors.sectionRule,
      borderTopStyle: resume.styles.ruleStyle.variant === 'none' ? undefined : 'solid',
      marginTop: 1,
      marginBottom: 4,
      width: resume.styles.ruleStyle.variant === 'partial' ? 72 : '100%',
    },
    entry: {
      marginTop: resume.styles.spacing.entry,
    },
    entryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    entryLeft: {
      flexGrow: 1,
      flexShrink: 1,
      paddingRight: 8,
    },
    entryTitle: {
      fontSize: resume.styles.fontSize.entryTitle,
      fontWeight: 700,
    },
    date: {
      flexShrink: 0,
      textAlign: 'right',
    },
    bullet: {
      marginLeft: 12,
    },
    link: {
      color: resume.styles.colors.accent,
      textDecoration: 'none',
    },
  });

  const pageChildren: ReturnType<typeof createElement>[] = [
    createPdfHeader(resume, pdfModule, styles),
    ...visibleSections(resume).map((section) => createPdfSection(section, resume, pdfModule, styles)),
  ];

  if (resume.styles.pageNumbers) {
    pageChildren.push(
      createElement(Text, {
        key: 'page-number',
        style: styles.pageNumber,
        fixed: true,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `Page ${pageNumber} of ${totalPages}`,
      }),
    );
  }

  return createElement(
    Document,
    { title: resume.header.name || resume.name },
    createElement(
      Page,
      {
        size: resume.styles.paperSize === 'a4' ? 'A4' : 'LETTER',
        style: styles.page,
        wrap: true,
      },
      ...pageChildren,
    ),
  );
}

function createPdfHeader(resume: Resume, { Text, View, Link }: PdfModule, styles: PdfStyles) {
  const contacts = resume.header.contactFields
    .filter((field) => field.visible && field.value.trim())
    .sort((a, b) => a.order - b.order);
  const separator = ` ${separatorText(resume.header.separatorStyle)} `;

  return createElement(
    View,
    { style: styles.header },
    createElement(Text, { style: styles.name }, resume.header.name || resume.name),
    contacts.length > 0 &&
      createElement(
        View,
        { style: styles.contactLine },
        ...contacts.flatMap((field, index) => {
          const value = field.value.trim();
          const content = linkableContact(field.type)
            ? createElement(Link, { key: field.id, src: hrefFor(field.type, value), style: styles.link }, value)
            : createElement(Text, { key: field.id }, value);
          return index === 0
            ? [content]
            : [createElement(Text, { key: `${field.id}-sep` }, separator), content];
        }),
      ),
  );
}

function createPdfSection(section: Section, resume: Resume, pdfModule: PdfModule, styles: PdfStyles) {
  const { Text, View } = pdfModule;
  if (section.type === 'page-break') {
    // @react-pdf honors `break` on Views/Text by starting a new page after.
    return createElement(View, { key: section.id, break: true });
  }
  const overrides = section.styleOverrides ?? {};
  const titleStyle = {
    ...styles.sectionTitle,
    color: overrides.sectionHeaderColor ?? styles.sectionTitle.color,
    textTransform: (overrides.uppercaseTitle ?? true ? 'uppercase' : 'none') as 'uppercase' | 'none',
  };

  return createElement(
    View,
    {
      key: section.id,
      style: {
        ...styles.section,
        marginTop: overrides.spaceAbove ?? styles.section.marginTop,
        color: overrides.bodyColor ?? undefined,
      },
      wrap: true,
    },
    createElement(View, { wrap: false }, [
      createElement(Text, { key: 'title', style: titleStyle }, section.title),
      !overrides.hideRule &&
        resume.styles.ruleStyle.variant !== 'none' &&
        createElement(View, { key: 'rule', style: styles.rule }),
    ]),
    ...sectionToPdfContent(section, resume, pdfModule, styles),
  );
}

function sectionToPdfContent(section: Section, resume: Resume, pdfModule: PdfModule, styles: PdfStyles) {
  const { Text, View } = pdfModule;

  if (section.type === 'summary' || section.layout === 'text-block') {
    const text = section.entries[0]?.title?.trim();
    return text ? [createElement(Text, { key: `${section.id}-summary` }, text)] : [];
  }

  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return section.entries.filter(entryHasContent).map((entry) =>
      createElement(
        Text,
        { key: entry.id },
        createElement(Text, { style: { fontWeight: 700 } }, `${entry.title || 'Skills'}: `),
        entry.subtitle ?? '',
      ),
    );
  }

  const entryStyle = section.styleOverrides?.entrySpacing !== undefined
    ? { marginTop: section.styleOverrides.entrySpacing }
    : styles.entry;

  return section.entries.filter(entryHasContent).map((entry, index) =>
    createElement(
      View,
      { key: entry.id, style: index === 0 ? undefined : entryStyle, wrap: false },
      createPdfEntryRow(entry, section, resume, pdfModule, styles),
      ...(entry.bullets ?? [])
        .filter((bullet) => bullet.visible && stripHtml(bullet.content))
        .map((bullet) =>
          createElement(Text, { key: bullet.id, style: styles.bullet }, `\u2022 ${stripHtml(bullet.content)}`),
        ),
    ),
  );
}

function createPdfEntryRow(
  entry: Entry,
  section: Section,
  resume: Resume,
  { Text, View, Link }: PdfModule,
  styles: PdfStyles,
) {
  const title = titleForPreview(entry, section);
  const subtitle = subtitleForPreview(entry, section);
  const tertiary = tertiaryForPreview(entry, section);
  const date = formatDateRange(entry.startDate, entry.endDate, entry.current, resume.styles.dateFormat);

  return createElement(
    View,
    { style: styles.entryRow },
    createElement(
      View,
      { style: styles.entryLeft },
      title &&
        (entry.url
          ? createElement(Link, { src: hrefFromRaw(entry.url), style: [styles.entryTitle, styles.link] }, title)
          : createElement(Text, { style: styles.entryTitle }, title)),
      subtitle && createElement(Text, null, subtitle),
      tertiary && createElement(Text, null, tertiary),
    ),
    date && createElement(Text, { style: styles.date, wrap: false }, date),
  );
}

function visibleSections(resume: Resume): Section[] {
  return resume.sections
    .filter((section) => section.visible && sectionHasContent(section))
    .sort((a, b) => a.order - b.order);
}

function sectionHasContent(section: Section): boolean {
  if (section.type === 'page-break') return true;
  if (section.type === 'summary' || section.layout === 'text-block') {
    return Boolean(section.entries[0]?.title?.trim());
  }
  if (section.layout === 'bullet-list') {
    return Boolean(section.entries[0]?.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)));
  }
  return section.entries.some(entryHasContent);
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
      entry.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)) ||
      Object.values(entry.customFields ?? {}).some((value) => value.trim()),
  );
}

function titleForPreview(entry: Entry, section: Section): string {
  if (section.type === 'education') {
    return [entry.title, entry.customFields?.major].filter(Boolean).join(', ');
  }
  return entry.title ?? '';
}

function subtitleForPreview(entry: Entry, section: Section): string {
  if (section.type === 'publications') {
    return [entry.subtitle, entry.customFields?.venue].filter(Boolean).join(' - ');
  }
  return entry.subtitle ?? '';
}

function tertiaryForPreview(entry: Entry, section: Section): string {
  if (section.type === 'education') {
    return [
      entry.location,
      entry.customFields?.gpa ? `GPA: ${entry.customFields.gpa}` : '',
      entry.customFields?.coursework ? `Coursework: ${entry.customFields.coursework}` : '',
      entry.customFields?.honors ? `Honors: ${entry.customFields.honors}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return entry.location ?? '';
}

function ruleWidth(resume: Resume): number {
  if (resume.styles.ruleStyle.variant === 'thick') return Math.max(resume.styles.ruleStyle.weight, 1.5);
  return resume.styles.ruleStyle.weight;
}

function separatorText(separator: Resume['header']['separatorStyle']): string {
  if (separator === 'dot') return '\u00b7';
  if (separator === 'dash') return '-';
  return '|';
}

function linkableContact(type: string): boolean {
  return ['email', 'linkedin', 'github', 'website', 'twitter'].includes(type);
}

function hrefFor(type: string, value: string): string {
  if (type === 'email') return `mailto:${value}`;
  return hrefFromRaw(value);
}

function hrefFromRaw(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}
