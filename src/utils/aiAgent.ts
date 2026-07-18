import type { Bullet, Resume } from '@/types';
import { makeId } from '@/utils/id';
import { collectBullets, resumeToPlainText, stripHtml } from '@/utils/resumeText';

export type AgentOp =
  | { op: 'replace_bullet'; bulletId: string; content: string }
  | { op: 'delete_bullet'; bulletId: string }
  | { op: 'set_entry_bullets'; entryId: string; bullets: string[] }
  | { op: 'reorder_sections'; sectionIds: string[] };

export interface AgentPlan {
  summary: string;
  ops: AgentOp[];
}

const AGENT_SYSTEM_RULES = [
  'You control a local resume editor through structured JSON operations only.',
  'Never invent employers, degrees, dates, metrics, tools, or achievements that are not supported by the resume.',
  'Prefer consolidating redundant bullets over deleting unique accomplishments.',
  'Keep bullets truthful, concise, and ATS-friendly (action verb + task + impact when possible).',
  'Use only IDs provided in the catalog. Do not invent IDs.',
].join(' ');

export function promptForReorganize(resume: Resume, userInstruction: string, standingInstructions: string): string {
  const catalog = buildBulletCatalog(resume);
  return [
    AGENT_SYSTEM_RULES,
    standingInstructions ? `Standing user instructions:\n${standingInstructions}` : '',
    'Task: Reorganize and consolidate resume bullets.',
    'Merge overlapping bullets, drop pure duplicates, tighten wording, and improve order within each role.',
    userInstruction ? `Additional request:\n${userInstruction}` : '',
    'Return ONLY valid JSON with this shape:',
    '{"summary":"short explanation","ops":[{"op":"set_entry_bullets","entryId":"...","bullets":["..."]},{"op":"replace_bullet","bulletId":"...","content":"..."},{"op":"delete_bullet","bulletId":"..."},{"op":"reorder_sections","sectionIds":["..."]}]}',
    'Prefer set_entry_bullets when rewriting a whole role. Use replace_bullet / delete_bullet for small edits.',
    `Bullet catalog:\n${catalog}`,
    `Full resume text:\n${resumeToPlainText(resume)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function promptForAgentControl(
  resume: Resume,
  userMessage: string,
  standingInstructions: string,
): string {
  const catalog = buildBulletCatalog(resume);
  return [
    AGENT_SYSTEM_RULES,
    standingInstructions ? `Standing user instructions:\n${standingInstructions}` : '',
    'Task: Apply the user request by editing the resume through ops.',
    `User request:\n${userMessage}`,
    'Return ONLY valid JSON with this shape:',
    '{"summary":"short explanation","ops":[...]}',
    'Allowed ops: replace_bullet, delete_bullet, set_entry_bullets, reorder_sections.',
    `Bullet catalog:\n${catalog}`,
    `Section order (current):\n${resume.sections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((section) => `${section.id} | ${section.title}`)
      .join('\n')}`,
    `Full resume text:\n${resumeToPlainText(resume)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseAgentPlan(raw: string): AgentPlan {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) throw new Error('AI did not return a JSON plan.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('AI returned invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('AI plan was empty.');
  const record = parsed as { summary?: unknown; ops?: unknown };
  const opsRaw = Array.isArray(record.ops) ? record.ops : [];
  const ops = opsRaw.map(normalizeOp).filter((op): op is AgentOp => Boolean(op));
  if (ops.length === 0) throw new Error('AI plan contained no usable operations.');
  return {
    summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : 'Applied AI edits.',
    ops,
  };
}

export function applyAgentPlan(resume: Resume, plan: AgentPlan): { resume: Resume; applied: number } {
  let next = resume;
  let applied = 0;
  for (const op of plan.ops) {
    const before = next;
    next = applyOp(next, op);
    if (next !== before) applied += 1;
  }
  return { resume: next, applied };
}

function applyOp(resume: Resume, op: AgentOp): Resume {
  switch (op.op) {
    case 'replace_bullet': {
      let found = false;
      const sections = resume.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => ({
          ...entry,
          bullets: entry.bullets?.map((bullet) => {
            if (bullet.id !== op.bulletId) return bullet;
            found = true;
            return { ...bullet, content: op.content };
          }),
        })),
      }));
      return found ? { ...resume, sections } : resume;
    }
    case 'delete_bullet': {
      let found = false;
      const sections = resume.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          const before = entry.bullets?.length ?? 0;
          const bullets = entry.bullets?.filter((bullet) => bullet.id !== op.bulletId);
          if ((bullets?.length ?? 0) !== before) found = true;
          return { ...entry, bullets };
        }),
      }));
      return found ? { ...resume, sections } : resume;
    }
    case 'set_entry_bullets': {
      let found = false;
      const bullets: Bullet[] = op.bullets
        .map((content) => content.trim())
        .filter(Boolean)
        .map((content, order) => ({
          id: makeId(),
          content,
          visible: true,
          order,
        }));
      const sections = resume.sections.map((section) => ({
        ...section,
        entries: section.entries.map((entry) => {
          if (entry.id !== op.entryId) return entry;
          found = true;
          return { ...entry, bullets };
        }),
      }));
      return found ? { ...resume, sections } : resume;
    }
    case 'reorder_sections': {
      const orderMap = new Map(op.sectionIds.map((id, index) => [id, index]));
      const known = resume.sections.filter((section) => orderMap.has(section.id));
      if (known.length === 0) return resume;
      const unknown = resume.sections.filter((section) => !orderMap.has(section.id));
      const reordered = [
        ...known.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0)),
        ...unknown,
      ].map((section, order) => ({ ...section, order }));
      return { ...resume, sections: reordered };
    }
    default:
      return resume;
  }
}

function normalizeOp(value: unknown): AgentOp | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const op = raw.op;
  if (op === 'replace_bullet') {
    if (typeof raw.bulletId !== 'string' || typeof raw.content !== 'string') return null;
    const content = raw.content.trim();
    if (!content) return null;
    return { op, bulletId: raw.bulletId, content };
  }
  if (op === 'delete_bullet') {
    if (typeof raw.bulletId !== 'string') return null;
    return { op, bulletId: raw.bulletId };
  }
  if (op === 'set_entry_bullets') {
    if (typeof raw.entryId !== 'string' || !Array.isArray(raw.bullets)) return null;
    const bullets = raw.bullets
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (bullets.length === 0) return null;
    return { op, entryId: raw.entryId, bullets };
  }
  if (op === 'reorder_sections') {
    if (!Array.isArray(raw.sectionIds)) return null;
    const sectionIds = raw.sectionIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));
    if (sectionIds.length === 0) return null;
    return { op, sectionIds };
  }
  return null;
}

function buildBulletCatalog(resume: Resume): string {
  const bullets = collectBullets(resume);
  const byEntry = new Map<string, typeof bullets>();
  for (const bullet of bullets) {
    const list = byEntry.get(bullet.entryId) ?? [];
    list.push(bullet);
    byEntry.set(bullet.entryId, list);
  }
  const lines: string[] = [];
  for (const [entryId, entryBullets] of byEntry) {
    const head = entryBullets[0];
    lines.push(`ENTRY ${entryId} | ${head.sectionTitle} | ${head.entryTitle}`);
    for (const bullet of entryBullets) {
      lines.push(`  BULLET ${bullet.bulletId}: ${stripHtml(bullet.content)}`);
    }
  }
  return lines.join('\n') || '(no bullets)';
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith('{')) return inner;
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}
