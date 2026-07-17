import { memo, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bullet, ContactField, Entry, Resume, RuleStyle, Section } from '@/types';
import { formatDateRange } from '@/utils/dateFormat';
import { displayContactValue } from '@/utils/contactIcon';
import { resumeForPagedExport } from '@/utils/resumeLayout';
import {
  headerAlignFor,
  splitSectionsForLayout,
  templateFeatures,
} from '@/utils/templateFeatures';
import { useStore } from '@/store';

const PT_TO_PX = 96 / 72;

function pt(n: number): string {
  return `${n * PT_TO_PX}px`;
}

function inch(n: number): string {
  return `${n * 96}px`;
}

const PAGE_HEIGHT_IN: Record<'letter' | 'a4', number> = { letter: 11, a4: 11.69 };

export function PreviewRenderer({
  resume,
  showPageBreaks = true,
  interactive = true,
}: {
  resume: Resume;
  showPageBreaks?: boolean;
  interactive?: boolean;
}) {
  const displayResume = resumeForPagedExport(resume);
  const { styles, header, sections } = displayResume;
  const visibleSections = sections
    .filter((section) => section.visible && sectionHasContent(section))
    .sort((a, b) => a.order - b.order);

  // Compute approximate page-break positions so the preview shows a visible
  // page break line where content overflows the printable area.
  const usableHeightPx =
    (PAGE_HEIGHT_IN[styles.paperSize] - styles.margins.top - styles.margins.bottom) * 96;
  const marginTopPx = styles.margins.top * 96;
  const layout = splitSectionsForLayout(displayResume, visibleSections);
  const features = templateFeatures(displayResume.template);
  const contentRef = useRef<HTMLDivElement>(null);
  const [breakPositions, setBreakPositions] = useState<number[]>([]);

  useLayoutEffect(() => {
    if (!showPageBreaks || !contentRef.current) {
      setBreakPositions([]);
      return;
    }
    const root = contentRef.current;
    const blocks = root.querySelectorAll<HTMLElement>('[data-page-block]');
    const positions: number[] = [];
    let pageBottom = marginTopPx + usableHeightPx;

    blocks.forEach((block) => {
      if (block.dataset.pageBreak === 'force') {
        const top = block.offsetTop;
        if (top > pageBottom - 4) {
          positions.push(pageBottom);
          pageBottom = top + usableHeightPx;
        } else {
          positions.push(pageBottom);
          pageBottom += usableHeightPx;
        }
        return;
      }

      const top = block.offsetTop;
      const bottom = top + block.offsetHeight;
      if (bottom > pageBottom && top > marginTopPx + 8) {
        positions.push(pageBottom);
        pageBottom = top + usableHeightPx;
      }
    });

    setBreakPositions(positions);
  }, [displayResume, showPageBreaks, usableHeightPx, marginTopPx, visibleSections.length]);

  const renderSection = (section: Section) => (
    <SectionBlock
      key={section.id}
      section={section}
      resume={displayResume}
      interactive={interactive}
    />
  );

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
      {showPageBreaks && (
        <PageBreakOverlay
          breakPositions={breakPositions}
          resume={displayResume}
          repeatHeader={features.repeatHeaderOnPages}
        />
      )}

      <div ref={contentRef}>
        <div data-page-block>
          <Header header={header} resume={displayResume} compact={false} />
        </div>

        {visibleSections.length === 0 ? (
          <EmptyResumeHint />
        ) : layout.single.length > 0 ? (
          layout.single.map(renderSection)
        ) : (
          <>
            {layout.fullWidth.map(renderSection)}
            {(layout.left.length > 0 || layout.right.length > 0) && (
              <div
                data-page-block
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 30%) minmax(0, 1fr)',
                  gap: pt(12),
                  alignItems: 'start',
                }}
              >
                <div>{layout.left.map(renderSection)}</div>
                <div>{layout.right.map(renderSection)}</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Renders horizontal dashed lines at measured page-break positions.
function PageBreakOverlay({
  breakPositions,
  resume,
  repeatHeader,
}: {
  breakPositions: number[];
  resume: Resume;
  repeatHeader: boolean;
}) {
  if (breakPositions.length === 0) return null;
  const totalPages = breakPositions.length + 1;
  const showPageNumbers = Boolean(resume.styles.pageNumbers) && totalPages > 1;

  return (
    <>
      {breakPositions.map((top, index) => (
        <div key={`${top}-${index}`} aria-hidden style={{ pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              top,
              left: 0,
              right: 0,
              borderTop: '1px dashed rgba(0,0,0,0.25)',
              zIndex: 2,
            }}
          />
          {showPageNumbers && (
            <div
              style={{
                position: 'absolute',
                top: top - 14,
                right: 8,
                zIndex: 2,
                fontSize: 9,
                color: 'rgba(0,0,0,0.45)',
                fontFamily: 'system-ui, sans-serif',
              }}
            >
              Page {index + 1} of {totalPages}
            </div>
          )}
          {repeatHeader && (
            <div
              style={{
                position: 'absolute',
                top: top + 6,
                left: 0,
                right: 0,
                zIndex: 2,
                opacity: 0.55,
              }}
            >
              <Header header={resume.header} resume={resume} compact />
            </div>
          )}
        </div>
      ))}
    </>
  );
}

function Header({
  header,
  resume,
  compact = false,
}: {
  header: Resume['header'];
  resume: Resume;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const { styles } = resume;
  const visibleFields = header.contactFields
    .filter((field) => field.visible && (compact ? field.value.trim() : true))
    .sort((a, b) => a.order - b.order);

  return (
    <header className={headerAlignFor(resume) === 'left' ? 'text-left' : 'text-center'}>
      <div
        style={{
          fontSize: pt(compact ? styles.fontSize.name * 0.72 : styles.fontSize.name),
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
            fontSize: pt(compact ? styles.fontSize.contactLine * 0.85 : styles.fontSize.contactLine),
            marginTop: pt(compact ? 2 : 4),
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
        const trimmed = field.value.trim();
        const displayText = trimmed ? displayContactValue(field.type, trimmed) : '';
        const display = displayText || (
          <span className="italic opacity-40">{contactPlaceholder(field.type, t)}</span>
        );
        const linked = trimmed && isLinkable(field.type) ? (
          <a href={hrefFor(field)} style={{ color: accent, textDecoration: 'none' }}>
            {displayText}
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

const SectionBlock = memo(function SectionBlockInner({
  section,
  resume,
  interactive,
}: {
  section: Section;
  resume: Resume;
  interactive: boolean;
}) {
  // Manual page-break section: renders a visible dashed divider in the on-
  // screen preview and triggers a hard page break in print / PDF export.
  if (section.type === 'page-break') {
    return (
      <div
        aria-hidden
        data-page-block
        data-page-break="force"
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
      data-page-block
      style={{
        marginTop: pt(o.spaceAbove ?? styles.spacing.section),
        color: o.bodyColor ?? undefined,
      }}
    >
      {!o.hideHeader && (
        <SectionHeader
          title={section.title}
          resume={resume}
          overrides={o}
          sectionId={section.id}
          interactive={interactive}
        />
      )}
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
  return <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{text}</p>;
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
  // layout: institution | degree-or-program details | date. An individual
  // Education entry can also be flagged as a study-abroad row via
  // customFields.kind = 'study-abroad' so users don't need a whole separate
  // section just for one row.
  const isStudyAbroadKind =
    section.type === 'study-abroad' || entry.customFields?.kind === 'study-abroad';
  if (
    resume.template === 'mccombs' &&
    (section.type === 'education' || section.type === 'study-abroad')
  ) {
    return (
      <div style={{ marginTop: first ? 0 : pt(entrySpacing) }}>
        <McCombsEducationRow
          entry={entry}
          section={section}
          resume={resume}
          date={date}
          studyAbroadKind={isStudyAbroadKind}
        />
      </div>
    );
  }

  // McCombs experience/leadership/research render the entity bold and the
  // role italic on one line. Projects also fold to one line so the tech-stack
  // sits next to the project name instead of taking its own row.
  const swapBold =
    resume.template === 'mccombs' && MCCOMBS_SWAP_BOLD.includes(section.type);
  const inlineStudyAbroad = resume.template !== 'mccombs' && isStudyAbroadKind;
  const inlineProject = section.type === 'projects';

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
          ) : inlineStudyAbroad ? (
            <StudyAbroadInlineHeader entry={entry} resume={resume} />
          ) : inlineProject ? (
            <ProjectInlineHeader entry={entry} resume={resume} />
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

      {(sectionHasBullets(section) || isStudyAbroadKind) && (
        <BulletList bullets={entry.bullets ?? []} resume={resume} />
      )}
    </div>
  );
}

function McCombsEducationRow({
  entry,
  resume,
  date,
  studyAbroadKind,
}: {
  entry: Entry;
  section: Section;
  resume: Resume;
  date: string;
  studyAbroadKind: boolean;
}) {
  const { styles } = resume;
  const cf = entry.customFields ?? {};
  const lines: string[] = [];
  const coursework = cf.coursework?.trim();
  if (studyAbroadKind) {
    // Compact one-line layout: "Program in City, Country | GPA: 3.85 | Spanish | Courses: ...".
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
    // Comma joiner reads more naturally than " & " when the major itself
    // already contains the word "and", e.g. "Electrical and Computer
    // Engineering Honors, Canfield Business Honors".
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

  return (
    <div
      style={{
        display: 'grid',
        // Two columns only: institution on the left, everything else on the
        // right. The date is NOT its own column — it floats to the top-right of
        // the content area so the degree lines can flow across the full width
        // (including the space beneath the date). A rigid date column used to
        // strand trailing words like "Honors" on their own line even though
        // there was empty room to the right.
        gridTemplateColumns: '1.75in minmax(0, 1fr)',
        columnGap: pt(6),
        alignItems: 'baseline',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: pt(styles.fontSize.entryTitle) }}>
        {entry.subtitle?.trim() || ''}
      </div>
      <div style={{ minWidth: 0 }}>
        {date && (
          <span style={{ float: 'right', marginLeft: pt(6), whiteSpace: 'nowrap' }}>{date}</span>
        )}
        {lines.map((line, i) => (
          <div key={i} style={studyAbroadKind ? { whiteSpace: 'nowrap' } : undefined}>
            {line}
          </div>
        ))}
        {!studyAbroadKind && coursework && (
          <div style={{ marginTop: pt(2) }}>
            <span style={{ fontWeight: 700 }}>Coursework:</span> {coursework}
          </div>
        )}
      </div>
    </div>
  );
}

function StudyAbroadInlineHeader({
  entry,
  resume,
}: {
  entry: Entry;
  resume: Resume;
}) {
  const line = studyAbroadLine(entry);
  const host = entry.subtitle?.trim();
  return (
    <div style={{ fontSize: pt(resume.styles.fontSize.entryTitle) }}>
      {line && (
        <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
          {line}
        </div>
      )}
      {host && <div>{host}</div>}
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
      {company && role && <span>, </span>}
      {role && <span style={{ fontStyle: 'italic' }}>{role}</span>}
      {(company || role) && location && <span>, {location}</span>}
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

function ProjectInlineHeader({
  entry,
  resume,
}: {
  entry: Entry;
  resume: Resume;
}) {
  // Project name bold + tech stack italic on the SAME line, so each project
  // costs one row instead of two. URLs (project url / github) drop to their
  // own line underneath, same as before.
  const title = entry.title?.trim();
  const techStack = entry.subtitle?.trim();
  return (
    <div style={{ fontSize: pt(resume.styles.fontSize.entryTitle) }}>
      <span>
        {title && (
          <span style={{ fontWeight: 700 }}>
            {entry.url ? (
              <a
                href={hrefFromRaw(entry.url)}
                style={{ color: resume.styles.colors.accent, textDecoration: 'none' }}
              >
                {title}
              </a>
            ) : (
              title
            )}
          </span>
        )}
        {title && techStack && <span> – </span>}
        {techStack && <span style={{ fontStyle: 'italic' }}>{techStack}</span>}
      </span>
      {entry.customFields?.githubUrl && (
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

const BULLET_GLYPH: Record<string, string> = {
  disc: '•',
  circle: '◦',
  square: '▪',
  dash: '–',
  arrow: '›',
  none: '',
};

function BulletList({ bullets, resume }: { bullets: Bullet[]; resume: Resume }) {
  const visible = bullets
    .filter((bullet) => bullet.visible && bullet.content.trim())
    .sort((a, b) => a.order - b.order);

  if (visible.length === 0) return null;

  const glyph = BULLET_GLYPH[resume.styles.bulletStyle ?? 'disc'] ?? '•';
  const indent = glyph ? pt(14) : 0;

  return (
    <ul
      style={{
        margin: `${pt(1)} 0 0 0`,
        padding: 0,
        listStyle: 'none',
        lineHeight: resume.styles.spacing.bullet,
      }}
    >
      {visible.map((bullet) => (
        <li
          key={bullet.id}
          data-preview-bullet={bullet.id}
          title="Alt-click to hide this bullet"
          style={{
            cursor: 'default',
            display: 'grid',
            gridTemplateColumns: glyph ? `${indent} 1fr` : '1fr',
            alignItems: 'baseline',
          }}
        >
          {glyph && <span aria-hidden style={{ userSelect: 'none' }}>{glyph}</span>}
          <span>{plainTextFromBullet(bullet.content)}</span>
        </li>
      ))}
    </ul>
  );
}

function SectionHeader({
  title,
  resume,
  overrides,
  sectionId,
  interactive,
}: {
  title: string;
  resume: Resume;
  overrides: NonNullable<Section['styleOverrides']>;
  sectionId?: string;
  interactive: boolean;
}) {
  const { styles } = resume;
  const uppercase = overrides.uppercaseTitle ?? true;
  const focusSection = useStore((s) => s.focusSection);
  // Clicking a section title in the preview jumps the editor panel to the
  // matching section's accordion and opens it. The rendered output looks the
  // same — the click target lives behind a transparent button so it doesn't
  // change the resume's visual styling at all.
  const onJump = interactive && sectionId ? () => focusSection(sectionId) : undefined;
  return (
    <div>
      {onJump ? (
        <button
          type="button"
          onClick={onJump}
          title="Click to edit this section"
          className="-mx-1 block w-full rounded-sm px-1 text-left transition-colors hover:bg-paper-tint"
          style={{
            fontSize: pt(styles.fontSize.sectionHeader),
            fontWeight: 700,
            color: overrides.sectionHeaderColor ?? styles.colors.sectionHeader,
            textTransform: uppercase ? 'uppercase' : 'none',
            letterSpacing: 0,
            cursor: 'pointer',
          }}
        >
          {title}
        </button>
      ) : (
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
      )}
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

