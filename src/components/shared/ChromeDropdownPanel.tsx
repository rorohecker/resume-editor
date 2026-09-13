import { type CSSProperties, type ReactNode, type RefObject, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type Placement = 'down' | 'up';

/**
 * Renders a dropdown in a portal so parent overflow/stacking contexts
 * cannot clip or bury chrome menus (theme, locale, accent pickers).
 */
export function ChromeDropdownPanel({
  anchorRef,
  open,
  placement = 'down',
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
      const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
      const next: CSSProperties = {
        position: 'fixed',
        left,
        width,
        zIndex: 300,
        visibility: 'visible',
      };
      if (placement === 'up') {
        next.bottom = window.innerHeight - rect.top + 8;
      } else {
        next.top = rect.bottom + 8;
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
