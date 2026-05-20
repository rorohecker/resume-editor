import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@/i18n';

export function LocaleToggle() {
  const { i18n, t } = useTranslation();
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-paper-edge bg-paper px-2 py-1 text-xs text-ink-muted">
      <Globe size={12} aria-hidden />
      <select
        value={i18n.language.slice(0, 2)}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        className="bg-transparent text-xs text-ink outline-none"
        aria-label={t('common.language')}
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale.value} value={locale.value}>
            {locale.label}
          </option>
        ))}
      </select>
    </label>
  );
}
