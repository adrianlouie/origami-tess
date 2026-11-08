/**
 * Big-Little-Big validator: a third necessary condition for a vertex to fold flat.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render), beside the Kawasaki and Maekawa checks in `local-flat-foldability.ts`,
 * which call it. Kawasaki and Maekawa both pass for some vertices that cannot fold: the lemma here
 * rules those out using the sector sizes and the M/V assignment together. Sector sizes are
 * compared exactly in Eisenstein integers, never as angles.
 *
 * Still necessary, not sufficient, for degree above 4: global layer ordering (Phase 5) decides the
 * rest.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", §12.2 (Big-Little-Big lemma);
 * Hull, "Project Origami", ch. 4.
 */

import { compareAngle, primitive } from "../lattice/direction";
import { conj, mul, type Eisenstein } from "../lattice/eisenstein";

/**
 * Finds the runs of small sectors that the Big-Little-Big condition constrains.
 *
 * A run is a maximal block of k ≥ 1 consecutive equal sectors, each strictly smaller than the
 * sector before the block and the sector after it. Sector i runs counter-clockwise from direction
 * dᵢ to dᵢ₊₁; its angle is arg(dᵢ₊₁ · conj(dᵢ)) in (0, 2π), and two such angles are compared
 * exactly with {@link compareAngle}. Directions are reduced to primitive vectors first, which only
 * drops positive scale factors, so sector sizes are unchanged and the products stay as small as
 * Kawasaki's. When every sector is equal there is no strict local minimum and no run.
 *
 * @param directions - crease direction vectors in counter-clockwise cyclic order, pairwise on
 *   distinct rays
 * @returns for each run, the k + 1 indices of the creases that bound it, in counter-clockwise
 *   order (crease i is the ray that opens sector i)
 * @throws RangeError if an intermediate product leaves the safe-integer range
 */
export function smallSectorRuns(directions: readonly Eisenstein[]): number[][] {
  const n = directions.length;
  // Fewer than three sectors cannot have a sector smaller than two distinct neighbours.
  if (n < 3) return [];

  // key[i] has the argument of sector i, so comparing keys compares sector sizes.
  const dirs = directions.map(primitive);
  const key = dirs.map((d, i) => mul(dirs[(i + 1) % n]!, conj(d)));
  const sizeOrder = (i: number, j: number) => compareAngle(key[i % n]!, key[j % n]!);

  // Start the walk at a sector that differs from its predecessor so no run wraps the seam.
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (sizeOrder(i, i + n - 1) !== 0) {
      first = i;
      break;
    }
  }
  if (first === -1) return [];

  const runs: number[][] = [];
  let start = first;
  while (start < first + n) {
    let end = start;
    while (end + 1 < first + n && sizeOrder(end + 1, start) === 0) end++;
    const before = start + n - 1;
    const after = end + 1;
    if (sizeOrder(start, before) < 0 && sizeOrder(start, after) < 0) {
      const creases: number[] = [];
      for (let c = start; c <= end + 1; c++) creases.push(c % n);
      runs.push(creases);
    }
    start = end + 1;
  }
  return runs;
}

/**
 * Tests the Big-Little-Big condition at one vertex.
 *
 * Lemma (Big-Little-Big; Demaine & O'Rourke §12.2): in a flat-folded vertex, if a sector is
 * strictly smaller than both of its neighbours, the two creases that bound it have opposite
 * mountain/valley assignments.
 *
 * Generalisation used here: for each run from {@link smallSectorRuns}, the k + 1 creases that
 * bound it must not all share one assignment: if they did, every fold would turn the same way and
 * the stacked small sectors would spiral into the larger neighbours. For k = 1 "not all equal"
 * is exactly the lemma (the two creases differ). For k = 2 it still allows the odd crease to be
 * any of the three, so a four-valent triangle corner with sectors 2π/3, π/3, π/3, 2π/3 folds with
 * assignment M, M, M, V as well as M, V, M, M. The rule is a necessary condition only, and the
 * tests check it against a brute-force search over layer orders for every vertex of degree 4 and 6
 * drawn from the 30° directions.
 *
 * The test assumes the vertex already satisfies Kawasaki; for other vertices its verdict says
 * nothing about flat-foldability.
 *
 * @param directions - crease direction vectors in counter-clockwise cyclic order, pairwise on
 *   distinct rays
 * @param assignments - the M/V assignment of the crease along `directions[i]`, same length
 * @returns false when some minimal run of sectors is bounded by creases that all agree
 * @throws RangeError if the two lists differ in length, or an intermediate product leaves the
 *   safe-integer range
 */
export function bigLittleBigFlat(
  directions: readonly Eisenstein[],
  assignments: readonly ("M" | "V")[],
): boolean {
  const n = directions.length;
  if (assignments.length !== n) {
    throw new RangeError(`Got ${n} directions but ${assignments.length} assignments`);
  }
  return smallSectorRuns(directions).every((creases) =>
    creases.some((c) => assignments[c] !== assignments[creases[0]!]),
  );
}
