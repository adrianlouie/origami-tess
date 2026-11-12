/**
 * Necklaces: crease words counted and compared up to rotation.
 *
 * Sits at the "solve" stage of the data flow, beside the M/V solver. A vertex type, or the pleat
 * assignment of a twist, is a cyclic word read counter-clockwise with no fixed starting point
 * (Lang §1.2.6, §3.1), so two words that differ by a rotation are the same assignment. This module
 * counts those classes and gives each one a canonical representative, so tests and the sweeps of
 * step 8.1 can de-duplicate assignments. Everything is exact integer arithmetic.
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), Eq. 3.1 and Table 3.1; the count is
 * Burnside's lemma for the cyclic group Cₙ acting on binary words (Pólya enumeration).
 */

import { checkedAdd, checkedMul } from "../lattice/eisenstein";
import { gcd } from "../lattice/direction";

/** Euler's totient φ(k): how many of 1..k are coprime to k. */
function totient(k: number): number {
  let count = 0;
  for (let i = 1; i <= k; i++) if (gcd(i, k) === 1) count++;
  return count;
}

/**
 * Counts the binary necklaces of length n: M/V words up to rotation.
 *
 * Formula: N(n) = (1/n) Σ_{d | n} 2^d φ(n/d) (Lang Eq. 3.1), where φ is Euler's totient. By
 * Burnside's lemma N(n) is the average over the n rotations of the number of words each one fixes;
 * a rotation by k fixes 2^gcd(k, n) words, and grouping the rotations by d = gcd(k, n) gives
 * φ(n/d) rotations for each divisor d. N(3..12) = 4, 6, 8, 14, 20, 36, 60, 108, 188, 352
 * (Table 3.1).
 *
 * @param n - word length, a positive integer
 * @throws RangeError for a non-positive or non-integer n, and when 2^n leaves the exact range
 *   (n ≥ 53), because the sum is exact only below 2⁵³
 */
export function necklaceCount(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`A necklace needs a positive integer length, got ${n}`);
  }
  let sum = 0;
  for (let d = 1; d <= n; d++) {
    if (n % d !== 0) continue;
    let power = 1;
    for (let i = 0; i < d; i++) power = checkedMul(power, 2);
    sum = checkedAdd(sum, checkedMul(power, totient(n / d)));
  }
  return sum / n;
}

/**
 * The lexicographically least rotation of a word.
 *
 * Two words are rotations of each other exactly when their canonical rotations are equal, so the
 * result is a key for de-duplicating cyclic assignments. The word is compared entry by entry as
 * numbers; the check is O(n²), fine for the n ≤ 12 sides of a twist.
 *
 * @param word - the symbols, for example 0 for mountain and 1 for valley, in counter-clockwise order
 */
export function canonicalRotation(word: readonly number[]): number[] {
  const n = word.length;
  let best = 0;
  for (let start = 1; start < n; start++) {
    for (let i = 0; i < n; i++) {
      const a = word[(start + i) % n]!;
      const b = word[(best + i) % n]!;
      if (a === b) continue;
      if (a < b) best = start;
      break;
    }
  }
  return Array.from({ length: n }, (_, i) => word[(best + i) % n]!);
}
