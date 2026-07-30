import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Sparkles, Wand2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { useStore } from '@/store';
import { toast } from '@/hooks/useToast';
import { loadAiSettings } from '@/utils/aiByok';
import {
  buildPrioritizedVariantResume,
  coverVisibilityMap,
  fitVariantToPages,
  isManualVisibilitySection,
  localVariantRolePlan,
  planVariantForRole,
  rewriteVariantBulletsWithAi,
  scoreBlocksWithAi,
  type ClarifyingAnswer,
  type VariantBulletRewrite,
  type VariantRolePlan,
} from '@/utils/aiVariant';
import {
  localScoreBlocks,
  type BlockScore,
  type VisibilityMap,
} from '@/utils/blockSelection';
import { replaceBulletContent, stripHtml } from '@/utils/resumeText';
import { estimatePageUsage } from '@/utils/styleChecks';
import type { Entry, Section } from '@/types';

type ProgressPhase = 'idle' | 'planning' | 'questions' | 'scoring' | 'rewriting' | 'done';

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
  const [visibility, setVisibility] = useState<VisibilityMap | null>(null);
  const [rolePlan, setRolePlan] = useState<VariantRolePlan | null>(null);
  const [clarifyingAnswers, setClarifyingAnswers] = useState<Record<string, string>>({});
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
      setVisibility(null);
      setRolePlan(null);
      setClarifyingAnswers({});
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
  const busy = phase === 'planning' || phase === 'scoring' || phase === 'rewriting';
  const canRewrite = hasKey && useAi;
  const needsJob = true;
  const awaitingQuestions = phase === 'questions' && Boolean(rolePlan?.clarifyingQuestions.length);

  const answersList = (plan: VariantRolePlan): ClarifyingAnswer[] =>
    plan.clarifyingQuestions.map((q) => ({
      questionId: q.id,
      answer: clarifyingAnswers[q.id] ?? '',
    }));

  const runScoreAndRewrite = async (plan: VariantRolePlan, answers: ClarifyingAnswer[]) => {
    if (!resume) return;
    const liveSettings = loadAiSettings();
    const liveHasKey = Boolean(liveSettings.apiKey.trim());
    const liveUseAi = useAi && liveHasKey;
    const liveCanRewrite = rewriteBullets && liveUseAi;

    setPhase('scoring');
    let computed: BlockScore[];
    let allowRewrite = liveCanRewrite;
    if (liveUseAi) {
      try {
        computed = await scoreBlocksWithAi(liveSettings, resume, job, plan, answers);
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

    const fitResult = fitVariantToPages(resume, computed, maxPages);
    if (fitResult.includedEntries + fitResult.includedBullets === 0) {
      throw new Error(t('variant.emptyFit'));
    }
    setVisibility(coverVisibilityMap(resume, fitResult.visibility));

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
          plan,
          answers,
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
  };

  const generate = async () => {
    if (!resume) return;
    // Always load the latest key/model; settings can change while this modal stays mounted.
    const liveSettings = loadAiSettings();
    const liveHasKey = Boolean(liveSettings.apiKey.trim());
    const liveUseAi = useAi && liveHasKey;
    if (!job.trim()) {
      toast(t('variant.jobRequired'), { tone: 'warn' });
      return;
    }
    if (resume.sections.every((s) => s.entries.length === 0)) {
      toast(t('variant.emptyResume'), { tone: 'warn' });
      return;
    }
    setPhase('planning');
    setRewrites([]);
    setAcceptedRewriteIds(new Set());
    setVisibility(null);
    setScores(null);
    setRolePlan(null);
    setClarifyingAnswers({});
    try {
      let plan: VariantRolePlan;
      if (liveUseAi) {
        try {
          plan = await planVariantForRole(liveSettings, resume, job);
        } catch {
          plan = localVariantRolePlan(job);
          toast(t('variant.planFallback'), { tone: 'warn', ttl: 4000 });
        }
      } else {
        plan = localVariantRolePlan(job);
      }
      setRolePlan(plan);

      if (liveUseAi && plan.clarifyingQuestions.length > 0) {
        setClarifyingAnswers(
          Object.fromEntries(plan.clarifyingQuestions.map((q) => [q.id, ''])),
        );
        setPhase('questions');
        return;
      }

      await runScoreAndRewrite(plan, []);
    } catch (err) {
      setPhase('idle');
      setScores(null);
      setVisibility(null);
      setRolePlan(null);
      toast(err instanceof Error ? err.message : t('variant.failed'), { tone: 'danger' });
    }
  };

  const continueAfterQuestions = async (skipAnswers: boolean) => {
    if (!resume || !rolePlan) return;
    const answers = skipAnswers ? [] : answersList(rolePlan);
    try {
      await runScoreAndRewrite(rolePlan, answers);
    } catch (err) {
      setPhase('questions');
      toast(err instanceof Error ? err.message : t('variant.failed'), { tone: 'danger' });
    }
  };

  const fit = useMemo(() => {
    if (!resume || !scores) return null;
    return fitVariantToPages(resume, scores, maxPages);
  }, [resume, scores, maxPages]);

  // Keep manual Skills/Additional Information toggles when page budget packing changes.
  useEffect(() => {
    if (!fit || !resume) return;
    setVisibility((prev) => {
      const packed = coverVisibilityMap(resume, fit.visibility);
      if (!prev) return packed;
      const next: VisibilityMap = {
        entries: { ...packed.entries },
        bullets: { ...packed.bullets },
      };
      for (const section of resume.sections) {
        if (!isManualVisibilitySection(section)) continue;
        for (const entry of section.entries) {
          if (entry.id in prev.entries) next.entries[entry.id] = prev.entries[entry.id];
        }
      }
      return next;
    });
  }, [fit, resume]);

  const activeVisibility = visibility ?? fit?.visibility ?? null;

  const previewResume = useMemo(() => {
    if (!resume || !activeVisibility || !scores) return null;
    let next = buildPrioritizedVariantResume(resume, activeVisibility, scores);
    for (const rewrite of rewrites) {
      if (!acceptedRewriteIds.has(rewrite.bulletId)) continue;
      next = replaceBulletContent(next, rewrite.bulletId, rewrite.rewritten);
    }
    return next;
  }, [resume, activeVisibility, scores, rewrites, acceptedRewriteIds]);

  const previewUsage = previewResume ? estimatePageUsage(previewResume) : 0;

  const toggleRewrite = (bulletId: string) => {
    setAcceptedRewriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(bulletId)) next.delete(bulletId);
      else next.add(bulletId);
      return next;
    });
  };

  const toggleEntryVisibility = (entryId: string) => {
    setVisibility((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        entries: { ...prev.entries, [entryId]: !prev.entries[entryId] },
      };
    });
  };

  const create = () => {
    if (!resume || !previewResume || !activeVisibility || !scores) return;
    let next = buildPrioritizedVariantResume(resume, activeVisibility, scores);
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
    phase === 'planning'
      ? t('variant.planning')
      : phase === 'questions'
        ? t('variant.questionsPending')
        : phase === 'scoring'
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
              disabled={!resume || !previewResume || busy}
              title={!previewResume ? t('variant.scoreFirst') : undefined}
              onClick={create}
            >
              {previewResume ? t('variant.create') : t('variant.scoreFirst')}
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
            disabled={busy || awaitingQuestions || !resume || (needsJob && !job.trim())}
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

          {awaitingQuestions && rolePlan && (
            <div className="space-y-3 rounded-md border border-accent/30 bg-accent/5 p-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
                  {t('variant.clarifyingTitle')}
                </h3>
                <p className="mt-1 text-[11px] text-ink-subtle">{t('variant.clarifyingHint')}</p>
              </div>
              <ul className="space-y-3">
                {rolePlan.clarifyingQuestions.map((q) => (
                  <li key={q.id} className="space-y-1.5">
                    <label className="block text-xs" htmlFor={`clarify-${q.id}`}>
                      <span className="font-medium text-ink">{q.question}</span>
                      {q.topic && (
                        <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-subtle">
                          {q.topic}
                        </span>
                      )}
                      {q.why && (
                        <span className="mt-0.5 block text-[11px] text-ink-muted">{q.why}</span>
                      )}
                    </label>
                    <textarea
                      id={`clarify-${q.id}`}
                      value={clarifyingAnswers[q.id] ?? ''}
                      onChange={(e) =>
                        setClarifyingAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                      placeholder={t('variant.clarifyingPlaceholder')}
                      className="input min-h-16 resize-y text-xs"
                      spellCheck
                    />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary flex-1"
                  disabled={busy}
                  onClick={() => void continueAfterQuestions(false)}
                >
                  {t('variant.continueWithAnswers')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => void continueAfterQuestions(true)}
                >
                  {t('variant.skipQuestions')}
                </button>
              </div>
            </div>
          )}

          {rolePlan && (
            <div className="space-y-2 rounded-md border border-paper-edge p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink">
                {t('variant.rolePlan')}
              </h3>
              <p className="text-[11px] text-ink-subtle">{t('variant.rolePlanHint')}</p>
              <p className="text-xs font-medium text-ink">{rolePlan.targetRole}</p>
              {rolePlan.keyFactors.length > 0 && (
                <PlanList label={t('variant.planKeyFactors')} items={rolePlan.keyFactors} />
              )}
              {rolePlan.skillsToHighlight.length > 0 && (
                <PlanList label={t('variant.planHighlight')} items={rolePlan.skillsToHighlight} />
              )}
              {rolePlan.experiencesToReframe.length > 0 && (
                <PlanList label={t('variant.planReframe')} items={rolePlan.experiencesToReframe} />
              )}
              {rolePlan.whatToRewrite.length > 0 && (
                <PlanList label={t('variant.planRewrite')} items={rolePlan.whatToRewrite} />
              )}
              {rolePlan.whatToDeprioritize.length > 0 && (
                <PlanList label={t('variant.planDeprioritize')} items={rolePlan.whatToDeprioritize} />
              )}
              {rolePlan.targetingNotes && (
                <p className="text-[11px] text-ink-muted">{rolePlan.targetingNotes}</p>
              )}
            </div>
          )}

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
          {!fit || !activeVisibility ? (
            <div className="flex h-full min-h-72 items-center justify-center px-4 text-center text-sm text-ink-subtle">
              {awaitingQuestions
                ? t('variant.questionsPending')
                : busy
                  ? statusLabel
                  : t('variant.awaitingScore')}
            </div>
          ) : (
            <div className="space-y-3 p-3 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label={t('variant.pageUsage')} value={`${fit.estimatedUsage}%`} tone={fit.estimatedUsage > 100 ? 'warn' : 'ok'} />
                <Stat label={t('variant.entriesIn')} value={`${fit.includedEntries}/${fit.includedEntries + fit.excludedEntries}`} tone="ok" />
                <Stat label={t('variant.bulletsIn')} value={`${fit.includedBullets}/${fit.includedBullets + fit.excludedBullets}`} tone="ok" />
                <Stat label={t('variant.preview')} value={`${previewUsage}%`} tone={previewUsage > 100 ? 'warn' : 'ok'} />
              </div>
              <p className="text-[11px] text-ink-subtle">{t('variant.visibilityHint')}</p>

              {resume && previewResume && (
                <div className="space-y-2">
                  {previewResume.sections.map((section) => {
                    if (isManualVisibilitySection(section)) {
                      const masterSection = resume.sections.find((item) => item.id === section.id);
                      if (!masterSection) return null;
                      return (
                        <ManualSectionPreview
                          key={section.id}
                          section={masterSection}
                          visibility={activeVisibility}
                          onToggleEntry={toggleEntryVisibility}
                          showLabel={t('variant.showEntry')}
                          hideLabel={t('variant.hideEntry')}
                          hiddenBadge={t('variant.hiddenBadge')}
                        />
                      );
                    }

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
                                {entry.subtitle && entry.title ? (
                                  <div className="text-ink-muted">{entry.subtitle}</div>
                                ) : null}
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

                  {/* Skills/Additional sections that packing dropped entirely still need a home for unhide. */}
                  {resume.sections
                    .filter(
                      (section) =>
                        isManualVisibilitySection(section) &&
                        !previewResume.sections.some((item) => item.id === section.id),
                    )
                    .map((section) => (
                      <ManualSectionPreview
                        key={section.id}
                        section={section}
                        visibility={activeVisibility}
                        onToggleEntry={toggleEntryVisibility}
                        showLabel={t('variant.showEntry')}
                        hideLabel={t('variant.hideEntry')}
                        hiddenBadge={t('variant.hiddenBadge')}
                      />
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ManualSectionPreview({
  section,
  visibility,
  onToggleEntry,
  showLabel,
  hideLabel,
  hiddenBadge,
}: {
  section: Section;
  visibility: VisibilityMap;
  onToggleEntry: (entryId: string) => void;
  showLabel: string;
  hideLabel: string;
  hiddenBadge: string;
}) {
  if (section.entries.length === 0) return null;
  return (
    <div className="rounded-md border border-paper-edge bg-paper p-2">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
        {section.title}
      </div>
      <ul className="space-y-1">
        {section.entries.map((entry) => (
          <ManualEntryRow
            key={entry.id}
            entry={entry}
            visible={visibility.entries[entry.id] === true}
            onToggle={() => onToggleEntry(entry.id)}
            showLabel={showLabel}
            hideLabel={hideLabel}
            hiddenBadge={hiddenBadge}
          />
        ))}
      </ul>
    </div>
  );
}

function ManualEntryRow({
  entry,
  visible,
  onToggle,
  showLabel,
  hideLabel,
  hiddenBadge,
}: {
  entry: Entry;
  visible: boolean;
  onToggle: () => void;
  showLabel: string;
  hideLabel: string;
  hiddenBadge: string;
}) {
  // coverVisibilityMap defaults missing keys; packed false means hidden.
  // Treat explicit false as hidden; missing as hidden for reworked skills after fit.
  const shown = visible;
  return (
    <li
      className={`flex items-start gap-2 rounded-md px-1 py-1 ${
        shown ? '' : 'bg-paper-tint/80 opacity-70'
      }`}
    >
      <button
        type="button"
        className="btn-ghost mt-0.5 shrink-0 p-1"
        title={shown ? hideLabel : showLabel}
        aria-label={shown ? hideLabel : showLabel}
        onClick={onToggle}
      >
        {shown ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">
          {entry.title || entry.subtitle || 'Untitled'}
          {!shown && (
            <span className="ml-1 rounded-full bg-paper-edge/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-subtle">
              {hiddenBadge}
            </span>
          )}
        </div>
        {entry.subtitle && entry.title ? (
          <div className="text-ink-muted">{entry.subtitle}</div>
        ) : null}
      </div>
    </li>
  );
}

function PlanList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">{label}</div>
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[11px] text-ink-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
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
