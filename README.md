# Resume Editor

Local-first resume editor that runs entirely in your browser. Write a long master resume, tag every block, then generate a tailored one-pager for a specific job in one click. Bring your own AI key, or use the offline heuristics.

Live demo: https://rorohecker.github.io/resume-editor/

Or run locally with `npm install && npm run dev`.

## Why this exists

Most resume tools are SaaS that store your data on their servers. This one keeps everything in IndexedDB in your own browser. No accounts, no uploads, no tracking. AI features use your own provider key so the developer never sees your data or pays for your usage.

## What it does

**Master resume and variants.** Keep a long resume with every experience and bullet you have ever written. Tag each block. Paste a job description and the variant generator picks the most relevant blocks to fit one page. Each variant is saved as its own resume, linked back to the master.

**Multi-format export.** PDF with embedded fonts, DOCX, ATS-safe plain text, PNG, and JSON for backup. PDF rendering runs in a Web Worker when available.

**Real import.** PDF text-layer extraction with two-column detection, DOCX via mammoth, scanned PDFs and images via Tesseract OCR, plain text, and JSON round-trip. LinkedIn exports get a specialized parser.

**Bring-your-own-key AI.** Pick Claude, OpenAI, or Gemini. Paste your key once. Calls go directly from your browser to the provider. Every cloud feature has a local heuristic fallback so the app is useful without a key.

**Job tracker.** Each resume has a target role, company, status, and notes. The manager has a kanban view grouped by status.

**Other things.** Live HTML preview with a real PDF preview toggle. Five templates. Block library with tag filtering. Inline XYZ feedback on each bullet. Drag and drop with touch and keyboard support. Auto-save plus idle snapshots. Snapshot diff before restore. Cross-tab sync. Anonymize mode. Light and dark themes. English and Spanish. PWA installable. Onboarding tour with spotlight.

## Quick start

```bash
git clone https://github.com/rorohecker/resume-editor
cd resume-editor
npm install
npm run dev
```

Open the URL the dev server prints. Pick a template. Start typing.

## AI setup (optional)

1. Open the AI panel from the editor.
2. Switch to the Settings tab.
3. Pick a provider and paste your own API key.
4. Test the connection.

The key never leaves your browser. The app enforces per-minute and per-day call caps you can adjust.

Where to get a key:

- Claude: https://console.anthropic.com/settings/keys
- OpenAI: https://platform.openai.com/api-keys
- Gemini: https://aistudio.google.com/app/apikey

## Stack

React 18, TypeScript strict, Vite 8, Tailwind, Zustand, TipTap, dnd-kit, @react-pdf/renderer, idb-keyval, vite-plugin-pwa, pdfjs, mammoth, tesseract.js, react-i18next.

## Building for production

```bash
npm run build
```

Outputs a static SPA under `dist/`. Drop it on any static host (Vercel, Netlify, GitHub Pages, Cloudflare Pages, S3, your own server). No backend required.

## Privacy

Everything happens in your browser:

- Resumes live in IndexedDB under your origin.
- Snapshots are gzipped before write.
- AI calls go from your browser straight to your chosen provider over HTTPS.
- The developer never sees your data, your key, or your usage.

A one-time disclosure modal explains this before the first AI-enriched action.

## Contributing

Issues and pull requests welcome. The project is single-author for now so response times will vary.

## License

MIT.
