import { describe, expect, it } from 'vitest';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { fileBaseName } from '@/utils/exportFiles';

describe('fileBaseName', () => {
  it('uses the resume document name, not the header person name', () => {
    const resume = {
      ...createResumeFromTemplate('general'),
      name: 'Google SWE Internship',
      header: {
        ...createResumeFromTemplate('general').header,
        name: 'Ada Lovelace',
      },
    };
    expect(fileBaseName(resume)).toBe('Google_SWE_Internship');
  });

  it('falls back to header name, then Resume', () => {
    const seeded = createResumeFromTemplate('general');
    expect(fileBaseName({ ...seeded, name: '' })).toBe(
      seeded.header.name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Resume',
    );
    expect(fileBaseName({ ...seeded, name: '', header: { ...seeded.header, name: '' } })).toBe(
      'Resume',
    );
  });
});
