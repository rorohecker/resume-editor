import type { KeyboardEvent } from 'react';

// Handler for Alt+↑/↓ on a focused list item. Calls `onMove(-1)` to move up,
// `onMove(1)` to move down. Used by section / entry / bullet rows so a
// keyboard-only user can reorder lists without grabbing the drag handle.

export function reorderKeyHandler(onMove: (delta: -1 | 1) => void) {
  return (event: KeyboardEvent) => {
    if (!event.altKey) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onMove(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onMove(1);
    }
  };
}
