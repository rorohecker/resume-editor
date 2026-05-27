import { createElement } from 'react';
import type { ContactFieldType, Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { pdfFamilyKey } from './pdfFonts';
import { stripHtml } from './resumeText';
import { displayContactValue } from './contactIcon';

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
      // Three independent safety nets so the name + contact line never end
      // up mis-aligned in @react-pdf's layout:
      //  - width: 100% so the View doesn't shrink-wrap around its widest child
      //  - flexDirection: column to make alignItems the cross-axis (horizontal)
      //  - alignItems: center to flex-center every child horizontally
      // No extra paddingTop here — that just pushed content down and created
      // matching empty space at the bottom of the page. The page-level
      // paddingTop already comes from resume.styles.margins.top.
      width: '100%',
      flexDirection: 'column',
      alignItems: resume.template === 'cs-swe' ? 'flex-start' : 'center',
      marginBottom: 8,
    },
    name: {
      // width:100% + textAlign as a second guarantee. Together with
      // alignItems on the parent this gives us two independent centering
      // mechanisms — whichever react-pdf honors first, the result is the same.
      width: '100%',
      textAlign: resume.template === 'cs-swe' ? 'left' : 'center',
      fontSize: resume.styles.fontSize.name,
      fontWeight: 700,
      color: resume.styles.colors.name,
    },
    contactLine: {
      width: '100%',
      marginTop: 4,
      fontSize: resume.styles.fontSize.contactLine,
      textAlign: resume.template === 'cs-swe' ? 'left' : 'center',
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

  // Render the entire contact line as a single Text element so the contents
  // flow inline and wrap as text — the old approach used a flex-row View with
  // individual Link/Text children, which broke the visual line on wrap and
  // sometimes dropped trailing entries (e.g. GitHub) when the parent didn't
  // forward width constraints. Inline children inside Text wrap as one
  // paragraph and stay together.
  const contactChildren: ReturnType<typeof createElement>[] = [];
  contacts.forEach((field, index) => {
    const value = field.value.trim();
    const display = displayContactValue(field.type as ContactFieldType, value);
    if (index > 0) {
      contactChildren.push(createElement(Text, { key: `${field.id}-sep` }, separator));
    }
    contactChildren.push(
      linkableContact(field.type)
        ? createElement(
            Link,
            { key: field.id, src: hrefFor(field.type, value), style: styles.link },
            display,
          )
        : createElement(Text, { key: field.id }, display),
    );
  });

  return createElement(
    View,
    { style: styles.header },
    createElement(Text, { style: styles.name }, resume.header.name || resume.name),
    contacts.length > 0 &&
      createElement(Text, { style: styles.contactLine }, ...contactChildren),
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

  const glyph = BULLET_GLYPH_PDF[resume.styles.bulletStyle ?? 'disc'] ?? '\u2022';
  const prefix = glyph ? `${glyph} ` : '';
  return section.entries.filter(entryHasContent).map((entry, index) =>
    createElement(
      View,
      { key: entry.id, style: index === 0 ? undefined : entryStyle, wrap: false },
      createPdfEntryRow(entry, section, resume, pdfModule, styles),
      ...(entry.bullets ?? [])
        .filter((bullet) => bullet.visible && stripHtml(bullet.content))
        .map((bullet) =>
          createElement(Text, { key: bullet.id, style: styles.bullet }, `${prefix}${stripHtml(bullet.content)}`),
        ),
    ),
  );
}

const BULLET_GLYPH_PDF: Record<string, string> = {
  disc: '\u2022',
  circle: '\u25e6',
  square: '\u25aa',
  dash: '\u2013',
  arrow: '\u203a',
  none: '',
};

const MCCOMBS_SWAP_BOLD_PDF: Section['type'][] = ['experience', 'leadership', 'research'];

function createPdfEntryRow(
  entry: Entry,
  section: Section,
  resume: Resume,
  pdfModule: PdfModule,
  styles: PdfStyles,
) {
  const { Text, View, Link } = pdfModule;
  const date = formatDateRange(entry.startDate, entry.endDate, entry.current, resume.styles.dateFormat);

  if (
    resume.template === 'mccombs' &&
    (section.type === 'education' || section.type === 'study-abroad')
  ) {
    const cf = entry.customFields ?? {};
    const studyAbroadKind =
      section.type === 'study-abroad' || cf.kind === 'study-abroad';
    const lines: string[] = [];
    const coursework = cf.coursework?.trim();
    if (studyAbroadKind) {
      // One-line layout where possible: program + GPA, language, and courses joined by pipes.
      const program = entry.title?.trim();
      const loc = entry.location?.trim();
      const header = program && loc ? `${program} in ${loc}` : program || loc || '';
      const inline: string[] = [];
      if (header) inline.push(header);
      if (cf.gpa?.trim()) inline.push(`GPA: ${cf.gpa.trim()}`);
      if (cf.language?.trim()) inline.push(cf.language.trim());
      if (coursework) inline.push(`Courses: ${coursework}`);
      if (inline.length) lines.push(inline.join(' | '));
    } else {
      const majors = [cf.major, cf.secondMajor].map((m) => m?.trim()).filter(Boolean);
      const degreeLine = [entry.title?.trim(), majors.join(', ')].filter(Boolean).join(', ');
      if (degreeLine) lines.push(degreeLine);
      if (cf.track?.trim()) lines.push(`Track: ${cf.track.trim()}`);
      if (cf.minor?.trim()) lines.push(`Minor: ${cf.minor.trim()}`);
      if (cf.certificate?.trim()) lines.push(`Certificate: ${cf.certificate.trim()}`);
      if (cf.additionalCoursework?.trim())
        lines.push(`Additional Coursework in ${cf.additionalCoursework.trim()}`);
      if (cf.studyAbroad?.trim()) lines.push(cf.studyAbroad.trim());
      if (cf.gpa?.trim()) lines.push(`Overall GPA: ${cf.gpa.trim()}`);
      if (cf.honors?.trim()) lines.push(cf.honors.trim());
    }

    // Keep institution/date columns compact so long degree lines have room to
    // stay on one line in both the preview and exported PDF.
    return createElement(
      View,
      null,
      createElement(
        View,
        { style: { flexDirection: 'row', gap: 6 } },
        createElement(
          View,
          { style: { width: 1.75 * 72, flexShrink: 0 } },
          createElement(Text, { style: styles.entryTitle }, entry.subtitle?.trim() || ''),
        ),
        createElement(
          View,
          { style: { flexGrow: 1, flexShrink: 1 } },
          ...lines.map((line, i) =>
            createElement(Text, { key: `l${i}`, wrap: studyAbroadKind ? false : undefined }, line),
          ),
        ),
        date && createElement(Text, { style: { width: 1.1 * 72, textAlign: 'right', flexShrink: 0 }, wrap: false }, date),
      ),
      !studyAbroadKind &&
        coursework &&
        createElement(
          Text,
          { key: 'cw', style: { marginTop: 2 } },
          createElement(Text, { style: { fontWeight: 700 } }, 'Coursework: '),
          coursework,
        ),
    );
  }

  const studyAbroadKind =
    section.type === 'study-abroad' || entry.customFields?.kind === 'study-abroad';
  if (studyAbroadKind) {
    const line = studyAbroadLine(entry);
    return createElement(
      View,
      { style: styles.entryRow },
      createElement(
        View,
        { style: styles.entryLeft },
        line && createElement(Text, { style: styles.entryTitle, wrap: false }, line),
        entry.subtitle?.trim() && createElement(Text, null, entry.subtitle.trim()),
      ),
      date && createElement(Text, { style: styles.date, wrap: false }, date),
    );
  }

  if (resume.template === 'mccombs' && MCCOMBS_SWAP_BOLD_PDF.includes(section.type)) {
    const company = entry.subtitle?.trim();
    const role = entry.title?.trim();
    const location = entry.location?.trim();
    const inline: ReturnType<typeof createElement>[] = [];
    if (company) inline.push(createElement(Text, { key: 'c', style: { fontWeight: 700 } }, company));
    if (company && role) inline.push(createElement(Text, { key: 'sep' }, ' - '));
    if (role) inline.push(createElement(Text, { key: 'r', style: { fontStyle: 'italic' } }, role));
    if ((company || role) && location)
      inline.push(createElement(Text, { key: 'loc' }, `; ${location}`));
    if (!company && !role && location)
      inline.push(createElement(Text, { key: 'loc' }, location));

    return createElement(
      View,
      { style: styles.entryRow },
      createElement(View, { style: styles.entryLeft }, createElement(Text, null, ...inline)),
      date && createElement(Text, { style: styles.date, wrap: false }, date),
    );
  }

  // Projects: bold name + italic tech stack on the same line, regardless of
  // template, so each project costs one line instead of two.
  if (section.type === 'projects') {
    const projectName = entry.title?.trim();
    const techStack = entry.subtitle?.trim();
    const inline: ReturnType<typeof createElement>[] = [];
    if (projectName) {
      inline.push(
        entry.url
          ? createElement(
              Link,
              { key: 't', src: hrefFromRaw(entry.url), style: [styles.entryTitle, styles.link] },
              projectName,
            )
          : createElement(Text, { key: 't', style: { fontWeight: 700 } }, projectName),
      );
    }
    if (projectName && techStack) inline.push(createElement(Text, { key: 'sep' }, ' – '));
    if (techStack)
      inline.push(createElement(Text, { key: 'ts', style: { fontStyle: 'italic' } }, techStack));

    return createElement(
      View,
      { style: styles.entryRow },
      createElement(
        View,
        { style: styles.entryLeft },
        createElement(Text, null, ...inline),
        entry.customFields?.githubUrl &&
          createElement(
            Link,
            { src: hrefFromRaw(entry.customFields.githubUrl), style: styles.link },
            entry.customFields.githubUrl,
          ),
      ),
      date && createElement(Text, { style: styles.date, wrap: false }, date),
    );
  }

  const title = titleForPreview(entry, section);
  const subtitle = subtitleForPreview(entry, section);
  const tertiary = tertiaryForPreview(entry, section);

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
    const majors = [entry.customFields?.major, entry.customFields?.secondMajor]
      .map((m) => m?.trim())
      .filter(Boolean);
    const minor = entry.customFields?.minor?.trim();
    const parts: string[] = [entry.title?.trim() || ''].filter(Boolean) as string[];
    if (majors.length) parts.push(majors.join(' & '));
    if (minor) parts.push(`Minor in ${minor}`);
    return parts.filter(Boolean).join(', ');
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
      entry.customFields?.studyAbroad ? `Study abroad: ${entry.customFields.studyAbroad}` : '',
      entry.customFields?.honors ? `Honors: ${entry.customFields.honors}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  if (section.type === 'study-abroad') {
    return '';
  }
  return entry.location ?? '';
}

function studyAbroadLine(entry: Entry): string {
  const cf = entry.customFields ?? {};
  const program = entry.title?.trim();
  const loc = entry.location?.trim();
  const header = program && loc ? `${program} in ${loc}` : program || loc || '';
  return [
    header,
    cf.gpa?.trim() ? `GPA: ${cf.gpa.trim()}` : '',
    cf.language?.trim() ? cf.language.trim() : '',
    cf.coursework?.trim() ? `Courses: ${cf.coursework.trim()}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
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
