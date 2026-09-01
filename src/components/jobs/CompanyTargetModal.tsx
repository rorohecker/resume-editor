import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';
import type {
  ApplicationStatus,
  CompanyRole,
  CompanyTarget,
  ConnectionStatus,
  Resume,
} from '@/types';
import { makeId } from '@/utils/id';
import { STATUS_ORDER } from './jobStatus';
import { useStatusLabel } from './statusLabels';
import { CONNECTION_ORDER } from './connectionStatus';
import { useConnectionLabel } from './connectionLabels';
import { SalaryInput } from './SalaryInput';

interface Props {
  open: boolean;
  target?: CompanyTarget | null;
  resumes: Resume[];
  onClose: () => void;
  onSave: (target: CompanyTarget) => void;
  onDelete?: (id: string) => void;
}

function emptyRole(): CompanyRole {
  return { id: makeId(), title: '' };
}

export function CompanyTargetModal({
  open,
  target,
  resumes,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const connectionLabel = useConnectionLabel();
  const [draft, setDraft] = useState<Partial<CompanyTarget>>({});
  const [roles, setRoles] = useState<CompanyRole[]>([]);

  useEffect(() => {
    if (!open) return;
    if (target) {
      setDraft({ ...target });
      setRoles(target.roles.length > 0 ? [...target.roles] : [emptyRole()]);
    } else {
      setDraft({
        companyName: '',
        connectionStatus: 'none',
        status: 'drafting',
      });
      setRoles([emptyRole()]);
    }
  }, [open, target]);

  const patch = (next: Partial<CompanyTarget>) => setDraft((prev) => ({ ...prev, ...next }));

  const patchRole = (id: string, next: Partial<CompanyRole>) => {
    setRoles((prev) => prev.map((role) => (role.id === id ? { ...role, ...next } : role)));
  };

  const handleSave = () => {
    const companyName = draft.companyName?.trim();
    if (!companyName) return;
    const now = new Date().toISOString();
    const cleanedRoles = roles
      .map((role) => ({ ...role, title: role.title.trim() }))
      .filter((role) => role.title);
    const saved: CompanyTarget = {
      id: target?.id ?? makeId(),
      companyName,
      rank: target?.rank ?? 0,
      connectionStatus: (draft.connectionStatus as ConnectionStatus) ?? 'none',
      connectionNotes: draft.connectionNotes?.trim() || undefined,
      roles: cleanedRoles,
      status: (draft.status as ApplicationStatus) ?? 'drafting',
      notes: draft.notes?.trim() || undefined,
      website: draft.website?.trim() || undefined,
      createdAt: target?.createdAt ?? now,
      updatedAt: now,
    };
    onSave(saved);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target ? t('companies.editCompany') : t('companies.addCompany')}
      maxWidth="2xl"
    >
      <div className="space-y-4">
        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.company')}</span>
          <input
            value={draft.companyName ?? ''}
            onChange={(e) => patch({ companyName: e.target.value })}
            placeholder={t('jobs.companyPlaceholder')}
            className="input"
            required
          />
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block text-ink-muted">{t('companies.connection')}</span>
            <select
              value={draft.connectionStatus ?? 'none'}
              onChange={(e) => patch({ connectionStatus: e.target.value as ConnectionStatus })}
              className="input"
            >
              {CONNECTION_ORDER.map((status) => (
                <option key={status} value={status}>{connectionLabel(status)}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-ink-muted">{t('jobs.status')}</span>
            <select
              value={draft.status ?? 'drafting'}
              onChange={(e) => patch({ status: e.target.value as ApplicationStatus })}
              className="input"
            >
              {STATUS_ORDER.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('companies.connectionNotes')}</span>
          <textarea
            value={draft.connectionNotes ?? ''}
            onChange={(e) => patch({ connectionNotes: e.target.value })}
            className="input min-h-16 resize-y"
            placeholder={t('companies.connectionNotesPlaceholder')}
          />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-ink">{t('companies.roles')}</span>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setRoles((prev) => [...prev, emptyRole()])}
            >
              <Plus size={12} />
              {t('companies.addRole')}
            </button>
          </div>
          <div className="space-y-3">
            {roles.map((role) => (
              <div key={role.id} className="rounded-md border border-paper-edge bg-paper-tint p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={role.title}
                    onChange={(e) => patchRole(role.id, { title: e.target.value })}
                    placeholder={t('jobs.targetRolePlaceholder')}
                    className="input flex-1"
                    aria-label={t('jobs.targetRole')}
                  />
                  <button
                    type="button"
                    className="icon-btn h-9 w-9 hover:text-danger"
                    onClick={() => setRoles((prev) => prev.filter((item) => item.id !== role.id))}
                    aria-label={t('companies.removeRole')}
                    disabled={roles.length <= 1}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="block text-xs">
                    <span className="mb-1 block text-ink-muted">{t('companies.linkedResume')}</span>
                    <select
                      value={role.resumeId ?? ''}
                      onChange={(e) =>
                        patchRole(role.id, { resumeId: e.target.value || undefined })
                      }
                      className="input"
                    >
                      <option value="">{t('companies.noLinkedResume')}</option>
                      {resumes.map((resume) => (
                        <option key={resume.id} value={resume.id}>{resume.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-ink-muted">{t('jobs.status')}</span>
                    <select
                      value={role.status ?? draft.status ?? 'drafting'}
                      onChange={(e) =>
                        patchRole(role.id, { status: e.target.value as ApplicationStatus })
                      }
                      className="input"
                    >
                      {STATUS_ORDER.map((status) => (
                        <option key={status} value={status}>{statusLabel(status)}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <SalaryInput
                  value={role.salary}
                  onChange={(salary) => patchRole(role.id, { salary })}
                />
                <textarea
                  value={role.notes ?? ''}
                  onChange={(e) => patchRole(role.id, { notes: e.target.value })}
                  className="input min-h-12 resize-y text-xs"
                  placeholder={t('jobs.notesPlaceholder')}
                />
              </div>
            ))}
          </div>
        </div>

        <label className="block text-xs">
          <span className="mb-1 block text-ink-muted">{t('jobs.notes')}</span>
          <textarea
            value={draft.notes ?? ''}
            onChange={(e) => patch({ notes: e.target.value })}
            className="input min-h-16 resize-y"
            placeholder={t('companies.generalNotesPlaceholder')}
          />
        </label>

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <div>
            {target && onDelete && (
              <button
                type="button"
                className="btn-ghost text-xs text-danger"
                onClick={() => {
                  onDelete(target.id);
                  onClose();
                }}
              >
                <Trash2 size={12} />
                {t('companies.deleteCompany')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={!draft.companyName?.trim()}
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
