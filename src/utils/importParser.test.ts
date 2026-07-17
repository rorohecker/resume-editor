import { describe, expect, it } from 'vitest';
import {
  normalizeResumeText,
  parseResumeText,
  isUnclassified,
} from '@/utils/importParser';
import {
  matchSectionType,
  fuzzyMatchSectionType,
} from '@/utils/resumeSectionLexicon';

describe('section lexicon', () => {
  it('maps common ATS heading synonyms', () => {
    expect(matchSectionType('WORK EXPERIENCE')).toBe('experience');
    expect(matchSectionType('Professional Summary')).toBe('summary');
    expect(matchSectionType('Technical Skills')).toBe('skills');
    expect(matchSectionType('Honors & Awards')).toBe('awards');
    expect(matchSectionType('Volunteer Experience')).toBe('leadership');
    expect(matchSectionType('Relevant Coursework')).toBe('education');
  });

  it('does not treat job titles as section headers', () => {
    expect(matchSectionType('Research Assistant')).toBeNull();
    expect(matchSectionType('Projects delivered for clients')).toBeNull();
  });

  it('fuzzy-matches mild OCR typos on short headings', () => {
    expect(fuzzyMatchSectionType('Experince')).toBe('experience');
    expect(fuzzyMatchSectionType('Educaton')).toBe('education');
  });
});

describe('normalizeResumeText', () => {
  it('normalizes OCR bullet artifacts and dashes', () => {
    const raw = '• Built thing\n● Shipped feature\n◦ Led team\n2018–2022';
    const normalized = normalizeResumeText(raw);
    expect(normalized).toContain('- Built thing');
    expect(normalized).toContain('- Shipped feature');
    expect(normalized).toContain('2018-2022');
  });
});

describe('parseResumeText fixtures', () => {
  it('parses a modern resume with Title-Case headings and tight year ranges', () => {
    const text = [
      'ALEX RIVERA',
      'alex@example.com | (512) 555-0199 | linkedin.com/in/alexr | Austin, TX',
      'Experienced software engineer seeking backend roles.',
      '',
      'Work Experience',
      'Software Engineer — Acme Corp',
      'Jun 2022 - Present',
      '- Helped build the payments API used by 10k customers',
      '- Reduced p95 latency by 30%',
      'Intern | Beta Labs | Remote',
      '2020-2021',
      '1. Built internal dashboards',
      '',
      'Education',
      'B.S. Computer Science — State University',
      '2018-2022',
      '',
      'Technical Skills',
      'Languages: TypeScript, Python, Go',
      'Tools: Docker, Kubernetes, AWS',
    ].join('\n');

    const result = parseResumeText(text, 'alex.pdf');
    expect(result.resume.header.name.toLowerCase()).toContain('alex');
    expect(result.resume.header.contactFields.some((f) => f.type === 'email')).toBe(true);
    expect(result.resume.header.contactFields.some((f) => f.type === 'phone')).toBe(true);
    expect(result.resume.header.contactFields.some((f) => f.type === 'linkedin')).toBe(true);
    expect(result.resume.header.contactFields.some((f) => f.type === 'location')).toBe(true);

    const types = result.resume.sections.map((s) => s.type);
    expect(types).toContain('summary');
    expect(types).toContain('experience');
    expect(types).toContain('education');
    expect(types).toContain('skills');

    const experience = result.resume.sections.find((s) => s.type === 'experience');
    expect(experience?.entries.length).toBeGreaterThanOrEqual(2);
    const first = experience?.entries[0];
    expect(first?.startDate?.toLowerCase()).toContain('2022');
    expect(first?.current || /present/i.test(first?.endDate ?? '')).toBe(true);
    expect((first?.bullets?.length ?? 0) + (experience?.entries[1]?.bullets?.length ?? 0)).toBeGreaterThan(0);

    const education = result.resume.sections.find((s) => s.type === 'education');
    expect(education?.entries[0]?.startDate).toMatch(/2018/);
    expect(education?.entries[0]?.endDate).toMatch(/2022/);
  });

  it('keeps preamble text as summary instead of dropping it', () => {
    const text = [
      'Jordan Lee',
      'jordan@example.com',
      'Results-driven product manager with 5 years leading cross-functional teams.',
      'EXPERIENCE',
      'PM — Orbit',
      '2021 - Present',
      '- Shipped onboarding that lifted activation 12%',
    ].join('\n');
    const result = parseResumeText(text);
    const summary = result.resume.sections.find((s) => s.type === 'summary');
    expect(summary?.entries[0]?.title).toMatch(/product manager/i);
  });

  it('parses LinkedIn-style labels via hints', () => {
    const text = [
      'Sam Patel',
      'Summary',
      'Engineer focused on distributed systems.',
      'Experience',
      'Staff Engineer at Nova',
      'Jan 2019 - Present',
      '- Scaled event pipeline to 1M events/day',
      'Education',
      'M.S. CS — Tech U',
      '2017 - 2019',
      'Top Skills',
      'Go, Kafka, Kubernetes',
    ].join('\n');
    const result = parseResumeText(text, 'linkedin.pdf', { isLikelyLinkedIn: true });
    expect(result.resume.sections.some((s) => s.type === 'experience')).toBe(true);
    expect(result.resume.sections.some((s) => s.type === 'education')).toBe(true);
    expect(result.resume.sections.some((s) => s.type === 'skills')).toBe(true);
  });

  it('handles numbered bullets and comma-separated skills', () => {
    const text = [
      'Casey Ng',
      'casey@ex.com',
      'PROJECTS',
      'Resume Toolkit',
      '2024',
      '1. Parsed 40+ heading variants',
      '2. Improved OCR preprocessing',
      'SKILLS',
      'TypeScript, React, Vite, Zustand',
    ].join('\n');
    const result = parseResumeText(text);
    const projects = result.resume.sections.find((s) => s.type === 'projects');
    expect(projects?.entries[0]?.bullets?.length).toBeGreaterThanOrEqual(2);
    const skills = result.resume.sections.find((s) => s.type === 'skills');
    expect((skills?.entries.length ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it('flags unrecognized custom headings as unclassified', () => {
    expect(isUnclassified({ type: 'custom', title: 'Miscellaneous' })).toBe(true);
    expect(isUnclassified({ type: 'experience', title: 'Experience' })).toBe(false);
  });

  it('does not invent entries from dates inside bullet prose', () => {
    const text = [
      'Riley Chen',
      'riley@ex.com',
      'EXPERIENCE',
      'Engineer — Co',
      '2022 - Present',
      '- Maintained the service since 2020 with zero Sev-1s',
    ].join('\n');
    const result = parseResumeText(text);
    const experience = result.resume.sections.find((s) => s.type === 'experience');
    expect(experience?.entries.length).toBe(1);
    expect(experience?.entries[0]?.bullets?.[0]?.content).toMatch(/since 2020/i);
  });
});
