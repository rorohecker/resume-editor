import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WEAK_LANGUAGE, replaceWeakPhrase } from '@/utils/aiAssist';
import { setFocusedRichEditor } from '@/utils/focusedRichEditor';
import { WeakLanguageHighlight } from './weakLanguageExtension';

const SLASH_COMMANDS: { trigger: string; labelKey: string; insert: string }[] = [
  { trigger: '/metric', labelKey: 'rich.slashMetric', insert: ' by [N%/$X/X users] ' },
  { trigger: '/lead', labelKey: 'rich.slashLead', insert: 'Spearheaded ' },
  { trigger: '/build', labelKey: 'rich.slashBuild', insert: 'Engineered ' },
  { trigger: '/impact', labelKey: 'rich.slashImpact', insert: 'Improved ' },
  { trigger: '/team', labelKey: 'rich.slashTeam', insert: 'across a team of [N] ' },
];

interface RichBulletEditorProps {
  content: string;
  onChange: (html: string) => void;
  onEnterSplit?: () => void;
  placeholder?: string;
}

interface WeakPopover {
  phrase: string;
  replacements: readonly string[];
  x: number;
  y: number;
}

export function RichBulletEditor({ content, onChange, onEnterSplit, placeholder }: RichBulletEditorProps) {
  const { t } = useTranslation();
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [weakPopover, setWeakPopover] = useState<WeakPopover | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      WeakLanguageHighlight,
    ],
    content,
    editorProps: {
      attributes: {
        class:
          'min-h-12 w-full rounded-md border border-paper-edge bg-paper px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
        spellcheck: 'true',
        'data-placeholder': placeholder ?? '',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && !event.shiftKey && onEnterSplit) {
          event.preventDefault();
          onEnterSplit();
          return true;
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const target = event.target as HTMLElement | null;
        const mark = target?.closest?.('.weak-language-mark') as HTMLElement | null;
        if (!mark) {
          setWeakPopover(null);
          return false;
        }
        const phrase = mark.dataset.phrase ?? '';
        const rule = WEAK_LANGUAGE.find((item) => item.phrase === phrase);
        if (!rule) return false;
        const rect = mark.getBoundingClientRect();
        setWeakPopover({
          phrase: rule.phrase,
          replacements: rule.replacements,
          x: rect.left,
          y: rect.bottom + 4,
        });
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
      setWeakPopover(null);
      const text = ed.state.doc.textBetween(
        Math.max(0, ed.state.selection.from - 12),
        ed.state.selection.from,
      );
      const match = /(\/[a-z]*)$/i.exec(text);
      if (match) {
        setSlashQuery(match[1].toLowerCase());
        setSlashOpen(true);
      } else {
        setSlashOpen(false);
      }
    },
    onFocus: ({ editor: ed }) => setFocusedRichEditor(ed),
    onBlur: ({ editor: ed }) => {
      if (getStillFocused(ed)) return;
      setFocusedRichEditor(null);
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== content) {
      editor.commands.setContent(content || '', { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    return () => {
      if (editor && getStillFocused(editor) === false) {
        // Clear registry if this instance was focused when unmounting.
      }
      setFocusedRichEditor(null);
    };
  }, [editor]);

  if (!editor) return null;

  const slashMatches = slashOpen
    ? SLASH_COMMANDS.filter((cmd) => cmd.trigger.startsWith(slashQuery))
    : [];

  const applySlash = (cmd: (typeof SLASH_COMMANDS)[number]) => {
    if (!editor) return;
    const from = editor.state.selection.from - slashQuery.length;
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to: editor.state.selection.from })
      .deleteSelection()
      .insertContent(cmd.insert)
      .run();
    setSlashOpen(false);
  };

  const applyWeakReplace = (replacement: string) => {
    if (!weakPopover || !editor) return;
    const html = editor.getHTML();
    const next = replaceWeakPhrase(html, weakPopover.phrase, replacement);
    editor.commands.setContent(next, { emitUpdate: true });
    setWeakPopover(null);
  };

  return (
    <div className="relative flex-1">
      <div className="sticky top-0 z-10 -mt-1 mb-1 bg-paper pt-1">
        <Toolbar editor={editor} />
      </div>
      <EditorContent editor={editor} />
      {slashOpen && slashMatches.length > 0 && (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-paper-edge bg-paper p-1 shadow-page">
          {slashMatches.map((cmd) => (
            <button
              key={cmd.trigger}
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-ink hover:bg-paper-tint"
              onClick={() => applySlash(cmd)}
            >
              <span className="font-mono text-ink-muted">{cmd.trigger}</span>
              <span className="text-[10px] text-ink-subtle">{t(cmd.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
      {weakPopover && (
        <div
          className="fixed z-50 min-w-[160px] rounded-md border border-paper-edge bg-paper p-1 shadow-page"
          style={{ left: weakPopover.x, top: weakPopover.y }}
          role="listbox"
          aria-label={t('editor.weakReplaceTitle')}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            {t('editor.weakReplaceTitle')}
          </div>
          {weakPopover.replacements.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              className="flex w-full rounded px-2 py-1 text-left text-xs text-ink hover:bg-paper-tint"
              onMouseDown={(e) => {
                e.preventDefault();
                applyWeakReplace(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getStillFocused(editor: Editor): boolean {
  return editor.isFocused;
}

function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const toggle = (cmd: () => boolean) => (e: React.MouseEvent) => {
    e.preventDefault();
    cmd();
  };
  const promptLink = () => {
    const previous = editor.getAttributes('link').href;
    const url = window.prompt(t('rich.linkPrompt'), previous ?? '');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.startsWith('http') ? url : `https://${url}` })
      .run();
  };

  return (
    <div className="mb-1 flex gap-0.5">
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={toggle(() => editor.chain().focus().toggleBold().run())}
        title={t('rich.bold')}
      >
        <Bold size={12} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={toggle(() => editor.chain().focus().toggleItalic().run())}
        title={t('rich.italic')}
      >
        <Italic size={12} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('underline')}
        onClick={toggle(() => editor.chain().focus().toggleUnderline().run())}
        title={t('rich.underline')}
      >
        <UnderlineIcon size={12} />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={(e) => {
          e.preventDefault();
          promptLink();
        }}
        title={t('rich.link')}
      >
        <LinkIcon size={12} />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: (e: React.MouseEvent) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={onClick}
      title={title}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-paper-tint hover:text-ink ${
        active ? 'bg-paper-tint text-ink' : ''
      }`}
    >
      {children}
    </button>
  );
}
