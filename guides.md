# Guides

## Job-Tailored Resume Workflow

1. Open the master resume.
2. Open **Generate variant for role**.
3. Paste the full job description. This is required for both AI and local
   scoring so the output is actually tailored.
4. Keep the page target tight, usually 1 page.
5. Run AI scoring if a BYOK key is configured; otherwise the app uses local
   semantic marker scoring.
6. Review the preview. A tailored variant should hide weak or unrelated bullets
   instead of preserving every detail.
7. If the master resume has enough relevant information, the variant should use
   enough prioritized blocks to fill at least one page without exceeding the
   page target.
8. Treat education classes/coursework as editable blocks: add or modify them in
   the education entry, then Generate variant can score, reorder, keep, or hide
   individual classes.
9. Bullets from the same role/project should not repeat the same information;
   the scoring and rewrite prompts tell the model to keep distinct claims.
10. Review optional keyword rewrites, then create the variant.
11. Use **Tailor** for in-place suggestions: selective bullet rewrites, a
   two-sentence summary, skills to emphasize/deprioritize, and a short cover
   letter draft.

## AI Feature Guide

Full model instructions, app guardrails, provider defaults, and troubleshooting
live in [docs/AI_GUIDES.md](docs/AI_GUIDES.md).

Machine-readable prompt steps live in `src/utils/aiGuides.ts`. Every BYOK
feature should call `buildFeaturePrompt(...)` so all supported providers follow
the same rules.

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
