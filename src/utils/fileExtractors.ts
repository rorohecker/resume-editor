// Lazy-loaded file extractors. Heavy libraries (pdfjs, mammoth, tesseract)
// are only fetched when the user actually picks that file type.

export interface ExtractionResult {
  text: string;
  // Hints surfaced from the source format:
  hints?: {
    isLikelyLinkedIn?: boolean;
    twoColumnDetected?: boolean;
    ocrConfidence?: number;
  };
  warnings?: string[];
}

export async function extractFromFile(file: File): Promise<ExtractionResult> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  const mime = file.type;

  if (ext === 'json' || mime === 'application/json') {
    return { text: await file.text() };
  }
  if (ext === 'txt' || mime.startsWith('text/')) {
    return { text: await file.text() };
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPdf(file);
  }
  if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
    return extractDocx(file);
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext) || mime.startsWith('image/')) {
    return extractImage(file);
  }
  // Fallback: best-effort text read
  return {
    text: await file.text(),
    warnings: [`Unknown file type "${ext || mime}". Attempted plain-text read.`],
  };
}

// Bundle the pdfjs worker as a Vite asset so it ships with the app and works
// from any origin (hosted, single-file html, file://). The CDN fallback we
// used to rely on breaks under CSP and offline. The ?url import gives us a
// hashed URL that Vite serves correctly in both build modes.
let pdfWorkerConfigured = false;
async function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')): Promise<void> {
  if (pdfWorkerConfigured) return;
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Last-ditch CDN fallback if the bundler couldn't resolve the worker URL.
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  pdfWorkerConfigured = true;
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const pdfjs = await import('pdfjs-dist');
  await configurePdfWorker(pdfjs);

  const buffer = await file.arrayBuffer();
  // The worker can fail to spin up under file:// or strict CSP. Try the
  // normal path first; if the worker errors during getDocument, fall back to
  // the main-thread parse path so the user still gets text out.
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buffer }).promise;
  } catch (err) {
    if (err instanceof Error && /worker/i.test(err.message)) {
      pdf = await pdfjs.getDocument({
        data: buffer,
        // The disableWorker option forces the parser to run on the main thread.
        // Slower for large PDFs but works everywhere.
        disableWorker: true,
      } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    } else {
      throw err;
    }
  }

  let allText = '';
  let twoColumnDetected = false;
  let isLikelyLinkedIn = false;
  const warnings: string[] = [];

  try {
    const meta = await pdf.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const producer = String(info.Producer ?? '');
    const creator = String(info.Creator ?? '');
    if (/linkedin/i.test(producer) || /linkedin/i.test(creator)) {
      isLikelyLinkedIn = true;
    }
  } catch {
    // Metadata read can fail on some PDFs; non-fatal.
  }

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1 });
    const midpoint = viewport.width / 2;
    const content = await page.getTextContent();

    interface Chunk { x: number; y: number; text: string; }
    const chunks: Chunk[] = [];
    for (const item of content.items) {
      const obj = item as { str?: string; transform?: number[] };
      const str = (obj.str ?? '').trim();
      if (!str) continue;
      const x = obj.transform?.[4] ?? 0;
      const y = obj.transform?.[5] ?? 0;
      chunks.push({ x, y, text: str });
    }

    // Two-column heuristic: clusters around left half AND right half, with no
    // significant content straddling the middle band (±20% of midpoint).
    const leftEdge = midpoint - viewport.width * 0.05;
    const rightEdge = midpoint + viewport.width * 0.05;
    const left = chunks.filter((c) => c.x < leftEdge);
    const right = chunks.filter((c) => c.x > rightEdge);
    const center = chunks.filter((c) => c.x >= leftEdge && c.x <= rightEdge);
    const isTwoColumn = left.length > 8 && right.length > 8;
    if (isTwoColumn) twoColumnDetected = true;

    const pageText = isTwoColumn
      ? [chunksToText(center), chunksToText(left), chunksToText(right)].filter(Boolean).join('\n')
      : chunksToText(chunks);
    allText += pageText + '\n\n';
  }

  if (!isLikelyLinkedIn && /linkedin\.com\/in\//i.test(allText.slice(0, 500))) {
    isLikelyLinkedIn = true;
  }

  // Spec §12.2.1: auto-fall back to OCR for scanned/image-based PDFs.
  // Render each page to a canvas and OCR the canvas image.
  if (allText.trim().length < 100) {
    warnings.push(
      'No text layer in this PDF — running OCR. This may take a moment.',
    );
    return ocrPdfPages(pdf, warnings);
  }

  return {
    text: allText,
    hints: { twoColumnDetected, isLikelyLinkedIn },
    warnings,
  };
}

