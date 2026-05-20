import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { Modal } from '@/components/shared/Modal';
import { listResumes, listVersionSnapshots } from '@/store/persistence';
import { diffIsNoop, diffResumes } from '@/utils/resumeDiff';
import type { Resume } from '@/types';

type Source = { kind: 'current' } | { kind: 'resume'; id: string } | { kind: 'snapshot'; id: string };

export function CompareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const current = useStore((s) => s.currentResume);
  const [right, setRight] = useState<Source>({ kind: 'current' });

  const allResumes = useMemo(() => listResumes(), [open]);
  const snapshots = useMemo(
    () => (current ? listVersionSnapshots(current.id) : []),
    [current, open],
  );

  const resolveRight = (): Resume | null => {
    if (!current) return null;
    if (right.kind === 'current') return current;
    if (right.kind === 'resume') return allResumes.find((r) => r.id === right.id) ?? null;
    return snapshots.find((s) => s.id === right.id)?.resume ?? null;
  };

  const compared = resolveRight();
  const diff = current && compared ? diffResumes(current, compared) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('compare.title')}
      maxWidth="5xl"
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('tailor.done')}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-paper-edge bg-paper-tint p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('compare.leftCurrent')}
            </div>
            <div className="text-sm font-semibold text-ink">{current?.name ?? t('compare.noResume')}</div>
          </div>
          <div className="rounded-md border border-paper-edge bg-paper-tint p-3">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              {t('compare.right')}
            </div>
            <select
              className="input text-sm"
              value={`${right.kind}:${right.kind !== 'current' ? right.id : ''}`}
              onChange={(e) => {
                const [kind, id] = e.target.value.split(':');
                if (kind === 'current') setRight({ kind: 'current' });
                else if (kind === 'resume') setRight({ kind: 'resume', id });
                else setRight({ kind: 'snapshot', id });
              }}
            >
              <option value="current:">{t('compare.pickPrompt')}</option>
              <optgroup label={t('compare.otherResumes')}>
                {allResumes
                  .filter((r) => r.id !== current?.id)
                  .map((r) => (
                    <option key={r.id} value={`resume:${r.id}`}>
                      {r.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label={t('compare.snapshots')}>
                {snapshots.map((s) => (
                  <option key={s.id} value={`snapshot:${s.id}`}>
                    {s.name} · {new Date(s.createdAt).toLocaleString()}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div>
          {!compared || !diff ? (
            <p className="text-sm text-ink-subtle">{t('compare.pickToCompare')}</p>
          ) : diffIsNoop(diff) ? (
            <p className="rounded-md bg-paper-tint p-3 text-sm text-ink-muted">
              {t('compare.identical')}
            </p>
          ) : (
            <DiffPanel diff={diff} />
          )}
        </div>
      </div>
    </Modal>
  );
}

function DiffPanel({ diff }: { diff: ReturnType<typeof diffResumes> }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-sm">
      {diff.headerNameChanged && <Row tone="change">{t('compare.nameDiffers')}</Row>}
      {diff.templateChanged && <Row tone="change">{t('compare.templateDiffers')}</Row>}
      {diff.contactsAdded.length > 0 && (
        <Row tone="add">{t('compare.contactsAdded', { count: diff.contactsAdded.length, values: diff.contactsAdded.join(', ') })}</Row>
      )}
      {diff.contactsRemoved.length > 0 && (
        <Row tone="remove">{t('compare.contactsRemoved', { count: diff.contactsRemoved.length, values: diff.contactsRemoved.join(', ') })}</Row>
      )}
      {diff.contactsChanged > 0 && <Row tone="change">{t('compare.contactsChanged', { count: diff.contactsChanged })}</Row>}
      {diff.sectionsAdded.length > 0 && (
        <Row tone="add">
          {t('compare.sectionsAdded', { count: diff.sectionsAdded.length, values: diff.sectionsAdded.map((s) => s.title).join(', ') })}
        </Row>
      )}
      {diff.sectionsRemoved.length > 0 && (
        <Row tone="remove">
          {t('compare.sectionsRemoved', { count: diff.sectionsRemoved.length, values: diff.sectionsRemoved.map((s) => s.title).join(', ') })}
        </Row>
      )}
      {diff.sectionsChanged.length > 0 && (
        <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs text-ink-muted">
          <div className="mb-1 font-semibold text-ink">{t('compare.perSectionChanges')}</div>
          <ul className="space-y-1">
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
      {diff.styleChanges.length > 0 && <Row tone="change">{t('compare.stylesChanged', { values: diff.styleChanges.join(' • ') })}</Row>}
    </div>
  );
}

function Row({ tone, children }: { tone: 'add' | 'remove' | 'change'; children: React.ReactNode }) {
  const color = tone === 'add' ? 'text-ok' : tone === 'remove' ? 'text-danger' : 'text-warn';
  return <div className={`rounded-md border border-paper-edge px-3 py-2 text-xs ${color}`}>{children}</div>;
}
