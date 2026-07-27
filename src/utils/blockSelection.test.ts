import { describe, expect, it } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { makeId } from '@/utils/id';
import { fitToPages, localScoreBlocks } from '@/utils/blockSelection';
import type { Resume } from '@/types';

/** Demo template plus a few extra bullets so packing has real content to choose. */
function resumeWithContent(): Resume {
  const base = getTemplateDemoResume('general');
  return {
    ...base,
    sections: base.sections.map((section) => {
      if (section.type !== 'experience') return section;
      return {
        ...section,
        entries: section.entries.map((entry, index) => {
          if (index > 0) return entry;
          const extras = [
            'Built dashboards in Python and SQL that cut reporting time by 40%.',
            'Collaborated with engineers to ship a React prototype for internal tools.',
            'Led weekly standups and documented process improvements for leadership.',
          ].map((content, order) => ({
            id: makeId(),
            content,
            visible: true,
            order: order + 1,
          }));
          return {
            ...entry,
            bullets: [...(entry.bullets ?? []), ...extras],
          };
        }),
      };
    }),
  };
}

describe('fitToPages', () => {
  it('includes bullets when packing a scored resume', () => {
    const resume = resumeWithContent();
    const scores = localScoreBlocks(resume, 'software engineer python react leadership');
    expect(scores.length).toBeGreaterThan(0);
    const fit = fitToPages(resume, scores, { maxPages: 1 });
    expect(fit.includedEntries + fit.includedBullets).toBeGreaterThan(0);
    expect(Object.values(fit.visibility.bullets).some(Boolean)).toBe(true);
  });

  it('still packs later cheaper blocks when an early item does not fit', () => {
    const resume = resumeWithContent();
    const base = localScoreBlocks(resume, 'engineer');
    const firstEntry = resume.sections.flatMap((s) => s.entries)[0];
    const scores = [
      { entryId: firstEntry?.id ?? 'missing', score: 10_000 },
      ...base.map((s) => ({ ...s, score: s.score + 1 })),
    ];
    const fit = fitToPages(resume, scores, { maxPages: 1, targetUsage: 95 });
    expect(fit.includedEntries + fit.includedBullets).toBeGreaterThan(0);
  });

  it('recovers bullets when only entry scores are provided', () => {
    const resume = resumeWithContent();
    const entryScores = resume.sections.flatMap((section) =>
      section.entries.map((entry) => ({ entryId: entry.id, score: 8 })),
    );
    const fit = fitToPages(resume, entryScores, { maxPages: 1 });
    expect(fit.includedBullets).toBeGreaterThan(0);
    expect(fit.includedEntries).toBeGreaterThan(0);
  });

  it('does not wipe experience when high entry scores outrank bullets', () => {
    const resume = resumeWithContent();
    const base = localScoreBlocks(resume, 'python react');
    // Inflate every entry-only score above its bullets (the old empty-fit failure mode).
    const scores = base.map((s) =>
      s.bulletId ? s : { ...s, score: s.score + 100 },
    );
    const fit = fitToPages(resume, scores, { maxPages: 1 });
    expect(fit.includedBullets).toBeGreaterThan(0);
  });
});
