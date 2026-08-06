# Resume Editor

A resume editor that runs in your browser. Keep one long master resume, then cut a shorter version for each job. Your files stay on your device. Cloud rewrite tools are optional and use a key you paste yourself.

**Try it:** https://rorohecker.github.io/resume-editor/

Or locally: `npm install && npm run dev`

## Why it exists

Most resume sites store your data on their servers. This one keeps resumes in IndexedDB in your own browser — no account, no upload, no tracking. If you turn on cloud tools, the request goes from your browser to the provider you choose. The app author never sees your resume or your key.

## What you can do

**Master resume and job variants.** Write everything once. Tag and hide blocks as needed. Paste a job description and Generate variant picks what to keep, can reword bullets, and opens the new tailored resume. The master is unchanged.

**Export.** PDF with embedded fonts, Word, plain text for ATS forms, PNG, and JSON backup. PDF work can run in a Web Worker when the browser allows it.

**Import.** PDF (including two-column layouts), Word, plain text, JSON, and images. Scanned PDFs and photos go through OCR — that often misreads columns and bullets, so prefer a Word file or text PDF when you can, and always check the parse before you open it.

**Optional API key.** Claude, Gemini, or OpenAI. Paste a key in the AI panel settings. Local checks still work with no key. Claude or Gemini usually need the least fuss here. A ChatGPT Plus or Team plan does **not** include API access — OpenAI needs a separate key with API billing from [platform.openai.com](https://platform.openai.com/api-keys).

**Job tracker.** Each resume can have a company, role, status, and notes. The home page has a list and a status board.

**Also.** Live preview (and a PDF preview toggle), five templates, block library, bullet quality hints, drag-and-drop, autosave, snapshots, share links, anonymize mode, light/dark and accent themes (including Cosmic pixel starfield), English and Spanish, installable PWA, and a How it works guide under the home header or the editor More menu.

## Quick start

```bash
git clone https://github.com/rorohecker/resume-editor
cd resume-editor
npm install
npm run dev
```

Open the URL Vite prints, pick a template, and start editing.

## Optional API setup

1. Open the sparkle panel in the editor.
2. Go to Settings.
3. Pick a provider and paste your key.
4. Hit Test connection.

The key stays in this browser. You can set local per-minute and per-day call caps; those are not your provider bill.

Keys:

- Claude: https://console.anthropic.com/settings/keys
- Gemini: https://aistudio.google.com/app/apikey
- OpenAI: https://platform.openai.com/api-keys

More detail: [guides.md](guides.md) and [docs/AI_GUIDES.md](docs/AI_GUIDES.md).

## Stack

React 18, TypeScript, Vite 8, Tailwind, Zustand, TipTap, dnd-kit, @react-pdf/renderer, idb-keyval, vite-plugin-pwa, pdf.js, mammoth, tesseract.js, react-i18next.

## Production build

```bash
npm run build
```

You get a static site in `dist/`. Host it anywhere (GitHub Pages, Netlify, Cloudflare, S3, your own server). No backend required for the core app.

```bash
npm run build:single
```

Builds a self-contained HTML file under `dist-single/` for offline / file:// use.

## Privacy

- Resumes live in IndexedDB under this origin.
- Snapshots are compressed before write when the browser supports it.
- Cloud calls go straight from your browser to your provider over HTTPS.
- The developer never sees your data, key, or usage.

A one-time notice appears before the first cloud-enriched action.

## Contributing

Issues and pull requests are welcome. This is mostly a single-author project, so replies may take a bit.

## License

MIT.
