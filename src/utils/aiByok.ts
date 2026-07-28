import type { Resume } from '@/types';
import { resumeToPlainText } from './resumeText';
import { getCached, hashKey, setCached } from './aiCache';
import { buildFeaturePrompt } from './aiGuides';

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  dailyLimit: number;
  minuteLimit: number;
  /** Standing instructions the agent must follow when editing the resume. */
  agentInstructions: string;
}

export type JsonSchema = Record<string, unknown>;

export interface AiRequestOptions {
  /** Skip response cache for calls whose output must be validated by the caller. */
  cache?: boolean;
  jsonSchema?: {
    name: string;
    schema: JsonSchema;
  };
}

interface AiUsageRecord {
  day: string;
  dailyCalls: number;
  minuteWindow: number;
  minuteCalls: number;
}

const SETTINGS_KEY = 'resume-editor:ai-byok-settings:v1';
const USAGE_KEY = 'resume-editor:ai-byok-usage:v1';

/** Suggested model IDs (first = default). Keep aliases current with provider docs. */
export const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-5', 'claude-opus-5', 'claude-fable-5'],
  openai: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6'],
  gemini: ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
};

/**
 * Known-stale IDs from earlier app versions -> current replacements.
 * Applied on load so existing localStorage settings keep working.
 */
export const LEGACY_MODEL_MAP: Record<string, string> = {
  'claude-3-5-haiku-latest': 'claude-haiku-4-5',
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5',
  'claude-3-5-sonnet-latest': 'claude-sonnet-5',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
  'claude-3-opus-20240229': 'claude-opus-5',
  'claude-sonnet-4-5': 'claude-sonnet-5',
  'claude-sonnet-4-5-20250929': 'claude-sonnet-5',
  'claude-opus-4-1': 'claude-opus-5',
  'claude-opus-4-1-20250805': 'claude-opus-5',
  'gpt-5.1': 'gpt-5.6',
  'gpt-5.1-mini': 'gpt-5.6-luna',
  'gpt-5-mini': 'gpt-5.6-luna',
  'gpt-5-nano': 'gpt-5.6-luna',
  'gpt-4.1-mini': 'gpt-5.6-luna',
  'gpt-4o-mini': 'gpt-5.6-luna',
  'gpt-4o': 'gpt-5.6-terra',
  'gpt-3.5-turbo': 'gpt-5.6-luna',
  'gemini-pro': 'gemini-3.6-flash',
  'gemini-1.5-flash': 'gemini-3.6-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-2.0-flash': 'gemini-3.6-flash',
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT / OpenAI',
  gemini: 'Gemini',
};

export const KEY_LINKS: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/keys',
  openai: 'https://platform.openai.com/api-keys',
  gemini: 'https://aistudio.google.com/app/apikey',
};

export const BILLING_LINKS: Record<AiProvider, string> = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing',
  gemini: 'https://aistudio.google.com/plan_information',
};

const DEFAULT_DAILY_LIMIT = 500;
const DEFAULT_MINUTE_LIMIT = 50;

export function loadCurrentUsage(): { dailyCalls: number; minuteCalls: number } {
  try {
    const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') as Partial<AiUsageRecord>;
    const today = new Date().toISOString().slice(0, 10);
    const minuteWindow = Math.floor(Date.now() / 60_000);
    return {
      dailyCalls: parsed.day === today ? (parsed.dailyCalls ?? 0) : 0,
      minuteCalls: parsed.minuteWindow === minuteWindow ? (parsed.minuteCalls ?? 0) : 0,
    };
  } catch {
    return { dailyCalls: 0, minuteCalls: 0 };
  }
}

export function resetAiUsage(): void {
  localStorage.removeItem(USAGE_KEY);
}

export function sanitizeLimit(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) return fallback;
  return Math.min(max, Math.floor(value));
}

