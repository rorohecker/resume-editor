import { describe, expect, it } from 'vitest';
import { parseResumeText } from '@/utils/importParser';
import {
  ACTION_VERBS,
  detectWeakLanguage,
  findWeakPhrasesInText,
  replaceWeakPhrase,
  rewriteBullet,
} from '@/utils/aiAssist';
import { isFallbackPdfFont } from '@/utils/pdfFonts';
import { collectBullets } from '@/utils/resumeText';

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

describe('local rewriteBullet', () => {
  it('opens with action-verb-bank verbs and does not invent metric padding', () => {
    const options = rewriteBullet('Helped build the payments API', '');
    expect(options).toHaveLength(3);
    const bank = new Set(Object.values(ACTION_VERBS).flat().map((v) => v.toLowerCase()));
    for (const option of options) {
      const first = option.split(/\s+/)[0]?.toLowerCase() ?? '';
      expect(bank.has(first)).toBe(true);
      expect(option.toLowerCase()).not.toContain('measurable team outcomes');
      expect(option.toLowerCase()).toContain('payments api');
    }
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

  it('returns exact bullet ids for bulk weak-language fixes', () => {
    const result = parseResumeText(
      [
        'Jordan Lee',
        '',
        'EXPERIENCE',
        'Software Engineer - Acme Corp',
        '- Helped ship reports',
      ].join('\n'),
    );
    const bulletIds = new Set(collectBullets(result.resume).map((bullet) => bullet.bulletId));
    const hits = detectWeakLanguage(result.resume);

    expect(hits.length).toBeGreaterThan(0);
    expect(bulletIds.has(hits[0]!.bulletId)).toBe(true);
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
