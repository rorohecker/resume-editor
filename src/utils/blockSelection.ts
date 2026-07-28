import type { Bullet, Entry, Resume, Section } from '@/types';
import { estimatePageUsage } from './styleChecks';
import { stripHtml } from './resumeText';

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
  classId?: string;
  score: number; // higher = more relevant
  reason?: string;
}

export interface ClassBlock {
  section: Section;
  entry: Entry;
  fieldKey: string;
  classId: string;
  label: string;
  value: string;
  index: number;
}

export interface FitResult {
  visibility: VisibilityMap;
  estimatedUsage: number; // % of one page used
  includedEntries: number;
  includedBullets: number;
  excludedEntries: number;
  excludedBullets: number;
  /** Adaptive score floor used during packing (for UI/debug). */
  minScoreUsed: number;
}

export interface FitOptions {
  maxPages?: number;
  /** Percent of one page to fill before stopping (multiplied by maxPages). Default 80. */
  targetUsage?: number;
  /**
   * Absolute score floor. When omitted, computed adaptively so weak mid-scores
   * do not fill the page. Pass 0 to disable the floor (tests / force-fill).
   */
  minScore?: number;
  /** Max bullets kept per experience-like entry. Default 4. */
  maxBulletsPerEntry?: number;
  /**
   * How aggressively to cull.
   * - strict: ~75% page, higher floor, max 3 bullets/role
   * - balanced (default): ~80% page, adaptive floor, max 4
   * - generous: ~90% page, softer floor, max 6
   */
  selectivity?: 'strict' | 'balanced' | 'generous';
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

const SELECTIVITY_PRESETS: Record<
  NonNullable<FitOptions['selectivity']>,
  { targetUsage: number; maxBulletsPerEntry: number; floorBias: number }
> = {
  strict: { targetUsage: 75, maxBulletsPerEntry: 3, floorBias: 0.15 },
  balanced: { targetUsage: 80, maxBulletsPerEntry: 4, floorBias: 0 },
  generous: { targetUsage: 90, maxBulletsPerEntry: 6, floorBias: -0.1 },
};

/**
 * Adaptive score floor so mid-clustered AI scores (everything ~6–8) still cull.
 * Works for both 0–10 AI scores and wider local heuristic scores.
 */
export function adaptiveMinScore(
  scores: BlockScore[],
  selectivity: NonNullable<FitOptions['selectivity']> = 'balanced',
): number {
  const values = scores.map((s) => s.score).filter((n) => Number.isFinite(n));
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const max = sorted[sorted.length - 1]!;
  const min = sorted[0]!;
  const bias = SELECTIVITY_PRESETS[selectivity].floorBias;

  // 0–10-ish AI scale: require clear relevance (≈5.5+ on balanced).
  if (max <= 10.5) {
    const base = selectivity === 'strict' ? 6.5 : selectivity === 'generous' ? 4.5 : 5.5;
    return Math.min(max, Math.max(0, base + bias * 10));
  }

  // Wider local scores: keep roughly the top half by percentile.
  const pct = selectivity === 'strict' ? 0.62 : selectivity === 'generous' ? 0.4 : 0.52;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * (pct + bias)));
  const fromPct = sorted[Math.max(0, idx)]!;
  // Also require at least ~45% of the max score so weak recent bullets don't dominate.
  const fromMax = max * (selectivity === 'strict' ? 0.55 : selectivity === 'generous' ? 0.35 : 0.45);
  return Math.max(min, Math.min(max, Math.max(fromPct, fromMax)));
}

