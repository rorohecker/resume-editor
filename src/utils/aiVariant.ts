import { generateAiText, type AiSettings, type JsonSchema } from './aiByok';
import {
  applyVisibility,
  fitToPages,
  listAllBlocks,
  localScoreBlocks,
  type BlockScore,
  type FitResult,
  type VisibilityMap,
} from './blockSelection';
import { buildFeaturePrompt } from './aiGuides';
import {
  formatCompanyResearchForPrompt,
  type CompanyRoleResearch,
} from './companyResearch';
import { stripHtml, resumeToPlainText } from './resumeText';
import { semanticMarkersForText, semanticScoreBlocks } from './semanticScoring';
import { estimatePageUsage } from './styleChecks';
import type { Resume } from '@/types';

const SCORE_TASK = `You score each resume block for relevance to a job description and company/role research.
Return ONLY JSON (no commentary, no fences). Prefer this object shape:
{ "scores": [
  { "entryId": "...", "bulletId": "", "classId": "", "score": 0-10, "reason": "" },
  { "entryId": "...", "bulletId": "...", "classId": "", "score": 0-10, "reason": "..." }
] }
- Score 10 = highly relevant; 0 = irrelevant.
- Follow the TARGET ROLE PLAN and COMPANY & ROLE RESEARCH when deciding what to highlight vs deprioritize.
- Only score Experience, Skills, Projects, and Leadership inventory rows.
- Do not score or rework Education; the app keeps Education fixed at the top.
- Include EVERY entry and EVERY bullet from the inventory (bullet rows must include bulletId).
- Prefer scoring bullets individually; still include an entry row for each entry.
- If two bullets in the same entry say the same thing, score the weaker duplicate lower.
- "reason" is optional, 5-12 words for bullets if you want to explain why it is useful (or not).
- For entry-only rows, set "bulletId", "classId", and "reason" to empty strings.
- For bullet rows, set "classId" to an empty string.
- Do not invent ids; use the exact ids provided.
- Scores must be numbers, not strings.`;

const REWRITE_TASK = `You rewrite selected resume bullets so they better match a company and job.
Return ONLY JSON (no commentary, no fences). Prefer this object shape:
{ "rewrites": [
  { "bulletId": "...", "rewritten": "...", "keywordsUsed": ["keyword"], "whyUseful": "...", "reframeAngle": "..." }
] }

Rules:
- Read FULL BULLET CONTEXT first to infer how experiences relate and what can be reframed.
- Only emit rewrites for BULLETS TO REWRITE ids.
- Follow the TARGET ROLE PLAN and COMPANY & ROLE RESEARCH for what to rewrite and how to reframe.
- Keep every claim truthful - never invent employers, metrics, tools, or outcomes.
- Weave in relevant keywords from the job description only when they honestly fit the original work.
- Use XYZ form: verb-bank action verb + task/project + result/impact; roughly the same length (at most ~32 words).
- Quantify only with metrics present in the source or clarifications; imply skill/tool/domain through the work — no soft-skill fluff.
- Skip a bullet entirely if no honest keyword-aware rewrite helps.
- whyUseful: one short sentence on why this bullet belongs on the tailored resume.
- reframeAngle: how you angled the bullet toward the company/role.
- Use the exact bulletId values provided.
- Only rewrite bullets from Experience, Projects, or Leadership sections.
- Within the same entry/block, do not produce two bullets that say the same thing; keep the stronger claim distinct or skip the weaker duplicate.`;

const AI_HIGH_SCORE = 8;
const AI_LOW_SCORE = 4;
const SCORE_CHUNK_ROW_LIMIT = 32;
const VARIANT_REWORKABLE_SECTION_TYPES = new Set<Resume['sections'][number]['type']>([
  'experience',
  'skills',
  'projects',
  'leadership',
]);
const VARIANT_PINNED_TOP_SECTION_TYPES = new Set<Resume['sections'][number]['type']>([
  'education',
]);

type ListedBlocks = ReturnType<typeof listAllBlocks>;

interface ScoreEntryItem {
  entryId: string;
  section: string;
  title?: string;
  subtitle?: string;
  tags?: string[];
}

interface ScoreBulletItem {
  entryId: string;
  bulletId: string;
  content: string;
  tags?: string[];
}

interface ScoreClassItem {
  entryId: string;
  classId: string;
  fieldKey: string;
  label: string;
  value: string;
}

interface ScoreInventory {
  entries: ScoreEntryItem[];
  bullets: ScoreBulletItem[];
  classes: ScoreClassItem[];
}

const SCORE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          entryId: { type: 'string' },
          bulletId: { type: 'string' },
          classId: { type: 'string' },
          score: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['entryId', 'bulletId', 'classId', 'score', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

const REWRITE_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    rewrites: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bulletId: { type: 'string' },
          rewritten: { type: 'string' },
          keywordsUsed: { type: 'array', items: { type: 'string' } },
          whyUseful: { type: 'string' },
          reframeAngle: { type: 'string' },
        },
        required: ['bulletId', 'rewritten', 'keywordsUsed', 'whyUseful', 'reframeAngle'],
        additionalProperties: false,
      },
    },
  },
  required: ['rewrites'],
  additionalProperties: false,
};

const PLAN_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    targetRole: { type: 'string' },
    keyFactors: { type: 'array', items: { type: 'string' } },
    skillsToHighlight: { type: 'array', items: { type: 'string' } },
    experiencesToReframe: { type: 'array', items: { type: 'string' } },
    whatToRewrite: { type: 'array', items: { type: 'string' } },
    whatToDeprioritize: { type: 'array', items: { type: 'string' } },
    targetingNotes: { type: 'string' },
    clarifyingQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          question: { type: 'string' },
          why: { type: 'string' },
          topic: { type: 'string' },
        },
        required: ['id', 'question', 'why', 'topic'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'targetRole',
    'keyFactors',
    'skillsToHighlight',
    'experiencesToReframe',
    'whatToRewrite',
    'whatToDeprioritize',
    'targetingNotes',
    'clarifyingQuestions',
  ],
  additionalProperties: false,
};

