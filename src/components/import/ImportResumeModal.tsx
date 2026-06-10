import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Pencil, RefreshCw, Sparkles, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resume } from '@/types';
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
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';
import {
  PrivacyDisclosureModal,
  ackPrivacyDisclosure,
  shouldShowPrivacyDisclosure,
} from './PrivacyDisclosureModal';
import type { SectionType } from '@/types';

export function ImportResumeModal({
  open,
  mode,
  onClose,
  onImported,
}: {
  open: boolean;
  mode: 'create' | 'replace' | 'merge';
  onClose: () => void;
  onImported: (resume: Resume, mode: 'create' | 'replace' | 'merge') => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportParseResult | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState('');
  const [offlineOnly, setOfflineOnly] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const [disclosureOpen, setDisclosureOpen] = useState(false);
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
    }
  }, [open]);

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
    setStatus(t('importer.reading'));
    setBusy(true);
    setWarning('');
    try {
      const extraction = await extractFromFile(file);
      if (extraction.warnings?.length) {
        setWarning(extraction.warnings.join(' '));
      }
      setText(extraction.text);
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
      setWarning(err instanceof Error ? err.message : t('importer.readFailed'));
      setStatus('');
    } finally {
      setBusy(false);
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

  const finish = () => {
    if (!result) return;
    onImported(result.resume, mode);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'merge' ? t('importer.titleMerge') : t('importer.title')}
      maxWidth="5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setResult(null);
              setText('');
              setStatus('');
              setWarning('');
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
              disabled={!result}
            >
              {mode === 'merge' ? t('importer.mergeEditor') : t('importer.openEditor')}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5">
        <p className="mb-4 text-xs text-ink-subtle">
          {t('importer.hint')}
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <div
              className="rounded-lg border border-dashed border-paper-edge bg-paper-tint p-5 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void handleFile(file);
              }}
            >
              {busy ? (
                <Loader2 className="mx-auto animate-spin text-ink-muted" size={24} />
              ) : (
                <Upload className="mx-auto text-ink-muted" size={24} />
              )}
              <p className="mt-2 text-sm font-medium text-ink">
                {busy ? t('importer.extracting') : t('importer.dropHere')}
              </p>
              <p className="mt-1 text-xs text-ink-subtle">
                {t('importer.accepts')}
              </p>
              <button
                type="button"
                className="btn-secondary mt-3"
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

            <label className="flex items-center gap-2 text-xs text-ink-muted">
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
                className="btn-primary w-full text-xs"
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

            <div>
              <label className="mb-1 block text-xs font-medium text-ink-muted">
                {t('importer.pasteLabel')}
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('importer.pastePlaceholder')}
                className="input min-h-64 resize-y"
                spellCheck
              />
              <button
                type="button"
                className="btn-primary mt-3"
                disabled={!text.trim()}
                onClick={() => parseText(text)}
              >
                <FileText size={14} />
                {t('importer.parseThis')}
              </button>
            </div>

            {(status || warning || result?.warnings.length) && (
              <div className="space-y-2">
                {status && <p className="text-xs text-ink-subtle">{status}</p>}
                {warning && <Warning>{warning}</Warning>}
                {result?.warnings.map((item) => <Warning key={item}>{item}</Warning>)}
              </div>
            )}
          </div>

          <div className="min-h-0">
            {result ? (
              <ReviewResult
                result={result}
                onReparse={(edited) => {
                  setText(edited);
                  parseText(edited, undefined, result.hints);
                  toast(t('importer.reparseDone'), { tone: 'success', ttl: 1500 });
                }}
                onReclassify={reclassifySection}
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
  onReparse,
  onReclassify,
}: {
  result: ImportParseResult;
  onReparse: (rawText: string) => void;
  onReclassify: (sectionId: string, type: SectionType) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(result.rawText);

  useEffect(() => {
    setDraft(result.rawText);
    setEditing(false);
  }, [result.rawText]);
  const flagsByPath = useMemo(() => {
    const map = new Map<string, ConfidenceFlag>();
    for (const flag of result.flags) {
      if (!map.has(flag.path)) map.set(flag.path, flag);
    }
    return map;
  }, [result]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-paper-edge bg-paper p-4">
        <h3 className="text-sm font-semibold text-ink">{t('importer.summary')}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
          <p className="mt-3 rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-muted">
            {t('importer.linkedinDetected')}
          </p>
        )}
        {result.hints?.twoColumnDetected && (
          <p className="mt-2 rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-muted">
            {t('importer.twoColumn')}
          </p>
        )}
        {result.hints?.ocrConfidence !== undefined && (
          <p className="mt-2 rounded-md bg-paper-tint px-3 py-2 text-xs text-ink-muted">
            {t('importer.ocrConfidence', { n: Math.round(result.hints.ocrConfidence) })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-paper-edge bg-paper">
          <div className="flex items-center justify-between border-b border-paper-edge px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {editing ? t('importer.editExtracted') : t('importer.extractedText')}
            </span>
            <div className="flex gap-1">
              {editing ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost h-7 text-xs"
                    onClick={() => {
                      setDraft(result.rawText);
                      setEditing(false);
                    }}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn-primary h-7 text-xs"
                    onClick={() => {
                      onReparse(draft);
                      setEditing(false);
                    }}
                  >
                    <RefreshCw size={11} /> {t('importer.reparse')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-ghost h-7 text-xs"
                  onClick={() => setEditing(true)}
                  title={t('importer.reparseHint')}
                >
                  <Pencil size={11} /> {t('importer.edit')}
                </button>
              )}
            </div>
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="block max-h-96 w-full resize-none border-0 bg-paper p-3 font-mono text-xs text-ink focus:outline-none"
              style={{ minHeight: 360 }}
              spellCheck
              aria-label={t('importer.editExtracted')}
            />
          ) : (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap p-3 text-xs text-ink-muted">
              {result.rawText}
            </pre>
          )}
        </div>
        <div className="rounded-lg border border-paper-edge bg-paper">
          <div className="border-b border-paper-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t('importer.parsedResult')}
          </div>
          <div className="max-h-96 space-y-2 overflow-auto p-3">
            {result.resume.sections.map((section) => (
              <details
                key={section.id}
                className="rounded-md border border-paper-edge p-2"
                open
              >
                <summary className="cursor-pointer text-sm font-medium text-ink">
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
      </div>
    </div>
  );
}

function sectionPathForFlag(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-');
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
