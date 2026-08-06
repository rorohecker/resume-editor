/**
 * Company + role research for Generate variant.
 * Fetches public snippets (Wikipedia, DuckDuckGo Instant Answer) then optionally
 * synthesizes a structured brief with BYOK AI for the planner/scorer/rewriter.
 */

import { generateAiText, type AiSettings, type JsonSchema } from './aiByok';
import { buildFeaturePrompt } from './aiGuides';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
}

export interface CompanyRoleResearch {
  companyName: string;
  roleTitle: string;
  companyOverview: string;
  roleOverview: string;
  hiringSignals: string[];
  cultureAndReviews: string[];
  usefulForTailoring: string[];
  sources: ResearchSource[];
  researchNotes: string;
}

interface RawSnippet {
  title: string;
  url: string;
  snippet: string;
  query: string;
}

const RESEARCH_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    companyName: { type: 'string' },
    roleTitle: { type: 'string' },
    companyOverview: { type: 'string' },
    roleOverview: { type: 'string' },
    hiringSignals: { type: 'array', items: { type: 'string' } },
    cultureAndReviews: { type: 'array', items: { type: 'string' } },
    usefulForTailoring: { type: 'array', items: { type: 'string' } },
    researchNotes: { type: 'string' },
  },
  required: [
    'companyName',
    'roleTitle',
    'companyOverview',
    'roleOverview',
    'hiringSignals',
    'cultureAndReviews',
    'usefulForTailoring',
    'researchNotes',
  ],
  additionalProperties: false,
};

const FETCH_TIMEOUT_MS = 8_000;

export function extractCompanyAndRole(
  jobDescription: string,
  hints?: { companyName?: string; targetRole?: string },
): { companyName: string; roleTitle: string } {
  const original = jobDescription.trim();
  const text = original.replace(/\s+/g, ' ').trim();
  const hintedCompany = hints?.companyName?.trim() ?? '';
  const hintedRole = hints?.targetRole?.trim() ?? '';

  const companyPatterns = [
    /(?:^|\n)\s*(?:company|employer|organization|organisation)\s*[:\-–]\s*([^\n]{2,80})/i,
    /(?:company|employer|organization|organisation)\s*[:\-–]\s*([A-Z][A-Za-z0-9&.\-']+(?:\s+[A-Z][A-Za-z0-9&.\-']+){0,5})/,
    /about\s+([A-Z][A-Za-z0-9&.\-']+(?:\s+[A-Z][A-Za-z0-9&.\-']+){0,4})\s*(?:is|we are|we're)/i,
    /(?:join|at)\s+([A-Z][A-Za-z0-9&.\-']+(?:\s+[A-Z][A-Za-z0-9&.\-']+){0,4})\b/,
    /^([A-Z][A-Za-z0-9&.\-']+(?:\s+[A-Z][A-Za-z0-9&.\-']+){0,3})\s+(?:is hiring|is looking|seeks)/m,
  ];
  let companyName = hintedCompany;
  if (!companyName) {
    for (const pattern of companyPatterns) {
      const match = original.match(pattern) ?? text.match(pattern);
      const candidate = (match?.[1] ?? '')
        .trim()
        .replace(/\s+(?:role|position|title|job)\b.*$/i, '')
        .trim();
      if (candidate.length >= 2 && candidate.length <= 80 && !/^(the|our|this|we)$/i.test(candidate)) {
        companyName = candidate;
        break;
      }
    }
  }

  const rolePatterns = [
    /(?:^|\n)\s*(?:position|role|title|job title)\s*[:\-–]\s*([^\n]{3,80})/i,
    /(?:position|role|title|job title)\s*[:\-–]\s*([^.\n]{3,80})/i,
    /(?:hiring|seeking|looking for)\s+(?:an?\s+)?([^.\n]{3,80}?)(?:\s+to\s|\s+who\s|\.|$)/i,
  ];
  let roleTitle = hintedRole;
  if (!roleTitle) {
    for (const pattern of rolePatterns) {
      const match = original.match(pattern) ?? text.match(pattern);
      const candidate = (match?.[1] ?? '').trim();
      if (candidate.length >= 3 && candidate.length <= 80) {
        roleTitle = candidate;
        break;
      }
    }
  }
  if (!roleTitle) {
    roleTitle = text.split(/[.!\n]/)[0]?.slice(0, 80).trim() || 'Target role';
  }

  return { companyName: companyName || 'Company', roleTitle };
}

export function formatCompanyResearchForPrompt(research: CompanyRoleResearch): string {
  const body = {
    companyName: research.companyName,
    roleTitle: research.roleTitle,
    companyOverview: research.companyOverview,
    roleOverview: research.roleOverview,
    hiringSignals: research.hiringSignals,
    cultureAndReviews: research.cultureAndReviews,
    usefulForTailoring: research.usefulForTailoring,
    researchNotes: research.researchNotes,
    sources: research.sources.map((s) => ({ title: s.title, url: s.url })),
  };
  return `--- COMPANY & ROLE RESEARCH (public web snippets + synthesis; use for targeting, never invent candidate facts) ---\n${JSON.stringify(body, null, 2)}`;
}

