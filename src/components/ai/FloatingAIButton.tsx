import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { tooltipProps } from '@/components/shared/tooltipProps';

export function FloatingAIButton() {
  const { t } = useTranslation();
  const setAiOpen = useStore((s) => s.setAiOpen);
  const aiOpen = useStore((s) => s.aiOpen);

  if (aiOpen) return null;

  return (
    <button
      type="button"
      data-tour="ai-button"
      onClick={() => setAiOpen(true)}
      className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper shadow-page transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent max-[767px]:bottom-[5.75rem] max-[480px]:bottom-[5.25rem] max-[480px]:right-4 motion-safe:hover:scale-105"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('ai.openAssistant')}
      {...tooltipProps(t('editor.aiAssistantTip'), 'end', 'top')}
    >
      <Sparkles size={18} />
    </button>
  );
}
