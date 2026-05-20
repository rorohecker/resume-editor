import type { Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { resumeToPlainText, stripHtml } from './resumeText';
import { ensureFontRegistered } from './pdfFonts';
import { createPdfDocumentFor } from './pdfDocument';
import { isWorkerAvailable, renderPdfInWorker } from './pdfWorkerClient';

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
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = docx;

  const children = [
    new Paragraph({
      alignment: 'center',
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
    .map((field) => field.value.trim());
  if (contacts.length > 0) {
    children.push(new Paragraph({ alignment: 'center', text: contacts.join(' | ') }));
  }

  for (const section of visibleSections(resume)) {
    const sectionChildren = sectionToDocx(section, resume, docx);
    if (sectionChildren.length === 0) continue;
    children.push(
      new Paragraph({
        text: section.title.toUpperCase(),
        heading: HeadingLevel.HEADING_2,
        thematicBreak: true,
      }),
      ...sectionChildren,
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
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

function sectionToDocx(section: Section, resume: Resume, docx: DocxModule) {
  const { Paragraph, TextRun } = docx;

  if (section.type === 'summary' || section.layout === 'text-block') {
    const text = section.entries[0]?.title?.trim();
    return text ? [new Paragraph(text)] : [];
  }

  if (section.type === 'skills' || section.layout === 'skills-grid') {
    return section.entries
      .filter((entry) => entry.title || entry.subtitle)
      .map((entry) =>
        new Paragraph({
          children: [
            new TextRun({ text: `${entry.title || 'Skills'}: `, bold: true }),
            new TextRun(entry.subtitle ?? ''),
          ],
        }),
      );
  }

  return section.entries.flatMap((entry) => entryToDocx(entry, resume, docx));
}

function entryToDocx(entry: Entry, resume: Resume, docx: DocxModule) {
  const { Paragraph, TextRun } = docx;
  const date = formatDateRange(entry.startDate, entry.endDate, entry.current, resume.styles.dateFormat);
  const header = [entry.title, entry.subtitle, entry.location, date].filter(Boolean).join(' | ');
  const paragraphs = header
    ? [new Paragraph({ children: [new TextRun({ text: header, bold: true })] })]
    : [];

  for (const [key, value] of Object.entries(entry.customFields ?? {})) {
    if (!value.trim()) continue;
    paragraphs.push(new Paragraph(`${labelFromKey(key)}: ${value}`));
  }

  for (const bullet of entry.bullets ?? []) {
    if (!bullet.visible || !stripHtml(bullet.content)) continue;
    paragraphs.push(new Paragraph({ text: stripHtml(bullet.content), bullet: { level: 0 } }));
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
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}
