import type {
  ContactFieldType,
  ResumeStyles,
  SectionColumn,
  SectionStyleOverrides,
  SectionType,
  TemplateId,
} from '@/types';

export interface TemplateSectionSeed {
  type: SectionType;
  title: string;
  styleOverrides?: SectionStyleOverrides;
  column?: SectionColumn;
}

export interface TemplateFeatures {
  headerAlign: 'left' | 'center';
  summaryPlacement: 'top' | 'none' | 'optional';
  repeatHeaderOnPages: boolean;
  layout: 'single' | 'two-column';
}

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
  description: string;
  styles: ResumeStyles;
  defaultSections: TemplateSectionSeed[];
  defaultContactFields: ContactFieldType[];
  features: TemplateFeatures;
}

const BLACK = '#000000';
const ACCENT_DEFAULT = '#1d4ed8';

const baseColors = {
  name: BLACK,
  sectionHeader: BLACK,
  sectionRule: BLACK,
  body: BLACK,
  accent: ACCENT_DEFAULT,
};

const baseSpacing = { section: 8, entry: 4, bullet: 1.2 };

const singleCenter: TemplateFeatures = {
  headerAlign: 'center',
  summaryPlacement: 'none',
  repeatHeaderOnPages: false,
  layout: 'single',
};

const singleLeft: TemplateFeatures = {
  headerAlign: 'left',
  summaryPlacement: 'none',
  repeatHeaderOnPages: false,
  layout: 'single',
};

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'mccombs',
    name: 'UT Austin McCombs',
    tagline: 'Business · Per UT McCombs guide',
    description:
      '3-column education (school | degree | date). Company bold, position italic. Matches the McCombs BBA Recruit guide.',
    features: singleCenter,
    styles: {
      font: 'EB Garamond',
      fontSize: { name: 16, sectionHeader: 10.5, entryTitle: 10.5, body: 10, contactLine: 10 },
      colors: baseColors,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      spacing: { section: 6, entry: 3, bullet: 1.15 },
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
    },
    defaultSections: [
      { type: 'education', title: 'Education' },
      { type: 'study-abroad', title: 'Study Abroad' },
      { type: 'experience', title: 'Experience' },
      { type: 'projects', title: 'Projects / Independent Work / Academic Projects' },
      { type: 'leadership', title: 'Leadership Experience and Activities' },
      { type: 'awards', title: 'Honors' },
      { type: 'skills', title: 'Additional Information & Skills' },
    ],
    defaultContactFields: ['location', 'email', 'phone', 'linkedin', 'github'],
  },
  {
    id: 'natural-sciences',
    name: 'UT Austin Natural Sciences',
    tagline: 'Research-oriented',
    description:
      'Emphasizes Research and Lab Skills. Compact spacing. GPA and coursework prominent.',
    features: singleCenter,
    styles: {
      font: 'EB Garamond',
      fontSize: { name: 22, sectionHeader: 11, entryTitle: 10.5, body: 10, contactLine: 9.5 },
      colors: baseColors,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      spacing: { section: 6, entry: 3, bullet: 1.15 },
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
    },
    defaultSections: [
      { type: 'education', title: 'Education' },
      { type: 'research', title: 'Research' },
      { type: 'experience', title: 'Experience' },
      { type: 'skills', title: 'Technical Skills' },
    ],
    defaultContactFields: ['email', 'phone', 'linkedin'],
  },
  {
    id: 'cs-swe',
    name: 'Software Engineering',
    tagline: 'Industry standard',
    description:
      'Skills up top, then Projects, Experience, Education. GitHub field prominent in header.',
    features: singleLeft,
    styles: {
      font: 'Inter',
      fontSize: { name: 22, sectionHeader: 10.5, entryTitle: 10.5, body: 10, contactLine: 9.5 },
      colors: baseColors,
      margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      spacing: { section: 6, entry: 4, bullet: 1.2 },
      ruleStyle: { variant: 'full', weight: 1 },
      dateFormat: 'month-year',
      paperSize: 'letter',
    },
    defaultSections: [
      { type: 'skills', title: 'Skills' },
      { type: 'projects', title: 'Projects' },
      { type: 'experience', title: 'Experience' },
      { type: 'education', title: 'Education' },
    ],
    defaultContactFields: ['email', 'github', 'linkedin', 'website', 'phone'],
  },
  {
    id: 'general',
    name: 'General Professional',
    tagline: 'Balanced · Any major',
    description:
      'Neutral, balanced layout. Works for any major or early-career path.',
    features: singleCenter,
    styles: {
      font: 'Georgia',
      fontSize: { name: 24, sectionHeader: 11, entryTitle: 11, body: 10.5, contactLine: 10 },
      colors: baseColors,
      margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
      spacing: baseSpacing,
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
    },
    defaultSections: [
      { type: 'education', title: 'Education' },
      { type: 'experience', title: 'Experience' },
      { type: 'leadership', title: 'Activities' },
      { type: 'skills', title: 'Skills' },
    ],
    defaultContactFields: ['email', 'phone', 'linkedin', 'location'],
  },
  {
    id: 'professional-multipage',
    name: 'Professional (Multi-page)',
    tagline: '2-page · Summary optional',
    description:
      'Summary block at the top (hide or delete if not needed), then Experience and Education. Page numbers on by default. Add page-break sections to control layout.',
    features: {
      headerAlign: 'center',
      summaryPlacement: 'optional',
      repeatHeaderOnPages: true,
      layout: 'single',
    },
    styles: {
      font: 'Lato',
      fontSize: { name: 22, sectionHeader: 11, entryTitle: 10.5, body: 10, contactLine: 9.5 },
      colors: baseColors,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      spacing: { section: 7, entry: 4, bullet: 1.2 },
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
      pageNumbers: true,
    },
    defaultSections: [
      {
        type: 'summary',
        title: 'Professional Summary',
        styleOverrides: { hideHeader: true, hideRule: true },
      },
      { type: 'experience', title: 'Experience' },
      { type: 'education', title: 'Education' },
      { type: 'skills', title: 'Skills' },
      { type: 'leadership', title: 'Leadership & Activities' },
      { type: 'certifications', title: 'Certifications' },
    ],
    defaultContactFields: ['email', 'phone', 'linkedin', 'location'],
  },
  {
    id: 'sidebar-professional',
    name: 'Sidebar Professional',
    tagline: 'Two-column · Skills sidebar',
    description:
      'Skills and education in a left sidebar; experience and projects on the right. Optional headerless summary spans the top.',
    features: {
      headerAlign: 'left',
      summaryPlacement: 'optional',
      repeatHeaderOnPages: true,
      layout: 'two-column',
    },
    styles: {
      font: 'Inter',
      fontSize: { name: 20, sectionHeader: 10.5, entryTitle: 10.5, body: 9.5, contactLine: 9 },
      colors: baseColors,
      margins: { top: 0.55, bottom: 0.55, left: 0.55, right: 0.55 },
      spacing: { section: 6, entry: 3, bullet: 1.15 },
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
      pageNumbers: true,
    },
    defaultSections: [
      {
        type: 'summary',
        title: 'Professional Summary',
        styleOverrides: { hideHeader: true, hideRule: true },
      },
      { type: 'skills', title: 'Skills', column: 'left' },
      { type: 'education', title: 'Education', column: 'left' },
      { type: 'certifications', title: 'Certifications', column: 'left' },
      { type: 'experience', title: 'Experience', column: 'right' },
      { type: 'projects', title: 'Projects', column: 'right' },
      { type: 'leadership', title: 'Leadership', column: 'right' },
    ],
    defaultContactFields: ['email', 'phone', 'linkedin', 'location', 'github'],
  },
  {
    id: 'blank',
    name: 'Blank Canvas',
    tagline: 'Start from scratch',
    description: 'Completely empty. Build the resume your way.',
    features: singleCenter,
    styles: {
      font: 'Inter',
      fontSize: { name: 24, sectionHeader: 11, entryTitle: 11, body: 10.5, contactLine: 10 },
      colors: baseColors,
      margins: { top: 1, bottom: 1, left: 1, right: 1 },
      spacing: baseSpacing,
      ruleStyle: { variant: 'full', weight: 0.5 },
      dateFormat: 'month-year',
      paperSize: 'letter',
    },
    defaultSections: [],
    defaultContactFields: ['email'],
  },
];

export function getTemplate(id: TemplateId): TemplateMeta {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown template id: ${id}`);
  return found;
}