export interface VariantBulletRewrite {
  bulletId: string;
  original: string;
  rewritten: string;
  keywordsUsed: string[];
  whyUseful: string;
  reframeAngle: string;
}

export interface ClarifyingQuestion {
  id: string;
  question: string;
  why: string;
  topic: string;
}

export interface VariantRolePlan {
  targetRole: string;
  keyFactors: string[];
  skillsToHighlight: string[];
  experiencesToReframe: string[];
  whatToRewrite: string[];
  whatToDeprioritize: string[];
  targetingNotes: string;
  clarifyingQuestions: ClarifyingQuestion[];
}

export interface ClarifyingAnswer {
  questionId: string;
  answer: string;
}


/** Skills / custom / "Additional Information" sections users can manually unhide in the preview. */
export function isManualVisibilitySection(section: Resume['sections'][number]): boolean {
  if (section.type === 'skills' || section.type === 'custom') return true;
  return /additional\s*information|additional\s*info|&\s*skills/i.test(section.title);
}

/** Ensure every entry/bullet id exists on the map so preview toggles never invent missing keys. */
export function coverVisibilityMap(resume: Resume, map: VisibilityMap): VisibilityMap {
  const entries = { ...map.entries };
  const bullets = { ...map.bullets };
  for (const section of resume.sections) {
    for (const entry of section.entries) {
      if (!(entry.id in entries)) entries[entry.id] = entry.visible !== false;
      for (const bullet of entry.bullets ?? []) {
        if (!(bullet.id in bullets)) bullets[bullet.id] = bullet.visible;
      }
    }
  }
  return { entries, bullets };
}

export function formatRolePlanForPrompt(
  plan: VariantRolePlan,
  answers: ClarifyingAnswer[] = [],
  research?: CompanyRoleResearch | null,
): string {
  const { clarifyingQuestions, ...planBody } = plan;
  const answered = answers
    .filter((item) => item.answer.trim())
    .map((item) => {
      const question = clarifyingQuestions.find((q) => q.id === item.questionId);
      return {
        questionId: item.questionId,
        topic: question?.topic ?? '',
        question: question?.question ?? '',
        answer: item.answer.trim(),
      };
    });
  return [
    research ? formatCompanyResearchForPrompt(research) : '',
    `--- TARGET ROLE PLAN ---\n${JSON.stringify(planBody, null, 2)}`,
    answered.length > 0
      ? `--- USER CLARIFICATIONS (use these details when scoring/rewriting; do not invent beyond them) ---\n${JSON.stringify(answered, null, 2)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function localVariantRolePlan(jobDescription: string): VariantRolePlan {
  const text = jobDescription.replace(/\s+/g, ' ').trim();
  const roleMatch = text.match(
    /(?:position|role|title)\s*[:\-–]\s*([^.\n]{3,80})|seeking an?\s+([^.\n]{3,80})|hire an?\s+([^.\n]{3,80})/i,
  );
  const targetRole =
    (roleMatch?.[1] || roleMatch?.[2] || roleMatch?.[3] || '').trim() ||
    text.split(/[.!\n]/)[0]?.slice(0, 80).trim() ||
    'Target role';
  const tokens = [...new Set(text.toLowerCase().match(/[a-z][a-z0-9+#.]{2,}/g) ?? [])]
    .filter((token) => !LOCAL_PLAN_STOP.has(token))
    .slice(0, 8);
  return {
    targetRole,
    keyFactors: tokens.slice(0, 6).map((token) => token.replace(/^./, (c) => c.toUpperCase())),
    skillsToHighlight: tokens.slice(0, 5),
    experiencesToReframe: [
      'Lead with outcomes that match the job’s top tools and domain terms',
      'Keep recent, measurable work ahead of generic responsibilities',
    ],
    whatToRewrite: [
      'Angle kept bullets toward the job’s must-have keywords when truthful',
      'Prefer action + task + impact phrasing',
    ],
    whatToDeprioritize: [
      'Generic soft-skill bullets with no job overlap',
      'Unrelated activities and duplicate claims',
    ],
    targetingNotes:
      'Prioritize blocks that overlap the job’s key tokens. Keep Education fixed. Hide weak Skills/Additional Information categories unless the user unhides them.',
    clarifyingQuestions: [],
  };
}

const LOCAL_PLAN_STOP = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'our', 'are', 'will', 'this', 'that',
  'from', 'have', 'has', 'been', 'were', 'was', 'able', 'into', 'about', 'over',
  'role', 'job', 'team', 'work', 'working', 'experience', 'required', 'requirements',
  'responsibilities', 'qualifications', 'preferred', 'must', 'should', 'including',
]);

export async function planVariantForRole(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
  research?: CompanyRoleResearch | null,
): Promise<VariantRolePlan> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const bulletInventory = buildFullBulletInventory(resume);
  const prompt = buildFeaturePrompt(
    'variant-plan',
    research ? formatCompanyResearchForPrompt(research) : '',
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- RESUME SNAPSHOT ---\n${resumeToPlainText(resume).slice(0, 6000)}`,
    `--- FULL BULLET INVENTORY (infer context + reframes from these; do not invent facts) ---\n${JSON.stringify(bulletInventory, null, 2)}`,
  );

  let raw: string;
  try {
    raw = await generateAiText(settings, prompt, 2200, {
      cache: false,
      jsonSchema: { name: 'resume_variant_role_plan', schema: PLAN_SCHEMA },
    });
  } catch (error) {
    if (!isStructuredOutputCompatibilityError(error)) throw error;
    raw = await generateAiText(settings, prompt, 2200, { cache: false });
  }

  const parsed = parseLooseJsonObject(raw);
  if (!parsed) return localVariantRolePlan(jobDescription);
  return normalizeRolePlan(parsed, jobDescription);
}

