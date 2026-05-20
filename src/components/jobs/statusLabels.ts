import { useTranslation } from 'react-i18next';
import type { ApplicationStatus } from '@/types';

// Translated status labels. `STATUS_META` keeps the color/chip classes; this
// module owns the human-readable strings so they flow through i18n.
export function useStatusLabel() {
  const { t } = useTranslation();
  return (status: ApplicationStatus): string => {
    switch (status) {
      case 'drafting':
        return t('jobs.statusDrafting');
      case 'applied':
        return t('jobs.statusApplied');
      case 'interview':
        return t('jobs.statusInterview');
      case 'offer':
        return t('jobs.statusOffer');
      case 'rejected':
        return t('jobs.statusRejected');
      case 'archived':
        return t('jobs.statusArchived');
    }
  };
}
