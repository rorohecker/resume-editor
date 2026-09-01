import type { SalaryPeriod, SalaryRange, SalaryType } from '@/types';
import { SALARY_CURRENCIES, SALARY_PERIODS } from '@/utils/salaryFormat';
import { useTranslation } from 'react-i18next';

interface Props {
  value?: SalaryRange;
  onChange: (next: SalaryRange | undefined) => void;
  compact?: boolean;
}

function parseAmount(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : undefined;
}

export function SalaryInput({ value, onChange, compact }: Props) {
  const { t } = useTranslation();
  const salary = value ?? { currency: 'USD', period: 'annual' as SalaryPeriod, type: 'posted_range' as SalaryType };

  const patch = (patch: Partial<SalaryRange>) => {
    const merged = { ...salary, ...patch };
    if (merged.min == null && merged.max == null) {
      onChange(undefined);
      return;
    }
    onChange(merged);
  };

  if (compact) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={salary.min ?? ''}
          onChange={(e) => patch({ min: parseAmount(e.target.value) })}
          placeholder={t('companies.salaryMin')}
          className="input"
          aria-label={t('companies.salaryMin')}
        />
        <input
          type="text"
          inputMode="numeric"
          value={salary.max ?? ''}
          onChange={(e) => patch({ max: parseAmount(e.target.value) })}
          placeholder={t('companies.salaryMax')}
          className="input"
          aria-label={t('companies.salaryMax')}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <label className="block text-xs">
        <span className="mb-1 block text-ink-muted">{t('companies.salaryMin')}</span>
        <input
          type="text"
          inputMode="numeric"
          value={salary.min ?? ''}
          onChange={(e) => patch({ min: parseAmount(e.target.value) })}
          placeholder="120000"
          className="input"
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block text-ink-muted">{t('companies.salaryMax')}</span>
        <input
          type="text"
          inputMode="numeric"
          value={salary.max ?? ''}
          onChange={(e) => patch({ max: parseAmount(e.target.value) })}
          placeholder="150000"
          className="input"
        />
      </label>
      <label className="block text-xs">
        <span className="mb-1 block text-ink-muted">{t('companies.salaryCurrency')}</span>
        <select
          value={salary.currency ?? 'USD'}
          onChange={(e) => patch({ currency: e.target.value })}
          className="input"
        >
          {SALARY_CURRENCIES.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        <span className="mb-1 block text-ink-muted">{t('companies.salaryPeriod')}</span>
        <select
          value={salary.period ?? 'annual'}
          onChange={(e) => patch({ period: e.target.value as SalaryPeriod })}
          className="input"
        >
          {SALARY_PERIODS.map((period) => (
            <option key={period} value={period}>{t(`companies.period_${period}`)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