function normalizeRolePlan(raw: Record<string, unknown>, jobDescription: string): VariantRolePlan {
  const fallback = localVariantRolePlan(jobDescription);
  const list = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key];
      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .map((item) => item.trim())
          .slice(0, 8);
      }
    }
    return [] as string[];
  };
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return '';
  };
  return {
    targetRole: text('targetRole', 'target_role', 'role') || fallback.targetRole,
    keyFactors: nonempty(list('keyFactors', 'key_factors', 'factors'), fallback.keyFactors),
    skillsToHighlight: nonempty(
      list('skillsToHighlight', 'skills_to_highlight', 'highlightSkills'),
      fallback.skillsToHighlight,
    ),
    experiencesToReframe: nonempty(
      list('experiencesToReframe', 'experiences_to_reframe', 'reframe'),
      fallback.experiencesToReframe,
    ),
    whatToRewrite: nonempty(
      list('whatToRewrite', 'what_to_rewrite', 'rewrite'),
      fallback.whatToRewrite,
    ),
    whatToDeprioritize: nonempty(
      list('whatToDeprioritize', 'what_to_deprioritize', 'deprioritize'),
      fallback.whatToDeprioritize,
    ),
    targetingNotes: text('targetingNotes', 'targeting_notes', 'notes') || fallback.targetingNotes,
    clarifyingQuestions: normalizeClarifyingQuestions(raw.clarifyingQuestions ?? raw.questions),
  };
}

function normalizeClarifyingQuestions(value: unknown): ClarifyingQuestion[] {
  if (!Array.isArray(value)) return [];
  const out: ClarifyingQuestion[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const question =
      typeof row.question === 'string'
        ? row.question.trim()
        : typeof row.prompt === 'string'
          ? row.prompt.trim()
          : '';
    if (!question) return;
    const id =
      typeof row.id === 'string' && row.id.trim()
        ? row.id.trim()
        : `q${index + 1}`;
    out.push({
      id,
      question,
      why:
        typeof row.why === 'string' && row.why.trim()
          ? row.why.trim()
          : typeof row.reason === 'string' && row.reason.trim()
            ? row.reason.trim()
            : 'Needed to reframe honestly for this role.',
      topic:
        typeof row.topic === 'string' && row.topic.trim()
          ? row.topic.trim()
          : typeof row.experience === 'string' && row.experience.trim()
            ? row.experience.trim()
            : 'Experience',
    });
  });
  return out.slice(0, 5);
}

function nonempty(value: string[], fallback: string[]): string[] {
  return value.length > 0 ? value : fallback;
}

export async function scoreBlocksWithAi(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
  plan?: VariantRolePlan,
  answers: ClarifyingAnswer[] = [],
  research?: CompanyRoleResearch | null,
): Promise<BlockScore[]> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');

  const allBlocks = listAllBlocks(resume);
  const blocks = variantScorableBlocks(allBlocks);
  if (blocks.entries.length === 0 && blocks.bullets.length === 0) {
    throw new Error('This resume has no Experience, Skills, Projects, or Leadership blocks to score.');
  }

  const rolePlan = plan ?? localVariantRolePlan(jobDescription);
  const semanticScores = filterVariantReworkableScores(resume, semanticScoreBlocks(resume, jobDescription));
  const semanticMarkers = semanticMarkersForText(jobDescription);
  const inventories = buildScoreInventories(blocks);

  const parsedRows: unknown[] = [];
  for (let index = 0; index < inventories.length; index += 1) {
    const parsed = await scoreInventoryChunkWithAi(
      settings,
      jobDescription,
      inventories[index]!,
      semanticMarkers,
      index + 1,
      inventories.length,
      rolePlan,
      answers,
      research,
    );
    if (parsed) parsedRows.push(...parsed);
  }

  if (parsedRows.length === 0) {
    const fallback =
      semanticScores.length > 0
        ? semanticScores
        : filterVariantReworkableScores(resume, localScoreBlocks(resume, jobDescription));
    return calibrateAiBlockScores(fallback, resume, jobDescription);
  }

  const knownEntries = new Set(blocks.entries.map(({ entry }) => entry.id));
  const knownBullets = new Set(blocks.bullets.map(({ bullet }) => bullet.id));
  const knownClasses = new Map(blocks.classes.map((item) => [item.classId, item]));
  const bulletParent = new Map(blocks.bullets.map(({ entry, bullet }) => [bullet.id, entry.id]));

  const scores: BlockScore[] = [];
  for (const item of parsedRows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const bulletIdRaw = readString(row, 'bulletId', 'bullet_id', 'bulletID', 'bullet');
    const bulletId = bulletIdRaw && knownBullets.has(bulletIdRaw) ? bulletIdRaw : undefined;
    const classIdRaw = readString(row, 'classId', 'class_id', 'courseId', 'course_id', 'class');
    const classBlock = classIdRaw ? knownClasses.get(classIdRaw) : undefined;
    const classId = classBlock?.classId;
    const explicitEntryId = readString(row, 'entryId', 'entry_id', 'entryID', 'entry', 'blockId', 'block_id');
    const entryId =
      (bulletId ? (bulletParent.get(bulletId) ?? '') : '') ||
      classBlock?.entry.id ||
      explicitEntryId ||
      '';
    if (!entryId || !knownEntries.has(entryId)) continue;
    const scoreNum = readNumber(row, 'score', 'relevanceScore', 'relevance_score', 'rating', 'fit', 'fitScore');
    if (!Number.isFinite(scoreNum)) continue;
    scores.push({
      entryId,
      bulletId,
      classId,
      score: Math.max(0, Math.min(10, scoreNum)),
      reason: readString(row, 'reason', 'rationale', 'explanation') || undefined,
    });
  }

  if (scores.length === 0) {
    const fallback =
      semanticScores.length > 0
        ? semanticScores
        : filterVariantReworkableScores(resume, localScoreBlocks(resume, jobDescription));
    return calibrateAiBlockScores(fallback, resume, jobDescription);
  }

  const uniqueScores = dedupeScores(scores);
  return calibrateAiBlockScores(
    fuseScoresWithSemantic(fillMissingScores(uniqueScores, semanticScores), semanticScores),
    resume,
    jobDescription,
  );
}

