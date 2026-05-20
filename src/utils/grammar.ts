// LanguageTool integration — free public API at languagetool.org/api. CORS
// enabled. Rate-limited but generous enough for casual use. No key required.
// We send only the plain text of each bullet (no PII beyond resume content).

const LANGUAGE_TOOL_URL = 'https://api.languagetool.org/v2/check';

export interface GrammarHit {
  bulletId: string;
  bulletLabel: string;
  message: string;
  shortMessage: string;
  offset: number;
  length: number;
  context: string;
  replacements: string[];
  rule: string;
}

interface RawMatch {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  context?: { text: string; offset: number; length: number };
  replacements: { value: string }[];
  rule?: { id: string };
}

export async function checkGrammar(
  bullets: { bulletId: string; bulletLabel: string; content: string }[],
  language = 'en-US',
): Promise<GrammarHit[]> {
  const hits: GrammarHit[] = [];
  for (const bullet of bullets) {
    const text = bullet.content.replace(/<[^>]*>/g, '').trim();
    if (!text || text.length < 8) continue;
    try {
      const body = new URLSearchParams({ text, language, level: 'default' });
      const response = await fetch(LANGUAGE_TOOL_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { matches?: RawMatch[] };
      for (const match of data.matches ?? []) {
        hits.push({
          bulletId: bullet.bulletId,
          bulletLabel: bullet.bulletLabel,
          message: match.message,
          shortMessage: match.shortMessage ?? match.message,
          offset: match.offset,
          length: match.length,
          context: match.context?.text ?? text,
          replacements: match.replacements.slice(0, 4).map((r) => r.value),
          rule: match.rule?.id ?? '',
        });
      }
    } catch {
      // Network failures are non-fatal; skip and move on.
    }
  }
  return hits;
}
