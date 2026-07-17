// Lazy-loaded file extractors. Heavy libraries (pdfjs, mammoth, tesseract)
// are only fetched when the user actually picks that file type.

export interface ExtractionResult {
  text: string;
  hints?: {
    isLikelyLinkedIn?: boolean;
    twoColumnDetected?: boolean;
    ocrConfidence?: number;
  };
  warnings?: string[];
}

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_OCR_PAGES = 10;

export async function extractFromFile(file: File): Promise<ExtractionResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Please upload a file under ${Math.round(
        MAX_FILE_BYTES / (1024 * 1024),
      )} MB.`,
    );
  }
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
  return {
    text: await file.text(),
    warnings: [`Unknown file type "${ext || mime}". Attempted plain-text read.`],
  };
}

let pdfWorkerConfigured = false;
async function configurePdfWorker(pdfjs: typeof import('pdfjs-dist')): Promise<void> {
  if (pdfWorkerConfigured) return;
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  pdfWorkerConfigured = true;
}

interface TextChunk {
  x: number;
  y: number;
  text: string;
  width: number;
  height: number;
}

async function extractPdf(file: File): Promise<ExtractionResult> {
  const pdfjs = await import('pdfjs-dist');
  await configurePdfWorker(pdfjs);

  const buffer = await file.arrayBuffer();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: buffer }).promise;
  } catch (err) {
    if (err instanceof Error && /worker/i.test(err.message)) {
      pdf = await pdfjs.getDocument({
        data: buffer,
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
  const linkUrls: string[] = [];

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
    const content = await page.getTextContent();

    // Pull clickable link annotations (mailto / LinkedIn / GitHub) — more reliable
    // than regex when the visible text is abbreviated ("LinkedIn" without URL).
    try {
      const annotations = await page.getAnnotations();
      for (const annotation of annotations) {
        const url =
          (annotation as { url?: string; unsafeUrl?: string }).url ??
          (annotation as { unsafeUrl?: string }).unsafeUrl;
        if (url) linkUrls.push(url);
      }
    } catch {
      // Annotations optional.
    }

    const chunks: TextChunk[] = [];
    for (const item of content.items) {
      const obj = item as {
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      };
      const str = (obj.str ?? '').trim();
      if (!str) continue;
      const transform = obj.transform ?? [1, 0, 0, 1, 0, 0];
      chunks.push({
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        text: str,
        width: obj.width ?? Math.abs(transform[0] ?? 0) * str.length,
        height: obj.height ?? Math.abs(transform[3] ?? 8),
      });
    }

    const columnSplit = detectColumnBoundary(chunks, viewport.width);
    if (columnSplit) twoColumnDetected = true;

    const pageText = columnSplit
      ? chunksToTextTwoColumn(chunks, columnSplit)
      : chunksToText(chunks);
    allText += pageText + '\n\n';
  }

  if (linkUrls.length > 0) {
    const uniqueLinks = [...new Set(linkUrls)];
    allText = `${uniqueLinks.join('\n')}\n\n${allText}`;
  }

  if (!isLikelyLinkedIn && /linkedin\.com\/in\//i.test(allText.slice(0, 800))) {
    isLikelyLinkedIn = true;
  }

  if (allText.trim().length < 100) {
    warnings.push('No text layer in this PDF — running OCR. This may take a moment.');
    return ocrPdfPages(pdf, warnings);
  }

  return {
    text: allText,
    hints: { twoColumnDetected, isLikelyLinkedIn },
    warnings,
  };
}

/**
 * Find a vertical gap in the x-histogram that separates two columns.
 * Falls back to midpoint only when both sides have enough content.
 */
function detectColumnBoundary(
  chunks: TextChunk[],
  pageWidth: number,
): number | null {
  if (chunks.length < 20 || pageWidth < 100) return null;

  const buckets = 40;
  const hist = new Array<number>(buckets).fill(0);
  for (const chunk of chunks) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((chunk.x / pageWidth) * buckets)));
    hist[idx] += chunk.text.length;
  }

  // Look for a low-density valley in the middle 40–60% of the page.
  const start = Math.floor(buckets * 0.35);
  const end = Math.floor(buckets * 0.65);
  let bestIdx = -1;
  let bestScore = Infinity;
  for (let i = start; i <= end; i += 1) {
    const score = hist[i] + (hist[i - 1] ?? 0) * 0.5 + (hist[i + 1] ?? 0) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  const leftMass = hist.slice(0, bestIdx).reduce((a, b) => a + b, 0);
  const rightMass = hist.slice(bestIdx + 1).reduce((a, b) => a + b, 0);
  const total = leftMass + rightMass + hist[bestIdx];
  if (total === 0) return null;
  if (leftMass < total * 0.15 || rightMass < total * 0.15) return null;
  // Valley should be relatively empty vs the denser side.
  if (hist[bestIdx] > Math.min(leftMass, rightMass) * 0.25) return null;

  return ((bestIdx + 0.5) / buckets) * pageWidth;
}

function chunksToText(chunks: TextChunk[]): string {
  return linesFromChunks(chunks).join('\n');
}

/**
 * Two-column reading order: walk top→bottom; within a y-band emit left column
 * then right column. Preserves section headers that sit above both columns.
 */
function chunksToTextTwoColumn(chunks: TextChunk[], splitX: number): string {
  const left = chunks.filter((c) => c.x + c.width / 2 < splitX);
  const right = chunks.filter((c) => c.x + c.width / 2 >= splitX);
  const leftLines = lineBuckets(left);
  const rightLines = lineBuckets(right);

  const ys = new Set<number>([...leftLines.keys(), ...rightLines.keys()]);
  const orderedYs = [...ys].sort((a, b) => b - a);

  const out: string[] = [];
  for (const y of orderedYs) {
    const l = leftLines.get(y);
    const r = rightLines.get(y);
    if (l) out.push(joinLine(l));
    if (r) out.push(joinLine(r));
  }
  return out.filter(Boolean).join('\n');
}

function lineBuckets(chunks: TextChunk[]): Map<number, TextChunk[]> {
  // Bucket by ~font-height so sub/superscripts stay on the same visual line.
  const map = new Map<number, TextChunk[]>();
  for (const chunk of chunks) {
    const height = Math.max(6, chunk.height || 8);
    const bucket = Math.round(chunk.y / (height * 0.6)) * Math.round(height * 0.6);
    const existing = map.get(bucket) ?? [];
    existing.push(chunk);
    map.set(bucket, existing);
  }
  return map;
}

function linesFromChunks(chunks: TextChunk[]): string[] {
  const map = lineBuckets(chunks);
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([, line]) => joinLine(line));
}

function joinLine(chunks: TextChunk[]): string {
  return chunks
    .sort((a, b) => a.x - b.x)
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
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

    const pagesToScan = Math.min(pdf.numPages, MAX_OCR_PAGES);
    if (pdf.numPages > MAX_OCR_PAGES) {
      warnings.push(
        `This PDF has ${pdf.numPages} pages; only the first ${MAX_OCR_PAGES} were scanned via OCR.`,
      );
    }

    for (let pageNo = 1; pageNo <= pagesToScan; pageNo += 1) {
      const page = (await pdf.getPage(pageNo)) as {
        getViewport: (opts: { scale: number }) => { width: number; height: number };
        render: (opts: {
          canvasContext: CanvasRenderingContext2D;
          viewport: unknown;
          canvas: HTMLCanvasElement;
        }) => { promise: Promise<void> };
      };
      // Higher scale + preprocess improves Tesseract accuracy on scans.
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      preprocessCanvasForOcr(canvas);

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

/** Grayscale + contrast stretch — cheap, big win for Tesseract on washed-out scans. */
export function preprocessCanvasForOcr(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    // Contrast stretch then slight threshold toward ink/paper.
    let v = ((gray - min) / range) * 255;
    v = v > 180 ? 255 : v < 90 ? 0 : v;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
}

async function createOcrWorker() {
  const tess = await import('tesseract.js');
  const ns = (tess as unknown as { default?: typeof tess }).default ?? tess;
  const { createWorker } = ns as { createWorker: typeof tess.createWorker };
  if (typeof createWorker !== 'function') {
    throw new Error(
      'Failed to load OCR engine (tesseract.js). Try refreshing the page or check your network connection.',
    );
  }
  // PSM 3 = fully automatic page segmentation (good default for resumes).
  const worker = await createWorker('eng');
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: '3' as unknown as never,
      preserve_interword_spaces: '1',
    });
  } catch {
    // Older tesseract builds may reject some params; recognition still works.
  }
  return worker;
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
    // Draw through a canvas so we can preprocess photos the same way as PDF OCR.
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    // Upscale small images; leave large ones alone.
    const scale = bitmap.width < 1200 ? 2 : 1;
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const result = await worker.recognize(file);
      return finalizeOcr(result.data.text, result.data.confidence);
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    preprocessCanvasForOcr(canvas);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    );
    const result = await worker.recognize(blob ?? file);
    return finalizeOcr(result.data.text, result.data.confidence);
  } finally {
    void worker.terminate();
  }
}

function finalizeOcr(text: string, confidence: number): ExtractionResult {
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
}
