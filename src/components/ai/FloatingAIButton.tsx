import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';

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
      className="fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-ink text-paper shadow-page transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      title={t('editor.aiAssistant')}
      aria-label={t('ai.openAssistant')}
    >
      <Sparkles size={18} />
    </button>
  );
}
