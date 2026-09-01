import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeCompanyTarget } from '@/types/schema';
import {
  createCompanyTarget,
  listCompanies,
  reorderCompanies,
  saveCompanyTarget,
} from '@/utils/companies';
import { formatSalaryRange } from '@/utils/salaryFormat';

const store = new Map<string, unknown>();

vi.mock('idb-keyval', () => ({
  get: async (key: string) => store.get(key),
  set: async (key: string, value: unknown) => {
    store.set(key, value);
  },
  del: async (key: string) => {
    store.delete(key);
  },
  keys: async () => [...store.keys()],
}));

describe('companies persistence', () => {
  beforeEach(() => {
    store.clear();
  });

  it('creates and reorders company targets', () => {
    const a = createCompanyTarget({ companyName: 'Stripe' });
    const b = createCompanyTarget({ companyName: 'Meta' });
    expect(listCompanies().map((c) => c.id)).toEqual([a.id, b.id]);
    reorderCompanies([b.id, a.id]);
    expect(listCompanies().map((c) => c.companyName)).toEqual(['Meta', 'Stripe']);
    expect(listCompanies()[0].rank).toBe(0);
  });

  it('normalizes company targets from backup payloads', () => {
    const target = normalizeCompanyTarget({
      companyName: 'Anthropic',
      roles: [{ title: 'Research Engineer', salary: { min: 200000, currency: 'USD' } }],
    });
    expect(target?.roles[0].title).toBe('Research Engineer');
    expect(target?.roles[0].salary?.min).toBe(200000);
  });

  it('upserts by id', () => {
    const created = createCompanyTarget({ companyName: 'Notion' });
    saveCompanyTarget({ ...created, notes: 'Great culture' });
    expect(listCompanies().find((c) => c.id === created.id)?.notes).toBe('Great culture');
  });
});

describe('formatSalaryRange', () => {
  it('formats ranges and open-ended values', () => {
    expect(formatSalaryRange({ min: 120000, max: 150000, currency: 'USD' })).toBe('120k–150k');
    expect(formatSalaryRange({ min: 180000, currency: 'USD' })).toBe('180k+');
    expect(formatSalaryRange({ max: 90000, currency: 'USD' })).toBe('up to 90k');
  });
});
