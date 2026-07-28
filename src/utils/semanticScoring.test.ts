import { describe, expect, it } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { semanticMarkersForText, semanticScoreBlocks } from './semanticScoring';
import type { Resume } from '@/types';

function resumeWithSqlAndEvents(): Resume {
  const base = getTemplateDemoResume('general');
  const experience = base.sections.find((section) => section.type === 'experience');
  if (!experience) return base;
  return {
    ...base,
    sections: [
      {
        ...experience,
        entries: [
          {
            ...experience.entries[0]!,
            bullets: [
              {
                id: 'sql-bullet',
                content: 'Built SQL dashboards that reduced weekly reporting time by 40%.',
                visible: true,
                order: 1,
              },
              {
                id: 'events-bullet',
                content: 'Coordinated unrelated campus events and volunteer logistics.',
                visible: true,
                order: 2,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('semanticScoring', () => {
  it('extracts role markers from a job description', () => {
    expect(
      semanticMarkersForText('Business analyst role using SQL dashboards and reporting automation.'),
    ).toEqual(expect.arrayContaining(['Data and analytics']));
  });

  it('scores semantically relevant bullets above unrelated details', () => {
    const scores = semanticScoreBlocks(
      resumeWithSqlAndEvents(),
      'Business analyst role requiring SQL dashboards, reporting automation, and data quality.',
    );
    const byBullet = new Map(scores.filter((score) => score.bulletId).map((score) => [score.bulletId, score.score]));

    expect(byBullet.get('sql-bullet')).toBeGreaterThan(byBullet.get('events-bullet') ?? 0);
  });
});
