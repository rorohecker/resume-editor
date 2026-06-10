import type { ApplicationStatus } from '@/types';

export const STATUS_META: Record<
  ApplicationStatus,
  { chip: string; pillBg: string; pillText: string }
> = {
  drafting: {
    chip: 'bg-paper-tint text-ink-muted border-paper-edge',
    pillBg: 'bg-paper-edge',
    pillText: 'text-ink-muted',
  },
  applied: {
    chip: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    pillBg: 'bg-blue-100 dark:bg-blue-500/25',
    pillText: 'text-blue-700 dark:text-blue-300',
  },
  interview: {
    chip: 'bg-yellow-50 text-warn border-yellow-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    pillBg: 'bg-yellow-100 dark:bg-amber-500/25',
    pillText: 'text-warn dark:text-amber-300',
  },
  offer: {
    chip: 'bg-green-50 text-ok border-green-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    pillBg: 'bg-green-100 dark:bg-emerald-500/25',
    pillText: 'text-ok dark:text-emerald-300',
  },
  rejected: {
    chip: 'bg-red-50 text-danger border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/30',
    pillBg: 'bg-red-100 dark:bg-red-500/25',
    pillText: 'text-danger dark:text-red-300',
  },
  archived: {
    chip: 'bg-paper-tint text-ink-subtle border-paper-edge',
    pillBg: 'bg-paper-edge',
    pillText: 'text-ink-subtle',
  },
};

export const STATUS_ORDER: ApplicationStatus[] = [
  'drafting',
  'applied',
  'interview',
  'offer',
  'rejected',
  'archived',
];