export function resolveModel(provider: AiProvider, model: unknown): string {
  const raw = typeof model === 'string' ? model.trim() : '';
  if (!raw) return PROVIDER_MODELS[provider][0];
  return LEGACY_MODEL_MAP[raw] ?? raw;
}

export function loadAiSettings(): AiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AiSettings>;
    const provider = isProvider(parsed.provider) ? parsed.provider : 'anthropic';
    const settings: AiSettings = {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: resolveModel(provider, parsed.model),
      dailyLimit: sanitizeLimit(parsed.dailyLimit, DEFAULT_DAILY_LIMIT, 1, 5000),
      minuteLimit: sanitizeLimit(parsed.minuteLimit, DEFAULT_MINUTE_LIMIT, 1, 500),
      agentInstructions:
        typeof parsed.agentInstructions === 'string' ? parsed.agentInstructions : '',
    };
    // Persist migrations (stale models / broken 0 limits) so the UI reflects reality.
    if (
      settings.model !== parsed.model ||
      settings.dailyLimit !== parsed.dailyLimit ||
      settings.minuteLimit !== parsed.minuteLimit
    ) {
      saveAiSettings(settings);
    }
    return settings;
  } catch {
    return {
      provider: 'anthropic',
      apiKey: '',
      model: PROVIDER_MODELS.anthropic[0],
      dailyLimit: DEFAULT_DAILY_LIMIT,
      minuteLimit: DEFAULT_MINUTE_LIMIT,
      agentInstructions: '',
    };
  }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function clearAiSettings(): void {
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(USAGE_KEY);
}

export async function testAiConnection(settings: AiSettings): Promise<string> {
  // Reasoning models need headroom above the visible reply; don't use a tiny budget.
  return callByokAi(settings, buildFeaturePrompt('connection-test'), 256);
}

export async function generateAiText(
  settings: AiSettings,
  prompt: string,
  maxTokens = 700,
  options: AiRequestOptions = {},
): Promise<string> {
  const cacheKey = await hashKey(
    `${settings.provider}|${settings.model}|${maxTokens}|${prompt}|${JSON.stringify(options.jsonSchema ?? null)}`,
  );
  if (options.cache !== false) {
    const cached = await getCached(cacheKey);
    // Never reuse empty/whitespace cache entries (poisoned by truncated reasoning replies).
    if (cached !== null && cached.trim()) return cached;
  }
  const result = await callByokAi(settings, prompt, maxTokens, options);
  if (options.cache !== false && result.trim()) void setCached(cacheKey, result);
  return result;
}

export function promptForRewrite(resume: Resume, bullet: string, instruction: string): string {
  return buildFeaturePrompt('bullet-rewrite',
    'Rewrite this resume bullet into 3 options.',
    'Each option must follow action verb + task + impact. Keep it truthful and concise.',
    instruction ? `User instruction: ${instruction}` : '',
    `Resume context:\n${resumeToPlainText(resume)}`,
    `Original bullet:\n${bullet}`,
    'Return only the 3 rewritten bullets, one per line.',
  );
}

export function promptForSummary(resume: Resume): string {
  return buildFeaturePrompt('summary',
    'Write a 2 sentence professional resume summary for this candidate.',
    'Keep it specific, early-career friendly, and ATS-safe. Do not invent facts.',
    resumeToPlainText(resume),
  );
}

export function promptForCoverLetter(resume: Resume, jobDescription: string): string {
  return buildFeaturePrompt('cover-letter',
    'Draft a concise cover letter based only on this resume and job description.',
    'Avoid fake claims. Keep it polished and editable.',
    `Resume:\n${resumeToPlainText(resume)}`,
    `Job description:\n${jobDescription || 'No job description provided.'}`,
  );
}

export function promptForAtsKeywords(resume: Resume, jobDescription: string): string {
  return buildFeaturePrompt('ats-keywords',
    'Extract the top 15-20 ATS keywords from this job description.',
    'For each keyword, mark whether it appears in the resume and suggest one section if missing.',
    'Return plain lines in this format: keyword | Found/Missing | Section',
    `Resume:\n${resumeToPlainText(resume)}`,
    `Job description:\n${jobDescription}`,
  );
}

