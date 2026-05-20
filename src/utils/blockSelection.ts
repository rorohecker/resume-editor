import type { Bullet, Entry, Resume, Section } from '@/types';
import { estimatePageUsage } from './styleChecks';

// Block selection: given a resume with many entries/bullets (the "master"),
// pick a subset that fits a target page count.
//
// We work directly on visibility flags rather than copying the resume. The
// caller can then apply the visibility map to either a clone (variant) or to
// the source resume directly (in-place curation).

export interface VisibilityMap {
  entries: Record<string, boolean>;
  bullets: Record<string, boolean>;
}

export interface BlockScore {
  entryId: string;
  bulletId?: string;
  score: number; // higher = more relevant
  reason?: string;
}

export interface FitResult {
  visibility: VisibilityMap;
  estimatedUsage: number; // % of one page used
  includedEntries: number;
  includedBullets: number;
  excludedEntries: number;
  excludedBullets: number;
}

export function buildVisibilityFrom(resume: Resume): VisibilityMap {
  const entries: Record<string, boolean> = {};
  const bullets: Record<string, boolean> = {};
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      entries[entry.id] = entry.visible !== false;
      for (const bullet of entry.bullets ?? []) {
        bullets[bullet.id] = bullet.visible;
      }
    }
  }
  return { entries, bullets };
}

export function applyVisibility(resume: Resume, visibility: VisibilityMap): Resume {
  return {
    ...resume,
    sections: resume.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => ({
        ...entry,
        visible: visibility.entries[entry.id] ?? true,
        bullets: entry.bullets?.map((bullet) => ({
          ...bullet,
          visible: visibility.bullets[bullet.id] ?? true,
        })),
      })),
    })),
  };
}

// Take a scored ranking of bullets and entries and toggle visibility on/off
// greedily until the estimated page usage reaches the target threshold.
export function fitToPages(
  resume: Resume,
  scores: BlockScore[],
  options: { maxPages?: number; targetUsage?: number } = {},
): FitResult {
  const target = options.targetUsage ?? 95;
  const maxPages = options.maxPages ?? 1;
  const cap = target * maxPages;

  // Start with everything hidden, then turn things on in score order until we
  // approach the page cap.
  const visibility: VisibilityMap = { entries: {}, bullets: {} };
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      visibility.entries[entry.id] = false;
      for (const bullet of entry.bullets ?? []) visibility.bullets[bullet.id] = false;
    }
  }

  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const lookupEntryParent = new Map<string, string>(); // bulletId → entryId
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      for (const bullet of entry.bullets ?? []) lookupEntryParent.set(bullet.id, entry.id);
    }
  }

  for (const score of sorted) {
    // Always include the entry when including any of its bullets.
    if (score.bulletId) {
      const parent = lookupEntryParent.get(score.bulletId);
      if (parent) visibility.entries[parent] = true;
      visibility.bullets[score.bulletId] = true;
    } else {
      visibility.entries[score.entryId] = true;
    }

    const probe = applyVisibility(resume, visibility);
    const usage = estimatePageUsage(probe);
    if (usage >= cap) {
      // Last addition tipped us over — undo it and stop.
      if (score.bulletId) visibility.bullets[score.bulletId] = false;
      else visibility.entries[score.entryId] = false;
      break;
    }
  }

  // Tally
  let includedEntries = 0;
  let excludedEntries = 0;
  for (const v of Object.values(visibility.entries)) v ? includedEntries++ : excludedEntries++;
  let includedBullets = 0;
  let excludedBullets = 0;
  for (const v of Object.values(visibility.bullets)) v ? includedBullets++ : excludedBullets++;

  return {
    visibility,
    estimatedUsage: estimatePageUsage(applyVisibility(resume, visibility)),
    includedEntries,
    includedBullets,
    excludedEntries,
    excludedBullets,
  };
}

// Heuristic scoring without an AI call: rank by recency, length, and keyword
// overlap with the job description.
export function localScoreBlocks(resume: Resume, jobDescription: string): BlockScore[] {
  const jdLower = jobDescription.toLowerCase();
  const jdTokens = new Set(jdLower.match(/[a-z][a-z0-9+#.]{2,}/g) ?? []);
  const scores: BlockScore[] = [];

  for (const section of resume.sections) {
    for (const entry of section.entries) {
      const entryText = [entry.title, entry.subtitle, entry.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const recency = entry.current ? 5 : recencyScore(entry);
      const overlap = tokenOverlap(entryText, jdTokens);
      const entryScore = recency + overlap * 2;
      scores.push({ entryId: entry.id, score: entryScore });

      for (const bullet of entry.bullets ?? []) {
        const bulletText = bullet.content.replace(/<[^>]*>/g, '').toLowerCase();
        const bulletOverlap = tokenOverlap(bulletText, jdTokens);
        const hasMetric = /\d|%|\$/.test(bulletText) ? 1 : 0;
        const tagBoost = matchTagBoost(bullet.tags, jdLower);
        scores.push({
          entryId: entry.id,
          bulletId: bullet.id,
          score: bulletOverlap * 3 + recency + hasMetric + tagBoost,
        });
      }
    }
  }
  return scores;
}

function tokenOverlap(text: string, tokens: Set<string>): number {
  const textTokens = new Set(text.match(/[a-z][a-z0-9+#.]{2,}/g) ?? []);
  let count = 0;
  for (const t of textTokens) if (tokens.has(t)) count += 1;
  return count;
}

function matchTagBoost(tags: string[] | undefined, jdLower: string): number {
  if (!tags || tags.length === 0) return 0;
  return tags.reduce((acc, tag) => (jdLower.includes(tag.toLowerCase()) ? acc + 2 : acc), 0);
}

function recencyScore(entry: Entry): number {
  if (entry.current) return 5;
  const year = (entry.endDate ?? entry.startDate ?? '').match(/\b(19|20)\d{2}\b/)?.[0];
  if (!year) return 0;
  const yearsAgo = new Date().getFullYear() - Number(year);
  if (yearsAgo <= 1) return 4;
  if (yearsAgo <= 3) return 3;
  if (yearsAgo <= 5) return 2;
  return 1;
}

// Collect every entry + bullet in the resume for UI listing in the library.
export function listAllBlocks(resume: Resume): {
  entries: { section: Section; entry: Entry }[];
  bullets: { section: Section; entry: Entry; bullet: Bullet }[];
} {
  const entries: { section: Section; entry: Entry }[] = [];
  const bullets: { section: Section; entry: Entry; bullet: Bullet }[] = [];
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      entries.push({ section, entry });
      for (const bullet of entry.bullets ?? []) bullets.push({ section, entry, bullet });
    }
  }
  return { entries, bullets };
}

export function allTagsIn(resume: Resume): string[] {
  const all = new Set<string>();
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      for (const tag of entry.tags ?? []) all.add(tag);
      for (const bullet of entry.bullets ?? []) for (const tag of bullet.tags ?? []) all.add(tag);
    }
  }
  return Array.from(all).sort();
}
