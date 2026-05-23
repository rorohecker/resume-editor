import type {
  ApplicationStatus,
  Bullet,
  ContactField,
  ContactFieldType,
  DateFormat,
  Entry,
  FontFamily,
  JobApplication,
  Resume,
  RuleVariant,
  RuleWeight,
  Section,
  SectionLayout,
  SectionType,
  SeparatorStyle,
  TemplateId,
} from './index';
import { defaultLabelForContactType } from '@/utils/contactIcon';
import { makeId } from '@/utils/id';

const TEMPLATE_IDS: TemplateId[] = ['mccombs', 'natural-sciences', 'cs-swe', 'general', 'blank'];
const SECTION_TYPES: SectionType[] = [
  'experience',
  'education',
  'study-abroad',
  'projects',
  'skills',
  'leadership',
  'research',
  'awards',
  'certifications',
  'publications',
  'summary',
  'custom',
  'page-break',
];
const SECTION_LAYOUTS: SectionLayout[] = ['entry-based', 'bullet-list', 'skills-grid', 'text-block'];
const CONTACT_TYPES: ContactFieldType[] = [
  'email',
  'phone',
  'linkedin',
  'github',
  'website',
  'location',
  'twitter',
  'custom',
];
const SEPARATORS: SeparatorStyle[] = ['|', 'dot', 'dash'];
const FONTS: FontFamily[] = [
  'EB Garamond',
  'Georgia',
  'Times New Roman',
  'Lato',
  'Inter',
  'Carlito',
  'Nimbus Sans',
  'Latin Modern Roman',
];
const DATE_FORMATS: DateFormat[] = ['month-year', 'numeric', 'season-year', 'year-only'];
const RULE_VARIANTS: RuleVariant[] = ['full', 'partial', 'none', 'double', 'thick'];
const RULE_WEIGHTS: RuleWeight[] = [0.5, 1, 1.5];
const APPLICATION_STATUSES: ApplicationStatus[] = [
  'drafting',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
];

export const RESUME_SCHEMA_VERSION = 2;

export function normalizeResume(input: unknown): Resume | null {
  if (!isRecord(input)) return null;
  const now = new Date().toISOString();
  const template = enumValue(input.template, TEMPLATE_IDS, 'general');
  const styles = normalizeStyles(input.styles);
  const header = normalizeHeader(input.header);
  const sections = Array.isArray(input.sections)
    ? input.sections.map((section, order) => normalizeSection(section, order)).filter(Boolean)
    : [];

  return {
    id: stringValue(input.id, makeId()),
    name: stringValue(input.name, header.name || 'Untitled Resume'),
    createdAt: stringValue(input.createdAt, now),
    updatedAt: stringValue(input.updatedAt, now),
    template,
    header,
    sections: sections as Section[],
    styles,
    application: normalizeApplication(input.application),
    schemaVersion: RESUME_SCHEMA_VERSION,
    variantOf: typeof input.variantOf === 'string' ? input.variantOf : undefined,
  };
}

function normalizeApplication(input: unknown): JobApplication | undefined {
  if (!isRecord(input)) return undefined;
  return {
    targetRole: optionalString(input.targetRole),
    companyName: optionalString(input.companyName),
    status: enumValue(input.status, APPLICATION_STATUSES, 'drafting'),
    appliedAt: optionalString(input.appliedAt),
    notes: optionalString(input.notes),
  };
}

export function isResume(input: unknown): input is Resume {
  return normalizeResume(input) !== null;
}

function normalizeHeader(input: unknown): Resume['header'] {
  const header = isRecord(input) ? input : {};
  const contactFields = Array.isArray(header.contactFields)
    ? header.contactFields
        .slice(0, 7)
        .map((field, order) => normalizeContactField(field, order))
        .filter(Boolean)
    : [];
  return {
    name: stringValue(header.name, ''),
    separatorStyle: enumValue(header.separatorStyle, SEPARATORS, '|'),
    contactFields: contactFields as ContactField[],
  };
}

function normalizeContactField(input: unknown, order: number): ContactField | null {
  if (!isRecord(input)) return null;
  const type = enumValue(input.type, CONTACT_TYPES, 'custom');
  return {
    id: stringValue(input.id, makeId()),
    type,
    value: stringValue(input.value, ''),
    label: stringValue(input.label, defaultLabelForContactType(type)),
    visible: booleanValue(input.visible, true),
    order: numberValue(input.order, order),
  };
}

function normalizeSection(input: unknown, order: number): Section | null {
  if (!isRecord(input)) return null;
  const type = enumValue(input.type, SECTION_TYPES, 'custom');
  const layout = enumValue(input.layout, SECTION_LAYOUTS, defaultLayoutForType(type));
  const entries = Array.isArray(input.entries)
    ? input.entries.map(normalizeEntry).filter(Boolean)
    : [];
  return {
    id: stringValue(input.id, makeId()),
    type,
    title: stringValue(input.title, defaultSectionTitle(type)),
    visible: booleanValue(input.visible, true),
    order: numberValue(input.order, order),
    entries: entries as Entry[],
    layout,
    styleOverrides: normalizeStyleOverrides(input.styleOverrides),
  };
}