// Hard cap so a hung provider request can't freeze the UI forever.
const AI_REQUEST_TIMEOUT_MS = 60_000;

/**
 * In Vite dev (and optional VITE_BYOK_PROXY=1 builds), same-origin `/byok/*`
 * proxies strip CORS for OpenAI/Gemini. Default production static builds still
 * call providers directly (Claude works; others may need a proxy).
 */
export function useByokProxy(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_BYOK_PROXY === '1';
}

export function providerEndpoint(provider: AiProvider, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (useByokProxy() && (provider === 'openai' || provider === 'gemini')) {
    return `/byok/${provider}${clean}`;
  }
  if (provider === 'openai') return `https://api.openai.com${clean}`;
  if (provider === 'gemini') return `https://generativelanguage.googleapis.com${clean}`;
  return `https://api.anthropic.com${clean}`;
}

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI request timed out. Check your connection or try a smaller request.');
    }
    // Browser CORS blocks often surface as TypeError: Failed to fetch with no status.
    const message = error instanceof Error ? error.message : String(error);
    if (/failed to fetch|networkerror|load failed|cors/i.test(message)) {
      throw new Error(
        'Browser blocked this AI request (likely CORS). Claude works in-browser; for OpenAI/Gemini run `npm run dev` (local proxy), set VITE_BYOK_PROXY=1 with a /byok reverse proxy, or see api/README.md.',
      );
    }
    throw error instanceof Error
      ? error
      : new Error('Network error reaching the AI provider.');
  } finally {
    clearTimeout(timer);
  }
}

async function callByokAi(
  settings: AiSettings,
  prompt: string,
  maxTokens: number,
  options: AiRequestOptions = {},
): Promise<string> {
  if (!settings.apiKey.trim()) throw new Error('Add an API key in AI settings first.');
  // Check limits up front, but only count the call once it actually succeeds so
  // failed/aborted requests don't burn the user's daily/minute quota.
  enforceUsageLimit(settings);

  let result: string;
  if (settings.provider === 'anthropic') result = await callAnthropic(settings, prompt, maxTokens, options);
  else if (settings.provider === 'openai') result = await callOpenAi(settings, prompt, maxTokens, options);
  else result = await callGemini(settings, prompt, maxTokens, options);

  if (!result.trim()) {
    throw new Error(
      'The provider returned an empty reply. Try a higher token budget, a cheaper model (Haiku / Luna / Flash), or Test connection again.',
    );
  }

  recordUsage();
  return result;
}

