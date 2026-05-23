import type {
  ContactFieldType,
  ResumeStyles,
  SectionType,
  TemplateId,
} from '@/types';

export interface TemplateSectionSeed {
  type: SectionType;
  title: string;
}

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  tagline: string;
  description: string;
  styles: ResumeStyles;
  defaultSections: TemplateSectionSeed[];
  defaultContactFields: ContactFieldType[];
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

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'mccombs',
    name: 'UT Austin McCombs',
    tagline: 'Business · Per UT McCombs guide',
    description:
      '3-column education (school | degree | date). Company bold, position italic. Matches the McCombs BBA Recruit guide.',
    styles: {
      font: 'EB Garamond',
      fontSize: { name: 16, sectionHeader: 10.5, entryTitle: 10.5, body: 10, contactLine: 10 },
      colors: baseColors,
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
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
    id: 'blank',
    name: 'Blank Canvas',
    tagline: 'Start from scratch',
    description: 'Completely empty. Build the resume your way.',
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
