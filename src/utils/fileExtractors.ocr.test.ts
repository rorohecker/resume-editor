import { describe, expect, it } from 'vitest';
import { postProcessOcrText } from './fileExtractors';

describe('postProcessOcrText', () => {
  it('fixes common resume OCR confusions', () => {
    const raw = `Jane Doe
jane@gmai1.com | linkedin.corn/in/jane
Experlence
Built dashboards   for   1O2 users`;
    const cleaned = postProcessOcrText(raw);
    expect(cleaned).toContain('gmail.com');
    expect(cleaned).toContain('linkedin.com');
    expect(cleaned).toContain('Experience');
    expect(cleaned).toContain('102');
    expect(cleaned).not.toMatch(/ {2,}/);
  });
});
