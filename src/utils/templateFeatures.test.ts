import { describe, expect, it } from 'vitest';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { applyTemplate } from '@/components/templates/createFromTemplate';
import { headerAlignFor } from './templateFeatures';

describe('headerAlignFor', () => {
  it('uses template default when no user override is set', () => {
    const cs = createResumeFromTemplate('cs-swe');
    const general = createResumeFromTemplate('general');
    expect(headerAlignFor(cs)).toBe('left');
    expect(headerAlignFor(general)).toBe('center');
  });

  it('respects user override on any template', () => {
    const resume = {
      ...createResumeFromTemplate('general'),
      styles: {
        ...createResumeFromTemplate('general').styles,
        headerAlign: 'left' as const,
      },
    };
    expect(headerAlignFor(resume)).toBe('left');
  });

  it('preserves user header alignment when switching templates', () => {
    const resume = {
      ...createResumeFromTemplate('general'),
      styles: {
        ...createResumeFromTemplate('general').styles,
        headerAlign: 'left' as const,
      },
    };
    const switched = applyTemplate(resume, 'mccombs');
    expect(switched.styles.headerAlign).toBe('left');
    expect(headerAlignFor(switched)).toBe('left');
  });
});
