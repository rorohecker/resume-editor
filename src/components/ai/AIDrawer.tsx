import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Languages, Search, Settings, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkGrammar, type GrammarHit } from '@/utils/grammar';
import { useStore } from '@/store';
import { upsertSummarySection } from '@/utils/summarySection';
import {
  ACTION_VERBS,
  analyzeBullets,
  detectWeakLanguage,
  generateSummary,
  rewriteBullet,
  scanAtsKeywords,
} from '@/utils/aiAssist';
import {
  KEY_LINKS,
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  AI_RETRY_EVENT,
  clearAiSettings,
  generateAiText,
  loadAiSettings,
  loadCurrentUsage,
  promptForAtsKeywords,
  promptForRewrite,
  promptForSummary,
  resetAiUsage,
  saveAiSettings,
  testAiConnection,
  type AiProvider,
  type AiRetryInfo,
  type AiSettings,
} from '@/utils/aiByok';
import {
  applyAgentPlan,
  parseAgentPlan,
  promptForAgentControl,
  promptForReorganize,
  type AgentPlan,
} from '@/utils/aiAgent';
import { wipeAllLocalData } from '@/utils/localData';
import { collectBullets, replaceBulletContent } from '@/utils/resumeText';
import { Drawer } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';
import { copyToClipboard, readClipboard } from '@/utils/clipboard';

type Tab = 'rewrite' | 'organize' | 'agent' | 'xyz' | 'weak' | 'grammar' | 'keywords' | 'summary' | 'verbs' | 'settings';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'rewrite', labelKey: 'ai.tabRewrite' },
  { id: 'organize', labelKey: 'ai.tabOrganize' },
  { id: 'agent', labelKey: 'ai.tabAgent' },
  { id: 'xyz', labelKey: 'ai.tabXyz' },
  { id: 'weak', labelKey: 'ai.tabWeak' },
  { id: 'grammar', labelKey: 'ai.tabGrammar' },
  { id: 'keywords', labelKey: 'ai.tabAts' },
  { id: 'summary', labelKey: 'ai.tabSummary' },
  { id: 'verbs', labelKey: 'ai.tabVerbs' },
  { id: 'settings', labelKey: 'ai.tabSettings' },
];

