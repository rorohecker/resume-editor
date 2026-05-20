import { useEffect, useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { Modal } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';
import { loadAiSettings } from '@/utils/aiByok';
import { generateTailoring, type TailorOutcome } from '@/utils/aiTailor';
import { replaceBulletContent } from '@/utils/resumeText';

export function TailorModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const resume = useStore((s) => s.currentResume);
  const updateResume = useStore((s) => s.updateCurrentResume);
  const setCoverLetterOpen = useStore((s) => s.setCoverLetterOpen);
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<TailorOutcome | null>(null);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setOutcome(null);
      setAccepted(new Set());
      setJob('');
    }
  }, [open]);

  const run = async () => {
    if (!resume) return;
    setBusy(true);
    setOutcome(null);
    setAccepted(new Set());
    try {
      const result = await generateTailoring(loadAiSettings(), resume, job);
      setOutcome(result);
      toast(t('tailor.success', { count: result.bulletRewrites.length }), { tone: 'success' });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('tailor.failed'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const acceptOne = (bulletId: string, rewritten: string) => {
    updateResume((r) => replaceBulletContent(r, bulletId, rewritten));
    setAccepted((prev) => new Set(prev).add(bulletId));
  };

  const acceptAll = () => {
    if (!outcome) return;
    for (const suggestion of outcome.bulletRewrites) {
      acceptOne(suggestion.bulletId, suggestion.rewritten);
    }
    toast(t('tailor.appliedAll'), { tone: 'success' });
  };

  const sendCoverLetter = () => {
    if (!outcome?.coverLetter) return;
    // Toss the generated cover letter into the cover-letter modal via clipboard.
    void navigator.clipboard.writeText(outcome.coverLetter);
    toast(t('tailor.coverLetterCopied'), {
      tone: 'success',
      action: { label: t('tailor.openEditor'), onClick: () => setCoverLetterOpen(true) },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('tailor.title')}
      maxWidth="5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('tailor.done')}
          </button>
          {outcome && outcome.bulletRewrites.length > 0 && (
            <button type="button" className="btn-primary" onClick={acceptAll}>
              <Check size={14} /> {t('tailor.applyAll')}
            </button>
          )}
        </div>
      }
    >
      <div className="grid h-full grid-cols-1 gap-4 p-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">
            {t('tailor.hint')}
          </p>
          <textarea
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder={t('tailor.jobPlaceholder')}
            className="input min-h-64 resize-y"
            spellCheck
          />
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !job.trim() || !resume}
            onClick={() => void run()}
          >
            <Sparkles size={14} />
            {busy ? t('tailor.tailoring') : t('tailor.tailorBYOK')}
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto">
          {!outcome ? (
            <div className="flex h-full min-h-72 items-center justify-center rounded-md border border-paper-edge bg-paper-tint p-6 text-center text-sm text-ink-subtle">
              {t('tailor.awaitingSuggestions')}
            </div>
          ) : (
            <>
              <SkillsCard title={t('tailor.emphasize')} tone="ok" items={outcome.emphasizedSkills} />
              <SkillsCard title={t('tailor.deemphasize')} tone="warn" items={outcome.deprioritizedSkills} />

              <section className="rounded-md border border-paper-edge bg-paper">
                <div className="border-b border-paper-edge px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {t('tailor.bulletRewrites', { count: outcome.bulletRewrites.length })}
                </div>
                <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                  {outcome.bulletRewrites.length === 0 ? (
                    <p className="text-xs text-ink-subtle">
                      {t('tailor.noRewrites')}
                    </p>
                  ) : (
                    outcome.bulletRewrites.map((suggestion) => (
                      <div
                        key={suggestion.bulletId}
                        className="rounded-md border border-paper-edge p-2 text-xs"
                      >
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                          {suggestion.sectionTitle} · {suggestion.entryTitle}
                        </div>
                        <div className="text-ink-muted line-through">{suggestion.original}</div>
                        <div className="mt-1 text-ink">{suggestion.rewritten}</div>
                        <button
                          type="button"
                          className={`mt-2 text-[11px] font-medium ${
                            accepted.has(suggestion.bulletId) ? 'text-ok' : 'text-accent'
                          }`}
                          onClick={() => acceptOne(suggestion.bulletId, suggestion.rewritten)}
                        >
                          {accepted.has(suggestion.bulletId) ? t('tailor.applied') : t('tailor.applyRewrite')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {outcome.summary && (
                <section className="rounded-md border border-paper-edge bg-paper p-3 text-xs">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('tailor.tailoredSummary')}
                  </div>
                  <p className="text-ink">{outcome.summary}</p>
                  <button
                    type="button"
                    className="mt-2 text-[11px] font-medium text-accent"
                    onClick={() => {
                      void navigator.clipboard.writeText(outcome.summary);
                      toast(t('tailor.summaryCopied'), { tone: 'success', ttl: 1500 });
                    }}
                  >
                    {t('common.copy')}
                  </button>
                </section>
              )}

              {outcome.coverLetter && (
                <section className="rounded-md border border-paper-edge bg-paper p-3 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
                      {t('tailor.tailoredCoverLetter')}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-accent"
                      onClick={sendCoverLetter}
                    >
                      {t('tailor.openCoverLetterEditor')}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap text-ink">{outcome.coverLetter}</p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SkillsCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'ok' | 'warn';
}) {
  if (items.length === 0) return null;
  const color = tone === 'ok' ? 'text-ok bg-green-50 border-green-200' : 'text-warn bg-yellow-50 border-yellow-200';
  return (
    <section className={`rounded-md border p-3 text-xs ${color}`}>
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide">
        {tone === 'warn' && <X size={10} />} {title}
      </div>
      <div className="flex flex-wrap gap-1">
        {items.map((skill) => (
          <span key={skill} className="rounded-full bg-paper/60 px-2 py-0.5">
            {skill}
          </span>
        ))}
      </div>
    </section>
  );
}
