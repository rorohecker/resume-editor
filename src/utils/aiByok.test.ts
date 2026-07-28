import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTemplateDemoResume } from '@/components/templates/templateDemos';
import {
  LEGACY_MODEL_MAP,
  PROVIDER_MODELS,
  formatProviderError,
  loadAiSettings,
  promptForAtsKeywords,
  promptForCoverLetter,
  promptForRewrite,
  promptForSummary,
  resetAiUsage,
  resolveModel,
  sanitizeLimit,
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
    expect(prompts[1]).toContain('FEATURE: Professional summary');
    expect(prompts[2]).toContain('FEATURE: Cover letter draft');
    expect(prompts[3]).toContain('FEATURE: ATS keyword scan');
  });
});
