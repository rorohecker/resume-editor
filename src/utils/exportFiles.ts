import type { Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { resumeToPlainText, stripHtml } from './resumeText';
import { ensureFontRegistered } from './pdfFonts';
import { createPdfDocumentFor } from './pdfDocument';
import { isWorkerAvailable, renderPdfInWorker } from './pdfWorkerClient';
import { displayContactValue } from './contactIcon';

export type ExportFormat = 'pdf' | 'docx' | 'txt' | 'png' | 'json';

type DocxModule = typeof import('docx');

export async function exportResume(resume: Resume, format: ExportFormat): Promise<void> {
  switch (format) {
    case 'pdf':
      await exportPdf(resume);
      return;
    case 'docx':
      await exportDocx(resume);
      return;
    case 'txt':
      downloadBlob(resumeToPlainText(resume), `${fileBaseName(resume)}.txt`, 'text/plain;charset=utf-8');
      return;
    case 'json':
      downloadBlob(JSON.stringify(resume, null, 2), `${fileBaseName(resume)}.json`, 'application/json;charset=utf-8');
      return;
    case 'png':
      await exportPng(resume);
      return;
  }
}

async function exportPdf(resume: Resume): Promise<void> {
  let blob: Blob | null = null;
  // Try the Web Worker first. If the worker spawn or render fails for any
  // reason (DOM-only API in @react-pdf, OffscreenCanvas missing, etc.) the
  // client throws and we fall back to the main-thread path.
  if (isWorkerAvailable()) {
    try {
      blob = await renderPdfInWorker(resume);
    } catch (err) {
      console.warn('PDF worker failed, using main thread:', err);
    }
  }
  if (!blob) {
    const pdfModule = await import('@react-pdf/renderer');
    await ensureFontRegistered(resume.styles.font, pdfModule);
    const document = createPdfDocumentFor(resume, pdfModule);
    await yieldToBrowser();
    blob = await pdfModule.pdf(document).toBlob();
  }
  downloadBlob(blob, `${fileBaseName(resume)}.pdf`, 'application/pdf');
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function exportDocx(resume: Resume): Promise<void> {
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
    top: Math.round(resume.styles.margins.top * 1440),
    right: Math.round(resume.styles.margins.right * 1440),
    bottom: Math.round(resume.styles.margins.bottom * 1440),
    left: Math.round(resume.styles.margins.left * 1440),
  };

  // Page width minus side margins, in twips, used for the right-aligned date tab.
  const pageWidthTwips = 8.5 * 1440;
  const usableWidth = pageWidthTwips - margins.left - margins.right;

  const children: import('docx').Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: resume.header.name || resume.name,
          bold: true,
          size: Math.round(resume.styles.fontSize.name * 2),
        }),
      ],
    }),
  ];

  const contacts = resume.header.contactFields
    .filter((field) => field.visible && field.value.trim())
    .sort((a, b) => a.order - b.order)
    .map((field) => displayContactValue(field.type, field.value.trim()));
  if (contacts.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 160 },
        children: [
          new TextRun({
            text: contacts.join(' | '),
            size: Math.round(resume.styles.fontSize.contactLine * 2),
          }),
        ],
      }),
    );
  }

  for (const section of visibleSections(resume)) {
    const sectionChildren = sectionToDocx(section, resume, docx, usableWidth);
    if (sectionChildren.length === 0) continue;
    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        border: {
          bottom: { color: '000000', space: 1, style: BorderStyle.SINGLE, size: 4 },
        },
        children: [
          new TextRun({
            text: section.title.toUpperCase(),
            bold: true,
            size: Math.round(resume.styles.fontSize.sectionHeader * 2),
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
            font: 'Calibri',
            size: Math.round(resume.styles.fontSize.body * 2),
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
              text: '•',
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
            size: { orientation: PageOrientation.PORTRAIT },
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
  downloadBlob(blob, `${fileBaseName(resume)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}

async function exportPng(resume: Resume): Promise<void> {
  const { toPng } = await import('html-to-image');
  const page = document.querySelector<HTMLElement>('.resume-print-page');
  if (!page) throw new Error('Resume preview is not available.');

  const dataUrl = await toPng(page, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: '#ffffff',
    width: page.offsetWidth,
    height: Math.max(page.scrollHeight, page.offsetHeight),
    style: {
      transform: 'none',
      transformOrigin: 'top left',
      margin: '0',
      boxShadow: 'none',
    },
  });

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(blob, `${fileBaseName(resume)}.png`, 'image/png');
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
    entry.visible === false ? [] : entryToDocx(entry, resume, docx, usableWidth),
  );
}

function entryToDocx(entry: Entry, resume: Resume, docx: DocxModule, usableWidth: number) {
  const { AlignmentType, Paragraph, TabStopType, TextRun } = docx;
  const date = formatDateRange(
    entry.startDate,
    entry.endDate,
    entry.current,
    resume.styles.dateFormat,
  );

  // Header line: bold {title} {subtitle} on the left, plain {date} flush
  // right via a tab stop at the right margin. This matches the on-screen
  // 3-column layout and keeps the date from running off the page.
  const title = entry.title?.trim();
  const subtitle = entry.subtitle?.trim();
  const location = entry.location?.trim();

  const headerRuns: import('docx').TextRun[] = [];
  if (title) headerRuns.push(new TextRun({ text: title, bold: true }));
  if (title && subtitle) headerRuns.push(new TextRun({ text: ' · ' }));
  if (subtitle) headerRuns.push(new TextRun({ text: subtitle, italics: true }));
  if ((title || subtitle) && location) headerRuns.push(new TextRun({ text: `; ${location}` }));
  if (!title && !subtitle && location) headerRuns.push(new TextRun({ text: location }));

  const paragraphs: import('docx').Paragraph[] = [];

  if (headerRuns.length > 0 || date) {
    if (date) {
      headerRuns.push(new TextRun({ text: '\t' }));
      headerRuns.push(new TextRun({ text: date }));
    }
    paragraphs.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: usableWidth }],
        spacing: { after: 40 },
        alignment: AlignmentType.LEFT,
        children: headerRuns,
      }),
    );
  }

  for (const [key, value] of Object.entries(entry.customFields ?? {})) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    // The "kind" key is internal metadata for the study-abroad toggle — never
    // render it as a label/value line in the export.
    if (key === 'kind') continue;
    paragraphs.push(
      new Paragraph({
        spacing: { after: 20 },
        children: [
          new TextRun({ text: `${labelFromKey(key)}: `, bold: true }),
          new TextRun(trimmed),
        ],
      }),
    );
  }

  for (const bullet of entry.bullets ?? []) {
    if (!bullet.visible || !stripHtml(bullet.content)) continue;
    paragraphs.push(
      new Paragraph({
        spacing: { after: 20 },
        numbering: { reference: 'resume-bullets', level: 0 },
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

function downloadBlob(content: BlobPart | Blob, fileName: string, type: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function fileBaseName(resume: Resume): string {
  const headerName = resume.header.name.trim();
  const name = headerName || resume.name || 'Resume';
  return `${name.replace(/\s+/g, '_').replace(/[^a-z0-9_-]/gi, '')}_Resume`;
}

function labelFromKey(key: string): string {
  const labels: Record<string, string> = {
    doiUrl: 'DOI / URL',
    githubUrl: 'GitHub URL',
    gpa: 'GPA',
    url: 'URL',
  };
  if (labels[key]) return labels[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
