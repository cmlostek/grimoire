/**
 * Shared HP bar color thresholds.
 *
 * Centralized so every surface (character sheet, party page, initiative,
 * map tokens, party tooltip) reads from the same scale and can't drift.
 */

/** Tailwind class for an HP fill bar. Uses the modern emerald/amber/rose
 *  palette to match the rest of the dark UI. */
export function hpBarClass(pct: number): string {
  if (pct > 50) return 'bg-emerald-600';
  if (pct > 25) return 'bg-amber-500';
  return 'bg-rose-600';
}

/** Same thresholds, returned as a raw color hex — for places (e.g. SVG
 *  fills, inline styles) where a Tailwind class won't work. */
export function hpBarColor(pct: number): string {
  if (pct > 50) return '#059669'; // emerald-600
  if (pct > 25) return '#f59e0b'; // amber-500
  return '#e11d48';               // rose-600
}

/** Convenience: compute the percentage from current/max in one place. */
export function hpPercent(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  return Math.max(0, Math.min(100, (hp / maxHp) * 100));
}
