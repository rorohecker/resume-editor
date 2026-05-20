import type { Section, SectionType } from '@/types';
import { makeId } from '@/utils/id';

// Sample-entry inserts. Users can drop a typical entry into a new section to
// see the right shape, then edit. Solves the "blank state cold start" problem.

export function sampleEntryForSection(section: Section) {
  const type: SectionType = section.type;
  const id = makeId();
  switch (type) {
    case 'experience':
      return {
        id,
        title: 'Software Engineer Intern',
        subtitle: 'Acme Corp.',
        location: 'San Francisco, CA',
        startDate: 'May 2025',
        endDate: 'Aug 2025',
        current: false,
        bullets: [
          { id: makeId(), content: 'Engineered a feature that reduced page load time by 30%.', visible: true, order: 0 },
          { id: makeId(), content: 'Shipped 5 production PRs reviewed by senior engineers.', visible: true, order: 1 },
        ],
        customFields: {},
      };
    case 'education':
      return {
        id,
        title: 'B.S.',
        subtitle: 'University Name',
        location: 'City, ST',
        startDate: 'Aug 2022',
        endDate: 'May 2026',
        bullets: [],
        customFields: {
          major: 'Electrical and Computer Engineering',
          gpa: '3.8',
          coursework: 'Algorithms, Operating Systems, Databases',
        },
      };
    case 'projects':
      return {
        id,
        title: 'Project Name',
        subtitle: 'React, TypeScript, PostgreSQL',
        startDate: 'Spring 2025',
        bullets: [
          { id: makeId(), content: 'Built a thing that solves a specific user pain point.', visible: true, order: 0 },
          { id: makeId(), content: 'Used by N people across X teams.', visible: true, order: 1 },
        ],
        customFields: { githubUrl: 'github.com/yourname/project' },
        url: 'project-url.example',
      };
    case 'leadership':
      return {
        id,
        title: 'Team Lead',
        subtitle: 'Organization',
        location: 'City, ST',
        startDate: 'Sep 2024',
        endDate: 'Present',
        current: true,
        bullets: [
          { id: makeId(), content: 'Led a team of N people on a multi-month initiative.', visible: true, order: 0 },
        ],
        customFields: {},
      };
    case 'research':
      return {
        id,
        title: 'Undergraduate Researcher',
        subtitle: 'Lab name / PI',
        location: 'University',
        startDate: 'Jan 2025',
        endDate: 'Present',
        current: true,
        bullets: [
          { id: makeId(), content: 'Investigated X using Y methodology, resulting in Z finding.', visible: true, order: 0 },
        ],
        customFields: {},
      };
    case 'awards':
      return {
        id,
        title: 'Award Name',
        subtitle: 'Issuing Organization',
        startDate: '2025',
        bullets: [],
        customFields: {},
      };
    case 'certifications':
      return {
        id,
        title: 'Certification Name',
        subtitle: 'Issuing Body',
        startDate: 'Aug 2025',
        url: 'cert-url.example',
        bullets: [],
        customFields: {},
      };
    case 'publications':
      return {
        id,
        title: 'Publication Title',
        subtitle: 'Author 1, Author 2, Author 3',
        startDate: '2025',
        url: 'doi.org/10.1234/example',
        bullets: [],
        customFields: { venue: 'Journal of Things' },
      };
    case 'skills':
      return { id, title: 'Languages', subtitle: 'Python, TypeScript, Go' };
    case 'summary':
      return {
        id,
        title:
          'Early-career engineer focused on shipping clean code and measurable impact. Strong in backend systems and quick to learn new tools.',
      };
    default:
      return { id, title: 'Sample entry', subtitle: '', bullets: [], customFields: {} };
  }
}
