// Clipboard helpers that degrade gracefully. `navigator.clipboard` is only
// available in secure contexts and is frequently missing on the file:// single
// -file build, so we fall back to the legacy execCommand path and never throw.

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // Ignore — reading isn't supported without user permission / secure context.
  }
  return null;
}
