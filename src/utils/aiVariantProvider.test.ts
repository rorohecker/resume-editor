import { describe, expect, it, vi } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import { generateAiText, type AiSettings } from './aiByok';
import { scoreBlocksWithAi } from './aiVariant';
import type { Resume } from '@/types';

vi.mock('./aiByok', () => ({
  generateAiText: vi.fn(),
}));

const settings: AiSettings = {
  provider: 'openai',
  apiKey: 'test-key',
  model: 'gpt-5.6-luna',
  dailyLimit: 500,
  minuteLimit: 50,
  agentInstructions: '',
};

function oneEntryResume(): Resume {
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
            id: 'entry-1',
            bullets: [
              {
                id: 'bullet-1',
                content: 'Built SQL dashboards that reduced weekly reporting time by 40%.',
                visible: true,
                order: 1,
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('scoreBlocksWithAi provider resilience', () => {
  it('falls back to semantic scores when provider JSON remains malformed', async () => {
    vi.mocked(generateAiText).mockResolvedValue('Here is a nice explanation, not JSON.');

    const scores = await scoreBlocksWithAi(
      settings,
      oneEntryResume(),
      'Business analyst role requiring SQL dashboards and reporting automation.',
    );

    expect(generateAiText).toHaveBeenCalledTimes(2);
    expect(scores.some((score) => score.entryId === 'entry-1')).toBe(true);
    expect(scores.some((score) => score.bulletId === 'bullet-1')).toBe(true);
  });
});
