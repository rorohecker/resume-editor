import type { Resume } from '@/types';
import { resumeForPagedExport } from './resumeLayout';
import { stripHtml } from './resumeText';

const PAGE_HEIGHT_IN = {
  letter: 11,
  a4: 11.69,
};

const PAGE_WIDTH_IN = {
  letter: 8.5,
  a4: 8.27,
};

export interface PageUsageStats {
  percent: number;
  estimatedPages: number;
}

export function estimatePageUsage(resume: Resume): number {
  return estimatePageStats(resume).percent;
}

export function estimatePageStats(resume: Resume): PageUsageStats {
  const scaled = resume.styles.onePageMode ? resumeForPagedExport(resume) : resume;
  const pageHeight = PAGE_HEIGHT_IN[scaled.styles.paperSize] * 72;
  const verticalMargins = (scaled.styles.margins.top + scaled.styles.margins.bottom) * 72;
  const usable = Math.max(1, pageHeight - verticalMargins);
  const horizontalMargins = (scaled.styles.margins.left + scaled.styles.margins.right) * 72;
  const pageWidth = PAGE_WIDTH_IN[scaled.styles.paperSize] * 72;
  const charsPerLine = Math.max(
    40,
    Math.floor((pageWidth - horizontalMargins) / (scaled.styles.fontSize.body * 0.52)),
  );

  const body = scaled.styles.fontSize.body;
  const line = body * scaled.styles.spacing.bullet;
  let used = scaled.styles.fontSize.name + scaled.styles.fontSize.contactLine + 14;
  let forcedPages = 1;

  for (const section of scaled.sections.filter((item) => item.visible)) {
    if (section.type === 'page-break') {
      forcedPages += 1;
      used = verticalMargins + scaled.styles.fontSize.name * 0.6;
      continue;
    }

    const headerCost =
      section.styleOverrides?.hideHeader
        ? 0
        : scaled.styles.spacing.section + scaled.styles.fontSize.sectionHeader + 6;
    used += headerCost;

    if (section.type === 'skills' || section.layout === 'skills-grid') {
      used += Math.max(1, section.entries.filter((e) => e.visible !== false).length) * line;
      continue;
    }

    if (section.type === 'summary' || section.layout === 'text-block') {
      const text = section.entries[0]?.title ?? '';
      const lines = text.split('\n').reduce(
        (sum, row) => sum + Math.max(1, Math.ceil(row.length / charsPerLine)),
        0,
      );
      used += Math.max(lines, text.trim() ? 1 : 0) * line;
      continue;
    }

    for (const entry of section.entries) {
      if (entry.visible === false) continue;
      used += scaled.styles.fontSize.entryTitle + scaled.styles.spacing.entry;
      if (entry.subtitle?.trim()) used += line;
      if (entry.location?.trim()) used += line * 0.85;
      used += visibleCustomFieldLines(entry) * line * 0.9;
      for (const bullet of entry.bullets ?? []) {
        if (!bullet.visible) continue;
        const plain = stripHtml(bullet.content);
        used += Math.max(1, Math.ceil(plain.length / charsPerLine)) * line;
      }
    }
  }

  const flowPages = Math.max(1, Math.ceil(used / usable));
  const estimatedPages = Math.max(forcedPages, flowPages);
  const percent = Math.round((used / usable) * 100);

  return { percent, estimatedPages };
}

function visibleCustomFieldLines(entry: { customFields?: Record<string, string> }): number {
  if (!entry.customFields) return 0;
  return Object.values(entry.customFields).filter((value) => value.trim()).length;
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
