import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConnectionStatus } from '@/types';

export function useConnectionLabel() {
  const { t } = useTranslation();
  return useCallback(
    (status: ConnectionStatus) => t(`companies.connection_${status}`),
    [t],
  );
}