function chunksToText(chunks: { x: number; y: number; text: string }[]): string {
  const lineMap = new Map<number, { x: number; y: number; text: string }[]>();
  for (const chunk of chunks) {
    const bucket = Math.round(chunk.y);
    const existing = lineMap.get(bucket) ?? [];
    existing.push(chunk);
    lineMap.set(bucket, existing);
  }
  return Array.from(lineMap.entries())
    .sort(([a], [b]) => b - a)
    .map(([, line]) => line.sort((a, b) => a.x - b.x).map((c) => c.text).join(' '))
    .join('\n');
}

async function ocrPdfPages(
  pdf: { numPages: number; getPage: (n: number) => Promise<unknown> },
  warnings: string[],
): Promise<ExtractionResult> {
  const worker = await createOcrWorker();
  try {
    let combinedText = '';
    let totalConfidence = 0;
    let pagesScanned = 0;

    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      const page = (await pdf.getPage(pageNo)) as {
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
      };
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      // Convert to blob — Tesseract handles blobs reliably across browsers,
      // whereas direct canvas handoff can fail in Safari and Firefox.
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) continue;
      const result = await worker.recognize(blob);
      combinedText += result.data.text + '\n\n';
      totalConfidence += result.data.confidence;
      pagesScanned += 1;
    }
    const avgConfidence = pagesScanned > 0 ? totalConfidence / pagesScanned : 0;
    if (avgConfidence < 75) {
      warnings.push(
        `OCR confidence is low (${Math.round(avgConfidence)}%). Please review every field carefully.`,
      );
    }
    return {
      text: combinedText,
      hints: { ocrConfidence: avgConfidence },
      warnings,
    };
  } finally {
    void worker.terminate();
  }
}

// Centralise worker creation. tesseract.js v6+ shipped CJS exports so the
// previous `(await import('tesseract.js')).default` resolved to undefined
// under some Vite interop paths. Destructure the named export instead.
async function createOcrWorker() {
  const tess = await import('tesseract.js');
  const ns = (tess as unknown as { default?: typeof tess }).default ?? tess;
  const { createWorker } = ns as { createWorker: typeof tess.createWorker };
  if (typeof createWorker !== 'function') {
    throw new Error(
      'Failed to load OCR engine (tesseract.js). Try refreshing the page or check your network connection.',
    );
  }
  return createWorker('eng');
}

async function extractDocx(file: File): Promise<ExtractionResult> {
  const mammoth = await import('mammoth/mammoth.browser');
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return {
    text: result.value,
    warnings: result.messages?.map((message) => message.message),
  };
}

async function extractImage(file: File): Promise<ExtractionResult> {
  const worker = await createOcrWorker();
  try {
    const result = await worker.recognize(file);
    const text = result.data.text;
    const confidence = result.data.confidence;
    const warnings: string[] = [];
    if (!text.trim()) {
      warnings.push(
        'OCR returned no text. Make sure the image is clear and the text is right-side up.',
      );
    } else if (confidence < 75) {
      warnings.push(
        `OCR confidence is low (${Math.round(confidence)}%). Please review all fields carefully before continuing.`,
      );
    }
    return {
      text,
      hints: { ocrConfidence: confidence },
      warnings,
    };
  } finally {
    void worker.terminate();
  }
}
