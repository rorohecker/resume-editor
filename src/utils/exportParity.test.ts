import { describe, expect, it } from 'vitest';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { getTemplate, TEMPLATES } from '@/components/templates/registry';
import { estimatePageStats } from '@/utils/styleChecks';
import { resumeToPlainText } from '@/utils/resumeText';
import { upsertSummarySection } from '@/utils/summarySection';

describe('template registry', () => {
  it('includes feature flags for every template', () => {
    for (const template of TEMPLATES) {
      expect(template.features.headerAlign).toMatch(/left|center/);
      expect(template.features.layout).toMatch(/single|two-column/);
    }
  });

  it('seeds optional summary for professional-multipage', () => {
    const resume = createResumeFromTemplate('professional-multipage');
    const summary = resume.sections.find((section) => section.type === 'summary');
    expect(summary).toBeTruthy();
    expect(summary?.styleOverrides?.hideHeader).toBe(true);
    expect(getTemplate(resume.template).features.repeatHeaderOnPages).toBe(true);
  });

  it('assigns columns for sidebar-professional', () => {
    const resume = createResumeFromTemplate('sidebar-professional');
    expect(resume.sections.some((section) => section.column === 'left')).toBe(true);
    expect(resume.sections.some((section) => section.column === 'right')).toBe(true);
    expect(getTemplate(resume.template).features.layout).toBe('two-column');
  });
});

describe('export parity (text)', () => {
  it('includes summary text after upsert', () => {
    const resume = createResumeFromTemplate('general');
    const summaryText = 'Experienced analyst with strong communication skills.';
    const next = {
      ...resume,
      sections: upsertSummarySection(resume.sections, summaryText, 'Summary'),
    };
    const plain = resumeToPlainText(next);
    expect(plain).toContain('SUMMARY');
    expect(plain).toContain(summaryText);
  });

  it('estimates at least one page for a filled demo resume', () => {
    const resume = createResumeFromTemplate('cs-swe');
    const filled = {
      ...resume,
      header: { ...resume.header, name: 'Alex Rivera' },
      sections: resume.sections.map((section) =>
        section.type === 'experience'
          ? {
              ...section,
              entries: [
                {
                  id: 'e1',
                  title: 'Engineer Intern',
                  subtitle: 'Example Co',
                  location: 'Remote',
                  startDate: '2024-06',
                  endDate: '2024-08',
                  bullets: [
                    { id: 'b1', content: 'Built and shipped a feature used by customers.', visible: true, order: 0 },
                  ],
                },
              ],
            }
          : section,
      ),
    };
    const stats = estimatePageStats(filled);
    expect(stats.estimatedPages).toBeGreaterThanOrEqual(1);
    expect(stats.percent).toBeGreaterThan(0);
  });
});
