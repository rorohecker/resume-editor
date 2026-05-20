import type { Resume } from '@/types';

// PII redaction for sharing screenshots / public portfolio posts. Swaps name,
// contact values, and company/institution names with neutral placeholders so
// the structure and styling can be shown without exposing the real person.

const COMPANY_PLACEHOLDERS = [
  'Acme Corp.',
  'Globex',
  'Initech',
  'Stark Industries',
  'Wayne Enterprises',
  'Wonka Industries',
  'Hooli',
  'Pied Piper',
];

const SCHOOL_PLACEHOLDERS = [
  'State University',
  'Tech Institute',
  'Liberal Arts College',
  'Polytechnic University',
];

export function anonymizeResume(resume: Resume): Resume {
  const anonymousName = 'Jane Q. Public';
  let companyCounter = 0;
  let schoolCounter = 0;

  return {
    ...resume,
    header: {
      ...resume.header,
      name: anonymousName,
      contactFields: resume.header.contactFields.map((field) => ({
        ...field,
        value: anonymizeContactValue(field.type, field.value),
      })),
    },
    sections: resume.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => {
        let subtitle = entry.subtitle;
        if (subtitle) {
          if (section.type === 'education' || section.type === 'research') {
            subtitle = SCHOOL_PLACEHOLDERS[schoolCounter % SCHOOL_PLACEHOLDERS.length];
            schoolCounter += 1;
          } else if (
            section.type === 'experience' ||
            section.type === 'leadership' ||
            section.type === 'projects'
          ) {
            // For projects, keep the original subtitle if it looks like a tech stack
            // (multiple commas / pipes) rather than a single company name.
            const looksLikeTechStack = (subtitle.match(/[,|]/g) ?? []).length >= 2;
            if (!looksLikeTechStack) {
              subtitle = COMPANY_PLACEHOLDERS[companyCounter % COMPANY_PLACEHOLDERS.length];
              companyCounter += 1;
            }
          }
        }
        return {
          ...entry,
          subtitle,
          location: entry.location ? 'City, ST' : entry.location,
          url: entry.url ? 'example.com' : entry.url,
          customFields: anonymizeCustomFields(entry.customFields),
        };
      }),
    })),
  };
}

function anonymizeContactValue(type: string, value: string): string {
  if (!value) return value;
  switch (type) {
    case 'email':
      return 'jane.public@example.com';
    case 'phone':
      return '(555) 123-4567';
    case 'linkedin':
      return 'linkedin.com/in/jane-public';
    case 'github':
      return 'github.com/janepublic';
    case 'website':
      return 'janepublic.example';
    case 'location':
      return 'City, ST';
    case 'twitter':
      return '@janepublic';
    default:
      return '[redacted]';
  }
}

function anonymizeCustomFields(
  fields: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!fields) return fields;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!value) {
      result[key] = value;
      continue;
    }
    if (key === 'githubUrl') result[key] = 'github.com/janepublic';
    else if (key === 'gpa') result[key] = '3.8'; // generic
    else if (/url|link/i.test(key)) result[key] = 'example.com';
    else result[key] = value;
  }
  return result;
}