/** Rewrite included bullets with job keywords. Only touches the provided bullet IDs. */
export async function rewriteVariantBulletsWithAi(
  settings: AiSettings,
  resume: Resume,
  jobDescription: string,
  bulletIds: string[],
  plan?: VariantRolePlan,
  answers: ClarifyingAnswer[] = [],
  research?: CompanyRoleResearch | null,
): Promise<VariantBulletRewrite[]> {
  if (!settings.apiKey.trim()) throw new Error('Add a BYOK API key first.');
  if (!jobDescription.trim()) throw new Error('Paste a job description first.');
  if (bulletIds.length === 0) return [];

  const wanted = new Set(bulletIds);
  const fullContextRaw = buildFullBulletInventory(resume);
  // Prefer sibling bullets from selected entries so context stays useful under token limits.
  const selectedEntryIds = new Set(
    fullContextRaw.filter((item) => wanted.has(item.bulletId)).map((item) => item.entryId),
  );
  const prioritizedContext = [
    ...fullContextRaw.filter((item) => selectedEntryIds.has(item.entryId)),
    ...fullContextRaw.filter((item) => !selectedEntryIds.has(item.entryId)),
  ].slice(0, 80);
  const inventory: { bulletId: string; section: string; entry: string; content: string }[] = [];
  for (const section of resume.sections) {
    if (!isVariantBulletRewriteSection(section)) continue;
    for (const entry of section.entries) {
      for (const bullet of entry.bullets ?? []) {
        if (!wanted.has(bullet.id)) continue;
        inventory.push({
          bulletId: bullet.id,
          section: section.title,
          entry: entry.title || entry.subtitle || section.title,
          content: stripHtml(bullet.content),
        });
      }
    }
  }
  if (inventory.length === 0) return [];

  // Cap payload size so rewrite stays reliable on smaller models.
  const batch = inventory.slice(0, 40);
  const rolePlan = plan ?? localVariantRolePlan(jobDescription);
  const prompt = buildFeaturePrompt(
    'variant-rewrite',
    REWRITE_TASK,
    formatRolePlanForPrompt(rolePlan, answers, research),
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- FULL BULLET CONTEXT (read all; infer reframes; do not rewrite ids outside BULLETS TO REWRITE) ---\n${JSON.stringify(prioritizedContext, null, 2)}`,
    `--- BULLETS TO REWRITE ---\n${JSON.stringify(batch, null, 2)}`,
  );

  let raw: string;
  try {
    raw = await generateAiText(settings, prompt, 4500, {
      cache: false,
      jsonSchema: { name: 'resume_variant_rewrites', schema: REWRITE_SCHEMA },
    });
  } catch (error) {
    if (!isStructuredOutputCompatibilityError(error)) throw error;
    raw = await generateAiText(settings, prompt, 4500, { cache: false });
  }
  const parsed = parseLooseJsonArray(raw);
  if (!parsed) throw new Error('Provider returned malformed rewrite JSON.');

  const byId = new Map(batch.map((item) => [item.bulletId, item]));
  const out: VariantBulletRewrite[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const bulletId = typeof row.bulletId === 'string' ? row.bulletId : '';
    const rewritten = typeof row.rewritten === 'string' ? row.rewritten.trim() : '';
    if (!bulletId || !rewritten || !byId.has(bulletId)) continue;
    const original = byId.get(bulletId)!.content;
    if (rewritten === original) continue;
    out.push({
      bulletId,
      original,
      rewritten,
      keywordsUsed: Array.isArray(row.keywordsUsed)
        ? row.keywordsUsed
            .filter((kw): kw is string => typeof kw === 'string' && kw.trim().length > 0)
            .map((kw) => kw.trim())
            .slice(0, 6)
        : [],
      whyUseful:
        typeof row.whyUseful === 'string'
          ? row.whyUseful.trim()
          : typeof row.why_useful === 'string'
            ? row.why_useful.trim()
            : '',
      reframeAngle:
        typeof row.reframeAngle === 'string'
          ? row.reframeAngle.trim()
          : typeof row.reframe_angle === 'string'
            ? row.reframe_angle.trim()
            : '',
    });
  }
  return out;
}

export function fitVariantToPages(
  resume: Resume,
  scores: BlockScore[],
  maxPages: number,
): FitResult {
  const variantResume = withPinnedVariantSections(resume);
  const variantScores = filterVariantReworkableScores(variantResume, scores);
  const initialVisibility = buildVariantBaseVisibility(variantResume);

  const primary = fitToPages(variantResume, variantScores, {
    maxPages,
    targetUsage: 94,
    selectivity: 'balanced',
    initialVisibility,
  });
  const availableUsage = estimatePageUsage(
    applyVisibility(variantResume, buildVariantAvailableVisibility(variantResume)),
  );
  const minimumUsefulPage = 88;
  if (primary.estimatedUsage >= minimumUsefulPage || availableUsage < minimumUsefulPage) {
    return primary;
  }

  const generous = fitToPages(variantResume, variantScores, {
    maxPages,
    targetUsage: 98,
    selectivity: 'generous',
    minScore: 0,
    maxBulletsPerEntry: 8,
    initialVisibility,
  });

  return generous.estimatedUsage > primary.estimatedUsage ? generous : primary;
}

export function buildPrioritizedVariantResume(
  resume: Resume,
  visibility: VisibilityMap,
  scores: BlockScore[],
): Resume {
  const visibleResume = applyVisibility(withPinnedVariantSections(resume), visibility);
  const priority = buildPriorityLookup(scores);

  const sections = visibleResume.sections.map((section) => {
    if (!isVariantReworkableSection(section)) return section;
    const entries = section.entries.map((entry) => {
      const bullets = prioritizeAndDedupeBullets(entry.bullets ?? [], priority.bulletById);
      return { ...entry, bullets };
    });
    return {
      ...section,
      entries: [...entries].sort((a, b) => {
        const av = a.visible !== false ? 1 : 0;
        const bv = b.visible !== false ? 1 : 0;
        return bv - av || priority.entryScore(b.id) - priority.entryScore(a.id);
      }).map((entry, order) => ({ ...entry, order })),
    };
  });

  return {
    ...visibleResume,
    sections: [...sections].sort((a, b) => {
      const ap = isVariantPinnedTopSection(a) ? 1 : 0;
      const bp = isVariantPinnedTopSection(b) ? 1 : 0;
      return bp - ap || a.order - b.order;
    }).map((section, order) => ({ ...section, order })),
  };
}

function buildVariantBaseVisibility(resume: Resume): VisibilityMap {
  const entries: Record<string, boolean> = {};
  const bullets: Record<string, boolean> = {};
  for (const section of resume.sections) {
    const preserve = !isVariantReworkableSection(section);
    for (const entry of section.entries) {
      entries[entry.id] = preserve ? entry.visible !== false : false;
      for (const bullet of entry.bullets ?? []) {
        bullets[bullet.id] = preserve ? bullet.visible : false;
      }
    }
  }
  return { entries, bullets };
}

function buildVariantAvailableVisibility(resume: Resume): VisibilityMap {
  const visibility = buildVariantBaseVisibility(resume);
  for (const section of resume.sections) {
    if (!isVariantReworkableSection(section)) continue;
    for (const entry of section.entries) {
      visibility.entries[entry.id] = true;
      for (const bullet of entry.bullets ?? []) visibility.bullets[bullet.id] = true;
    }
  }
  return visibility;
}

function variantScorableBlocks(blocks: ListedBlocks): ListedBlocks {
  return {
    entries: blocks.entries.filter(({ section }) => isVariantReworkableSection(section)),
    bullets: blocks.bullets.filter(({ section }) => isVariantReworkableSection(section)),
    classes: [],
  };
}

function filterVariantReworkableScores(resume: Resume, scores: BlockScore[]): BlockScore[] {
  const entryIds = new Set<string>();
  const bulletIds = new Set<string>();
  for (const section of resume.sections) {
    if (!isVariantReworkableSection(section)) continue;
    for (const entry of section.entries) {
      entryIds.add(entry.id);
      for (const bullet of entry.bullets ?? []) bulletIds.add(bullet.id);
    }
  }

  return scores.filter((score) => {
    if (!entryIds.has(score.entryId)) return false;
    if (score.classId) return false;
    return !score.bulletId || bulletIds.has(score.bulletId);
  });
}

function withPinnedVariantSections(resume: Resume): Resume {
  return {
    ...resume,
    sections: resume.sections.map((section) =>
      isVariantPinnedTopSection(section) ? { ...section, visible: true } : section,
    ),
  };
}

function isVariantReworkableSection(section: Resume['sections'][number]): boolean {
  return VARIANT_REWORKABLE_SECTION_TYPES.has(section.type);
}

function isVariantPinnedTopSection(section: Resume['sections'][number]): boolean {
  return VARIANT_PINNED_TOP_SECTION_TYPES.has(section.type);
}

function isVariantBulletRewriteSection(section: Resume['sections'][number]): boolean {
  return section.type === 'experience' || section.type === 'projects' || section.type === 'leadership';
}

/** All Experience/Projects/Leadership bullets for planner + rewriter context. */
export function buildFullBulletInventory(resume: Resume): {
  bulletId: string;
  section: string;
  entryId: string;
  entry: string;
  content: string;
}[] {
  const inventory: {
    bulletId: string;
    section: string;
    entryId: string;
    entry: string;
    content: string;
  }[] = [];
  for (const section of resume.sections) {
    if (!isVariantBulletRewriteSection(section)) continue;
    for (const entry of section.entries) {
      for (const bullet of entry.bullets ?? []) {
        inventory.push({
          bulletId: bullet.id,
          section: section.title,
          entryId: entry.id,
          entry: entry.title || entry.subtitle || section.title,
          content: stripHtml(bullet.content),
        });
      }
    }
  }
  return inventory.slice(0, 120);
}

function buildPriorityLookup(scores: BlockScore[]): {
  bulletById: Map<string, number>;
  classById: Map<string, number>;
  entryScore: (entryId: string) => number;
} {
  const entryById = new Map<string, number>();
  const bulletById = new Map<string, number>();
  const classById = new Map<string, number>();

  for (const score of scores) {
    const current = entryById.get(score.entryId) ?? 0;
    if (score.score > current) entryById.set(score.entryId, score.score);
    if (score.bulletId) {
      const prev = bulletById.get(score.bulletId) ?? 0;
      if (score.score > prev) bulletById.set(score.bulletId, score.score);
    }
    if (score.classId) {
      const prev = classById.get(score.classId) ?? 0;
      if (score.score > prev) classById.set(score.classId, score.score);
    }
  }

  return {
    bulletById,
    classById,
    entryScore: (entryId: string) => entryById.get(entryId) ?? 0,
  };
}

function prioritizeAndDedupeBullets(
  bullets: NonNullable<Resume['sections'][number]['entries'][number]['bullets']>,
  bulletById: Map<string, number>,
) {
  const sorted = [...bullets].sort((a, b) => {
    const av = a.visible ? 1 : 0;
    const bv = b.visible ? 1 : 0;
    return bv - av || (bulletById.get(b.id) ?? 0) - (bulletById.get(a.id) ?? 0) || a.order - b.order;
  });
  const keptVisible: string[] = [];
  return sorted.map((bullet, order) => {
    const plain = stripHtml(bullet.content);
    const duplicate = bullet.visible && keptVisible.some((kept) => isDuplicateBullet(plain, kept));
    if (bullet.visible && !duplicate) keptVisible.push(plain);
    return {
      ...bullet,
      visible: bullet.visible && !duplicate,
      order,
    };
  });
}

function isDuplicateBullet(a: string, b: string): boolean {
  const aTokens = bulletTokens(a);
  const bTokens = bulletTokens(b);
  if (aTokens.size < 4 || bTokens.size < 4) return false;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  const jaccard = overlap / new Set([...aTokens, ...bTokens]).size;
  return overlap >= 5 && jaccard >= 0.62;
}

function bulletTokens(text: string): Set<string> {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'from',
    'that',
    'this',
    'into',
    'while',
    'using',
    'used',
    'across',
    'team',
    'teams',
  ]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9+#%\s]/g, ' ')
      .split(/\s+/)
      .map(normalizeBulletToken)
      .filter((token) => token.length > 2 && !stop.has(token)),
  );
}

function normalizeBulletToken(token: string): string {
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) {
    const stem = token.slice(0, -2);
    return stem.endsWith('c') ? `${stem}e` : stem;
  }
  if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function buildScoreInventories(blocks: ListedBlocks): ScoreInventory[] {
  const chunks: ScoreInventory[] = [];
  let current: ScoreInventory = { entries: [], bullets: [], classes: [] };
  const bulletsByEntry = new Map<string, ScoreBulletItem[]>();
  const classesByEntry = new Map<string, ScoreClassItem[]>();

  for (const { entry, bullet } of blocks.bullets) {
    const next = bulletsByEntry.get(entry.id) ?? [];
    next.push({
      entryId: entry.id,
      bulletId: bullet.id,
      content: stripHtml(bullet.content),
      tags: bullet.tags,
    });
    bulletsByEntry.set(entry.id, next);
  }
  for (const item of blocks.classes) {
    const next = classesByEntry.get(item.entry.id) ?? [];
    next.push({
      entryId: item.entry.id,
      classId: item.classId,
      fieldKey: item.fieldKey,
      label: item.label,
      value: item.value,
    });
    classesByEntry.set(item.entry.id, next);
  }

  const flush = () => {
    if (current.entries.length === 0 && current.bullets.length === 0 && current.classes.length === 0) return;
    chunks.push(current);
    current = { entries: [], bullets: [], classes: [] };
  };

  for (const { section, entry } of blocks.entries) {
    const entryItem: ScoreEntryItem = {
      entryId: entry.id,
      section: section.title,
      title: entry.title,
      subtitle: entry.subtitle,
      tags: entry.tags,
    };
    const bulletItems = bulletsByEntry.get(entry.id) ?? [];
    const classItems = classesByEntry.get(entry.id) ?? [];
    const rowCount = 1 + bulletItems.length + classItems.length;

    if (rowCount > SCORE_CHUNK_ROW_LIMIT) {
      flush();
      const bulletLimit = Math.max(1, SCORE_CHUNK_ROW_LIMIT - 1);
      const childItems = [
        ...bulletItems.map((item) => ({ kind: 'bullet' as const, item })),
        ...classItems.map((item) => ({ kind: 'class' as const, item })),
      ];
      for (let offset = 0; offset < childItems.length; offset += bulletLimit) {
        const slice = childItems.slice(offset, offset + bulletLimit);
        const sliceBullets: ScoreBulletItem[] = [];
        const sliceClasses: ScoreClassItem[] = [];
        for (const child of slice) {
          if (child.kind === 'bullet') sliceBullets.push(child.item);
          else sliceClasses.push(child.item);
        }
        chunks.push({
          entries: [entryItem],
          bullets: sliceBullets,
          classes: sliceClasses,
        });
      }
      if (childItems.length === 0) chunks.push({ entries: [entryItem], bullets: [], classes: [] });
      continue;
    }

    const currentRows = current.entries.length + current.bullets.length + current.classes.length;
    if (currentRows > 0 && currentRows + rowCount > SCORE_CHUNK_ROW_LIMIT) flush();
    current.entries.push(entryItem);
    current.bullets.push(...bulletItems);
    current.classes.push(...classItems);
  }

  flush();
  return chunks.length > 0 ? chunks : [{ entries: [], bullets: [], classes: [] }];
}

async function scoreInventoryChunkWithAi(
  settings: AiSettings,
  jobDescription: string,
  inventory: ScoreInventory,
  semanticMarkers: string[],
  chunkIndex: number,
  chunkCount: number,
  plan: VariantRolePlan,
  answers: ClarifyingAnswer[] = [],
  research?: CompanyRoleResearch | null,
): Promise<unknown[] | null> {
  const prompt = buildFeaturePrompt(
    'variant-score',
    SCORE_TASK,
    formatRolePlanForPrompt(plan, answers, research),
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- LOCAL SEMANTIC MARKERS ---\n${JSON.stringify(semanticMarkers)}`,
    `--- BLOCK INVENTORY CHUNK ${chunkIndex} OF ${chunkCount} ---\n${JSON.stringify(inventory, null, 2)}`,
  );

  let raw: string;
  try {
    raw = await generateAiText(settings, prompt, 3200, {
      cache: false,
      jsonSchema: { name: 'resume_variant_scores', schema: SCORE_SCHEMA },
    });
  } catch (error) {
    if (!isStructuredOutputCompatibilityError(error)) throw error;
    raw = await generateAiText(settings, prompt, 3200, { cache: false });
  }

  let parsed = parseLooseJsonArray(raw);
  if (!parsed) {
    raw = await generateAiText(
      settings,
      retryScorePrompt(jobDescription, inventory, semanticMarkers, plan, answers, research),
      3200,
      { cache: false },
    );
    parsed = parseLooseJsonArray(raw);
  }
  return parsed;
}

