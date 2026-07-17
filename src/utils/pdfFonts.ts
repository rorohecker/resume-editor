import { Font } from '@react-pdf/renderer';
import type { FontFamily } from '@/types';

// Embed the same fonts the on-screen preview uses so the exported PDF wraps
// text and stacks lines identically. Previously the PDF fell back to the
// built-in Times-Roman/Helvetica, whose glyphs are wider and taller than the
// real fonts (EB Garamond, Inter, ...). That mismatch made school names wrap to
// an extra line and pushed the last line of a one-page resume off the page.
//
// We import the woff1 files from @fontsource (fontkit can decode woff1 in the
// browser; woff2 needs brotli and is not reliably supported). Vite turns these
// imports into hashed asset URLs for the normal build and inlines them as
// data: URIs for the single-file build, so registration works in every mode.

// EB Garamond — the default serif. The preview loads weights 400 and 600, so we
// map "bold" (fontWeight 700 in our styles) to the 600 cut to match it exactly.
import ebGaramondRegular from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url';
import ebGaramondBold from '@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff?url';
import ebGaramondItalic from '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url';

import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff?url';
import interItalic from '@fontsource/inter/files/inter-latin-400-italic.woff?url';

import latoRegular from '@fontsource/lato/files/lato-latin-400-normal.woff?url';
import latoBold from '@fontsource/lato/files/lato-latin-700-normal.woff?url';
import latoItalic from '@fontsource/lato/files/lato-latin-400-italic.woff?url';

import carlitoRegular from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import carlitoBold from '@fontsource/carlito/files/carlito-latin-700-normal.woff?url';
import carlitoItalic from '@fontsource/carlito/files/carlito-latin-400-italic.woff?url';

interface EmbeddedFont {
  family: string;
  regular: string;
  bold: string;
  italic: string;
}

const EMBEDDED_FONTS: EmbeddedFont[] = [
  { family: 'EB Garamond', regular: ebGaramondRegular, bold: ebGaramondBold, italic: ebGaramondItalic },
  { family: 'Inter', regular: interRegular, bold: interBold, italic: interItalic },
  { family: 'Lato', regular: latoRegular, bold: latoBold, italic: latoItalic },
  { family: 'Carlito', regular: carlitoRegular, bold: carlitoBold, italic: carlitoItalic },
];

// Map every selectable font to the PDF family we render with. Embedded fonts
// use their real family; the rest fall back to the closest PDF built-in, which
// already matches their preview fallback (Times New Roman -> Times-Roman,
// Nimbus Sans -> Helvetica, etc.).
const FONT_FAMILY_MAP: Record<FontFamily, string> = {
  'EB Garamond': 'EB Garamond',
  Inter: 'Inter',
  Lato: 'Lato',
  Carlito: 'Carlito',
  Georgia: 'Times-Roman',
  'Times New Roman': 'Times-Roman',
  'Nimbus Sans': 'Helvetica',
  'Latin Modern Roman': 'Times-Roman',
};

let registered = false;

export function ensurePdfFontsRegistered(): void {
  if (registered) return;
  registered = true;

  for (const font of EMBEDDED_FONTS) {
    Font.register({
      family: font.family,
      fonts: [
        { src: font.regular, fontWeight: 400, fontStyle: 'normal' },
        { src: font.bold, fontWeight: 700, fontStyle: 'normal' },
        { src: font.italic, fontWeight: 400, fontStyle: 'italic' },
      ],
    });
  }

  // Keep long, hyphen-free tokens (school names, hyphenated cities) from being
  // broken across lines mid-word, which the user saw as a "split" name. We only
  // allow wrapping at existing whitespace; @react-pdf's default callback would
  // otherwise break inside words to fill a line.
  Font.registerHyphenationCallback((word) => [word]);
}

export function pdfFontFamily(font: FontFamily): string {
  return FONT_FAMILY_MAP[font] ?? 'Times-Roman';
}

/** True when the PDF renderer uses a built-in fallback instead of the preview font. */
export function isFallbackPdfFont(font: FontFamily): boolean {
  const mapped = FONT_FAMILY_MAP[font];
  return !mapped || mapped !== font;
}
