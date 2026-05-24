import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from '@/hooks/useToast';

export function PwaUpdateToast() {
  const shownRef = useRef(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    if (!needRefresh || shownRef.current) return;

    shownRef.current = true;
    toast('New version available', {
      tone: 'info',
      ttl: 0,
      action: {
        label: 'Reload',
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