// Take a scored ranking of bullets and entries and toggle visibility on/off
// greedily until the estimated page usage reaches the target threshold.
export function fitToPages(
  resume: Resume,
  scores: BlockScore[],
  options: FitOptions = {},
): FitResult {
  const selectivity = options.selectivity ?? 'balanced';
  const preset = SELECTIVITY_PRESETS[selectivity];
  const target = options.targetUsage ?? preset.targetUsage;
  const maxPages = options.maxPages ?? 1;
  const cap = target * maxPages;
  const maxBulletsPerEntry = options.maxBulletsPerEntry ?? preset.maxBulletsPerEntry;
  const minScore =
    options.minScore !== undefined ? options.minScore : adaptiveMinScore(scores, selectivity);

  const visibility: VisibilityMap = { entries: {}, bullets: {} };
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      visibility.entries[entry.id] = false;
      for (const bullet of entry.bullets ?? []) visibility.bullets[bullet.id] = false;
    }
  }

  const lookupEntryParent = new Map<string, string>();
  const bulletContent = new Map<string, string>();
  const entryRecord = new Map<
    string,
    {
      hasSubtitle: boolean;
      needsBullets: boolean;
      bullets: Bullet[];
      sectionType: Section['type'];
    }
  >();
  const bulletsIncluded = new Map<string, number>();

  for (const section of resume.sections) {
    const needsBullets =
      section.type === 'experience' ||
      section.type === 'projects' ||
      section.type === 'leadership' ||
      section.type === 'research';
    for (const entry of section.entries) {
      entryRecord.set(entry.id, {
        hasSubtitle: Boolean(entry.subtitle || entry.location),
        needsBullets,
        bullets: entry.bullets ?? [],
        sectionType: section.type,
      });
      bulletsIncluded.set(entry.id, 0);
      for (const bullet of entry.bullets ?? []) {
        lookupEntryParent.set(bullet.id, entry.id);
        bulletContent.set(bullet.id, bullet.content);
      }
    }
  }

  // Per-bullet score lookup for score-aware attachment.
  const bulletScoreById = new Map<string, number>();
  for (const score of scores) {
    if (score.bulletId) {
      const prev = bulletScoreById.get(score.bulletId);
      if (prev === undefined || score.score > prev) bulletScoreById.set(score.bulletId, score.score);
    }
  }

  const baseUsage = estimatePageUsage(applyVisibility(resume, visibility));
  let usage = baseUsage;

  const pageHeightIn = resume.styles.paperSize === 'a4' ? 11.69 : 11;
  const usableIn = Math.max(
    1,
    pageHeightIn - resume.styles.margins.top - resume.styles.margins.bottom,
  );
  const usablePt = usableIn * 72;
  const pageWidthIn = resume.styles.paperSize === 'a4' ? 8.27 : 8.5;
  const contentWidthPt = Math.max(
    72,
    pageWidthIn * 72 -
      (resume.styles.margins.left + resume.styles.margins.right) * 72,
  );
  const charsPerLine = Math.max(
    8,
    Math.floor(contentWidthPt / (resume.styles.fontSize.body * 0.5)),
  );
  const lineCost =
    ((resume.styles.fontSize.body * resume.styles.spacing.bullet) / usablePt) * 100;

  const entryCost = (id: string): number => {
    const rec = entryRecord.get(id);
    if (!rec) return lineCost;
    const titleCost =
      ((resume.styles.fontSize.entryTitle * resume.styles.spacing.bullet) / usablePt) * 100;
    // Slightly overestimate so packing stays under real page usage.
    return (
      titleCost * 1.15 +
      (rec.hasSubtitle ? lineCost : 0) +
      (resume.styles.spacing.entry / usablePt) * 100 +
      // Section header amortized lightly when first entry of a section appears —
      // approximated as a small constant so we don't under-count headers.
      lineCost * 0.35
    );
  };

  const bulletCost = (bulletId: string): number => {
    const plain = stripHtml(bulletContent.get(bulletId) ?? '');
    const lines = Math.max(1, Math.ceil(Math.max(plain.length, 1) / Math.max(8, charsPerLine - 2)));
    // 1.25× so wrapped bullets don't overfill vs the real estimator.
    return lines * lineCost * 1.25;
  };

  const rankedBulletsFor = (entryId: string): Bullet[] => {
    const rec = entryRecord.get(entryId);
    if (!rec) return [];
    return [...rec.bullets].sort((a, b) => {
      const sa = bulletScoreById.get(a.id) ?? (a.visible ? 1 : 0);
      const sb = bulletScoreById.get(b.id) ?? (b.visible ? 1 : 0);
      return sb - sa;
    });
  };

  const eligible = scores.filter((s) => s.score >= minScore);
  const sorted = [...eligible].sort((a, b) => b.score - a.score);

  for (const score of sorted) {
    if (score.bulletId) {
      if (!lookupEntryParent.has(score.bulletId)) continue;
      if (visibility.bullets[score.bulletId]) continue;
      const parent = lookupEntryParent.get(score.bulletId)!;
      const already = bulletsIncluded.get(parent) ?? 0;
      if (already >= maxBulletsPerEntry) continue;

      let costDelta = 0;
      if (!visibility.entries[parent]) costDelta += entryCost(parent);
      costDelta += bulletCost(score.bulletId);
      if (usage + costDelta >= cap) continue;

      visibility.entries[parent] = true;
      visibility.bullets[score.bulletId] = true;
      bulletsIncluded.set(parent, already + 1);
      usage += costDelta;
    } else {
      if (!entryRecord.has(score.entryId)) continue;
      if (visibility.entries[score.entryId]) continue;
      const rec = entryRecord.get(score.entryId)!;

      // Experience-like: never pack a naked shell. Attach only top-scoring
      // bullets that also clear the floor (or the single best if none do).
      if (rec.needsBullets && rec.bullets.length > 0) {
        const ranked = rankedBulletsFor(score.entryId).filter((b) => !visibility.bullets[b.id]);
        const strong = ranked.filter((b) => (bulletScoreById.get(b.id) ?? 0) >= minScore);
        const attachPool = (strong.length > 0 ? strong : ranked.slice(0, 1)).slice(
          0,
          Math.min(2, maxBulletsPerEntry),
        );

        let costDelta = entryCost(score.entryId);
        const accepted: string[] = [];
        for (const bullet of attachPool) {
          const next = costDelta + bulletCost(bullet.id);
          if (usage + next >= cap) break;
          costDelta = next;
          accepted.push(bullet.id);
        }
        if (accepted.length === 0) continue;
        visibility.entries[score.entryId] = true;
        for (const id of accepted) {
          visibility.bullets[id] = true;
          bulletsIncluded.set(score.entryId, (bulletsIncluded.get(score.entryId) ?? 0) + 1);
        }
        usage += costDelta;
      } else {
        // Education / skills / awards: still require the floor.
        const costDelta = entryCost(score.entryId);
        if (usage + costDelta >= cap) continue;
        visibility.entries[score.entryId] = true;
        usage += costDelta;
      }
    }
  }

  // Ensure included experience entries aren't empty shells (one best bullet only).
  for (const section of resume.sections) {
    const needsBullets =
      section.type === 'experience' ||
      section.type === 'projects' ||
      section.type === 'leadership' ||
      section.type === 'research';
    if (!needsBullets) continue;
    for (const entry of section.entries) {
      if (!visibility.entries[entry.id]) continue;
      const bullets = entry.bullets ?? [];
      if (bullets.length === 0) continue;
      const anyVisible = bullets.some((bullet) => visibility.bullets[bullet.id]);
      if (anyVisible) continue;
      const best = rankedBulletsFor(entry.id)[0];
      if (best && usage + bulletCost(best.id) < cap) {
        visibility.bullets[best.id] = true;
        usage += bulletCost(best.id);
        bulletsIncluded.set(entry.id, 1);
      } else {
        visibility.entries[entry.id] = false;
      }
    }
  }

  // Last resort: force one highest-scoring eligible (or overall) block.
  if (
    Object.values(visibility.entries).every((v) => !v) &&
    Object.values(visibility.bullets).every((v) => !v) &&
    scores.length > 0
  ) {
    const fallback = [...scores].sort((a, b) => b.score - a.score);
    for (const score of fallback) {
      if (score.bulletId) {
        const parent = lookupEntryParent.get(score.bulletId);
        if (!parent || !entryRecord.has(parent)) continue;
        visibility.entries[parent] = true;
        visibility.bullets[score.bulletId] = true;
        break;
      }
      if (!entryRecord.has(score.entryId)) continue;
      const rec = entryRecord.get(score.entryId)!;
      visibility.entries[score.entryId] = true;
      if (rec.needsBullets && rec.bullets.length > 0) {
        const first = rankedBulletsFor(score.entryId)[0];
        if (first) visibility.bullets[first.id] = true;
        else visibility.entries[score.entryId] = false;
      }
      if (visibility.entries[score.entryId]) break;
    }
  }

  // Strip dangling experience shells.
  for (const section of resume.sections) {
    if (
      section.type === 'experience' ||
      section.type === 'projects' ||
      section.type === 'leadership' ||
      section.type === 'research'
    ) {
      for (const entry of section.entries) {
        if (!visibility.entries[entry.id]) continue;
        const hasAnyVisibleBullet = (entry.bullets ?? []).some((bullet) => visibility.bullets[bullet.id]);
        if (!hasAnyVisibleBullet && (entry.bullets?.length ?? 0) > 0) {
          visibility.entries[entry.id] = false;
        }
      }
    }
  }

  let includedEntries = 0;
  let excludedEntries = 0;
  for (const v of Object.values(visibility.entries)) {
    if (v) includedEntries += 1;
    else excludedEntries += 1;
  }
  let includedBullets = 0;
  let excludedBullets = 0;
  for (const v of Object.values(visibility.bullets)) {
    if (v) includedBullets += 1;
    else excludedBullets += 1;
  }

  return {
    visibility,
    estimatedUsage: estimatePageUsage(applyVisibility(resume, visibility)),
    includedEntries,
    includedBullets,
    excludedEntries,
    excludedBullets,
    minScoreUsed: minScore,
  };
}

