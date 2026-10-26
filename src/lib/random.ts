/**
 * A random, collision-free id (RFC 4122 version 4 UUID) for players,
 * tournaments, matches and games.
 *
 * Runs on the server and in the browser (bracket previews are generated
 * client-side). `crypto.randomUUID` only exists in secure contexts, so plain
 * HTTP on a LAN address falls back to building the same UUID from
 * `crypto.getRandomValues`, which is available everywhere.
 */
export function newId(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Returns a shuffled copy (Fisher–Yates), with every order equally likely.
 * Prefer this to `sort(() => Math.random() - 0.5)`, which is biased.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
