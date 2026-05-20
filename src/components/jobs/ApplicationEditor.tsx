import { Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApplicationStatus, JobApplication, Resume } from '@/types';
import { STATUS_META, STATUS_ORDER } from './jobStatus';
import { useStatusLabel } from './statusLabels';

interface Props {
  resume: Resume;
  onChange: (next: JobApplication | undefined) => void;
  compact?: boolean;
}

export function ApplicationEditor({ resume, onChange, compact }: Props) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const app = resume.application ?? { status: 'drafting' as ApplicationStatus };

  const patch = (next: Partial<JobApplication>) => {
    const merged: JobApplication = { ...app, ...next };
    // Auto-fill appliedAt when status flips to applied/interview/offer and not set.
    if (!merged.appliedAt && (next.status === 'applied' || next.status === 'interview')) {
      merged.appliedAt = new Date().toISOString();
    }
    onChange(merged);
  };

  if (compact) {
    return (
      <select
        value={app.status}
        onChange={(e) => patch({ status: e.target.value as ApplicationStatus })}
        className={`rounded-md border px-2 py-1 text-xs font-medium ${STATUS_META[app.status].chip}`}
        aria-label={t('jobs.status')}
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-paper-edge bg-paper p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Briefcase size={15} />
        {t('jobs.title')}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.targetRole')}</span>
          <input
            value={app.targetRole ?? ''}
            onChange={(e) => patch({ targetRole: e.target.value })}
            placeholder={t('jobs.targetRolePlaceholder')}
            className="input"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.company')}</span>
          <input
            value={app.companyName ?? ''}
            onChange={(e) => patch({ companyName: e.target.value })}
            placeholder={t('jobs.companyPlaceholder')}
            className="input"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.status')}</span>
          <select
            value={app.status}
            onChange={(e) => patch({ status: e.target.value as ApplicationStatus })}
            className="input"
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.dateApplied')}</span>
          <input
            type="date"
            value={app.appliedAt ? app.appliedAt.slice(0, 10) : ''}
            onChange={(e) =>
              patch({
                appliedAt: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : undefined,
              })
            }
            className="input"
          />
        </label>
      </div>
      <label className="block text-xs">
        <span className="mb-1 block text-ink-muted">{t('jobs.notes')}</span>
        <textarea
          value={app.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
          className="input min-h-16 resize-y"
          placeholder={t('jobs.notesPlaceholder')}
        />
      </label>
    </div>
  );
}
