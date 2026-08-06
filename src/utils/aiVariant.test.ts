import { describe, expect, it } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { makeId } from '@/utils/id';
import {
  buildPrioritizedVariantResume,
  calibrateAiBlockScores,
  fitVariantToPages,
  parseLooseJsonArray,
} from './aiVariant';
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

describe('localVariantRolePlan', () => {
  it('extracts key tokens for a software role', async () => {
    const { localVariantRolePlan, isManualVisibilitySection } = await import('./aiVariant');
    const plan = localVariantRolePlan(
      'We are hiring a Software Engineer. Required: React, TypeScript, SQL, system design.',
    );
    expect(plan.targetRole.length).toBeGreaterThan(0);
    expect(plan.keyFactors.length).toBeGreaterThan(0);
    expect(plan.clarifyingQuestions).toEqual([]);
    expect(plan.skillsToHighlight.join(' ').toLowerCase()).toMatch(/react|typescript|sql/);
    expect(
      isManualVisibilitySection({
        id: 's1',
        type: 'skills',
        title: 'Additional Information & Skills',
        visible: true,
        order: 0,
        layout: 'skills-grid',
        entries: [],
      }),
    ).toBe(true);
  });
});

describe('formatRolePlanForPrompt', () => {
  it('includes user clarifications when answers are present', async () => {
    const { formatRolePlanForPrompt, localVariantRolePlan } = await import('./aiVariant');
    const plan = {
      ...localVariantRolePlan('Software Engineer role needing React metrics'),
      clarifyingQuestions: [
        {
          id: 'q1',
          topic: 'Resume Editor',
          question: 'About how many users or exports did Resume Editor reach?',
          why: 'To quantify impact for a product eng reframe',
        },
      ],
    };
    const prompt = formatRolePlanForPrompt(plan, [
      { questionId: 'q1', answer: 'Used by ~40 classmates for internship apps' },
    ]);
    expect(prompt).toContain('TARGET ROLE PLAN');
    expect(prompt).not.toContain('clarifyingQuestions');
    expect(prompt).toContain('USER CLARIFICATIONS');
    expect(prompt).toContain('~40 classmates');
  });
});

describe('buildFeaturePrompt writing rules', () => {
  it('injects Sanitizer rules for rewrite features but not scoring', async () => {
    const { buildFeaturePrompt, RESUME_WRITING_RULES } = await import('./aiGuides');
    const rewrite = buildFeaturePrompt('variant-rewrite', 'BODY');
    const score = buildFeaturePrompt('variant-score', 'BODY');
    expect(rewrite).toContain(RESUME_WRITING_RULES.slice(0, 40));
    expect(rewrite).toContain('no em dashes');
    expect(rewrite).toContain('XYZ method');
    expect(rewrite).toContain('ACTION VERB BANK');
    expect(rewrite).toContain('Engineered');
    expect(rewrite).toContain('never invent numbers');
    expect(score).not.toContain('RESUME WRITING STYLE');
  });

  it('embeds XYZ and verb-bank guidance in bullet rewrite / tailor / organize / agent steps', async () => {
    const { buildFeaturePrompt } = await import('./aiGuides');
    for (const feature of ['bullet-rewrite', 'tailor', 'organize', 'agent'] as const) {
      const prompt = buildFeaturePrompt(feature, 'BODY');
      expect(prompt).toContain('XYZ');
      expect(prompt).toContain('verb-bank');
    }
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

  it('repairs trailing commas and smart quotes', () => {
    const parsed = parseLooseJsonArray(
      '{\n  “scores”: [\n    {“entryId”: “entry-1”, “bulletId”: “”, “score”: 9,},\n  ],\n}',
    );
    expect(parsed).toEqual([{ entryId: 'entry-1', bulletId: '', score: 9 }]);
  });

  it('closes truncated score payloads', () => {
    const parsed = parseLooseJsonArray(
      '{"scores":[{"entryId":"entry-1","bulletId":"bullet-1","score":8,"reason":"sql fit"',
    );
    expect(parsed).toEqual([
      { entryId: 'entry-1', bulletId: 'bullet-1', score: 8, reason: 'sql fit' },
    ]);
  });

  it('recovers score objects glued into prose when the wrapper is broken', () => {
    const parsed = parseLooseJsonArray(
      'Sure. {"entryId":"entry-1","score":8} and also {"entryId":"entry-1","bulletId":"bullet-1","score":9} done.',
    );
    expect(parsed).toEqual([
      { entryId: 'entry-1', score: 8 },
      { entryId: 'entry-1', bulletId: 'bullet-1', score: 9 },
    ]);
  });
});

describe('buildPrioritizedVariantResume', () => {
  it('pins education first and preserves education fields without class reordering', () => {
    const resume = getTemplateDemoResume('general');
    const education = resume.sections.find((section) => section.type === 'education')!;
    const experience = resume.sections.find((section) => section.type === 'experience')!;
    const entry = {
      ...education.entries[0]!,
      id: 'edu-1',
      customFields: {
        coursework: 'Art History, SQL Analytics, Data Mining, Intro Biology',
      },
    };
    const educationSection = { ...education, order: 1, entries: [entry] };
    const experienceSection = {
      ...experience,
      order: 0,
      entries: [{ ...experience.entries[0]!, id: 'exp-1' }],
    };

    const variant = buildPrioritizedVariantResume(
      { ...resume, sections: [experienceSection, educationSection] },
      {
        entries: { [entry.id]: true, 'exp-1': true },
        bullets: Object.fromEntries((experienceSection.entries[0]?.bullets ?? []).map((bullet) => [bullet.id, true])),
      },
      [
        { entryId: 'exp-1', score: 10 },
        { entryId: entry.id, classId: 'class:edu-1:coursework:1:sql-analytics', score: 10 },
      ],
    );

    expect(variant.sections[0]?.type).toBe('education');
    expect(variant.sections[0]?.entries[0]?.customFields?.coursework).toBe(
      'Art History, SQL Analytics, Data Mining, Intro Biology',
    );
  });

  it('fits allowed sections around fixed education', () => {
    const resume = getTemplateDemoResume('general');
    const education = resume.sections.find((section) => section.type === 'education')!;
    const experience = resume.sections.find((section) => section.type === 'experience')!;
    const expEntry = experience.entries[0]!;
    const firstBullet = expEntry.bullets?.[0]!;
    const fit = fitVariantToPages(
      { ...resume, sections: [{ ...experience, order: 0 }, { ...education, order: 1 }] },
      [
        { entryId: education.entries[0]!.id, score: 10 },
        { entryId: expEntry.id, bulletId: firstBullet.id, score: 9 },
      ],
      1,
    );
    const variant = buildPrioritizedVariantResume(
      { ...resume, sections: [{ ...experience, order: 0 }, { ...education, order: 1 }] },
      fit.visibility,
      [
        { entryId: education.entries[0]!.id, score: 10 },
        { entryId: expEntry.id, bulletId: firstBullet.id, score: 9 },
      ],
    );

    expect(variant.sections[0]?.type).toBe('education');
    expect(variant.sections[0]?.entries[0]?.visible).toBe(true);
    expect(variant.sections[1]?.type).toBe('experience');
    expect(variant.sections[1]?.entries[0]?.visible).toBe(true);
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
