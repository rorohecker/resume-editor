# V1 Scope

This app intentionally stays local-first for V1.

## In Scope

- Local resume creation and editing.
- Template-based resume starts (including multipage and sidebar layouts).
- Client-side import for PDF, DOCX, TXT, JSON, and image OCR, with review UI and selective merge.
- IndexedDB persistence, versions, snapshots, duplicate, delete, JSON backup, and optional Chromium file sync.
- Resume preview with style controls and browser-based export (PDF/DOCX/TXT/PNG/JSON).
- Local heuristic assistance plus optional BYOK AI (Claude / OpenAI / Gemini).
- Cover letter drafting (TipTap + templates) and tailor-to-job flows.
- Local job application tracking (status, company, role) with list and kanban views.

## Out of Scope For V1

- User accounts and cloud sync.
- Real-time collaboration.
- Mobile-native apps.
- Direct LinkedIn account OAuth import (paste/PDF heuristics are in scope).
- Guaranteed OpenAI/Gemini CORS from the browser without a proxy (Claude works in-browser; see `api/README.md`).

The codebase keeps the data model and storage boundaries ready for future cloud sync, but no account or collaboration state is implemented in V1.
