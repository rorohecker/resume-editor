import type { Resume } from '@/types';

const PAGE_HEIGHT_IN = {
  letter: 11,
  a4: 11.69,
};

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

export function estimatePageUsage(resume: Resume): number {
  const pageHeight = PAGE_HEIGHT_IN[resume.styles.paperSize] * 72;
  const verticalMargins = (resume.styles.margins.top + resume.styles.margins.bottom) * 72;
  const usable = Math.max(1, pageHeight - verticalMargins);
  const body = resume.styles.fontSize.body;
  const line = body * resume.styles.spacing.bullet;
  let used = resume.styles.fontSize.name + resume.styles.fontSize.contactLine + 12;

  for (const section of resume.sections.filter((item) => item.visible)) {
    used += resume.styles.spacing.section + resume.styles.fontSize.sectionHeader + 5;
    if (section.type === 'skills' || section.layout === 'skills-grid') {
      used += Math.max(1, section.entries.length) * line;
      continue;
    }
    if (section.type === 'summary' || section.layout === 'text-block') {
      used += Math.max(1, Math.ceil((section.entries[0]?.title?.length ?? 0) / 95)) * line;
      continue;
    }
    for (const entry of section.entries) {
      used += resume.styles.fontSize.entryTitle + resume.styles.spacing.entry;
      used += (entry.subtitle || entry.location ? line : 0);
      used += (entry.bullets ?? []).filter((bullet) => bullet.visible).length * line;
    }
  }

  return Math.round((used / usable) * 100);
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
