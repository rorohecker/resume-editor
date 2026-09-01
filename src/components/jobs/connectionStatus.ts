import type { ConnectionStatus } from '@/types';

export const CONNECTION_ORDER: ConnectionStatus[] = [
  'none',
  'cold',
  'warm',
  'referral',
  'recruiter',
  'employee',
];

export const CONNECTION_META: Record<
  ConnectionStatus,
  { chip: string; pillBg: string; pillText: string }
> = {
  none: {
    chip: 'bg-paper-tint text-ink-subtle border-paper-edge',
    pillBg: 'bg-paper-edge',
    pillText: 'text-ink-subtle',
  },
  cold: {
    chip: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
    pillBg: 'bg-blue-100 dark:bg-blue-500/25',
    pillText: 'text-blue-700 dark:text-blue-300',
  },
  warm: {
    chip: 'bg-amber-50 text-warn border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
    pillBg: 'bg-amber-100 dark:bg-amber-500/25',
    pillText: 'text-warn dark:text-amber-300',
  },
  referral: {
    chip: 'bg-green-50 text-ok border-green-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
    pillBg: 'bg-green-100 dark:bg-emerald-500/25',
    pillText: 'text-ok dark:text-emerald-300',
  },
  recruiter: {
    chip: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30',
    pillBg: 'bg-purple-100 dark:bg-purple-500/25',
    pillText: 'text-purple-700 dark:text-purple-300',
  },
  employee: {
    chip: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-500/30',
    pillBg: 'bg-teal-100 dark:bg-teal-500/25',
    pillText: 'text-teal-700 dark:text-teal-300',
  },
};
