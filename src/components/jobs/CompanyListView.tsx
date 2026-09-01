import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CompanyTarget, Resume } from '@/types';
import { SortableList } from '@/components/shared/Sortable';
import { STATUS_META } from './jobStatus';
import { useStatusLabel } from './statusLabels';
import { CONNECTION_META } from './connectionStatus';
import { useConnectionLabel } from './connectionLabels';
import { CompanyTargetModal } from './CompanyTargetModal';
import { formatSalaryRange } from '@/utils/salaryFormat';
import {
  deleteCompanyTarget,
  findCompanyByName,
  listCompanies,
  onCompaniesHydrated,
  onCompaniesRemoteUpdate,
  reorderCompanies,
  saveCompanyTarget,
} from '@/utils/companies';
import { detachAllResumesFromCompany, syncCompanyTargetToResumes } from '@/utils/companySync';
import { toast } from '@/hooks/useToast';

interface Props {
  resumes: Resume[];
  onOpenResume: (resumeId: string) => void;
  onRefreshResumes: () => void;
}

export function CompanyListView({ resumes, onOpenResume, onRefreshResumes }: Props) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const connectionLabel = useConnectionLabel();
  const [companies, setCompanies] = useState(() => listCompanies());
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyTarget | null>(null);

  const refresh = () => setCompanies(listCompanies());

  useEffect(() => {
    refresh();
    const unsubHydrate = onCompaniesHydrated(() => refresh());
    const unsubRemote = onCompaniesRemoteUpdate(() => refresh());
    return () => {
      unsubHydrate();
      unsubRemote();
    };
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((company) => {
      const haystack = [
        company.companyName,
        company.notes,
        company.connectionNotes,
        ...company.roles.map((role) => role.title),
        ...company.roles.map((role) => role.notes ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [companies, search]);

  const handleReorder = (next: CompanyTarget[]) => {
    reorderCompanies(next.map((item) => item.id));
    refresh();
  };

  const syncLinkedResumes = (target: CompanyTarget) => {
    syncCompanyTargetToResumes(target, resumes);
    onRefreshResumes();
  };

  const handleSave = (target: CompanyTarget) => {
    const duplicate = findCompanyByName(target.companyName);
    if (duplicate && duplicate.id !== target.id) {
      toast(t('companies.duplicateName'), { tone: 'warn', ttl: 2500 });
      return;
    }
    saveCompanyTarget(target);
    syncLinkedResumes(target);
    refresh();
    toast(t('companies.saved'), { tone: 'success', ttl: 1500 });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm(t('companies.deleteConfirm'))) return;
    detachAllResumesFromCompany(id, resumes);
    deleteCompanyTarget(id);
    onRefreshResumes();
    refresh();
    toast(t('companies.deleted'), { tone: 'info' });
  };

  if (companies.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-paper-edge bg-paper p-8 text-center">
        <h2 className="text-lg font-semibold text-ink">{t('companies.emptyTitle')}</h2>
        <p className="mt-2 text-sm text-ink-muted">{t('companies.emptyHint')}</p>
        <button
          type="button"
          className="btn-primary mt-4"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} />
          {t('companies.addCompany')}
        </button>
        <CompanyTargetModal
          open={modalOpen}
          target={editing}
          resumes={resumes}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus size={15} />
          {t('companies.addCompany')}
        </button>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('companies.searchPlaceholder')}
            className="input pl-8"
            aria-label={t('companies.searchPlaceholder')}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t('companies.noResults')}</p>
      ) : search.trim() ? (
        <div className="space-y-2">
          {filtered.map((company) => (
            <CompanyRow
              key={company.id}
              company={company}
              resumes={resumes}
              expanded={expandedId === company.id}
              onToggle={() => setExpandedId(expandedId === company.id ? null : company.id)}
              onEdit={() => {
                setEditing(company);
                setModalOpen(true);
              }}
              onOpenResume={onOpenResume}
              statusLabel={statusLabel}
              connectionLabel={connectionLabel}
            />
          ))}
        </div>
      ) : (
        <SortableList items={companies} onReorder={handleReorder} className="space-y-2">
          {(company, handle) => (
            <CompanyRow
              key={company.id}
              company={company}
              resumes={resumes}
              expanded={expandedId === company.id}
              onToggle={() => setExpandedId(expandedId === company.id ? null : company.id)}
              onEdit={() => {
                setEditing(company);
                setModalOpen(true);
              }}
              onOpenResume={onOpenResume}
              statusLabel={statusLabel}
              connectionLabel={connectionLabel}
              dragHandle={handle}
            />
          )}
        </SortableList>
      )}

      <CompanyTargetModal
        open={modalOpen}
        target={editing}
        resumes={resumes}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

