import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from 'lucide-react';
import { useStore } from '@/store';
import { toast } from '@/hooks/useToast';
import { RichBulletEditor } from './LazyRichBulletEditor';
import { SortableList } from '@/components/shared/Sortable';
import { SectionStyleOverridesPanel } from './SectionStyleOverrides';
import { ApplicationEditor } from '@/components/jobs/ApplicationEditor';
import { analyzeSingleBullet } from '@/utils/aiAssist';
import { sampleEntryForSection } from './sectionSamples';
import type {
  Bullet,
  ContactField,
  ContactFieldType,
  DateFormat,
  Entry,
  FontFamily,
  Resume,
  RuleVariant,
  RuleWeight,
  Section,
  SectionLayout,
  SectionType,
  SeparatorStyle,
} from '@/types';
import { iconForContactType } from '@/utils/contactIcon';
import { makeId } from '@/utils/id';
import { contrastRatio, estimatePageUsage, isDarkProfessionalColor } from '@/utils/styleChecks';

type ResumeUpdater = (
  updater: (resume: Resume) => Resume,
  options?: { historyKey?: string },
) => void;

const CONTACT_TYPES: ContactFieldType[] = [
  'email',
  'phone',
  'linkedin',
  'github',
  'website',
  'location',
  'twitter',
  'custom',
];

const SECTION_TYPES: SectionType[] = [
  'experience',
  'education',
  'projects',
  'skills',
  'leadership',
  'research',
  'awards',
  'certifications',
  'publications',
  'summary',
  'custom',
];

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'month-year', label: 'editor.dateFormatMonthYear' },
  { value: 'numeric', label: 'editor.dateFormatNumeric' },
  { value: 'season-year', label: 'editor.dateFormatSeasonYear' },
  { value: 'year-only', label: 'editor.dateFormatYearOnly' },
];

const SEPARATORS: { value: SeparatorStyle; label: string }[] = [
  { value: '|', label: 'editor.pipe' },
  { value: 'dot', label: 'editor.dot' },
  { value: 'dash', label: 'editor.dash' },
];

const FONTS: FontFamily[] = [
  'EB Garamond',
  'Georgia',
  'Times New Roman',
  'Lato',
  'Inter',
  'Carlito',
  'Nimbus Sans',
  'Latin Modern Roman',
];

const COLOR_THEMES = [
  { name: 'editor.themeClassicBlack', nameColor: '#000000', rule: '#000000', accent: '#111111', body: '#000000' },
  { name: 'editor.themeNavyProfessional', nameColor: '#111827', rule: '#1e3a8a', accent: '#1d4ed8', body: '#111111' },
  { name: 'editor.themeForestGreen', nameColor: '#111827', rule: '#166534', accent: '#166534', body: '#111111' },
  { name: 'editor.themeBurgundy', nameColor: '#111827', rule: '#7f1d1d', accent: '#991b1b', body: '#111111' },
  { name: 'editor.themeSlateGray', nameColor: '#111827', rule: '#475569', accent: '#334155', body: '#111111' },
];

const RULE_VARIANTS: { value: RuleVariant; label: string }[] = [
  { value: 'full', label: 'editor.ruleFull' },
  { value: 'partial', label: 'editor.rulePartial' },
  { value: 'none', label: 'editor.ruleNone' },
  { value: 'double', label: 'editor.ruleDouble' },
  { value: 'thick', label: 'editor.ruleThick' },
];

const RULE_WEIGHTS: RuleWeight[] = [0.5, 1, 1.5];

export function EditorLeftPanel() {
  const { t } = useTranslation();
  const resume = useStore((s) => s.currentResume);
  const updateCurrentResume = useStore((s) => s.updateCurrentResume);
  const [newSectionType, setNewSectionType] = useState<SectionType>('experience');

  const sections = resume ? [...resume.sections].sort((a, b) => a.order - b.order) : [];

  if (!resume) return null;

  const addSection = () => {
    updateCurrentResume((current) => ({
      ...current,
      sections: [
        ...current.sections,
        createSection(newSectionType, current.sections.length, t),
      ],
    }));
  };

  const reorderSections = (nextOrder: Section[]) => {
    updateCurrentResume((current) => ({
      ...current,
      sections: nextOrder.map((section, order) => {
        const original = current.sections.find((s) => s.id === section.id);
        return { ...(original ?? section), order };
      }),
    }));
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-paper-tint">
      <div className="border-b border-paper-edge bg-paper px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">{t('editor.sections')}</h2>
          <div className="flex min-w-0 items-center gap-2">
            <select
              value={newSectionType}
              onChange={(e) => setNewSectionType(e.target.value as SectionType)}
              className="w-32 rounded-md border border-paper-edge bg-paper px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
              aria-label={t('editor.sectionType')}
            >
              {SECTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {sectionTypeLabel(type, t)}
                </option>
              ))}
            </select>
            <button type="button" className="btn-secondary text-xs" onClick={addSection}>
              <Plus size={14} />
              {t('editor.addSection')}
            </button>
          </div>
        </div>

        {sections.length > 8 && (
          <InlineWarning>
            {t('editor.tooManySections', { count: sections.length })}
          </InlineWarning>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-col gap-2">
          <ApplicationEditor
            resume={resume}
            onChange={(application) =>
              updateCurrentResume((r) => ({ ...r, application }))
            }
          />
          <HeaderEditor resume={resume} updateResume={updateCurrentResume} />
          <DateAlignmentControls resume={resume} updateResume={updateCurrentResume} />
          <AppearanceControls resume={resume} updateResume={updateCurrentResume} />

          <SortableList
            items={sections}
            onReorder={reorderSections}
            className="flex flex-col gap-2"
            data-tour="sortable"
          >
            {(section, dragHandle) => (
              <SectionEditor
                section={section}
                updateResume={updateCurrentResume}
                dragHandle={dragHandle}
              />
            )}
          </SortableList>
        </div>
      </div>
    </div>
  );
}

