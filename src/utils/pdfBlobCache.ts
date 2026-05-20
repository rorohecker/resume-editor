import type { Resume } from '@/types';

// In-memory cache of the most recently rendered PDF blob, keyed by the
// resume id + updatedAt. Lets the Export modal's preview iframe and the
// in-editor PDF Preview share a single render rather than each rendering
// the same document independently.

let lastKey: string | null = null;
let lastBlob: Blob | null = null;
let lastUrl: string | null = null;

function key(resume: Resume): string {
  return `${resume.id}:${resume.updatedAt}:${resume.styles.font}`;
}

export function tryGetCachedPdf(resume: Resume): { blob: Blob; url: string } | null {
  if (lastKey !== key(resume) || !lastBlob || !lastUrl) return null;
  return { blob: lastBlob, url: lastUrl };
}

export function rememberPdfBlob(resume: Resume, blob: Blob): { blob: Blob; url: string } {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastKey = key(resume);
  lastBlob = blob;
  lastUrl = URL.createObjectURL(blob);
  return { blob, url: lastUrl };
}

export function invalidatePdfCache(): void {
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  lastKey = null;
  lastBlob = null;
  lastUrl = null;
}
