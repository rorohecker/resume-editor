import { describe, expect, it } from 'vitest';
import { createResumeFromTemplate } from '@/components/templates/createFromTemplate';
import { decodeResumeFromToken, encodeResumeToToken } from '@/utils/shareLink';

describe('shareLink round-trip', () => {
  it('encodes and decodes a resume without application bookkeeping', async () => {
    const resume = createResumeFromTemplate('general');
    resume.header.name = 'Alex Rivera';
    resume.application = {
      status: 'applied',
      companyName: 'Acme',
      targetRole: 'SWE',
    };

    const token = await encodeResumeToToken(resume);
    expect(token.length).toBeGreaterThan(10);

    const decoded = await decodeResumeFromToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.header.name).toBe('Alex Rivera');
    expect(decoded?.application).toBeUndefined();
    expect(decoded?.template).toBe(resume.template);
    expect(decoded?.sections.length).toBe(resume.sections.length);
  });

  it('returns null for garbage tokens', async () => {
    expect(await decodeResumeFromToken('not-a-token')).toBeNull();
  });
});