async function callAnthropic(
  settings: AiSettings,
  prompt: string,
  maxTokens: number,
  options: AiRequestOptions,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (options.jsonSchema && supportsAnthropicStructuredOutput(settings.model)) {
    body.output_config = {
      format: {
        type: 'json_schema',
        schema: options.jsonSchema.schema,
      },
    };
  }

  const response = await fetchWithTimeout(providerEndpoint('anthropic', '/v1/messages'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(formatProviderError('anthropic', data, response.status));
  return data.content?.map((part: { text?: string }) => part.text ?? '').join('').trim() ?? '';
}

async function callOpenAi(
  settings: AiSettings,
  prompt: string,
  maxTokens: number,
  options: AiRequestOptions,
): Promise<string> {
  // GPT-5.x reasoning burns output budget before visible text. Floor high enough
  // for JSON scoring/rewrite replies, not just short chat.
  const maxOutputTokens = Math.max(maxTokens, 2048);
  const body: Record<string, unknown> = {
    model: settings.model,
    input: prompt,
    max_output_tokens: maxOutputTokens,
    store: false,
    text:
      options.jsonSchema && supportsOpenAiStructuredOutput(settings.model)
        ? {
            format: {
              type: 'json_schema',
              name: options.jsonSchema.name,
              strict: true,
              schema: options.jsonSchema.schema,
            },
          }
        : { format: { type: 'text' } },
  };
  // Only GPT-5+ Responses models accept reasoning.effort; older IDs reject it.
  // Prefer minimal effort for resume tooling so tokens go to the visible reply.
  if (/^gpt-5/i.test(settings.model)) {
    body.reasoning = { effort: 'none' };
  }

  const response = await fetchWithTimeout(providerEndpoint('openai', '/v1/responses'), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(formatProviderError('openai', data, response.status));

  const text = extractOpenAiText(data);
  if (!text) {
    const status = data && typeof data === 'object' ? (data as { status?: string }).status : undefined;
    const reason =
      data && typeof data === 'object'
        ? (data as { incomplete_details?: { reason?: string } }).incomplete_details?.reason
        : undefined;
    if (status === 'incomplete' || reason) {
      throw new Error(
        `OpenAI stopped early (${reason ?? status ?? 'incomplete'}). Raise max tokens or pick gpt-5.6-luna.`,
      );
    }
  }
  return text;
}

function extractOpenAiText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as {
    output_text?: unknown;
    output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  };
  if (typeof record.output_text === 'string' && record.output_text.trim()) {
    return record.output_text.trim();
  }
  if (!Array.isArray(record.output)) return '';
  return record.output
    .flatMap((item) => item.content ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
}

async function callGemini(
  settings: AiSettings,
  prompt: string,
  maxTokens: number,
  options: AiRequestOptions,
): Promise<string> {
  const path = `/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: Math.max(maxTokens, 256),
    temperature: 0.2,
  };
  if (options.jsonSchema) {
    generationConfig.response_mime_type = 'application/json';
    generationConfig.response_schema = toGeminiSchema(options.jsonSchema.schema);
  }
  const response = await fetchWithTimeout(providerEndpoint('gemini', path), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(formatProviderError('gemini', data, response.status));
  const blockReason = data?.promptFeedback?.blockReason;
  if (typeof blockReason === 'string' && blockReason) {
    throw new Error(`Gemini blocked the prompt (${blockReason}).`);
  }
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('').trim() ?? '';
}

function enforceUsageLimit(settings: AiSettings): void {
  const today = new Date().toISOString().slice(0, 10);
  const minuteWindow = Math.floor(Date.now() / 60_000);
  const record = loadUsage();
  const dailyCalls = record.day === today ? record.dailyCalls : 0;
  const minuteCalls = record.minuteWindow === minuteWindow ? record.minuteCalls : 0;
  const dailyLimit = sanitizeLimit(settings.dailyLimit, DEFAULT_DAILY_LIMIT, 1, 5000);
  const minuteLimit = sanitizeLimit(settings.minuteLimit, DEFAULT_MINUTE_LIMIT, 1, 500);

  if (dailyCalls >= dailyLimit) {
    throw new Error(
      `Local app call limit reached for today (${dailyLimit}). This is not your provider bill - raise "Calls per day" or reset usage in AI settings.`,
    );
  }
  if (minuteCalls >= minuteLimit) {
    throw new Error(
      `Local per-minute call limit reached (${minuteLimit}). Wait a minute, or raise "Calls per minute" in AI settings.`,
    );
  }
}

// Counts one successful call against the daily/minute windows. Called only
// after the provider responds so timeouts/errors don't consume quota.
function recordUsage(): void {
  const today = new Date().toISOString().slice(0, 10);
  const minuteWindow = Math.floor(Date.now() / 60_000);
  const record = loadUsage();
  const next: AiUsageRecord = {
    day: today,
    dailyCalls: (record.day === today ? record.dailyCalls : 0) + 1,
    minuteWindow,
    minuteCalls: (record.minuteWindow === minuteWindow ? record.minuteCalls : 0) + 1,
  };
  localStorage.setItem(USAGE_KEY, JSON.stringify(next));
}

function loadUsage(): AiUsageRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}') as Partial<AiUsageRecord>;
    return {
      day: typeof parsed.day === 'string' ? parsed.day : '',
      dailyCalls: typeof parsed.dailyCalls === 'number' ? parsed.dailyCalls : 0,
      minuteWindow: typeof parsed.minuteWindow === 'number' ? parsed.minuteWindow : 0,
      minuteCalls: typeof parsed.minuteCalls === 'number' ? parsed.minuteCalls : 0,
    };
  } catch {
    return { day: '', dailyCalls: 0, minuteWindow: 0, minuteCalls: 0 };
  }
}

export function formatProviderError(provider: AiProvider, data: unknown, status?: number): string {
  const raw = extractErrorMessage(data);
  const code = extractErrorCode(data);
  const lower = `${raw} ${code}`.toLowerCase();

  if (
    /insufficient_quota|exceeded your current quota|billing_not_active|payment.?required/i.test(lower) ||
    status === 402
  ) {
    const link = BILLING_LINKS[provider];
    if (provider === 'openai') {
      return `OpenAI API billing/quota rejected this key (not ChatGPT Plus). Add API credits at ${link}`;
    }
    return `${PROVIDER_LABELS[provider]} billing/quota rejected this key. Check ${link}`;
  }

  if (/invalid.?api.?key|incorrect api key|authentication|unauthorized|api_key_invalid/i.test(lower) || status === 401) {
    return `Invalid ${PROVIDER_LABELS[provider]} API key. Create a new key at ${KEY_LINKS[provider]}`;
  }

  if (/model.?not.?found|does not exist|invalid model|not_found_error/i.test(lower) || status === 404) {
    return `Model not available for this key. Pick one of: ${PROVIDER_MODELS[provider].join(', ')}`;
  }

  if (/rate.?limit|too many requests|resource_exhausted/i.test(lower) || status === 429) {
    return `${PROVIDER_LABELS[provider]} rate-limited this request. Wait a moment and try again.`;
  }

  if (raw) {
    return status ? `${PROVIDER_LABELS[provider]} error (${status}): ${raw}` : raw;
  }
  return status
    ? `${PROVIDER_LABELS[provider]} request failed (${status}).`
    : `${PROVIDER_LABELS[provider]} request failed.`;
}

function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  const error = record.error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
  // Gemini sometimes nests under error.status / error.message already handled;
  // also surface top-level status strings.
  if (typeof record.status === 'string' && /error|fail|invalid/i.test(record.status)) {
    return record.status;
  }
  return '';
}

function extractErrorCode(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const error = (data as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  for (const key of ['code', 'type', 'status'] as const) {
    const value = record[key];
    if (typeof value === 'string' || typeof value === 'number') return String(value);
  }
  return '';
}

function isProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}

function supportsOpenAiStructuredOutput(model: string): boolean {
  return /^gpt-5/i.test(model) || /^gpt-4o/i.test(model);
}

function supportsAnthropicStructuredOutput(model: string): boolean {
  return !/^claude-(?:3|2|instant)/i.test(model);
}

function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;

  const raw = schema as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'additionalProperties') continue;
    if (key === 'type' && typeof value === 'string') {
      next.type = geminiType(value);
    } else if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      next.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([prop, propSchema]) => [
          prop,
          toGeminiSchema(propSchema),
        ]),
      );
    } else if (key === 'items') {
      next.items = toGeminiSchema(value);
    } else if (['required', 'enum', 'description', 'nullable'].includes(key)) {
      next[key] = value;
    }
  }
  return next;
}

function geminiType(type: string): string {
  const normalized = type.toLowerCase();
  const map: Record<string, string> = {
    object: 'OBJECT',
    array: 'ARRAY',
    string: 'STRING',
    number: 'NUMBER',
    integer: 'INTEGER',
    boolean: 'BOOLEAN',
  };
  return map[normalized] ?? type.toUpperCase();
}
