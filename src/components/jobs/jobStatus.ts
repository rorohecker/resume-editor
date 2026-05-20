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
    chip: 'bg-blue-50 text-blue-700 border-blue-200',
    pillBg: 'bg-blue-100',
    pillText: 'text-blue-700',
  },
  interview: {
    chip: 'bg-yellow-50 text-warn border-yellow-200',
    pillBg: 'bg-yellow-100',
    pillText: 'text-warn',
  },
  offer: {
    chip: 'bg-green-50 text-ok border-green-200',
    pillBg: 'bg-green-100',
    pillText: 'text-ok',
  },
  rejected: {
    chip: 'bg-red-50 text-danger border-red-200',
    pillBg: 'bg-red-100',
    pillText: 'text-danger',
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
