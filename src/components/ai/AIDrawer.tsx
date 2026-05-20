import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Languages, Search, Settings, Sparkles, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkGrammar, type GrammarHit } from '@/utils/grammar';
import { useStore } from '@/store';
import { makeId } from '@/utils/id';
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
  clearAiSettings,
  generateAiText,
  loadAiSettings,
  loadCurrentUsage,
  promptForAtsKeywords,
  promptForRewrite,
  promptForSummary,
  saveAiSettings,
  testAiConnection,
  type AiProvider,
  type AiSettings,
} from '@/utils/aiByok';
import { clearAppLocalData } from '@/utils/localData';
import { collectBullets, replaceBulletContent } from '@/utils/resumeText';
import { Drawer } from '@/components/shared/Modal';
import { toast } from '@/hooks/useToast';

type Tab = 'rewrite' | 'xyz' | 'weak' | 'grammar' | 'keywords' | 'summary' | 'verbs' | 'settings';

const TABS: { id: Tab; labelKey: string }[] = [
  { id: 'rewrite', labelKey: 'ai.tabRewrite' },
  { id: 'xyz', labelKey: 'ai.tabXyz' },
  { id: 'weak', labelKey: 'ai.tabWeak' },
  { id: 'grammar', labelKey: 'ai.tabGrammar' },
  { id: 'keywords', labelKey: 'ai.tabAts' },
  { id: 'summary', labelKey: 'ai.tabSummary' },
  { id: 'verbs', labelKey: 'ai.tabVerbs' },
  { id: 'settings', labelKey: 'ai.tabSettings' },
];

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
  const [jobDescription, setJobDescription] = useState('');
  const [copied, setCopied] = useState('');
  const [busy, setBusy] = useState('');
  const [aiError, setAiError] = useState('');
  const [cloudRewriteOptions, setCloudRewriteOptions] = useState<string[]>([]);
  const [cloudSummary, setCloudSummary] = useState('');
  const [cloudAts, setCloudAts] = useState('');
  const [verbQuery, setVerbQuery] = useState('');
  const [grammarHits, setGrammarHits] = useState<GrammarHit[]>([]);
  const [grammarRan, setGrammarRan] = useState(false);

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

  const runCloud = async (label: string, fn: () => Promise<void>) => {
    setAiError('');
    setBusy(label);
    try {
      await fn();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('ai.requestFailed'));
    } finally {
      setBusy('');
    }
  };

  const generateCloudRewrite = () =>
    runCloud('rewrite', async () => {
      if (!resume || !selectedBullet) return;
      const text = await generateAiText(
        settings,
        promptForRewrite(resume, selectedBullet.content, instruction),
      );
      setCloudRewriteOptions(
        text
          .split('\n')
          .map((line) => line.replace(/^[-\d.)\s]+/, '').trim())
          .filter(Boolean)
          .slice(0, 3),
      );
    });

  const summaryText = cloudSummary || (resume ? generateSummary(resume) : '');
  const addSummary = () => {
    if (!resume || !summaryText) return;
    updateResume((current) => {
      const existing = current.sections.find((s) => s.type === 'summary');
      if (existing) {
        return {
          ...current,
          sections: current.sections.map((s) =>
            s.id === existing.id
              ? { ...s, entries: [{ id: existing.entries[0]?.id ?? makeId(), title: summaryText }] }
              : s,
          ),
        };
      }
      return {
        ...current,
        sections: [
          {
            id: makeId(),
            type: 'summary',
            title: 'Summary',
            visible: true,
            order: 0,
            layout: 'text-block',
            entries: [{ id: makeId(), title: summaryText }],
          },
          ...current.sections.map((s) => ({ ...s, order: s.order + 1 })),
        ],
      };
    });
    toast(t('ai.summaryAdded'), { tone: 'success', ttl: 1800 });
  };

  const copyText = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
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
        <span className="rounded-full bg-paper-tint px-2 py-0.5 text-xs text-ink-muted">
          {hasKey ? PROVIDER_LABELS[settings.provider] : t('ai.localFallback')}
        </span>
      }
      maxWidth="xl"
    >
      <div className="border-b border-paper-edge px-3 py-2">
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-7">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium ${
                tab === item.id
                  ? 'bg-ink text-paper'
                  : 'text-ink-muted hover:bg-paper-tint hover:text-ink'
              }`}
              aria-pressed={tab === item.id}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          {t('ai.optionalNote')}
        </p>
      </div>

      <div className="p-4 text-sm text-ink-muted">
        {aiError && <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-danger">{aiError}</div>}
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
                    <div className="flex gap-2">
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
                          className="w-full rounded-md border border-paper-edge p-3 text-left text-ink hover:bg-paper-tint"
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
                              <li key={s}>{s}</li>
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
                            <span key={r} className="rounded-md border border-paper-edge bg-paper px-2 py-0.5 text-xs">
                              {r}
                            </span>
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
                    void runCloud('ats', async () => {
                      setCloudAts(
                        await generateAiText(
                          settings,
                          promptForAtsKeywords(resume, jobDescription),
                          900,
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
                          void runCloud('summary', async () =>
                            setCloudSummary(
                              await generateAiText(settings, promptForSummary(resume), 240),
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
                  <Field label={t('ai.provider')}>
                    <select
                      value={settings.provider}
                      onChange={(e) => {
                        const provider = e.target.value as AiProvider;
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
                    <div className="flex gap-2">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={settings.apiKey}
                        onChange={(e) => persistSettings({ ...settings, apiKey: e.target.value })}
                        className="input"
                        placeholder={t('ai.apiKeyPlaceholder')}
                        autoComplete="off"
                        spellCheck={false}
                        aria-label={t('ai.apiKey')}
                      />
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => setShowKey(!showKey)}
                        aria-label={showKey ? t('ai.hideKey') : t('ai.showKey')}
                      >
                        {showKey ? t('ai.hideLabel') : t('ai.showLabel')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() =>
                          void navigator.clipboard
                            .readText()
                            .then((apiKey) => persistSettings({ ...settings, apiKey }))
                        }
                      >
                        {t('ai.paste')}
                      </button>
                    </div>
                  </Field>
                  <Field label={t('ai.model')}>
                    <input
                      list="ai-model-options"
                      value={settings.model}
                      onChange={(e) => persistSettings({ ...settings, model: e.target.value })}
                      className="input"
                      aria-label={t('ai.model')}
                    />
                    <datalist id="ai-model-options">
                      {PROVIDER_MODELS[settings.provider].map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </Field>
                  <UsageDashboard settings={settings} />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('ai.callsPerMinute')}>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={settings.minuteLimit}
                        onChange={(e) =>
                          persistSettings({ ...settings, minuteLimit: Number(e.target.value) })
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
                          persistSettings({ ...settings, dailyLimit: Number(e.target.value) })
                        }
                        className="input"
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={!hasKey || busy === 'test'}
                      onClick={() =>
                        void runCloud('test', async () => {
                          const result = await testAiConnection(settings);
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
                          clearAppLocalData();
                          window.location.href = '/';
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

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 text-ink">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      {children}
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
      className={`mt-3 rounded-md border px-3 py-2 ${
        good ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'
      }`}
    >
      {children}
    </div>
  );
}

function UsageDashboard({ settings }: { settings: AiSettings }) {
  const { t } = useTranslation();
  // Re-read every render so the dashboard stays current when the user makes
  // calls without leaving the panel. Cheap localStorage read.
  const usage = loadCurrentUsage();
  const dailyPct = Math.min(100, (usage.dailyCalls / Math.max(1, settings.dailyLimit)) * 100);
  const minutePct = Math.min(100, (usage.minuteCalls / Math.max(1, settings.minuteLimit)) * 100);
  return (
    <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
        {t('ai.usageDashboard')}
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
