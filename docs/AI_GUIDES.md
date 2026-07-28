# AI Feature Guides

Researched against official provider documentation on 2026-07-28.

This is the human-readable companion to `src/utils/aiGuides.ts`. Every BYOK
prompt builder should call `buildFeaturePrompt(...)` so Claude, OpenAI, and
Gemini receive the same universal rules plus feature-specific steps.

## Provider Research Baseline

| Provider | App default | Why | API notes |
| --- | --- | --- | --- |
| Claude | `claude-haiku-4-5` | Fast, low-cost default for resume edits. `claude-sonnet-5`, `claude-opus-5`, `claude-fable-5`, and custom IDs remain available. | Claude Opus/Sonnet/Fable 5 use adaptive thinking; Claude 4.7+ rejects non-default `temperature`, `top_p`, and `top_k`, so the app omits those parameters. Current Claude models support `output_config.format` JSON schemas. |
| OpenAI | `gpt-5.6-luna` | Cost-sensitive default for high-volume BYOK calls. `gpt-5.6-terra` and `gpt-5.6` remain available. | Uses the Responses API. GPT-5.6 models support reasoning effort, and structured outputs use `text.format` with `json_schema`. |
| Gemini | `gemini-3.6-flash` | Current stable Gemini 3 model balancing speed and quality. `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, and custom IDs remain available. | Uses `generateContent`. Google recommends Interactions API for newest features, but `generateContent` still documents JSON schemas through `generationConfig.response_mime_type` and `response_schema`. |

Official docs:

- OpenAI models: https://platform.openai.com/docs/models
- OpenAI structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- Claude models: https://docs.anthropic.com/en/docs/about-claude/models/overview
- Claude Messages API: https://docs.anthropic.com/en/api/prompt-validation
- Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Gemini models: https://ai.google.dev/gemini-api/docs/models
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/generate-content/structured-output

## Universal Rules

All model prompts must include these rules:

1. Truth only: never invent employers, schools, titles, dates, tools, metrics,
   or outcomes.
2. Use exact inventory IDs when IDs are required.
3. Prefer concise ATS-friendly wording: strong action verb, concrete task,
   impact when possible.
4. If JSON is requested, return only valid JSON: no markdown fences, preamble,
   or trailing commentary.
5. If a step cannot be completed honestly, omit that item instead of
   fabricating.
6. Keep results short and decisive so smaller, faster models can comply.

## Provider Implementation Rules

1. Keep BYOK keys client-owned. The browser sends keys directly or through the
   same-origin `/byok/*` CORS proxy; the app never stores a developer key.
2. Use provider-native structured output when safe:
   - OpenAI: `text.format` with `json_schema` for GPT-5/GPT-4o families.
   - Claude: `output_config.format` with `json_schema` for Claude 4.5+.
   - Gemini: `generationConfig.response_mime_type` and `response_schema`.
3. Keep plain-text prompts for features that intentionally return prose.
4. Always keep local fallbacks for non-network features.
5. Keep parser/validator guardrails even when schema mode is enabled.
   Provider schemas reduce malformed output; they do not replace app-side
   truthfulness and ID checks.

## Feature Inventory

| Feature | UI entry | Code entry | Output type | Reliability guardrails |
| --- | --- | --- | --- | --- |
| Generate variant - AI scoring | Generate variant for role | `scoreBlocksWithAi` | JSON object/array of entry and bullet scores | Provider JSON schema, ID validation, conservative bullet fills, clustered-score calibration, strict page packing. |
| Generate variant - keyword rewrite | Generate variant for role | `rewriteVariantBulletsWithAi` | JSON rewrites | Provider JSON schema, known bullet IDs only, unchanged text ignored, rewrite review before create. |
| Tailor to job | Tailor modal | `generateTailoring` | JSON outcome | Provider JSON schema, max 10 rewrites, fake-skill filtering, duplicate/unchanged rewrite removal, summary/cover length caps. |
| Bullet rewrite | AI drawer, Bulk edit | `promptForRewrite` | 3 plain text lines | Shared guide prompt, local rewrite fallback, UI keeps first 3 clean options. |
| Summary | AI drawer | `promptForSummary` | Plain text | Shared guide prompt, local summary fallback, insert via `upsertSummarySection`. |
| Cover letter | Cover letter modal | `promptForCoverLetter` | Plain text | Shared guide prompt, local cover-letter fallback, editable TipTap draft, TXT/DOCX/PDF export. |
| ATS keywords | AI drawer | `promptForAtsKeywords` | Plain pipe-delimited lines | Shared guide prompt plus local `scanAtsKeywords` output while typing. |
| Organize/consolidate | AI drawer | `promptForReorganize` | JSON ops plan | Shared guide prompt, ops parser normalization, known IDs only, preview before apply. |
| Freeform agent | AI drawer | `promptForAgentControl` | JSON ops plan | Same structured ops pipeline as Organize; honors standing instructions. |
| Import enrichment | Import modal | `enrichWithBYOK` | Corrected resume JSON | Shared guide prompt, ID-preserving merge, schema normalization, bullet wording preserved. |
| Test connection | AI settings | `testAiConnection` | `OK` | Shared guide prompt, larger output budget for reasoning models. |
| XYZ bullet quality | AI drawer, health score | `analyzeBullets` | Local analysis | No API; checks action verb, metric, length. |
| Weak language | AI drawer, Bulk edit | `detectWeakLanguage` | Local hits | No API; hits include exact `bulletId` for safe bulk fixes. |
| Grammar | AI drawer | `checkGrammar` | Local/external grammar hits | No BYOK key; applies only suggestions user chooses manually. |
| Local keyword match | Tailor modal | `matchKeywords` | Local score | No API; gives instant missing/covered keyword signal. |
| Health score | Tips panel | `healthScore` helpers | Local score | No API; aggregates bullet quality and weak-language checks. |

## Per-Feature Process

### Generate Variant - AI Scoring

User steps:

1. Start from a master resume with extra relevant detail.
2. Open Generate variant for role.
3. Paste a full job description. This is required for AI and local scoring.
4. Keep target pages tight, usually 1 page.
5. Run scoring and review the preview before creating the variant.

Model steps:

1. Extract must-have job skills, tools, domain, seniority, and impact themes.
2. Score every entry and bullet on a harsh 0-10 scale.
3. Force score spread: many bullets should be low relevance; only direct
   evidence gets 8-10.
4. Return exact IDs only.

App steps:

1. Parse JSON from either a raw score array or `{ "scores": [...] }`.
2. Drop unknown IDs and unusable scores.
3. Fill skipped bullet rows with conservative local relevance.
4. Calibrate clustered or over-generous scores.
5. Pack with strict selectivity so weak details are hidden.

Acceptance checks:

1. A job description is required.
2. Preview hides unrelated bullets.
3. No experience entry appears as an empty shell.
4. One role cannot swallow the whole page.

### Generate Variant - Keyword Rewrite

User steps:

1. Run scoring first.
2. Enable keyword rewrite only when a BYOK key is configured.
3. Review each rewrite before creating the variant.

Model steps:

1. Consider only kept bullet IDs.
2. Rewrite only when an honest keyword-aware improvement exists.
3. Preserve facts, approximate length, and action/task/impact shape.

App steps:

1. Parse JSON from either a raw array or `{ "rewrites": [...] }`.
2. Drop unknown bullet IDs.
3. Drop unchanged rewrites.
4. Default-select rewrites for review, not blind application.

### Tailor To Job

User steps:

1. Open Tailor.
2. Paste the full job description.
3. Review keyword match, bullet rewrites, summary, and cover letter.
4. Apply rewrites individually or apply all after review.

Model steps:

1. Match job requirements to existing resume evidence only.
2. Return at most 10 bullet rewrites.
3. Use exact bullet IDs.
4. Choose skills only from existing skill inventory.
5. Write a 2-sentence summary and short cover letter.

App steps:

1. Send provider JSON schema where supported.
2. Filter skills against resume skills/text.
3. Drop unknown, duplicate, or unchanged rewrites.
4. Trim bullet, summary, and cover-letter length.

### Bullet Rewrite

User steps:

1. Pick a bullet.
2. Add optional instruction.
3. Generate BYOK options or use local options.
4. Click the chosen rewrite to apply.

Model steps:

1. Return exactly three alternatives, one per line.
2. Keep each truthful and concise.
3. Avoid numbering, bullets, or commentary.

### Summary

User steps:

1. Open AI drawer Summary.
2. Generate BYOK summary or use local summary.
3. Add to resume or copy.

Model steps:

1. Use only roles, skills, and wins present in the resume.
2. Return exactly two sentences.

### Cover Letter

User steps:

1. Open Cover letter.
2. Paste optional job description.
3. Generate with BYOK or local fallback.
4. Edit and export.

Model steps:

1. Draft 120-180 words.
2. Use resume evidence only.
3. Return the letter body without extra commentary.

### ATS Keywords

User steps:

1. Paste a job description in the AI drawer Keywords tab.
2. Review local keyword hits immediately.
3. Generate BYOK keyword lines when desired.

Model steps:

1. Extract 15-20 high-signal job terms.
2. Mark each Found or Missing.
3. Suggest a section for missing terms.

### Organize / Consolidate

User steps:

1. Add optional instruction.
2. Generate a plan.
3. Review the plan before applying.

Model steps:

1. Operate through JSON ops only.
2. Prefer consolidation over deleting unique evidence.
3. Use catalog IDs only.

### Freeform Agent

User steps:

1. Write a focused instruction.
2. Review generated ops.
3. Apply only when the plan looks right.

Model steps:

1. Plan the smallest truthful set of ops.
2. Use only allowed ops and catalog IDs.
3. Never invent new resume facts.

### Import Enrichment

User steps:

1. Import a PDF/DOCX/image/text resume.
2. Opt in to AI enrichment only if a BYOK key is configured.
3. Review the import preview before accepting.

Model steps:

1. Compare raw text to preliminary parse.
2. Fix structure, dates, contact fields, and entry grouping.
3. Preserve original bullet text exactly.

### Local-Only Checks

These never require a BYOK key:

1. XYZ quality: checks action verb, metric, and length.
2. Weak language: flags common weak phrases and replacement options.
3. Grammar: checks grammar hits for visible bullets.
4. Local keyword match: compares job terms against resume text.
5. Health score: aggregates quality signals for tips.

## QA Checklist

Run this after any AI prompt, provider, or parser change:

1. `npm test`
2. `npm run typecheck`
3. `npm run build`
4. Test Settings -> Test connection for each configured provider.
5. Test Generate variant with a specific job description and confirm the
   preview hides unrelated details.
6. Test Tailor with the same job description and confirm rewrites are selective.
7. Test AI drawer Rewrite, Summary, ATS Keywords, Organize, and Agent.
8. Test Cover letter with and without a job description.
9. Test Import enrichment on a simple pasted resume.
10. Confirm static OpenAI/Gemini builds document the `/byok` proxy requirement.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Variant keeps almost everything | Model returned clustered/high scores, or old build | Update and rerun; score calibration and strict packing should now cull aggressively. |
| AI scoring falls back to local | Key, CORS, unavailable model, unsupported schema, or malformed JSON | Test connection, use built-in model IDs, and run `npm run dev` for OpenAI/Gemini. |
| Claude returns 400 on generation | Unsupported request parameter on newer Claude model | Do not send temperature/top_p/top_k; app now omits Claude temperature. |
| Empty provider reply | Output budget too low or reasoning consumed visible tokens | Retry with Haiku/Luna/Flash or increase token budget for that feature. |
| OpenAI quota error | API credits missing; ChatGPT Plus is separate | Add API credits in OpenAI platform billing. |
| Browser Failed to fetch | Static build CORS for OpenAI/Gemini | Use `npm run dev`, or deploy with `VITE_BYOK_PROXY=1` and a `/byok` reverse proxy. |
| Tailor suggests unsupported skills | Model drift | App filters the list; add the skill to resume content/tags if it is real. |

## Maintenance Checklist

1. Update `src/utils/aiGuides.ts` first.
2. Keep this document synchronized with guide behavior.
3. Confirm every BYOK prompt builder calls `buildFeaturePrompt(...)`.
4. Use provider structured output only where the schema is simple enough to
   validate safely across providers.
5. Add or update focused tests for parsing, scoring, or apply-operation changes.
6. Run the full QA checklist before release.
