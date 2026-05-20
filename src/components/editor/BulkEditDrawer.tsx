import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { Drawer } from '@/components/shared/Modal';
import { collectBullets, replaceBulletContent } from '@/utils/resumeText';
import { detectWeakLanguage } from '@/utils/aiAssist';
import { generateAiText, loadAiSettings, promptForRewrite } from '@/utils/aiByok';
import { toast } from '@/hooks/useToast';

export function BulkEditDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const resume = useStore((s) => s.currentResume);
  const updateResume = useStore((s) => s.updateCurrentResume);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'weak'>('all');
  const [busy, setBusy] = useState(false);

  const bullets = useMemo(() => (resume ? collectBullets(resume) : []), [resume, open]);
  const weakIds = useMemo(() => {
    if (!resume) return new Set<string>();
    const hits = detectWeakLanguage(resume);
    const idSet = new Set<string>();
    for (const hit of hits) {
      // detectWeakLanguage doesn't expose bulletId — match by label + content
      const matchingBullet = bullets.find(
        (b) => `${b.sectionTitle} - ${b.entryTitle}` === hit.bulletLabel && b.content === hit.content,
      );
      if (matchingBullet) idSet.add(matchingBullet.bulletId);
    }
    return idSet;
  }, [bullets, resume]);

  const visibleBullets = filter === 'weak' ? bullets.filter((b) => weakIds.has(b.bulletId)) : bullets;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () => setSelected(new Set(visibleBullets.map((b) => b.bulletId)));
  const clear = () => setSelected(new Set());

  const fixWeakVerbsLocal = () => {
    if (!resume) return;
    const replacements: Record<string, string> = {
      helped: 'Supported',
      'worked on': 'Developed',
      assisted: 'Coordinated',
      'was responsible for': 'Owned',
      'participated in': 'Contributed to',
      'involved in': 'Contributed to',
    };
    updateResume((current) => {
      let next = current;
      for (const id of selected) {
        const bullet = bullets.find((b) => b.bulletId === id);
        if (!bullet) continue;
        let updated = bullet.content;
        for (const [weak, strong] of Object.entries(replacements)) {
          updated = updated.replace(new RegExp(`\\b${weak}\\b`, 'gi'), strong);
        }
        next = replaceBulletContent(next, id, updated);
      }
      return next;
    });
    toast(t('bulk.updatedLocal', { count: selected.size }), { tone: 'success' });
    clear();
  };

  const rewriteAllAi = async () => {
    if (!resume) return;
    const settings = loadAiSettings();
    if (!settings.apiKey.trim()) {
      toast(t('bulk.noKey'), { tone: 'warn' });
      return;
    }
    setBusy(true);
    try {
      for (const id of selected) {
        const bullet = bullets.find((b) => b.bulletId === id);
        if (!bullet) continue;
        const text = await generateAiText(
          settings,
          promptForRewrite(resume, bullet.content, 'make it stronger and add a metric if natural'),
          280,
        );
        const firstOption = text
          .split('\n')
          .map((line) => line.replace(/^[-\d.)\s]+/, '').trim())
          .find((line) => line.length > 5);
        if (firstOption) {
          updateResume((current) => replaceBulletContent(current, id, firstOption));
        }
      }
      toast(t('bulk.rewrittenAi', { count: selected.size }), { tone: 'success' });
      clear();
    } catch (err) {
      toast(err instanceof Error ? err.message : t('bulk.rewriteFailed'), { tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t('bulk.title')}
      icon={<ListChecks size={16} />}
      maxWidth="lg"
    >
      <div className="space-y-3 p-4 text-sm">
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as 'all' | 'weak')}
            className="input h-8 w-auto text-xs"
          >
            <option value="all">{t('bulk.allFilter', { count: bullets.length })}</option>
            <option value="weak">{t('bulk.weakFilter', { count: weakIds.size })}</option>
          </select>
          <button type="button" className="btn-ghost text-xs" onClick={selectAll}>
            {t('bulk.selectAll')}
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={clear} disabled={selected.size === 0}>
            {t('bulk.clearSelection')}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={selected.size === 0}
            onClick={fixWeakVerbsLocal}
          >
            {t('bulk.replaceWeakLocal')}
          </button>
          <button
            type="button"
            className="btn-primary text-xs"
            disabled={selected.size === 0 || busy}
            onClick={() => void rewriteAllAi()}
          >
            {busy ? t('bulk.rewriting') : t('bulk.rewriteBYOK', { count: selected.size })}
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {visibleBullets.length === 0 && (
            <p className="text-xs text-ink-subtle">{t('bulk.nothingToShow')}</p>
          )}
          {visibleBullets.map((bullet) => {
            const checked = selected.has(bullet.bulletId);
            return (
              <label
                key={bullet.bulletId}
                className={`flex cursor-pointer gap-2 rounded-md border p-2 text-xs ${
                  checked ? 'border-accent bg-accent/5' : 'border-paper-edge'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(bullet.bulletId)}
                  className="mt-0.5 accent-ink"
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                    {bullet.sectionTitle} · {bullet.entryTitle}
                    {weakIds.has(bullet.bulletId) && (
                      <span className="ml-2 rounded-full bg-yellow-100 px-1.5 py-0.5 text-warn">
                        {t('bulk.weakBadge')}
                      </span>
                    )}
                  </div>
                  <div className="text-ink">{bullet.content}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </Drawer>
  );
}
