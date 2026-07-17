import type { Editor } from '@tiptap/react';

// Tracks the TipTap instance that currently has focus so the editor shell can
// prefer ProseMirror undo/redo when available, then fall back to resume history.
let focused: Editor | null = null;

export function setFocusedRichEditor(editor: Editor | null): void {
  focused = editor;
}

export function getFocusedRichEditor(): Editor | null {
  return focused;
}
