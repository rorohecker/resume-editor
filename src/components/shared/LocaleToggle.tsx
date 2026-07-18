import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LOCALES } from '@/i18n';

export function LocaleToggle() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeCode = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];
  const activeLocale =
    SUPPORTED_LOCALES.find((locale) => locale.value === activeCode) ?? SUPPORTED_LOCALES[0];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-md border border-paper-edge bg-paper px-2.5 text-xs font-medium text-ink shadow-sm transition-colors hover:bg-paper-tint focus:outline-none focus:ring-2 focus:ring-accent/30"
        aria-label={t('common.language')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={14} className="text-ink-muted" aria-hidden />
        <span className="hidden sm:inline">{activeLocale.label}</span>
        <span className="uppercase sm:hidden">{activeLocale.value}</span>
        <ChevronDown
          size={12}
          className={`text-ink-subtle transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('common.language')}
          className="absolute right-0 z-50 mt-2 min-w-52 overflow-hidden rounded-lg border border-paper-edge bg-paper p-1 shadow-page"
        >
          {SUPPORTED_LOCALES.map((locale) => {
            const selected = locale.value === activeCode;
            return (
              <button
                key={locale.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                  selected ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-paper-tint'
                }`}
                onClick={() => {
                  void i18n.changeLanguage(locale.value);
                  setOpen(false);
                }}
              >
                <span className="w-5 text-center text-xs font-semibold uppercase text-ink-subtle">
                  {locale.value}
                </span>
                <span className="flex-1">{locale.label}</span>
                {locale.beta && (
                  <span className="rounded-full bg-paper-tint px-1.5 py-0.5 text-[10px] text-ink-subtle">
                    Beta
                  </span>
                )}
                {selected && <Check size={14} aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
