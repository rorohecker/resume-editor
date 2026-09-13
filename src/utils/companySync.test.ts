import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Resume } from '@/types';
import { getCompany, listCompanies, saveAllCompanies } from '@/utils/companies';
import { syncCompanyTargetToResumes, syncResumeToCompany } from '@/utils/companySync';

const store = new Map<string, unknown>();
const resumes = new Map<string, Resume>();

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

vi.mock('@/store/persistence', () => ({
  listResumes: () => [...resumes.values()],
  saveResume: (resume: Resume) => {
    resumes.set(resume.id, resume);
  },
}));

function baseResume(overrides: Partial<Resume> = {}): Resume {
  return {
    id: 'resume-1',
    name: 'Backend Resume',
    template: 'general',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    header: { name: 'Alex', contactFields: [], separatorStyle: '|' },
    sections: [],
    styles: {
      font: 'Inter',
      fontSize: { name: 22, sectionHeader: 11, entryTitle: 10, body: 10, contactLine: 9 },
      colors: {
        name: '#000',
        sectionHeader: '#000',
        body: '#111',
        sectionRule: '#000',
        accent: '#111',
      },
      margins: { top: 0.5, bottom: 0.5, left: 0.6, right: 0.6 },
      spacing: { section: 10, entry: 6, bullet: 1.25 },
      ruleStyle: { variant: 'full', weight: 1 },
      dateFormat: 'month-year',
      paperSize: 'letter',
      onePageMode: true,
      pageNumbers: false,
    },
    application: { status: 'drafting', companyName: 'Stripe' },
    ...overrides,
  };
}

describe('companySync', () => {
  beforeEach(async () => {
    store.clear();
    resumes.clear();
    await saveAllCompanies([]);
  });

  it('keeps name-only applications linked with a placeholder role', () => {
    const synced = syncResumeToCompany(baseResume());
    expect(synced.application?.companyTargetId).toBeTruthy();

    const target = getCompany(synced.application!.companyTargetId!);
    expect(target?.roles).toHaveLength(1);
    expect(target?.roles[0]?.resumeId).toBe('resume-1');
    expect(target?.roles[0]?.title).toBe('Backend Resume');

    resumes.set(synced.id, synced);
    syncCompanyTargetToResumes(target!, [synced]);
    expect(resumes.get('resume-1')?.application?.companyTargetId).toBe(target!.id);
    expect(listCompanies()).toHaveLength(1);
  });

  it('syncs status changes even when targetRole is blank', () => {
    const withRole = syncResumeToCompany(
      baseResume({
        application: {
          status: 'drafting',
          companyName: 'Notion',
          targetRole: 'Software Engineer',
        },
      }),
    );
    const companyId = withRole.application!.companyTargetId!;
    expect(getCompany(companyId)?.roles[0]?.status).toBe('drafting');

    const clearedTitle = syncResumeToCompany({
      ...withRole,
      application: {
        ...withRole.application!,
        targetRole: '',
        status: 'interview',
      },
    });

    const target = getCompany(companyId);
    expect(target?.roles).toHaveLength(1);
    expect(target?.roles[0]?.resumeId).toBe('resume-1');
    expect(target?.roles[0]?.status).toBe('interview');
    expect(target?.roles[0]?.title).toBe('Software Engineer');
    expect(clearedTitle.application?.companyTargetId).toBe(companyId);
    expect(listCompanies()).toHaveLength(1);
  });
});
