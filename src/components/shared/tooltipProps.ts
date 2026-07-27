/** Instant hover/focus tooltip attrs (paired with `[data-tooltip]` CSS in index.css). */
export function tooltipProps(
  label: string,
  align: 'center' | 'start' | 'end' = 'center',
  side: 'bottom' | 'top' = 'bottom',
): {
  'data-tooltip': string;
  'data-tooltip-align'?: 'start' | 'end';
  'data-tooltip-side'?: 'top';
} {
  return {
    'data-tooltip': label,
    ...(align !== 'center' ? { 'data-tooltip-align': align } : {}),
    ...(side === 'top' ? { 'data-tooltip-side': 'top' as const } : {}),
  };
}