export function localCompanyRoleResearch(
  jobDescription: string,
  hints?: { companyName?: string; targetRole?: string },
  sources: ResearchSource[] = [],
): CompanyRoleResearch {
  const { companyName, roleTitle } = extractCompanyAndRole(jobDescription, hints);
  const jdSlice = jobDescription.replace(/\s+/g, ' ').trim().slice(0, 500);
  const sourceBits = sources
    .map((s) => s.snippet)
    .filter(Boolean)
    .slice(0, 4);
  return {
    companyName,
    roleTitle,
    companyOverview:
      sourceBits[0] ||
      (companyName !== 'Company'
        ? `${companyName} (details inferred from the job description only).`
        : 'Company details were not found; rely on the job description.'),
    roleOverview: jdSlice || `Role: ${roleTitle}`,
    hiringSignals: [
      'Match must-have skills and tools named in the job description',
      'Show measurable impact in the same domain as the role',
    ],
    cultureAndReviews: sourceBits.length > 1
      ? sourceBits.slice(1, 4)
      : ['No live Glassdoor scrape available; use public snippets and JD culture cues only'],
    usefulForTailoring: [
      'Lead with experiences that mirror the role’s core responsibilities',
      'Reframe transferable work using the job’s domain language when truthful',
      'Deprioritize bullets with no overlap to company/role themes',
    ],
    sources,
    researchNotes:
      sources.length > 0
        ? 'Built from public web snippets plus the pasted job description.'
        : 'No public web snippets retrieved; plan from the job description only.',
  };
}

/** Fetch public snippets, then synthesize a research brief (AI when keyed). */
export async function researchCompanyAndRole(
  settings: AiSettings | null,
  jobDescription: string,
  hints?: { companyName?: string; targetRole?: string },
): Promise<CompanyRoleResearch> {
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const extracted = extractCompanyAndRole(jobDescription, hints);
  const snippets = await gatherPublicSnippets(extracted.companyName, extracted.roleTitle);
  const sources = snippets.map(({ title, url, snippet }) => ({ title, url, snippet }));

  if (!settings?.apiKey.trim()) {
    return localCompanyRoleResearch(jobDescription, hints, sources);
  }

  try {
    return await synthesizeResearchWithAi(settings, jobDescription, extracted, sources);
  } catch {
    return localCompanyRoleResearch(jobDescription, hints, sources);
  }
}

async function synthesizeResearchWithAi(
  settings: AiSettings,
  jobDescription: string,
  extracted: { companyName: string; roleTitle: string },
  sources: ResearchSource[],
): Promise<CompanyRoleResearch> {
  const prompt = buildFeaturePrompt(
    'variant-research',
    `Extracted company hint: ${extracted.companyName}`,
    `Extracted role hint: ${extracted.roleTitle}`,
    `--- JOB DESCRIPTION ---\n${jobDescription.slice(0, 8000)}`,
    `--- PUBLIC WEB SNIPPETS ---\n${JSON.stringify(sources, null, 2)}`,
  );

  let raw: string;
  try {
    raw = await generateAiText(settings, prompt, 2200, {
      cache: false,
      jsonSchema: { name: 'resume_variant_company_research', schema: RESEARCH_SCHEMA },
    });
  } catch (error) {
    // Schema mode may be unsupported on some models; retry as plain JSON.
    if (!(error instanceof Error)) throw error;
    raw = await generateAiText(settings, prompt, 2200, { cache: false });
  }

  const parsed = parseLooseJsonObject(raw);
  if (!parsed) return localCompanyRoleResearch(jobDescription, extracted, sources);
  return normalizeResearch(parsed, extracted, sources, jobDescription);
}

function normalizeResearch(
  raw: Record<string, unknown>,
  extracted: { companyName: string; roleTitle: string },
  sources: ResearchSource[],
  jobDescription: string,
): CompanyRoleResearch {
  const fallback = localCompanyRoleResearch(jobDescription, extracted, sources);
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  const list = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key];
      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 8);
      }
    }
    return [] as string[];
  };

  return {
    companyName: text('companyName', 'company_name', 'company') || fallback.companyName,
    roleTitle: text('roleTitle', 'role_title', 'role') || fallback.roleTitle,
    companyOverview: text('companyOverview', 'company_overview', 'aboutCompany') || fallback.companyOverview,
    roleOverview: text('roleOverview', 'role_overview', 'aboutRole') || fallback.roleOverview,
    hiringSignals: nonempty(list('hiringSignals', 'hiring_signals', 'whoGetsIn'), fallback.hiringSignals),
    cultureAndReviews: nonempty(
      list('cultureAndReviews', 'culture_and_reviews', 'glassdoorThemes'),
      fallback.cultureAndReviews,
    ),
    usefulForTailoring: nonempty(
      list('usefulForTailoring', 'useful_for_tailoring', 'tailoringNotes'),
      fallback.usefulForTailoring,
    ),
    sources,
    researchNotes: text('researchNotes', 'research_notes', 'notes') || fallback.researchNotes,
  };
}

