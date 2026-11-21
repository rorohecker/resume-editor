import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  applyGrammarFix,
  checkGrammar,
  checkLocalSpelling,
  collectGrammarSnippets,
  GrammarCheckError,
} from './grammar';

describe('checkLocalSpelling', () => {
  it('flags common resume typos with replacements', () => {
    const hits = checkLocalSpelling([
      {
        bulletId: 'b1',
        bulletLabel: 'Exp',
        content: 'Recieved an award for managment of the projcet',
      },
    ]);
    expect(hits.length).toBeGreaterThanOrEqual(3);
    expect(hits.every((h) => h.category === 'spelling')).toBe(true);
    expect(hits.some((h) => h.replacements[0]?.toLowerCase().includes('receive'))).toBe(true);
    expect(hits.some((h) => h.replacements[0]?.toLowerCase() === 'management')).toBe(true);
  });

  it('ignores short or empty snippets', () => {
    expect(checkLocalSpelling([{ bulletId: 'x', bulletLabel: 'x', content: 'ok' }])).toEqual([]);
  });
});

describe('collectGrammarSnippets', () => {
  it('includes header, title lines, skills, and bullets', () => {
    const snippets = collectGrammarSnippets({
      header: { name: 'Jane Doe' },
      sections: [
        {
          id: 's1',
          title: 'Experience',
          type: 'experience',
          visible: true,
          entries: [
            {
              id: 'e1',
              title: 'Analyst',
              subtitle: 'Acme',
              bullets: [{ id: 'b1', content: 'Built dashboards', visible: true, order: 0 }],
            },
          ],
        },
        {
          id: 's2',
          title: 'Skills',
          type: 'skills',
          visible: true,
          entries: [{ id: 'e2', title: 'Languages', subtitle: 'Python, SQL' }],
        },
      ],
    });
    expect(snippets.some((s) => s.bulletId === '__header_name__')).toBe(true);
    expect(snippets.some((s) => s.bulletId === 'b1')).toBe(true);
    expect(snippets.some((s) => s.bulletId === '__skills_e2')).toBe(true);
    expect(snippets.some((s) => s.bulletId.startsWith('__entry_meta_'))).toBe(true);
  });
});

describe('checkGrammar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to local spelling when LanguageTool fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const hits = await checkGrammar([
      {
        bulletId: 'b1',
        bulletLabel: 'Exp',
        content: 'Definately improved team comunication.',
      },
    ]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.source === 'local')).toBe(true);
  });

  it('throws when remote fails and there are no local hits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(
      checkGrammar([{ bulletId: 'b1', bulletLabel: 'Exp', content: 'Led a clean project.' }]),
    ).rejects.toBeInstanceOf(GrammarCheckError);
  });

  it('applies a spelling fix into bullet content', () => {
    const resume = {
      header: { name: 'Ada' },
      sections: [
        {
          id: 's1',
          type: 'experience',
          entries: [
            {
              id: 'e1',
              title: 'Role',
              bullets: [{ id: 'b1', content: 'Recieved praise for the work' }],
            },
          ],
        },
      ],
    };
    const hit = checkLocalSpelling([
      { bulletId: 'b1', bulletLabel: 'Role', content: 'Recieved praise for the work' },
    ])[0];
    expect(hit).toBeTruthy();
    const next = applyGrammarFix(resume, hit!, hit!.replacements[0]);
    expect(next?.sections[0].entries[0].bullets?.[0].content.toLowerCase()).toContain('received');
  });

  it('maps LanguageTool matches into hits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          matches: [
            {
              message: 'This sentence does not start with an uppercase letter.',
              shortMessage: 'Capitalization',
              offset: 0,
              length: 3,
              context: { text: 'led a team', offset: 0, length: 3 },
              replacements: [{ value: 'Led' }],
              rule: { id: 'UPPERCASE_SENTENCE_START', issueType: 'grammar', category: { id: 'CASING' } },
            },
          ],
        }),
      })),
    );
    const hits = await checkGrammar([
      { bulletId: 'b1', bulletLabel: 'Exp', content: 'led a team', sectionId: 's1', entryId: 'e1' },
    ]);
    expect(hits[0]?.category).toBe('grammar');
    expect(hits[0]?.replacements).toEqual(['Led']);
    expect(hits[0]?.sectionId).toBe('s1');
  });
});
