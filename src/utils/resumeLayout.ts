import type { Resume } from '@/types';

export function resumeForPagedExport(resume: Resume): Resume {
  if (!resume.styles.onePageMode) return resume;

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