function dedupeScores(scores: BlockScore[]): BlockScore[] {
  const byKey = new Map<string, BlockScore>();
  for (const score of scores) {
    const key = scoreKey(score);
    const existing = byKey.get(key);
    if (!existing || score.score > existing.score) byKey.set(key, score);
  }
  return [...byKey.values()];
}

function fillMissingScores(scores: BlockScore[], fallbackScores: BlockScore[]): BlockScore[] {
  const out = [...scores];
  const seen = new Set(out.map(scoreKey));
  for (const fallback of fallbackScores) {
    const key = scoreKey(fallback);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...fallback,
      score: Math.min(fallback.bulletId ? 6.5 : 7, Math.max(1, fallback.score)),
      reason: fallback.reason ?? 'Semantic fallback score',
    });
  }
  return out;
}

function fuseScoresWithSemantic(scores: BlockScore[], semanticScores: BlockScore[]): BlockScore[] {
  const semanticByKey = new Map(semanticScores.map((score) => [scoreKey(score), score]));
  return scores.map((score) => {
    const semantic = semanticByKey.get(scoreKey(score));
    if (!semantic) return { ...score, score: clampScore(score.score) };
    return {
      ...score,
      score: clampScore(score.score * 0.74 + semantic.score * 0.26),
      reason: score.reason ?? semantic.reason,
    };
  });
}

