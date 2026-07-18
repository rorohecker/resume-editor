import { describe, expect, it } from 'vitest';
import type { Resume } from '@/types';
import { applyAgentPlan, parseAgentPlan } from '@/utils/aiAgent';

const sampleResume = {
  id: 'r1',
  name: 'Test',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  template: 'general',
  header: { name: 'Ada', contactFields: [] },
  sections: [
    {
      id: 'sec-exp',
      type: 'experience',
      title: 'Experience',
      visible: true,
      order: 0,
      layout: 'standard',
      entries: [
        {
          id: 'entry-1',
          title: 'Intern',
          bullets: [
            { id: 'b1', content: 'Helped with reports', visible: true, order: 0 },
            { id: 'b2', content: 'Also helped with reports weekly', visible: true, order: 1 },
          ],
        },
      ],
    },
    {
      id: 'sec-edu',
      type: 'education',
      title: 'Education',
      visible: true,
      order: 1,
      layout: 'standard',
      entries: [],
    },
  ],
  styles: {
    font: 'inter',
    fontSize: { name: 22, sectionHeader: 11, entryTitle: 10, body: 10, contactLine: 9 },
    colors: {
      name: '#000',
      sectionHeader: '#000',
      sectionRule: '#000',
      body: '#000',
      accent: '#000',
    },
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    spacing: { section: 10, entry: 6, bullet: 1.15 },
    ruleStyle: { variant: 'solid', weight: 'thin' },
    dateFormat: 'Month YYYY',
    paperSize: 'letter',
  },
} as unknown as Resume;

describe('aiAgent', () => {
  it('parses fenced JSON plans', () => {
    const plan = parseAgentPlan(`Here you go:
\`\`\`json
{"summary":"Merged duplicates","ops":[{"op":"delete_bullet","bulletId":"b2"}]}
\`\`\``);
    expect(plan.summary).toBe('Merged duplicates');
    expect(plan.ops).toEqual([{ op: 'delete_bullet', bulletId: 'b2' }]);
  });

  it('applies replace, delete, set, and reorder ops', () => {
    const plan = parseAgentPlan(
      JSON.stringify({
        summary: 'Tighten',
        ops: [
          { op: 'replace_bullet', bulletId: 'b1', content: 'Prepared weekly reports' },
          { op: 'delete_bullet', bulletId: 'b2' },
          {
            op: 'set_entry_bullets',
            entryId: 'entry-1',
            bullets: ['Prepared weekly reports', 'Presented findings to leads'],
          },
          { op: 'reorder_sections', sectionIds: ['sec-edu', 'sec-exp'] },
        ],
      }),
    );
    const next = applyAgentPlan(sampleResume, plan);
    expect(next.resume.sections.map((section) => section.id)).toEqual(['sec-edu', 'sec-exp']);
    const entry = next.resume.sections.find((section) => section.id === 'sec-exp')?.entries[0];
    expect(entry?.bullets?.map((bullet) => bullet.content)).toEqual([
      'Prepared weekly reports',
      'Presented findings to leads',
    ]);
    expect(next.applied).toBeGreaterThan(0);
  });
});
