import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Bold, Italic, Underline as UnderlineIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface CoverLetterEditorProps {
  value: string;
  onChange: (plainText: string) => void;
  placeholder?: string;
}

/** TipTap editor for cover letters. Stores plain text (paragraphs → newlines) for export. */
export function CoverLetterEditor({ value, onChange, placeholder }: CoverLetterEditorProps) {
  const { t } = useTranslation();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,
        orderedList: false,
        listItem: false,
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
    ],
    content: plainToHtml(value),
    editorProps: {
      attributes: {
        class:
          'min-h-72 w-full rounded-md border border-paper-edge bg-paper px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent',
        spellcheck: 'true',
        'data-placeholder': placeholder ?? '',
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getText({ blockSeparator: '\n' }));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.getText({ blockSeparator: '\n' });
    if (current !== value) {
      editor.commands.setContent(plainToHtml(value), { emitUpdate: false });
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div>
      <div className="mb-1 flex gap-0.5">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title={t('rich.bold')}
        >
          <Bold size={12} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title={t('rich.italic')}
        >
          <Italic size={12} />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title={t('rich.underline')}
        >
          <UnderlineIcon size={12} />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} />
      <p className="mt-1 text-[10px] text-ink-subtle">{t('cover.richHint')}</p>
      <TemplateChips
        onInsert={(snippet) => {
          editor.chain().focus().insertContent(snippet).run();
        }}
      />
    </div>
  );
}

function TemplateChips({ onInsert }: { onInsert: (snippet: string) => void }) {
  const { t } = useTranslation();
  const templates = [
    { id: 'opening', label: t('cover.tplOpening'), text: t('cover.tplOpeningText') },
    { id: 'body', label: t('cover.tplBody'), text: t('cover.tplBodyText') },
    { id: 'close', label: t('cover.tplClose'), text: t('cover.tplCloseText') },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {templates.map((tpl) => (
        <button
          key={tpl.id}
          type="button"
          className="rounded-full border border-paper-edge bg-paper-tint px-2 py-0.5 text-[10px] text-ink hover:bg-paper-edge"
          onClick={() => onInsert(tpl.text)}
        >
          + {tpl.label}
        </button>
      ))}
    </div>
  );
}

function plainToHtml(value: string): string {
  if (!value.trim()) return '<p></p>';
  return value
    .split('\n')
    .map((line) => `<p>${escapeHtml(line) || '<br>'}</p>`)
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted hover:bg-paper-tint hover:text-ink ${
        active ? 'bg-paper-tint text-ink' : ''
      }`}
    >
      {children}
    </button>
  );
}
