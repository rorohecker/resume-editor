import { requestUpdateCheck } from '@/utils/updateCheck';

/** Build-injected version from package.json (see vite.config.ts). */
export function AppVersion({ className = '' }: { className?: string }) {
  const label = `v${__APP_VERSION__}`;
  return (
    <button
      type="button"
      onClick={() => requestUpdateCheck()}
      className={`select-none whitespace-nowrap text-[11px] tabular-nums text-ink-subtle hover:text-ink ${className}`.trim()}
      title={`${label} — click to check for updates`}
      aria-label={`${label}, check for updates`}
    >
      {label}
    </button>
  );
}
