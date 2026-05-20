import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Check, LayoutTemplate } from 'lucide-react';
import { useStore } from '@/store';
import { TEMPLATES } from '@/components/templates/registry';
import type { TemplateId } from '@/types';

export function ChangeTemplateMenu() {
  const { t } = useTranslation();
  const current = useStore((s) => s.currentResume?.template);
  const changeTemplate = useStore((s) => s.changeTemplate);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  if (!current) return null;
  const activeName = TEMPLATES.find((t) => t.id === current)?.name ?? 'Template';

  const handlePick = (id: TemplateId) => {
    setOpen(false);
    if (id !== current) changeTemplate(id);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="btn-ghost text-xs"
        title={t('template.changeTemplate')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <LayoutTemplate size={14} />
        <span className="hidden lg:inline">{activeName}</span>
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-1 w-72 overflow-hidden rounded-md border border-paper-edge bg-paper shadow-page"
          role="menu"
        >
          <div className="border-b border-paper-edge px-3 py-2 text-xs text-ink-subtle">
            {t('template.switchHint')}
          </div>
          {TEMPLATES.map((tpl) => {
            const active = tpl.id === current;
            return (
              <button
                key={tpl.id}
                type="button"
                role="menuitem"
                onClick={() => handlePick(tpl.id)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-paper-tint"
              >
                <span className="mt-0.5 w-4 flex-shrink-0">
                  {active && <Check size={14} className="text-ink" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{tpl.name}</span>
                  <span className="block text-xs text-ink-subtle">{tpl.tagline}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