function retryScorePrompt(
  jobDescription: string,
  inventory: unknown,
  semanticMarkers: string[],
  plan: VariantRolePlan,
  answers: ClarifyingAnswer[] = [],
  research?: CompanyRoleResearch | null,
): string {
  return buildFeaturePrompt(
    'variant-score',
    'Your last scoring response could not be parsed by JSON.parse.',
    'Return ONLY compact valid JSON now. No markdown, no comments, no prose.',
    'Required shape: {"scores":[{"entryId":"...","bulletId":"","classId":"","score":0,"reason":""}]}',
    'Only score Experience, Skills, Projects, and Leadership rows from the inventory.',
    'Do not score Education or classes/coursework; keep classId as an empty string.',
    'For entry rows, use empty strings for bulletId, classId, and reason.',
    'For bullet rows, use the exact bulletId from the inventory.',
    formatRolePlanForPrompt(plan, answers, research),
    `--- JOB DESCRIPTION ---\n${jobDescription}`,
    `--- LOCAL SEMANTIC MARKERS ---\n${JSON.stringify(semanticMarkers)}`,
    `--- BLOCK INVENTORY ---\n${JSON.stringify(inventory, null, 2)}`,
  );
}

function isStructuredOutputCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /json_schema|response_schema|responseJsonSchema|responseMimeType|output_config|structured output|unsupported.*schema|invalid.*schema|invalid.*parameter|unknown name.*response/i.test(
    message,
  );
}

