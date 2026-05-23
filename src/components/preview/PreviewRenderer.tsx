import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bullet, ContactField, Entry, Resume, RuleStyle, Section } from '@/types';
import { formatDateRange } from '@/utils/dateFormat';

const PT_TO_PX = 96 / 72;

function pt(n: number): string {
  return `${n * PT_TO_PX}px`;
}

function inch(n: number): string {
  return `${n * 96}px`;
}

const PAGE_HEIGHT_IN: Record<'letter' | 'a4', number> = { letter: 11, a4: 11.69 };

export function PreviewRenderer({ resume }: { resume: Resume }) {
  const displayResume = resume.styles.onePageMode ? compactResume(resume) : resume;
  const { styles, header, sections } = displayResume;
  const visibleSections = sections
    .filter((section) => section.visible && sectionHasContent(section))
    .sort((a, b) => a.order - b.order);

  // Compute approximate page-break positions so the preview shows a visible
  // page break line where content overflows the printable area.
  const usableHeightPx =
    (PAGE_HEIGHT_IN[styles.paperSize] - styles.margins.top - styles.margins.bottom) * 96;

  return (
    <div
      style={{
        position: 'relative',
        fontFamily: cssFontStack(styles.font),
        color: styles.colors.body,
        paddingTop: inch(styles.margins.top),
        paddingBottom: inch(styles.margins.bottom),
        paddingLeft: inch(styles.margins.left),
        paddingRight: inch(styles.margins.right),
        fontSize: pt(styles.fontSize.body),
        lineHeight: styles.spacing.bullet,
      }}
    >
      <PageBreakOverlay usableHeightPx={usableHeightPx} marginTopPx={styles.margins.top * 96} />

      <Header header={header} resume={displayResume} />

      {visibleSections.length === 0 ? (
        <EmptyResumeHint />
      ) : (
        visibleSections.map((section) => (
          <SectionBlock key={section.id} section={section} resume={displayResume} />
        ))
      )}
    </div>
  );
}

