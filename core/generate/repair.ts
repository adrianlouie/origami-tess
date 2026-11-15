/**
 * Hill-climbing repair of a mountain/valley assignment, scored by the layer solver.
 *
 * Sits at the end of Phase 8's generator chain (shrink-rotate → symmetric motif → repair): it takes
 * a pattern whose creases are unassigned ("U") and an assignment for them, and flips sets of
 * creases while `nearFoldability` reports more of the paper stacking consistently. A full fold is
 * not required: it stops at a local maximum.
 *
 * The score is the exact share of paper that still folds (`nearFoldability`'s `score`, a fraction
 * of doubled areas), so no float is compared. Two fractions are ordered by cross-multiplication.
 */

import { checkedMul } from "../lattice/eisenstein";
import { nearFoldability, type FoldableShare } from "../solve/near-foldability";
import { withMvAssignment } from "../solve/solver";
import type { CreasePattern } from "../pattern/crease-pattern";

/** A set of creases flipped together (mountain to valley and back). */
export type Move = readonly number[];

/**
 * Scores an assignment: the foldable share of the paper, 0 when the folds do not close.
 *
 * @param base - a pattern whose creases to assign are "U"
 * @param assignment - one Boolean per edge, true for mountain
 * @throws RangeError as `nearFoldability` and `withMvAssignment` do
 */
export function scoreAssignment(
  base: CreasePattern,
  assignment: readonly boolean[],
): FoldableShare {
  const verdict = nearFoldability(withMvAssignment(base, assignment));
  return verdict.status === "ok" || verdict.status === "partial"
    ? verdict.score
    : Object.freeze({ num: 0, den: 1 });
}

/** Whether share a is strictly larger than share b (cross-multiplied, exact). */
export function isBetter(a: FoldableShare, b: FoldableShare): boolean {
  return checkedMul(a.num, b.den) > checkedMul(b.num, a.den);
}

/** One single-crease move for every "U" crease of the pattern. */
export function singleCreaseMoves(base: CreasePattern): Move[] {
  return base.edges.flatMap((e, i) => (e.assignment === "U" ? [[i]] : []));
}

/** The result of {@link repairAssignment}. */
export type Repair = {
  readonly assignment: readonly boolean[];
  /** The score before any move, then after each accepted move; never decreasing. */
  readonly trace: readonly FoldableShare[];
  /** `ok` when the pattern folds fully, `stuck` at a local maximum, `limit` when rounds ran out. */
  readonly status: "ok" | "stuck" | "limit";
};

/**
 * Raises the foldable share of an assignment by first-improvement hill climbing.
 *
 * Each round tries the moves in order and keeps one only when it strictly raises the score, so the
 * trace never decreases. It stops when the share is 1 (`ok`), when a whole round improves nothing
 * (`stuck`, a local maximum) or after `maxRounds` rounds (`limit`).
 *
 * @param base - a pattern whose creases to assign are "U"
 * @param start - the starting assignment, true for mountain
 * @param moves - the crease sets that may be flipped together
 * @param options - `maxRounds` bounds the number of passes over the moves
 */
export function repairAssignment(
  base: CreasePattern,
  start: readonly boolean[],
  moves: readonly Move[],
  options: { readonly maxRounds: number },
): Repair {
  let assignment = [...start];
  let score = scoreAssignment(base, assignment);
  const trace: FoldableShare[] = [score];
  const full = (s: FoldableShare): boolean => s.num === s.den;
  for (let round = 0; round < options.maxRounds; round++) {
    if (full(score)) return { assignment, trace, status: "ok" };
    let improved = false;
    for (const move of moves) {
      const candidate = [...assignment];
      for (const e of move) candidate[e] = !candidate[e];
      const next = scoreAssignment(base, candidate);
      if (isBetter(next, score)) {
        assignment = candidate;
        score = next;
        trace.push(score);
        improved = true;
        if (full(score)) return { assignment, trace, status: "ok" };
      }
    }
    if (!improved) return { assignment, trace, status: "stuck" };
  }
  return { assignment, trace, status: full(score) ? "ok" : "limit" };
}
