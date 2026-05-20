# Resume Editor App — Full Build Prompt

---

## 1. Project Overview

Build a **web-based resume editing application** using **React + TypeScript** for the frontend, **Tailwind CSS** for styling, `@react-pdf/renderer` for PDF export, and optional **BYOK (Bring Your Own Key)** AI assistance for Claude, ChatGPT/OpenAI, or Gemini. The app should feel like a lightweight, modern alternative to Overleaf or Resume.io — clean, fast, distraction-free, and purpose-built for college students and early-career professionals. The default aesthetic is professional and minimal. The editor should show a **live preview** of the resume on the right side while the user edits via a structured panel on the left.

---

## 2. Tech Stack

- **Frontend Framework:** React 18+ with TypeScript (strict mode)
- **Styling:** Tailwind CSS with a custom design token system
- **State Management:** Zustand (lightweight, no Redux boilerplate)
- **PDF Export:** `@react-pdf/renderer` for PDF output; also support `.docx` via `docx` npm package, plain `.txt` for ATS, `.json` backup, and high-resolution `.png`
- **Drag and Drop:** `@dnd-kit/core` for section and bullet reordering
- **Rich Text / Inline Editing:** `TipTap` editor (ProseMirror-based) for bullet and description fields — supports bold, italic, underline inline
- **AI Integration:** Optional browser-side **BYOK** provider support for Claude/Anthropic, ChatGPT/OpenAI, and Gemini/Google. Users supply their own free-tier or paid provider API key and model name in the AI drawer. Keys are stored only in browser `localStorage`; the developer never holds keys and never pays for AI calls. Local heuristic fallbacks remain available when no key is configured.
- **Storage:** `localStorage` for auto-save; optional Supabase for account-based cloud storage in a later phase
- **Routing:** React Router v6
- **Icons:** Lucide React
- **Fonts:** Google Fonts API (Garamond, Lato, Calibri-equivalent, Georgia, Computer Modern via web font, Inter, Times New Roman)

---

## 3. Layout & UI Shell

### 3.1 Main Views

The app has three main views:

1. **Landing / Template Gallery** — choose a starting template or blank canvas
2. **Editor View** — two-panel layout: left is the structured editing panel, right is the live resume preview (rendered as close to the final PDF as possible)
3. **Export Modal** — choose format, configure final options, download

### 3.2 Editor View Layout

The editor view should have:
- A **top navigation bar** with: app logo/name, resume name (editable inline), undo/redo buttons, version history dropdown, export button, AI panel toggle, and tips panel toggle
- A **left panel** (40% width on desktop, full width on mobile with tab switching) containing all section editors, styled as collapsible accordion cards
- A **right panel** (60% width) showing the live preview, with a subtle page shadow to simulate paper. Include a zoom slider (50%–150%) and a "fit to width" button
- On **mobile**, the layout collapses to a tabbed interface: "Edit" tab and "Preview" tab
- A **floating AI assistant button** (bottom right corner) that opens a sliding drawer for AI features

---

## 4. Templates

### 4.1 Built-in Templates

Include the following built-in templates, selectable from the template gallery on first load or via "Change Template" in settings:

1. **UT Austin McCombs** — Clean two-column header, single column body, serif font (Garamond), conservative section order: Education, Experience, Leadership, Skills
2. **UT Austin Natural Sciences** — Similar structure but emphasizes Research and Lab Skills sections, slightly more compact spacing, supports GPA and relevant coursework prominently
3. **Software Engineering / CS (Industry Standard)** — Skills at top after header, then Projects, Experience, Education at bottom; monospace-adjacent font option; GitHub link prominently in header
4. **General Professional** — Balanced, neutral, works for any major; Education, Experience, Activities, Skills
5. **Blank Canvas** — Completely empty, user builds from scratch

### 4.2 Template Definition

Each template should define: default font, default font sizes (name/section header/body), default margins, section order, and which contact fields are visible by default. Templates are non-destructive starting points — every element is editable after selection.

---

## 5. Header / Contact Block

The header is always the first block and cannot be deleted, only hidden in extreme edge cases.

### 5.1 Name Field
- Large, centered or left-aligned (template-dependent), bold
- Font size adjustable from 18pt to 36pt
- Separate styling from body text

