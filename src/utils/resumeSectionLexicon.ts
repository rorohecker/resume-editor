import type { SectionType } from '@/types';

/**
 * Public-domain style resume section heading lexicon.
 * Compiled from common ATS / OpenResume-style heading synonyms so imports
 * recognize more real-world resumes without needing a trained ML model.
 */
export const SECTION_LEXICON: Record<string, SectionType> = {
  // Experience
  experience: 'experience',
  experiences: 'experience',
  work: 'experience',
  'work experience': 'experience',
  'work history': 'experience',
  'work experience history': 'experience',
  employment: 'experience',
  'employment history': 'experience',
  'professional experience': 'experience',
  'professional history': 'experience',
  'career history': 'experience',
  'relevant experience': 'experience',
  'relevant work experience': 'experience',
  internships: 'experience',
  internship: 'experience',
  'internship experience': 'experience',
  'industry experience': 'experience',
  'teaching experience': 'experience',
  'clinical experience': 'experience',

  // Education
  education: 'education',
  'education and training': 'education',
  'academic background': 'education',
  'academic history': 'education',
  academics: 'education',
  coursework: 'education',
  'relevant coursework': 'education',
  'course work': 'education',

  // Study abroad
  'study abroad': 'study-abroad',
  'study-abroad': 'study-abroad',
  'international experience': 'study-abroad',
  'global experience': 'study-abroad',

  // Projects
  projects: 'projects',
  project: 'projects',
  'personal projects': 'projects',
  'academic projects': 'projects',
  'side projects': 'projects',
  'selected projects': 'projects',
  'key projects': 'projects',
  portfolio: 'projects',

  // Skills
  skills: 'skills',
  'technical skills': 'skills',
  'core skills': 'skills',
  'core competencies': 'skills',
  competencies: 'skills',
  'areas of expertise': 'skills',
  expertise: 'skills',
  technologies: 'skills',
  'tech stack': 'skills',
  'technical proficiencies': 'skills',
  proficiencies: 'skills',
  tools: 'skills',
  'tools and technologies': 'skills',
  'programming languages': 'skills',
  languages: 'skills',
  'language skills': 'skills',
  'software skills': 'skills',
  'hard skills': 'skills',
  'soft skills': 'skills',

  // Leadership / activities
  leadership: 'leadership',
  'leadership experience': 'leadership',
  activities: 'leadership',
  extracurriculars: 'leadership',
  'extracurricular activities': 'leadership',
  'campus involvement': 'leadership',
  organizations: 'leadership',
  affiliations: 'leadership',
  volunteering: 'leadership',
  'volunteer experience': 'leadership',
  'volunteer work': 'leadership',
  community: 'leadership',
  'community involvement': 'leadership',
  'community service': 'leadership',
  service: 'leadership',

  // Research
  research: 'research',
  'research experience': 'research',
  'research interests': 'research',
  'research projects': 'research',

  // Awards
  awards: 'awards',
  honors: 'awards',
  'honors and awards': 'awards',
  'honors & awards': 'awards',
  'awards and honors': 'awards',
  achievements: 'awards',
  accomplishments: 'awards',
  recognition: 'awards',
  scholarships: 'awards',

  // Certifications
  certifications: 'certifications',
  certification: 'certifications',
  certificates: 'certifications',
  'licenses and certifications': 'certifications',
  'professional certifications': 'certifications',
  credentials: 'certifications',
  licenses: 'certifications',
  courses: 'certifications',
  'professional development': 'certifications',
  training: 'certifications',

  // Publications
  publications: 'publications',
  papers: 'publications',
  'selected publications': 'publications',
  patents: 'publications',
  'patents and publications': 'publications',
  presentations: 'publications',
  'conference presentations': 'publications',

  // Summary
  summary: 'summary',
  'professional summary': 'summary',
  'career summary': 'summary',
  'executive summary': 'summary',
  profile: 'summary',
  'professional profile': 'summary',
  'career profile': 'summary',
  objective: 'summary',
  'career objective': 'summary',
  'professional objective': 'summary',
  about: 'summary',
  'about me': 'summary',
  overview: 'summary',
};

/** LinkedIn PDF section labels (exact / near-exact). */
export const LINKEDIN_SECTION_LABELS: { label: string; type: SectionType }[] = [
  { label: 'Contact', type: 'custom' },
  { label: 'Top Skills', type: 'skills' },
  { label: 'Languages', type: 'skills' },
  { label: 'Summary', type: 'summary' },
  { label: 'Experience', type: 'experience' },
  { label: 'Education', type: 'education' },
  { label: 'Certifications', type: 'certifications' },
  { label: 'Licenses & Certifications', type: 'certifications' },
  { label: 'Honors & Awards', type: 'awards' },
  { label: 'Honors and Awards', type: 'awards' },
  { label: 'Publications', type: 'publications' },
  { label: 'Volunteer Experience', type: 'leadership' },
  { label: 'Projects', type: 'projects' },
  { label: 'Courses', type: 'certifications' },
  { label: 'Organizations', type: 'leadership' },
  { label: 'Accomplishments', type: 'awards' },
];

export function normalizeHeadingKey(line: string): string {
  return line
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Exact / whole-phrase match against the lexicon (avoids "Research Assistant" → research). */
export function matchSectionType(line: string): SectionType | null {
  const key = normalizeHeadingKey(line);
  if (!key || key.length > 48) return null;
  if (SECTION_LEXICON[key]) return SECTION_LEXICON[key];

  // Strip trailing counts like "Experience (3)" from LinkedIn exports.
  const withoutCount = key.replace(/\s+\d+$/, '').replace(/\s+\(\d+\)$/, '').trim();
  if (withoutCount !== key && SECTION_LEXICON[withoutCount]) {
    return SECTION_LEXICON[withoutCount];
  }

  return null;
}

/**
 * Soft OCR typo tolerance: if a short line is within 1 edit of a known heading,
 * treat it as that heading. Keeps false positives low by requiring short lines.
 */
export function fuzzyMatchSectionType(line: string): SectionType | null {
  const key = normalizeHeadingKey(line);
  if (!key || key.length > 28 || key.split(' ').length > 4) return null;
  if (SECTION_LEXICON[key]) return SECTION_LEXICON[key];

  let best: { type: SectionType; distance: number } | null = null;
  for (const [heading, type] of Object.entries(SECTION_LEXICON)) {
    if (Math.abs(heading.length - key.length) > 2) continue;
    const distance = levenshtein(key, heading);
    if (distance <= 1 && (!best || distance < best.distance)) {
      best = { type, distance };
    }
  }
  return best?.type ?? null;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const row = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) row[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[b.length];
}
