/**
 * Test-only helpers for the twist sweep: the twist-angle limits as `docs/BOOK_IMPROVEMENTS.md`
 * states them, kept as candidate predicates that tests compare with the solver.
 *
 * They are NOT used to filter a sweep. The book is not in the repo, and as transcribed these limits
 * disagree with the solver on the shipped twists (docs/PLAN.md 7.3d and 8.1), so the solver stays
 * the ground truth and the sweep test pins where the two differ.
 */

import { checkedMul } from "../lattice/eisenstein";
import type { PiFraction } from "../gadgets/twist-limits";

/** The sign of a − b for two angles with positive denominators. */
function compare(a: PiFraction, b: PiFraction): number {
  return Math.sign(checkedMul(a.num, b.den) - checkedMul(b.num, a.den));
}

/** The notes' limits for a regular n-gon twist of angle α. */
export type NotesLimits = {
  /** Eq. 3.11 as transcribed: two creases of one corner alike (mm or vv) need α ≤ 180° − 360°/n. */
  readonly alike: boolean;
  /** Eq. 3.12 as transcribed: two creases of one corner unlike (mv or vm) need α < 360°/n. */
  readonly unlike: boolean;
  /** Thm 17 as transcribed: a cyclic stacking needs min(α, 180° − α) > 360°/n. */
  readonly cyclicStacking: boolean;
};

/**
 * Evaluates the notes' three limits (angles as multiples of π: 180° − 360°/n is (n − 2)/n and
 * 360°/n is 2/n).
 *
 * @param n - number of sides
 * @param alpha - the twist angle
 */
export function notesLimits(n: number, alpha: PiFraction): NotesLimits {
  const exterior = { num: 2, den: n };
  const supplement = { num: alpha.den - alpha.num, den: alpha.den };
  const smaller = compare(alpha, supplement) <= 0 ? alpha : supplement;
  return {
    alike: compare(alpha, { num: n - 2, den: n }) <= 0,
    unlike: compare(alpha, exterior) < 0,
    cyclicStacking: compare(smaller, exterior) > 0,
  };
}

/**
 * Do the notes' Eqs. 3.11 and 3.12 allow a pleat word, reading them as limits on the two creases
 * at each corner?
 *
 * With every pleat anto (its two creases opposite), corner k holds the first crease of pleat k and
 * the second of pleat k − 1, which is the opposite of that pleat's first. So the two creases are
 * alike exactly when the word's letters at k − 1 and k differ.
 *
 * @param n - number of sides
 * @param alpha - the twist angle
 * @param word - the pleat word, one 0 or 1 per pleat
 */
export function notesAllowWord(n: number, alpha: PiFraction, word: string): boolean {
  const limits = notesLimits(n, alpha);
  for (let k = 0; k < n; k++) {
    const alike = word[k] !== word[(k + n - 1) % n];
    if (alike ? !limits.alike : !limits.unlike) return false;
  }
  return true;
}
