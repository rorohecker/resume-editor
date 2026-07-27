import type { Entry, Resume, Section } from '@/types';
import { resumeForPagedExport } from './resumeLayout';
import { stripHtml } from './resumeText';
import { isTwoColumnLayout, splitSectionsForLayout } from './templateFeatures';

const PT_PER_IN = 72;

const PAGE_HEIGHT_IN = {
  letter: 11,
  a4: 11.69,
};

const PAGE_WIDTH_IN = {
  letter: 8.5,
  a4: 8.27,
};

// Average glyph advance as a fraction of the font size for the resume fonts we
// ship. Used to estimate how many characters fit on one line at a given width.
const AVG_CHAR_WIDTH_EM = 0.5;

// Sidebar template geometry — mirrors createPdfStyles' leftColumn (30% width,
// 12pt gutter) so two-column resumes aren't measured as one tall stack.
const LEFT_COL_FRACTION = 0.3;
const COL_GAP_PT = 12;

export interface PageUsageStats {
  percent: number;
  estimatedPages: number;
}

export function estimatePageUsage(resume: Resume): number {
  return estimatePageStats(resume).percent;
}

export function estimatePageStats(resume: Resume): PageUsageStats {
  const scaled = resume.styles.onePageMode ? resumeForPagedExport(resume) : resume;
  const { styles } = scaled;

  const pageHeight = PAGE_HEIGHT_IN[styles.paperSize] * PT_PER_IN;
  const verticalMargins = (styles.margins.top + styles.margins.bottom) * PT_PER_IN;
  const usable = Math.max(1, pageHeight - verticalMargins);
  const horizontalMargins = (styles.margins.left + styles.margins.right) * PT_PER_IN;
  const contentWidth = Math.max(72, PAGE_WIDTH_IN[styles.paperSize] * PT_PER_IN - horizontalMargins);

  const visible = scaled.sections
    .filter((section) => section.visible && sectionHasContent(section))
    .sort((a, b) => a.order - b.order);

  const header = headerHeight(scaled);

  let used: number;
  let forcedPages: number;

  if (isTwoColumnLayout(scaled)) {
    // Full-width sections (summary, page breaks) stack above the two columns;
    // the columns themselves sit side by side, so the page grows by the TALLER
    // of the two — not their sum.
    const { fullWidth, left, right } = splitSectionsForLayout(scaled, visible);
    const top = measureFlow(fullWidth, scaled, contentWidth, usable, header);
    const leftWidth = Math.max(48, contentWidth * LEFT_COL_FRACTION - COL_GAP_PT);
    const rightWidth = Math.max(72, contentWidth * (1 - LEFT_COL_FRACTION));
    const leftHeight = measureFlow(left, scaled, leftWidth, usable, 0).used;
    const rightHeight = measureFlow(right, scaled, rightWidth, usable, 0).used;
    used = top.used + Math.max(leftHeight, rightHeight);
    forcedPages = top.forcedPages;
  } else {
    const flow = measureFlow(visible, scaled, contentWidth, usable, header);
    used = flow.used;
    forcedPages = flow.forcedPages;
  }

  const flowPages = Math.max(1, Math.ceil(used / usable));
  const estimatedPages = Math.max(forcedPages, flowPages);
  const percent = Math.round((used / usable) * 100);

  return { percent, estimatedPages };
}

/** Accumulate rendered height of a section list, honoring page breaks. */
function measureFlow(
  sections: Section[],
  resume: Resume,
  widthPt: number,
  usable: number,
  initialUsed: number,
): { used: number; forcedPages: number } {
  const body = resume.styles.fontSize.body;
  const cpl = charsPerLine(widthPt, body);
  const bodyLine = body * resume.styles.spacing.bullet;

  let used = initialUsed;
  let forcedPages = 1;

  for (const section of sections) {
    if (section.type === 'page-break') {
      forcedPages += 1;
      // A page break wastes whatever remained on the current page.
      used = Math.ceil(used / usable) * usable;
      continue;
    }
    used += sectionHeight(section, resume, cpl, bodyLine);
  }

  return { used, forcedPages };
}

function headerHeight(resume: Resume): number {
  const { styles } = resume;
  const nameHeight = styles.fontSize.name * 1.05;
  const hasContacts = resume.header.contactFields.some(
    (field) => field.visible && field.value.trim(),
  );
  const contactHeight = hasContacts ? 4 + styles.fontSize.contactLine * 1.2 : 0;
  return nameHeight + contactHeight;
}