/**
 * AI models sometimes return non-discriminating scores ("everything is 7-9").
 * Resume packing needs contrast, so calibrate clustered AI output with a ranked
 * curve and a light local keyword tie-breaker. Well-spread model scores are left
 * intact except for normal 0-10 clamping.
 */
export function calibrateAiBlockScores(
  scores: BlockScore[],
  resume: Resume,
  jobDescription: string,
): BlockScore[] {
  if (scores.length <= 2) return scores.map((score) => ({ ...score, score: clampScore(score.score) }));

  const clamped = scores.map((score, index) => ({
    ...score,
    index,
    score: clampScore(score.score),
  }));
  const values = clamped.map((score) => score.score);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const highShare = values.filter((score) => score >= AI_HIGH_SCORE).length / values.length;
  const lowShare = values.filter((score) => score <= AI_LOW_SCORE).length / values.length;
  const range = max - min;
  const needsCalibration =
    range < 2 ||
    min >= 5 ||
    highShare > 0.35 ||
    lowShare < 0.25;

  if (!needsCalibration) {
    return clamped.map(toBlockScore);
  }

  const localByKey = new Map<string, number>();
  for (const local of localScoreBlocks(resume, jobDescription)) {
    localByKey.set(scoreKey(local), clampScore(local.score));
  }

  const ranked = clamped
    .map((score) => {
      const local = localByKey.get(scoreKey(score)) ?? 0;
      return {
        ...score,
        sortScore: score.score * 0.72 + local * 0.28,
      };
    })
    .sort((a, b) => b.sortScore - a.sortScore || a.index - b.index);

  const calibrated = new Map<number, number>();
  for (let rank = 0; rank < ranked.length; rank += 1) {
    const row = ranked[rank]!;
    calibrated.set(row.index, scoreForRank(rank, ranked.length));
  }

  return clamped.map((score) => toBlockScore({ ...score, score: calibrated.get(score.index) ?? score.score }));
}

function toBlockScore(score: BlockScore & { index?: number; sortScore?: number }): BlockScore {
  return {
    entryId: score.entryId,
    bulletId: score.bulletId,
    classId: score.classId,
    score: score.score,
    reason: score.reason,
  };
}

