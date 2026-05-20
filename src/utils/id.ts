// Lightweight ID helper. Replaced with nanoid() when §12 imports section lands.
export function makeId(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36).slice(-4)
  );
}
