/**
 * Shared AI operating guides for every BYOK feature.
 * Keep docs/AI_GUIDES.md in sync when changing these strings - they are
 * prepended to provider prompts so Claude / OpenAI / Gemini follow the same steps.
 * Writing style follows docs/THE_SANITIZER.md (resume-adapted rules below).
 */

export type AiFeatureId =
  | 'variant-plan'
  | 'variant-score'
  | 'variant-rewrite'
  | 'bullet-rewrite'
  | 'summary'
  | 'cover-letter'
  | 'ats-keywords'
  | 'tailor'
  | 'organize'
  | 'agent'
  | 'import-enrich'
  | 'connection-test';

/** Rules every model must follow regardless of feature. */
export const UNIVERSAL_AI_RULES = `UNIVERSAL RULES (apply to every task):
1. Truth only - never invent employers, schools, titles, dates, tools, metrics, or outcomes.
2. Use exact IDs from the prompt inventory when IDs are required. Never invent or rewrite IDs.
3. Prefer concise ATS-friendly wording: strong action verb + concrete task + impact when possible.
4. Output format is mandatory. If JSON is requested, return ONLY valid JSON (no markdown fences, no preamble, no trailing commentary).
5. If you cannot complete a step honestly, omit that item rather than fabricating.
6. Work for any model size: be decisive, avoid hedging essays, keep lists short.`;

/**
 * Resume-adapted writing style from docs/THE_SANITIZER.md.
 * Applied to every feature that drafts or rewrites prose.
 */
export const RESUME_WRITING_RULES = `RESUME WRITING STYLE (The Sanitizer — apply when drafting or rewriting prose):
1. Lead with information. Open with the action, claim, or fact — no throat-clearing or topic praise.
2. Name the actor and the observable action. Prefer "Built X that Y" over false agency ("the project enabled…", "the solution empowers…").
3. Prefer mechanisms and weighted details (tool, audience, scale, constraint, outcome) over inflated verbs/adjectives (foster, harness, unlock, elevate, robust, seamless, innovative, cutting-edge, transformative, holistic, pivotal…).
4. Cut stock phrases and corporate filler ("plays a crucial role", "in today's fast-paced…", "unlock the potential", "paves the way", "at its core").
5. Use details that change the claim. Do not invent metrics, tools, or friction — preserve true constraints when the source has them.
6. Match certainty to evidence. One level of caution is enough; no hedge stacking and no unearned slogans.
7. Across bullets in the same role, vary the claim — do not repeat the same task, tool, metric, or outcome.
8. House style: no em dashes; no dramatic one-line endings; no automatic three-part adjective/example stacks; plain ATS-friendly English; keep technical terms that carry meaning.
9. Do not add fake imperfections (typos, slang, fragments) to sound human.`;

const WRITING_FEATURES = new Set<AiFeatureId>([
  'variant-plan',
  'variant-rewrite',
  'bullet-rewrite',
  'summary',
  'cover-letter',
  'tailor',
  'organize',
  'agent',
  'import-enrich',
]);

