import type { FontFamily } from '@/types';

// PDF font registration for @react-pdf/renderer.
//
// Primary path: load .woff files bundled via @fontsource through Vite's `?url`
// import. These files are fingerprinted and served from the same origin, so PDF
// export is offline-capable after first paint.
//
// Fallback path: CDN .ttf files via jsdelivr (used if a Vite asset import
// fails for any reason — pre-rendered embeds, malformed asset, etc.).

const registered = new Set<string>();

type PdfModule = typeof import('@react-pdf/renderer');

const CDN_FALLBACK: Partial<Record<FontFamily, { regular: string; bold?: string; italic?: string; boldItalic?: string }>> = {
  'EB Garamond': {
    regular: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-Bold.ttf',
    italic: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-Italic.ttf',
    boldItalic: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ebgaramond/EBGaramond-BoldItalic.ttf',
  },
  Inter: {
    regular: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Bold.ttf',
    italic: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-Italic.ttf',
    boldItalic: 'https://cdn.jsdelivr.net/gh/rsms/inter@master/docs/font-files/Inter-BoldItalic.ttf',
  },
  Lato: {
    regular: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Regular.ttf',
    bold: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Bold.ttf',
    italic: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Italic.ttf',
    boldItalic: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-BoldItalic.ttf',
  },
};

async function loadLocalUrls(family: FontFamily): Promise<{ regular: string; bold?: string; italic?: string; boldItalic?: string } | null> {
  try {
    if (family === 'EB Garamond') {
      const [r, b, i, bi] = await Promise.all([
        import('@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff?url'),
        import('@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff?url'),
        import('@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff?url'),
        import('@fontsource/eb-garamond/files/eb-garamond-latin-700-italic.woff?url'),
      ]);
      return { regular: r.default, bold: b.default, italic: i.default, boldItalic: bi.default };
    }
    if (family === 'Inter') {
      const [r, b, i] = await Promise.all([
        import('@fontsource/inter/files/inter-latin-400-normal.woff?url'),
        import('@fontsource/inter/files/inter-latin-700-normal.woff?url'),
        // Inter does not ship italic variants in @fontsource; omit.
        Promise.resolve({ default: '' }),
      ]);
      return { regular: r.default, bold: b.default, italic: i.default || undefined };
    }
    if (family === 'Lato') {
      const [r, b, i, bi] = await Promise.all([
        import('@fontsource/lato/files/lato-latin-400-normal.woff?url'),
        import('@fontsource/lato/files/lato-latin-700-normal.woff?url'),
        import('@fontsource/lato/files/lato-latin-400-italic.woff?url'),
        import('@fontsource/lato/files/lato-latin-700-italic.woff?url'),
      ]);
      return { regular: r.default, bold: b.default, italic: i.default, boldItalic: bi.default };
    }
  } catch (error) {
    console.warn(`Local font load failed for ${family}, falling back to CDN`, error);
  }
  return null;
}

export async function ensureFontRegistered(family: FontFamily, pdfModule: PdfModule): Promise<string> {
  const target = pdfFamilyKey(family);
  if (registered.has(target)) return target;

  // Try local woff bundle first; fall back to CDN ttf.
  const local = await loadLocalUrls(family);
  const urls = local ?? CDN_FALLBACK[family];
  if (!urls) return target;

  try {
    const fonts: { src: string; fontWeight?: number; fontStyle?: 'italic' }[] = [
      { src: urls.regular, fontWeight: 400 },
    ];
    if (urls.bold) fonts.push({ src: urls.bold, fontWeight: 700 });
    if (urls.italic) fonts.push({ src: urls.italic, fontWeight: 400, fontStyle: 'italic' as const });
    if (urls.boldItalic) fonts.push({ src: urls.boldItalic, fontWeight: 700, fontStyle: 'italic' as const });

    pdfModule.Font.register({ family: target, fonts });
    registered.add(target);
  } catch (error) {
    console.warn(`Failed to register PDF font "${family}":`, error);
  }
  return target;
}

export function pdfFamilyKey(family: FontFamily): string {
  switch (family) {
    case 'EB Garamond':
      return 'EBGaramond';
    case 'Inter':
      return 'Inter';
    case 'Lato':
      return 'Lato';
    case 'Georgia':
    case 'Times New Roman':
    case 'Latin Modern Roman':
      return 'Times-Roman';
    case 'Carlito':
    case 'Nimbus Sans':
      return 'Helvetica';
  }
}
