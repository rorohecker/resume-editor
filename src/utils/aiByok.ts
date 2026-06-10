import type { Resume } from '@/types';
import { resumeToPlainText } from './resumeText';
import { getCached, hashKey, setCached } from './aiCache';

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  dailyLimit: number;
  minuteLimit: number;
}

interface AiUsageRecord {
  day: string;
  dailyCalls: number;
  minuteWindow: number;
  minuteCalls: number;
}

const SETTINGS_KEY = 'resume-editor:ai-byok-settings:v1';
const USAGE_KEY = 'resume-editor:ai-byok-usage:v1';

export const PROVIDER_MODELS: Record<AiProvider, string[]> = {
  anthropic: ['claude-3-5-haiku-latest', 'claude-sonnet-4-5', 'claude-opus-4-1'],
  openai: ['gpt-5.1', 'gpt-5.1-mini', 'gpt-4.1-mini'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
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

export function loadAiSettings(): AiSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AiSettings>;
    const provider = isProvider(parsed.provider) ? parsed.provider : 'anthropic';
    return {
      provider,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : PROVIDER_MODELS[provider][0],
      dailyLimit: typeof parsed.dailyLimit === 'number' ? parsed.dailyLimit : 500,
      minuteLimit: typeof parsed.minuteLimit === 'number' ? parsed.minuteLimit : 50,
    };
  } catch {
    return {
      provider: 'anthropic',
      apiKey: '',
      model: PROVIDER_MODELS.anthropic[0],
      dailyLimit: 500,
      minuteLimit: 50,
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
  return callByokAi(settings, 'Reply with exactly: OK', 16);
}

export async function generateAiText(settings: AiSettings, prompt: string, maxTokens = 700): Promise<string> {
  const cacheKey = await hashKey(`${settings.provider}|${settings.model}|${maxTokens}|${prompt}`);
  const cached = await getCached(cacheKey);
  if (cached !== null) return cached;
  const result = await callByokAi(settings, prompt, maxTokens);
  void setCached(cacheKey, result);
  return result;
}

export function promptForRewrite(resume: Resume, bullet: string, instruction: string): string {
  return [
    'Rewrite this resume bullet into 3 options.',
    'Each option must follow action verb + task + impact. Keep it truthful and concise.',
    instruction ? `User instruction: ${instruction}` : '',
    `Resume context:\n${resumeToPlainText(resume)}`,
    `Original bullet:\n${bullet}`,
    'Return only the 3 rewritten bullets, one per line.',
  ].filter(Boolean).join('\n\n');
}

export function promptForSummary(resume: Resume): string {
  return [
    'Write a 2 sentence professional resume summary for this candidate.',
    'Keep it specific, early-career friendly, and ATS-safe. Do not invent facts.',
    resumeToPlainText(resume),
  ].join('\n\n');
}

export function promptForCoverLetter(resume: Resume, jobDescription: string): string {
  return [
    'Draft a concise cover letter based only on this resume and job description.',
    'Avoid fake claims. Keep it polished and editable.',
    `Resume:\n${resumeToPlainText(resume)}`,
    `Job description:\n${jobDescription || 'No job description provided.'}`,
  ].join('\n\n');
}

export function promptForAtsKeywords(resume: Resume, jobDescription: string): string {
  return [
    'Extract the top 15-20 ATS keywords from this job description.',
    'For each keyword, mark whether it appears in the resume and suggest one section if missing.',
    'Return plain lines in this format: keyword | Found/Missing | Section',
    `Resume:\n${resumeToPlainText(resume)}`,
    `Job description:\n${jobDescription}`,
  ].join('\n\n');
}

// Hard cap so a hung provider request can't freeze the UI forever.
const AI_REQUEST_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('AI request timed out. Check your connection or try a smaller request.');
    }
    throw error instanceof Error
      ? error
      : new Error('Network error reaching the AI provider.');
  } finally {
    clearTimeout(timer);
  }
}

async function callByokAi(settings: AiSettings, prompt: string, maxTokens: number): Promise<string> {
  if (!settings.apiKey.trim()) throw new Error('Add an API key in AI settings first.');
  // Check limits up front, but only count the call once it actually succeeds so
  // failed/aborted requests don't burn the user's daily/minute quota.
  enforceUsageLimit(settings);

  let result: string;
  if (settings.provider === 'anthropic') result = await callAnthropic(settings, prompt, maxTokens);
  else if (settings.provider === 'openai') result = await callOpenAi(settings, prompt, maxTokens);
  else result = await callGemini(settings, prompt, maxTokens);

  recordUsage();
  return result;
}

async function callAnthropic(settings: AiSettings, prompt: string, maxTokens: number): Promise<string> {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractError(data, 'Claude request failed.'));
  return data.content?.map((part: { text?: string }) => part.text ?? '').join('').trim() ?? '';
}

async function callOpenAi(settings: AiSettings, prompt: string, maxTokens: number): Promise<string> {
  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      input: prompt,
      max_output_tokens: maxTokens,
      store: false,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractError(data, 'OpenAI request failed.'));
  if (typeof data.output_text === 'string') return data.output_text.trim();
  return data.output
    ?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? [])
    .map((content: { text?: string }) => content.text ?? '')
    .join('')
    .trim() ?? '';
}

async function callGemini(settings: AiSettings, prompt: string, maxTokens: number): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(settings.model)}:generateContent`;
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': settings.apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(extractError(data, 'Gemini request failed.'));
  return data.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? '').join('').trim() ?? '';
}

function enforceUsageLimit(settings: AiSettings): void {
  const today = new Date().toISOString().slice(0, 10);
  const minuteWindow = Math.floor(Date.now() / 60_000);
  const record = loadUsage();
  const dailyCalls = record.day === today ? record.dailyCalls : 0;
  const minuteCalls = record.minuteWindow === minuteWindow ? record.minuteCalls : 0;

  if (dailyCalls >= settings.dailyLimit) {
    throw new Error(`Daily BYOK call limit reached (${settings.dailyLimit}). Raise the limit in settings if you want to continue.`);
  }
  if (minuteCalls >= settings.minuteLimit) {
    throw new Error(`Per-minute BYOK call limit reached (${settings.minuteLimit}). Wait a minute or raise the limit in settings.`);
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

function extractError(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const error = record.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof record.message === 'string') return record.message;
  }
  return fallback;
}

function isProvider(value: unknown): value is AiProvider {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}
