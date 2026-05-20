# Feature Matrix

Status for the SPEC.md feature groups.

| Spec | Area | Status | Notes |
|---|---|---|---|
| 1 | Project overview | Implemented | React + TypeScript app with live editor/preview flow. |
| 2 | Tech stack | Partial | React, TypeScript, Tailwind, Zustand, Lucide, DOCX, html-to-image, and @react-pdf are present. TipTap, dnd-kit, pdf.js, Mammoth, and OCR libraries are not yet wired. |
| 3 | Layout and UI shell | Implemented | Landing/gallery, editor shell, export modal, mobile edit/preview tabs, AI drawer, tips panel. |
| 4 | Templates | Implemented | Five built-in templates with styles, default section order, and contact defaults. |
| 5 | Header/contact | Implemented | Editable name, contact fields, ordering, visibility, separators, validation warnings, clickable links in preview/export text. |
| 6 | Sections system | Implemented | Add, remove, rename, reorder, duplicate, hide, and edit core section types. Drag and drop is native HTML drag instead of dnd-kit. |
| 7 | Date alignment | Implemented | Preview uses consistent two-column grid rows with no-wrap dates and global date formats. |
| 8 | Styling controls | Implemented | Fonts, sizes, colors, professional presets, contrast/ATS warnings, margins, spacing, rule styles. |
| 9 | Page settings | Implemented | Letter/A4, one-page mode, page usage, page number toggle. Two-page visual page breaks are not fully simulated. |
| 10 | AI assistance | Implemented | Local heuristic tools plus browser-side BYOK for Claude/Anthropic, ChatGPT/OpenAI, and Gemini/Google using the user's own free-tier or paid provider account. |
| 11 | Tips system | Implemented | Always-visible guidance, section tips, XYZ card, searchable action verb bank. |
| 12 | Import/parsing | Partial | TXT/JSON/paste rule parser and review UI are implemented. True PDF/DOCX/image extraction and OCR need pdf.js, Mammoth, and Tesseract wiring. |
| 13 | File management | Implemented | LocalStorage autosave, manual save, snapshots, duplicate, manager, JSON backup. |
| 14 | Export | Implemented | TXT, JSON, DOCX, PNG via html-to-image, and PDF via @react-pdf are implemented with export libraries loaded lazily. |
| 15 | Accessibility/edge cases | Implemented | Keyboard save, undo/redo, ARIA labels on key icon actions, spellcheck, empty section suppression, contrast warnings, bullet length warnings. |
| 16 | Non-goals | Implemented | V1 intentionally excludes accounts/cloud sync, collaboration, native mobile, LinkedIn account import, and job tracking. |
| 17 | Folder structure | Implemented | Current folders match the suggested structure, with placeholders for hooks/assets/shared and API proxy. |
| 18 | Data model | Implemented | Shared TypeScript interfaces plus runtime normalization helpers for imported and persisted data. |
| 19 | Summary | Implemented | This matrix is the living summary of feature coverage. |
