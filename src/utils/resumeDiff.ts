import type { Resume, Section } from '@/types';

// Lightweight memoization. The diff is pure of (current, next), and resumes
// have a monotonic `updatedAt` we can use as part of the key. Cache misses
// after the resume object identity changes; cache hits when the same diff is
// requested repeatedly (e.g., re-renders of the Compare modal).
const cache = new WeakMap<Resume, WeakMap<Resume, ResumeDiff>>();

function getCached(current: Resume, next: Resume): ResumeDiff | undefined {
  return cache.get(current)?.get(next);
}

function setCached(current: Resume, next: Resume, diff: ResumeDiff): void {
  let inner = cache.get(current);
  if (!inner) {
    inner = new WeakMap();
    cache.set(current, inner);
  }
  inner.set(next, diff);
}

export interface ResumeDiff {
  headerNameChanged: boolean;
  contactsAdded: string[];
  contactsRemoved: string[];
  contactsChanged: number;
  sectionsAdded: { title: string; type: string }[];
  sectionsRemoved: { title: string; type: string }[];
  sectionsChanged: {
    title: string;
    addedEntries: number;
    removedEntries: number;
    changedEntries: number;
    addedBullets: number;
    removedBullets: number;
  }[];
  templateChanged: boolean;
  styleChanges: string[];
}

export function diffResumes(current: Resume, next: Resume): ResumeDiff {
  const cached = getCached(current, next);
  if (cached) return cached;
  const diff: ResumeDiff = {
    headerNameChanged: current.header.name !== next.header.name,
    contactsAdded: [],
    contactsRemoved: [],
    contactsChanged: 0,
    sectionsAdded: [],
    sectionsRemoved: [],
    sectionsChanged: [],
    templateChanged: current.template !== next.template,
    styleChanges: [],
  };

  const curContacts = new Map(current.header.contactFields.map((f) => [f.type + ':' + f.label, f]));
  const nextContacts = new Map(next.header.contactFields.map((f) => [f.type + ':' + f.label, f]));
  for (const [key, field] of nextContacts) {
    const prior = curContacts.get(key);
    if (!prior) diff.contactsAdded.push(`${field.type}${field.value ? ` (${field.value})` : ''}`);
    else if (prior.value !== field.value || prior.visible !== field.visible) diff.contactsChanged += 1;
  }
  for (const [key, field] of curContacts) {
    if (!nextContacts.has(key)) diff.contactsRemoved.push(`${field.type}${field.value ? ` (${field.value})` : ''}`);
  }

  const curSections = new Map(current.sections.map((s) => [s.id, s]));
  const nextSections = new Map(next.sections.map((s) => [s.id, s]));
  for (const [id, section] of nextSections) {
    const prior = curSections.get(id);
    if (!prior) {
      diff.sectionsAdded.push({ title: section.title, type: section.type });
      continue;
    }
    const changes = diffSection(prior, section);
    if (
      changes.addedEntries +
        changes.removedEntries +
        changes.changedEntries +
        changes.addedBullets +
        changes.removedBullets >
      0
    ) {
      diff.sectionsChanged.push({ title: section.title, ...changes });
    }
  }
  for (const [id, section] of curSections) {
    if (!nextSections.has(id)) {
      diff.sectionsRemoved.push({ title: section.title, type: section.type });
    }
  }

  // Style spot-check
  const curStyles = current.styles;
  const nextStyles = next.styles;
  if (curStyles.font !== nextStyles.font) diff.styleChanges.push(`Font: ${curStyles.font} → ${nextStyles.font}`);
  if (JSON.stringify(curStyles.margins) !== JSON.stringify(nextStyles.margins)) {
    diff.styleChanges.push('Margins changed');
  }
  if (JSON.stringify(curStyles.fontSize) !== JSON.stringify(nextStyles.fontSize)) {
    diff.styleChanges.push('Font sizes changed');
  }
  if (JSON.stringify(curStyles.colors) !== JSON.stringify(nextStyles.colors)) {
    diff.styleChanges.push('Colors changed');
  }
  if (JSON.stringify(curStyles.spacing) !== JSON.stringify(nextStyles.spacing)) {
    diff.styleChanges.push('Spacing changed');
  }
  setCached(current, next, diff);
  return diff;
}

function diffSection(prior: Section, next: Section) {
  const priorEntries = new Map(prior.entries.map((e) => [e.id, e]));
  const nextEntries = new Map(next.entries.map((e) => [e.id, e]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  let addedBullets = 0;
  let removedBullets = 0;

  for (const [id, entry] of nextEntries) {
    const p = priorEntries.get(id);
    if (!p) {
      added += 1;
      addedBullets += entry.bullets?.length ?? 0;
      continue;
    }
    if (JSON.stringify({ ...p, bullets: undefined }) !== JSON.stringify({ ...entry, bullets: undefined })) {
      changed += 1;
    }
    const priorBulletIds = new Set(p.bullets?.map((b) => b.id));
    const nextBulletIds = new Set(entry.bullets?.map((b) => b.id));
    for (const bid of nextBulletIds) if (!priorBulletIds.has(bid)) addedBullets += 1;
    for (const bid of priorBulletIds) if (!nextBulletIds.has(bid)) removedBullets += 1;
  }
  for (const id of priorEntries.keys()) {
    if (!nextEntries.has(id)) {
      removed += 1;
      removedBullets += priorEntries.get(id)?.bullets?.length ?? 0;
    }
  }
  return { addedEntries: added, removedEntries: removed, changedEntries: changed, addedBullets, removedBullets };
}

export function diffIsNoop(diff: ResumeDiff): boolean {
  return (
    !diff.headerNameChanged &&
    diff.contactsAdded.length === 0 &&
    diff.contactsRemoved.length === 0 &&
    diff.contactsChanged === 0 &&
    diff.sectionsAdded.length === 0 &&
    diff.sectionsRemoved.length === 0 &&
    diff.sectionsChanged.length === 0 &&
    !diff.templateChanged &&
    diff.styleChanges.length === 0
  );
}
