import { useEffect } from 'react';

// Global stack of Esc handlers. The top of the stack (the most recently
// activated modal/drawer) is the only one that responds to Escape, so stacked
// dialogs unwind one at a time instead of all collapsing at once.

const stack: Array<() => void> = [];
let listenerInstalled = false;

function ensureGlobalListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const top = stack[stack.length - 1];
    if (!top) return;
    event.stopPropagation();
    top();
  });
}

export function useEscape(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    ensureGlobalListener();
    stack.push(onEscape);
    return () => {
      const index = stack.lastIndexOf(onEscape);
      if (index !== -1) stack.splice(index, 1);
    };
  }, [active, onEscape]);
}