function HeaderEditor({
  resume,
  updateResume,
}: {
  resume: Resume;
  updateResume: ResumeUpdater;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const fields = [...resume.header.contactFields].sort((a, b) => a.order - b.order);
  const canAdd = fields.length < 7;

  const updateHeader = (patch: Partial<Resume['header']>, historyKey?: string) => {
    updateResume(
      (current) => ({
        ...current,
        header: { ...current.header, ...patch },
      }),
      historyKey ? { historyKey } : undefined,
    );
  };

  const updateField = (id: string, patch: Partial<ContactField>, historyKey?: string) => {
    updateHeader(
      {
        contactFields: fields.map((field) =>
          field.id === id ? { ...field, ...patch } : field,
        ),
      },
      historyKey,
    );
  };

  const addField = () => {
    if (!canAdd) return;
    const type: ContactFieldType = nextContactType(fields);
    updateHeader({
      contactFields: [
        ...fields,
        {
          id: makeId(),
          type,
          value: '',
          label: contactTypeLabel(type, t),
          visible: true,
          order: fields.length,
        },
      ],
    });
  };

  const removeField = (id: string) => {
    updateHeader({
      contactFields: fields
        .filter((field) => field.id !== id)
        .map((field, order) => ({ ...field, order })),
    });
  };

  const reorderContacts = (next: ContactField[]) => {
    updateHeader({
      contactFields: next.map((field, order) => ({ ...field, order })),
    });
  };

  return (
    <AccordionShell
      title={t('editor.headerContact')}
      open={open}
      onOpenChange={setOpen}
      leading={<div className="h-6 w-6" />}
    >
      <div className="space-y-4">
        <Field label={t('editor.name')}>
          <input
            value={resume.header.name}
            onChange={(e) => updateHeader({ name: e.target.value })}
            placeholder={t('preview.yourName')}
            className="input"
          />
        </Field>

        <Field label={t('editor.nameSize', { size: resume.styles.fontSize.name })}>
          <input
            type="range"
            min={18}
            max={36}
            value={resume.styles.fontSize.name}
            onChange={(e) =>
              updateResume((current) => ({
                ...current,
                styles: {
                  ...current.styles,
                  fontSize: {
                    ...current.styles.fontSize,
                    name: Number(e.target.value),
                  },
                },
              }))
            }
            className="w-full accent-ink"
          />
        </Field>

        <Field label={t('editor.contactSeparator')}>
          <select
            value={resume.header.separatorStyle}
            onChange={(e) => updateHeader({ separatorStyle: e.target.value as SeparatorStyle })}
            className="input"
          >
            {SEPARATORS.map((separator) => (
              <option key={separator.value} value={separator.value}>
                {t(separator.label)}
              </option>
            ))}
          </select>
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('editor.contactFields')}
            </h4>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={addField}
              disabled={!canAdd}
              title={canAdd ? t('editor.addContact') : t('editor.maxContactsReached')}
            >
              <Plus size={14} />
              {t('editor.addContact')}
            </button>
          </div>

          {!canAdd && <InlineWarning>{t('editor.maxContactsReached')}</InlineWarning>}

          <SortableList items={fields} onReorder={reorderContacts} className="space-y-2">
            {(field, dragHandle) => (
              <ContactFieldEditor
                field={field}
                onUpdate={(patch) => updateField(field.id, patch)}
                onRemove={() => removeField(field.id)}
                dragHandle={dragHandle}
              />
            )}
          </SortableList>
        </div>
      </div>
    </AccordionShell>
  );
}

