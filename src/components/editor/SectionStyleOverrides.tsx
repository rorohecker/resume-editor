import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Section, SectionStyleOverrides as Overrides } from '@/types';

interface Props {
  section: Section;
  resumeDefaults: { sectionSpacing: number; entrySpacing: number; bodyColor: string; sectionHeaderColor: string };
  onChange: (next: Overrides | undefined) => void;
}

export function SectionStyleOverridesPanel({ section, resumeDefaults, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const overrides = section.styleOverrides ?? {};
  const hasAny = Object.values(overrides).some((v) => v !== undefined);

  const patch = (next: Partial<Overrides>) => {
    const merged: Overrides = { ...overrides, ...next };
    // Drop empty keys so the saved object is minimal.
    const cleaned: Overrides = {};
    if (merged.spaceAbove !== undefined) cleaned.spaceAbove = merged.spaceAbove;
    if (merged.entrySpacing !== undefined) cleaned.entrySpacing = merged.entrySpacing;
    if (merged.hideRule !== undefined) cleaned.hideRule = merged.hideRule;
    if (merged.uppercaseTitle !== undefined) cleaned.uppercaseTitle = merged.uppercaseTitle;
    if (merged.bodyColor) cleaned.bodyColor = merged.bodyColor;
    if (merged.sectionHeaderColor) cleaned.sectionHeaderColor = merged.sectionHeaderColor;
    onChange(Object.keys(cleaned).length > 0 ? cleaned : undefined);
  };

  const reset = () => onChange(undefined);

  return (
    <div className="rounded-md border border-paper-edge bg-paper-tint px-3 py-2">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('editor.sectionOverrides')}
          {hasAny && (
            <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
              {t('editor.customBadge')}
            </span>
          )}
        </button>
        {hasAny && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-ink-subtle hover:text-ink"
            title={t('editor.resetOverrides')}
          >
            <RotateCcw size={11} /> {t('editor.resetOverrides')}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-3 text-xs">
          <p className="text-ink-subtle">
            {t('editor.sectionOverridesHint')}
          </p>

          <OverrideRow label={t('editor.spaceAboveLabel', { n: resumeDefaults.sectionSpacing })}>
            <NumberInput
              value={overrides.spaceAbove}
              placeholder={String(resumeDefaults.sectionSpacing)}
              min={0}
              max={32}
              onChange={(v) => patch({ spaceAbove: v })}
              suffix="pt"
            />
          </OverrideRow>

          <OverrideRow label={t('editor.entrySpacingLabel', { n: resumeDefaults.entrySpacing })}>
            <NumberInput
              value={overrides.entrySpacing}
              placeholder={String(resumeDefaults.entrySpacing)}
              min={0}
              max={16}
              onChange={(v) => patch({ entrySpacing: v })}
              suffix="pt"
            />
          </OverrideRow>

          <div className="grid grid-cols-2 gap-3">
            <Checkbox
              label={t('editor.hideRule')}
              checked={overrides.hideRule ?? false}
              onChange={(v) => patch({ hideRule: v ? true : undefined })}
            />
            <Checkbox
              label={t('editor.sectionTitleUppercase')}
              checked={overrides.uppercaseTitle ?? true}
              onChange={(v) =>
                patch({ uppercaseTitle: v === true ? undefined : false /* tri-state: undefined = inherit */ })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColorOverride
              label={t('editor.bodyTextOverride')}
              defaultValue={resumeDefaults.bodyColor}
              value={overrides.bodyColor}
              onChange={(v) => patch({ bodyColor: v })}
            />
            <ColorOverride
              label={t('editor.sectionHeaderOverride')}
              defaultValue={resumeDefaults.sectionHeaderColor}
              value={overrides.sectionHeaderColor}
              onChange={(v) => patch({ sectionHeaderColor: v })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function OverrideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <div className="w-32">{children}</div>
    </label>
  );
}

function NumberInput({
  value,
  placeholder,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number | undefined;
  placeholder: string;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value ?? ''}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(undefined);
          else onChange(Math.max(min, Math.min(max, Number(raw))));
        }}
        className="input h-7 text-xs"
      />
      {suffix && <span className="text-[10px] text-ink-subtle">{suffix}</span>}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-ink-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-ink"
      />
      {label}
    </label>
  );
}

function ColorOverride({
  label,
  defaultValue,
  value,
  onChange,
}: {
  label: string;
  defaultValue: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const effective = value ?? defaultValue;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-ink-muted">
        <span>{label}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-[10px] text-ink-subtle hover:text-ink"
          >
            {t('common.reset')}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 rounded border border-paper-edge bg-paper p-0.5"
          aria-label={t('editor.colorOverrideFor', { label })}
        />
        <span className="text-[10px] text-ink-subtle">
          {value ? value : t('common.inherit')}
        </span>
      </div>
    </div>
  );
}