// Keep numeric rate-limit inputs valid: an empty/invalid field would otherwise
// persist NaN and break the usage checks that gate AI calls.
function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function AIDrawer() {
  const { t } = useTranslation();
  const open = useStore((s) => s.aiOpen);
  const setOpen = useStore((s) => s.setAiOpen);
  const setCoverLetterOpen = useStore((s) => s.setCoverLetterOpen);
  const resume = useStore((s) => s.currentResume);
  const updateResume = useStore((s) => s.updateCurrentResume);
  const [tab, setTab] = useState<Tab>('rewrite');
  const [settings, setSettings] = useState<AiSettings>(() => loadAiSettings());
  const [showKey, setShowKey] = useState(false);
  const [selectedBulletId, setSelectedBulletId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [organizeInstruction, setOrganizeInstruction] = useState('');
  const [agentMessage, setAgentMessage] = useState('');
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  const [aiError, setAiError] = useState('');
  const [retryNote, setRetryNote] = useState('');
  const [cloudRewriteOptions, setCloudRewriteOptions] = useState<string[]>([]);
  const [cloudSummary, setCloudSummary] = useState('');
  const [cloudAts, setCloudAts] = useState('');
  const [verbQuery, setVerbQuery] = useState('');
  const [grammarHits, setGrammarHits] = useState<GrammarHit[]>([]);
  const [grammarRan, setGrammarRan] = useState(false);
  const [customModelMode, setCustomModelMode] = useState(false);

  // Switching resumes must not leave another resume's AI output on screen.
  useEffect(() => {
    setPendingPlan(null);
    setCloudRewriteOptions([]);
    setCloudSummary('');
    setCloudAts('');
    setGrammarHits([]);
    setGrammarRan(false);
    setAiError('');
    setSelectedBulletId('');
  }, [resume?.id]);

  // Re-load settings when the drawer opens so migrations / other tabs stay in sync.
  useEffect(() => {
    if (open) {
      const loaded = loadAiSettings();
      setSettings(loaded);
      setCustomModelMode(!PROVIDER_MODELS[loaded.provider].includes(loaded.model));
      setRetryNote('');
    }
  }, [open]);

  useEffect(() => {
    setPendingPlan(null);
  }, [tab]);

  // Keep the active AI tab visible in the horizontal strip without scrolling the drawer body.
  useEffect(() => {
    const active = document.querySelector<HTMLElement>('[data-ai-tab][aria-selected="true"]');
    const list = active?.closest<HTMLElement>('[role="tablist"]');
    if (!active || !list) return;
    const tabRect = active.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (tabRect.left < listRect.left) {
      list.scrollLeft -= listRect.left - tabRect.left + 8;
    } else if (tabRect.right > listRect.right) {
      list.scrollLeft += tabRect.right - listRect.right + 8;
    }
  }, [tab]);

  // Surface provider overload retries while a cloud call is in flight.
  useEffect(() => {
    if (!open) return;
    const onRetry = (event: Event) => {
      const detail = (event as CustomEvent<AiRetryInfo>).detail;
      if (!detail) return;
      setRetryNote(
        t('ai.retrying', {
          attempt: detail.attempt,
          max: detail.maxRetries,
          seconds: Math.ceil(detail.delayMs / 1000),
        }),
      );
    };
    window.addEventListener(AI_RETRY_EVENT, onRetry);
    return () => window.removeEventListener(AI_RETRY_EVENT, onRetry);
  }, [open, t]);

  const bullets = useMemo(() => (resume ? collectBullets(resume) : []), [resume]);
  const selectedBullet = bullets.find((b) => b.bulletId === selectedBulletId) ?? bullets[0];
  const localRewriteOptions = selectedBullet ? rewriteBullet(selectedBullet.content, instruction) : [];
  const rewriteOptions = cloudRewriteOptions.length > 0 ? cloudRewriteOptions : localRewriteOptions;
  const bulletAnalysis = useMemo(() => (resume ? analyzeBullets(resume) : []), [resume]);
  const weakHits = useMemo(() => (resume ? detectWeakLanguage(resume) : []), [resume]);
  const keywordHits = useMemo(
    () => (resume && jobDescription.trim() ? scanAtsKeywords(resume, jobDescription) : []),
    [jobDescription, resume],
  );
  const hasKey = Boolean(settings.apiKey.trim());

  const persistSettings = (next: AiSettings) => {
    setSettings(next);
    saveAiSettings(next);
  };

  const acceptRewrite = (content: string) => {
    if (!selectedBullet) return;
    updateResume((current) => replaceBulletContent(current, selectedBullet.bulletId, content));
    toast(t('ai.bulletReplaced'), { tone: 'success', ttl: 1500 });
  };

  const runCloud = async (label: string, fn: (live: AiSettings) => Promise<void>) => {
    setAiError('');
    setRetryNote('');
    setBusy(label);
    try {
      const live = loadAiSettings();
      setSettings(live);
      await fn(live);
      setRetryNote('');
    } catch (err) {
      setRetryNote('');
      setAiError(err instanceof Error ? err.message : t('ai.requestFailed'));
    } finally {
      setBusy('');
    }
  };

  const generateCloudRewrite = () =>
    runCloud('rewrite', async (live) => {
      if (!resume || !selectedBullet) return;
      const text = await generateAiText(
        live,
        promptForRewrite(resume, selectedBullet.content, instruction),
        1200,
      );
      setCloudRewriteOptions(
        text
          .split('\n')
          .map((line) => line.replace(/^[-\d.)\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3),
      );
    });

  const runOrganize = () =>
    runCloud('organize', async (live) => {
      if (!resume) return;
      const text = await generateAiText(
        live,
        promptForReorganize(resume, organizeInstruction, live.agentInstructions),
        3200,
      );
      setPendingPlan(parseAgentPlan(text));
    });

  const runAgent = () =>
    runCloud('agent', async (live) => {
      if (!resume || !agentMessage.trim()) return;
      const text = await generateAiText(
        live,
        promptForAgentControl(resume, agentMessage.trim(), live.agentInstructions),
        3200,
      );
      setPendingPlan(parseAgentPlan(text));
    });

  const applyPendingPlan = () => {
    if (!pendingPlan) return;
    updateResume((current) => {
      const result = applyAgentPlan(current, pendingPlan);
      if (result.applied === 0) {
        toast(t('ai.agentNoChanges'), { tone: 'warn', ttl: 2500 });
        return current;
      }
      toast(pendingPlan.summary || t('ai.agentApplied'), { tone: 'success', ttl: 2200 });
      return result.resume;
    });
    setPendingPlan(null);
  };

  const summaryText = cloudSummary || (resume ? generateSummary(resume) : '');
  const addSummary = () => {
    if (!resume || !summaryText) return;
    updateResume((current) => ({
      ...current,
      sections: upsertSummarySection(current.sections, summaryText, t('editor.sectionSummary')),
    }));
    toast(t('ai.summaryAdded'), { tone: 'success', ttl: 1800 });
  };

  const copyText = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    if (!ok) {
      toast(t('editor.copyFailed', { defaultValue: 'Could not copy to clipboard' }), {
        tone: 'danger',
      });
      return;
    }
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1200);
  };

  const filteredVerbs = useMemo(() => {
    const q = verbQuery.trim().toLowerCase();
    return Object.entries(ACTION_VERBS)
      .map(([category, verbs]) => ({
        category,
        verbs: verbs.filter(
          (verb) => !q || verb.toLowerCase().includes(q) || category.toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.verbs.length > 0);
  }, [verbQuery]);

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={t('ai.drawerTitle')}
      icon={<Sparkles size={16} className="text-accent" />}
      badge={
        <span className="hidden truncate rounded-full bg-paper-tint px-2 py-0.5 text-xs text-ink-muted sm:inline">
          {hasKey ? PROVIDER_LABELS[settings.provider] : t('ai.localFallback')}
        </span>
      }
      maxWidth="2xl"
      toolbar={
        <div className="bg-paper px-3 py-2">
          <div
            role="tablist"
            aria-label={t('ai.drawerTitle')}
            className="flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                onClick={() => setTab(item.id)}
                className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === item.id
                    ? 'bg-ink text-paper'
                    : 'text-ink-muted hover:bg-paper-tint hover:text-ink'
                }`}
                aria-selected={tab === item.id}
                data-ai-tab
              >
                {t(item.labelKey)}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{t('ai.optionalNote')}</p>
        </div>
      }
    >
      <div className="p-4 text-sm text-ink-muted">
        {retryNote && (
          <div className="mb-3 break-words rounded-md border border-paper-edge bg-paper-tint px-3 py-2 text-ink">
            {retryNote}
          </div>
        )}
        {aiError && (
          <div className="mb-3 break-words rounded-md bg-red-50 px-3 py-2 text-danger">{aiError}</div>
        )}
        {!resume ? (
          <p>{t('ai.openResume')}</p>
        ) : (
          <>
            {tab !== 'settings' && !hasKey && (
              <div className="mb-4 rounded-md border border-paper-edge bg-paper-tint p-3">
                <div className="flex items-center gap-2 font-medium text-ink">
                  <KeyRound size={15} />
                  {t('ai.noKey')}
                </div>
                <p className="mt-1 text-xs">
                  {t('ai.noKeyHint')}
                </p>
                <button
                  type="button"
                  className="btn-secondary mt-2 text-xs"
                  onClick={() => setTab('settings')}
                >
                  {t('ai.addKey')}
                </button>
              </div>
            )}

            {tab === 'rewrite' && (
              <Panel title={t('ai.bulletRewriter')} icon={<Wand2 size={15} />}>
                {bullets.length === 0 ? (
                  <p>{t('ai.noBullets')}</p>
                ) : (
                  <div className="space-y-3">
                    <select
                      value={selectedBullet?.bulletId ?? ''}
                      onChange={(e) => {
                        setSelectedBulletId(e.target.value);
                        setCloudRewriteOptions([]);
                      }}
                      className="input"
                      aria-label={t('ai.selectBullet')}
                    >
                      {bullets.map((b) => (
                        <option key={b.bulletId} value={b.bulletId}>
                          {b.sectionTitle} - {b.content.slice(0, 50)}
                        </option>
                      ))}
                    </select>
                    <textarea
                      value={instruction}
                      onChange={(e) => setInstruction(e.target.value)}
                      placeholder={t('ai.rewriteInstruction')}
                      className="input min-h-20 resize-y"
                      spellCheck
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={!hasKey || busy === 'rewrite'}
                        onClick={() => void generateCloudRewrite()}
                      >
                        {busy === 'rewrite' ? t('ai.summaryGenerating') : t('ai.generateBYOK')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => setCloudRewriteOptions([])}
                      >
                        {t('ai.useLocal')}
                      </button>
                    </div>
                    <div className="space-y-2">
                      {rewriteOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="w-full break-words rounded-md border border-paper-edge p-3 text-left text-ink hover:bg-paper-tint"
                          onClick={() => acceptRewrite(option)}
                        >
                          <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-accent">
                            <Check size={13} /> {t('ai.acceptOption')}
                          </span>
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </Panel>
            )}

            {tab === 'organize' && (
              <Panel title={t('ai.organizeTitle')} icon={<Wand2 size={15} />}>
                <p className="mb-3 text-xs text-ink-subtle">{t('ai.organizeHint')}</p>
                <textarea
                  value={organizeInstruction}
                  onChange={(e) => setOrganizeInstruction(e.target.value)}
                  placeholder={t('ai.organizePlaceholder')}
                  className="input mb-3 min-h-20 resize-y"
                  spellCheck
                />
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={!hasKey || busy === 'organize' || bullets.length === 0}
                  onClick={() => void runOrganize()}
                >
                  {busy === 'organize' ? t('ai.agentPlanning') : t('ai.organizeRun')}
                </button>
                {pendingPlan && tab === 'organize' && (
                  <AgentPlanPreview
                    plan={pendingPlan}
                    onApply={applyPendingPlan}
                    onDismiss={() => setPendingPlan(null)}
                  />
                )}
              </Panel>
            )}

            {tab === 'agent' && (
              <Panel title={t('ai.agentTitle')} icon={<Sparkles size={15} />}>
                <p className="mb-3 text-xs text-ink-subtle">{t('ai.agentHint')}</p>
                <textarea
                  value={agentMessage}
                  onChange={(e) => setAgentMessage(e.target.value)}
                  placeholder={t('ai.agentPlaceholder')}
                  className="input mb-3 min-h-24 resize-y"
                  spellCheck
                />
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={!hasKey || busy === 'agent' || !agentMessage.trim()}
                  onClick={() => void runAgent()}
                >
                  {busy === 'agent' ? t('ai.agentPlanning') : t('ai.agentRun')}
                </button>
                {pendingPlan && tab === 'agent' && (
                  <AgentPlanPreview
                    plan={pendingPlan}
                    onApply={applyPendingPlan}
                    onDismiss={() => setPendingPlan(null)}
                  />
                )}
              </Panel>
            )}

            {tab === 'xyz' && (
              <Panel title={t('ai.xyzCheck')} icon={<Search size={15} />}>
                {bulletAnalysis.length === 0 ? (
                  <p>{t('ai.xyzNoBullets')}</p>
                ) : (
                  <div className="space-y-2">
                    {bulletAnalysis.map((item) => (
                      <ResultCard key={item.id} good={item.suggestions.length === 0}>
                        <div className="font-medium text-ink">{item.label}</div>
                        <p className="mt-1">{item.content}</p>
                        {item.suggestions.length > 0 ? (
                          <ul className="mt-2 list-disc pl-5">
                            {item.suggestions.map((s) => (
                              <li key={s}>{t(`ai.suggestion.${s}`)}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-ok">{t('ai.xyzGood')}</p>
                        )}
                      </ResultCard>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {tab === 'grammar' && (
              <Panel title={t('ai.grammarTitle')} icon={<Languages size={15} />}>
                <p className="mb-2 text-xs">
                  {t('ai.grammarHint')}
                </p>
                <button
                  type="button"
                  className="btn-primary text-xs"
                  disabled={busy === 'grammar' || bullets.length === 0}
                  onClick={() =>
                    void runCloud('grammar', async () => {
                      const hits = await checkGrammar(
                        bullets.map((b) => ({ bulletId: b.bulletId, bulletLabel: `${b.sectionTitle} - ${b.entryTitle}`, content: b.content })),
                      );
                      setGrammarHits(hits);
                      setGrammarRan(true);
                    })
                  }
                >
                  {busy === 'grammar' ? t('ai.grammarRunning') : t('ai.grammarRun')}
                </button>
                <div className="mt-3 space-y-2">
                  {grammarRan && grammarHits.length === 0 && (
                    <ResultCard good>
                      <span className="text-ink">{t('ai.grammarClean')}</span>
                    </ResultCard>
                  )}
                  {grammarHits.map((hit, idx) => (
                    <ResultCard key={`${hit.bulletId}-${idx}`} good={false}>
                      <div className="font-medium text-ink">{hit.bulletLabel}</div>
                      <p className="mt-1 text-xs">{hit.message}</p>
                      <p className="mt-1 text-[11px] text-ink-subtle">...{hit.context}...</p>
                      {hit.replacements.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {hit.replacements.map((r) => (
                            <button
                              key={r}
                              type="button"
                              className="rounded-md border border-paper-edge bg-paper px-2 py-0.5 text-xs hover:bg-paper-tint"
                              title={t('ai.applySuggestion', { defaultValue: 'Apply suggestion' })}
                              onClick={() => {
                                const bullet = bullets.find((b) => b.bulletId === hit.bulletId);
                                if (!bullet) return;
                                const plain = bullet.content.replace(/<[^>]*>/g, '');
                                let next: string;
                                if (plain === bullet.content) {
                                  next =
                                    plain.slice(0, hit.offset) +
                                    r +
                                    plain.slice(hit.offset + hit.length);
                                } else {
                                  const snippet = plain.slice(hit.offset, hit.offset + hit.length);
                                  next = snippet
                                    ? bullet.content.replace(snippet, r)
                                    : bullet.content;
                                }
                                if (next === bullet.content) {
                                  void copyText(r, r);
                                  return;
                                }
                                updateResume((current) =>
                                  replaceBulletContent(current, hit.bulletId, next),
                                );
                                setGrammarHits((cur) =>
                                  cur.filter(
                                    (item) =>
                                      !(
                                        item.bulletId === hit.bulletId &&
                                        item.offset === hit.offset &&
                                        item.length === hit.length
                                      ),
                                  ),
                                );
                                toast(t('ai.bulletReplaced'), { tone: 'success', ttl: 1500 });
                              }}
                            >
                              {r}
                            </button>
                          ))}
                        </div>
                      )}
                    </ResultCard>
                  ))}
                </div>
              </Panel>
            )}

            {tab === 'weak' && (
              <Panel title={t('ai.weakDetector')} icon={<Search size={15} />}>
                {weakHits.length === 0 ? (
                  <p>{t('ai.weakNone')}</p>
                ) : (
                  <div className="space-y-2">
                    {weakHits.map((hit, index) => (
                      <ResultCard key={`${hit.phrase}-${index}`} good={false}>
                        <div className="font-medium text-ink">{hit.bulletLabel}</div>
                        <p className="mt-1">{hit.content}</p>
                        <p className="mt-2 text-xs">
                          {t('ai.replaceWith', { phrase: hit.phrase })}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {hit.replacementOptions.map((option) => (
                            <button
                              key={option}
                              type="button"
                              className="rounded-md border border-paper-edge bg-paper px-2 py-1 text-xs hover:bg-paper-tint"
                              onClick={() => void copyText(option, option)}
                            >
                              {copied === option ? t('common.copied') : option}
                            </button>
                          ))}
                        </div>
                      </ResultCard>
                    ))}
                  </div>
                )}
              </Panel>
            )}

            {tab === 'keywords' && (
              <Panel title={t('ai.atsTitle')} icon={<Search size={15} />}>
                <textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder={t('ai.atsPlaceholder')}
                  className="input min-h-36 resize-y"
                  spellCheck
                />
                <button
                  type="button"
                  className="btn-primary mt-3 text-xs"
                  disabled={!hasKey || !jobDescription.trim() || busy === 'ats'}
                  onClick={() =>
                    void runCloud('ats', async (live) => {
                      setCloudAts(
                        await generateAiText(
                          live,
                          promptForAtsKeywords(resume, jobDescription),
                          1600,
                        ),
                      );
                    })
                  }
                >
                  {busy === 'ats' ? t('ai.atsScanning') : t('ai.atsScan')}
                </button>
                {cloudAts && (
                  <ResultCard good>
                    <div className="font-medium text-ink">{t('ai.atsResult')}</div>
                    <pre className="mt-2 whitespace-pre-wrap text-xs">{cloudAts}</pre>
                  </ResultCard>
                )}
                <div className="mt-3 space-y-2">
                  {keywordHits.map((hit) => (
                    <div
                      key={hit.keyword}
                      className="flex items-center justify-between rounded-md border border-paper-edge px-3 py-2"
                    >
                      <span className="font-medium text-ink">{hit.keyword}</span>
                      <span className={hit.found ? 'text-ok' : 'text-danger'}>
                        {hit.found ? t('ai.atsFound') : t('ai.atsMissing', { section: hit.suggestedSection })}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {tab === 'summary' && (
              <Panel title={t('ai.summaryTitle')} icon={<Sparkles size={15} />}>
                <div className="space-y-3">
                  <ResultCard good>
                    <div className="font-medium text-ink">{t('ai.summaryGenerated')}</div>
                    <p className="mt-1">{summaryText}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary text-xs"
                        disabled={!hasKey || busy === 'summary'}
                        onClick={() =>
                          void runCloud('summary', async (live) =>
                            setCloudSummary(
                              await generateAiText(live, promptForSummary(resume), 1000),
                            ),
                          )
                        }
                      >
                        {busy === 'summary' ? t('ai.summaryGenerating') : t('ai.generateBYOK')}
                      </button>
                      <button type="button" className="btn-secondary text-xs" onClick={addSummary}>
                        {t('ai.summaryAdd')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        onClick={() => copyText('summary', summaryText)}
                      >
                        <Copy size={13} />
                        {copied === 'summary' ? t('common.copied') : t('common.copy')}
                      </button>
                    </div>
                  </ResultCard>

                  <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs">
                    {t('ai.coverLetterHint')}{' '}
                    <button
                      type="button"
                      className="font-medium text-accent underline-offset-2 hover:underline"
                      onClick={() => {
                        setOpen(false);
                        setCoverLetterOpen(true);
                      }}
                    >
                      {t('ai.openCoverLetter')}
                    </button>
                  </div>
                </div>
              </Panel>
            )}

            {tab === 'verbs' && (
              <Panel title={t('ai.verbBank')} icon={<Sparkles size={15} />}>
                <div className="mb-3 flex items-center gap-2 rounded-md border border-paper-edge px-2 py-1.5">
                  <Search size={14} />
                  <input
                    value={verbQuery}
                    onChange={(e) => setVerbQuery(e.target.value)}
                    placeholder={t('ai.searchVerbs')}
                    className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none"
                    aria-label={t('ai.searchVerbs')}
                  />
                </div>
                <div className="space-y-4">
                  {filteredVerbs.map(({ category, verbs }) => (
                    <div key={category}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {category}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {verbs.map((verb) => (
                          <button
                            key={verb}
                            type="button"
                            className="rounded-md border border-paper-edge px-2 py-1 text-xs text-ink hover:bg-paper-tint"
                            onClick={() => copyText(verb, verb)}
                          >
                            {copied === verb ? t('common.copied') : verb}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {tab === 'settings' && (
              <Panel title={t('ai.settingsTitle')} icon={<Settings size={15} />}>
                <div className="space-y-4">
                  <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-warn">
                    {t('ai.securityWarning')}
                  </div>
                  {settings.provider === 'openai' && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-xs text-warn">
                      {t('ai.openaiSubscriptionNote')}
                    </div>
                  )}
                  <Field label={t('ai.provider')}>
                    <select
                      value={settings.provider}
                      onChange={(e) => {
                        const provider = e.target.value as AiProvider;
                        setCustomModelMode(false);
                        persistSettings({ ...settings, provider, model: PROVIDER_MODELS[provider][0] });
                      }}
                      className="input"
                    >
                      {Object.entries(PROVIDER_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('ai.apiKey')}>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={settings.apiKey}
                        onChange={(e) => persistSettings({ ...settings, apiKey: e.target.value })}
                        className="input min-w-0 flex-1 basis-40"
                        placeholder={t('ai.apiKeyPlaceholder')}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={t('ai.apiKey')}
                      />
                      <button
                        type="button"
                        className="btn-secondary flex-shrink-0 text-xs"
                        onClick={() => setShowKey(!showKey)}
                        aria-label={showKey ? t('ai.hideKey') : t('ai.showKey')}
                      >
                        {showKey ? t('ai.hideLabel') : t('ai.showLabel')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary flex-shrink-0 text-xs"
                        onClick={() =>
                          void readClipboard().then((apiKey) => {
                            if (apiKey == null) {
                              toast(t('editor.copyFailed', { defaultValue: 'Clipboard unavailable' }), {
                                tone: 'danger',
                              });
                              return;
                            }
                            persistSettings({ ...settings, apiKey });
                          })
                        }
                      >
                        {t('ai.paste')}
                      </button>
                    </div>
                  </Field>
                  <Field label={t('ai.model')}>
                    <select
                      value={
                        customModelMode || !PROVIDER_MODELS[settings.provider].includes(settings.model)
                          ? '__custom__'
                          : settings.model
                      }
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '__custom__') {
                          setCustomModelMode(true);
                          return;
                        }
                        setCustomModelMode(false);
                        persistSettings({ ...settings, model: value });
                      }}
                      className="input"
                      aria-label={t('ai.model')}
                    >
                      {PROVIDER_MODELS[settings.provider].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      <option value="__custom__">{t('ai.modelCustom')}</option>
                    </select>
                    {(customModelMode ||
                      !PROVIDER_MODELS[settings.provider].includes(settings.model)) && (
                      <input
                        value={settings.model}
                        onChange={(e) => persistSettings({ ...settings, model: e.target.value })}
                        className="input mt-2"
                        placeholder={t('ai.modelCustomPlaceholder')}
                        spellCheck={false}
                        aria-label={t('ai.modelCustom')}
                      />
                    )}
                  </Field>
                  <Field label={t('ai.agentInstructions')}>
                    <textarea
                      value={settings.agentInstructions}
                      onChange={(e) =>
                        persistSettings({ ...settings, agentInstructions: e.target.value })
                      }
                      className="input min-h-24 resize-y"
                      placeholder={t('ai.agentInstructionsPlaceholder')}
                      spellCheck
                    />
                    <p className="mt-1 text-[11px] text-ink-subtle">{t('ai.agentInstructionsHint')}</p>
                  </Field>
                  <UsageDashboard
                    settings={settings}
                    onReset={() => {
                      resetAiUsage();
                      toast(t('ai.usageReset'), { tone: 'info', ttl: 2000 });
                      // Force a re-render so bars clear immediately.
                      setSettings({ ...loadAiSettings() });
                    }}
                  />
                  {(settings.provider === 'openai' || settings.provider === 'gemini') && (
                    <p className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-warn">
                      {import.meta.env.DEV ? t('ai.corsDevHint') : t('ai.corsWarning')}
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label={t('ai.callsPerMinute')}>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={settings.minuteLimit}
                        onChange={(e) =>
                          persistSettings({
                            ...settings,
                            minuteLimit: clampInt(e.target.value, 1, 500, settings.minuteLimit),
                          })
                        }
                        className="input"
                      />
                    </Field>
                    <Field label={t('ai.callsPerDay')}>
                      <input
                        type="number"
                        min={1}
                        max={5000}
                        value={settings.dailyLimit}
                        onChange={(e) =>
                          persistSettings({
                            ...settings,
                            dailyLimit: clampInt(e.target.value, 1, 5000, settings.dailyLimit),
                          })
                        }
                        className="input"
                      />
                    </Field>
                  </div>
                  <p className="text-[11px] text-ink-subtle">{t('ai.localLimitsHint')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!hasKey || busy === 'test'}
                      onClick={() =>
                        void runCloud('test', async (live) => {
                          const result = await testAiConnection(live);
                          toast(t('ai.connectionOk', { result: result || 'OK' }), {
                            tone: 'success',
                            ttl: 3000,
                          });
                        })
                      }
                    >
                      {busy === 'test' ? t('ai.testing') : t('ai.testConnection')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        window.open(KEY_LINKS[settings.provider], '_blank', 'noopener,noreferrer')
                      }
                    >
                      {t('ai.getApiKey')}
                    </button>
                  </div>

                  <div className="mt-2 rounded-md border border-red-200 bg-red-50/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-danger">
                      <AlertTriangle size={13} /> {t('ai.dangerZone')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-ghost text-danger"
                        onClick={() => {
                          if (!window.confirm(t('ai.removeKeyConfirm'))) return;
                          clearAiSettings();
                          setSettings(loadAiSettings());
                          toast(t('ai.keyRemoved'), { tone: 'info' });
                        }}
                      >
                        {t('ai.removeKey')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-danger"
                        onClick={() => {
                          if (
                            !window.confirm(
                              t('ai.wipeDataConfirm'),
                            )
                          )
                            return;
                          void wipeAllLocalData().finally(() => {
                            window.location.reload();
                          });
                        }}
                      >
                        {t('ai.wipeData')}
                      </button>
                    </div>
                  </div>
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function AgentPlanPreview({
  plan,
  onApply,
  onDismiss,
}: {
  plan: AgentPlan;
  onApply: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 min-w-0 space-y-3 rounded-md border border-paper-edge bg-paper-tint p-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {t('ai.agentPlan')}
        </div>
        <p className="mt-1 break-words text-sm text-ink">{plan.summary}</p>
      </div>
      <ul className="max-h-40 space-y-1 overflow-auto text-xs text-ink-muted">
        {plan.ops.map((op, index) => (
          <li key={`${op.op}-${index}`} className="break-all rounded bg-paper px-2 py-1 font-mono">
            {op.op === 'replace_bullet' && `replace_bullet → ${op.content.slice(0, 72)}`}
            {op.op === 'delete_bullet' && `delete_bullet → ${op.bulletId.slice(0, 8)}…`}
            {op.op === 'set_entry_bullets' &&
              `set_entry_bullets → ${op.bullets.length} bullet${op.bullets.length === 1 ? '' : 's'}`}
            {op.op === 'reorder_sections' && `reorder_sections → ${op.sectionIds.length} sections`}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary text-xs" onClick={onApply}>
          {t('ai.agentApply')}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={onDismiss}>
          {t('ai.agentDismiss')}
        </button>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex min-w-0 items-center gap-2 text-ink">
        <span className="flex-shrink-0">{icon}</span>
        <h3 className="min-w-0 truncate font-semibold">{title}</h3>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
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

function ResultCard({ good, children }: { good: boolean; children: ReactNode }) {
  return (
    <div
      className={`mt-3 min-w-0 break-words rounded-md border px-3 py-2 ${
        good ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
      }`}
    >
      {children}
    </div>
  );
}

function UsageDashboard({
  settings,
  onReset,
}: {
  settings: AiSettings;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  // Re-read every render so the dashboard stays current when the user makes
  // calls without leaving the panel. Cheap localStorage read.
  const usage = loadCurrentUsage();
  const dailyPct = Math.min(100, (usage.dailyCalls / Math.max(1, settings.dailyLimit)) * 100);
  const minutePct = Math.min(100, (usage.minuteCalls / Math.max(1, settings.minuteLimit)) * 100);
  return (
    <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('ai.usageDashboard')}
        </div>
        <button type="button" className="btn-ghost text-[11px]" onClick={onReset}>
          {t('ai.resetUsage')}
        </button>
      </div>
      <div className="space-y-2">
        <UsageBar
          label={t('ai.usageDay')}
          value={usage.dailyCalls}
          max={settings.dailyLimit}
          percent={dailyPct}
        />
        <UsageBar
          label={t('ai.usageMinute')}
          value={usage.minuteCalls}
          max={settings.minuteLimit}
          percent={minutePct}
        />
      </div>
    </div>
  );
}

function UsageBar({
  label,
  value,
  max,
  percent,
}: {
  label: string;
  value: number;
  max: number;
  percent: number;
}) {
  const tone = percent >= 90 ? 'bg-danger' : percent >= 70 ? 'bg-warn' : 'bg-ok';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-muted">{label}</span>
        <span className="tabular-nums text-ink">
          {value} / {max}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-edge">
        <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
