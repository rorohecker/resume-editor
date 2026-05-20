import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store';
import { estimatePageUsage } from '@/utils/styleChecks';
import { computeHealthScore } from '@/utils/healthScore';
import { Drawer } from '@/components/shared/Modal';

export function TipsPanel() {
  const { t } = useTranslation();
  const open = useStore((s) => s.tipsOpen);
  const setOpen = useStore((s) => s.setTipsOpen);
  const resume = useStore((s) => s.currentResume);
  const pageUsage = resume ? estimatePageUsage(resume) : 0;
  const health = resume ? computeHealthScore(resume) : null;

  return (
    <Drawer
      open={open}
      onClose={() => setOpen(false)}
      title={t('tips.title')}
      icon={<Lightbulb size={16} className="text-warn" />}
      maxWidth="md"
    >
      <div className="space-y-4 p-4 text-sm text-ink-muted">
        {health && (
          <TipCard title={t('tips.healthTitle', { n: health.total })}>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-paper-edge">
              <div
                className={`h-full ${
                  health.total >= 80 ? 'bg-ok' : health.total >= 60 ? 'bg-warn' : 'bg-danger'
                }`}
                style={{ width: `${health.total}%` }}
              />
            </div>
            <ul className="space-y-1 text-xs">
              {health.breakdown.map((category) => (
                <li key={category.label} className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{category.label}</span>
                    <span className="text-ink-subtle"> — {category.notes.join(' ')}</span>
                  </span>
                  <span className="flex-shrink-0 tabular-nums text-ink-muted">
                    {category.score}/{category.max}
                  </span>
                </li>
              ))}
            </ul>
          </TipCard>
        )}

        {resume && (
          <TipCard title={t('tips.pageUsageTitle')}>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span>{t('tips.pageUsageHint')}</span>
              <span
                className={
                  pageUsage > 100 ? 'text-danger' : pageUsage >= 90 ? 'text-warn' : 'text-ok'
                }
              >
                {pageUsage}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-paper-edge">
              <div
                className={`h-full ${
                  pageUsage > 100 ? 'bg-danger' : pageUsage >= 90 ? 'bg-warn' : 'bg-ok'
                }`}
                style={{ width: `${Math.min(120, pageUsage)}%` }}
              />
            </div>
          </TipCard>
        )}

        <TipCard title={t('tips.rememberTitle')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('tips.rememberOnePage')}</li>
            <li>{t('tips.rememberTense')}</li>
            <li>{t('tips.rememberVerb')}</li>
          </ul>
        </TipCard>

        <TipCard title={t('tips.xyzTitle')}>
          <div className="rounded-md border border-paper-edge bg-paper-tint p-3 text-xs font-semibold text-ink">
            <div>{t('tips.xyzFormulaX')}</div>
            <div>{t('tips.xyzFormulaY')}</div>
            <div>{t('tips.xyzFormulaZ')}</div>
          </div>
          <p className="mt-2">{t('tips.xyzExample')}</p>
        </TipCard>

        <TipCard title={t('tips.expTitle')}>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('tips.expBullet1')}</li>
            <li>{t('tips.expBullet2')}</li>
            <li>{t('tips.expBullet3')}</li>
          </ul>
        </TipCard>

        <TipCard title={t('tips.skillsTitle')}>
          <p>{t('tips.skillsHint')}</p>
        </TipCard>

        <TipCard title={t('tips.projectsTitle')}>
          <p>{t('tips.projectsHint')}</p>
        </TipCard>

        <TipCard title={t('tips.educationTitle')}>
          <p>{t('tips.educationHint')}</p>
        </TipCard>

        <TipCard title={t('tips.verbBankTitle')}>
          <p>{t('tips.verbBankHint')}</p>
        </TipCard>
      </div>
    </Drawer>
  );
}

function TipCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-paper-edge bg-paper px-3 py-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
