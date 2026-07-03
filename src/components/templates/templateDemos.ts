import type { Resume, TemplateId } from '@/types';
import { makeId } from '@/utils/id';
import { createResumeFromTemplate } from './createFromTemplate';

const DEMO_NAME = 'Alex Rivera';
const DEMO_CONTACT = {
  email: 'alex.rivera@email.com',
  phone: '(512) 555-0142',
  linkedin: 'linkedin.com/in/alexrivera',
  location: 'Austin, TX',
  github: 'github.com/alexrivera',
};

function fillDemoResume(resume: Resume): Resume {
  return {
    ...resume,
    name: 'Demo Resume',
    header: {
      ...resume.header,
      name: DEMO_NAME,
      contactFields: resume.header.contactFields.map((field) => ({
        ...field,
        value:
          field.type === 'email'
            ? DEMO_CONTACT.email
            : field.type === 'phone'
              ? DEMO_CONTACT.phone
              : field.type === 'linkedin'
                ? DEMO_CONTACT.linkedin
                : field.type === 'location'
                  ? DEMO_CONTACT.location
                  : field.type === 'github'
                    ? DEMO_CONTACT.github
                    : field.value,
      })),
    },
    sections: resume.sections.map((section) => {
      if (section.type === 'summary') {
        return {
          ...section,
          entries: [
            {
              id: makeId(),
              title:
                'Results-driven professional with experience delivering projects on time and communicating clearly with cross-functional teams.',
            },
          ],
        };
      }
      if (section.type === 'experience' && section.entries.length === 0) {
        return {
          ...section,
          entries: [
            {
              id: makeId(),
              title: 'Analyst Intern',
              subtitle: 'Example Company',
              location: 'Austin, TX',
              startDate: '2024-06',
              endDate: '2024-08',
              bullets: [
                {
                  id: makeId(),
                  content: 'Supported a team initiative that improved process efficiency.',
                  visible: true,
                  order: 0,
                },
              ],
            },
          ],
        };
      }
      if (section.type === 'education' && section.entries.length === 0) {
        return {
          ...section,
          entries: [
            {
              id: makeId(),
              title: 'B.S. Example Major',
              subtitle: 'Example University',
              location: 'Austin, TX',
              startDate: '2022-08',
              endDate: '2026-05',
              bullets: [],
            },
          ],
        };
      }
      if (section.type === 'skills' && section.entries.length === 0) {
        return {
          ...section,
          entries: [
            {
              id: makeId(),
              title: 'Technical',
              subtitle: 'Python, Excel, SQL, Git',
            },
          ],
        };
      }
      return section;
    }),
  };
}

const demoCache = new Map<TemplateId, Resume>();

export function getTemplateDemoResume(templateId: TemplateId): Resume {
  const cached = demoCache.get(templateId);
  if (cached) return cached;
  const demo = fillDemoResume(createResumeFromTemplate(templateId));
  demoCache.set(templateId, demo);
  return demo;
}
