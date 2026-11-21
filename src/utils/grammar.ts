// LanguageTool integration — free public API at languagetool.org/api. CORS
// enabled. Rate-limited but generous enough for casual use. No key required.
// We also run a local spelling pass so users get instant feedback offline and
// when the public API is unreachable.

const LANGUAGE_TOOL_URL = 'https://api.languagetool.org/v2/check';
const MAX_CONCURRENT = 3;
const MIN_TEXT_LENGTH = 3;

export type GrammarCategory = 'spelling' | 'grammar' | 'style' | 'other';

export interface GrammarHit {
  bulletId: string;
  bulletLabel: string;
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  context: string;
  replacements: string[];
  rule: string;
  category: GrammarCategory;
  /** Section / entry / bullet ids for jump-to-edit. */
  sectionId?: string;
  entryId?: string;
  source: 'languagetool' | 'local';
}

export interface GrammarSnippet {
  bulletId: string;
  bulletLabel: string;
  content: string;
  sectionId?: string;
  entryId?: string;
}

export class GrammarCheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrammarCheckError';
  }
}

interface RawMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  context?: { text: string; offset: number; length: number };
  replacements: { value: string }[];
  rule?: {
    id?: string;
    issueType?: string;
    category?: { id?: string; name?: string };
  };
}

