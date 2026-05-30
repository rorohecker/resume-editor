import { Document, Link, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import type { Bullet, ContactField, Entry, Resume, RuleStyle, Section } from '@/types';
import { displayContactValue } from './contactIcon';
import { formatDateRange } from './dateFormat';
import { resumeForPagedExport } from './resumeLayout';
import { stripHtml } from './resumeText';
import {
  labelFromKey,
  mccombsSwapBold,
  sectionHasBullets,
  studyAbroadLine,
  subtitleForPreview,
  tertiaryForPreview,
  titleForPreview,
  visibleCustomFieldRows,
} from './resumeComposition';

const IN = 72;

const PAGE_SIZES: Record<Resume['styles']['paperSize'], 'LETTER' | 'A4'> = {
  letter: 'LETTER',
  a4: 'A4',
};

const BULLET_GLYPH: Record<string, string> = {
  disc: '\u2022',
  circle: '\u25e6',
  square: '\u25aa',
  dash: '\u2013',
  arrow: '\u203a',
  none: '',
};

export async function renderResumePdfBlob(resume: Resume): Promise<Blob> {
  const document = <ResumePdfDocument resume={resumeForPagedExport(resume)} />;
  return pdf(document).toBlob();
}

function ResumePdfDocument({ resume }: { resume: Resume }) {
  const pdfStyles = createPdfStyles(resume);
  const visible = visibleSections(resume);

  return (
    <Document title={resume.header.name || resume.name || 'Resume'}>
      <Page size={PAGE_SIZES[resume.styles.paperSize]} style={pdfStyles.page}>
        <Header resume={resume} pdfStyles={pdfStyles} />
        {visible.map((section) =>
          section.type === 'page-break' ? (
            <View key={section.id} break style={pdfStyles.pageBreak} />
          ) : (
            <SectionBlock
              key={section.id}
              section={section}
              resume={resume}
              pdfStyles={pdfStyles}
            />
          ),
        )}
      </Page>
    </Document>
  );
}

function Header({
  resume,
  pdfStyles,
}: {
  resume: Resume;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const fields = resume.header.contactFields
    .filter((field) => field.visible && field.value.trim())
    .sort((a, b) => a.order - b.order);

  return (
    <View style={resume.template === 'cs-swe' ? pdfStyles.headerLeft : pdfStyles.headerCenter}>
      <Text style={pdfStyles.name}>{resume.header.name || resume.name || 'Resume'}</Text>
      {fields.length > 0 && (
        <Text style={pdfStyles.contactLine}>
          {fields.map((field, index) => {
            const value = displayContactValue(field.type, field.value.trim());
            const prefix = index > 0 ? ` ${separatorText(resume.header.separatorStyle)} ` : '';
            if (!isLinkable(field.type)) {
              return (
                <Text key={field.id}>
                  {prefix}
                  {value}
                </Text>
              );
            }
            return (
              <Text key={field.id}>
                {prefix}
                <Link src={hrefFor(field)} style={pdfStyles.link}>
                  {value}
                </Link>
              </Text>
            );
          })}
        </Text>
      )}
    </View>
  );
}

function SectionBlock({
  section,
  resume,
  pdfStyles,
}: {
  section: Section;
  resume: Resume;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const overrides = section.styleOverrides ?? {};
  const title = overrides.uppercaseTitle === false ? section.title : section.title.toUpperCase();

  return (
    <View
      style={[
        pdfStyles.section,
        {
          marginTop: overrides.spaceAbove ?? resume.styles.spacing.section,
          color: overrides.bodyColor ?? resume.styles.colors.body,
        },
      ]}
    >
      <Text
        style={[
          pdfStyles.sectionTitle,
          { color: overrides.sectionHeaderColor ?? resume.styles.colors.sectionHeader },
        ]}
      >
        {title}
      </Text>
      {!overrides.hideRule && <SectionRule rule={resume.styles.ruleStyle} color={resume.styles.colors.sectionRule} />}
      {renderSectionContent(section, resume, pdfStyles)}
    </View>
  );
}

function SectionRule({ rule, color }: { rule: RuleStyle; color: string }) {
  if (rule.variant === 'none') return null;

  const width = rule.variant === 'partial' ? IN : '100%';
  const weight = rule.variant === 'thick' ? Math.max(rule.weight, 1.5) : rule.weight;
  const line = {
    borderBottomColor: color,
    borderBottomWidth: weight,
    borderBottomStyle: 'solid' as const,
    width,
  };

  if (rule.variant === 'double') {
    return (
      <View style={{ marginTop: 1, marginBottom: 4, width }}>
        <View style={line} />
        <View style={[line, { marginTop: Math.max(1, weight * 2) }]} />
      </View>
    );
  }

  return <View style={[line, { marginTop: 1, marginBottom: 4 }]} />;
}

function renderSectionContent(
  section: Section,
  resume: Resume,
  pdfStyles: ReturnType<typeof createPdfStyles>,
) {
  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return <SkillsSection section={section} pdfStyles={pdfStyles} />;
  }

  if (section.type === 'summary' || section.layout === 'text-block') {
    const text = section.entries[0]?.title?.trim();
    return text ? <Text style={pdfStyles.paragraph}>{text}</Text> : null;
  }

  if (section.layout === 'bullet-list') {
    return <BulletList bullets={section.entries[0]?.bullets ?? []} resume={resume} pdfStyles={pdfStyles} />;
  }

  return section.entries
    .filter(entryHasContent)
    .map((entry, index) => (
      <EntryBlock
        key={entry.id}
        entry={entry}
        section={section}
        resume={resume}
        first={index === 0}
        pdfStyles={pdfStyles}
      />
    ));
}

function SkillsSection({
  section,
  pdfStyles,
}: {
  section: Section;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  return (
    <View>
      {section.entries.filter(entryHasContent).map((entry, index) => (
        <Text key={entry.id} style={[pdfStyles.skillLine, { marginTop: index === 0 ? 0 : 2 }]}>
          <Text style={pdfStyles.bold}>{entry.title || 'Skills'}: </Text>
          <Text>{entry.subtitle ?? ''}</Text>
        </Text>
      ))}
    </View>
  );
}

function EntryBlock({
  entry,
  section,
  resume,
  first,
  pdfStyles,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
  first: boolean;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const date = formatDateRange(
    entry.startDate,
    section.type === 'publications' ? entry.endDate || entry.customFields?.year : entry.endDate,
    entry.current,
    resume.styles.dateFormat,
  );
  const marginTop = first ? 0 : section.styleOverrides?.entrySpacing ?? resume.styles.spacing.entry;
  const isStudyAbroadKind =
    section.type === 'study-abroad' || entry.customFields?.kind === 'study-abroad';

  if (resume.template === 'mccombs' && (section.type === 'education' || section.type === 'study-abroad')) {
    return (
      <View style={[pdfStyles.entry, { marginTop }]}>
        <McCombsEducationRow
          entry={entry}
          date={date}
          studyAbroadKind={isStudyAbroadKind}
          pdfStyles={pdfStyles}
        />
      </View>
    );
  }

  const showBullets = sectionHasBullets(section) || isStudyAbroadKind;

  return (
    <View style={[pdfStyles.entry, { marginTop }]}>
      <View style={pdfStyles.entryHeaderRow}>
        <View style={pdfStyles.entryHeaderLeft}>
          {resume.template === 'mccombs' && mccombsSwapBold(section.type) ? (
            <McCombsInlineHeader entry={entry} section={section} pdfStyles={pdfStyles} />
          ) : resume.template !== 'mccombs' && isStudyAbroadKind ? (
            <StudyAbroadInlineHeader entry={entry} pdfStyles={pdfStyles} />
          ) : section.type === 'projects' ? (
            <ProjectInlineHeader entry={entry} pdfStyles={pdfStyles} />
          ) : (
            <EntryLeft entry={entry} section={section} pdfStyles={pdfStyles} />
          )}
        </View>
        {date && <Text style={pdfStyles.date}>{date}</Text>}
      </View>
      <CustomFieldLines entry={entry} section={section} pdfStyles={pdfStyles} />
      {showBullets && <BulletList bullets={entry.bullets ?? []} resume={resume} pdfStyles={pdfStyles} />}
    </View>
  );
}

function McCombsEducationRow({
  entry,
  date,
  studyAbroadKind,
  pdfStyles,
}: {
  entry: Entry;
  date: string;
  studyAbroadKind: boolean;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const customFields = entry.customFields ?? {};
  const coursework = customFields.coursework?.trim();
  const lines: string[] = [];

  if (studyAbroadKind) {
    const program = entry.title?.trim();
    const location = entry.location?.trim();
    const header = program && location ? `${program} in ${location}` : program || location || '';
    const inline = [
      header,
      customFields.gpa?.trim() ? `GPA: ${customFields.gpa.trim()}` : '',
      customFields.language?.trim() ?? '',
      coursework ? `Courses: ${coursework}` : '',
    ].filter(Boolean);
    if (inline.length > 0) lines.push(inline.join(' | '));
  } else {
    const majors = [customFields.major, customFields.secondMajor].map((item) => item?.trim()).filter(Boolean);
    const degreeLine = [entry.title?.trim(), majors.join(', ')].filter(Boolean).join(', ');
    if (degreeLine) lines.push(degreeLine);
    if (customFields.track?.trim()) lines.push(`Track: ${customFields.track.trim()}`);
    if (customFields.minor?.trim()) lines.push(`Minor: ${customFields.minor.trim()}`);
    if (customFields.certificate?.trim()) lines.push(`Certificate: ${customFields.certificate.trim()}`);
    if (customFields.additionalCoursework?.trim()) {
      lines.push(`Additional Coursework in ${customFields.additionalCoursework.trim()}`);
    }
    if (customFields.studyAbroad?.trim()) lines.push(customFields.studyAbroad.trim());
    if (customFields.gpa?.trim()) lines.push(`Overall GPA: ${customFields.gpa.trim()}`);
    if (customFields.honors?.trim()) lines.push(customFields.honors.trim());
  }

  return (
    <View style={pdfStyles.mccombsEducationGrid}>
      <Text style={[pdfStyles.entryTitle, pdfStyles.bold, pdfStyles.mccombsSchool]}>
        {entry.subtitle?.trim() || ''}
      </Text>
      <View style={pdfStyles.mccombsDegree}>
        {lines.map((line) => (
          <Text key={line} style={studyAbroadKind ? pdfStyles.noWrapLine : pdfStyles.bodyText}>
            {line}
          </Text>
        ))}
      </View>
      {date && <Text style={pdfStyles.mccombsDate}>{date}</Text>}
      {!studyAbroadKind && coursework && (
        <Text style={pdfStyles.fullWidthDetail}>
          <Text style={pdfStyles.bold}>Coursework:</Text> {coursework}
        </Text>
      )}
    </View>
  );
}

function StudyAbroadInlineHeader({
  entry,
  pdfStyles,
}: {
  entry: Entry;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const line = studyAbroadLine(entry);
  const host = entry.subtitle?.trim();
  return (
    <View>
      {line && <Text style={[pdfStyles.entryTitle, pdfStyles.bold]}>{line}</Text>}
      {host && <Text>{host}</Text>}
    </View>
  );
}

function McCombsInlineHeader({
  entry,
  section,
  pdfStyles,
}: {
  entry: Entry;
  section: Section;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const company = entry.subtitle?.trim();
  const role = entry.title?.trim();
  const location = entry.location?.trim();

  return (
    <View>
      <Text style={pdfStyles.entryTitle}>
        {company && <Text style={pdfStyles.bold}>{company}</Text>}
        {company && role && <Text> - </Text>}
        {role && <Text style={pdfStyles.italic}>{role}</Text>}
        {(company || role) && location && <Text>; {location}</Text>}
        {!company && !role && location && <Text>{location}</Text>}
      </Text>
      {section.type === 'projects' && entry.customFields?.githubUrl && (
        <Link src={hrefFromRaw(entry.customFields.githubUrl)} style={pdfStyles.link}>
          {entry.customFields.githubUrl}
        </Link>
      )}
    </View>
  );
}

function ProjectInlineHeader({
  entry,
  pdfStyles,
}: {
  entry: Entry;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const title = entry.title?.trim();
  const techStack = entry.subtitle?.trim();

  return (
    <View>
      <Text style={pdfStyles.entryTitle}>
        {title &&
          (entry.url ? (
            <Link src={hrefFromRaw(entry.url)} style={[pdfStyles.link, pdfStyles.bold]}>
              {title}
            </Link>
          ) : (
            <Text style={pdfStyles.bold}>{title}</Text>
          ))}
        {title && techStack && <Text> - </Text>}
        {techStack && <Text style={pdfStyles.italic}>{techStack}</Text>}
      </Text>
      {entry.customFields?.githubUrl && (
        <Link src={hrefFromRaw(entry.customFields.githubUrl)} style={pdfStyles.link}>
          {entry.customFields.githubUrl}
        </Link>
      )}
    </View>
  );
}

function EntryLeft({
  entry,
  section,
  pdfStyles,
}: {
  entry: Entry;
  section: Section;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const title = titleForPreview(entry, section);
  const subtitle = subtitleForPreview(entry, section);
  const tertiary = tertiaryForPreview(entry, section);

  return (
    <View>
      {title && (
        <Text style={[pdfStyles.entryTitle, pdfStyles.bold]}>
          {entry.url ? (
            <Link src={hrefFromRaw(entry.url)} style={[pdfStyles.link, pdfStyles.bold]}>
              {title}
            </Link>
          ) : (
            title
          )}
        </Text>
      )}
      {subtitle && (
        <Text style={section.type === 'projects' ? pdfStyles.italic : pdfStyles.bodyText}>{subtitle}</Text>
      )}
      {tertiary && <Text>{tertiary}</Text>}
      {entry.customFields?.githubUrl && section.type === 'projects' && (
        <Link src={hrefFromRaw(entry.customFields.githubUrl)} style={pdfStyles.link}>
          {entry.customFields.githubUrl}
        </Link>
      )}
      {entry.url && section.type !== 'projects' && section.type !== 'certifications' && (
        <Link src={hrefFromRaw(entry.url)} style={pdfStyles.link}>
          {entry.url}
        </Link>
      )}
    </View>
  );
}

function CustomFieldLines({
  entry,
  section,
  pdfStyles,
}: {
  entry: Entry;
  section: Section;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const rows = visibleCustomFieldRows(entry, section);
  if (rows.length === 0) return null;

  return (
    <View style={pdfStyles.customFields}>
      {rows.map(([key, value]) => (
        <Text key={key}>
          <Text style={pdfStyles.bold}>{labelFromKey(key)}: </Text>
          {value}
        </Text>
      ))}
    </View>
  );
}

function BulletList({
  bullets,
  resume,
  pdfStyles,
}: {
  bullets: Bullet[];
  resume: Resume;
  pdfStyles: ReturnType<typeof createPdfStyles>;
}) {
  const visible = bullets
    .filter((bullet) => bullet.visible && stripHtml(bullet.content))
    .sort((a, b) => a.order - b.order);
  if (visible.length === 0) return null;

  const glyph = BULLET_GLYPH[resume.styles.bulletStyle ?? 'disc'] ?? BULLET_GLYPH.disc;

  return (
    <View style={pdfStyles.bullets}>
      {visible.map((bullet) => (
        <View key={bullet.id} style={pdfStyles.bulletRow}>
          {glyph && <Text style={pdfStyles.bulletGlyph}>{glyph}</Text>}
          <Text style={glyph ? pdfStyles.bulletText : pdfStyles.bulletTextNoGlyph}>
            {stripHtml(bullet.content)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function createPdfStyles(resume: Resume) {
  const { styles } = resume;
  const fontFamily = pdfFontFamily(styles.font);
  // @react-pdf treats `lineHeight` as a UNITLESS multiple of the font size
  // (exactly like CSS `line-height: 1.2`). The previous code multiplied the
  // font size into it (e.g. `fontSize.body * spacing.bullet`), producing a
  // ~12-25x line height that pushed every line onto its own page. `spacing.bullet`
  // is already the multiplier we want (clamped 1.0-1.5), so use it directly.
  const bodyLineHeight = styles.spacing.bullet;

  return StyleSheet.create({
    page: {
      backgroundColor: '#ffffff',
      color: styles.colors.body,
      fontFamily,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      paddingTop: styles.margins.top * IN,
      paddingRight: styles.margins.right * IN,
      paddingBottom: styles.margins.bottom * IN,
      paddingLeft: styles.margins.left * IN,
    },
    pageBreak: {
      height: 0,
    },
    headerCenter: {
      textAlign: 'center',
    },
    headerLeft: {
      textAlign: 'left',
    },
    name: {
      color: styles.colors.name,
      fontFamily,
      fontSize: styles.fontSize.name,
      fontWeight: 700,
      lineHeight: 1.05,
    },
    contactLine: {
      color: styles.colors.body,
      fontSize: styles.fontSize.contactLine,
      lineHeight: 1.2,
      marginTop: 4,
    },
    link: {
      color: styles.colors.accent,
      textDecoration: 'none',
    },
    section: {
      breakInside: 'avoid',
    },
    sectionTitle: {
      fontFamily,
      fontSize: styles.fontSize.sectionHeader,
      fontWeight: 700,
      lineHeight: 1.1,
    },
    paragraph: {
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
    },
    skillLine: {
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
    },
    entry: {
      breakInside: 'avoid',
    },
    entryHeaderRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    entryHeaderLeft: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      paddingRight: 12,
    },
    entryTitle: {
      fontSize: styles.fontSize.entryTitle,
      lineHeight: 1.15,
    },
    date: {
      color: styles.colors.body,
      flexShrink: 0,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      maxWidth: 126,
      textAlign: 'right',
    },
    bodyText: {
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
    },
    bold: {
      fontWeight: 700,
    },
    italic: {
      fontStyle: 'italic',
    },
    customFields: {
      marginTop: 1,
    },
    bullets: {
      marginTop: 1,
    },
    bulletRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
    },
    bulletGlyph: {
      flexShrink: 0,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      width: 14,
    },
    bulletText: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
    },
    bulletTextNoGlyph: {
      flexGrow: 1,
      flexShrink: 1,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      paddingLeft: 0,
    },
    mccombsEducationGrid: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    mccombsSchool: {
      flexShrink: 0,
      width: 126,
    },
    mccombsDegree: {
      flexGrow: 1,
      flexShrink: 1,
      minWidth: 0,
      paddingHorizontal: 6,
      width: 0,
    },
    mccombsDate: {
      flexShrink: 0,
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      textAlign: 'right',
      width: 80,
    },
    fullWidthDetail: {
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
      marginTop: 2,
      width: '100%',
    },
    noWrapLine: {
      fontSize: styles.fontSize.body,
      lineHeight: bodyLineHeight,
    },
  });
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

function separatorText(separator: Resume['header']['separatorStyle']): string {
  if (separator === 'dot') return '.';
  if (separator === 'dash') return '-';
  return '|';
}

function isLinkable(type: ContactField['type']): boolean {
  return type === 'email' || type === 'linkedin' || type === 'github' || type === 'website' || type === 'twitter';
}

function hrefFor(field: ContactField): string {
  if (field.type === 'email') return `mailto:${field.value}`;
  return hrefFromRaw(field.value);
}

function hrefFromRaw(value: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function pdfFontFamily(font: Resume['styles']['font']): string {
  switch (font) {
    case 'EB Garamond':
    case 'Georgia':
    case 'Times New Roman':
    case 'Latin Modern Roman':
      return 'Times-Roman';
    case 'Lato':
    case 'Inter':
    case 'Carlito':
    case 'Nimbus Sans':
      return 'Helvetica';
  }
}
