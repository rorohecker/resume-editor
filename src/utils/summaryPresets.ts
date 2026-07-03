export interface SummaryPreset {
  id: string;
  labelKey: string;
  defaultLabel: string;
  text: string;
}

export const SUMMARY_PRESETS: SummaryPreset[] = [
  {
    id: 'student',
    labelKey: 'editor.summaryPresetStudent',
    defaultLabel: 'Student / new grad',
    text: 'Motivated recent graduate with hands-on project experience and strong communication skills. Seeking an entry-level role where I can contribute quickly while continuing to grow technical and professional skills.',
  },
  {
    id: 'swe',
    labelKey: 'editor.summaryPresetSwe',
    defaultLabel: 'Software engineer',
    text: 'Software engineer with experience building reliable, user-facing products across the stack. Comfortable owning features from design through deployment, with a focus on clean code, testing, and measurable impact.',
  },
  {
    id: 'business',
    labelKey: 'editor.summaryPresetBusiness',
    defaultLabel: 'Business / consulting',
    text: 'Analytical business professional with experience in research, stakeholder communication, and data-driven recommendations. Known for structured problem solving and delivering polished work under tight deadlines.',
  },
  {
    id: 'research',
    labelKey: 'editor.summaryPresetResearch',
    defaultLabel: 'Research / academic',
    text: 'Research-oriented professional with laboratory and analytical experience, strong written communication, and a track record of rigorous, detail-oriented work. Interested in roles that combine technical depth with collaborative inquiry.',
  },
  {
    id: 'career-change',
    labelKey: 'editor.summaryPresetCareerChange',
    defaultLabel: 'Career change',
    text: 'Professional transitioning into a new field, bringing transferable skills in project management, client communication, and fast learning. Combines prior industry experience with recent training and project work in the target domain.',
  },
];