### 5.2 Contact Fields
- Support up to **7 contact fields** beneath the name
- Available field types: Email, Phone, LinkedIn URL, GitHub URL, Portfolio/Website URL, Location (City, State), Twitter/X, Custom
- Each field has: an auto-detected icon (Lucide icons), a label (hidden in preview, shown in editor), and a value
- Fields are **horizontally laid out** in the preview, separated by a vertical pipe character `|` or a dot `·` (user can choose separator style)
- Fields are **draggable** to reorder
- Toggle individual fields on/off without deleting them
- URLs should be rendered as **clickable hyperlinks** in the PDF (using PDF annotation links)
- Validate email format, LinkedIn URL format, GitHub URL format with inline warnings (yellow, not blocking)

---

## 6. Sections System

### 6.1 Core Behavior
- Users can **add, remove, rename, reorder, and duplicate** any section
- Sections are draggable via a drag handle on the left side of each section header in the editor panel
- Section names are **fully editable** inline
- Each section has a **visibility toggle** (hide without deleting)
- Maximum recommended sections: 6–8 (show a soft warning above 8, not a hard block)

### 6.2 Built-in Section Types (with smart defaults)

#### Experience
- Entry fields: Job Title, Company Name, Location (City, State or "Remote"), Start Date, End Date (or "Present" checkbox)
- Bullet points below (TipTap editor per bullet, up to 8 bullets per entry)
- "Add Entry" button to add multiple roles
- Entries are draggable to reorder within the section

#### Education
- Fields: Degree, Major, Institution Name, Location, Start Date, End Date or Expected Graduation
- Optional sub-fields (togglable): GPA (show only if ≥ 3.0 recommended — show tip), Relevant Coursework (comma-separated, renders as inline list), Honors/Awards
- Supports multiple institutions

#### Projects
- Fields: Project Name (linkable — paste a URL to make it a hyperlink in the PDF), Tech Stack (renders as a pipe-separated or comma-separated list in italics), Date or Date Range, Description bullets
- Optional GitHub icon+link per project

#### Skills
- Flexible layout: renders as `Category: skill1, skill2, skill3` lines
- User can define their own skill categories (e.g., Languages, Frameworks, Tools, Platforms, Soft Skills)
- Skills within a category are comma-separated
- Drag to reorder categories

#### Leadership / Extracurriculars
- Same structure as Experience (role, org, date, bullets)

#### Research
- Fields: Role, Lab/PI Name, Institution, Date Range, Bullets

#### Awards & Honors
- Simple list: Award Name, Issuing Organization, Date
- Renders as a clean list, no bullet points

#### Certifications
- Name, Issuing Body, Date, Optional URL (renders as link)

#### Publications
- Title, Authors, Journal/Conference, Year, DOI/URL

#### Custom Section
- User names it anything
- Choose layout type: Bullet list, Entry-based (like Experience), Simple text block, or Skills-style category list

---

## 7. Date Alignment System (Critical Feature)

This is a core differentiator. All dates and date ranges across **every section and every entry** must be **right-aligned** and **visually column-aligned** with one another, regardless of which section they belong to or how long the left-side content is.

### 7.1 Implementation Notes
- Use a **two-column CSS Grid** per entry row: `grid-template-columns: 1fr auto`
- The left column contains: title/role (bold), organization/company (italic or regular), location (if shown)
- The right column contains: the date string, always right-aligned
- This grid must be applied consistently at the same nesting level across all sections
- Date format options (user selectable globally): `May 2023 – Aug 2023`, `05/2023 – 08/2023`, `Spring 2023 – Fall 2023`, `2023 – Present`
- "Present" should auto-populate when "Current Role" checkbox is checked
- Dates should never wrap to a second line — enforce `white-space: nowrap` on date fields and warn the user if the left content is too long

---

## 8. Styling & Appearance Controls

### 8.1 Font System
- Global font picker applies to the entire resume
- Supported fonts (loaded via Google Fonts or bundled): Garamond (EB Garamond), Georgia, Times New Roman, Lato, Inter, Calibri (Carlito as open-source equivalent), Helvetica Neue (Nimbus Sans), Computer Modern (Latin Modern Roman for LaTeX feel)
- Separate size controls for: **Name**, **Section Headers**, **Entry Titles**, **Body / Bullets**, **Contact Line**
- All sizes in pt (8pt minimum, 14pt maximum for body; up to 36pt for name)
- Bold and italic toggles for section headers

