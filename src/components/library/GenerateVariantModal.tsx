import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useStore } from '@/store';
import { toast } from '@/hooks/useToast';
import { loadAiSettings } from '@/utils/aiByok';
import { scoreBlocksWithAi } from '@/utils/aiVariant';
import {
  applyVisibility,
  buildVisibilityFrom,
  fitToPages,
  localScoreBlocks,
  type BlockScore,
  type VisibilityMap,
} from '@/utils/blockSelection';
import { estimatePageUsage } from '@/utils/styleChecks';

export function GenerateVariantModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.variantOpen);
  const setOpen = useStore((s) => s.setVariantOpen);
  const resume = useStore((s) => s.currentResume);
  const createVariantFrom = useStore((s) => s.createVariantFrom);
  const navigate = useNavigate();
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<BlockScore[] | null>(null);
  const [maxPages, setMaxPages] = useState(1);
  const [variantName, setVariantName] = useState('');
  const [useAi, setUseAi] = useState(true);

  useEffect(() => {
    if (!open) {
      setJob('');
      setScores(null);
      setBusy(false);
      setVariantName('');
    }
  }, [open]);

  useEffect(() => {
    if (open && resume) {
      // Try to auto-derive a useful name from the tracked application; fall
      // back to a generic "Tailored" suffix. No em dashes anywhere.
      const role = resume.application?.targetRole?.trim();
      const company = resume.application?.companyName?.trim();
      if (role && company) setVariantName(`${resume.name} for ${role} at ${company}`);
      else if (role) setVariantName(`${resume.name} for ${role}`);
      else if (company) setVariantName(`${resume.name} for ${company}`);
      else setVariantName(`${resume.name} Tailored`);
    }
  }, [open, resume]);

  const settings = useMemo(() => loadAiSettings(), [open]);
  const hasKey = Boolean(settings.apiKey.trim());

  const generate = async () => {
    if (!resume) return;
    setBusy(true);
    try {
      const computed = useAi && hasKey
        ? await scoreBlocksWithAi(settings, resume, job)
        : localScoreBlocks(resume, job);
      setScores(computed);
      toast(useAi && hasKey ? t('variant.scored') : t('variant.scoredLocal'), {
        tone: 'success',
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : t('variant.failed'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const fit = useMemo(() => {
    if (!resume || !scores) return null;
    return fitToPages(resume, scores, { maxPages });
  }, [resume, scores, maxPages]);

  const previewResume = useMemo(() => {
    if (!resume) return null;
    if (!fit) return resume;
    return applyVisibility(resume, fit.visibility);
  }, [resume, fit]);

  const previewUsage = previewResume ? estimatePageUsage(previewResume) : 0;

  const create = () => {
    if (!resume) return;
    const baseVisibility: VisibilityMap = fit?.visibility ?? buildVisibilityFrom(resume);
    const next = applyVisibility(resume, baseVisibility);
    const variant = createVariantFrom(
      next,
      variantName.trim() || `${resume.name} variant`,
    );
    toast(t('variant.created'), {
      tone: 'success',
      action: { label: t('common.open'), onClick: () => navigate(`/editor/${variant.id}`) },
    });
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('variant.title')}
      maxWidth="5xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-ink-subtle">{t('variant.footerHint')}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!resume}
              onClick={create}
            >
              {t('variant.create')}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid h-full grid-cols-1 gap-4 p-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">{t('variant.hint')}</p>

          <label className="block text-xs">
            <span className="mb-1 block text-ink-muted">{t('variant.variantName')}</span>
            <input
              value={variantName}
              onChange={(e) => setVariantName(e.target.value)}
              className="input"
            />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-ink-muted">{t('variant.maxPages')}</span>
            <select
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="input"
            >
              <option value={1}>{t('variant.pages1')}</option>
              <option value={2}>{t('variant.pages2')}</option>
              <option value={3}>{t('variant.pages3')}</option>
            </select>
          </label>

          <label className="block text-xs">
            <span className="mb-1 block text-ink-muted">{t('variant.jobDescription')}</span>
            <textarea
              value={job}
              onChange={(e) => setJob(e.target.value)}
              placeholder={t('variant.jobPlaceholder')}
              className="input min-h-48 resize-y"
              spellCheck
            />
          </label>

          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => setUseAi(e.target.checked)}
              className="accent-ink"
              disabled={!hasKey}
            />
            <span>
              {hasKey ? t('variant.useAi') : t('variant.aiUnavailable')}
            </span>
          </label>

          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !resume}
            onClick={() => void generate()}
          >
            {useAi && hasKey ? <Sparkles size={14} /> : <Wand2 size={14} />}
            {busy ? t('variant.scoring') : useAi && hasKey ? t('variant.scoreAi') : t('variant.scoreLocal')}
          </button>
        </div>

        <div className="overflow-y-auto rounded-md border border-paper-edge bg-paper-tint">
          {!fit ? (
            <div className="flex h-full min-h-72 items-center justify-center text-center text-sm text-ink-subtle">
              {t('variant.awaitingScore')}
            </div>
          ) : (
            <div className="space-y-3 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t('variant.pageUsage')} value={`${fit.estimatedUsage}%`} tone={fit.estimatedUsage > 100 ? 'warn' : 'ok'} />
                <Stat label={t('variant.entriesIn')} value={`${fit.includedEntries}/${fit.includedEntries + fit.excludedEntries}`} tone="ok" />
                <Stat label={t('variant.bulletsIn')} value={`${fit.includedBullets}/${fit.includedBullets + fit.excludedBullets}`} tone="ok" />
                <Stat label={t('variant.preview')} value={`${previewUsage}%`} tone={previewUsage > 100 ? 'warn' : 'ok'} />
              </div>

              {previewResume && (
                <div className="space-y-2">
                  {previewResume.sections.map((section) => {
                    const visible = section.entries.filter((e) => e.visible !== false);
                    if (visible.length === 0) return null;
                    return (
                      <div key={section.id} className="rounded-md border border-paper-edge bg-paper p-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                          {section.title}
                        </div>
                        <ul className="space-y-1">
                          {visible.map((entry) => {
                            const usedBullets = (entry.bullets ?? []).filter((b) => b.visible);
                            return (
                              <li key={entry.id}>
                                <div className="font-medium text-ink">
                                  {entry.title || entry.subtitle}
                                </div>
                                {usedBullets.length > 0 && (
                                  <ul className="ml-3 list-disc text-ink-muted">
                                    {usedBullets.map((bullet) => (
                                      <li key={bullet.id}>{bullet.content.replace(/<[^>]*>/g, '')}</li>
                                    ))}
                                  </ul>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' }) {
  return (
    <div className="rounded-md border border-paper-edge bg-paper px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-ink-subtle">{label}</div>
      <div className={`text-sm font-semibold ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</div>
    </div>
  );
}