const FEATURE_STEPS: Record<AiFeatureId, string> = {
  'variant-plan': `FEATURE: Target-role planning (before scoring)
GOAL: Think like a recruiting coach for THIS job, then produce a short plan the scorer and rewriter will follow.

STEPS:
1. Infer the target role title and seniority from the job description.
2. List 5-8 key factors that decide who gets an interview (must-have skills, tools, domains, soft skills, impact themes).
3. Decide what to HIGHLIGHT from a typical candidate resume for this role (skills categories, experience themes, project types).
4. Decide what to REWRITE or REFRAME (how to angle bullets toward the role without inventing facts).
5. Decide what to DEPRIORITIZE or hide (generic bullets, unrelated activities, weak skill noise).
6. Note how to reframe experiences for this role in 2-4 concrete guidance bullets.
7. SELF-PROMPT: If you have a promising reframe idea but the resume lacks a metric, scope, tool, audience, or outcome needed to write it truthfully, add 1-4 clarifyingQuestions for the user. Each question must be specific, answerable in one short sentence, and include why you need it. If the resume already has enough detail, return an empty clarifyingQuestions array.
8. Return ONLY JSON:
{
  "targetRole": "...",
  "keyFactors": ["..."],
  "skillsToHighlight": ["..."],
  "experiencesToReframe": ["..."],
  "whatToRewrite": ["..."],
  "whatToDeprioritize": ["..."],
  "targetingNotes": "2-4 sentences of packing/rewrite strategy",
  "clarifyingQuestions": [
    { "id": "q1", "topic": "Project or role name", "question": "...?", "why": "So we can reframe X without inventing Y" }
  ]
}
9. Keep lists short and specific to THIS job. Never invent facts in questions — ask only for missing detail that would unlock an honest reframe.`,

  'variant-score': `FEATURE: Role-variant block scoring
GOAL: Rank which resume blocks belong on a tailored short resume for THIS job - not keep everything.

STEPS:
1. Read the job description AND the target-role plan (key factors, highlight/deprioritize lists, reframe guidance).
2. Score EVERY inventory entry and EVERY bullet on a harsh 0-10 scale:
   - 9-10: Direct evidence for a core job requirement or plan highlight
   - 7-8: Strong supporting evidence
   - 5-6: Weak/tangential overlap
   - 1-4: Little relevance (generic soft skills, unrelated work, plan deprioritize items)
   - 0: Irrelevant or empty
3. FORCE discrimination: at least ~40% of bullets must score <=4, and at most ~30% may score >=8. Do not cluster everything at 6-8.
4. Prefer scoring bullets individually. Still include one entry row per entry (entry score = best overall fit of that role).
5. Score duplicate bullets within the same entry lower. Do not let repeated wording/claims crowd out distinct evidence.
6. Education is fixed: do not score it, do not rewrite it, and do not reorder coursework/classes. The app keeps Education at the top.
7. Only Experience, Skills, Projects, and Leadership are generator-reworkable. Your scores should identify which of those blocks deserve space.
8. For Skills / Additional Information rows: keep categories that match keyFactors/skillsToHighlight; score unrelated skill categories low so the user can still un-hide them later.
9. The app will prioritize and pack selected reworkable content to fill at least one page when enough relevant resume detail exists.
10. Return ONLY a JSON array or an object with a scores array:
   [{"entryId":"...","bulletId":"","classId":"","score":0-10,"reason":""},{"entryId":"...","bulletId":"...","classId":"","score":0-10,"reason":"5-12 words"}]
11. Use exact inventory ids. Numbers only for score. Keep classId empty.`,

  'variant-rewrite': `FEATURE: Keyword rewrite for kept variant bullets
GOAL: Lightly retarget already-selected bullets toward the job - without lying.

STEPS:
1. Read the job description, the target-role plan (especially whatToRewrite and experiencesToReframe), any USER CLARIFICATIONS, and the bullet inventory.
2. For each bullet, decide if an honest keyword-aware rewrite helps. If not, skip it.
3. Prefer reframes that match the plan's targetingNotes. When USER CLARIFICATIONS are present, you may use those facts to complete a reframe — still do not invent beyond the resume plus clarifications.
4. Keep claims truthful; never add tools/metrics/employers absent from the original or clarifications.
5. Keep roughly the same length (<=32 words). Preserve action verb + task + impact.
6. Within the same entry/block, do not create two bullets that communicate the same task, tool, metric, or outcome. Keep the stronger distinct claim and skip the weaker duplicate.
7. Only rewrite Experience, Projects, and Leadership bullets. Do not rewrite Education, classes/coursework, summaries, awards, certifications, publications, or research.
8. Return ONLY a JSON array or an object with a rewrites array:
   [{"bulletId":"...","rewritten":"...","keywordsUsed":["..."]}]
9. Use exact bulletId values. Omit bullets you skip.`,

  'bullet-rewrite': `FEATURE: Single-bullet rewrite options
GOAL: Offer 3 stronger truthful rewrites of one bullet.

STEPS:
1. Read resume context and the original bullet.
2. Honor any user instruction if provided.
3. Produce exactly 3 alternatives, each action verb + task + impact, truthful, concise.
4. Return ONLY the 3 bullets, one per line - no numbering, no bullet markers, no intro.`,

  summary: `FEATURE: Professional summary
GOAL: Write a 2-sentence summary grounded only in the resume.

STEPS:
1. Scan roles, skills, and measurable wins in the resume text.
2. Write exactly 2 sentences, early-career friendly, ATS-safe, specific.
3. Do not invent experience. Return ONLY the summary text.`,

  'cover-letter': `FEATURE: Cover letter draft
GOAL: Draft a concise editable cover letter from resume + job description only.

STEPS:
1. Identify role, company cues, and matching evidence from the resume.
2. Write ~120-180 words: hook, 1-2 evidence paragraphs, short close.
3. No fake claims. Return ONLY the letter body text.`,

  'ats-keywords': `FEATURE: ATS keyword scan
GOAL: List top keywords from the job and whether the resume already has them.

STEPS:
1. Extract 15-20 high-signal keywords/phrases from the job (skills, tools, domain terms).
2. Check each against the resume text.
3. Return plain lines ONLY in this format:
   keyword | Found/Missing | Section
   (Section = suggested resume section if Missing, else the section where found)`,

  tailor: `FEATURE: In-place job tailoring suggestions
GOAL: Suggest selective bullet rewrites + skill emphasis + summary + short cover letter.

STEPS:
1. Match the job's must-haves to existing resume evidence.
2. Rewrite ONLY bullets that truly benefit (skip the rest). Return at most 10 bullet rewrites.
3. Do not return multiple rewrites from the same role that say the same thing. Preserve distinct evidence.
4. Pick emphasizedSkills / deprioritizedSkills only from skills already on the resume (max 8 each).
5. Write a 2-sentence tailored summary and a ~150-word cover letter - truth only.
6. Return ONLY JSON:
   {"emphasizedSkills":[],"deprioritizedSkills":[],"bulletRewrites":[{"bulletId":"...","rewritten":"..."}],"summary":"...","coverLetter":"..."}
7. Use exact bulletId values from the inventory.`,

  organize: `FEATURE: Organize / consolidate bullets
GOAL: Deduplicate and tighten via structured ops - no invented content.

STEPS:
1. Find redundant or overlapping bullets within each role.
2. Prefer consolidating into stronger bullets over deleting unique wins.
3. Return ONLY JSON: {"summary":"...","ops":[...]}
4. Allowed ops: set_entry_bullets, replace_bullet, delete_bullet, reorder_sections.
5. Use only catalog IDs.`,

  agent: `FEATURE: Freeform agent edits
GOAL: Apply the user's request via structured ops only.

STEPS:
1. Interpret the user request against the resume catalog.
2. Plan the smallest set of truthful ops that satisfy the request.
3. Return ONLY JSON: {"summary":"...","ops":[...]}
4. Allowed ops: replace_bullet, delete_bullet, set_entry_bullets, reorder_sections.
5. Use only catalog IDs. Never invent facts.`,

  'import-enrich': `FEATURE: Import enrichment / structure repair
GOAL: Correct structure of a preliminary parse without changing meaning.

STEPS:
1. Compare raw text to the preliminary parse.
2. Fix section typing, dates, contact fields, and entry grouping when clear.
3. Preserve original bullet wording exactly.
4. Return ONLY the specified JSON object shape. Omit unknown fields.`,

  'connection-test': `FEATURE: Connection test
STEPS:
1. Reply with exactly: OK
2. No other text.`,
};

