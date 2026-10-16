/**
 * Entry ids.
 *
 * Entries only ever live on one phone, so an id needs to be unique within one
 * log, not across the world — no UUID dependency for that. The time part keeps
 * ids roughly sortable when eyeballing storage; the counter covers two entries
 * made in the same millisecond (a test, or a fast double-tap), where the random
 * part alone would only make a collision unlikely rather than impossible.
 */

let counter = 0;

export function newId(): string {
  counter = (counter + 1) % 1296;
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, '0');
  return `${Date.now().toString(36)}-${counter.toString(36).padStart(2, '0')}${random}`;
}
