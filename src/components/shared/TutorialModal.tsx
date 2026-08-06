import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { useStore } from '@/store';
import { Modal } from '@/components/shared/Modal';

const SECTIONS = [
  'what',
  'start',
  'edit',
  'import',
  'master',
  'variant',
  'ai',
  'save',
] as const;

export function TutorialModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.tutorialOpen);
  const setOpen = useStore((s) => s.setTutorialOpen);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('tutorial.title')}
      maxWidth="2xl"
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
            {t('tutorial.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-6 overflow-y-auto p-5 text-sm leading-relaxed text-ink-muted">
        <p className="text-ink">{t('tutorial.intro')}</p>
        {SECTIONS.map((id) => (
          <section key={id} className="space-y-2 border-t border-paper-edge pt-4 first:border-t-0 first:pt-0">
            <h3 className="text-sm font-semibold text-ink">{t(`tutorial.${id}.title`)}</h3>
            <p>{t(`tutorial.${id}.body`)}</p>
            {id === 'import' && (
              <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-warn">
                {t('tutorial.import.caveat')}
              </p>
            )}
            {id === 'ai' && (
              <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-warn">
                {t('tutorial.ai.caveat')}
              </p>
            )}
          </section>
        ))}
      </div>
    </Modal>
  );
}

/** Compact button used on Landing and elsewhere. */
export function TutorialButton({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const setOpen = useStore((s) => s.setTutorialOpen);
  return (
    <button
      type="button"
      className={`btn-secondary ${className}`.trim()}
      onClick={() => setOpen(true)}
    >
      <BookOpen size={16} />
      {t('tutorial.open')}
    </button>
  );
}