### 8.2 Color System
- **Default and strongly recommended: black (#000000)** for all text
- Allow full color customization via a color picker for: Name text, Section header text, Section header underline/rule, Accent color (used for hyperlinks and optional subtle highlights), Body text
- Display a clear recommendation label: *"Black is strongly recommended for ATS compatibility and professional appearance"*
- Show an **ATS warning banner** if any non-black, non-dark-gray color is applied to body text
- Preset color themes: Classic Black, Navy Professional, Forest Green, Burgundy, Slate Gray — all are dark, professional palettes
- No background color changes — resume background is always white (#FFFFFF) for print compatibility

### 8.3 Spacing & Margin Controls
- Margin sliders for: Top, Bottom, Left, Right — range from 0.4in to 1.2in, default 0.75in (or 1in for conservative templates), step 0.05in
- Section spacing control: space above each section header (0–16pt)
- Entry spacing: space between entries within a section (0–10pt)
- Bullet spacing: line height for bullet text (1.0–1.5, step 0.05)
- Show a live "Page Usage" indicator: a thin colored bar showing what percentage of the page is used (green < 90%, yellow 90–99%, red > 100%)

### 8.4 Line / Rule Styles
- Section header separator options: Full-width horizontal rule (default), Partial rule (left-aligned, 1in), No rule, Double rule, Thick rule
- Rule weight: 0.5pt, 1pt, 1.5pt

---

## 9. Page & Document Settings

- Paper size: **US Letter (8.5 × 11in)** default, A4 option
- One-page mode: toggle that scales spacing/font size slightly to force content onto one page (with a warning about readability)
- Two-page support: allow content to flow to a second page naturally; show a clear page break indicator in the preview
- Page number option (for two-page resumes): "Page 2 of 2" in footer, toggleable

---

## 10. AI Assistance Features

The AI panel is a sliding drawer (right side) with local heuristic tools and optional BYOK cloud AI. All cloud prompts are sent with the current resume context so the selected provider can reason over the document. The app must never ship with a developer-owned key.

### 10.0 BYOK Setup & API Key Management

Current V1 requirement: BYOK is provider-neutral. The user can choose Claude/Anthropic, ChatGPT/OpenAI, or Gemini/Google, enter their own free-tier or paid provider API key, and edit the model name. The app stores the key only in browser `localStorage`, sends requests directly from the user's browser to the selected provider, and falls back to local heuristic tools when no key is configured. Provider account limits, free quotas, and billing belong entirely to the user; the developer never pays for AI calls.

**This app is BYOK (Bring Your Own Key).** Cloud AI features require the user to supply their own Claude/Anthropic, ChatGPT/OpenAI, or Gemini/Google API key from a free-tier or paid provider account. The developer does not host an API key, does not proxy calls, and does not pay for any AI usage. Any free quota or paid usage is handled by the user's selected provider account. Local heuristic tools still work without any key.

#### Architecture

- AI calls go **directly from the browser to the selected provider API**: Anthropic Messages, OpenAI Responses, or Gemini Generate Content.
- No backend service is required for AI; the entire app can be deployed as static files (Vercel, Netlify, GitHub Pages, or any static host)
- The user's API key is stored in browser `localStorage` under the BYOK settings key and is never transmitted anywhere except to the selected provider API.
- The key is **device-local** — switching browsers or clearing site data clears the key, and the user must re-enter it

#### Settings Panel (accessible from the AI drawer header and from a "Settings" item in the top nav menu)

- **API Key field** — masked password input with a "Show / Hide" toggle and a "Paste from clipboard" button
- **Test Connection button** — fires a minimal request to validate the key; displays success or the exact provider error message
- **Remove Key button** — wipes the key from `localStorage` and disables all AI features
- **Model picker/input** — editable model field with provider-specific suggestions. Users can use any model their own account supports.
- **Usage note** — provider billing belongs to the user's account. The app enforces configurable call-count limits but does not estimate prices.
- **Link out** — "Get API key" opens the selected provider's key page (Anthropic Console, OpenAI API keys, or Google AI Studio)

#### Empty-state behavior (no key set)

- Cloud AI features display an **inline empty state** when no key is configured: a card explaining "Cloud AI requires your own API key. [Add key]" with a button that opens the settings panel
- The floating AI button still works — it opens the drawer, which shows the empty-state card prominently
- The weak-verb detector falls back to **purely local regex matching** when no key is set (no API call needed); only the AI-powered suggestions are gated
- The import flow's semantic enrichment pass (§12.2.3) is skipped, and the rule-based parser alone is used

#### Cost transparency (shown in the settings panel)

- Do not hard-code provider pricing; link users to their provider dashboard for actual usage and billing.
- Show provider key links so users can review account-specific pricing, free-tier credits, and usage dashboards.

#### Security & key hygiene

- Display a warning the first time the user pastes a key: *"Your API key will be stored only in this browser. Do not paste it on a shared computer. Anyone with access to this browser profile can view it."*
- Provide a one-click "Wipe all local data" button in settings that clears the key, all resumes, and all snapshots
- Never log the key to console, never include it in error messages, never write it to any analytics/telemetry endpoint
- The settings panel masks the key by default and only reveals on explicit click

#### Optional: rate limiting in-browser

- To protect users from accidental runaway costs (e.g. an infinite-retry bug), enforce a soft cap: max 50 AI calls per minute, max 500 per day, configurable in settings. Hitting the cap shows a friendly warning and pauses further calls until the user acknowledges.

### 10.1 Bullet Rewriter
- Select any bullet point → "Rewrite with AI" button appears
- Opens AI drawer with: the original bullet, 3 rewritten options, and a custom instruction field ("make it more concise", "add a metric", "make it senior-level")
- Accept one option → it replaces the bullet inline
- Always rewrites in **action verb + task + impact** format

### 10.2 XYZ Method Enforcer
- Analyze a selected bullet or all bullets for XYZ compliance: *"Accomplished [X] as measured by [Y] by doing [Z]"*
- Highlight bullets that are missing measurable impact (yellow underline in editor)
- Suggest what kind of metric could be added ("consider adding % improvement, dollar amount, user count, time saved")

### 10.3 Weak Language Detector
- Scan entire resume for weak or passive verbs: "helped", "worked on", "assisted", "was responsible for", "participated in", "involved in"
- Highlight them in the editor panel
- Right-click or hover → suggest 3 stronger replacements from a curated action verb bank

### 10.4 Action Verb Bank
Built-in categorized list of strong verbs (always accessible, not just AI-triggered):
- **Leadership:** Directed, Spearheaded, Orchestrated, Championed, Mentored
- **Engineering/Technical:** Engineered, Architected, Deployed, Optimized, Automated, Debugged, Implemented
- **Analysis:** Analyzed, Evaluated, Forecasted, Identified, Quantified
- **Creation:** Designed, Developed, Built, Launched, Produced
- **Collaboration:** Partnered, Coordinated, Facilitated, Unified
- **Impact:** Reduced, Increased, Generated, Improved, Accelerated, Delivered
- Searchable and filterable by category; click to copy

### 10.5 ATS Keyword Scanner
- Paste a job description into a text area in the AI panel
- The selected BYOK provider analyzes it and extracts the top 15–20 keywords and required skills
- Cross-references with the resume content
- Shows a list: ✅ Found / ❌ Missing for each keyword
- Suggests which section to add missing keywords to

### 10.6 Resume Summary Generator
- Optional — generates a 2–3 sentence professional summary based on the resume content
- User can accept, regenerate, or edit inline

### 10.7 Cover Letter Draft
- Based on resume content + a pasted job description, generate a cover letter draft
- Opens in a separate modal with its own TipTap editor
- Exportable as PDF or DOCX separately

---

## 11. Tips & Tricks System

A collapsible **Tips Panel** (left sidebar toggle or accessible via top nav) that shows contextual, non-intrusive guidance. Tips are static (no API call needed) and shown based on which section the user is currently editing.

### 11.1 Always-Visible Tips
- One-page rule reminder with live page usage indicator
- "Use past tense for previous roles, present tense for current roles"
- "Start every bullet with a strong action verb"

### 11.2 Section-Specific Tips (contextual)
- **Experience:** XYZ method explanation with a live example side-by-side, weak verb list, quantification prompts ("Can you add how many users, dollars, or % improvement?")
- **Skills:** "List tools recruiters search for in ATS systems. Avoid vague skills like 'Microsoft Office' unless specifically relevant."
- **Projects:** "Link your GitHub repo. Mention the tech stack in the entry subtitle."
- **Education:** "Only include GPA if it's 3.0 or above. Consider removing after 2 years of work experience."
- **General:** Tip cards for: resume length by experience level, tailoring resumes per job, what recruiters look for in 6 seconds, font and margin standards

### 11.3 XYZ Method Card (always accessible)
Displayed as a formatted card:
```
ACCOMPLISHED [X]
AS MEASURED BY [Y]
BY DOING [Z]

Example:
"Reduced API response time [X] by 40% [Y] by implementing Redis caching and query optimization [Z]"
```

---

## 12. Resume Import & Intelligent Parsing

Users should be able to import an **existing resume** from a file and have its content automatically extracted, parsed, and mapped into the app's structured data model — populating sections, entries, bullets, dates, and contact fields without manual re-entry. This is one of the highest-value onboarding features: most users already have a resume somewhere and don't want to start from scratch.

### 12.1 Supported Import Formats

| Format | Extraction Method | Notes |
|---|---|---|
| **PDF** | `pdf.js` text layer extraction → fallback to Tesseract.js OCR | Text-layer PDFs (99% of modern resumes) parse cleanly; scanned/image PDFs fall back to OCR |
| **DOCX** | `mammoth.js` converts to structured HTML → parsed | Preserves bold, italic, and list structure |
| **TXT / Plain Text** | Direct string parsing | ATS exports, copy-paste saves |
| **LinkedIn PDF Export** | Specialized parser tuned to LinkedIn's PDF layout | LinkedIn has a consistent structure — worth a dedicated parser |
| **JSON** | Direct import from this app's own export format | Lossless round-trip |
| **Image (PNG, JPG)** | Tesseract.js OCR → text extraction → parser | For photos of printed resumes or screenshots |

### 12.2 Extraction Pipeline

The import flow runs through four sequential stages:

#### 12.2.1 Stage 1 — File Ingestion & Format Detection
- User uploads via drag-and-drop zone or file picker (accepts `.pdf`, `.docx`, `.txt`, `.json`, `.png`, `.jpg`, `.jpeg`)
- Detect format from MIME type and file extension
- Show a progress indicator: *"Reading your file..."*
- For PDFs: attempt `pdf.js` text extraction first. If extracted text is fewer than 100 characters (indicating a scanned/image-based PDF), automatically fall back to Tesseract.js OCR
- For DOCX: run through `mammoth.js` to get structured HTML, then strip to plain text with structure hints retained (bold = likely a title or header, list items = likely bullets)
- For images: run Tesseract.js directly, language set to `eng`, PSM mode 6 (assume uniform block of text)

#### 12.2.2 Stage 2 — Raw Text Normalization
Before any parsing, normalize the raw extracted text:
- Strip non-printable characters and excessive whitespace
- Collapse multiple blank lines into single section breaks
- Detect and normalize common Unicode issues (curly quotes → straight quotes, em-dashes → hyphens, bullet unicode variants `•`, `▪`, `◦`, `–` → standardized)
- Detect text encoding and convert to UTF-8
- Attempt to detect two-column layouts (common in modern resumes) — if two-column, reconstruct reading order left-column-first before parsing

#### 12.2.3 Stage 3 — Intelligent Structural Parsing

This is the core parsing stage. Run a **rule-based parser first**, then optionally send the normalized text to the selected BYOK provider for semantic enrichment.

**Rule-Based Pass (fast, no API call):**
- Identify the name: usually the first non-empty line, often the largest text (use font size hints from PDF metadata if available)
- Identify contact line: look for patterns — email regex, phone regex `(\d{3}[\s.-]\d{3}[\s.-]\d{4})`, LinkedIn URL pattern, GitHub URL pattern, location pattern `City, ST`
- Identify section headers: lines that are ALL CAPS, or bold-only, or followed by a horizontal rule, or match a known keyword list (`EXPERIENCE`, `EDUCATION`, `SKILLS`, `PROJECTS`, `LEADERSHIP`, `RESEARCH`, `AWARDS`, `CERTIFICATIONS`, `PUBLICATIONS`, `SUMMARY`, `OBJECTIVE`, `ACTIVITIES`, `VOLUNTEER`, `HONORS`)
- Identify entries within sections: look for date patterns on the right side of a line (`May 2022 – Aug 2022`, `2021 – Present`, `Jan '23 – Dec '23`, `Summer 2022`) — anything with a date pattern at line-end is likely an entry header row
- Identify bullets: lines beginning with `•`, `-`, `*`, `◦`, `▪`, or indented lines following an entry header

**BYOK Semantic Pass (for ambiguous content) — requires user's BYOK key (§10.0):**
If the user has not set an API key, this pass is skipped and only the rule-based parse is used. If a key is set, send the normalized text plus the rule-based parse result to the selected provider with the following system prompt:

```
You are a resume parser. You will receive raw resume text and a preliminary structural parse.
Your job is to return a corrected and completed JSON object matching this schema: [ResumeJSON schema].
Rules:
- Identify and separate the person's name from contact fields
- Classify each section into one of: experience, education, projects, skills, leadership, research, awards, certifications, publications, summary, custom
- For each entry, extract: title, subtitle (company/institution), location, startDate, endDate, current (boolean), bullets (array of strings)
- For skills sections, group into categories if categories are present; otherwise return a single "General" category
- Normalize all dates to "Mon YYYY" format where possible
- Preserve original bullet text exactly — do not rephrase or improve
- If a field cannot be determined, return null for that field
- Return only valid JSON, no explanation text
```

This semantic pass resolves: ambiguous section headers, multi-line entry titles, skills that are formatted as a paragraph rather than a list, summary/objective sections, and non-standard resume layouts.

#### 12.2.4 Stage 4 — Mapping to App Data Model
- Map the parsed output to the internal `Resume` TypeScript interface
- Generate unique IDs for all sections, entries, and bullets (`nanoid()`)
- Set `order` fields based on parsed sequence
- Apply the **General Professional** template styles as default (user can switch template after import without losing content)
- Flag any fields with low-confidence parsing (confidence < 0.7) with a yellow highlight in the editor so the user knows to review them

### 12.3 Import Review UI (Post-Parse)

After parsing, don't dump the user straight into the editor. Show a **structured review screen** first:

- **"We found the following in your resume"** — show a summary card: Name detected, X contact fields, X sections, X total entries, X bullets
- Display each parsed section as a collapsible card in the review screen with the detected content
- Any field that was flagged as low-confidence shows a yellow ⚠️ badge with the message: *"Please verify this field — we weren't fully confident in this extraction"*
- Any section that couldn't be classified shows as "Unclassified Section" — user picks the section type from a dropdown before proceeding
- Show a **diff-style side panel**: left side is the original resume (rendered as a plain text view or PDF preview using `pdf.js`), right side is the parsed result — so users can catch anything that was missed
- "Looks good — Open in Editor" button proceeds to the full editor
- "Start fresh instead" discards the import and goes to the blank canvas or template picker

### 12.4 Two-Column & Complex Layout Handling

Many modern resume templates use two-column layouts (skills and contact on the left, experience on the right). These are the hardest to parse from PDF text layers because the text extraction order is often non-linear.

Handle this by:
- Detecting two-column layout via x-coordinate metadata in `pdf.js` (`item.transform[4]` gives the x position of each text chunk)
- Grouping text chunks into left column (x < page_midpoint) and right column (x >= page_midpoint)
- Parsing each column independently
- Merging: contact info + skills from left column, experience + education from right column
- Falling back to OCR with column-detection if x-coordinate data is insufficient

### 12.5 LinkedIn PDF Specialized Parser

LinkedIn's PDF export has a consistent, predictable structure. Build a dedicated parser for it:
- Detect LinkedIn PDFs: look for "LinkedIn" in the PDF metadata or the string *"linkedin.com/in/"* in the first 500 characters
- Known LinkedIn sections and their labels: Contact, Summary, Experience, Education, Skills, Certifications, Languages, Volunteer Experience, Publications, Courses, Projects, Honors & Awards, Organizations
- LinkedIn dates use a specific format: `"Month Year – Month Year"` or `"Month Year – Present"` — parse these directly
- LinkedIn separates entries with consistent whitespace — use line-count heuristics tuned to LinkedIn's layout
- Skills in LinkedIn PDFs are exported as a simple comma-separated list — split on comma and map to a single "Skills" category

### 12.6 OCR Quality & Fallback Handling

For image-based PDFs and image uploads:
- Run `Tesseract.js` with `eng` language pack, OEM 3 (best available mode), PSM 6
- Pre-process the image before OCR for better accuracy: convert to grayscale, increase contrast, apply light sharpening, upscale to 300 DPI equivalent if the image is low resolution
- Image pre-processing happens **fully in the browser** (no server side); use `jimp` or a small `canvas`-based pipeline (grayscale + contrast + sharpening + upscale)
- After OCR, run the same normalization + parsing pipeline as text inputs
- Show the user the OCR confidence score: if overall confidence < 75%, display a prominent warning: *"OCR confidence is low for parts of your resume. Please review all fields carefully before continuing."*
- Offer a **manual correction mode**: show the OCR'd text in an editable text area on the left and the parsed result on the right, so users can fix OCR errors in the raw text and re-parse on demand

### 12.7 Paste-from-Clipboard Import

In addition to file upload, support **paste import**:
- A "Paste your resume text" button opens a large text area modal
- User pastes plain text copied from Word, Google Docs, Notion, or any source
- On "Parse this", runs the same Stage 2–4 pipeline as a TXT import
- This is the most universal fallback and works even if the user's file format isn't supported

### 12.8 Privacy & Data Handling

- All parsing happens **client-side in the user's browser** (pdf.js, Tesseract.js, mammoth.js when those extractors are enabled). The only AI network call is from the user's browser directly to their selected BYOK provider, and only if they have provided their own API key (§10.0)
- The BYOK AI call sends **only the plain text content** of the resume — no file binary, no metadata, no personal identifiers beyond what's in the resume text itself
- Display a one-time disclosure before the first AI-enriched import: *"We'll send your resume text to your selected provider using your own API key. The request goes directly from your browser to that provider. The developer of this app never sees your resume or your key."*
- Provide an **"Offline / No AI parse"** option that skips cloud AI and relies only on the rule-based parser — useful for users who don't have a key or want full local processing
- Uploaded files never leave the user's browser — they are processed in memory and discarded when the tab is closed

### 12.9 Import Entry Points

Surface the import option in three places:
1. **Template Gallery / Landing Screen** — primary CTA alongside "Start from scratch": *"Import existing resume"*
2. **Resume Manager home screen** — "Import Resume" button at the top
3. **Inside the editor** — "File > Import & Merge" option in a top-menu dropdown, which allows importing a second resume and **merging specific sections** into the current one (e.g., pull in the Projects section from an old resume into a new one)

---

## 13. Version History & File Management

- Auto-save to `localStorage` every 30 seconds and on every meaningful change (debounced 2s)
- Manual save with `Ctrl+S` / `Cmd+S`
- Version history: up to 20 named snapshots; user can name versions ("Before Career Fair", "Tailored for Google", "Oct 2024 Final")
- **Duplicate Resume** — creates an independent copy for tailoring to different roles
- **Resume Manager** (simple home screen): list of saved resumes with last-modified date, preview thumbnail, rename, duplicate, delete
- Import: accept `.json` export from this app to restore a saved resume on a new device
- Export resume data as `.json` (full structured data, not just PDF) for backup

---

## 14. Export System

Trigger via an "Export" button that opens a modal:

### 14.1 PDF Export
- PDF generated via dynamically imported `@react-pdf/renderer`
- Hyperlinks in PDF are clickable (email `mailto:`, URLs open in browser)
- Embedded fonts (not system fonts) for consistent rendering across all machines
- Standard or Compact mode (compact slightly reduces whitespace for one-page enforcement)
- File named: `FirstName_LastName_Resume.pdf` by default (editable)

### 14.2 DOCX Export
- Generated via the `docx` npm package
- Best-effort formatting match (not pixel-perfect, but structurally correct)
- Useful for recruiters who want to edit or reformat

### 14.3 Plain Text Export (ATS-Safe)
- Strips all formatting
- Outputs clean UTF-8 text with section headers, pipe-separated contact info, and readable bullet points
- Explicitly labeled: "Use this version for copy-pasting into ATS portals"

### 14.4 PNG / Image Export
- Renders the resume preview as a high-resolution PNG via dynamically imported `html-to-image` (useful for LinkedIn Featured section or portfolio)

---

## 15. Accessibility & Edge Cases

- Full keyboard navigation in the editor panel
- Tab order follows visual order
- All icon buttons have aria-labels
- Color contrast checker: if user picks a text color, warn if it doesn't meet WCAG AA contrast on white (#FFFFFF) background
- Spell check enabled on all TipTap text fields (browser native)
- Handle empty sections gracefully — never render empty section headers in the PDF preview
- Character/word count per bullet (soft limit at 2 lines / ~200 characters with a yellow warning)
- Undo/redo works across all changes including section reorder and style changes (use Zustand with temporal middleware or a custom history stack)

---

## 16. Non-Goals (Out of Scope for V1)

- User accounts and cloud sync (use localStorage; design the data model to be Supabase-ready for V2)
- Real-time collaboration
- Mobile-native app (mobile-responsive web is sufficient)
- LinkedIn import (complex, save for V2)
- Job application tracking

---

## 17. Folder Structure (Suggested)

```
/src
  /components
    /editor          # Left panel components
    /preview         # Right panel live preview
    /ai              # AI drawer and feature components
    /templates       # Template definitions and renderer
    /tips            # Tips panel and contextual tip cards
    /export          # Export modal and format handlers
    /shared          # Buttons, modals, inputs, icons
  /store             # Zustand store slices
  /hooks             # useAutoSave, useVersionHistory, useAI
  /types             # TypeScript interfaces (Resume, Section, Entry, Style)
  /utils             # Date formatting, ATS text export, color validation
  /assets            # Font files, template thumbnails
```

The app is deployable as a static SPA. The `/api` folder is an optional placeholder for future server-side integrations, but V1 BYOK AI calls go from the browser directly to the selected provider (§10.0).

---

## 18. Data Model (Core TypeScript Interfaces)

```typescript
interface Resume {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  template: TemplateId;
  header: HeaderBlock;
  sections: Section[];
  styles: ResumeStyles;
}

interface HeaderBlock {
  name: string;
  contactFields: ContactField[];
  // Stored as keys (not literal Unicode glyphs) so the data round-trips through
  // JSON cleanly regardless of file encoding. The renderer maps these to glyphs.
  separatorStyle: '|' | 'dot' | 'dash';
}

interface ContactField {
  id: string;
  type: 'email' | 'phone' | 'linkedin' | 'github' | 'website' | 'location' | 'twitter' | 'custom';
  value: string;
  label: string;
  visible: boolean;
  order: number;
}

interface Section {
  id: string;
  type: SectionType;
  title: string;
  visible: boolean;
  order: number;
  entries: Entry[];
  layout: 'entry-based' | 'bullet-list' | 'skills-grid' | 'text-block';
}

interface Entry {
  id: string;
  title?: string;        // Job title, degree, project name
  subtitle?: string;     // Company, institution, tech stack
  location?: string;
  startDate?: string;
  endDate?: string;
  current?: boolean;
  bullets?: Bullet[];
  url?: string;          // For projects, certifications
  customFields?: Record<string, string>;
}

interface Bullet {
  id: string;
  content: string;       // HTML string from TipTap
  visible: boolean;
  order: number;
}

interface ResumeStyles {
  font: FontFamily;
  fontSize: FontSizeConfig;
  colors: ColorConfig;
  margins: MarginConfig;
  spacing: SpacingConfig;
  ruleStyle: RuleStyle;
  dateFormat: DateFormat;
  paperSize: 'letter' | 'a4';
}
```

---

## 19. Summary of All Features

| Category | Features |
|---|---|
| Templates | McCombs, Natural Sciences, CS/SWE, General, Blank Canvas |
| Header | Name, 7 contact fields, icons, drag-reorder, link detection |
| Sections | Add/remove/rename/reorder/duplicate/hide, 10+ types + custom |
| Dates | Right-aligned, column-consistent across all sections, format options |
| Fonts | 8+ fonts, per-element size control |
| Colors | Full picker, black default, ATS warning, dark presets |
| Margins | 4-side independent sliders |
| AI | **BYOK** for Claude/Anthropic, ChatGPT/OpenAI, or Gemini/Google, browser-direct with local fallback, bullet rewriter, XYZ enforcer, weak verb detector, ATS scanner, cover letter |
| Tips | XYZ card, action verb bank, section-specific guidance, one-page indicator |
| Export | PDF, DOCX, TXT (ATS), PNG |
| Versions | Auto-save, 20 named snapshots, duplicate, JSON import/export |
| Accessibility | Keyboard nav, ARIA, contrast checker, spell check, undo/redo |
