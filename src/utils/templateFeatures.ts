import type { Resume, Section } from '@/types';
import { getTemplate, type TemplateFeatures } from '@/components/templates/registry';

export function templateFeatures(templateId: Resume['template']): TemplateFeatures {
  return getTemplate(templateId).features;
}

export function headerAlignFor(resume: Resume): TemplateFeatures['headerAlign'] {
  return templateFeatures(resume.template).headerAlign;
}

export function isTwoColumnLayout(resume: Resume): boolean {
  return templateFeatures(resume.template).layout === 'two-column';
}

export interface LayoutSections {
  fullWidth: Section[];
  left: Section[];
  right: Section[];
  single: Section[];
}

export function splitSectionsForLayout(resume: Resume, sections: Section[]): LayoutSections {
  if (!isTwoColumnLayout(resume)) {
    return { fullWidth: [], left: [], right: [], single: sections };
  }

  const fullWidth: Section[] = [];
  const left: Section[] = [];
  const right: Section[] = [];

  for (const section of sections) {
    if (section.type === 'page-break' || section.type === 'summary') {
      fullWidth.push(section);
    } else if (section.column === 'left') {
      left.push(section);
    } else if (section.column === 'right') {
      right.push(section);
    } else {
      right.push(section);
    }
  }

  return { fullWidth, left, right, single: [] };
}
