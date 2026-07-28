# Guides

## Job-Tailored Resume Workflow

1. Open the master resume.
2. Open **Generate variant for role**.
3. Paste the full job description. This is required for both AI and local
   scoring so the output is actually tailored.
4. Keep the page target tight, usually 1 page.
5. Run AI scoring if a BYOK key is configured; otherwise the app uses local
   keyword scoring.
6. Review the preview. A tailored variant should hide weak or unrelated bullets
   instead of preserving every detail.
7. Review optional keyword rewrites, then create the variant.
8. Use **Tailor** for in-place suggestions: selective bullet rewrites, a
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
4. Run `npm test`, `npm run typecheck`, and `npm run build`.
5. Manually test Generate variant, Tailor, Rewrite, Summary, ATS Keywords,
   Organize, Agent, Cover Letter, Import enrichment, and local-only checks.

## Maintenance Rule

When changing an AI feature:

1. Update `src/utils/aiGuides.ts`.
2. Update [docs/AI_GUIDES.md](docs/AI_GUIDES.md).
3. Add or adjust focused tests.
4. Run `npm test` and `npm run typecheck`.