function nonempty(value: string[], fallback: string[]): string[] {
  return value.length > 0 ? value : fallback;
}

async function gatherPublicSnippets(companyName: string, roleTitle: string): Promise<RawSnippet[]> {
  const company = companyName !== 'Company' ? companyName : '';
  const queries: { label: string; query: string }[] = [];
  if (company) {
    queries.push(
      { label: 'company', query: company },
      { label: 'glassdoor', query: `${company} Glassdoor reviews culture` },
      { label: 'role', query: `${company} ${roleTitle}`.trim() },
      { label: 'hiring', query: `${company} ${roleTitle} interview what they look for`.trim() },
    );
  } else if (roleTitle) {
    queries.push({ label: 'role', query: `${roleTitle} job responsibilities` });
  }

  const results = await Promise.allSettled(
    queries.flatMap(({ label, query }) => {
      const tasks: Array<Promise<RawSnippet | RawSnippet[] | null>> = [
        fetchDuckDuckGoInstant(query).then((items) =>
          items.map((item) => ({ ...item, query: label })),
        ),
      ];
      // Wikipedia is weak for Glassdoor/interview queries; skip those.
      if (label === 'company' || label === 'role') {
        tasks.unshift(
          fetchWikipediaSummary(query).then((s) => (s ? { ...s, query: label } : null)),
        );
      }
      return tasks;
    }),
  );

  const out: RawSnippet[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const batch = Array.isArray(result.value) ? result.value : [result.value];
    for (const item of batch) {
      if (!item?.snippet?.trim()) continue;
      const key = `${item.url}|${item.snippet.slice(0, 80)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, 12);
}

async function fetchWikipediaSummary(
  query: string,
  allowResolve = true,
): Promise<Omit<RawSnippet, 'query'> | null> {
  const title = query.trim();
  if (!title) return null;
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      if (!allowResolve) return null;
      // Try OpenSearch to resolve a better title, then summarize once (no recursion).
      const resolved = await wikipediaOpenSearch(title);
      if (!resolved || resolved.toLowerCase() === title.toLowerCase()) return null;
      return fetchWikipediaSummary(resolved, false);
    }
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      description?: string;
      content_urls?: { desktop?: { page?: string } };
      type?: string;
    };
    if (data.type === 'disambiguation') {
      if (!allowResolve) return null;
      const resolved = await wikipediaOpenSearch(title);
      if (!resolved || resolved.toLowerCase() === title.toLowerCase()) return null;
      return fetchWikipediaSummary(resolved, false);
    }
    const snippet = (data.extract || data.description || '').trim();
    if (!snippet) return null;
    return {
      title: data.title || title,
      url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
      snippet: snippet.slice(0, 600),
    };
  } catch {
    return null;
  }
}

async function wikipediaOpenSearch(query: string): Promise<string | null> {
  const url =
    `https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&origin=*` +
    `&search=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || !Array.isArray(data[1]) || typeof data[1][0] !== 'string') return null;
    return data[1][0];
  } catch {
    return null;
  }
}

async function fetchDuckDuckGoInstant(query: string): Promise<Omit<RawSnippet, 'query'>[]> {
  const url =
    `https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      Heading?: string;
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
    };
    const out: Omit<RawSnippet, 'query'>[] = [];
    if (data.AbstractText?.trim()) {
      out.push({
        title: data.Heading || query,
        url: data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: data.AbstractText.trim().slice(0, 600),
      });
    }
    const related = flattenRelated(data.RelatedTopics ?? []).slice(0, 4);
    for (const item of related) {
      if (!item.Text?.trim()) continue;
      out.push({
        title: item.Text.split(' - ')[0]?.slice(0, 80) || query,
        url: item.FirstURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: item.Text.trim().slice(0, 400),
      });
    }
    return out;
  } catch {
    return [];
  }
}

function flattenRelated(
  topics: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>,
): Array<{ Text?: string; FirstURL?: string }> {
  const out: Array<{ Text?: string; FirstURL?: string }> = [];
  for (const topic of topics) {
    if (topic.Text) out.push(topic);
    if (Array.isArray(topic.Topics)) {
      for (const nested of topic.Topics) {
        if (nested.Text) out.push(nested);
      }
    }
  }
  return out;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() || trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const data = JSON.parse(body.slice(start, end + 1));
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}
