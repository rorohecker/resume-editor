import type { Resume } from '@/types';

// Vite import-meta-URL worker spawn. Vite bundles the worker as a separate
// chunk and resolves the URL at build time. `{ type: 'module' }` keeps the
// worker as an ES module so its dynamic imports work.

let worker: Worker | null = null;
let workerBroken = false;

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('@/workers/pdfWorker.ts', import.meta.url), {
      type: 'module',
      name: 'pdf-worker',
    });
    worker.onerror = (event) => {
      // Worker failed to start. Disable for the rest of the session.
      console.warn('PDF worker errored; falling back to main thread.', event.message);
      workerBroken = true;
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch (err) {
    console.warn('Could not create PDF worker; falling back to main thread.', err);
    workerBroken = true;
    return null;
  }
}

export function isWorkerAvailable(): boolean {
  return !workerBroken && typeof Worker !== 'undefined';
}

export function renderPdfInWorker(resume: Resume, timeoutMs = 30_000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    if (!w) {
      reject(new Error('Worker unavailable'));
      return;
    }
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer = window.setTimeout(() => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      workerBroken = true;
      w.terminate();
      worker = null;
      reject(new Error('PDF worker timed out'));
    }, timeoutMs);

    const onError = (event: ErrorEvent) => {
      window.clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      workerBroken = true;
      w.terminate();
      worker = null;
      reject(new Error(event.message || 'PDF worker failed to start'));
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: 'done'; id: string; buffer: ArrayBuffer }
        | { type: 'error'; id: string; message: string };
      if (!data || data.id !== id) return;
      window.clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (data.type === 'done') {
        resolve(new Blob([data.buffer], { type: 'application/pdf' }));
      } else {
        // Mark broken so the next call goes straight to the fallback path.
        workerBroken = true;
        w.terminate();
        worker = null;
        reject(new Error(data.message));
      }
    };

    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ type: 'render', id, resume });
  });
}
