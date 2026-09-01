import type { SalaryPeriod, SalaryRange } from '@/types';

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase();
  if (!CURRENCY_FORMATTERS.has(key)) {
    CURRENCY_FORMATTERS.set(
      key,
      new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: key,
        maximumFractionDigits: 0,
      }),
    );
  }
  return CURRENCY_FORMATTERS.get(key)!;
}

function formatAmount(value: number, currency: string): string {
  if (value >= 1000) {
    const compact = value / 1000;
    const rounded = compact % 1 === 0 ? compact.toFixed(0) : compact.toFixed(1);
    return `${rounded}k`;
  }
  return getFormatter(currency).format(value);
}

export function formatSalaryRange(salary?: SalaryRange): string {
  if (!salary) return '';
  const currency = salary.currency ?? 'USD';
  const { min, max } = salary;
  if (min != null && max != null) {
    return `${formatAmount(min, currency)}–${formatAmount(max, currency)}`;
  }
  if (min != null) return `${formatAmount(min, currency)}+`;
  if (max != null) return `up to ${formatAmount(max, currency)}`;
  return '';
}

export const SALARY_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'CHF', 'SGD'] as const;

export const SALARY_PERIODS: SalaryPeriod[] = ['hourly', 'monthly', 'annual'];
