# Feature Matrix

Status for the SPEC.md feature groups. Updated to match the shipped product (v0.2.x).

| Spec | Area | Status | Notes |
|---|---|---|---|
| 1 | Project overview | Implemented | React + TypeScript app with live editor/preview flow. |
| 2 | Tech stack | Implemented | React, TypeScript, Tailwind, Zustand, Lucide, TipTap, dnd-kit, pdf.js, Mammoth, Tesseract OCR, DOCX, html-to-image, @react-pdf. |
| 3 | Layout and UI shell | Implemented | Landing/gallery, editor shell, export modal, mobile edit/preview tabs, AI drawer, tips panel, PWA. |
| 4 | Templates | Implemented | Seven templates including multipage and sidebar layouts. |
| 5 | Header/contact | Implemented | Editable name, contact fields, ordering, visibility, separators, validation warnings, clickable links. |
| 6 | Sections system | Implemented | Add, remove, rename, reorder (dnd-kit), duplicate, hide, and edit core section types. |
| 7 | Date alignment | Implemented | Preview uses consistent two-column grid rows with no-wrap dates and global date formats. |
| 8 | Styling controls | Implemented | Fonts, sizes, colors, presets, contrast/ATS warnings, margins, spacing, rule styles, per-section overrides. |
| 9 | Page settings | Implemented | Letter/A4, one-page mode, page usage, page numbers in PDF and HTML preview overlay. Fallback fonts warn in styles. |
| 10 | AI assistance | Implemented | Local heuristics + BYOK (Claude/OpenAI/Gemini). Inline weak-language coaching. OpenAI/Gemini may need a proxy for CORS — see `api/README.md`. |
| 11 | Tips system | Implemented | Guidance, section tips, XYZ card, searchable action verb bank, health score. |
| 12 | Import/parsing | Implemented | PDF/DOCX/TXT/JSON/image OCR, LinkedIn heuristics, review UI, selective merge checkboxes. |
| 13 | File management | Implemented | IndexedDB autosave with failure toasts, snapshots, duplicate, manager, JSON backup, optional File System Access sync. |
| 14 | Export | Implemented | TXT, JSON, DOCX, PNG, PDF with preview-then-download. |
| 15 | Accessibility/edge cases | Implemented | Keyboard save/undo/redo (including while typing), ARIA labels, spellcheck, empty section suppression, warnings. |
| 16 | Non-goals | Partial | Still excludes accounts/cloud sync, collaboration, native mobile, LinkedIn OAuth. Job tracking (list + drag-to-status kanban) ships locally. |
| 17 | Folder structure | Implemented | Matches suggested structure; `api/` documents optional BYOK proxy. |
| 18 | Data model | Implemented | Shared TypeScript interfaces plus runtime normalization helpers. |
| 19 | Summary | Implemented | This matrix is the living summary of feature coverage. |
