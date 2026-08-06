import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import {
  AI_TRANSIENT_MAX_RETRIES,
  LEGACY_MODEL_MAP,
  PROVIDER_MODELS,
  formatProviderError,
  isTransientProviderError,
  loadAiSettings,
  promptForAtsKeywords,
  promptForCoverLetter,
  promptForRewrite,
  promptForSummary,
  resetAiUsage,
  resolveModel,
  sanitizeLimit,
  transientRetryDelayMs,
} from '@/utils/aiByok';

function installMemoryLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('sanitizeLimit', () => {
  it('rejects zero, NaN, and out-of-range values that previously blocked all AI calls', () => {
    expect(sanitizeLimit(0, 500, 1, 5000)).toBe(500);
    expect(sanitizeLimit(Number.NaN, 500, 1, 5000)).toBe(500);
    expect(sanitizeLimit(-3, 50, 1, 500)).toBe(50);
    expect(sanitizeLimit(99999, 500, 1, 5000)).toBe(5000);
    expect(sanitizeLimit(42, 500, 1, 5000)).toBe(42);
  });
});

describe('resolveModel', () => {
  it('migrates known-stale model IDs', () => {
    expect(resolveModel('openai', 'gpt-5.1-mini')).toBe('gpt-5.6-luna');
    expect(resolveModel('anthropic', 'claude-3-5-haiku-latest')).toBe('claude-haiku-4-5');
    expect(resolveModel('gemini', 'gemini-1.5-flash')).toBe('gemini-3.6-flash');
  });

  it('keeps unknown custom IDs and defaults empty values', () => {
    expect(resolveModel('openai', 'my-fine-tune')).toBe('my-fine-tune');
    expect(resolveModel('openai', '')).toBe(PROVIDER_MODELS.openai[0]);
    expect(resolveModel('anthropic', undefined)).toBe(PROVIDER_MODELS.anthropic[0]);
  });

  it('maps every legacy entry to a non-empty replacement', () => {
    for (const [from, to] of Object.entries(LEGACY_MODEL_MAP)) {
      expect(to.length).toBeGreaterThan(0);
      expect(to).not.toBe(from);
    }
  });
});

describe('formatProviderError', () => {
  it('explains OpenAI quota errors without sounding like a silent local limit', () => {
    const message = formatProviderError(
      'openai',
      {
        error: {
          message: 'You exceeded your current quota, please check your plan and billing details.',
          type: 'insufficient_quota',
          code: 'insufficient_quota',
        },
      },
      429,
    );
    expect(message).toMatch(/billing\/quota/i);
    expect(message).toMatch(/ChatGPT Plus/i);
    expect(message).toMatch(/platform\.openai\.com/);
  });

  it('surfaces invalid keys and missing models clearly', () => {
    expect(
      formatProviderError('anthropic', { error: { message: 'invalid x-api-key', type: 'authentication_error' } }, 401),
    ).toMatch(/Invalid Claude/i);
    expect(
      formatProviderError('gemini', { error: { message: 'models/gemini-pro is not found' } }, 404),
    ).toMatch(/Model not available/i);
  });

  it('marks Gemini overload and rate limits as retryable status messages', () => {
    const overloaded = formatProviderError(
      'gemini',
      { error: { message: 'This model is currently experiencing high demand. Please try again later.' } },
      503,
    );
    expect(overloaded).toMatch(/\(503\)/);
    expect(overloaded).toMatch(/high demand/i);
    expect(isTransientProviderError(new Error(overloaded))).toBe(true);

    const rateLimited = formatProviderError('gemini', { error: { message: 'Resource exhausted' } }, 429);
    expect(rateLimited).toMatch(/\(429\)/);
    expect(isTransientProviderError(new Error(rateLimited))).toBe(true);
  });
});

describe('transient retries', () => {
  it('classifies overload/rate-limit messages and ignores auth failures', () => {
    expect(isTransientProviderError(new Error('Gemini error (503): high demand'))).toBe(true);
    expect(isTransientProviderError(new Error('OpenAI rate-limited this request (429).'))).toBe(true);
    expect(isTransientProviderError(new Error('Invalid Gemini API key.'))).toBe(false);
    expect(isTransientProviderError(new Error('Add an API key in AI settings first.'))).toBe(false);
  });

  it('uses extended exponential backoff before capping', () => {
    expect(transientRetryDelayMs(0, () => 0)).toBe(2500);
    expect(transientRetryDelayMs(1, () => 0)).toBe(5000);
    expect(transientRetryDelayMs(2, () => 0)).toBe(10000);
    expect(transientRetryDelayMs(4, () => 0)).toBe(40000);
    expect(transientRetryDelayMs(5, () => 0)).toBe(45000);
    expect(AI_TRANSIENT_MAX_RETRIES).toBeGreaterThanOrEqual(5);
  });
});

describe('loadAiSettings migrations', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it('repairs a zero dailyLimit that would immediately claim usage was exceeded', () => {
    localStorage.setItem(
      'resume-editor:ai-byok-settings:v1',
      JSON.stringify({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-5.1-mini',
        dailyLimit: 0,
        minuteLimit: 0,
        agentInstructions: '',
      }),
    );

    const settings = loadAiSettings();
    expect(settings.dailyLimit).toBe(500);
    expect(settings.minuteLimit).toBe(50);
    expect(settings.model).toBe('gpt-5.6-luna');
  });

  it('clears local usage counters', () => {
    localStorage.setItem(
      'resume-editor:ai-byok-usage:v1',
      JSON.stringify({ day: '2099-01-01', dailyCalls: 99, minuteWindow: 1, minuteCalls: 9 }),
    );
    resetAiUsage();
    expect(localStorage.getItem('resume-editor:ai-byok-usage:v1')).toBeNull();
  });
});

describe('BYOK prompt guides', () => {
  it('prepends universal and feature-specific guide steps to drawer prompts', () => {
    const resume = getTemplateDemoResume('general');
    const prompts = [
      promptForRewrite(resume, 'Worked on reports.', 'make it concise'),
      promptForSummary(resume),
      promptForCoverLetter(resume, 'Analyst role with SQL and dashboards.'),
      promptForAtsKeywords(resume, 'Analyst role with SQL and dashboards.'),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain('UNIVERSAL RULES');
      expect(prompt).toContain('Truth only');
    }
    expect(prompts[0]).toContain('FEATURE: Single-bullet rewrite options');
    expect(prompts[0]).toContain('XYZ');
    expect(prompts[0]).toContain('ACTION VERB BANK');
    expect(prompts[1]).toContain('FEATURE: Professional summary');
    expect(prompts[2]).toContain('FEATURE: Cover letter draft');
    expect(prompts[3]).toContain('FEATURE: ATS keyword scan');
  });
});
