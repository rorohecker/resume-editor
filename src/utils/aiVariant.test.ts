import { describe, expect, it } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { makeId } from '@/utils/id';
import { calibrateAiBlockScores } from './aiVariant';
import { fitToPages, listAllBlocks, type BlockScore } from './blockSelection';
import type { Resume } from '@/types';

function resumeWithExtraDetail(): Resume {
  const base = getTemplateDemoResume('general');
  return {
    ...base,
    sections: base.sections.map((section) => {
      if (section.type !== 'experience') return section;
      return {
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: [
            ...(entry.bullets ?? []),
            {
              id: makeId(),
              content: 'Built SQL dashboards that reduced manual reporting time by 40%.',
              visible: true,
              order: (entry.bullets?.length ?? 0) + 1,
            },
            {
              id: makeId(),
              content: 'Coordinated unrelated campus events and general volunteer logistics.',
              visible: true,
              order: (entry.bullets?.length ?? 0) + 2,
            },
          ],
        })),
      };
    }),
  };
}

describe('calibrateAiBlockScores', () => {
  it('spreads clustered high AI scores so tailored variants do not keep every detail', () => {
    const resume = resumeWithExtraDetail();
    const blocks = listAllBlocks(resume);
    const mushyScores: BlockScore[] = [
      ...blocks.entries.map(({ entry }) => ({ entryId: entry.id, score: 8 })),
      ...blocks.bullets.map(({ entry, bullet }) => ({
        entryId: entry.id,
        bulletId: bullet.id,
        score: 8,
      })),
    ];

    const calibrated = calibrateAiBlockScores(
      mushyScores,
      resume,
      'Business analyst role requiring SQL dashboards, reporting automation, and data quality.',
    );
    const values = calibrated.map((score) => score.score);
    const highShare = values.filter((score) => score >= 8).length / values.length;
    const lowShare = values.filter((score) => score <= 4).length / values.length;
    const fit = fitToPages(resume, calibrated, { maxPages: 1, selectivity: 'strict' });

    expect(highShare).toBeLessThanOrEqual(0.3);
    expect(lowShare).toBeGreaterThanOrEqual(0.35);
    expect(fit.includedBullets).toBeGreaterThan(0);
    expect(fit.includedBullets).toBeLessThan(blocks.bullets.length);
  });

  it('leaves already-discriminating AI scores intact apart from clamping', () => {
    const resume = resumeWithExtraDetail();
    const scores: BlockScore[] = [
      { entryId: 'a', score: 10 },
      { entryId: 'b', score: 7 },
      { entryId: 'c', score: 4 },
      { entryId: 'd', score: 1 },
    ];

    expect(calibrateAiBlockScores(scores, resume, 'SQL analyst')).toEqual(scores);
  });
});
