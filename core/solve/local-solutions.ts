/**
 * Brute-force enumeration of the locally valid mountain/valley assignments of a small pattern.
 *
 * Sits at the "solve" stage of the data flow (… → validate → solve → …). `mvSolutions` finds the
 * same set lazily, but it restarts DPLL once per solution and takes seconds for a few hundred; for
 * up to about 20 free creases, trying all 2^k assignments against the clauses takes a fraction of a
 * second and shares no search code with the solver, so it is also an independent check of it.
 */

import type { CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses, satisfies } from "./clauses";

/** The most free creases `locallyValidAssignments` will enumerate (2^20 assignments). */
export const MAX_BRUTE_FREE = 20;

/**
 * Lists every assignment of the M, V and U creases that satisfies the local clauses (Maekawa,
 * Big-Little-Big and Hull's single-vertex reduction at every vertex that Kawasaki holds at).
 *
 * Any M or V already on a crease is ignored: every M, V or U crease is free. "B" and "F" creases
 * are not variables. Order is by the binary number of the free creases, so the result is
 * deterministic.
 *
 * @param cp - the pattern
 * @returns one array per solution, indexed by edge, true meaning mountain (false for the creases
 *   that are not free)
 * @throws RangeError for more than {@link MAX_BRUTE_FREE} free creases, or as `localMvClauses` does
 */
export function locallyValidAssignments(cp: CreasePattern): boolean[][] {
  const base: CreasePattern = {
    ...cp,
    edges: cp.edges.map((e) =>
      e.assignment === "M" || e.assignment === "V" ? { ...e, assignment: "U" as const } : e,
    ),
  };
  const free = base.edges.flatMap((e, i) => (e.assignment === "U" ? [i] : []));
  if (free.length > MAX_BRUTE_FREE) {
    throw new RangeError(
      `${free.length} free creases is more than the brute-force limit of ${MAX_BRUTE_FREE}`,
    );
  }
  const formula = localMvClauses(base);
  const found: boolean[][] = [];
  for (let bits = 0; bits < 2 ** free.length; bits++) {
    const a = Array<boolean>(base.edges.length).fill(false);
    free.forEach((e, i) => (a[e] = Math.floor(bits / 2 ** i) % 2 === 1));
    if (satisfies(formula, a)) found.push(a);
  }
  return found;
}
