import { Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme, type Theme } from '@/hooks/useTheme';

const OPTIONS: { value: Theme; labelKey: string; Icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'theme.light', Icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', Icon: Moon },
  { value: 'system', labelKey: 'theme.system', Icon: Monitor },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex rounded-md border border-paper-edge bg-paper p-0.5"
    >
      {OPTIONS.map(({ value, labelKey, Icon }) => {
        const active = theme === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors ${
              active
                ? 'bg-ink text-paper'
                : 'text-ink-muted hover:bg-paper-tint hover:text-ink'
            }`}
          >
            <Icon size={12} />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