/**
 * Heuristic scoring without an AI call.
 * Normalized roughly to a 0–10 scale so fitToPages floors behave the same.
 */
export function localScoreBlocks(resume: Resume, jobDescription: string): BlockScore[] {
  const jdLower = jobDescription.toLowerCase();
  const jdTokens = new Set(jdLower.match(/[a-z][a-z0-9+#.]{2,}/g) ?? []);
  const stop = new Set([
    'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'this', 'that',
    'from', 'have', 'has', 'been', 'were', 'was', 'able', 'into', 'about', 'over',
  ]);
  const meaningful = new Set([...jdTokens].filter((t) => !stop.has(t) && t.length > 2));
  const scores: BlockScore[] = [];

  for (const section of resume.sections) {
    for (const entry of section.entries) {
      const entryText = [entry.title, entry.subtitle, entry.location]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const recency = entry.current ? 2 : recencyScore(entry) * 0.4;
      const overlap = tokenOverlap(entryText, meaningful);
      // 0–10-ish: keyword overlap dominates; recency is a light tie-breaker.
      const entryScore = Math.min(10, overlap * 2.2 + recency);
      scores.push({ entryId: entry.id, score: entryScore });

      for (const bullet of entry.bullets ?? []) {
        const bulletText = stripHtml(bullet.content).toLowerCase();
        const bulletOverlap = tokenOverlap(bulletText, meaningful);
        const hasMetric = /\d|%|\$/.test(bulletText) ? 0.6 : 0;
        const tagBoost = matchTagBoost(bullet.tags, jdLower);
        const bulletScore = Math.min(
          10,
          bulletOverlap * 2.8 + recency + hasMetric + tagBoost,
        );
        scores.push({
          entryId: entry.id,
          bulletId: bullet.id,
          score: bulletScore,
        });
      }

      for (const classBlock of classBlocksForEntry(section, entry)) {
        const classText = [section.title, entry.title, entry.subtitle, classBlock.label, classBlock.value]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        const classOverlap = tokenOverlap(classText, meaningful);
        const tagBoost = matchTagBoost(entry.tags, jdLower);
        scores.push({
          entryId: entry.id,
          classId: classBlock.classId,
          score: Math.min(10, classOverlap * 2.8 + tagBoost),
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
  return tags.reduce((acc, tag) => (jdLower.includes(tag.toLowerCase()) ? acc + 1.5 : acc), 0);
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

export function listAllBlocks(resume: Resume): {
  entries: { section: Section; entry: Entry }[];
  bullets: { section: Section; entry: Entry; bullet: Bullet }[];
  classes: ClassBlock[];
} {
  const entries: { section: Section; entry: Entry }[] = [];
  const bullets: { section: Section; entry: Entry; bullet: Bullet }[] = [];
  const classes: ClassBlock[] = [];
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      entries.push({ section, entry });
      for (const bullet of entry.bullets ?? []) bullets.push({ section, entry, bullet });
      classes.push(...classBlocksForEntry(section, entry));
    }
  }
  return { entries, bullets, classes };
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

const CLASS_FIELD_LABELS: Record<string, string> = {
  coursework: 'Coursework',
  additionalCoursework: 'Additional coursework',
};

export const CLASS_BLOCK_FIELD_KEYS = Object.keys(CLASS_FIELD_LABELS);

export function classBlocksForEntry(section: Section, entry: Entry): ClassBlock[] {
  if (section.type !== 'education' && section.type !== 'study-abroad') return [];
  const out: ClassBlock[] = [];
  for (const fieldKey of CLASS_BLOCK_FIELD_KEYS) {
    const value = entry.customFields?.[fieldKey];
    if (!value?.trim()) continue;
    splitClassList(value).forEach((item, index) => {
      out.push({
        section,
        entry,
        fieldKey,
        classId: classBlockId(entry.id, fieldKey, index, item),
        label: CLASS_FIELD_LABELS[fieldKey] ?? 'Class',
        value: item,
        index,
      });
    });
  }
  return out;
}

export function splitClassList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function classBlockId(entryId: string, fieldKey: string, index: number, value: string): string {
  return `class:${entryId}:${fieldKey}:${index}:${slugForClass(value)}`;
}

function slugForClass(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return slug || 'class';
}
