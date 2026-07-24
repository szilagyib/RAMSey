/**
 * Boolean-ish environment flags.
 *
 * Operators type `0`, `no` and `off` as readily as `false`, and a feature switch
 * that silently ignores them is a footgun — so accept every obvious spelling in
 * both directions, and fall back to the caller's default for anything else.
 */
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

export function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  const value = (raw ?? '').trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  return fallback;
}
