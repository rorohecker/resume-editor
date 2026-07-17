import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { WEAK_LANGUAGE } from '@/utils/aiAssist';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Non-persistent TipTap decorations that underline weak resume phrases.
 * Click handling lives in RichBulletEditor (popover with replacements).
 */
export const WeakLanguageHighlight = Extension.create({
  name: 'weakLanguageHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('weakLanguageHighlight'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const weak of WEAK_LANGUAGE) {
                const re = new RegExp(`\\b${escapeRegex(weak.phrase)}\\b`, 'gi');
                let match: RegExpExecArray | null;
                while ((match = re.exec(node.text)) !== null) {
                  const from = pos + match.index;
                  const to = from + match[0].length;
                  decorations.push(
                    Decoration.inline(from, to, {
                      class: 'weak-language-mark',
                      'data-phrase': weak.phrase,
                      title: `Weak phrasing: "${weak.phrase}" — click for stronger options`,
                    }),
                  );
                }
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
