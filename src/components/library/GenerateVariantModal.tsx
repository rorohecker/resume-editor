import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Wand2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useStore } from '@/store';
import { toast } from '@/hooks/useToast';
import { loadAiSettings } from '@/utils/aiByok';
import {
  rewriteVariantBulletsWithAi,
  scoreBlocksWithAi,
  type VariantBulletRewrite,
} from '@/utils/aiVariant';
import {
  applyVisibility,
  fitToPages,
  localScoreBlocks,
  type BlockScore,
  type VisibilityMap,
} from '@/utils/blockSelection';
import { replaceBulletContent, stripHtml } from '@/utils/resumeText';
import { estimatePageUsage } from '@/utils/styleChecks';

type ProgressPhase = 'idle' | 'scoring' | 'rewriting' | 'done';

export function GenerateVariantModal() {
  const { t } = useTranslation();
  const open = useStore((s) => s.variantOpen);
  const setOpen = useStore((s) => s.setVariantOpen);
  const resume = useStore((s) => s.currentResume);
  const createVariantFrom = useStore((s) => s.createVariantFrom);
  const navigate = useNavigate();
  const [job, setJob] = useState('');
  const [phase, setPhase] = useState<ProgressPhase>('idle');
  const [scores, setScores] = useState<BlockScore[] | null>(null);
  const [maxPages, setMaxPages] = useState(1);
  const [variantName, setVariantName] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [rewriteBullets, setRewriteBullets] = useState(true);
  const [rewrites, setRewrites] = useState<VariantBulletRewrite[]>([]);
  /** Bullet IDs whose rewrite the user wants applied. */
  const [acceptedRewriteIds, setAcceptedRewriteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setJob('');
      setScores(null);
      setPhase('idle');
      setVariantName('');
      setRewrites([]);
      setAcceptedRewriteIds(new Set());
    }
  }, [open]);

  useEffect(() => {
    if (open && resume) {
      const role = resume.application?.targetRole?.trim();
      const company = resume.application?.companyName?.trim();
      if (role && company) setVariantName(t('variant.defaultNameRoleCompany', { name: resume.name, role, company }));
      else if (role) setVariantName(t('variant.defaultNameRole', { name: resume.name, role }));
      else if (company) setVariantName(t('variant.defaultNameCompany', { name: resume.name, company }));
      else setVariantName(t('variant.defaultName', { name: resume.name }));
    }
  }, [open, resume, t]);

  // Re-read settings whenever the modal opens so a key added in AI settings applies.
  const settings = useMemo(() => loadAiSettings(), [open]);
  const hasKey = Boolean(settings.apiKey.trim());
  const busy = phase === 'scoring' || phase === 'rewriting';
  const canRewrite = hasKey && useAi;
  const needsJob = (useAi && hasKey) || (rewriteBullets && canRewrite);

  const generate = async () => {
    if (!resume) return;
    // Always load the latest key/model — settings can change while this modal stays mounted.
    const liveSettings = loadAiSettings();
    const liveHasKey = Boolean(liveSettings.apiKey.trim());
    const liveUseAi = useAi && liveHasKey;
    const liveCanRewrite = rewriteBullets && liveUseAi;
    if ((liveUseAi || liveCanRewrite) && !job.trim()) {
      toast(t('variant.jobRequired'), { tone: 'warn' });
      return;
    }
    if (resume.sections.every((s) => s.entries.length === 0)) {
      toast(t('variant.emptyResume'), { tone: 'warn' });
      return;
    }
    setPhase('scoring');
    setRewrites([]);
    setAcceptedRewriteIds(new Set());
    try {
      let computed: BlockScore[];
      let allowRewrite = liveCanRewrite;
      if (liveUseAi) {
        try {
          computed = await scoreBlocksWithAi(liveSettings, resume, job);
        } catch (aiErr) {
          // Fall back to local ranking so the feature still works if the API fails.
          computed = localScoreBlocks(resume, job);
          allowRewrite = false;
          toast(
            aiErr instanceof Error
              ? t('variant.aiFallback', { message: aiErr.message })
              : t('variant.aiFallback', { message: t('variant.failed') }),
            { tone: 'warn', ttl: 5000 },
          );
        }
      } else {
        computed = localScoreBlocks(resume, job);
      }
      setScores(computed);

      const fitResult = fitToPages(resume, computed, { maxPages });
      if (fitResult.includedEntries + fitResult.includedBullets === 0) {
        throw new Error(t('variant.emptyFit'));
      }

      const includedBulletIds = Object.entries(fitResult.visibility.bullets)
        .filter(([, visible]) => visible)
        .map(([id]) => id);

      if (allowRewrite && includedBulletIds.length > 0) {
        setPhase('rewriting');
        try {
          const nextRewrites = await rewriteVariantBulletsWithAi(
            liveSettings,
            resume,
            job,
            includedBulletIds,
          );
          setRewrites(nextRewrites);
          setAcceptedRewriteIds(new Set(nextRewrites.map((item) => item.bulletId)));
          toast(
            nextRewrites.length > 0
              ? t('variant.rewrote', { count: nextRewrites.length })
              : t('variant.rewroteNone'),
            { tone: 'success' },
          );
        } catch (rewriteErr) {
          // Keep the scored preview even if keyword rewrite fails.
          toast(
            rewriteErr instanceof Error ? rewriteErr.message : t('variant.rewriteFailed'),
            { tone: 'warn' },
          );
        }
      } else {
        toast(liveUseAi ? t('variant.scored') : t('variant.scoredLocal'), {
          tone: 'success',
        });
      }
      setPhase('done');
    } catch (err) {
      setPhase('idle');
      setScores(null);
      toast(err instanceof Error ? err.message : t('variant.failed'), { tone: 'danger' });
    }
  };

  const fit = useMemo(() => {
    if (!resume || !scores) return null;
    return fitToPages(resume, scores, { maxPages });
  }, [resume, scores, maxPages]);

  const previewResume = useMemo(() => {
    if (!resume) return null;
    let next = fit ? applyVisibility(resume, fit.visibility) : resume;
    for (const rewrite of rewrites) {
      if (!acceptedRewriteIds.has(rewrite.bulletId)) continue;
      next = replaceBulletContent(next, rewrite.bulletId, rewrite.rewritten);
    }
    return next;
  }, [resume, fit, rewrites, acceptedRewriteIds]);

  const previewUsage = previewResume ? estimatePageUsage(previewResume) : 0;

  const toggleRewrite = (bulletId: string) => {
    setAcceptedRewriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(bulletId)) next.delete(bulletId);
      else next.add(bulletId);
      return next;
    });
  };

  const create = () => {
    if (!resume || !fit || !previewResume) return;
    const baseVisibility: VisibilityMap = fit.visibility;
    // Apply visibility from the scored fit, then keyword rewrites the user accepted.
    let next = applyVisibility(resume, baseVisibility);
    for (const rewrite of rewrites) {
      if (!acceptedRewriteIds.has(rewrite.bulletId)) continue;
      next = replaceBulletContent(next, rewrite.bulletId, rewrite.rewritten);
    }
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

  const statusLabel =
    phase === 'scoring'
      ? t('variant.scoring')
      : phase === 'rewriting'
        ? t('variant.rewriting')
        : phase === 'done' && rewrites.length > 0
          ? t('variant.statusDoneRewrites', { count: acceptedRewriteIds.size })
          : phase === 'done'
            ? t('variant.statusDone')
            : null;

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
              disabled={!resume || !fit || busy}
              title={!fit ? t('variant.scoreFirst') : undefined}
              onClick={create}
            >
              {fit ? t('variant.create') : t('variant.scoreFirst')}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid h-full grid-cols-1 gap-4 p-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="min-w-0 space-y-3">
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
              className="input min-h-40 resize-y"
              spellCheck
            />
          </label>

          <label className="flex items-start gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={useAi}
              onChange={(e) => {
                setUseAi(e.target.checked);
                if (!e.target.checked) setRewriteBullets(false);
              }}
              className="mt-0.5 accent-ink"
              disabled={!hasKey}
            />
            <span>
              {hasKey ? t('variant.useAi') : t('variant.aiUnavailable')}
            </span>
          </label>

          <label className="flex items-start gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={rewriteBullets && canRewrite}
              onChange={(e) => setRewriteBullets(e.target.checked)}
              className="mt-0.5 accent-ink"
              disabled={!canRewrite}
            />
            <span>
              <span className="font-medium text-ink">{t('variant.rewriteOption')}</span>
              <span className="mt-0.5 block text-ink-subtle">
                {canRewrite ? t('variant.rewriteOptionHint') : t('variant.rewriteNeedsAi')}
              </span>
            </span>
          </label>

          {statusLabel && (
            <div
              className={`rounded-md border px-3 py-2 text-xs ${
                busy
                  ? 'border-accent/30 bg-accent/5 text-ink'
                  : 'border-paper-edge bg-paper-tint text-ink-muted'
              }`}
              role="status"
              aria-live="polite"
            >
              {busy && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />}
              {statusLabel}
            </div>
          )}

          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy || !resume || (needsJob && !job.trim())}
            onClick={() => void generate()}
          >
            {useAi && hasKey ? <Sparkles size={14} /> : <Wand2 size={14} />}
            {busy
              ? statusLabel
              : rewriteBullets && canRewrite
                ? t('variant.scoreAndRewrite')
                : useAi && hasKey
                  ? t('variant.scoreAi')
                  : t('variant.scoreLocal')}
          </button>

          {rewrites.length > 0 && (
            <div className="space-y-2 rounded-md border border-paper-edge p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
                  {t('variant.rewriteReview')}
                </h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-ghost text-[11px]"
                    onClick={() => setAcceptedRewriteIds(new Set(rewrites.map((r) => r.bulletId)))}
                  >
                    {t('variant.acceptAll')}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-[11px]"
                    onClick={() => setAcceptedRewriteIds(new Set())}
                  >
                    {t('variant.acceptNone')}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-ink-subtle">{t('variant.rewriteReviewHint')}</p>
              <ul className="max-h-56 space-y-2 overflow-y-auto">
                {rewrites.map((rewrite) => {
                  const accepted = acceptedRewriteIds.has(rewrite.bulletId);
                  return (
                    <li
                      key={rewrite.bulletId}
                      className={`rounded-md border p-2 text-[11px] ${
                        accepted ? 'border-accent/40 bg-accent/5' : 'border-paper-edge bg-paper'
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={accepted}
                          onChange={() => toggleRewrite(rewrite.bulletId)}
                          className="mt-0.5 accent-ink"
                        />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="block text-ink-subtle line-through decoration-ink-subtle/60">
                            {rewrite.original}
                          </span>
                          <span className="block font-medium text-ink">{rewrite.rewritten}</span>
                          {rewrite.keywordsUsed.length > 0 && (
                            <span className="flex flex-wrap gap-1 pt-0.5">
                              {rewrite.keywordsUsed.map((kw) => (
                                <span
                                  key={kw}
                                  className="rounded-full bg-paper-tint px-1.5 py-0.5 text-[10px] text-ink-muted"
                                >
                                  {kw}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="min-w-0 overflow-y-auto rounded-md border border-paper-edge bg-paper-tint">
          {!fit ? (
            <div className="flex h-full min-h-72 items-center justify-center px-4 text-center text-sm text-ink-subtle">
              {busy ? statusLabel : t('variant.awaitingScore')}
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
                                    {usedBullets.map((bullet) => {
                                      const rewritten = acceptedRewriteIds.has(bullet.id);
                                      return (
                                        <li
                                          key={bullet.id}
                                          className={rewritten ? 'text-ink' : undefined}
                                        >
                                          {stripHtml(bullet.content)}
                                          {rewritten && (
                                            <span className="ml-1 rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                                              {t('variant.rewrittenBadge')}
                                            </span>
                                          )}
                                        </li>
                                      );
                                    })}
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
