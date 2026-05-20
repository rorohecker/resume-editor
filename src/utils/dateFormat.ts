import type { DateFormat } from '@/types';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTH_LOOKUP = new Map<string, number>(
  MONTHS.flatMap((month, index) => [
    [month.toLowerCase(), index],
    [month.slice(0, 3).toLowerCase(), index],
  ]),
);

export function formatDateRange(
  startDate: string | undefined,
  endDate: string | undefined,
  current: boolean | undefined,
  format: DateFormat,
): string {
  const start = formatSingleDate(startDate, format);
  const end = current ? 'Present' : formatSingleDate(endDate, format);

  if (start && end) return `${start} - ${end}`;
  return start || end;
}

function formatSingleDate(value: string | undefined, format: DateFormat): string {
  const raw = value?.trim();
  if (!raw) return '';
  if (/^present$/i.test(raw)) return 'Present';

  const parsed = parseDateish(raw);
  if (!parsed) return raw;

  const { month, year } = parsed;

  if (format === 'year-only') return String(year);
  if (format === 'numeric' && month !== null) {
    return `${String(month + 1).padStart(2, '0')}/${year}`;
  }
  if (format === 'season-year' && month !== null) {
    return `${seasonForMonth(month)} ${year}`;
  }
  if (month !== null) return `${MONTHS[month].slice(0, 3)} ${year}`;
  return String(year);
}

function parseDateish(value: string): { month: number | null; year: number } | null {
  const yearMatch = value.match(/\b(19|20)\d{2}\b/);
  if (!yearMatch) return null;

  const year = Number(yearMatch[0]);
  const monthWord = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
  );

  if (monthWord) {
    const key = monthWord[1].slice(0, 3).toLowerCase();
    return { month: MONTH_LOOKUP.get(key) ?? null, year };
  }

  const numeric = value.match(/\b(0?[1-9]|1[0-2])[/.-](19|20)\d{2}\b/);
  if (numeric) return { month: Number(numeric[1]) - 1, year };

  const season = value.match(/\b(spring|summer|fall|autumn|winter)\b/i);
  if (season) return { month: monthForSeason(season[1]), year };

  return { month: null, year };
}

function seasonForMonth(month: number): string {
  if (month <= 1 || month === 11) return 'Winter';
  if (month <= 4) return 'Spring';
  if (month <= 7) return 'Summer';
  return 'Fall';
}

function monthForSeason(season: string): number {
  switch (season.toLowerCase()) {
    case 'spring':
      return 2;
    case 'summer':
      return 5;
    case 'fall':
    case 'autumn':
      return 8;
    case 'winter':
      return 11;
    default:
      return 0;
  }
}
