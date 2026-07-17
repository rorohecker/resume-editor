import { describe, expect, it } from 'vitest';
import { parseResumeText } from '@/utils/importParser';
import {
  findWeakPhrasesInText,
  replaceWeakPhrase,
} from '@/utils/aiAssist';
import { isFallbackPdfFont } from '@/utils/pdfFonts';

describe('importParser', () => {
  it('parses a simple pasted resume into sections', () => {
    const text = [
      'Jordan Lee',
      'jordan@example.com | linkedin.com/in/jordan',
      '',
      'EXPERIENCE',
      'Software Engineer — Acme Corp',
      'June 2022 – Present',
      '- Helped build the payments API used by 10k customers',
      '- Worked on latency reductions of 30%',
      '',
      'EDUCATION',
      'B.S. Computer Science — State University',
      '2018 – 2022',
    ].join('\n');

    const result = parseResumeText(text);
    expect(result.resume.header.name.toLowerCase()).toContain('jordan');
    expect(result.stats.sections).toBeGreaterThan(0);
    expect(result.stats.bullets).toBeGreaterThan(0);
    expect(result.resume.sections.some((s) => s.type === 'experience' || /experience/i.test(s.title))).toBe(
      true,
    );
  });
});

describe('weak language helpers', () => {
  it('detects and replaces weak phrases', () => {
    const content = 'Helped the team ship the feature';
    const hits = findWeakPhrasesInText(content);
    expect(hits.some((h) => h.phrase === 'helped')).toBe(true);
    const next = replaceWeakPhrase(content, 'helped', 'Supported');
    expect(next.toLowerCase().startsWith('supported')).toBe(true);
  });
});

describe('pdfFonts', () => {
  it('marks non-embedded fonts as fallbacks', () => {
    expect(isFallbackPdfFont('EB Garamond')).toBe(false);
    expect(isFallbackPdfFont('Inter')).toBe(false);
    expect(isFallbackPdfFont('Georgia')).toBe(true);
    expect(isFallbackPdfFont('Times New Roman')).toBe(true);
  });
});
