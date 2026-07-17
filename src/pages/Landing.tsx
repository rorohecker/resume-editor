import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FileText, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { TEMPLATES } from '@/components/templates/registry';
import { LiveTemplateThumbnail } from '@/components/templates/LiveTemplateThumbnail';
import { ImportResumeModal } from '@/components/import/ImportResumeModal';
import { ToastViewport } from '@/components/shared/ToastViewport';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { AccentToggle } from '@/components/shared/AccentToggle';
import { LocaleToggle } from '@/components/shared/LocaleToggle';
import { STATUS_META, STATUS_ORDER } from '@/components/jobs/jobStatus';
import { useStatusLabel } from '@/components/jobs/statusLabels';
import { toast } from '@/hooks/useToast';
import { recordBackup } from '@/utils/updateCheck';
import { useStore } from '@/store';
import type { ApplicationStatus, Resume } from '@/types';
import {
  deleteResume,
  duplicateResume,
  exportAllData,
  isHydrated,
  listResumes,
  loadResume,
  onHydrated,
  renameResume,
  saveResume,
} from '@/store/persistence';
import type { TemplateId } from '@/types';

type View = 'list' | 'kanban';

export function LandingPage() {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const navigate = useNavigate();
  const createResumeFromTemplate = useStore((s) => s.createResumeFromTemplate);
  const setCurrentResume = useStore((s) => s.setCurrentResume);
  const [importOpen, setImportOpen] = useState(false);
  const [resumes, setResumes] = useState(() => (isHydrated() ? listResumes() : []));
  const [view, setView] = useState<View>('list');
  const recents = resumes;

  const refresh = () => setResumes(listResumes());

  useEffect(() => {
    if (isHydrated()) return;
    const unsubscribe = onHydrated(() => refresh());
    return unsubscribe;
  }, []);

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: resumes.filter((r) => (r.application?.status ?? 'drafting') === status),
  }));

  const handleStart = (template: TemplateId) => {
    const resume = createResumeFromTemplate(template);
    refresh();
    navigate(`/editor/${resume.id}`);
  };

  const exportBackup = () => {
    void exportAllData().then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resume-editor-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      recordBackup();
      toast(t('landing.backupSaved'), { tone: 'success', ttl: 2000 });
    });
  };

  const moveResumeStatus = (resumeId: string, status: ApplicationStatus) => {
    const current = loadResume(resumeId);
    if (!current) return;
    const prev = current.application?.status ?? 'drafting';
    if (prev === status) return;
    const application = {
      ...(current.application ?? { status: 'drafting' as ApplicationStatus }),
      status,
      appliedAt:
        !current.application?.appliedAt && (status === 'applied' || status === 'interview')
          ? new Date().toISOString()
          : current.application?.appliedAt,
    };
    saveResume({
      ...current,
      application,
      updatedAt: new Date().toISOString(),
    });
    refresh();
    toast(t('landing.movedToStatus', { status: statusLabel(status) }), {
      tone: 'success',
      ttl: 1500,
    });
  };

  return (
    <div className="min-h-full bg-paper-tint">
      <header className="border-b border-paper-edge bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-paper">
              <FileText size={18} />
            </div>
            <span className="font-semibold tracking-tight">{t('app.name')}</span>
          </div>
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <AccentToggle compact />
            <ThemeToggle compact />
            <button className="btn-secondary" type="button" onClick={() => setImportOpen(true)}>
              <Upload size={16} />
              {t('landing.importExisting')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {recents.length === 0 && (
          <section className="mb-12 rounded-lg border border-dashed border-paper-edge bg-paper p-8 text-center">
            <h2 className="text-lg font-semibold text-ink">{t('landing.emptyTitle')}</h2>
            <p className="mt-2 text-sm text-ink-muted">{t('landing.emptyHint')}</p>
          </section>
        )}
        {recents.length > 0 && (
          <section className="mb-12">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-ink">{t('landing.manager')}</h1>
                <p className="text-sm text-ink-muted">
                  {t('landing.managerHint')} {resumes.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div
                  role="radiogroup"
                  aria-label={t('landing.viewMode')}
                  className="inline-flex rounded-md border border-paper-edge bg-paper p-0.5"
                >
                  {(['list', 'kanban'] as View[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={view === v}
                      onClick={() => setView(v)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        view === v ? 'bg-ink text-paper' : 'text-ink-muted hover:bg-paper-tint'
                      }`}
                    >
                      {v === 'list' ? t('landing.viewList') : t('landing.viewKanban')}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-secondary" onClick={exportBackup}>
                  <Download size={15} />
                  {t('landing.exportBackup')}
                </button>
              </div>
            </div>

            {view === 'kanban' ? (
              <KanbanView grouped={grouped} navigate={navigate} onMoveStatus={moveResumeStatus} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recents.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-md border border-paper-edge bg-paper p-4 text-left shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/editor/${r.id}`)}
                      className="mb-3 block w-full rounded border border-paper-edge bg-paper-tint p-3 text-left hover:bg-paper"
                    >
                      <div className="mb-2 h-20 rounded-sm bg-paper shadow-inner">
                        <div className="space-y-1 p-3">
                          <div className="h-2 w-1/2 rounded bg-ink" />
                          <div className="h-1.5 w-3/4 rounded bg-paper-edge" />
                          <div className="mt-3 h-1.5 w-full rounded bg-ink" />
                          <div className="h-1.5 w-5/6 rounded bg-paper-edge" />
                          <div className="h-1.5 w-2/3 rounded bg-paper-edge" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-ink">{r.name}</div>
                          {r.variantOf && (
                            <div className="truncate text-[10px] uppercase tracking-wide text-accent">
                              {t('landing.variantBadge')}
                            </div>
                          )}
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                            STATUS_META[r.application?.status ?? 'drafting'].pillBg
                          } ${STATUS_META[r.application?.status ?? 'drafting'].pillText}`}
                        >
                          {statusLabel(r.application?.status ?? 'drafting')}
                        </span>
                      </div>
                      {r.application?.targetRole && (
                        <div className="truncate text-xs text-ink-muted">
                          {r.application.targetRole}
                          {r.application.companyName && ` · ${r.application.companyName}`}
                        </div>
                      )}
                      <div className="text-xs text-ink-subtle">
                        {new Date(r.updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </button>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="icon-btn h-8 w-8"
                        aria-label={t('landing.renameAria', { name: r.name })}
                        title={t('common.rename')}
                        onClick={() => {
                          const name = window.prompt(t('landing.renamePrompt'), r.name);
                          if (!name || !name.trim()) return;
                          renameResume(r.id, name.trim());
                          refresh();
                          toast(t('landing.renamed'), { tone: 'success', ttl: 1500 });
                        }}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-8 w-8"
                        aria-label={t('landing.duplicateAria', { name: r.name })}
                        title={t('common.duplicate')}
                        onClick={() => {
                          const copy = duplicateResume(r.id);
                          refresh();
                          if (copy) {
                            toast(t('landing.duplicated'), {
                              tone: 'success',
                              action: {
                                label: t('common.open'),
                                onClick: () => navigate(`/editor/${copy.id}`),
                              },
                            });
                          }
                        }}
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn h-8 w-8 hover:text-danger"
                        aria-label={t('landing.deleteAria', { name: r.name })}
                        title={t('common.delete')}
                        onClick={() => {
                          if (!window.confirm(t('landing.deletePrompt', { name: r.name }))) return;
                          deleteResume(r.id);
                          refresh();
                          toast(t('landing.deleted'), { tone: 'info' });
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                      <span className="ml-auto self-center text-xs text-ink-subtle">
                        {t(`templates.${r.template}.name`)}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {t('landing.title')}
          </h1>
          <p className="mt-3 text-ink-muted">{t('landing.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleStart(tpl.id)}
              className="group flex flex-col rounded-lg border border-paper-edge bg-paper text-left shadow-sm transition-shadow hover:shadow-page focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div className="flex aspect-[8.5/11] items-center justify-center rounded-t-lg border-b border-paper-edge bg-paper-tint">
                {tpl.id === 'blank' ? (
                  <Plus size={36} className="text-ink-subtle" />
                ) : (
                  <LiveTemplateThumbnail templateId={tpl.id} />
                )}
              </div>
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-ink">{t(`templates.${tpl.id}.name`)}</h3>
                  <span className="text-xs text-ink-subtle">{t(`templates.${tpl.id}.tagline`)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">{t(`templates.${tpl.id}.description`)}</p>
              </div>
            </button>
          ))}
        </div>
      </main>

      <ImportResumeModal
        open={importOpen}
        mode="create"
        onClose={() => setImportOpen(false)}
        onImported={(resume) => {
          setCurrentResume(resume);
          refresh();
          navigate(`/editor/${resume.id}`);
        }}
      />
      <ToastViewport />
    </div>
  );
}

function KanbanView({
  grouped,
  navigate,
  onMoveStatus,
}: {
  grouped: { status: ApplicationStatus; items: Resume[] }[];
  navigate: (path: string) => void;
  onMoveStatus: (resumeId: string, status: ApplicationStatus) => void;
}) {
  const { t } = useTranslation();
  const statusLabel = useStatusLabel();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const activeResume = activeId
    ? grouped.flatMap((g) => g.items).find((r) => r.id === activeId)
    : undefined;

  const onDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const resumeId = String(active.id);
    const overId = String(over.id);
    const targetStatus = (STATUS_ORDER.includes(overId as ApplicationStatus)
      ? overId
      : grouped.find((g) => g.items.some((r) => r.id === overId))?.status) as
      | ApplicationStatus
      | undefined;
    if (!targetStatus) return;
    onMoveStatus(resumeId, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {grouped.map(({ status, items }) => {
          const meta = STATUS_META[status];
          return (
            <KanbanColumn key={status} status={status}>
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.pillBg} ${meta.pillText}`}
                >
                  {statusLabel(status)}
                </span>
                <span className="text-xs text-ink-subtle">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="py-6 text-center text-xs text-ink-subtle">{t('landing.noKanbanItems')}</p>
              ) : (
                items.map((r) => (
                  <KanbanCard key={r.id} resume={r} onOpen={() => navigate(`/editor/${r.id}`)} />
                ))
              )}
            </KanbanColumn>
          );
        })}
      </div>
      <DragOverlay>
        {activeResume ? (
          <div className="rounded-md border border-accent bg-paper p-2 shadow-page opacity-95">
            <div className="truncate text-xs font-semibold text-ink">{activeResume.name}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({
  status,
  children,
}: {
  status: ApplicationStatus;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[8rem] flex-col gap-2 rounded-md border p-3 ${
        isOver ? 'border-accent bg-paper' : 'border-paper-edge bg-paper-tint'
      }`}
    >
      {children}
    </div>
  );
}

function KanbanCard({ resume, onOpen }: { resume: Resume; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: resume.id,
  });
  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`rounded-md border border-paper-edge bg-paper p-2 text-left hover:shadow-page ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <div className="truncate text-xs font-semibold text-ink">{resume.name}</div>
      {resume.application?.targetRole && (
        <div className="truncate text-[11px] text-ink-muted">
          {resume.application.targetRole}
          {resume.application.companyName && ` · ${resume.application.companyName}`}
        </div>
      )}
      <div className="mt-1 text-[10px] text-ink-subtle">
        {new Date(resume.updatedAt).toLocaleDateString()}
      </div>
    </button>
  );
}