function sectionHeight(section: Section, resume: Resume, cpl: number, bodyLine: number): number {
  const { styles } = resume;
  const overrides = section.styleOverrides ?? {};

  let height = overrides.spaceAbove ?? styles.spacing.section;
  if (!overrides.hideHeader) {
    height += styles.fontSize.sectionHeader * 1.1;
    const hasRule = !overrides.hideRule && styles.ruleStyle.variant !== 'none';
    height += hasRule ? 6 : 2;
  }
  height += sectionContentHeight(section, resume, cpl, bodyLine);
  return height;
}

function sectionContentHeight(
  section: Section,
  resume: Resume,
  cpl: number,
  bodyLine: number,
): number {
  if (section.type === 'skills' || section.layout === 'skills-grid') {
    const entries = section.entries.filter((entry) => entry.visible !== false);
    let height = 0;
    entries.forEach((entry, index) => {
      const text = `${entry.title || 'Skills'}: ${entry.subtitle ?? ''}`;
      height += Math.max(1, wrapLines(text, cpl)) * bodyLine + (index > 0 ? 2 : 0);
    });
    return Math.max(bodyLine, height);
  }

  if (section.type === 'summary' || section.layout === 'text-block') {
    const text = section.entries[0]?.title ?? '';
    return Math.max(text.trim() ? 1 : 0, wrapLines(text, cpl)) * bodyLine;
  }

  if (section.layout === 'bullet-list') {
    return bulletsHeight(section.entries[0]?.bullets ?? [], cpl, bodyLine);
  }

  const { styles } = resume;
  let height = 0;
  let firstEntry = true;
  for (const entry of section.entries) {
    if (entry.visible === false) continue;
    height += firstEntry ? 0 : section.styleOverrides?.entrySpacing ?? styles.spacing.entry;
    height += entryHeight(entry, resume, cpl, bodyLine);
    firstEntry = false;
  }
  return height;
}

function entryHeight(entry: Entry, resume: Resume, cpl: number, bodyLine: number): number {
  const { styles } = resume;
  // Title and the right-aligned date share one row.
  let height = styles.fontSize.entryTitle * 1.15;
  if (entry.subtitle?.trim()) height += bodyLine;
  if (entry.location?.trim()) height += bodyLine * 0.9;
  height += visibleCustomFieldCount(entry) * bodyLine * 0.95;
  height += bulletsHeight(entry.bullets ?? [], cpl, bodyLine);
  return height;
}

function bulletsHeight(
  bullets: { content: string; visible?: boolean }[],
  cpl: number,
  bodyLine: number,
): number {
  let height = 0;
  // A glyph + gutter eats ~2 characters of usable width per bullet line.
  const bulletCpl = Math.max(8, cpl - 2);
  for (const bullet of bullets) {
    if (bullet.visible === false) continue;
    const plain = stripHtml(bullet.content);
    if (!plain) continue;
    height += Math.max(1, wrapLines(plain, bulletCpl)) * bodyLine;
  }
  return height;
}

function wrapLines(text: string, cpl: number): number {
  const clean = (text ?? '').trim();
  if (!clean) return 0;
  const perLine = Math.max(1, cpl);
  return clean
    .split('\n')
    .reduce((sum, row) => sum + Math.max(1, Math.ceil(row.trim().length / perLine)), 0);
}

function charsPerLine(widthPt: number, body: number): number {
  return Math.max(8, Math.floor(widthPt / (body * AVG_CHAR_WIDTH_EM)));
}

function visibleCustomFieldCount(entry: Entry): number {
  if (!entry.customFields) return 0;
  return Object.values(entry.customFields).filter((value) => value.trim()).length;
}

function sectionHasContent(section: Section): boolean {
  if (section.type === 'page-break') return true;
  if (section.type === 'summary' || section.layout === 'text-block') {
    return Boolean(section.entries[0]?.title?.trim());
  }
  if (section.layout === 'bullet-list') {
    return Boolean(
      section.entries[0]?.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)),
    );
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

export function contrastRatio(hexA: string, hexB: string): number {
  const a = relativeLuminance(hexToRgb(hexA));
  const b = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isDarkProfessionalColor(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  return (r + g + b) / 3 < 85;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace('#', '').trim();
  const full = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  return [r, g, b]
    .map((channel) => {
      const s = channel / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
