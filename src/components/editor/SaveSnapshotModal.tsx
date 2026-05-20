import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { createVersionSnapshot } from '@/store/persistence';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function SaveSnapshotModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const resume = useStore((s) => s.currentResume);
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) setName(defaultSnapshotName(t('snapshot.defaultName')));
  }, [open, t]);

  const save = () => {
    if (!resume) return;
    createVersionSnapshot(resume, name.trim() || defaultSnapshotName(t('snapshot.defaultName')));
    toast(t('snapshot.saved'), { tone: 'success' });
    onSaved?.();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('snapshot.saveTitle')}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            {t('common.save')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 p-5">
        <p className="text-sm text-ink-muted">
          {t('snapshot.saveHint')}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">{t('snapshot.snapshotName')}</span>
          <input
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            className="input"
            placeholder={t('snapshot.placeholder')}
          />
        </label>
      </div>
    </Modal>
  );
}

function defaultSnapshotName(prefix = 'Snapshot'): string {
  return `${prefix} ${new Date().toLocaleString()}`;
}