function scoreForRank(rank: number, total: number): number {
  if (total <= 1) return 8;
  const p = rank / (total - 1);
  let score: number;
  if (p < 0.12) {
    score = 9.4 - (p / 0.12) * 1.1;
  } else if (p < 0.3) {
    score = 8 - ((p - 0.12) / 0.18) * 1.2;
  } else if (p < 0.6) {
    score = 6.2 - ((p - 0.3) / 0.3) * 2.2;
  } else {
    score = 3.8 - ((p - 0.6) / 0.4) * 3;
  }
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function scoreKey(score: Pick<BlockScore, 'entryId' | 'bulletId' | 'classId'>): string {
  if (score.classId) return `${score.entryId}:class:${score.classId}`;
  return score.bulletId ? `${score.entryId}:${score.bulletId}` : score.entryId;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}

function readString(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function readNumber(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return NaN;
}

export function parseLooseJsonArray(text: string): unknown[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  for (const candidate of jsonCandidates(trimmed)) {
    const parsed = tryParseJsonArray(candidate);
    if (parsed) return parsed;
  }

  // Last resort: recover individual score/rewrite objects even when the outer
  // wrapper is truncated or glued together with prose.
  const recovered = recoverResultRows(trimmed);
  return recovered.length > 0 ? recovered : null;
}

export function parseLooseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const candidate of jsonCandidates(trimmed)) {
    for (const repaired of repairJsonCandidates(candidate)) {
      try {
        const data = JSON.parse(repaired);
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          return data as Record<string, unknown>;
        }
      } catch {
        // try next
      }
    }
  }
  return null;
}

function tryParseJsonArray(candidate: string): unknown[] | null {
  for (const repaired of repairJsonCandidates(candidate)) {
    try {
      const extracted = extractResultArray(JSON.parse(repaired));
      if (extracted && extracted.length > 0) return extracted;
    } catch {
      // try next repair
    }
  }
  return null;
}

function jsonCandidates(trimmed: string): string[] {
  const candidates = new Set<string>();
  candidates.add(trimmed);
  candidates.add(trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) candidates.add(fenced[1].trim());

  const objectCandidate = balancedJsonSlice(trimmed, '{', '}');
  if (objectCandidate) candidates.add(objectCandidate);
  const arrayCandidate = balancedJsonSlice(trimmed, '[', ']');
  if (arrayCandidate) candidates.add(arrayCandidate);

  // Truncated payloads: take from first { or [ through the end and let repairs close it.
  const firstBrace = trimmed.search(/[\[{]/);
  if (firstBrace >= 0) candidates.add(trimmed.slice(firstBrace));

  return [...candidates].filter(Boolean);
}

/** Normalize common model JSON defects before JSON.parse. */
function repairJsonCandidates(raw: string): string[] {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ')
    .trim();

  const out = new Set<string>();
  out.add(cleaned);

  // Strip // and /* */ comments outside strings (rough but helpful).
  out.add(
    cleaned
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/\/\*[\s\S]*?\*\//g, ''),
  );

  // Trailing commas before ] or }.
  out.add(cleaned.replace(/,\s*([}\]])/g, '$1'));

  // Python / JS literals some models emit.
  out.add(
    cleaned
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false'),
  );

  // Single-quoted keys: {'entryId': 'x'} → {"entryId": "x"} (best-effort).
  out.add(
    cleaned.replace(/([{,]\s*)'([^'\\]+)'(\s*:)/g, '$1"$2"$3').replace(/:\s*'([^'\\]*)'/g, ': "$1"'),
  );

  // Close truncated objects/arrays when the model hits the token limit mid-JSON.
  out.add(closeTruncatedJson(cleaned.replace(/,\s*([}\]])/g, '$1')));

  return [...out].filter(Boolean);
}

function closeTruncatedJson(text: string): string {
  let inString = false;
  let escaped = false;
  const stack: Array<'{' | '['> = [];
  for (const char of text) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{' || char === '[') stack.push(char);
    if (char === '}' || char === ']') stack.pop();
  }

  let repaired = text;
  if (inString) repaired += '"';
  // Drop a dangling trailing comma or colon before we close.
  repaired = repaired.replace(/[,:]\s*$/, '');
  while (stack.length > 0) {
    const open = stack.pop();
    repaired += open === '{' ? '}' : ']';
  }
  return repaired;
}

function recoverResultRows(text: string): unknown[] {
  const rows: unknown[] = [];
  const seen = new Set<string>();
  const objectPattern = /\{[^{}]*"(?:entryId|entry_id|bulletId|bullet_id|score|rewritten)"[^{}]*\}/g;
  for (const match of text.match(objectPattern) ?? []) {
    for (const repaired of repairJsonCandidates(match)) {
      try {
        const value = JSON.parse(repaired);
        if (!looksLikeResultRow(value)) continue;
        const key = JSON.stringify(value);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(value);
        break;
      } catch {
        // try next repair
      }
    }
  }
  return rows;
}

function balancedJsonSlice(text: string, open: '{' | '[', close: '}' | ']'): string | null {
  const start = text.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === open) depth += 1;
    if (char === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function extractResultArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const preferredKeys = [
    'scores',
    'scoreRows',
    'blockScores',
    'entryScores',
    'bulletScores',
    'blocks',
    'items',
    'results',
    'rewrites',
    'bullets',
    'entries',
  ];

  const combined: unknown[] = [];
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) combined.push(...value);
    else if (value && typeof value === 'object') {
      const nested = extractResultArray(value);
      if (nested) combined.push(...nested);
    }
  }
  if (combined.length > 0) return combined;

  const arrays = collectResultArrays(record);
  return arrays.length > 0 ? arrays.flat() : null;
}

function collectResultArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) {
    return value.some(looksLikeResultRow) ? [value] : value.flatMap(collectResultArrays);
  }
  if (!value || typeof value !== 'object') return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectResultArrays);
}

function looksLikeResultRow(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    'score' in row ||
    'rewritten' in row ||
    'entryId' in row ||
    'entry_id' in row ||
    'bulletId' in row ||
    'bullet_id' in row ||
    'classId' in row ||
    'class_id' in row
  );
}
