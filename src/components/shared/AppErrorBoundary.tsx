import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
  };

  reload = () => {
    window.location.reload();
  };

  clearAndReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Non-fatal — fall through to reload.
    }
    window.location.reload();
  };

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center bg-paper-tint p-6">
        <div className="max-w-md rounded-lg border border-paper-edge bg-paper p-6 shadow-page">
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-muted">
            The editor hit an unexpected error and could not continue rendering. Your data is
            safe in IndexedDB. Try a soft retry first.
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-paper-tint p-2 text-xs text-ink-subtle">
            {error.message}
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={this.reset}>
              Try again
            </button>
            <button type="button" className="btn-secondary" onClick={this.reload}>
              Reload page
            </button>
            <button type="button" className="btn-secondary" onClick={this.clearAndReload}>
              Reset cache and reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
