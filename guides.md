# Guides

Open **How it works** in the app (home page or editor → More) for a plain walkthrough of
the master resume, import caveats, job variants, and optional API keys.

## Job-Tailored Resume Workflow

1. Open the master resume.
2. Open **Generate variant for role**.
3. Paste the full job description. This is required for both AI and local
   scoring so the output is actually tailored.
4. Keep the page target tight, usually 1 page.
5. Run generation. With BYOK, the app first researches the company and role
   from the JD plus public web snippets (Wikipedia / search, including
   Glassdoor-style themes when snippets exist), then plans for the target
   role (key factors, what to highlight/reframe/rewrite/deprioritize) using
   the full bullet inventory. If the planner has a reframe idea but needs a
   metric, scope, or outcome you have not written yet, it pauses and asks
   clarifying questions — answer or skip, then scoring continues with your
   details. Without a key, it uses local research + plan + semantic scoring.
6. Review the company research, target-role plan, and the preview. A tailored
   variant should hide weak or unrelated bullets instead of preserving every
   detail.
7. Use the eye toggles on Skills / Additional Information (in the editor and in
   the variant preview) to show or hide categories before creating the variant.
8. Education is always pinned as the first section in the generated variant and
   is not rewritten, reordered, or class-filtered by the generator.
9. Generate variant only reworks Experience, Skills, Projects, and Leadership.
   Other sections keep their existing visibility/content.
10. If the master resume has enough relevant information, the variant should use
   enough prioritized allowed-section blocks to fill at least one page without
   exceeding the page target. Page-usage % should track the live preview closely.
11. Bullets from the same role/project should not repeat the same information;
   the scoring and rewrite prompts tell the model to keep distinct claims.
12. Review optional keyword rewrites (each includes why it is useful), then
   create the variant — the app opens the tailored resume immediately.
13. Use **Tailor** for in-place suggestions: selective bullet rewrites, a
   two-sentence summary, skills to emphasize/deprioritize, and a short cover
   letter draft.

## AI Feature Guide

Full model instructions, app guardrails, provider defaults, and troubleshooting
live in [docs/AI_GUIDES.md](docs/AI_GUIDES.md).

Machine-readable prompt steps live in `src/utils/aiGuides.ts`. Every BYOK
feature should call `buildFeaturePrompt(...)` so all supported providers follow
the same rules.

## Writing Guidelines

AI-drafted bullets, summaries, and cover letters follow
[docs/THE_SANITIZER.md](docs/THE_SANITIZER.md) (The Sanitizer writing system).
Compact rules are injected into writing prompts via `RESUME_WRITING_RULES`.

## AI QA Process

Use this checklist before changing or releasing AI features:

1. Confirm the feature is listed in [docs/AI_GUIDES.md](docs/AI_GUIDES.md).
2. Confirm the prompt uses `buildFeaturePrompt(...)` when it calls BYOK AI.
3. Confirm JSON features have parser and ID guardrails even when provider schema
   mode is available.
4. Confirm Generate variant can still produce semantic scores when provider JSON
   is malformed or a chunk is missing rows.
5. Run `npm test`, `npm run typecheck`, and `npm run build`.
6. Manually test Generate variant, Tailor, Rewrite, Summary, ATS Keywords,
   Organize, Agent, Cover Letter, Import enrichment, and local-only checks.

## Maintenance Rule

When changing an AI feature:

1. Update `src/utils/aiGuides.ts`.
2. Update [docs/AI_GUIDES.md](docs/AI_GUIDES.md).
3. Add or adjust focused tests.
4. Run `npm test` and `npm run typecheck`.