function CompanyRow({
  company,
  resumes,
  expanded,
  onToggle,
  onEdit,
  onOpenResume,
  statusLabel,
  connectionLabel,
  dragHandle,
}: {
  company: CompanyTarget;
  resumes: Resume[];
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onOpenResume: (resumeId: string) => void;
  statusLabel: (status: CompanyTarget['status']) => string;
  connectionLabel: (status: CompanyTarget['connectionStatus']) => string;
  dragHandle?: ReactNode;
}) {
  const { t } = useTranslation();
  const statusMeta = STATUS_META[company.status];
  const connectionMeta = CONNECTION_META[company.connectionStatus];
  const salarySummary =
    company.roles.map((role) => formatSalaryRange(role.salary)).find(Boolean) ?? '';

  return (
    <div className="rounded-md border border-paper-edge bg-paper shadow-sm">
      <div className="flex items-start gap-2 p-3">
        {dragHandle}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-paper-tint px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">
              #{company.rank + 1}
            </span>
            <span className="font-semibold text-ink">{company.companyName}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${connectionMeta.pillBg} ${connectionMeta.pillText}`}
            >
              {connectionLabel(company.connectionStatus)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusMeta.pillBg} ${statusMeta.pillText}`}
            >
              {statusLabel(company.status)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
            <span>
              {company.roles.length === 1
                ? company.roles[0].title
                : t('companies.roleCount', { count: company.roles.length })}
            </span>
            {salarySummary && <span>{salarySummary}</span>}
          </div>
          {company.connectionNotes && !expanded && (
            <p className="mt-1 truncate text-xs text-ink-subtle">{company.connectionNotes}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="icon-btn h-8 w-8"
            onClick={onEdit}
            aria-label={t('companies.editCompany')}
          >
            <Pencil size={14} />
          </button>
          <button
            type="button"
            className="icon-btn h-8 w-8"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? t('companies.collapse') : t('companies.expand')}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-paper-edge bg-paper-tint px-3 py-3 text-xs space-y-3">
          {company.connectionNotes && (
            <div>
              <div className="font-medium text-ink-muted">{t('companies.connectionNotes')}</div>
              <p className="mt-1 text-ink">{company.connectionNotes}</p>
            </div>
          )}
          {company.roles.length > 0 && (
            <div>
              <div className="font-medium text-ink-muted">{t('companies.roles')}</div>
              <ul className="mt-1 space-y-2">
                {company.roles.map((role) => {
                  const linked = resumes.find((item) => item.id === role.resumeId);
                  return (
                    <li key={role.id} className="rounded border border-paper-edge bg-paper p-2">
                      <div className="font-medium text-ink">{role.title}</div>
                      {formatSalaryRange(role.salary) && (
                        <div className="text-ink-muted">{formatSalaryRange(role.salary)}</div>
                      )}
                      {role.notes && <p className="mt-1 text-ink-subtle">{role.notes}</p>}
                      {linked && (
                        <button
                          type="button"
                          className="mt-2 btn-ghost text-[11px]"
                          onClick={() => onOpenResume(linked.id)}
                        >
                          {t('companies.openResume', { name: linked.name })}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {company.notes && (
            <div>
              <div className="font-medium text-ink-muted">{t('jobs.notes')}</div>
              <p className="mt-1 text-ink">{company.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
