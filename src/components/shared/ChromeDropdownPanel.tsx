import { type CSSProperties, type ReactNode, type RefObject, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'down' | 'up' | 'auto';

/**
 * Renders a dropdown in a portal so parent overflow/stacking contexts
 * cannot clip or bury chrome menus (theme, locale, accent pickers).
 * Positions against the viewport and flips when there isn't enough room.
 */
export function ChromeDropdownPanel({
  anchorRef,
  open,
  placement = 'auto',
  width = 288,
  className = '',
  children,
  role = 'menu',
  'aria-label': ariaLabel,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  placement?: Placement;
  width?: number;
  className?: string;
  children: ReactNode;
  role?: string;
  'aria-label'?: string;
}) {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const viewportPad = 8;
      const estimatedHeight = Math.min(420, window.innerHeight - viewportPad * 2);
      const spaceBelow = window.innerHeight - rect.bottom - gap - viewportPad;
      const spaceAbove = rect.top - gap - viewportPad;

      let place: 'down' | 'up' = placement === 'up' ? 'up' : 'down';
      if (placement === 'auto') {
        place = spaceBelow >= Math.min(estimatedHeight, 240) || spaceBelow >= spaceAbove ? 'down' : 'up';
      } else if (placement === 'down' && spaceBelow < 160 && spaceAbove > spaceBelow) {
        place = 'up';
      } else if (placement === 'up' && spaceAbove < 160 && spaceBelow > spaceAbove) {
        place = 'down';
      }

      // Prefer aligning to the anchor's right edge so the menu doesn't cover
      // sibling controls (theme toggle) that sit immediately to the right.
      const left = Math.min(
        Math.max(viewportPad, rect.right - width),
        window.innerWidth - width - viewportPad,
      );

      const next: CSSProperties = {
        position: 'fixed',
        left,
        width,
        zIndex: 400,
        visibility: 'visible',
        maxHeight: place === 'down' ? Math.max(160, spaceBelow) : Math.max(160, spaceAbove),
        overflowY: 'auto',
      };
      if (place === 'up') {
        next.bottom = window.innerHeight - rect.top + gap;
      } else {
        next.top = rect.bottom + gap;
      }
      setStyle(next);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef, open, placement, width]);

  if (!open) return null;

  return createPortal(
    <div role={role} aria-label={ariaLabel} className={className} style={style}>
      {children}
    </div>,
    document.body,
  );
}
