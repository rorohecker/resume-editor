import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Modal } from '@/components/shared/Modal';

const FLAG = 'resume-editor:privacy-disclosure-ack:v1';

export function shouldShowPrivacyDisclosure(): boolean {
  try {
    return localStorage.getItem(FLAG) !== '1';
  } catch {
    return false;
  }
}

export function ackPrivacyDisclosure(): void {
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    // ignore
  }
}

export function PrivacyDisclosureModal({
  open,
  onAck,
  onCancel,
  provider,
}: {
  open: boolean;
  onAck: () => void;
  onCancel: () => void;
  provider: string;
}) {
  const { t } = useTranslation();
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    if (open) setUnderstood(false);
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={t('privacy.title')}
      maxWidth="md"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!understood}
            onClick={() => {
              ackPrivacyDisclosure();
              onAck();
            }}
          >
            {t('privacy.continue')}
          </button>
        </div>
      }
    >
      <div className="space-y-3 p-5 text-sm text-ink-muted">
        <p>
          <Trans
            i18nKey="privacy.body1"
            values={{ provider }}
            components={{
              strong: <span className="font-medium text-ink" />,
              em: <em />,
            }}
          />
        </p>
        <p>
          {t('privacy.body2')}
        </p>
        <label className="flex items-start gap-2 rounded-md border border-paper-edge bg-paper-tint p-3">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-0.5 accent-ink"
          />
          <span>
            {t('privacy.ack')}
          </span>
        </label>
      </div>
    </Modal>
  );
}
