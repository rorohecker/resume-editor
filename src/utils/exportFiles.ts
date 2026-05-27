import type { Entry, Resume, Section } from '@/types';
import { formatDateRange } from './dateFormat';
import { resumeToPlainText, stripHtml } from './resumeText';
import { ensureFontRegistered } from './pdfFonts';
import { createPdfDocumentFor } from './pdfDocument';
import { isWorkerAvailable, renderPdfInWorker } from './pdfWorkerClient';
import { displayContactValue } from './contactIcon';
import { resumeForPagedExport } from './resumeLayout';

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

async function exportPdf(resume: Resume): Promise<void> {
  const blob = await renderPdfBlob(resume);
  downloadBlob(blob, `${fileBaseName(resume)}.pdf`, 'application/pdf');
}

async function renderPdfBlob(resume: Resume): Promise<Blob> {
  let blob: Blob | null = null;
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
  return blob;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve());
    else setTimeout(resolve, 0);
  });
}

async function exportDocx(resume: Resume): Promise<void> {
  const blob = await renderDocxBlob(resume);
  downloadBlob(
    blob,
    `${fileBaseName(resume)}.docx`,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
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

async function exportPng(resume: Resume): Promise<void> {
  const blob = await renderPngBlob(resume);
  downloadBlob(blob, `${fileBaseName(resume)}.png`, 'image/png');
}

async function renderPngBlob(resume: Resume): Promise<Blob> {
  const { toPng } = await import('html-to-image');
  const page = document.querySelector<HTMLElement>('.resume-print-page');
  if (!page) throw new Error('Resume preview is not available.');
  void resume;

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
  return response.blob();
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
