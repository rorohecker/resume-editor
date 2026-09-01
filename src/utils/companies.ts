import { get as idbGet, set as idbSet } from 'idb-keyval';
import type { CompanyTarget } from '@/types';
import { normalizeCompanyTarget } from '@/types/schema';
import { makeId } from '@/utils/id';

const COMPANIES_KEY = 'companies:list';

let cache: CompanyTarget[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
const hydrateListeners = new Set<() => void>();

const channel: BroadcastChannel | null =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('resume-editor-companies');
const remoteUpdateListeners = new Set<() => void>();

if (channel) {
  channel.onmessage = (event: MessageEvent<CompanyTarget[]>) => {
    if (!Array.isArray(event.data)) return;
    cache = event.data.map((item, index) => normalizeCompanyTarget(item, index)).filter(Boolean) as CompanyTarget[];
    for (const listener of remoteUpdateListeners) listener();
  };
}

function broadcast(): void {
  try {
    channel?.postMessage(cache);
  } catch {
    // cross-tab sync is best-effort
  }
}

export function onCompaniesHydrated(listener: () => void): () => void {
  if (hydrated) {
    listener();
    return () => {};
  }
  hydrateListeners.add(listener);
  return () => hydrateListeners.delete(listener);
}

export function onCompaniesRemoteUpdate(listener: () => void): () => void {
  remoteUpdateListeners.add(listener);
  return () => remoteUpdateListeners.delete(listener);
}

export function isCompaniesHydrated(): boolean {
  return hydrated;
}

export function hydrateCompanies(): Promise<void> {
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const value = await idbGet<unknown>(COMPANIES_KEY);
      if (Array.isArray(value)) {
        cache = value
          .map((item, index) => normalizeCompanyTarget(item, index))
          .filter((item): item is CompanyTarget => Boolean(item));
        reindexRanks();
      }
    } catch (err) {
      console.warn('Company list hydration failed; continuing with empty list.', err);
      cache = [];
    } finally {
      hydrated = true;
      for (const listener of hydrateListeners) listener();
      hydrateListeners.clear();
    }
  })();
  return hydratePromise;
}

function reindexRanks(): void {
  cache = cache.map((item, index) => ({ ...item, rank: index }));
}

async function persist(): Promise<void> {
  await idbSet(COMPANIES_KEY, cache);
  broadcast();
}

export function listCompanies(): CompanyTarget[] {
  return [...cache].sort((a, b) => a.rank - b.rank);
}

export function getCompany(id: string): CompanyTarget | null {
  return cache.find((item) => item.id === id) ?? null;
}

export function findCompanyByName(companyName: string): CompanyTarget | null {
  const normalized = normalizeCompanyName(companyName);
  if (!normalized) return null;
  return cache.find((item) => normalizeCompanyName(item.companyName) === normalized) ?? null;
}

export function normalizeCompanyName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function saveCompanyTarget(target: CompanyTarget): CompanyTarget {
  const index = cache.findIndex((item) => item.id === target.id);
  const normalized = normalizeCompanyTarget(target, index >= 0 ? index : cache.length);
  if (!normalized) throw new Error('Invalid company target.');
  if (index >= 0) {
    cache[index] = normalized;
  } else {
    cache.push(normalized);
  }
  reindexRanks();
  void persist();
  return normalized;
}

export function createCompanyTarget(
  partial: Partial<CompanyTarget> & { companyName: string },
): CompanyTarget {
  const now = new Date().toISOString();
  const target = normalizeCompanyTarget({
    id: makeId(),
    companyName: partial.companyName,
    rank: cache.length,
    connectionStatus: partial.connectionStatus ?? 'none',
    connectionNotes: partial.connectionNotes,
    roles: partial.roles ?? [],
    status: partial.status ?? 'drafting',
    notes: partial.notes,
    website: partial.website,
    createdAt: now,
    updatedAt: now,
  });
  if (!target) throw new Error('Invalid company name.');
  cache.push(target);
  reindexRanks();
  void persist();
  return target;
}

export function updateCompanyTarget(id: string, patch: Partial<CompanyTarget>): CompanyTarget | null {
  const index = cache.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const merged = normalizeCompanyTarget(
    {
      ...cache[index],
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    },
    index,
  );
  if (!merged) return null;
  cache[index] = merged;
  void persist();
  return merged;
}

export function deleteCompanyTarget(id: string): void {
  cache = cache.filter((item) => item.id !== id);
  reindexRanks();
  void persist();
}

export function reorderCompanies(orderedIds: string[]): void {
  const byId = new Map(cache.map((item) => [item.id, item]));
  const next: CompanyTarget[] = [];
  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) next.push(item);
  }
  for (const item of cache) {
    if (!orderedIds.includes(item.id)) next.push(item);
  }
  cache = next.map((item, index) => ({ ...item, rank: index, updatedAt: item.updatedAt }));
  void persist();
}

export async function saveAllCompanies(companies: CompanyTarget[]): Promise<void> {
  cache = companies
    .map((item, index) => normalizeCompanyTarget(item, index))
    .filter((item): item is CompanyTarget => Boolean(item));
  reindexRanks();
  await persist();
}

export function replaceCompaniesFromBackup(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  const parsed = raw
    .map((item, index) => normalizeCompanyTarget(item, index))
    .filter((item): item is CompanyTarget => Boolean(item));
  if (parsed.length === 0) return 0;
  cache = parsed;
  reindexRanks();
  void persist();
  return parsed.length;
}
