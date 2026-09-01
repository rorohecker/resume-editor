import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { importAllData, isFullAppBackup } from '@/store/persistence';
import { toast } from '@/hooks/useToast';
import { tooltipProps } from '@/components/shared/tooltipProps';

type RestoreBackupButtonProps = {
  variant?: 'icon' | 'secondary';
  onRestored?: (result: { resumes: number; snapshots: number; companies: number }) => void;
  className?: string;
};

/** Pick a full-app JSON backup and merge it into local storage. */
export function RestoreBackupButton({
  variant = 'icon',
  onRestored,
  className = '',
}: RestoreBackupButtonProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  const restoreBackup = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isFullAppBackup(parsed)) {
        toast(t('landing.restoreInvalid'), { tone: 'warn' });
        return;
      }
      const result = await importAllData(parsed);
      onRestored?.(result);
      toast(
        result.companies > 0
          ? t('landing.restoreDoneFull', { resumes: result.resumes, companies: result.companies })
          : t('landing.restoreDone', { count: result.resumes }),
        { tone: 'success' },
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : t('landing.restoreFailed'), { tone: 'danger' });
    }
  };

  const label = t('landing.restoreBackup');

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          className={`icon-btn ${className}`.trim()}
          aria-label={label}
          {...tooltipProps(label)}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={16} />
        </button>
      ) : (
        <button
          type="button"
          className={`btn-secondary ${className}`.trim()}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={15} />
          {label}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void restoreBackup(file);
        }}
      />
    </>
  );
}
