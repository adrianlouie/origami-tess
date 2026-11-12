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
import { kawasakiFlat } from "./kawasaki";

/**
 * One vector per sector whose argument is the sector's angle, so comparing arguments compares sizes.
 *
 * Sector i runs counter-clockwise from direction dᵢ to dᵢ₊₁ and has angle arg(dᵢ₊₁ · conj(dᵢ)) in
 * (0, 2π). Directions are reduced to primitive vectors first, which only drops positive scale
 * factors, so sector sizes are unchanged and the products stay small.
 *
 * @param directions - crease directions in counter-clockwise order
 * @param cyclic - whether the last sector closes back to the first direction (a full vertex) or
 *   not (a wedge of paper, which has one sector fewer than it has rays)
 */
function sectorKeys(directions: readonly Eisenstein[], cyclic: boolean): Eisenstein[] {
  const dirs = directions.map(primitive);
  const count = cyclic ? dirs.length : dirs.length - 1;
  return Array.from({ length: Math.max(count, 0) }, (_, i) =>
    mul(dirs[(i + 1) % dirs.length]!, conj(dirs[i]!)),
  );
}

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

  const key = sectorKeys(directions, true);
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
 * Finds the runs of small sectors in a wedge of paper at the edge of a sheet.
 *
 * Same runs as {@link smallSectorRuns}, but the rays are open: the first and last are the two
 * edges of the paper, no sector closes the circle, and the sector before the first or after the
 * last does not exist. So a run needs a neighbour on each side, which keeps the end sectors out of
 * every run, and every ray that bounds a run is a crease and never a paper edge. Lang (*Twists,
 * Tilings, and Tessellations*, p. 52, Fig. 1.45) shows that a strictly small sector between two
 * paper sectors still forces its creases to differ even though a border vertex has no Kawasaki or
 * Maekawa condition.
 *
 * @param directions - the wedge's rays counter-clockwise from one paper edge to the other
 * @returns for each run, the k + 1 indices of the rays that bound it, in counter-clockwise order
 * @throws RangeError if an intermediate product leaves the safe-integer range
 */
export function borderSmallSectorRuns(directions: readonly Eisenstein[]): number[][] {
  const key = sectorKeys(directions, false);
  const sectors = key.length;
  const runs: number[][] = [];
  let start = 1;
  while (start < sectors - 1) {
    let end = start;
    while (end + 1 < sectors && compareAngle(key[end + 1]!, key[start]!) === 0) end++;
    // `end + 1 < sectors` always holds for a block that has a larger sector after it.
    if (
      end + 1 < sectors &&
      compareAngle(key[start]!, key[start - 1]!) < 0 &&
      compareAngle(key[start]!, key[end + 1]!) < 0
    ) {
      runs.push(Array.from({ length: end - start + 2 }, (_, i) => start + i));
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

/**
 * Decides exactly whether one vertex can fold flat, at any degree.
 *
 * Theorem (Hull's single-vertex test, Lang §1.2.7; the "crimp" of Demaine & O'Rourke §12.2): let a
 * vertex satisfy Kawasaki and let sector i be no larger than both its neighbours. If its two
 * bounding creases agree the vertex cannot fold flat. If they differ, deleting both creases and
 * merging sectors i − 1, i and i + 1 into one sector of angle θᵢ₋₁ − θᵢ + θᵢ₊₁ gives a vertex that
 * folds flat exactly when the original does. Repeating this reaches degree 2, a straight line,
 * which folds flat exactly when its two creases agree. Each crimp removes one mountain and one
 * valley and keeps both alternating sums at π, so Kawasaki and Maekawa hold throughout.
 *
 * Exact form: the sector with direction keys dᵢ is the vector kᵢ = dᵢ₊₁ · conj(dᵢ) whose argument is
 * its angle, and the merged sector is kᵢ₋₁ · conj(kᵢ) · kᵢ₊₁. Its argument is the merged angle
 * mod 2π, and that angle lies in (0, 2π) because the three sectors sum to at most 2π and
 * θᵢ ≤ θᵢ₋₁, so no angle is ever computed. Sizes are compared with {@link compareAngle}.
 *
 * Unlike {@link bigLittleBigFlat}, which is necessary and exact only up to degree 4, this is
 * necessary and sufficient for the single vertex. It says nothing about the rest of the pattern.
 *
 * @param directions - crease direction vectors in counter-clockwise cyclic order, pairwise on
 *   distinct rays
 * @param assignments - the M/V assignment of the crease along `directions[i]`, same length
 * @returns false for an empty list, odd degree and any vertex that fails Kawasaki
 * @throws RangeError if the two lists differ in length, or an intermediate product leaves the
 *   safe-integer range
 */
export function singleVertexFlat(
  directions: readonly Eisenstein[],
  assignments: readonly ("M" | "V")[],
): boolean {
  if (assignments.length !== directions.length) {
    throw new RangeError(
      `Got ${directions.length} directions but ${assignments.length} assignments`,
    );
  }
  if (!kawasakiFlat(directions)) return false;

  const rotate = <T>(xs: readonly T[], by: number): T[] => [...xs.slice(by), ...xs.slice(0, by)];
  let creases = [...assignments];
  // keys[i] is sector i, from crease i to crease i + 1 (cyclic).
  let keys = sectorKeys(directions, true);
  while (creases.length > 2) {
    const m = creases.length;
    const size = (i: number, j: number) => compareAngle(keys[(i + m) % m]!, keys[(j + m) % m]!);
    let crimp = -1;
    for (let i = 0; i < m; i++) {
      if (size(i, i - 1) <= 0 && size(i, i + 1) <= 0 && creases[i] !== creases[(i + 1) % m]) {
        crimp = i;
        break;
      }
    }
    if (crimp === -1) return false;
    // Start at the crease before the crimped sector: sectors 0, 1, 2 are then the three to merge
    // and creases 1 and 2 are the two to delete.
    const c = rotate(creases, (crimp - 1 + m) % m);
    const k = rotate(keys, (crimp - 1 + m) % m);
    creases = [c[0]!, ...c.slice(3)];
    keys = [primitive(mul(primitive(mul(k[0]!, conj(k[1]!))), k[2]!)), ...k.slice(3)];
  }
  return creases[0] === creases[1];
}