function normalizeStyleOverrides(input: unknown): Section['styleOverrides'] {
  if (!isRecord(input)) return undefined;
  const result: NonNullable<Section['styleOverrides']> = {};
  if (typeof input.spaceAbove === 'number') result.spaceAbove = clamp(input.spaceAbove, 0, 32);
  if (typeof input.entrySpacing === 'number') result.entrySpacing = clamp(input.entrySpacing, 0, 16);
  if (typeof input.hideRule === 'boolean') result.hideRule = input.hideRule;
  if (typeof input.uppercaseTitle === 'boolean') result.uppercaseTitle = input.uppercaseTitle;
  if (typeof input.bodyColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.bodyColor))
    result.bodyColor = input.bodyColor;
  if (
    typeof input.sectionHeaderColor === 'string' &&
    /^#[0-9a-f]{6}$/i.test(input.sectionHeaderColor)
  )
    result.sectionHeaderColor = input.sectionHeaderColor;
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeEntry(input: unknown): Entry | null {
  if (!isRecord(input)) return null;
  const bullets = Array.isArray(input.bullets)
    ? input.bullets.map((bullet, order) => normalizeBullet(bullet, order)).filter(Boolean)
    : undefined;
  return {
    id: stringValue(input.id, makeId()),
    title: optionalString(input.title),
    subtitle: optionalString(input.subtitle),
    location: optionalString(input.location),
    startDate: optionalString(input.startDate),
    endDate: optionalString(input.endDate),
    current: typeof input.current === 'boolean' ? input.current : undefined,
    bullets: bullets as Bullet[] | undefined,
    url: optionalString(input.url),
    customFields: normalizeCustomFields(input.customFields),
    visible: typeof input.visible === 'boolean' ? input.visible : undefined,
    tags: normalizeTags(input.tags),
  };
}

function normalizeBullet(input: unknown, order: number): Bullet | null {
  if (!isRecord(input)) return null;
  return {
    id: stringValue(input.id, makeId()),
    content: stringValue(input.content, ''),
    visible: booleanValue(input.visible, true),
    order: numberValue(input.order, order),
    tags: normalizeTags(input.tags),
  };
}

function normalizeTags(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const out = input.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) =>
    t.trim().toLowerCase(),
  );
  return out.length > 0 ? Array.from(new Set(out)) : undefined;
}

function normalizeStyles(input: unknown): Resume['styles'] {
  const styles = isRecord(input) ? input : {};
  const fontSize = isRecord(styles.fontSize) ? styles.fontSize : {};
  const colors = isRecord(styles.colors) ? styles.colors : {};
  const margins = isRecord(styles.margins) ? styles.margins : {};
  const spacing = isRecord(styles.spacing) ? styles.spacing : {};
  const ruleStyle = isRecord(styles.ruleStyle) ? styles.ruleStyle : {};

  return {
    font: enumValue(styles.font, FONTS, 'Inter'),
    fontSize: {
      name: clamp(numberValue(fontSize.name, 24), 18, 36),
      sectionHeader: clamp(numberValue(fontSize.sectionHeader, 11), 8, 18),
      entryTitle: clamp(numberValue(fontSize.entryTitle, 11), 8, 18),
      body: clamp(numberValue(fontSize.body, 10.5), 8, 14),
      contactLine: clamp(numberValue(fontSize.contactLine, 10), 7, 14),
    },
    colors: {
      name: hexValue(colors.name, '#000000'),
      sectionHeader: hexValue(colors.sectionHeader, '#000000'),
      sectionRule: hexValue(colors.sectionRule, '#000000'),
      body: hexValue(colors.body, '#000000'),
      accent: hexValue(colors.accent, '#1d4ed8'),
    },
    margins: {
      top: clamp(numberValue(margins.top, 0.75), 0.4, 1.2),
      bottom: clamp(numberValue(margins.bottom, 0.75), 0.4, 1.2),
      left: clamp(numberValue(margins.left, 0.75), 0.4, 1.2),
      right: clamp(numberValue(margins.right, 0.75), 0.4, 1.2),
    },
    spacing: {
      section: clamp(numberValue(spacing.section, 8), 0, 16),
      entry: clamp(numberValue(spacing.entry, 4), 0, 10),
      bullet: clamp(numberValue(spacing.bullet, 1.2), 1, 1.5),
    },
    ruleStyle: {
      variant: enumValue(ruleStyle.variant, RULE_VARIANTS, 'full'),
      weight: enumValue(ruleStyle.weight, RULE_WEIGHTS, 0.5),
    },
    dateFormat: enumValue(styles.dateFormat, DATE_FORMATS, 'month-year'),
    paperSize: enumValue(styles.paperSize, ['letter', 'a4'], 'letter'),
    onePageMode: booleanValue(styles.onePageMode, false),
    pageNumbers: booleanValue(styles.pageNumbers, false),
  };
}

function normalizeCustomFields(input: unknown): Record<string, string> | undefined {
  if (!isRecord(input)) return undefined;
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  ) as Record<string, string>;
}

function defaultLayoutForType(type: SectionType): SectionLayout {
  if (type === 'skills') return 'skills-grid';
  if (type === 'summary') return 'text-block';
  return 'entry-based';
}

function defaultSectionTitle(type: SectionType): string {
  switch (type) {
    case 'page-break':
      return 'Page Break';
    case 'experience':
      return 'Experience';
    case 'education':
      return 'Education';
    case 'study-abroad':
      return 'Study Abroad';
    case 'projects':
      return 'Projects';
    case 'skills':
      return 'Skills';
    case 'leadership':
      return 'Leadership';
    case 'research':
      return 'Research';
    case 'awards':
      return 'Awards & Honors';
    case 'certifications':
      return 'Certifications';
    case 'publications':
      return 'Publications';
    case 'summary':
      return 'Summary';
    case 'custom':
      return 'Custom Section';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function enumValue<T>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function hexValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
