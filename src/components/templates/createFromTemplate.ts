import type { Entry, Resume, SectionType, TemplateId } from '@/types';
import { makeId } from '@/utils/id';
import { defaultLabelForContactType } from '@/utils/contactIcon';
import { getTemplate } from './registry';

// Pre-seeded entries for templates that have a sensible default starting point.
// Today only McCombs seeds an Education entry with the Undeclared Business
// track so new students don't stare at an empty section.
function seedEntriesFor(templateId: TemplateId, sectionType: SectionType): Entry[] {
  if (templateId === 'mccombs' && sectionType === 'education') {
    return [
      {
        id: makeId(),
        title: 'BBA',
        subtitle: 'The University of Texas at Austin',
        location: 'Austin, TX',
        startDate: '',
        endDate: '',
        bullets: [],
        customFields: {
          mccombsTrack: 'undeclared',
          major: 'Undeclared Business',
          gpa: '',
        },
      },
    ];
  }
  return [];
}

export function createResumeFromTemplate(templateId: TemplateId): Resume {
  const tpl = getTemplate(templateId);
  const now = new Date().toISOString();

  return {
    id: makeId(),
    name: 'Untitled Resume',
    createdAt: now,
    updatedAt: now,
    template: templateId,
    header: {
      name: '',
      separatorStyle: '|',
      contactFields: tpl.defaultContactFields.map((type, i) => ({
        id: makeId(),
        type,
        value: '',
        label: defaultLabelForContactType(type),
        visible: true,
        order: i,
      })),
    },
    sections: tpl.defaultSections.map((seed, i) => ({
      id: makeId(),
      type: seed.type,
      title: seed.title,
      visible: true,
      order: i,
      layout: seed.type === 'skills' ? 'skills-grid' : 'entry-based',
      entries: seedEntriesFor(templateId, seed.type),
    })),
    styles: tpl.styles,
  };
}

// Non-destructive template switch (SPEC §4.2):
// applies the new template's styles + section ordering preference, but preserves
// existing user content (header values, entries, bullets, contact fields).
export function applyTemplate(resume: Resume, templateId: TemplateId): Resume {
  const tpl = getTemplate(templateId);

  // Reorder existing sections to match new template's preferred order.
  // Sections present in the resume but not the template keep their relative order at the end.
  const tplOrder = tpl.defaultSections.map((s) => s.type);
  const sorted = [...resume.sections].sort((a, b) => {
    const ai = tplOrder.indexOf(a.type);
    const bi = tplOrder.indexOf(b.type);
    if (ai === -1 && bi === -1) return a.order - b.order;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return {
    ...resume,
    template: templateId,
    styles: tpl.styles,
    sections: sorted.map((s, i) => ({ ...s, order: i })),
    updatedAt: new Date().toISOString(),
  };
}
