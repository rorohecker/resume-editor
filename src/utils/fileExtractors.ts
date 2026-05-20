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
  if (['png', 'jpg', 'jpeg'].includes(ext) || mime.startsWith('image/')) {
    return extractImage(file);
  }
  // Fallback: best-effort text read
  return {
    text: await file.text(),
    warnings: [`Unknown file type "${ext || mime}". Attempted plain-text read.`],
  };
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const pdfjs = await import('pdfjs-dist');
  // Vite-friendly worker. The ?url import returns a URL string for the worker bundle.
  // We have to rely on a CDN worker path since bundling the worker as an asset is brittle
  // across pdfjs versions; CDN keeps the version pinned to whatever's in node_modules.
  const workerVersion = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${workerVersion}/build/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

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
  const Tesseract = (await import('tesseract.js')).default;
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
    const result = await Tesseract.recognize(canvas, 'eng');
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
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(file, 'eng');
  const text = result.data.text;
  const confidence = result.data.confidence;
  const warnings: string[] = [];
  if (confidence < 75) {
    warnings.push(
      `OCR confidence is low (${Math.round(confidence)}%). Please review all fields carefully before continuing.`,
    );
  }
  return {
    text,
    hints: { ocrConfidence: confidence },
    warnings,
  };
}
