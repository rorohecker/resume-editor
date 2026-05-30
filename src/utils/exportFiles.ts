import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { resumeToPlainText, stripHtml } from './resumeText';
import { displayContactValue } from './contactIcon';
import { resumeForPagedExport } from './resumeLayout';
import {
  labelFromKey,
  studyAbroadLine,
  subtitleForPreview,
  tertiaryForPreview,
  titleForPreview,
  visibleCustomFieldRows,
} from './resumeComposition';

export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'png' | 'json';

type DocxModule = typeof import('docx');

export interface ExportArtifact {
  blob: Blob;
  filename: string;
  mimeType: string;
}

// Generates the export blob WITHOUT downloading. Used by the ExportModal's
// preview-and-confirm flow so the user sees exactly what they're about to
// save before any file lands in their Downloads folder.
export async function generateExportArtifact(
  resume: Resume,
  format: ExportFormat,
): Promise<ExportArtifact> {
  const base = fileBaseName(resume);
  switch (format) {
    case 'pdf': {
      const blob = await renderPdfBlob(resume);
      return { blob, filename: `${base}.pdf`, mimeType: 'application/pdf' };
    }
    case 'docx': {
      const blob = await renderDocxBlob(resume);
      return {
        blob,
        filename: `${base}.docx`,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      };
    }
    case 'txt': {
      const blob = new Blob([resumeToPlainText(resume)], { type: 'text/plain;charset=utf-8' });
      return { blob, filename: `${base}.txt`, mimeType: 'text/plain;charset=utf-8' };
    }
    case 'json': {
      const blob = new Blob([JSON.stringify(resume, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      return { blob, filename: `${base}.json`, mimeType: 'application/json;charset=utf-8' };
    }
    case 'png': {
      const blob = await renderPngBlob(resume);
      return { blob, filename: `${base}.png`, mimeType: 'image/png' };
    }
  }
}

// Trigger an actual download of a pre-generated blob. Used by the
// preview-confirm flow after the user clicks Confirm.
export function downloadArtifact(artifact: ExportArtifact): void {
  downloadBlob(artifact.blob, artifact.filename, artifact.mimeType);
}

export async function renderPdfBlob(resume: Resume): Promise<Blob> {
  const { renderResumePdfBlob } = await import('./pdfExport');
  return renderResumePdfBlob(resume);
}

async function renderDocxBlob(resume: Resume): Promise<Blob> {
  const layoutResume = resumeForPagedExport(resume);
  const docx = await import('docx');
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    LevelFormat,
    Packer,
    PageOrientation,
    Paragraph,
    TabStopPosition,
    TabStopType,
    TextRun,
  } = docx;

  // 1in = 1440 twips, 1pt = 20 twips. Mirror the resume's own margin settings
  // so the Word output matches the on-screen layout instead of dumping into
  // Word's default 1in margins.
  const margins = {
    top: Math.round(layoutResume.styles.margins.top * 1440),
    right: Math.round(layoutResume.styles.margins.right * 1440),
    bottom: Math.round(layoutResume.styles.margins.bottom * 1440),
    left: Math.round(layoutResume.styles.margins.left * 1440),
  };

  const pageSize =
    layoutResume.styles.paperSize === 'a4'
      ? { width: Math.round(8.27 * 1440), height: Math.round(11.69 * 1440), orientation: PageOrientation.PORTRAIT }
      : { width: Math.round(8.5 * 1440), height: Math.round(11 * 1440), orientation: PageOrientation.PORTRAIT };

  // Page width minus side margins, in twips, used for the right-aligned date tab.
  const pageWidthTwips = pageSize.width;
  const usableWidth = pageWidthTwips - margins.left - margins.right;
  const docxFont = wordFontFor(layoutResume.styles.font);
  const headerAfter = twipsFromPt(4);

  const children: import('docx').Paragraph[] = [
    new Paragraph({
      alignment: layoutResume.template === 'cs-swe' ? AlignmentType.LEFT : AlignmentType.CENTER,
      spacing: { after: 0 },
      children: [
        new TextRun({
          text: layoutResume.header.name || layoutResume.name,
          bold: true,
          size: Math.round(layoutResume.styles.fontSize.name * 2),
        }),
      ],
    }),
  ];

  const contacts = layoutResume.header.contactFields
    .filter((field) => field.visible && field.value.trim())
    .sort((a, b) => a.order - b.order)
    .map((field) => displayContactValue(field.type, field.value.trim()));
  if (contacts.length > 0) {
    children.push(
      new Paragraph({
        alignment: layoutResume.template === 'cs-swe' ? AlignmentType.LEFT : AlignmentType.CENTER,
        spacing: { before: twipsFromPt(2), after: headerAfter },
        children: [
          new TextRun({
            text: contacts.join(' | '),
            size: Math.round(layoutResume.styles.fontSize.contactLine * 2),
          }),
        ],
      }),
    );
  }

  for (const section of visibleSections(layoutResume)) {
    const sectionChildren = sectionToDocx(section, layoutResume, docx, usableWidth);
    if (sectionChildren.length === 0) continue;
    const hideRule =
      section.styleOverrides?.hideRule || layoutResume.styles.ruleStyle.variant === 'none';
    const ruleColor = (layoutResume.styles.colors.sectionRule || '#000000').replace('#', '');
    const sectionBefore = twipsFromPt(
      section.styleOverrides?.spaceAbove ?? layoutResume.styles.spacing.section,
    );
    children.push(
      new Paragraph({
        spacing: { before: sectionBefore, after: twipsFromPt(2) },
        border: hideRule
          ? undefined
          : {
              bottom: {
                color: ruleColor,
                space: 1,
                style:
                  layoutResume.styles.ruleStyle.variant === 'double'
                    ? BorderStyle.DOUBLE
                    : BorderStyle.SINGLE,
                size: docxRuleSize(layoutResume),
              },
            },
        children: [
          new TextRun({
            text:
              section.styleOverrides?.uppercaseTitle === false
                ? section.title
                : section.title.toUpperCase(),
            bold: true,
            size: Math.round(layoutResume.styles.fontSize.sectionHeader * 2),
          }),
        ],
      }),
      ...sectionChildren,
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: docxFont,
            size: Math.round(layoutResume.styles.fontSize.body * 2),
          },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: 'resume-bullets',
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: bulletGlyphForDocx(layoutResume),
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: { indent: { left: 360, hanging: 240 } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: margins,
            size: pageSize,
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  // HeadingLevel + TabStopPosition kept imported in case future tweaks need them.
  void HeadingLevel;
  void TabStopPosition;
  void TabStopType;
  return blob;
}

async function renderPngBlob(resume: Resume): Promise<Blob> {
  // Use the same offscreen render path as the PDF exporter. The previous
  // implementation queried the live preview DOM ('.resume-print-page'), which
  // fails when the export modal hides the preview behind it, on narrow
  // viewports where the preview pane is mobile-collapsed, or when the user is
  // on the Landing page with no preview mounted at all.
  const image = await renderResumePageImage(resume);
  const response = await fetch(image.dataUrl);
  return response.blob();
}

// A PNG data URL of the resume rendered exactly like the on-screen preview.
// Used by the export modal to show a visual preview for formats the browser
// can't preview natively (notably DOCX). Returns a data URL so it renders from
// file:// without any blob/iframe restrictions.
export async function renderResumePreviewDataUrl(resume: Resume): Promise<string> {
  const image = await renderResumePageImage(resume);
  return image.dataUrl;
}

// Render a generated PDF blob into one PNG data URL per page using pdfjs. The
// export modal uses this instead of an <iframe src="blob:…">, because Chromium
// refuses to render blob-URL PDFs inside an iframe when the page is served from
// file:// — which left the PDF preview a blank white box for anyone running the
// single-file build. Data-URL <img> tags have no such restriction.
export async function renderPdfBlobToImages(
  blob: Blob,
  options: { scale?: number; maxPages?: number } = {},
): Promise<string[]> {
  const scale = options.scale ?? 1.5;
  const maxPages = options.maxPages ?? 6;
  const pdfjs = await import('pdfjs-dist');
  await configurePreviewPdfWorker(pdfjs);

  const data = new Uint8Array(await blob.arrayBuffer());
  let doc;
  try {
    doc = await pdfjs.getDocument({ data }).promise;
  } catch (err) {
    if (err instanceof Error && /worker/i.test(err.message)) {
      doc = await pdfjs.getDocument({
        data,
        disableWorker: true,
      } as Parameters<typeof pdfjs.getDocument>[0]).promise;
    } else {
      throw err;
    }
  }

  const images: string[] = [];
  const pageCount = Math.min(doc.numPages, maxPages);
  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvasContext: ctx,
      viewport,
      canvas,
    } as Parameters<typeof page.render>[0]).promise;
    images.push(canvas.toDataURL('image/png'));
    page.cleanup();
  }
  await doc.destroy();
  return images;
}

let previewPdfWorkerConfigured = false;
async function configurePreviewPdfWorker(pdfjs: typeof import('pdfjs-dist')): Promise<void> {
  if (previewPdfWorkerConfigured) return;
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  previewPdfWorkerConfigured = true;
}

interface PagePixels {
  width: number;
  height: number;
}

interface PageImage extends PagePixels {
  dataUrl: string;
}

function previewPagePixels(resume: Resume): PagePixels {
  return resume.styles.paperSize === 'a4'
    ? { width: Math.round(8.27 * 96), height: Math.round(11.69 * 96) }
    : { width: Math.round(8.5 * 96), height: Math.round(11 * 96) };
}

async function renderResumePageImage(resume: Resume): Promise<PageImage> {
  // React core (createElement / createRoot / flushSync) is imported statically
  // at the top of this module. A previous version pulled them in via
  // `await import('react-dom/client')`, but in the chunked production build that
  // subpath lands in a CJS-interop chunk that doesn't expose `createRoot` on the
  // namespace, so PNG export threw "createRoot is not a function" when hosted
  // (it only worked in the single-file build, which inlines everything). These
  // modules are already in the bundle, so static imports add no weight.
  // html-to-image and the preview renderer stay lazy — they're only needed when
  // someone actually exports an image.
  const [{ toPng }, { PreviewRenderer }] = await Promise.all([
    import('html-to-image'),
    import('@/components/preview/PreviewRenderer'),
  ]);

  const page = previewPagePixels(resume);
  const host = document.createElement('div');
  const pageEl = document.createElement('div');
  const root = createRoot(pageEl);

  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${page.width}px`,
    background: '#ffffff',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  pageEl.className = 'resume-print-page';
  Object.assign(pageEl.style, {
    width: `${page.width}px`,
    minHeight: `${page.height}px`,
    background: '#ffffff',
    color: '#000000',
    boxShadow: 'none',
    transform: 'none',
  });

  host.appendChild(pageEl);
  document.body.appendChild(host);

  try {
    flushSync(() => {
      root.render(
        createElement(PreviewRenderer, {
          resume,
          showPageBreaks: false,
          interactive: false,
        }),
      );
    });
    await waitForFonts();
    await nextFrame();
    await nextFrame();

    const height = Math.max(page.height, pageEl.scrollHeight, pageEl.offsetHeight);
    const dataUrl = await toPng(pageEl, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: '#ffffff',
      fontEmbedCSS: '',
      width: page.width,
      height,
      style: {
        transform: 'none',
        transformOrigin: 'top left',
        margin: '0',
        boxShadow: 'none',
      },
    });
    return { dataUrl, width: page.width, height };
  } finally {
    root.unmount();
    host.remove();
  }
}

async function waitForFonts(): Promise<void> {
  try {
    await document.fonts.ready;
  } catch {
    // Font readiness is best effort; html-to-image will still render fallback fonts.
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function sectionToDocx(section: Section, resume: Resume, docx: DocxModule, usableWidth: number) {
  const { Paragraph, TextRun } = docx;

  if (section.type === 'summary' || section.layout === 'text-block') {
    const text = section.entries[0]?.title?.trim();
    return text ? [new Paragraph({ children: [new TextRun(text)] })] : [];
  }

  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return section.entries
      .filter((entry) => entry.title || entry.subtitle)
      .map(
        (entry) =>
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: `${entry.title || 'Skills'}: `, bold: true }),
              new TextRun(entry.subtitle ?? ''),
            ],
          }),
      );
  }

  return section.entries.flatMap((entry) =>
    entry.visible === false ? [] : entryToDocx(entry, section, resume, docx, usableWidth),
  );
}

function entryToDocx(entry: Entry, section: Section, resume: Resume, docx: DocxModule, usableWidth: number) {
  const { AlignmentType, Paragraph, TabStopType, TextRun } = docx;

  const isStudyAbroad =
    section.type === 'study-abroad' || entry.customFields?.kind === 'study-abroad';

  // Publications carry their year in a custom field rather than endDate.
  const dateEnd = section.type === 'publications' ? entry.endDate || entry.customFields?.year : entry.endDate;
  const date = formatDateRange(entry.startDate, dateEnd, entry.current, resume.styles.dateFormat);

  // Compose the same headline lines the PDF/preview use so the Word output
  // reads identically: a bold title (with the date flush right via a right tab
  // stop), then the subtitle, then a tertiary line (location / GPA / honors).
  const title = isStudyAbroad ? studyAbroadLine(entry) : titleForPreview(entry, section);
  const subtitle = isStudyAbroad ? entry.subtitle?.trim() ?? '' : subtitleForPreview(entry, section);
  const tertiary = isStudyAbroad ? '' : tertiaryForPreview(entry, section);
  const italicSubtitle = section.type === 'projects';

  const paragraphs: import('docx').Paragraph[] = [];

  if (title || date) {
    const headerRuns: import('docx').TextRun[] = [];
    if (title) headerRuns.push(new TextRun({ text: title, bold: true }));
    if (date) {
      if (title) headerRuns.push(new TextRun({ text: '\t' }));
      headerRuns.push(new TextRun({ text: date }));
    }
    paragraphs.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: usableWidth }],
        spacing: { after: subtitle || tertiary ? 0 : 40 },
        alignment: AlignmentType.LEFT,
        children: headerRuns,
      }),
    );
  }

  if (subtitle) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: tertiary ? 0 : 40 },
        children: [new TextRun({ text: subtitle, italics: italicSubtitle })],
      }),
    );
  }

  if (tertiary) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: tertiary })],
      }),
    );
  }

  for (const [key, value] of visibleCustomFieldRows(entry, section)) {
    paragraphs.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: `${labelFromKey(key)}: `, bold: true }),
          new TextRun(value),
        ],
      }),
    );
  }

  for (const bullet of entry.bullets ?? []) {
    if (!bullet.visible || !stripHtml(bullet.content)) continue;
    const bulletGlyph = bulletGlyphForDocx(resume);
    paragraphs.push(
      new Paragraph({
        spacing: { after: 20 },
        numbering: bulletGlyph ? { reference: 'resume-bullets', level: 0 } : undefined,
        children: [new TextRun(stripHtml(bullet.content))],
      }),
    );
  }

  return paragraphs;
}

function visibleSections(resume: Resume): Section[] {
  return resume.sections
    .filter((section) => section.visible && sectionHasContent(section))
    .sort((a, b) => a.order - b.order);
}

function sectionHasContent(section: Section): boolean {
  if (section.type === 'page-break') return true;
  if (section.type === 'summary' || section.layout === 'text-block') {
    return Boolean(section.entries[0]?.title?.trim());
  }
  if (section.layout === 'bullet-list') {
    return Boolean(section.entries[0]?.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)));
  }
  return section.entries.some(entryHasContent);
}

function entryHasContent(entry: Entry): boolean {
  if (entry.visible === false) return false;
  return Boolean(
    entry.title?.trim() ||
      entry.subtitle?.trim() ||
      entry.location?.trim() ||
      entry.startDate?.trim() ||
      entry.endDate?.trim() ||
      entry.url?.trim() ||
      entry.bullets?.some((bullet) => bullet.visible && stripHtml(bullet.content)) ||
      Object.values(entry.customFields ?? {}).some((value) => value.trim()),
  );
}

// Triggers a download of a Blob (or string/buffer wrapped in a Blob) by
// creating an object URL, programmatically clicking an anchor, and revoking
// the URL on a delay. The previous version revoked synchronously after
// click() which raced the browser's download fetch and dropped the file
// silently in Chrome and Firefox.
function downloadBlob(content: BlobPart | Blob, fileName: string, type: string): void {
  if (typeof document === 'undefined') return;
  const blob = content instanceof Blob ? content : new Blob([content], { type });

  // IE11 / legacy Edge path. Modern browsers ignore this.
  const nav = navigator as unknown as { msSaveBlob?: (b: Blob, name: string) => boolean };
  if (typeof nav.msSaveBlob === 'function') {
    nav.msSaveBlob(blob, fileName);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  // Defer cleanup so the browser can actually start the download. Synchronous
  // revoke + remove sometimes cancels the download mid-flight.
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}

function fileBaseName(resume: Resume): string {
  const headerName = resume.header.name.trim();
  const name = headerName || resume.name || 'Resume';
  return `${name.replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '')}_Resume`;
}

function twipsFromPt(value: number): number {
  return Math.round(value * 20);
}

function wordFontFor(font: Resume['styles']['font']): string {
  switch (font) {
    case 'EB Garamond':
      return 'EB Garamond';
    case 'Georgia':
      return 'Georgia';
    case 'Times New Roman':
      return 'Times New Roman';
    case 'Lato':
      return 'Lato';
    case 'Inter':
      return 'Inter';
    case 'Carlito':
      return 'Carlito';
    case 'Nimbus Sans':
      return 'Nimbus Sans';
    case 'Latin Modern Roman':
      return 'Latin Modern Roman';
  }
}

function docxRuleSize(resume: Resume): number {
  const weight =
    resume.styles.ruleStyle.variant === 'thick'
      ? Math.max(resume.styles.ruleStyle.weight, 1.5)
      : resume.styles.ruleStyle.weight;
  return Math.max(1, Math.round(weight * 8));
}

function bulletGlyphForDocx(resume: Resume): string {
  switch (resume.styles.bulletStyle ?? 'disc') {
    case 'circle':
      return '\u25e6';
    case 'square':
      return '\u25aa';
    case 'dash':
      return '\u2013';
    case 'arrow':
      return '\u203a';
    case 'none':
      return '';
    case 'disc':
      return '\u2022';
  }
}
