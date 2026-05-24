// Full data model per SPEC §18.

export type TemplateId =
  | 'mccombs'
  | 'natural-sciences'
  | 'cs-swe'
  | 'general'
  | 'blank';

export type SectionType =
  | 'experience'
  | 'education'
  | 'study-abroad'
  | 'projects'
  | 'skills'
  | 'leadership'
  | 'research'
  | 'awards'
  | 'certifications'
  | 'publications'
  | 'summary'
  | 'custom'
  | 'page-break';

export type SectionLayout =
  | 'entry-based'
  | 'bullet-list'
  | 'skills-grid'
  | 'text-block';

export type ContactFieldType =
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'github'
  | 'website'
  | 'location'
  | 'twitter'
  | 'custom';

export type SeparatorStyle = '|' | 'dot' | 'dash';

export type FontFamily =
  | 'EB Garamond'
  | 'Georgia'
  | 'Times New Roman'
  | 'Lato'
  | 'Inter'
  | 'Carlito'
  | 'Nimbus Sans'
  | 'Latin Modern Roman';

export type DateFormat =
  | 'month-year' // May 2023 – Aug 2023
  | 'numeric' // 05/2023 – 08/2023
  | 'season-year' // Spring 2023 – Fall 2023
  | 'year-only'; // 2023 – Present

export type RuleVariant = 'full' | 'partial' | 'none' | 'double' | 'thick';
export type RuleWeight = 0.5 | 1 | 1.5;

export interface ContactField {
  id: string;
  type: ContactFieldType;
  value: string;
  label: string; // editor-only
  visible: boolean;
  order: number;
}

export interface HeaderBlock {
  name: string;
  contactFields: ContactField[];
  separatorStyle: SeparatorStyle;
}

export interface Bullet {
  id: string;
  content: string; // HTML from TipTap (plain text until §6)
  visible: boolean;
  order: number;
  // Free-form tags for the master/library system. Used by the variant
  // generator to score relevance to a job description.
  tags?: string[];
}

export interface Entry {
  id: string;
  title?: string;
  subtitle?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets?: Bullet[];
  url?: string;
  customFields?: Record<string, string>;
  // Soft "library mode": entries with visible !== false render in the resume;
  // entries with visible === false live in the block library and can be
  // promoted into a section on demand or by the variant generator.
  visible?: boolean;
  tags?: string[];
}

// Per-section overrides. Anything left undefined falls back to the resume-level
// styles (§8). Useful for tightening one specific section without affecting
// the rest of the document.
export interface SectionStyleOverrides {
  spaceAbove?: number; // pt — overrides ResumeStyles.spacing.section
  entrySpacing?: number; // pt — overrides ResumeStyles.spacing.entry
  hideRule?: boolean; // hide the rule under this section's header
  uppercaseTitle?: boolean; // override default uppercase formatting (true/false)
  bodyColor?: string; // hex — overrides ResumeStyles.colors.body for this section
  sectionHeaderColor?: string; // hex — overrides sectionHeader color
}

export interface Section {
  id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  order: number;
  entries: Entry[];
  layout: SectionLayout;
  styleOverrides?: SectionStyleOverrides;
}

export interface FontSizeConfig {
  name: number; // pt, 18–36
  sectionHeader: number; // pt
  entryTitle: number; // pt
  body: number; // pt, 8–14
  contactLine: number; // pt
}

export interface ColorConfig {
  name: string;
  sectionHeader: string;
  sectionRule: string;
  body: string;
  accent: string;
}

export interface MarginConfig {
  top: number; // inches
  bottom: number;
  left: number;
  right: number;
}

export interface SpacingConfig {
  section: number; // pt above section header
  entry: number; // pt between entries within a section
  bullet: number; // line height multiplier 1.0–1.5
}

export interface RuleStyle {
  variant: RuleVariant;
  weight: RuleWeight;
}

export type BulletGlyph = 'disc' | 'circle' | 'square' | 'dash' | 'arrow' | 'none';

export interface ResumeStyles {
  font: FontFamily;
  fontSize: FontSizeConfig;
  colors: ColorConfig;
  margins: MarginConfig;
  spacing: SpacingConfig;
  ruleStyle: RuleStyle;
  dateFormat: DateFormat;
  paperSize: 'letter' | 'a4';
  onePageMode?: boolean;
  pageNumbers?: boolean;
  // Symbol used for unordered list items. Defaults to 'disc' (•). 'none' hides
  // the marker so users who write run-on bullets aren't forced into list mode.
  bulletStyle?: BulletGlyph;
}

export type ApplicationStatus =
  | 'drafting'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'archived';

export interface JobApplication {
  targetRole?: string;
  companyName?: string;
  status: ApplicationStatus;
  appliedAt?: string; // ISO date
  notes?: string;
}

export interface Resume {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  template: TemplateId;
  header: HeaderBlock;
  sections: Section[];
  styles: ResumeStyles;
  application?: JobApplication;
  // Persisted schema version so future model changes can migrate cleanly.
  schemaVersion?: number;
  // When set, this resume is a curated variant of another. The Landing page
  // shows a "Variant of X" badge and groups variants under their master.
  variantOf?: string;
}

export interface VersionSnapshot {
  id: string;
  resumeId: string;
  name: string;
  createdAt: string;
  resume: Resume;
}