/** Common resume / professional typos — offline spelling safety net. */
const LOCAL_SPELLINGS: Array<{ wrong: RegExp; fix: string; message: string }> = [
  { wrong: /\brecieve(d|s|r)?\b/gi, fix: 'receive$1', message: 'Possible misspelling of “receive”.' },
  { wrong: /\bseperate(d|ly|s)?\b/gi, fix: 'separate$1', message: 'Possible misspelling of “separate”.' },
  { wrong: /\boccured\b/gi, fix: 'occurred', message: 'Possible misspelling of “occurred”.' },
  { wrong: /\baccomodat(e|ed|ing|ion)\b/gi, fix: 'accommodat$1', message: 'Possible misspelling of “accommodate”.' },
  { wrong: /\bdefinately\b/gi, fix: 'definitely', message: 'Possible misspelling of “definitely”.' },
  { wrong: /\bmanagment\b/gi, fix: 'management', message: 'Possible misspelling of “management”.' },
  { wrong: /\bacheiv(e|ed|ement|ements)\b/gi, fix: 'achiev$1', message: 'Possible misspelling of “achieve”.' },
  { wrong: /\bexperiance(d|s)?\b/gi, fix: 'experience$1', message: 'Possible misspelling of “experience”.' },
  { wrong: /\bresponsabilit(y|ies)\b/gi, fix: 'responsibilit$1', message: 'Possible misspelling of “responsibility”.' },
  { wrong: /\bledership\b/gi, fix: 'leadership', message: 'Possible misspelling of “leadership”.' },
  { wrong: /\bsuccesful(ly)?\b/gi, fix: 'successful$1', message: 'Possible misspelling of “successful”.' },
  { wrong: /\bcomunicat(e|ed|ion|ions)\b/gi, fix: 'communicat$1', message: 'Possible misspelling of “communicate”.' },
  { wrong: /\bteh\b/gi, fix: 'the', message: 'Possible misspelling of “the”.' },
  { wrong: /\badn\b/gi, fix: 'and', message: 'Possible misspelling of “and”.' },
  { wrong: /\bwrok(ed|ing)?\b/gi, fix: 'work$1', message: 'Possible misspelling of “work”.' },
  { wrong: /\bprojcet(s)?\b/gi, fix: 'project$1', message: 'Possible misspelling of “project”.' },
  { wrong: /\bdevelopement\b/gi, fix: 'development', message: 'Possible misspelling of “development”.' },
  { wrong: /\benviroment(s)?\b/gi, fix: 'environment$1', message: 'Possible misspelling of “environment”.' },
  { wrong: /\bperfomance\b/gi, fix: 'performance', message: 'Possible misspelling of “performance”.' },
  { wrong: /\brecomend(ed|ation|ations)?\b/gi, fix: 'recommend$1', message: 'Possible misspelling of “recommend”.' },
  { wrong: /\bcolaborate(d|s)?\b/gi, fix: 'collaborate$1', message: 'Possible misspelling of “collaborate”.' },
  { wrong: /\bimpliment(ed|ing|ation)?\b/gi, fix: 'implement$1', message: 'Possible misspelling of “implement”.' },
  { wrong: /\bmaintainance\b/gi, fix: 'maintenance', message: 'Possible misspelling of “maintenance”.' },
  { wrong: /\bdependant\b/gi, fix: 'dependent', message: 'In American English prefer “dependent” (adjective).' },
  { wrong: /\bneccessary\b/gi, fix: 'necessary', message: 'Possible misspelling of “necessary”.' },
  { wrong: /\boccassion(al|ally|s)?\b/gi, fix: 'occasion$1', message: 'Possible misspelling of “occasion”.' },
  { wrong: /\bpriviledge(d|s)?\b/gi, fix: 'privilege$1', message: 'Possible misspelling of “privilege”.' },
  { wrong: /\bscheduel(ed|ing|s)?\b/gi, fix: 'schedule$1', message: 'Possible misspelling of “schedule”.' },
  { wrong: /\bstrenghten(ed|ing)?\b/gi, fix: 'strengthen$1', message: 'Possible misspelling of “strengthen”.' },
  { wrong: /\bthier\b/gi, fix: 'their', message: 'Possible misspelling of “their”.' },
  { wrong: /\bwether\b/gi, fix: 'whether', message: 'Possible misspelling of “whether”.' },
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function categorizeRule(rule?: RawMatch['rule']): GrammarCategory {
  const issue = (rule?.issueType ?? '').toLowerCase();
  const catId = (rule?.category?.id ?? '').toLowerCase();
  const catName = (rule?.category?.name ?? '').toLowerCase();
  const id = (rule?.id ?? '').toLowerCase();
  const blob = `${issue} ${catId} ${catName} ${id}`;
  if (/spell|typo|orthograph|misspell/.test(blob)) return 'spelling';
  if (/style|redundan|clarity|wordiness|plain.?english/.test(blob)) return 'style';
  if (/grammar|punctuat|agreement|tense|article|whitespace|cas/.test(blob)) return 'grammar';
  return 'other';
}

/** Expand capture-group style fixes like receive$1. */
function applyFixTemplate(template: string, match: RegExpMatchArray): string {
  return template.replace(/\$(\d+)/g, (_, n: string) => match[Number(n)] ?? '');
}

export function checkLocalSpelling(snippets: GrammarSnippet[]): GrammarHit[] {
  const hits: GrammarHit[] = [];
  for (const snippet of snippets) {
    const text = stripHtml(snippet.content);
    if (!text || text.length < MIN_TEXT_LENGTH) continue;
    for (const entry of LOCAL_SPELLINGS) {
      if (!entry.message || !entry.fix) continue;
      const re = new RegExp(entry.wrong.source, entry.wrong.flags.includes('g') ? entry.wrong.flags : `${entry.wrong.flags}g`);
      let match: RegExpExecArray | null;
      while ((match = re.exec(text)) !== null) {
        const wrong = match[0];
        const fix = applyFixTemplate(entry.fix, match);
        if (!fix || fix.toLowerCase() === wrong.toLowerCase()) continue;
        hits.push({
          bulletId: snippet.bulletId,
          bulletLabel: snippet.bulletLabel,
          message: entry.message,
          shortMessage: `Spelling: ${wrong}`,
          offset: match.index,
          length: wrong.length,
          context: text.slice(Math.max(0, match.index - 24), match.index + wrong.length + 24),
          replacements: [fix],
          rule: 'LOCAL_SPELLING',
          category: 'spelling',
          sectionId: snippet.sectionId,
          entryId: snippet.entryId,
          source: 'local',
        });
      }
    }
  }
  return hits;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function checkOneWithLanguageTool(
  snippet: GrammarSnippet,
  language: string,
): Promise<{ hits: GrammarHit[]; ok: boolean; error?: string }> {
  const text = stripHtml(snippet.content);
  if (!text || text.length < MIN_TEXT_LENGTH) return { hits: [], ok: true };

  try {
    const body = new URLSearchParams({
      text,
      language,
      level: 'picky',
      enabledOnly: 'false',
    });
    const response = await fetch(LANGUAGE_TOOL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      return { hits: [], ok: false, error: `LanguageTool returned ${response.status}` };
    }
    const data = (await response.json()) as { matches?: RawMatch[] };
    const hits: GrammarHit[] = (data.matches ?? []).map((match) => ({
      bulletId: snippet.bulletId,
      bulletLabel: snippet.bulletLabel,
      message: match.message,
      shortMessage: match.shortMessage || match.message,
      offset: match.offset,
      length: match.length,
      context: match.context?.text ?? text,
      replacements: (match.replacements ?? []).slice(0, 5).map((r) => r.value),
      rule: match.rule?.id ?? '',
      category: categorizeRule(match.rule),
      sectionId: snippet.sectionId,
      entryId: snippet.entryId,
      source: 'languagetool' as const,
    }));
    return { hits, ok: true };
  } catch (err) {
    return {
      hits: [],
      ok: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

function dedupeHits(hits: GrammarHit[]): GrammarHit[] {
  const seen = new Set<string>();
  const out: GrammarHit[] = [];
  for (const hit of hits) {
    const key = `${hit.bulletId}|${hit.offset}|${hit.length}|${hit.rule}|${hit.shortMessage}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

/**
 * Check snippets with LanguageTool (parallel, capped) and merge local spelling
 * hits. If every LanguageTool call fails, still return local hits when present;
 * only throw when nothing useful can be shown.
 */
export async function checkGrammar(
  bullets: GrammarSnippet[],
  language = 'en-US',
): Promise<GrammarHit[]> {
  const snippets = bullets.filter((b) => stripHtml(b.content).length >= MIN_TEXT_LENGTH);
  const localHits = checkLocalSpelling(snippets);

  if (snippets.length === 0) return localHits;

  let attempted = 0;
  let failed = 0;
  let lastError = '';
  const remoteHits: GrammarHit[] = [];

  const results = await mapPool(snippets, MAX_CONCURRENT, async (snippet) => {
    attempted += 1;
    return checkOneWithLanguageTool(snippet, language);
  });

  for (const result of results) {
    if (!result.ok) {
      failed += 1;
      if (result.error) lastError = result.error;
    }
    remoteHits.push(...result.hits);
  }

  const merged = dedupeHits([...remoteHits, ...localHits]);

  if (attempted > 0 && failed === attempted && localHits.length === 0) {
    throw new GrammarCheckError(
      lastError || 'Grammar check unavailable. LanguageTool could not be reached.',
    );
  }

  // Prefer spelling → grammar → style → other for a readable review order.
  const rank: Record<GrammarCategory, number> = {
    spelling: 0,
    grammar: 1,
    style: 2,
    other: 3,
  };
  return merged.sort((a, b) => rank[a.category] - rank[b.category] || a.bulletLabel.localeCompare(b.bulletLabel));
}

/** Apply a replacement into the matching resume field; returns false if unchanged. */
export function applyGrammarFix(
  resume: {
    header: { name: string };
    sections: Array<{
      id: string;
      type: string;
      entries: Array<{
        id: string;
        title?: string;
        subtitle?: string;
        location?: string;
        bullets?: Array<{ id: string; content: string }>;
      }>;
    }>;
  },
  hit: GrammarHit,
  replacement: string,
): typeof resume | null {
  const patchPlain = (text: string): string | null => {
    const plain = text.replace(/<[^>]*>/g, '');
    if (hit.offset < 0 || hit.offset + hit.length > plain.length) {
      const snippet = plain.slice(hit.offset, hit.offset + hit.length);
      if (!snippet) return null;
      const next = text.includes(snippet) ? text.replace(snippet, replacement) : null;
      return next && next !== text ? next : null;
    }
    if (plain === text) {
      const next =
        plain.slice(0, hit.offset) + replacement + plain.slice(hit.offset + hit.length);
      return next !== text ? next : null;
    }
    const snippet = plain.slice(hit.offset, hit.offset + hit.length);
    if (!snippet) return null;
    const next = text.replace(snippet, replacement);
    return next !== text ? next : null;
  };

  if (hit.bulletId === '__header_name__') {
    const next = patchPlain(resume.header.name);
    if (!next) return null;
    return { ...resume, header: { ...resume.header, name: next } };
  }

  if (hit.bulletId.startsWith('__entry_meta_')) {
    const entryId = hit.entryId ?? hit.bulletId.replace('__entry_meta_', '');
    let changed = false;
    const sections = resume.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        // Prefer patching the first non-empty title/subtitle/location field that
        // contains the matched span in the joined label string.
        const parts = [entry.title, entry.subtitle, entry.location];
        const joined = parts.filter((p): p is string => Boolean(p && p.trim())).join(' · ');
        const nextJoined = patchPlain(joined);
        if (!nextJoined) return entry;
        // Rebuild by replacing within individual fields when possible.
        const snippet = joined.slice(hit.offset, hit.offset + hit.length);
        if (snippet && entry.title?.includes(snippet)) {
          changed = true;
          return { ...entry, title: entry.title.replace(snippet, replacement) };
        }
        if (snippet && entry.subtitle?.includes(snippet)) {
          changed = true;
          return { ...entry, subtitle: entry.subtitle.replace(snippet, replacement) };
        }
        if (snippet && entry.location?.includes(snippet)) {
          changed = true;
          return { ...entry, location: entry.location.replace(snippet, replacement) };
        }
        return entry;
      }),
    }));
    return changed ? { ...resume, sections } : null;
  }

  if (hit.bulletId.startsWith('__skills_') || hit.bulletId.startsWith('__text_')) {
    const entryId =
      hit.entryId ??
      hit.bulletId.replace('__skills_', '').replace('__text_', '');
    let changed = false;
    const sections = resume.sections.map((section) => ({
      ...section,
      entries: section.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        if (section.type === 'skills' || section.type === 'additional') {
          const next = entry.subtitle ? patchPlain(entry.subtitle) : null;
          if (!next) return entry;
          changed = true;
          return { ...entry, subtitle: next };
        }
        const field = entry.title?.trim() ? 'title' : 'subtitle';
        const current = entry[field] ?? '';
        const next = patchPlain(current);
        if (!next) return entry;
        changed = true;
        return { ...entry, [field]: next };
      }),
    }));
    return changed ? { ...resume, sections } : null;
  }

  let changed = false;
  const sections = resume.sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => ({
      ...entry,
      bullets: entry.bullets?.map((bullet) => {
        if (bullet.id !== hit.bulletId) return bullet;
        const next = patchPlain(bullet.content);
        if (!next) return bullet;
        changed = true;
        return { ...bullet, content: next };
      }),
    })),
  }));
  return changed ? { ...resume, sections } : null;
}

/** Collect titles, skills lines, summaries, and bullets for a full-document check. */
export function collectGrammarSnippets(resume: {
  header: { name: string };
  sections: Array<{
    id: string;
    title: string;
    type: string;
    visible: boolean;
    entries: Array<{
      id: string;
      title?: string;
      subtitle?: string;
      location?: string;
      visible?: boolean;
      bullets?: Array<{ id: string; content: string; visible?: boolean; order?: number }>;
    }>;
  }>;
}): GrammarSnippet[] {
  const snippets: GrammarSnippet[] = [];

  if (resume.header.name.trim()) {
    snippets.push({
      bulletId: '__header_name__',
      bulletLabel: 'Header — Name',
      content: resume.header.name,
      sectionId: '__header__',
    });
  }

  for (const section of resume.sections) {
    if (!section.visible) continue;
    for (const entry of section.entries) {
      if (entry.visible === false) continue;
      const labelBase = `${section.title} — ${entry.title || entry.subtitle || 'Entry'}`;

      const titleBits = [entry.title, entry.subtitle, entry.location]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(' · ');
      if (titleBits) {
        snippets.push({
          bulletId: `__entry_meta_${entry.id}`,
          bulletLabel: `${labelBase} (title line)`,
          content: titleBits,
          sectionId: section.id,
          entryId: entry.id,
        });
      }

      // Skills / additional-info store free text in subtitle.
      if (
        (section.type === 'skills' || section.type === 'additional') &&
        entry.subtitle?.trim()
      ) {
        snippets.push({
          bulletId: `__skills_${entry.id}`,
          bulletLabel: labelBase,
          content: entry.subtitle,
          sectionId: section.id,
          entryId: entry.id,
        });
      }

      if (section.type === 'summary' || section.type === 'text') {
        const body = entry.title || entry.subtitle || '';
        if (body.trim()) {
          snippets.push({
            bulletId: `__text_${entry.id}`,
            bulletLabel: section.title || 'Summary',
            content: body,
            sectionId: section.id,
            entryId: entry.id,
          });
        }
      }

      const bullets = [...(entry.bullets ?? [])]
        .filter((b) => b.visible !== false && b.content.trim())
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const bullet of bullets) {
        snippets.push({
          bulletId: bullet.id,
          bulletLabel: labelBase,
          content: bullet.content,
          sectionId: section.id,
          entryId: entry.id,
        });
      }
    }
  }

  return snippets;
}