function ContactFieldEditor({
  field,
  onUpdate,
  onRemove,
  dragHandle,
}: {
  field: ContactField;
  onUpdate: (patch: Partial<ContactField>) => void;
  onRemove: () => void;
  dragHandle: ReactNode;
}) {
  const { t } = useTranslation();
  const Icon = iconForContactType(field.type);
  const warning = contactWarning(field, t);

  return (
    <div className="rounded-md border border-paper-edge bg-paper px-3 py-3">
      <div className="flex items-center gap-2">
        {dragHandle}
        <Icon size={16} className="text-ink-muted" />
        <select
          value={field.type}
          onChange={(e) => {
            const type = e.target.value as ContactFieldType;
            onUpdate({ type, label: contactTypeLabel(type, t) });
          }}
          className="input h-8 flex-1 text-xs"
          aria-label={t('editor.contactFieldType')}
        >
          {CONTACT_TYPES.map((type) => (
            <option key={type} value={type}>
              {contactTypeLabel(type, t)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="icon-btn h-7 w-7"
          onClick={() => onUpdate({ visible: !field.visible })}
          title={field.visible ? t('editor.hide') : t('editor.show')}
          aria-pressed={field.visible}
        >
          {field.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button type="button" className="icon-btn h-7 w-7" onClick={onRemove} title={t('common.remove')}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={field.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder={t('common.label')}
          className="input text-xs"
          spellCheck={false}
        />
        <input
          value={field.value}
          onChange={(e) => onUpdate({ value: e.target.value })}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (
              v &&
              (field.type === 'linkedin' ||
                field.type === 'github' ||
                field.type === 'website' ||
                field.type === 'custom') &&
              !/^https?:\/\//i.test(v) &&
              /\.[a-z]{2,}/i.test(v)
            ) {
              onUpdate({ value: `https://${v}` });
            }
          }}
          placeholder={contactPlaceholder(field.type, t)}
          className="input text-xs"
          spellCheck={false}
          type={field.type === 'email' ? 'email' : 'text'}
          inputMode={field.type === 'phone' ? 'tel' : undefined}
        />
      </div>
      {warning && <InlineWarning>{warning}</InlineWarning>}
    </div>
  );
}

function DateAlignmentControls({
  resume,
  updateResume,
}: {
  resume: Resume;
  updateResume: ResumeUpdater;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <AccordionShell
      title={t('editor.dateAlignment')}
      open={open}
      onOpenChange={setOpen}
      leading={<div className="h-6 w-6" />}
    >
      <Field label={t('editor.dateFormat')}>
        <select
          value={resume.styles.dateFormat}
          onChange={(e) =>
            updateResume((current) => ({
              ...current,
              styles: {
                ...current.styles,
                dateFormat: e.target.value as DateFormat,
              },
            }))
          }
          className="input"
        >
          {DATE_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>
              {t(format.label)}
            </option>
          ))}
        </select>
      </Field>
    </AccordionShell>
  );
}

function AppearanceControls({
  resume,
  updateResume,
}: {
  resume: Resume;
  updateResume: ResumeUpdater;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const pageUsage = estimatePageUsage(resume);
  const contrast = contrastRatio(resume.styles.colors.body, '#ffffff');
  const hasAtsColorWarning = !isDarkProfessionalColor(resume.styles.colors.body);

  const updateStyles = (patch: Partial<Resume['styles']>) => {
    updateResume((current) => ({
      ...current,
      styles: { ...current.styles, ...patch },
    }));
  };

  const updateFontSize = (key: keyof Resume['styles']['fontSize'], value: number) => {
    updateStyles({
      fontSize: { ...resume.styles.fontSize, [key]: value },
    });
  };

  const updateColor = (key: keyof Resume['styles']['colors'], value: string) => {
    updateStyles({
      colors: { ...resume.styles.colors, [key]: value },
    });
  };

  const updateMargin = (key: keyof Resume['styles']['margins'], value: number) => {
    updateStyles({
      margins: { ...resume.styles.margins, [key]: value },
    });
  };

  const updateSpacing = (key: keyof Resume['styles']['spacing'], value: number) => {
    updateStyles({
      spacing: { ...resume.styles.spacing, [key]: value },
    });
  };

  return (
    <AccordionShell
      title={t('editor.appearance')}
      open={open}
      onOpenChange={setOpen}
      leading={<div className="h-6 w-6" />}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium text-ink-muted">{t('editor.pageUsage')}</span>
            <span className={pageUsage > 100 ? 'text-danger' : pageUsage >= 90 ? 'text-warn' : 'text-ok'}>
              {pageUsage}%
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-paper-edge">
            <div
              className={`h-full ${pageUsage > 100 ? 'bg-danger' : pageUsage >= 90 ? 'bg-warn' : 'bg-ok'}`}
              style={{ width: `${Math.min(pageUsage, 120)}%` }}
            />
          </div>
        </div>

        <Field label={t('editor.font')}>
          <select
            value={resume.styles.font}
            onChange={(e) => updateStyles({ font: e.target.value as FontFamily })}
            className="input"
          >
            {FONTS.map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RangeField label={t('editor.sectionHeaders')} value={resume.styles.fontSize.sectionHeader} min={8} max={18} step={0.5} suffix="pt" onChange={(value) => updateFontSize('sectionHeader', value)} />
          <RangeField label={t('editor.entryTitles')} value={resume.styles.fontSize.entryTitle} min={8} max={18} step={0.5} suffix="pt" onChange={(value) => updateFontSize('entryTitle', value)} />
          <RangeField label={t('editor.body')} value={resume.styles.fontSize.body} min={8} max={14} step={0.5} suffix="pt" onChange={(value) => updateFontSize('body', value)} />
          <RangeField label={t('editor.contactLine')} value={resume.styles.fontSize.contactLine} min={7} max={14} step={0.5} suffix="pt" onChange={(value) => updateFontSize('contactLine', value)} />
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('editor.colorThemes')}
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {COLOR_THEMES.map((theme) => (
              <button
                key={theme.name}
                type="button"
                className="flex items-center gap-2 rounded-md border border-paper-edge px-2 py-2 text-left text-xs hover:bg-paper-tint"
                onClick={() =>
                  updateStyles({
                    colors: {
                      name: theme.nameColor,
                      sectionHeader: theme.nameColor,
                      sectionRule: theme.rule,
                      body: theme.body,
                      accent: theme.accent,
                    },
                  })
                }
              >
                <span className="flex gap-1">
                  {[theme.nameColor, theme.rule, theme.accent].map((color) => (
                    <span
                      key={color}
                      className="h-4 w-4 rounded-sm border border-paper-edge"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                {t(theme.name)}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-subtle">
            {t('editor.colorRecommendation')}
          </p>
          {hasAtsColorWarning && (
            <InlineWarning>{t('editor.atsColorWarning')}</InlineWarning>
          )}
          {contrast < 4.5 && (
            <InlineWarning>{t('editor.contrastWarning')}</InlineWarning>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ColorField label={t('editor.name')} value={resume.styles.colors.name} onChange={(value) => updateColor('name', value)} />
          <ColorField label={t('editor.sectionHeaderOverride')} value={resume.styles.colors.sectionHeader} onChange={(value) => updateColor('sectionHeader', value)} />
          <ColorField label={t('editor.rule')} value={resume.styles.colors.sectionRule} onChange={(value) => updateColor('sectionRule', value)} />
          <ColorField label={t('editor.accent')} value={resume.styles.colors.accent} onChange={(value) => updateColor('accent', value)} />
          <ColorField label={t('editor.body')} value={resume.styles.colors.body} onChange={(value) => updateColor('body', value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RangeField label={t('editor.topMargin')} value={resume.styles.margins.top} min={0.4} max={1.2} step={0.05} suffix="in" onChange={(value) => updateMargin('top', value)} />
          <RangeField label={t('editor.bottomMargin')} value={resume.styles.margins.bottom} min={0.4} max={1.2} step={0.05} suffix="in" onChange={(value) => updateMargin('bottom', value)} />
          <RangeField label={t('editor.leftMargin')} value={resume.styles.margins.left} min={0.4} max={1.2} step={0.05} suffix="in" onChange={(value) => updateMargin('left', value)} />
          <RangeField label={t('editor.rightMargin')} value={resume.styles.margins.right} min={0.4} max={1.2} step={0.05} suffix="in" onChange={(value) => updateMargin('right', value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <RangeField label={t('editor.sectionSpacing')} value={resume.styles.spacing.section} min={0} max={16} step={1} suffix="pt" onChange={(value) => updateSpacing('section', value)} />
          <RangeField label={t('editor.entrySpacing')} value={resume.styles.spacing.entry} min={0} max={10} step={1} suffix="pt" onChange={(value) => updateSpacing('entry', value)} />
          <RangeField label={t('editor.bulletLineHeight')} value={resume.styles.spacing.bullet} min={1} max={1.5} step={0.05} suffix="x" onChange={(value) => updateSpacing('bullet', value)} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('editor.ruleStyle')}>
            <select
              value={resume.styles.ruleStyle.variant}
              onChange={(e) =>
                updateStyles({
                  ruleStyle: {
                    ...resume.styles.ruleStyle,
                    variant: e.target.value as RuleVariant,
                  },
                })
              }
              className="input"
            >
              {RULE_VARIANTS.map((rule) => (
                <option key={rule.value} value={rule.value}>
                  {t(rule.label)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('editor.ruleWeight')}>
            <select
              value={resume.styles.ruleStyle.weight}
              onChange={(e) =>
                updateStyles({
                  ruleStyle: {
                    ...resume.styles.ruleStyle,
                    weight: Number(e.target.value) as RuleWeight,
                  },
                })
              }
              className="input"
            >
              {RULE_WEIGHTS.map((weight) => (
                <option key={weight} value={weight}>
                  {weight}pt
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('editor.paperSize')}>
            <select
              value={resume.styles.paperSize}
              onChange={(e) => updateStyles({ paperSize: e.target.value as 'letter' | 'a4' })}
              className="input"
            >
              <option value="letter">{t('editor.paperLetter')}</option>
              <option value="a4">{t('editor.paperA4')}</option>
            </select>
          </Field>
          <label className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={Boolean(resume.styles.onePageMode)}
              onChange={(e) => updateStyles({ onePageMode: e.target.checked })}
              className="accent-ink"
            />
            {t('editor.onePageMode')}
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={Boolean(resume.styles.pageNumbers)}
              onChange={(e) => updateStyles({ pageNumbers: e.target.checked })}
              className="accent-ink"
            />
            {t('editor.pageNumbers')}
          </label>
        </div>
      </div>
    </AccordionShell>
  );
}

function SectionEditor({
  section,
  updateResume,
  dragHandle,
}: {
  section: Section;
  updateResume: ResumeUpdater;
  dragHandle: ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(section.entries.length === 0);

  const patchSection = (patch: Partial<Section>) => {
    updateResume((current) => ({
      ...current,
      sections: current.sections.map((item) =>
        item.id === section.id ? { ...item, ...patch } : item,
      ),
    }));
  };

  const removeSection = () => {
    const before = section.title;
    updateResume((current) => ({
      ...current,
      sections: current.sections
        .filter((item) => item.id !== section.id)
        .sort((a, b) => a.order - b.order)
        .map((item, order) => ({ ...item, order })),
    }));
    toast(t('editor.removeSection', { title: before }), {
      tone: 'info',
      action: {
        label: t('editor.undo'),
        onClick: () => useStore.getState().undoResume(),
      },
      ttl: 4000,
    });
  };

  const duplicateSection = () => {
    updateResume((current) => ({
      ...current,
      sections: [
        ...current.sections,
        cloneSection(section, current.sections.length, t),
      ],
    }));
  };

  const addEntry = () => {
    patchSection({ entries: [...section.entries, createEntry(section, t)] });
  };

  const updateEntry = (entryId: string, patch: Partial<Entry>) => {
    patchSection({
      entries: section.entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...patch } : entry,
      ),
    });
  };

  const removeEntry = (entryId: string) => {
    patchSection({ entries: section.entries.filter((entry) => entry.id !== entryId) });
  };

  const duplicateEntry = (entry: Entry) => {
    patchSection({ entries: [...section.entries, cloneEntry(entry)] });
  };

  const reorderEntries = (nextOrder: Entry[]) => {
    patchSection({ entries: nextOrder });
  };

  const content = sectionContentKind(section);

  return (
    <div>
      <AccordionShell
        title={section.title || t('editor.untitledSection')}
        open={open}
        onOpenChange={setOpen}
        leading={dragHandle}
        actions={
          <>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => patchSection({ visible: !section.visible })}
              title={section.visible ? t('editor.hide') : t('editor.show')}
              aria-pressed={section.visible}
            >
              {section.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={duplicateSection}
              title={t('common.duplicate')}
            >
              <Copy size={14} />
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={removeSection}
              title={t('common.remove')}
            >
              <Trash2 size={14} />
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
            <Field label={t('editor.sectionName')}>
              <input
                value={section.title}
                onChange={(e) => patchSection({ title: e.target.value })}
                className="input"
              />
            </Field>
            <Field label={t('editor.sectionTypeLabel')}>
              <select
                value={section.type}
                onChange={(e) => {
                  const type = e.target.value as SectionType;
                  patchSection({
                    type,
                    title: section.title || defaultSectionTitle(type, t),
                    layout: defaultLayoutForSection(type),
                  });
                }}
                className="input"
              >
                {SECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {sectionTypeLabel(type, t)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {section.type === 'custom' && (
            <Field label={t('editor.layout')}>
              <select
                value={section.layout}
                onChange={(e) => patchSection({ layout: e.target.value as SectionLayout })}
                className="input"
              >
                <option value="entry-based">{t('editor.layoutEntry')}</option>
                <option value="bullet-list">{t('editor.layoutBullet')}</option>
                <option value="text-block">{t('editor.layoutText')}</option>
                <option value="skills-grid">{t('editor.layoutSkills')}</option>
              </select>
            </Field>
          )}

          {content === 'skills' ? (
            <SkillsEditor
              section={section}
              onAdd={addEntry}
              onUpdate={updateEntry}
              onRemove={removeEntry}
              onDuplicate={duplicateEntry}
              onReorder={reorderEntries}
            />
          ) : content === 'text' ? (
            <TextBlockEditor section={section} updateSection={patchSection} />
          ) : content === 'bullets' ? (
            <BulletListEditor section={section} updateSection={patchSection} />
          ) : (
            <EntryListEditor
              section={section}
              onAdd={addEntry}
              onSample={() =>
                patchSection({ entries: [...section.entries, sampleEntryForSection(section) as Entry] })
              }
              onUpdate={updateEntry}
              onRemove={removeEntry}
              onDuplicate={duplicateEntry}
              onReorder={reorderEntries}
            />
          )}

          <SectionOverridesMount section={section} patchSection={patchSection} />
        </div>
      </AccordionShell>
    </div>
  );
}

function SectionOverridesMount({
  section,
  patchSection,
}: {
  section: Section;
  patchSection: (patch: Partial<Section>) => void;
}) {
  const resume = useStore((s) => s.currentResume);
  if (!resume) return null;
  return (
    <SectionStyleOverridesPanel
      section={section}
      resumeDefaults={{
        sectionSpacing: resume.styles.spacing.section,
        entrySpacing: resume.styles.spacing.entry,
        bodyColor: resume.styles.colors.body,
        sectionHeaderColor: resume.styles.colors.sectionHeader,
      }}
      onChange={(next) => patchSection({ styleOverrides: next })}
    />
  );
}

function EntryListEditor({
  section,
  onAdd,
  onSample,
  onUpdate,
  onRemove,
  onDuplicate,
  onReorder,
}: {
  section: Section;
  onAdd: () => void;
  onSample: () => void;
  onUpdate: (entryId: string, patch: Partial<Entry>) => void;
  onRemove: (entryId: string) => void;
  onDuplicate: (entry: Entry) => void;
  onReorder: (nextOrder: Entry[]) => void;
}) {
  const { t } = useTranslation();
  const labels = entryLabels(section.type, t);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('editor.entries')}
        </h4>
        <div className="flex gap-1">
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => onSample()}
            title={t('editor.insertSampleHint')}
          >
            {t('editor.insertSample')}
          </button>
          <button type="button" className="btn-secondary text-xs" onClick={onAdd}>
            <Plus size={14} />
            {labels.add}
          </button>
        </div>
      </div>

      {section.entries.length === 0 && (
        <p className="text-xs text-ink-subtle">{t('editor.noEntries', { add: labels.add })}</p>
      )}

      <SortableList items={section.entries} onReorder={onReorder} className="space-y-3">
        {(entry, dragHandle) => (
          <EntryEditor
            section={section}
            entry={entry}
            index={section.entries.findIndex((e) => e.id === entry.id)}
            labels={labels}
            onUpdate={(patch) => onUpdate(entry.id, patch)}
            onRemove={() => onRemove(entry.id)}
            onDuplicate={() => onDuplicate(entry)}
            dragHandle={dragHandle}
          />
        )}
      </SortableList>
    </div>
  );
}

function EntryEditor({
  section,
  entry,
  index,
  labels,
  onUpdate,
  onRemove,
  onDuplicate,
  dragHandle,
}: {
  section: Section;
  entry: Entry;
  index: number;
  labels: EntryLabels;
  onUpdate: (patch: Partial<Entry>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  dragHandle: ReactNode;
}) {
  const { t } = useTranslation();
  const leftTextLength = [
    entry.title,
    entry.subtitle,
    entry.location,
    ...(entry.customFields ? Object.values(entry.customFields) : []),
  ].join(' ').length;

  return (
    <div className="rounded-md border border-paper-edge bg-paper px-3 py-3">
      <div className="mb-3 flex items-center gap-2">
        {dragHandle}
        <div className="flex-1 text-xs font-semibold text-ink-muted">
          {t('editor.entryLabel', { n: index + 1 })}
        </div>
        <button type="button" className="icon-btn h-7 w-7" onClick={onDuplicate} title={t('common.duplicate')}>
          <Copy size={14} />
        </button>
        <button type="button" className="icon-btn h-7 w-7" onClick={onRemove} title={t('common.remove')}>
          <Trash2 size={14} />
        </button>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={labels.title}>
            <input
              value={entry.title ?? ''}
              onChange={(e) => onUpdate({ title: e.target.value })}
              className="input"
            />
          </Field>
          {labels.subtitle && (
            <Field label={labels.subtitle}>
              <input
                value={entry.subtitle ?? ''}
                onChange={(e) => onUpdate({ subtitle: e.target.value })}
                className="input"
              />
            </Field>
          )}
        </div>

        {labels.location && (
          <Field label={labels.location}>
            <input
              value={entry.location ?? ''}
              onChange={(e) => onUpdate({ location: e.target.value })}
              className="input"
            />
          </Field>
        )}

        {labels.customFields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              value={entry.customFields?.[field.key] ?? ''}
              onChange={(e) =>
                onUpdate({
                  customFields: {
                    ...(entry.customFields ?? {}),
                    [field.key]: e.target.value,
                  },
                })
              }
              placeholder={field.placeholder}
              className="input"
            />
          </Field>
        ))}

        {labels.url && (
          <Field label={labels.url}>
            <input
              value={entry.url ?? ''}
              onChange={(e) => onUpdate({ url: e.target.value })}
              className="input"
            />
          </Field>
        )}

        {labels.dates && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Field label={t('editor.start')}>
              <input
                value={entry.startDate ?? ''}
                onChange={(e) => onUpdate({ startDate: e.target.value })}
                placeholder={t('editor.startPlaceholder')}
                className="input"
              />
            </Field>
            <Field label={section.type === 'publications' ? t('editor.year') : t('editor.end')}>
              <input
                value={entry.current ? t('editor.present') : entry.endDate ?? ''}
                onChange={(e) => onUpdate({ endDate: e.target.value, current: false })}
                placeholder={t('editor.endPlaceholder')}
                disabled={entry.current}
                className="input disabled:bg-paper-tint"
              />
            </Field>
            {labels.current && (
              <label className="mt-5 flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={Boolean(entry.current)}
                  onChange={(e) =>
                    onUpdate({
                      current: e.target.checked,
                      endDate: e.target.checked ? 'Present' : '',
                    })
                  }
                  className="accent-ink"
                />
                {t('editor.current')}
              </label>
            )}
          </div>
        )}

        {leftTextLength > 90 && (
          <InlineWarning>
            {t('editor.longLeftWarning')}
          </InlineWarning>
        )}

        {labels.bullets && (
          <BulletEditor
            bullets={entry.bullets ?? []}
            onChange={(bullets) => onUpdate({ bullets })}
          />
        )}
      </div>
    </div>
  );
}

function SkillsEditor({
  section,
  onAdd,
  onUpdate,
  onRemove,
  onDuplicate,
  onReorder,
}: {
  section: Section;
  onAdd: () => void;
  onUpdate: (entryId: string, patch: Partial<Entry>) => void;
  onRemove: (entryId: string) => void;
  onDuplicate: (entry: Entry) => void;
  onReorder: (next: Entry[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('editor.categories')}</h4>
        <button type="button" className="btn-secondary text-xs" onClick={onAdd}>
          <Plus size={14} />
          {t('editor.addCategory')}
        </button>
      </div>

      {section.entries.length === 0 && (
        <p className="text-xs text-ink-subtle">
          {t('editor.noCategories')}
        </p>
      )}

      <SortableList items={section.entries} onReorder={onReorder} className="space-y-3">
        {(entry, dragHandle) => (
          <div className="rounded-md border border-paper-edge bg-paper px-3 py-3">
            <div className="mb-2 flex items-center gap-2">
              {dragHandle}
              <input
                value={entry.title ?? ''}
                onChange={(e) => onUpdate(entry.id, { title: e.target.value })}
                placeholder={t('editor.category')}
                className="input h-8 flex-1 text-xs"
                spellCheck={false}
              />
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={() => onDuplicate(entry)}
                title={t('common.duplicate')}
                aria-label={t('editor.duplicateCategory')}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                className="icon-btn h-7 w-7"
                onClick={() => onRemove(entry.id)}
                title={t('common.remove')}
                aria-label={t('editor.removeCategory')}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={entry.subtitle ?? ''}
              onChange={(e) => onUpdate(entry.id, { subtitle: e.target.value })}
              placeholder={t('editor.skillsPlaceholder')}
              className="input min-h-20 resize-y text-xs"
              spellCheck
            />
          </div>
        )}
      </SortableList>
    </div>
  );
}

function TextBlockEditor({
  section,
  updateSection,
}: {
  section: Section;
  updateSection: (patch: Partial<Section>) => void;
}) {
  const { t } = useTranslation();
  const entry = section.entries[0] ?? createEntry(section);
  const ensureEntry = (patch: Partial<Entry>) => {
    const next = { ...entry, ...patch };
    updateSection({ entries: [next] });
  };

  return (
    <Field label={t('editor.text')}>
      <textarea
        value={entry.title ?? ''}
        onChange={(e) => ensureEntry({ title: e.target.value })}
        className="input min-h-28 resize-y"
      />
    </Field>
  );
}

function BulletListEditor({
  section,
  updateSection,
}: {
  section: Section;
  updateSection: (patch: Partial<Section>) => void;
}) {
  const bullets = section.entries[0]?.bullets ?? [];
  const entry = section.entries[0] ?? createEntry(section);

  return (
    <BulletEditor
      bullets={bullets}
      onChange={(nextBullets) =>
        updateSection({
          entries: [{ ...entry, bullets: nextBullets }],
        })
      }
    />
  );
}

function BulletEditor({
  bullets,
  onChange,
}: {
  bullets: Bullet[];
  onChange: (bullets: Bullet[]) => void;
}) {
  const { t } = useTranslation();
  const ordered = [...bullets].sort((a, b) => a.order - b.order);
  const visibleCount = ordered.filter((bullet) => bullet.visible).length;
  const canAdd = ordered.length < 8;

  const updateBullet = (id: string, patch: Partial<Bullet>) => {
    onChange(ordered.map((bullet) => (bullet.id === id ? { ...bullet, ...patch } : bullet)));
  };

  const removeBullet = (id: string) => {
    onChange(
      ordered
        .filter((bullet) => bullet.id !== id)
        .map((bullet, order) => ({ ...bullet, order })),
    );
  };

  const addBullet = () => {
    if (!canAdd) return;
    onChange([
      ...ordered,
      { id: makeId(), content: '', visible: true, order: ordered.length },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('editor.bullets')}
        </h4>
        <button type="button" className="btn-ghost text-xs" onClick={addBullet} disabled={!canAdd}>
          <Plus size={14} />
          {t('editor.addBullet')}
        </button>
      </div>

      {ordered.length === 0 && <p className="text-xs text-ink-subtle">{t('ai.noBullets')}</p>}
      {!canAdd && <InlineWarning>{t('editor.maxBulletsReached')}</InlineWarning>}
      {visibleCount > 5 && (
        <InlineWarning>
          {t('editor.bulletsTooMany')}
        </InlineWarning>
      )}

      {ordered.map((bullet) => {
        const analysis = analyzeSingleBullet(bullet.content);
        const tooLong = plainTextLen(bullet.content) > 200;
        return (
          <div key={bullet.id}>
            <div className="flex gap-2">
              <button
                type="button"
                className="icon-btn mt-1 h-7 w-7"
                onClick={() => updateBullet(bullet.id, { visible: !bullet.visible })}
                title={bullet.visible ? t('editor.hide') : t('editor.show')}
                aria-label={bullet.visible ? t('editor.hideBullet') : t('editor.showBullet')}
                aria-pressed={bullet.visible}
              >
                {bullet.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
              <RichBulletEditor
                content={bullet.content}
                onChange={(html) => updateBullet(bullet.id, { content: html })}
                onEnterSplit={canAdd ? addBullet : undefined}
                placeholder={t('editor.bulletPlaceholder')}
              />
              <button
                type="button"
                className="icon-btn mt-1 h-7 w-7"
                onClick={() => removeBullet(bullet.id)}
                title={t('common.remove')}
                aria-label={t('editor.removeBullet')}
              >
                <Trash2 size={14} />
              </button>
            </div>
            {analysis.content.trim() && (
              <div className="ml-9 mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                <BulletBadge ok={analysis.startsWithAction}>
                  {analysis.startsWithAction ? t('editor.actionVerbOk') : t('editor.actionVerbMissing')}
                </BulletBadge>
                <BulletBadge ok={analysis.hasMetric}>
                  {analysis.hasMetric ? t('editor.metricOk') : t('editor.metricMissing')}
                </BulletBadge>
                <BulletBadge ok={!tooLong}>
                  {t('editor.charCount', { count: plainTextLen(bullet.content), max: 200 })}
                </BulletBadge>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AccordionShell({
  title,
  open,
  onOpenChange,
  leading,
  actions,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leading: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-md border border-paper-edge bg-paper">
      <div className="flex items-center gap-1 px-2 py-2">
        {leading}
        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded px-1 py-0.5 text-left text-sm font-medium text-ink hover:bg-paper-tint"
          aria-expanded={open}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{title}</span>
        </button>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {open && <div className="border-t border-paper-edge px-4 py-4">{children}</div>}
    </div>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium text-ink-muted">
        <span>{label}</span>
        <span>
          {Number.isInteger(value) ? value : value.toFixed(step < 0.1 ? 2 : 1)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ink"
        aria-valuetext={`${Number.isInteger(value) ? value : value.toFixed(2)} ${suffix === 'in' ? 'inches' : suffix === 'pt' ? 'points' : suffix === 'x' ? 'line height' : suffix}`}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const isValid = /^#[0-9a-fA-F]{6}$/.test(draft);
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setDraft(e.target.value);
            onChange(e.target.value);
          }}
          className="h-9 w-10 rounded border border-paper-edge bg-paper p-1"
          aria-label={t('editor.colorPickerFor', { label })}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (isValid) onChange(draft);
            else setDraft(value);
          }}
          className={`input text-xs ${!isValid ? 'border-warn' : ''}`}
          aria-label={t('editor.hexValueFor', { label })}
          aria-invalid={!isValid}
        />
      </div>
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function InlineWarning({ children }: { children: ReactNode }) {
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-yellow-50 px-2 py-1.5 text-xs text-warn">
      <AlertTriangle size={13} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </div>
  );
}

interface EntryLabels {
  add: string;
  title: string;
  subtitle?: string;
  location?: string;
  dates: boolean;
  current: boolean;
  bullets: boolean;
  url?: string;
  customFields: { key: string; label: string; placeholder?: string }[];
}

function entryLabels(type: SectionType, t?: TFunction): EntryLabels {
  switch (type) {
    case 'education':
      return {
        add: label(t, 'editor.addSchool', 'Add school'),
        title: label(t, 'editor.degree', 'Degree'),
        subtitle: label(t, 'editor.institution', 'Institution'),
        location: label(t, 'editor.location', 'Location'),
        dates: true,
        current: false,
        bullets: false,
        customFields: [
          { key: 'major', label: label(t, 'editor.major', 'Major') },
          { key: 'gpa', label: label(t, 'editor.gpa', 'GPA') },
          { key: 'coursework', label: label(t, 'editor.coursework', 'Relevant coursework') },
          { key: 'honors', label: label(t, 'editor.honors', 'Honors / Awards') },
        ],
      };
    case 'projects':
      return {
        add: label(t, 'editor.addProject', 'Add project'),
        title: label(t, 'editor.project', 'Project'),
        subtitle: label(t, 'editor.techStack', 'Tech stack'),
        dates: true,
        current: false,
        bullets: true,
        url: label(t, 'editor.projectUrl', 'Project URL'),
        customFields: [{ key: 'githubUrl', label: label(t, 'editor.githubUrl', 'GitHub URL') }],
      };
    case 'leadership':
      return {
        add: label(t, 'editor.addRole', 'Add role'),
        title: label(t, 'editor.role', 'Role'),
        subtitle: label(t, 'editor.organization', 'Organization'),
        location: label(t, 'editor.location', 'Location'),
        dates: true,
        current: true,
        bullets: true,
        customFields: [],
      };
    case 'research':
      return {
        add: label(t, 'editor.addResearch', 'Add research'),
        title: label(t, 'editor.role', 'Role'),
        subtitle: label(t, 'editor.labPi', 'Lab / PI'),
        location: label(t, 'editor.institution', 'Institution'),
        dates: true,
        current: true,
        bullets: true,
        customFields: [],
      };
    case 'awards':
      return {
        add: label(t, 'editor.addAward', 'Add award'),
        title: label(t, 'editor.award', 'Award'),
        subtitle: label(t, 'editor.issuingOrganization', 'Issuing organization'),
        dates: true,
        current: false,
        bullets: false,
        customFields: [],
      };
    case 'certifications':
      return {
        add: label(t, 'editor.addCertification', 'Add certification'),
        title: label(t, 'editor.certification', 'Certification'),
        subtitle: label(t, 'editor.issuingBody', 'Issuing body'),
        dates: true,
        current: false,
        bullets: false,
        url: label(t, 'editor.credentialUrl', 'Credential URL'),
        customFields: [],
      };
    case 'publications':
      return {
        add: label(t, 'editor.addPublication', 'Add publication'),
        title: label(t, 'editor.title', 'Title'),
        subtitle: label(t, 'editor.authors', 'Authors'),
        dates: true,
        current: false,
        bullets: false,
        url: label(t, 'editor.doiUrl', 'DOI / URL'),
        customFields: [{ key: 'venue', label: label(t, 'editor.venue', 'Journal / Conference') }],
      };
    case 'custom':
      return {
        add: label(t, 'editor.addEntry', 'Add entry'),
        title: label(t, 'editor.title', 'Title'),
        subtitle: label(t, 'editor.subtitle', 'Subtitle'),
        location: label(t, 'editor.location', 'Location'),
        dates: true,
        current: false,
        bullets: true,
        url: 'URL',
        customFields: [],
      };
    case 'experience':
    default:
      return {
        add: label(t, 'editor.addRole', 'Add role'),
        title: label(t, 'editor.jobTitle', 'Job title'),
        subtitle: label(t, 'editor.company', 'Company'),
        location: label(t, 'editor.location', 'Location'),
        dates: true,
        current: true,
        bullets: true,
        customFields: [],
      };
  }
}

function createSection(type: SectionType, order: number, t?: TFunction): Section {
  return {
    id: makeId(),
    type,
    title: defaultSectionTitle(type, t),
    visible: true,
    order,
    layout: defaultLayoutForSection(type),
    entries: [],
  };
}

function createEntry(section: Section, t?: TFunction): Entry {
  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return { id: makeId(), title: label(t, 'editor.defaultSkillCategory', 'Languages'), subtitle: '' };
  }
  if (section.type === 'summary' || section.layout === 'text-block') {
    return { id: makeId(), title: '' };
  }
  if (section.layout === 'bullet-list') {
    return {
      id: makeId(),
      bullets: [{ id: makeId(), content: '', visible: true, order: 0 }],
    };
  }
  return {
    id: makeId(),
    title: '',
    subtitle: '',
    location: '',
    startDate: '',
    endDate: '',
    current: false,
    bullets: entryLabels(section.type).bullets
      ? [{ id: makeId(), content: '', visible: true, order: 0 }]
      : [],
    customFields: {},
  };
}

function cloneSection(section: Section, order: number, t?: TFunction): Section {
  return {
    ...section,
    id: makeId(),
    title: t ? t('editor.copySuffix', { title: section.title }) : `${section.title} Copy`,
    order,
    entries: section.entries.map(cloneEntry),
  };
}

function cloneEntry(entry: Entry): Entry {
  return {
    ...entry,
    id: makeId(),
    bullets: entry.bullets?.map((bullet) => ({ ...bullet, id: makeId() })),
    customFields: entry.customFields ? { ...entry.customFields } : undefined,
  };
}

function defaultLayoutForSection(type: SectionType): SectionLayout {
  if (type === 'skills') return 'skills-grid';
  if (type === 'summary') return 'text-block';
  return 'entry-based';
}

function sectionContentKind(section: Section): 'entries' | 'skills' | 'text' | 'bullets' {
  if (section.type === 'skills' || section.layout === 'skills-grid') return 'skills';
  if (section.type === 'summary' || section.layout === 'text-block') return 'text';
  if (section.layout === 'bullet-list') return 'bullets';
  return 'entries';
}

function defaultSectionTitle(type: SectionType, t?: TFunction): string {
  switch (type) {
    case 'page-break':
      return label(t, 'editor.sectionPageBreak', 'Page Break');
    case 'experience':
      return label(t, 'editor.sectionExperience', 'Experience');
    case 'education':
      return label(t, 'editor.sectionEducation', 'Education');
    case 'projects':
      return label(t, 'editor.sectionProjects', 'Projects');
    case 'skills':
      return label(t, 'editor.sectionSkills', 'Skills');
    case 'leadership':
      return label(t, 'editor.sectionLeadership', 'Leadership');
    case 'research':
      return label(t, 'editor.sectionResearch', 'Research');
    case 'awards':
      return label(t, 'editor.sectionAwards', 'Awards & Honors');
    case 'certifications':
      return label(t, 'editor.sectionCertifications', 'Certifications');
    case 'publications':
      return label(t, 'editor.sectionPublications', 'Publications');
    case 'summary':
      return label(t, 'editor.sectionSummary', 'Summary');
    case 'custom':
      return label(t, 'editor.sectionCustom', 'Custom Section');
  }
}

function sectionTypeLabel(type: SectionType, t?: TFunction): string {
  return defaultSectionTitle(type, t);
}

function label(t: TFunction | undefined, key: string, fallback: string): string {
  return t ? t(key) : fallback;
}

function nextContactType(fields: ContactField[]): ContactFieldType {
  return CONTACT_TYPES.find((type) => !fields.some((field) => field.type === type)) ?? 'custom';
}

function contactWarning(field: ContactField, t: TFunction): string | null {
  const value = field.value.trim();
  if (!value) return null;

  if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return t('editor.emailWarning');
  }
  if (field.type === 'linkedin' && !/(^https?:\/\/)?(www\.)?linkedin\.com\/in\/[^/\s]+\/?$/i.test(value)) {
    return t('editor.linkedinWarning');
  }
  if (field.type === 'github' && !/(^https?:\/\/)?(www\.)?github\.com\/[^/\s]+\/?$/i.test(value)) {
    return t('editor.githubWarning');
  }
  return null;
}

function contactTypeLabel(type: ContactFieldType, t: TFunction): string {
  switch (type) {
    case 'email':
      return t('editor.contactEmail');
    case 'phone':
      return t('editor.contactPhone');
    case 'linkedin':
      return t('editor.contactLinkedIn');
    case 'github':
      return t('editor.contactGitHub');
    case 'website':
      return t('editor.contactWebsite');
    case 'location':
      return t('editor.contactLocation');
    case 'twitter':
      return t('editor.contactTwitter');
    case 'custom':
      return t('editor.contactCustom');
  }
}

function contactPlaceholder(type: ContactFieldType, t: TFunction): string {
  switch (type) {
    case 'email':
      return t('editor.contactPlaceholderEmail');
    case 'phone':
      return t('editor.contactPlaceholderPhone');
    case 'linkedin':
      return t('editor.contactPlaceholderLinkedIn');
    case 'github':
      return t('editor.contactPlaceholderGitHub');
    case 'website':
      return t('editor.contactPlaceholderWebsite');
    case 'location':
      return t('editor.contactPlaceholderLocation');
    case 'twitter':
      return t('editor.contactPlaceholderTwitter');
    case 'custom':
      return t('editor.contactPlaceholderCustom');
  }
}

function plainTextLen(html: string): number {
  return html.replace(/<[^>]*>/g, '').length;
}

function BulletBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 font-medium ${
        ok ? 'border-green-200 bg-green-50 text-ok' : 'border-yellow-200 bg-yellow-50 text-warn'
      }`}
    >
      {children}
    </span>
  );
}
