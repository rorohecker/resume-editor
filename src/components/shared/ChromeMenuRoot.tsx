import { type ReactNode, useEffect, useId, useState } from 'react';

/** Fired when a chrome dropdown opens so siblings can close. */
const CHROME_MENU_OPEN = 'resume-editor:chrome-menu-open';

/**
 * Wraps Landing / editor chrome menus so only one dropdown is open at a time
 * and stacking stays above neighbors.
 */
export function ChromeMenuRoot({
  children,
  className = '',
}: {
  children: (api: { open: boolean; setOpen: (next: boolean) => void; menuId: string }) => ReactNode;
  className?: string;
}) {
  const menuId = useId();
  const [open, setOpenState] = useState(false);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CHROME_MENU_OPEN, { detail: { menuId } }));
    }
  };

  useEffect(() => {
    const onPeerOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ menuId?: string }>).detail;
      if (detail?.menuId && detail.menuId !== menuId) setOpenState(false);
    };
    window.addEventListener(CHROME_MENU_OPEN, onPeerOpen);
    return () => window.removeEventListener(CHROME_MENU_OPEN, onPeerOpen);
  }, [menuId]);

  return <div className={`relative z-20 ${className}`.trim()}>{children({ open, setOpen, menuId })}</div>;
}
