/// <reference lib="webworker" />

// Web Worker for PDF generation. Runs @react-pdf/renderer off the main thread
// so the UI stays responsive during the CPU-heavy layout + render pass.
//
// Protocol:
//   in:  { type: 'render', id: string, resume: Resume }
//   out: { type: 'done', id: string, buffer: ArrayBuffer }
//        | { type: 'error', id: string, message: string }
//
// @react-pdf uses canvas via fontkit for image rasterization; workers have
// fetch + OffscreenCanvas in all evergreen browsers (Chrome 69+, Firefox 105+,
// Safari 16.4+), so the heavy path works here. We catch any DOM-assumption
// failures and surface them as 'error' so the main thread can fall back.

import { createPdfDocumentFor } from '@/utils/pdfDocument';
import { ensureFontRegistered } from '@/utils/pdfFonts';
import type { Resume } from '@/types';

interface RenderMessage {
  type: 'render';
  id: string;
  resume: Resume;
}

self.onmessage = async (event: MessageEvent<RenderMessage>) => {
  if (event.data?.type !== 'render') return;
  const { id, resume } = event.data;

  try {
    const pdfModule = await import('@react-pdf/renderer');
    await ensureFontRegistered(resume.styles.font, pdfModule);
    const document = createPdfDocumentFor(resume, pdfModule);
    const blob = await pdfModule.pdf(document).toBlob();
    const buffer = await blob.arrayBuffer();
    // Transfer the underlying buffer to avoid a copy.
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'done', id, buffer }, [buffer]);
  } catch (error) {
    (self as DedicatedWorkerGlobalScope).postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : 'Worker PDF render failed',
    });
  }
};

export {};
