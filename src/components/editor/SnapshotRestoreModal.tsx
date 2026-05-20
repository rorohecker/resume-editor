import { useMemo } from 'react';
import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resume, VersionSnapshot } from '@/types';
import { diffIsNoop, diffResumes, type ResumeDiff } from '@/utils/resumeDiff';
import { Modal } from '@/components/shared/Modal';

interface Props {
  open: boolean;
  current: Resume | null;
  snapshot: VersionSnapshot | null;
  onClose: () => void;
  onConfirm: (snapshot: VersionSnapshot) => void;
}

export function SnapshotRestoreModal({ open, current, snapshot, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const diff = useMemo<ResumeDiff | null>(
    () => (current && snapshot ? diffResumes(current, snapshot.resume) : null),
    [current, snapshot],
  );

  return (
    <Modal
      open={open && !!snapshot}
      onClose={onClose}
      title={t('snapshot.restoreTitle')}
      maxWidth="2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => snapshot && onConfirm(snapshot)}
            className="btn-primary"
            disabled={!snapshot}
          >
            {t('snapshot.restore')}
          </button>
        </div>
      }
    >
      {snapshot && (
        <div className="space-y-4 p-5">
          <div className="rounded-md border border-paper-edge bg-paper-tint p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink">
              <History size={15} />
              {snapshot.name}
            </div>
            <div className="text-xs text-ink-subtle">
              {t('snapshot.savedOn', { when: new Date(snapshot.createdAt).toLocaleString() })}
            </div>
          </div>

          {diff && diffIsNoop(diff) ? (
            <p className="rounded-md bg-paper-tint p-3 text-sm text-ink-muted">
              {t('snapshot.identicalNote')}
            </p>
          ) : (
            <DiffSummary diff={diff!} />
          )}

          <p className="text-xs text-ink-subtle">
            {t('snapshot.restoreHint')}
          </p>
        </div>
      )}
    </Modal>
  );
}

function DiffSummary({ diff }: { diff: ResumeDiff }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {t('snapshot.whatChanges')}
      </h3>

      {diff.headerNameChanged && (
        <DiffRow label={t('snapshot.headerName')} detail={t('snapshot.willBeReplaced')} tone="change" />
      )}
      {diff.templateChanged && (
        <DiffRow label={t('snapshot.template')} detail={t('snapshot.willBeReplaced')} tone="change" />
      )}
      {diff.contactsAdded.length > 0 && (
        <DiffRow
          label={t('snapshot.contactFieldsAdded', { count: diff.contactsAdded.length })}
          detail={diff.contactsAdded.join(', ')}
          tone="add"
        />
      )}
      {diff.contactsRemoved.length > 0 && (
        <DiffRow
          label={t('snapshot.contactFieldsRemoved', { count: diff.contactsRemoved.length })}
          detail={diff.contactsRemoved.join(', ')}
          tone="remove"
        />
      )}
      {diff.contactsChanged > 0 && (
        <DiffRow
          label={t('snapshot.contactFieldsEdited', { count: diff.contactsChanged })}
          detail=""
          tone="change"
        />
      )}
      {diff.sectionsAdded.length > 0 && (
        <DiffRow
          label={t('snapshot.sectionsAdded', { count: diff.sectionsAdded.length })}
          detail={diff.sectionsAdded.map((s) => s.title).join(', ')}
          tone="add"
        />
      )}
      {diff.sectionsRemoved.length > 0 && (
        <DiffRow
          label={t('snapshot.sectionsRemoved', { count: diff.sectionsRemoved.length })}
          detail={diff.sectionsRemoved.map((s) => s.title).join(', ')}
          tone="remove"
        />
      )}
      {diff.sectionsChanged.length > 0 && (
        <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs">
          <div className="mb-2 font-semibold text-ink">{t('snapshot.sectionChanges')}</div>
          <ul className="space-y-1 text-ink-muted">
            {diff.sectionsChanged.map((section) => (
              <li key={section.title}>
                <span className="font-medium text-ink">{section.title}</span>:{' '}
                {[
                  section.addedEntries && t('compare.addedEntries', { count: section.addedEntries }),
                  section.removedEntries && t('compare.removedEntries', { count: section.removedEntries }),
                  section.changedEntries && t('compare.changedEntries', { count: section.changedEntries }),
                  section.addedBullets && t('compare.addedBullets', { count: section.addedBullets }),
                  section.removedBullets && t('compare.removedBullets', { count: section.removedBullets }),
                ]
                  .filter(Boolean)
                  .join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {diff.styleChanges.length > 0 && (
        <DiffRow label={t('snapshot.styles')} detail={diff.styleChanges.join(' • ')} tone="change" />
      )}
    </div>
  );
}

function DiffRow({ label, detail, tone }: { label: string; detail: string; tone: 'add' | 'remove' | 'change' }) {
  const colorClass =
    tone === 'add' ? 'text-ok' : tone === 'remove' ? 'text-danger' : 'text-warn';
  return (
    <div className="flex items-start gap-3 rounded-md border border-paper-edge px-3 py-2 text-sm">
      <span className={`font-medium ${colorClass}`}>{label}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{detail}</span>}
    </div>
  );
}