// Renders horizontal dashed lines at predicted page-break positions so users
// know where the printed PDF will paginate.
function PageBreakOverlay({
  usableHeightPx,
  marginTopPx,
}: {
  usableHeightPx: number;
  marginTopPx: number;
}) {
  if (usableHeightPx <= 0) return null;
  // Render up to 4 break indicators (rare for resumes to exceed 4 pages).
  const lines = [1, 2, 3, 4].map((n) => marginTopPx + usableHeightPx * n);
  return (
    <>
      {lines.map((top) => (
        <div
          key={top}
          aria-hidden
          style={{
            position: 'absolute',
            top,
            left: 0,
            right: 0,
            borderTop: '1px dashed rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      ))}
    </>
  );
}

function Header({ header, resume }: { header: Resume['header']; resume: Resume }) {
  const { t } = useTranslation();
  const { styles } = resume;
  const visibleFields = header.contactFields
    .filter((field) => field.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <header className={resume.template === 'cs-swe' ? 'text-left' : 'text-center'}>
      <div
        style={{
          fontSize: pt(styles.fontSize.name),
          fontWeight: 700,
          color: styles.colors.name,
          letterSpacing: 0,
        }}
      >
        {header.name || <span className="italic opacity-40">{t('preview.yourName')}</span>}
      </div>

      {visibleFields.length > 0 && (
        <div
          style={{
            fontSize: pt(styles.fontSize.contactLine),
            marginTop: pt(4),
            color: styles.colors.body,
          }}
        >
          <ContactLine
            fields={visibleFields}
            separator={header.separatorStyle}
            accent={styles.colors.accent}
          />
        </div>
      )}
    </header>
  );
}

function ContactLine({
  fields,
  separator,
  accent,
}: {
  fields: ContactField[];
  separator: Resume['header']['separatorStyle'];
  accent: string;
}) {
  const { t } = useTranslation();
  const sep = ` ${separatorText(separator)} `;
  return (
    <span>
      {fields.map((field, index) => {
        const display = field.value || (
          <span className="italic opacity-40">{contactPlaceholder(field.type, t)}</span>
        );
        const linked = field.value && isLinkable(field.type) ? (
          <a href={hrefFor(field)} style={{ color: accent, textDecoration: 'none' }}>
            {field.value}
          </a>
        ) : (
          display
        );
        return (
          <span key={field.id}>
            {index > 0 && <span>{sep}</span>}
            {linked}
          </span>
        );
      })}
    </span>
  );
}

function contactPlaceholder(fieldType: ContactField['type'], t: ReturnType<typeof useTranslation>['t']): string {
  switch (fieldType) {
    case 'email':
      return t('editor.contactPlaceholderEmail');
    case 'phone':
      return t('editor.contactPlaceholderPhone');
    case 'linkedin':
      return t('editor.contactPlaceholderLinkedIn');
    case 'github':
      return t('editor.contactPlaceholderGitHub');
    case 'website':
      return t('editor.contactPlaceholderWebsite');
    case 'location':
      return t('editor.contactPlaceholderLocation');
    case 'twitter':
      return t('editor.contactPlaceholderTwitter');
    case 'custom':
      return t('editor.contactPlaceholderCustom');
  }
}

const SectionBlock = memo(function SectionBlockInner({ section, resume }: { section: Section; resume: Resume }) {
  // Manual page-break section: renders a visible dashed divider in the on-
  // screen preview and triggers a hard page break in print / PDF export.
  if (section.type === 'page-break') {
    return (
      <div
        aria-hidden
        className="page-break"
        style={{
          breakAfter: 'page',
          pageBreakAfter: 'always',
          marginTop: 24,
          marginBottom: 24,
          borderTop: '1px dashed rgba(0,0,0,0.4)',
          height: 0,
        }}
      />
    );
  }
  const { styles } = resume;
  const o = section.styleOverrides ?? {};
  return (
    <section
      style={{
        marginTop: pt(o.spaceAbove ?? styles.spacing.section),
        color: o.bodyColor ?? undefined,
      }}
    >
      <SectionHeader title={section.title} resume={resume} overrides={o} />
      <div>{renderSectionContent(section, resume)}</div>
    </section>
  );
});

function renderSectionContent(section: Section, resume: Resume) {
  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return <SkillsSection section={section} resume={resume} />;
  }
  if (section.type === 'summary' || section.layout === 'text-block') {
    return <TextSection section={section} />;
  }
  if (section.layout === 'bullet-list') {
    return <BulletList bullets={section.entries[0]?.bullets ?? []} resume={resume} />;
  }

  return section.entries
    .filter(entryHasContent)
    .map((entry, index) => (
      <EntryBlock key={entry.id} entry={entry} section={section} resume={resume} first={index === 0} />
    ));
}

function SkillsSection({ section, resume }: { section: Section; resume: Resume }) {
  return (
    <div>
      {section.entries.filter(entryHasContent).map((entry, index) => (
        <div
          key={entry.id}
          style={{ marginTop: index === 0 ? 0 : pt(Math.max(1, resume.styles.spacing.entry / 2)) }}
        >
          <span style={{ fontWeight: 700 }}>{entry.title || 'Skills'}: </span>
          <span>{entry.subtitle}</span>
        </div>
      ))}
    </div>
  );
}

function TextSection({ section }: { section: Section }) {
  const text = section.entries[0]?.title;
  if (!text) return null;
  return <p style={{ margin: 0 }}>{text}</p>;
}

const MCCOMBS_SWAP_BOLD: Section['type'][] = ['experience', 'leadership', 'research'];

function EntryBlock({
  entry,
  section,
  resume,
  first,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
  first: boolean;
}) {
  const { styles } = resume;
  const date = formatDateRange(
    entry.startDate,
    section.type === 'publications' ? entry.endDate || entry.customFields?.year : entry.endDate,
    entry.current,
    styles.dateFormat,
  );

  const entrySpacing = section.styleOverrides?.entrySpacing ?? styles.spacing.entry;

  // McCombs education (and the parallel Study Abroad section) use a 3-column
  // layout: institution | degree-or-program details | date.
  if (
    resume.template === 'mccombs' &&
    (section.type === 'education' || section.type === 'study-abroad')
  ) {
    return (
      <div style={{ marginTop: first ? 0 : pt(entrySpacing) }}>
        <McCombsEducationRow entry={entry} section={section} resume={resume} date={date} />
      </div>
    );
  }

  // McCombs experience/leadership/research render the entity bold and the role italic on one line.
  const swapBold =
    resume.template === 'mccombs' && MCCOMBS_SWAP_BOLD.includes(section.type);

  return (
    <div style={{ marginTop: first ? 0 : pt(entrySpacing) }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) max-content',
          columnGap: pt(12),
          alignItems: 'baseline',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {swapBold ? (
            <McCombsInlineHeader entry={entry} section={section} resume={resume} />
          ) : (
            <EntryLeft entry={entry} section={section} resume={resume} />
          )}
        </div>
        {date && (
          <div
            style={{
              whiteSpace: 'nowrap',
              textAlign: 'right',
              color: styles.colors.body,
            }}
          >
            {date}
          </div>
        )}
      </div>

      {sectionHasBullets(section) && (
        <BulletList bullets={entry.bullets ?? []} resume={resume} />
      )}
    </div>
  );
}

function McCombsEducationRow({
  entry,
  section,
  resume,
  date,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
  date: string;
}) {
  const { styles } = resume;
  const cf = entry.customFields ?? {};
  const lines: string[] = [];
  if (section.type === 'study-abroad') {
    const program = entry.title?.trim();
    const loc = entry.location?.trim();
    const header = program && loc ? `${program} in ${loc}` : program || loc || '';
    if (header) lines.push(header);
    if (cf.language?.trim()) lines.push(`Language of instruction: ${cf.language.trim()}`);
    if (cf.gpa?.trim()) lines.push(`Overall GPA: ${cf.gpa.trim()}`);
  } else {
    const majors = [cf.major, cf.secondMajor].map((m) => m?.trim()).filter(Boolean);
    const degreeLine = [entry.title?.trim(), majors.join(' & ')].filter(Boolean).join(', ');
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(140px, 1.1fr) minmax(0, 2.2fr) max-content',
        columnGap: pt(10),
        alignItems: 'baseline',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: pt(styles.fontSize.entryTitle) }}>
        {entry.subtitle?.trim() || ''}
      </div>
      <div style={{ minWidth: 0 }}>
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
        {cf.coursework?.trim() && (
          <div style={{ marginTop: pt(2) }}>
            <span style={{ fontWeight: 700 }}>
              {section.type === 'study-abroad' ? 'Courses Taken:' : 'Relevant Coursework:'}
            </span>{' '}
            {cf.coursework.trim()}
          </div>
        )}
      </div>
      {date && (
        <div style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{date}</div>
      )}
    </div>
  );
}

function McCombsInlineHeader({
  entry,
  section,
  resume,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
}) {
  const company = entry.subtitle?.trim();
  const role = entry.title?.trim();
  const location = entry.location?.trim();
  return (
    <div
      style={{
        fontSize: pt(resume.styles.fontSize.entryTitle),
      }}
    >
      {company && <span style={{ fontWeight: 700 }}>{company}</span>}
      {company && role && <span> - </span>}
      {role && <span style={{ fontStyle: 'italic' }}>{role}</span>}
      {(company || role) && location && <span>; {location}</span>}
      {!company && !role && location && <span>{location}</span>}
      {section.type === 'projects' && entry.customFields?.githubUrl && (
        <div>
          <a
            href={hrefFromRaw(entry.customFields.githubUrl)}
            style={{ color: resume.styles.colors.accent, textDecoration: 'none' }}
          >
            {entry.customFields.githubUrl}
          </a>
        </div>
      )}
    </div>
  );
}

function EntryLeft({
  entry,
  section,
  resume,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
}) {
  const title = titleForPreview(entry, section);
  const subtitle = subtitleForPreview(entry, section);
  const tertiary = tertiaryForPreview(entry, section);

  return (
    <div>
      {title && (
        <div
          style={{
            fontSize: pt(resume.styles.fontSize.entryTitle),
            fontWeight: 700,
          }}
        >
          {entry.url ? (
            <a href={hrefFromRaw(entry.url)} style={{ color: resume.styles.colors.accent, textDecoration: 'none' }}>
              {title}
            </a>
          ) : (
            title
          )}
        </div>
      )}
      {subtitle && (
        <div style={{ fontStyle: section.type === 'projects' ? 'italic' : 'normal' }}>
          {subtitle}
        </div>
      )}
      {tertiary && <div>{tertiary}</div>}
      {entry.customFields?.githubUrl && section.type === 'projects' && (
        <div>
          <a
            href={hrefFromRaw(entry.customFields.githubUrl)}
            style={{ color: resume.styles.colors.accent, textDecoration: 'none' }}
          >
            {entry.customFields.githubUrl}
          </a>
        </div>
      )}
      {entry.url && section.type !== 'projects' && section.type !== 'certifications' && (
        <div>
          <a href={hrefFromRaw(entry.url)} style={{ color: resume.styles.colors.accent, textDecoration: 'none' }}>
            {entry.url}
          </a>
        </div>
      )}
    </div>
  );
}

function BulletList({ bullets, resume }: { bullets: Bullet[]; resume: Resume }) {
  const visible = bullets
    .filter((bullet) => bullet.visible && bullet.content.trim())
    .sort((a, b) => a.order - b.order);

  if (visible.length === 0) return null;

  return (
    <ul
      style={{
        margin: `${pt(1)} 0 0 ${pt(14)}`,
        padding: 0,
        lineHeight: resume.styles.spacing.bullet,
      }}
    >
      {visible.map((bullet) => (
        <li
          key={bullet.id}
          data-preview-bullet={bullet.id}
          title="Alt-click to hide this bullet"
          style={{ cursor: 'default' }}
        >
          {plainTextFromBullet(bullet.content)}
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({
  title,
  resume,
  overrides,
}: {
  title: string;
  resume: Resume;
  overrides: NonNullable<Section['styleOverrides']>;
}) {
  const { styles } = resume;
  const uppercase = overrides.uppercaseTitle ?? true;
  return (
    <div>
      <div
        style={{
          fontSize: pt(styles.fontSize.sectionHeader),
          fontWeight: 700,
          color: overrides.sectionHeaderColor ?? styles.colors.sectionHeader,
          textTransform: uppercase ? 'uppercase' : 'none',
          letterSpacing: 0,
        }}
      >
        {title}
      </div>
      {!overrides.hideRule && (
        <SectionRule rule={styles.ruleStyle} color={styles.colors.sectionRule} />
      )}
    </div>
  );
}

function SectionRule({ rule, color }: { rule: RuleStyle; color: string }) {
  if (rule.variant === 'none') return null;

  const base = {
    marginTop: pt(1),
    marginBottom: pt(4),
    borderColor: color,
    width: rule.variant === 'partial' ? '1in' : '100%',
  };

  if (rule.variant === 'double') {
    return (
      <div
        style={{
          ...base,
          borderTopWidth: rule.weight,
          borderTopStyle: 'double',
          borderBottomStyle: 'double',
          borderBottomWidth: rule.weight,
          height: rule.weight * 3,
        }}
      />
    );
  }

  return (
    <div
      style={{
        ...base,
        borderTopWidth: rule.variant === 'thick' ? Math.max(rule.weight, 1.5) : rule.weight,
        borderTopStyle: 'solid',
      }}
    />
  );
}

function EmptyResumeHint() {
  const { t } = useTranslation();
  return (
    <div className="mt-16 text-center text-ink-subtle">
      <p className="text-sm italic">{t('preview.addFromLeft')}</p>
    </div>
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
    return [
      entry.location,
      entry.customFields?.gpa ? `GPA: ${entry.customFields.gpa}` : '',
      entry.customFields?.language ? `Language: ${entry.customFields.language}` : '',
      entry.customFields?.coursework ? `Courses: ${entry.customFields.coursework}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
  }
  return entry.location ?? '';
}

function sectionHasContent(section: Section): boolean {
  if (section.type === 'page-break') return true;
  if (section.type === 'summary' || section.layout === 'text-block') {
    return Boolean(section.entries[0]?.title?.trim());
  }
  if (section.layout === 'bullet-list') {
    return Boolean(section.entries[0]?.bullets?.some((bullet) => bullet.visible && bullet.content.trim()));
  }
  return section.entries.some(entryHasContent);
}

function entryHasContent(entry: Entry): boolean {
  // Entries flagged visible:false live in the library and never render in the
  // resume preview. They reappear if the user toggles visibility back on.
  if (entry.visible === false) return false;
  return Boolean(
    entry.title?.trim() ||
      entry.subtitle?.trim() ||
      entry.location?.trim() ||
      entry.startDate?.trim() ||
      entry.endDate?.trim() ||
      entry.url?.trim() ||
      entry.bullets?.some((bullet) => bullet.visible && bullet.content.trim()) ||
      Object.values(entry.customFields ?? {}).some((value) => value.trim()),
  );
}

function sectionHasBullets(section: Section): boolean {
  return (
    section.type === 'experience' ||
    section.type === 'projects' ||
    section.type === 'leadership' ||
    section.type === 'research' ||
    (section.type === 'custom' && section.layout === 'entry-based')
  );
}

function plainTextFromBullet(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
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

function cssFontStack(font: Resume['styles']['font']): string {
  switch (font) {
    case 'EB Garamond':
      return '"EB Garamond", Garamond, Georgia, serif';
    case 'Georgia':
      return 'Georgia, "Times New Roman", serif';
    case 'Times New Roman':
      return '"Times New Roman", Times, serif';
    case 'Lato':
      return 'Lato, system-ui, sans-serif';
    case 'Inter':
      return 'Inter, system-ui, -apple-system, sans-serif';
    case 'Carlito':
      return 'Carlito, Calibri, sans-serif';
    case 'Nimbus Sans':
      return '"Nimbus Sans", "Helvetica Neue", Helvetica, Arial, sans-serif';
    case 'Latin Modern Roman':
      return '"Latin Modern Roman", "Computer Modern", Georgia, serif';
  }
}

function compactResume(resume: Resume): Resume {
  return {
    ...resume,
    styles: {
      ...resume.styles,
      fontSize: {
        name: resume.styles.fontSize.name * 0.96,
        sectionHeader: resume.styles.fontSize.sectionHeader * 0.95,
        entryTitle: resume.styles.fontSize.entryTitle * 0.95,
        body: resume.styles.fontSize.body * 0.95,
        contactLine: resume.styles.fontSize.contactLine * 0.95,
      },
      spacing: {
        section: Math.max(0, resume.styles.spacing.section * 0.75),
        entry: Math.max(0, resume.styles.spacing.entry * 0.75),
        bullet: Math.max(1, resume.styles.spacing.bullet * 0.96),
      },
    },
  };
}
