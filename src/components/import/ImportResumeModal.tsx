import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resume, Section, SectionLayout } from '@/types';
import {
  looksLikeJson,
  parseResumeJson,
  parseResumeText,
  type ConfidenceFlag,
  type ImportParseResult,
} from '@/utils/importParser';
import { extractFromFile } from '@/utils/fileExtractors';
import { enrichWithBYOK } from '@/utils/importEnrichment';
import { isUnclassified } from '@/utils/importParser';
import { loadAiSettings, PROVIDER_LABELS } from '@/utils/aiByok';
import { captureImportOriginal } from '@/utils/importReference';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';
import {
  PrivacyDisclosureModal,
  ackPrivacyDisclosure,
  shouldShowPrivacyDisclosure,
} from './PrivacyDisclosureModal';
import type { SectionType } from '@/types';
import { makeId } from '@/utils/id';

export function ImportResumeModal({
  open,
  mode,
  onClose,
  onImported,
}: {
  open: boolean;
  mode: 'create' | 'replace' | 'merge';
  onClose: () => void;
  onImported: (
    resume: Resume,
    mode: 'create' | 'replace' | 'merge',
    meta?: import('@/utils/importReference').ImportReferenceMeta,
  ) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  // Remembers the last selection made inside the source pane so the
  // "Use selected text" helper works even after focus moves to a button.
  const sourceSelectionRef = useRef('');
  const fileLoadGen = useRef(0);
  const [text, setText] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [originalFile, setOriginalFile] = useState<
    import('@/utils/importReference').ImportOriginalFile | undefined
  >(undefined);
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');
  const [offlineOnly, setOfflineOnly] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string>>(new Set());
  const settings = useMemo(() => loadAiSettings(), [open]);
  const hasKey = Boolean(settings.apiKey.trim());

  // Reset modal state when it closes
  useEffect(() => {
    if (!open) {
      setText('');
      setResult(null);
      setStatus('');
      setWarning('');
      setBusy(false);
      setEnriching(false);
      setSelectedSectionIds(new Set());
      setSourceName('');
      setOriginalFile(undefined);
      sourceSelectionRef.current = '';
    }
  }, [open]);

  const captureSourceSelection = () => {
    const el = sourceRef.current;
    if (!el) return;
    const value = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim();
    if (value) sourceSelectionRef.current = value;
  };

  // Prefer a selection made in the editable source pane; fall back to any
  // document-level selection (e.g. from the parsed result).
  const getReferenceSelection = () =>
    sourceSelectionRef.current || (window.getSelection()?.toString().trim() ?? '');

  // When a parse result arrives, default to selecting every section for merge.
  useEffect(() => {
    if (!result) {
      setSelectedSectionIds(new Set());
      return;
    }
    setSelectedSectionIds(new Set(result.resume.sections.map((section) => section.id)));
  }, [result]);

  const parseText = (raw: string, sourceName?: string, hints?: ImportParseResult['hints']) => {
    setWarning('');
    const json = parseResumeJson(raw);
    // When the input clearly looks like JSON (a resume export) but couldn't be
    // parsed into a valid resume, surface a real error instead of silently
    // shoving malformed JSON through the plain-text heuristics, which produces
    // a nonsense resume the user then has to delete.
    if (!json && looksLikeJson(raw)) {
      setResult(null);
      setStatus('');
      setWarning(t('importer.invalidJson', {
        defaultValue:
          'This looks like a JSON resume export, but it is invalid or not in the expected format. Check the file and try again.',
      }));
      return;
    }
    const parsed = json ?? parseResumeText(raw, sourceName, hints);
    setResult(parsed);
    setStatus(t('importer.reviewBeforeOpen'));
  };

  const handleFile = async (file: File) => {
    const gen = ++fileLoadGen.current;
    setStatus(t('importer.reading'));
    setBusy(true);
    setWarning('');
    try {
      const [extraction, original] = await Promise.all([
        extractFromFile(file),
        captureImportOriginal(file),
      ]);
      if (gen !== fileLoadGen.current) return;
      if (extraction.warnings?.length) {
        setWarning(extraction.warnings.join(' '));
      }
      setText(extraction.text);
      setSourceName(file.name);
      setOriginalFile(original);
      parseText(extraction.text, file.name, extraction.hints);
      if (extraction.hints?.isLikelyLinkedIn) {
        toast(t('importer.linkedinDetected'), { tone: 'info', ttl: 2400 });
      }
      if (extraction.hints?.twoColumnDetected) {
        toast(t('importer.twoColumn'), {
          tone: 'info',
          ttl: 2400,
        });
      }
    } catch (err) {
      if (gen !== fileLoadGen.current) return;
      setWarning(err instanceof Error ? err.message : t('importer.readFailed'));
      setStatus('');
    } finally {
      if (gen === fileLoadGen.current) setBusy(false);
    }
  };

  const runEnrichmentNow = async () => {
    if (!result) return;
    setEnriching(true);
    try {
      const outcome = await enrichWithBYOK(settings, result);
      if (outcome.applied) {
        setResult(outcome.result);
        toast(t('importer.enriched'), { tone: 'success' });
      } else {
        toast(outcome.error ?? t('importer.enrichmentSkipped'), { tone: 'warn' });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t('importer.enrichFailed'), { tone: 'danger' });
    } finally {
      setEnriching(false);
    }
  };

  // Spec §12.8: first-run disclosure before any AI-enriched import.
  const runEnrichment = () => {
    if (shouldShowPrivacyDisclosure()) {
      setDisclosureOpen(true);
      return;
    }
    void runEnrichmentNow();
  };

  const reclassifySection = (sectionId: string, type: SectionType) => {
    if (!result) return;
    setResult({
      ...result,
      resume: {
        ...result.resume,
        sections: result.resume.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                type,
                layout:
                  type === 'skills' ? 'skills-grid' : type === 'summary' ? 'text-block' : 'entry-based',
              }
            : section,
        ),
      },
    });
  };

  const addManualSection = (type: SectionType, title: string, content: string) => {
    if (!result || !content.trim()) return;
    const section: Section = {
      id: makeId(),
      type,
      title: title.trim() || defaultSectionTitle(type),
      visible: true,
      order: result.resume.sections.length,
      layout: layoutForSectionType(type),
      entries: contentToEntries(type, content),
    };
    setResult({
      ...result,
      resume: {
        ...result.resume,
        sections: [...result.resume.sections, section],
      },
      stats: recomputeStats({
        ...result.resume,
        sections: [...result.resume.sections, section],
      }),
    });
    setSelectedSectionIds((prev) => new Set([...prev, section.id]));
    toast(t('importer.manualSectionAdded'), { tone: 'success', ttl: 1500 });
  };

  const appendManualBullets = (sectionId: string, content: string) => {
    if (!result || !content.trim()) return;
    const lines = content
      .split('\n')
      .map((line) => line.replace(/^[-*•▪◦●‣∙·\d.)\s]+/, '').trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const nextResume = {
      ...result.resume,
      sections: result.resume.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const entries = section.entries.length > 0 ? [...section.entries] : [{ id: makeId(), bullets: [] }];
        const entry = entries[entries.length - 1];
        const start = entry.bullets?.length ?? 0;
        entries[entries.length - 1] = {
          ...entry,
          bullets: [
            ...(entry.bullets ?? []),
            ...lines.map((line, index) => ({
              id: makeId(),
              content: line,
              visible: true,
              order: start + index,
            })),
          ],
        };
        return { ...section, entries };
      }),
    };
    setResult({ ...result, resume: nextResume, stats: recomputeStats(nextResume) });
    toast(t('importer.manualBulletsAdded', { count: lines.length }), { tone: 'success', ttl: 1500 });
  };

  const finish = () => {
    if (!result) return;
    const importMeta = {
      sourceText: text,
      sourceName: sourceName || undefined,
      original: originalFile,
    };
    if (mode === 'merge') {
      const sections = result.resume.sections.filter((section) =>
        selectedSectionIds.has(section.id),
      );
      if (sections.length === 0) {
        toast(t('importer.selectAtLeastOne'), { tone: 'warn' });
        return;
      }
      onImported({ ...result.resume, sections }, mode, importMeta);
    } else {
      onImported(result.resume, mode, importMeta);
    }
    onClose();
  };

  const parseSource = () => {
    if (!text.trim()) return;
    parseText(text, undefined, result?.hints);
    toast(t('importer.reparseDone', { defaultValue: 'Parsed.' }), { tone: 'success', ttl: 1200 });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'merge' ? t('importer.titleMerge') : t('importer.title')}
      maxWidth="7xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResult(null);
              setText('');
              setSourceName('');
              setOriginalFile(undefined);
              setStatus('');
              setWarning('');
              sourceSelectionRef.current = '';
            }}
          >
            {t('importer.startFresh')}
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={finish}
              className="btn-primary"
              disabled={!result || (mode === 'merge' && selectedSectionIds.size === 0)}
            >
              {mode === 'merge'
                ? t('importer.mergeSelected', { count: selectedSectionIds.size })
                : t('importer.openEditor')}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex h-full flex-col p-5">
        {/* Toolbar: file source + options, kept compact so the split panes get the height. */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div
            className="flex flex-1 items-center gap-3 rounded-lg border border-dashed border-paper-edge bg-paper-tint px-3 py-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
          >
            {busy ? (
              <Loader2 className="animate-spin text-ink-muted" size={18} />
            ) : (
              <Upload className="text-ink-muted" size={18} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-ink">
                {busy ? t('importer.extracting') : t('importer.dropHere')}
              </p>
              <p className="truncate text-[11px] text-ink-subtle">{t('importer.accepts')}</p>
            </div>
            <button
              type="button"
              className="btn-secondary shrink-0 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {t('importer.chooseFile')}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.txt,.json,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>
          <label className="flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={offlineOnly}
              onChange={(e) => setOfflineOnly(e.target.checked)}
              className="accent-ink"
            />
            {t('importer.offline')}
          </label>
          {!offlineOnly && result && (
            <button
              type="button"
              className="btn-secondary text-xs"
              disabled={!hasKey || enriching}
              onClick={() => void runEnrichment()}
            >
              <Sparkles size={13} />
              {enriching
                ? t('importer.enriching')
                : hasKey
                ? t('importer.enrichBYOK')
                : t('importer.addKeyHint')}
            </button>
          )}
        </div>

        <p className="mb-2 text-[11px] text-ink-subtle">{t('importer.hint')}</p>

        {/* Split screen: left = source text to read/copy from, right = parsed review. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex min-h-0 flex-col rounded-lg border border-paper-edge bg-paper">
            <div className="flex items-center justify-between border-b border-paper-edge px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t('importer.sourceText', { defaultValue: 'Resume text' })}
              </span>
              <button
                type="button"
                className="btn-primary h-7 text-xs"
                disabled={!text.trim()}
                onClick={parseSource}
              >
                <FileText size={13} />
                {result
                  ? t('importer.reparse', { defaultValue: 'Re-parse' })
                  : t('importer.parseThis')}
              </button>
            </div>
            <textarea
              ref={sourceRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onSelect={captureSourceSelection}
              onKeyUp={captureSourceSelection}
              onMouseUp={captureSourceSelection}
              placeholder={t('importer.pastePlaceholder')}
              className="min-h-0 flex-1 resize-none border-0 bg-paper p-3 font-mono text-xs leading-relaxed text-ink focus:outline-none"
              spellCheck
              aria-label={t('importer.sourceText', { defaultValue: 'Resume text' })}
            />
            {(status || warning || result?.warnings.length) && (
              <div className="space-y-1 border-t border-paper-edge px-3 py-2">
                {status && <p className="text-[11px] text-ink-subtle">{status}</p>}
                {warning && <Warning>{warning}</Warning>}
                {result?.warnings.map((item) => <Warning key={item}>{item}</Warning>)}
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            {result ? (
              <ReviewResult
                result={result}
                mode={mode}
                selectedSectionIds={selectedSectionIds}
                getReferenceSelection={getReferenceSelection}
                onToggleSection={(sectionId) => {
                  setSelectedSectionIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(sectionId)) next.delete(sectionId);
                    else next.add(sectionId);
                    return next;
                  });
                }}
                onToggleAll={(selectAll) => {
                  if (!result) return;
                  setSelectedSectionIds(
                    selectAll
                      ? new Set(result.resume.sections.map((section) => section.id))
                      : new Set(),
                  );
                }}
                onReclassify={reclassifySection}
                onAddManualSection={addManualSection}
                onAppendManualBullets={appendManualBullets}
              />
            ) : (
              <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-paper-edge bg-paper-tint p-6 text-center text-sm text-ink-subtle">
                {t('importer.awaiting')}
              </div>
            )}
          </div>
        </div>
      </div>

      <PrivacyDisclosureModal
        open={disclosureOpen}
        onCancel={() => setDisclosureOpen(false)}
        provider={PROVIDER_LABELS[settings.provider]}
        onAck={() => {
          ackPrivacyDisclosure();
          setDisclosureOpen(false);
          void runEnrichmentNow();
        }}
      />
    </Modal>
  );
}

const SECTION_TYPES_FOR_PICKER: SectionType[] = [
  'experience',
  'education',
  'study-abroad',
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

function ReviewResult({
  result,
  mode,
  selectedSectionIds,
  getReferenceSelection,
  onToggleSection,
  onToggleAll,
  onReclassify,
  onAddManualSection,
  onAppendManualBullets,
}: {
  result: ImportParseResult;
  mode: 'create' | 'replace' | 'merge';
  selectedSectionIds: Set<string>;
  getReferenceSelection: () => string;
  onToggleSection: (sectionId: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  onReclassify: (sectionId: string, type: SectionType) => void;
  onAddManualSection: (type: SectionType, title: string, content: string) => void;
  onAppendManualBullets: (sectionId: string, content: string) => void;
}) {
  const { t } = useTranslation();
  const [manualText, setManualText] = useState('');
  const [manualType, setManualType] = useState<SectionType>('custom');
  const [manualTitle, setManualTitle] = useState('');
  const [targetSectionId, setTargetSectionId] = useState(result.resume.sections[0]?.id ?? '');

  const flagsByPath = useMemo(() => {
    const map = new Map<string, ConfidenceFlag>();
    for (const flag of result.flags) {
      if (!map.has(flag.path)) map.set(flag.path, flag);
    }
    return map;
  }, [result]);

  const allSelected =
    result.resume.sections.length > 0 &&
    result.resume.sections.every((section) => selectedSectionIds.has(section.id));

  useEffect(() => {
    if (!targetSectionId && result.resume.sections[0]) {
      setTargetSectionId(result.resume.sections[0].id);
    } else if (
      targetSectionId &&
      !result.resume.sections.some((section) => section.id === targetSectionId)
    ) {
      setTargetSectionId(result.resume.sections[0]?.id ?? '');
    }
  }, [result.resume.sections, targetSectionId]);

  const useSelectedReferenceText = () => {
    const selected = getReferenceSelection();
    if (selected) {
      setManualText((prev) => (prev.trim() ? `${prev.trim()}\n${selected}` : selected));
      toast(t('importer.selectionCopied'), { tone: 'info', ttl: 1200 });
    } else {
      toast(t('importer.noSelection'), { tone: 'warn', ttl: 1500 });
    }
  };

  const addAsSection = () => {
    if (!manualText.trim()) return;
    onAddManualSection(manualType, manualTitle, manualText);
    setManualText('');
    setManualTitle('');
  };

  const appendAsBullets = () => {
    if (!manualText.trim() || !targetSectionId) return;
    onAppendManualBullets(targetSectionId, manualText);
    setManualText('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-lg border border-paper-edge bg-paper p-3">
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Stat
            label={t('editor.name')}
            value={result.resume.header.name || t('importer.verify')}
            warn={Boolean(flagsByPath.get('header.name'))}
          />
          <Stat label={t('importer.contacts')} value={result.stats.contactFields} />
          <Stat label={t('importer.sections')} value={result.stats.sections} />
          <Stat label={t('importer.bulletsLabel')} value={result.stats.bullets} />
        </div>
        {result.hints?.isLikelyLinkedIn && (
          <p className="mt-2 rounded-md bg-paper-tint px-3 py-1.5 text-[11px] text-ink-muted">
            {t('importer.linkedinDetected')}
          </p>
        )}
        {result.hints?.twoColumnDetected && (
          <p className="mt-2 rounded-md bg-paper-tint px-3 py-1.5 text-[11px] text-ink-muted">
            {t('importer.twoColumn')}
          </p>
        )}
        {result.hints?.ocrConfidence !== undefined && (
          <p className="mt-2 rounded-md bg-paper-tint px-3 py-1.5 text-[11px] text-ink-muted">
            {t('importer.ocrConfidence', { n: Math.round(result.hints.ocrConfidence) })}
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-paper-edge bg-paper">
        <div className="flex items-center justify-between border-b border-paper-edge px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('importer.parsedResult')}
          </span>
          {mode === 'merge' && (
            <button
              type="button"
              className="btn-ghost h-7 text-xs"
              onClick={() => onToggleAll(!allSelected)}
            >
              {allSelected ? t('importer.deselectAll') : t('importer.selectAll')}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {mode === 'merge' && (
            <p className="text-[11px] text-ink-subtle">
              {t('importer.selectSectionsHint', { count: selectedSectionIds.size })}
            </p>
          )}
          {result.resume.sections.length === 0 && (
            <p className="rounded-md bg-yellow-50 px-3 py-2 text-xs text-warn">
              {t('importer.noSectionsParsed', {
                defaultValue:
                  'No sections were detected. Edit the resume text on the left and re-parse, or use the missed-content helper below.',
              })}
            </p>
          )}
          {result.resume.sections.map((section) => (
              <details
                key={section.id}
                className="rounded-md border border-paper-edge p-2"
                open
              >
                <summary className="cursor-pointer text-sm font-medium text-ink">
                  {mode === 'merge' && (
                    <input
                      type="checkbox"
                      className="mr-2 align-middle accent-ink"
                      checked={selectedSectionIds.has(section.id)}
                      onChange={() => onToggleSection(section.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t('importer.selectSection', { title: section.title })}
                    />
                  )}
                  <span>{section.title}</span>{' '}
                  <span className="text-xs text-ink-subtle">({section.type})</span>
                  {isUnclassified(section) && (
                    <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                      {t('importer.unclassified')}
                    </span>
                  )}
                </summary>
                {isUnclassified(section) && (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-paper-tint p-2 text-xs">
                    <span className="text-ink-muted">{t('importer.classifyAs')}</span>
                    <select
                      value={section.type}
                      onChange={(e) => onReclassify(section.id, e.target.value as SectionType)}
                      className="rounded border border-paper-edge bg-paper px-2 py-1 text-xs"
                      aria-label={t('importer.sectionTypeAria')}
                    >
                      {SECTION_TYPES_FOR_PICKER.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="mt-2 space-y-2 text-xs text-ink-muted">
                  {section.entries.map((entry, eIdx) => {
                    const path = `sections.${sectionPathForFlag(section.title)}.entries.${eIdx}`;
                    const dateFlag = flagsByPath.get(`${path}.dates`);
                    const titleFlag = flagsByPath.get(`${path}.title`);
                    return (
                      <div key={entry.id} className="rounded bg-paper-tint p-2">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-ink">
                            {entry.title || entry.subtitle || t('editor.entryLabel', { n: eIdx + 1 })}
                          </div>
                          {(titleFlag || dateFlag) && (
                            <span
                              className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-warn"
                              title={(titleFlag?.message ?? dateFlag?.message) || ''}
                            >
                              ⚠ {t('importer.verify')}
                            </span>
                          )}
                        </div>
                        {entry.subtitle && <div>{entry.subtitle}</div>}
                        {(entry.bullets ?? []).map((bullet) => (
                          <div key={bullet.id}>- {bullet.content}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
            {result.flags.length > 0 && (
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-warn">
                <div className="font-semibold">
                  {t('importer.flagged', { count: result.flags.length })}
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {result.flags.slice(0, 6).map((flag) => (
                    <li key={`${flag.path}-${flag.message}`}>
                      {humanizePath(flag.path)}: {flag.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

      <div className="shrink-0 rounded-lg border border-paper-edge bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-edge px-3 py-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t('importer.missedContentTitle')}
            </div>
            <p className="text-[11px] text-ink-subtle">{t('importer.missedContentHint')}</p>
          </div>
          <button type="button" className="btn-ghost h-7 text-xs" onClick={useSelectedReferenceText}>
            {t('importer.useSelectedText')}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-[1fr_0.9fr]">
          <textarea
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={t('importer.missedContentPlaceholder')}
            className="input min-h-32 resize-y font-mono text-xs"
            spellCheck
          />
          <div className="space-y-3 text-xs">
            <div className="rounded-md border border-paper-edge bg-paper-tint p-3">
              <div className="mb-2 font-semibold text-ink">{t('importer.addNewSection')}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-ink-muted">{t('importer.sectionTypeAria')}</span>
                  <select
                    value={manualType}
                    onChange={(e) => {
                      const type = e.target.value as SectionType;
                      setManualType(type);
                      if (!manualTitle.trim()) setManualTitle(defaultSectionTitle(type));
                    }}
                    className="input"
                  >
                    {SECTION_TYPES_FOR_PICKER.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-ink-muted">{t('importer.sectionTitle')}</span>
                  <input
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    placeholder={defaultSectionTitle(manualType)}
                    className="input"
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn-primary mt-3 text-xs"
                disabled={!manualText.trim()}
                onClick={addAsSection}
              >
                {t('importer.addAsSection')}
              </button>
            </div>
            <div className="rounded-md border border-paper-edge bg-paper-tint p-3">
              <div className="mb-2 font-semibold text-ink">{t('importer.addToExisting')}</div>
              <select
                value={targetSectionId}
                onChange={(e) => setTargetSectionId(e.target.value)}
                className="input"
              >
                {result.resume.sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-secondary mt-3 text-xs"
                disabled={!manualText.trim() || !targetSectionId}
                onClick={appendAsBullets}
              >
                {t('importer.addAsBullets')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sectionPathForFlag(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-');
}

function defaultSectionTitle(type: SectionType): string {
  const labels: Record<SectionType, string> = {
    experience: 'Experience',
    education: 'Education',
    'study-abroad': 'Study Abroad',
    projects: 'Projects',
    skills: 'Skills',
    leadership: 'Leadership',
    research: 'Research',
    awards: 'Awards',
    certifications: 'Certifications',
    publications: 'Publications',
    summary: 'Summary',
    custom: 'Imported Content',
    'page-break': 'Page Break',
  };
  return labels[type];
}

function layoutForSectionType(type: SectionType): SectionLayout {
  if (type === 'skills') return 'skills-grid';
  if (type === 'summary') return 'text-block';
  return 'entry-based';
}

function contentToEntries(type: SectionType, content: string): Section['entries'] {
  const lines = content
    .split('\n')
    .map((line) => line.replace(/^[-*•▪◦●‣∙·\d.)\s]+/, '').trim())
    .filter(Boolean);
  if (type === 'summary') {
    return [{ id: makeId(), title: lines.join(' ') }];
  }
  if (type === 'skills') {
    return lines
      .flatMap((line) => line.split(/[,;|]/))
      .map((part) => part.trim())
      .filter(Boolean)
      .map((skill) => ({ id: makeId(), title: 'General', subtitle: skill }));
  }
  if (lines.length === 0) {
    return [{ id: makeId(), bullets: [] }];
  }
  if (lines.length === 1) {
    return [
      {
        id: makeId(),
        bullets: [{ id: makeId(), content: lines[0], visible: true, order: 0 }],
      },
    ];
  }
  return [
    {
      id: makeId(),
      title: lines[0],
      bullets: lines.slice(1).map((line, order) => ({
        id: makeId(),
        content: line,
        visible: true,
        order,
      })),
    },
  ];
}

function recomputeStats(resume: Resume): ImportParseResult['stats'] {
  return {
    contactFields: resume.header.contactFields.length,
    sections: resume.sections.length,
    entries: resume.sections.reduce((sum, section) => sum + section.entries.length, 0),
    bullets: resume.sections.reduce(
      (sum, section) =>
        sum + section.entries.reduce((entrySum, entry) => entrySum + (entry.bullets?.length ?? 0), 0),
      0,
    ),
  };
}

function humanizePath(path: string): string {
  return path.replace(/\./g, ' › ').replace(/sections › /, '');
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div
      className={`rounded-md border px-2 py-2 ${
        warn ? 'border-yellow-200 bg-yellow-50' : 'border-paper-edge bg-paper-tint'
      }`}
    >
      <div className="text-ink-subtle">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-yellow-50 px-2 py-1.5 text-xs text-warn">
      <AlertTriangle size={13} className="mt-0.5 flex-none" />
      <span>{children}</span>
    </div>
  );
}