/**
 * Build a provider prompt with universal rules + feature steps + task body.
 * Use this for every BYOK feature so all models get the same operating guide.
 * Writing features also receive The Sanitizer resume style rules.
 */
export function buildFeaturePrompt(feature: AiFeatureId, ...parts: Array<string | false | null | undefined>): string {
  return [
    UNIVERSAL_AI_RULES,
    WRITING_FEATURES.has(feature) ? RESUME_WRITING_RULES : '',
    FEATURE_STEPS[feature],
    ...parts.filter(Boolean),
  ]
    .filter(Boolean)
    .join('\n\n');
}

/** Short human labels for docs/UI. */
export const AI_FEATURE_LABELS: Record<AiFeatureId, string> = {
  'variant-plan': 'Generate variant - role plan',
  'variant-score': 'Generate variant - AI scoring',
  'variant-rewrite': 'Generate variant - keyword rewrite',
  'bullet-rewrite': 'AI drawer - bullet rewrite',
  summary: 'AI drawer - summary',
  'cover-letter': 'Cover letter',
  'ats-keywords': 'AI drawer - ATS keywords',
  tailor: 'Tailor to job',
  organize: 'AI drawer - organize',
  agent: 'AI drawer - agent',
  'import-enrich': 'Import AI enrichment',
  'connection-test': 'Test connection',
};
