/** Build-injected version from package.json (see vite.config.ts). */
export function AppVersion({ className = '' }: { className?: string }) {
  const label = `v${__APP_VERSION__}`;
  return (
    <span
      className={`select-none whitespace-nowrap text-[11px] tabular-nums text-ink-subtle ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      {label}
    </span>
  );
}
