/** Instant hover/focus tooltip attrs (paired with `[data-tooltip]` CSS in index.css). */
export function tooltipProps(
  label: string,
  align: 'center' | 'start' | 'end' = 'center',
): { 'data-tooltip': string; 'data-tooltip-align'?: 'start' | 'end' } {
  if (align === 'center') return { 'data-tooltip': label };
  return { 'data-tooltip': label, 'data-tooltip-align': align };
}
