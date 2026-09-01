import type { ApplicationStatus, CompanyRole, CompanyTarget, JobApplication, Resume } from '@/types';
import {
  createCompanyTarget,
  findCompanyByName,
  getCompany,
  listCompanies,
  normalizeCompanyName,
  unlinkResumeFromCompany,
  updateCompanyTarget,
} from '@/utils/companies';
import { makeId } from '@/utils/id';
import { listResumes, saveResume } from '@/store/persistence';

const STATUS_RANK: Record<ApplicationStatus, number> = {
  drafting: 0,
  applied: 1,
  interview: 2,
  offer: 3,
  rejected: 4,
  archived: 5,
};

function mostAdvancedStatus(statuses: ApplicationStatus[]): ApplicationStatus {
  let best: ApplicationStatus = 'drafting';
  let bestRank = -1;
  for (const status of statuses) {
    const rank = STATUS_RANK[status];
    if (rank > bestRank) {
      bestRank = rank;
      best = status;
    }
  }
  return best;
}

function applicationFromResume(resume: Resume): JobApplication {
  return resume.application ?? { status: 'drafting' };
}

function syncRoleFromResume(target: CompanyTarget, resume: Resume): CompanyRole[] {
  const app = applicationFromResume(resume);
  const title = app.targetRole?.trim();
  if (!title) return target.roles;

  const existing = target.roles.find((role) => role.resumeId === resume.id);
  if (existing) {
    return target.roles.map((role) =>
      role.resumeId === resume.id
        ? {
            ...role,
            title,
            status: app.status,
            salary: app.salary ?? role.salary,
            notes: app.notes ?? role.notes,
          }
        : role,
    );
  }

  return [
    ...target.roles,
    {
      id: makeId(),
      title,
      resumeId: resume.id,
      status: app.status,
      salary: app.salary,
      notes: app.notes,
    },
  ];
}

/** Drop companyTargetId on a resume after unlinking from the company entity. */
export function detachResumeFromCompanyTarget(resume: Resume): Resume {
  const app = applicationFromResume(resume);
  if (!app.companyTargetId) return resume;
  unlinkResumeFromCompany(resume.id, app.companyTargetId);
  return {
    ...resume,
    application: { ...app, companyTargetId: undefined },
  };
}

/** Clear companyTargetId on every resume still pointing at a deleted company. */
export function detachAllResumesFromCompany(companyId: string, resumes: Resume[]): void {
  for (const resume of resumes) {
    if (resume.application?.companyTargetId !== companyId) continue;
    saveResume({
      ...detachResumeFromCompanyTarget(resume),
      updatedAt: new Date().toISOString(),
    });
  }
}

/** Push resume application fields into the linked (or matching) company target. */
export function syncResumeToCompany(resume: Resume): Resume {
  const app = applicationFromResume(resume);
  const companyName = app.companyName?.trim();

  if (!companyName) {
    if (app.companyTargetId) {
      unlinkResumeFromCompany(resume.id, app.companyTargetId);
      return {
        ...resume,
        application: { ...app, companyTargetId: undefined },
      };
    }
    return resume;
  }

  let target: CompanyTarget | null = null;
  const byName = findCompanyByName(companyName);

  if (app.companyTargetId) {
    target = getCompany(app.companyTargetId);
    if (
      target &&
      normalizeCompanyName(target.companyName) !== normalizeCompanyName(companyName)
    ) {
      unlinkResumeFromCompany(resume.id, target.id);
      target = byName;
    }
  }

  if (!target) {
    target = byName;
  }

  if (!target) {
    target = createCompanyTarget({
      companyName,
      connectionStatus: app.connectionStatus ?? 'none',
      connectionNotes: app.connectionNotes,
      status: app.status,
      notes: app.notes,
      roles: [],
    });
  }

  const roles = syncRoleFromResume(target, resume);
  const statuses = roles.map((role) => role.status ?? target!.status);
  updateCompanyTarget(target.id, {
    companyName,
    connectionStatus: app.connectionStatus ?? target.connectionStatus,
    connectionNotes: app.connectionNotes ?? target.connectionNotes,
    status: mostAdvancedStatus([app.status, ...statuses]),
    roles,
  });

  const nextApp: JobApplication = {
    ...app,
    companyTargetId: target.id,
    companyName,
  };
  return { ...resume, application: nextApp };
}

/** Pull company target fields into a resume's application block. */
export function syncCompanyToResume(resume: Resume, target: CompanyTarget): Resume {
  const app = applicationFromResume(resume);
  const role = target.roles.find((item) => item.resumeId === resume.id);
  const nextApp: JobApplication = {
    ...app,
    companyTargetId: target.id,
    companyName: target.companyName,
    targetRole: role?.title ?? app.targetRole,
    status: role?.status ?? target.status,
    connectionStatus: target.connectionStatus,
    connectionNotes: target.connectionNotes,
    salary: role?.salary ?? app.salary,
    notes: role?.notes ?? app.notes ?? target.notes,
  };
  return { ...resume, application: nextApp };
}

/** Sync linked resumes and detach any that no longer reference this company. */
export function syncCompanyTargetToResumes(target: CompanyTarget, resumes: Resume[]): void {
  const linkedIds = new Set(
    target.roles.map((role) => role.resumeId).filter((id): id is string => Boolean(id)),
  );

  for (const role of target.roles) {
    if (!role.resumeId) continue;
    const resume = resumes.find((item) => item.id === role.resumeId);
    if (!resume) continue;
    const synced = syncCompanyToResume(resume, target);
    saveResume({ ...synced, updatedAt: new Date().toISOString() });
  }

  for (const resume of resumes) {
    if (resume.application?.companyTargetId !== target.id) continue;
    if (linkedIds.has(resume.id)) continue;
    saveResume({
      ...detachResumeFromCompanyTarget(resume),
      updatedAt: new Date().toISOString(),
    });
  }
}

/** One-time backfill: create company targets from existing resumes. */
export function migrateCompaniesFromResumes(): number {
  const resumes = listResumes();
  const withCompany = resumes.filter((resume) => resume.application?.companyName?.trim());
  if (withCompany.length === 0) return 0;

  const beforeCount = listCompanies().length;
  for (const resume of withCompany) {
    const synced = syncResumeToCompany(resume);
    saveResume({ ...synced, updatedAt: new Date().toISOString() });
  }
  const afterCount = listCompanies().length;
  return Math.max(0, afterCount - beforeCount);
}
