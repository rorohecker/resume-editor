import { describe, expect, it } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { makeId } from '@/utils/id';
import {
  buildPrioritizedVariantResume,
  calibrateAiBlockScores,
  parseLooseJsonArray,
} from './aiVariant';
import { classBlocksForEntry, fitToPages, listAllBlocks, type BlockScore } from './blockSelection';
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

describe('parseLooseJsonArray', () => {
  it('extracts scores from a fenced object response', () => {
    const parsed = parseLooseJsonArray(
      [
        'Here are the scores:',
        '```json',
        '{"scores":[{"entryId":"entry-1","bulletId":"","score":8,"reason":""}]}',
        '```',
      ].join('\n'),
    );

    expect(parsed).toEqual([{ entryId: 'entry-1', bulletId: '', score: 8, reason: '' }]);
  });

  it('combines nested entry and bullet score arrays', () => {
    const parsed = parseLooseJsonArray(
      JSON.stringify({
        scores: {
          entryScores: [{ entry_id: 'entry-1', score: '7' }],
          bulletScores: [{ entry_id: 'entry-1', bullet_id: 'bullet-1', relevanceScore: 9 }],
        },
      }),
    );

    expect(parsed).toEqual([
      { entry_id: 'entry-1', score: '7' },
      { entry_id: 'entry-1', bullet_id: 'bullet-1', relevanceScore: 9 },
    ]);
  });
});

describe('buildPrioritizedVariantResume', () => {
  it('treats classes as scored blocks and rewrites coursework order for the variant', () => {
    const resume = getTemplateDemoResume('general');
    const education = resume.sections.find((section) => section.type === 'education')!;
    const entry = {
      ...education.entries[0]!,
      id: 'edu-1',
      customFields: {
        coursework: 'Art History, SQL Analytics, Data Mining, Intro Biology',
      },
    };
    const section = { ...education, entries: [entry] };
    const classScores = classBlocksForEntry(section, entry).map((block) => ({
      entryId: entry.id,
      classId: block.classId,
      score: block.value.includes('SQL') ? 9 : block.value.includes('Data') ? 8 : 1,
    }));

    const variant = buildPrioritizedVariantResume(
      { ...resume, sections: [section] },
      { entries: { [entry.id]: true }, bullets: {} },
      [{ entryId: entry.id, score: 8 }, ...classScores],
    );

    expect(variant.sections[0]?.entries[0]?.customFields?.coursework).toBe(
      'SQL Analytics, Data Mining',
    );
  });

  it('suppresses duplicate visible bullets inside the same entry', () => {
    const resume = getTemplateDemoResume('general');
    const section = resume.sections.find((item) => item.type === 'experience')!;
    const entry = {
      ...section.entries[0]!,
      id: 'entry-dup',
      bullets: [
        {
          id: 'bullet-strong',
          content: 'Built SQL dashboards that reduced weekly reporting time by 40%.',
          visible: true,
          order: 0,
        },
        {
          id: 'bullet-duplicate',
          content: 'Created SQL dashboards to reduce weekly reporting time for the team.',
          visible: true,
          order: 1,
        },
      ],
    };
    const variant = buildPrioritizedVariantResume(
      { ...resume, sections: [{ ...section, entries: [entry] }] },
      {
        entries: { [entry.id]: true },
        bullets: { 'bullet-strong': true, 'bullet-duplicate': true },
      },
      [
        { entryId: entry.id, bulletId: 'bullet-strong', score: 9 },
        { entryId: entry.id, bulletId: 'bullet-duplicate', score: 8 },
      ],
    );

    const bullets = variant.sections[0]?.entries[0]?.bullets ?? [];
    expect(bullets.find((bullet) => bullet.id === 'bullet-strong')?.visible).toBe(true);
    expect(bullets.find((bullet) => bullet.id === 'bullet-duplicate')?.visible).toBe(false);
  });
});
