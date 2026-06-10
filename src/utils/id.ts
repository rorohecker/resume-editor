// Lightweight collision-resistant ID helper. Prefers the platform UUID
// generator (available in all modern browsers over https/localhost and in
// file:// contexts) and falls back to a random+time string when crypto is
// unavailable (very old browsers, non-secure contexts).
export function makeId(): string {
  try {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID();
    }
    if (c && typeof c.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to the legacy generator below
  }
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36)
  );
}
