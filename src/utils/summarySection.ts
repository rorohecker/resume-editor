import type { Section } from '@/types';
import { makeId } from '@/utils/id';

export function upsertSummarySection(
  sections: Section[],
  summaryText: string,
  title = 'Summary',
): Section[] {
  const existing = sections.find((section) => section.type === 'summary');
  if (existing) {
    return sections.map((section) =>
      section.id === existing.id
        ? {
            ...section,
            visible: true,
            entries: [
              {
                id: existing.entries[0]?.id ?? makeId(),
                title: summaryText,
              },
            ],
          }
        : section,
    );
  }

  return [
    {
      id: makeId(),
      type: 'summary',
      title,
      visible: true,
      order: 0,
      layout: 'text-block',
      entries: [{ id: makeId(), title: summaryText }],
    },
    ...sections.map((section) => ({ ...section, order: section.order + 1 })),
  ];
}
