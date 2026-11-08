/**
 * Local flat-foldability validators: the Kawasaki and Maekawa conditions at a single vertex.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). It reads the counter-clockwise edge order from a `CreasePattern`
 * (`rotation`) and decides, per interior vertex, the two necessary conditions for a flat fold.
 * Both are necessary, not sufficient: Big-Little-Big (step 3.5) and global layer ordering
 * (Phase 5) are still needed. Kawasaki is decided with exact integers, never angles.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", §12.2 (Kawasaki–Justin and
 * Maekawa–Justin theorems); Hull, "Project Origami", ch. 4.
 */

import { conj, eis, mul, sub, type Eisenstein } from "../lattice/eisenstein";
import type { Assignment, CreasePattern } from "../pattern/crease-pattern";

/** Greatest common divisor of two non-negative integers. */
function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/**
 * Divides z by the gcd of its coordinates, giving the primitive vector on the same ray.
 *
 * A positive scalar does not change a direction, so Kawasaki's verdict is unaffected, and the
 * smaller numbers keep the products in {@link kawasakiFlat} far from the 2⁵³ limit.
 */
function primitive(z: Eisenstein): Eisenstein {
  const g = gcd(Math.abs(z.a), Math.abs(z.b));
  return g <= 1 ? z : eis(z.a / g, z.b / g);
}

/**
 * Tests the Kawasaki–Justin condition: the alternating sector angles at a vertex sum to π.
 *
 * Theorem (Kawasaki 1989; Demaine & O'Rourke, Thm 12.2.1): a vertex with crease directions at
 * angles θ₁ < … < θ₂ₙ (radians, counter-clockwise) can fold flat only if
 * α₁ + α₃ + … + α₂ₙ₋₁ = π, where αᵢ = θᵢ₊₁ − θᵢ are the sector angles.
 *
 * Exact form: the odd sector sum is Σ(θ₂ₖ − θ₂ₖ₋₁) = arg Q with Q = Π d₂ₖ · conj(d₂ₖ₋₁), taking
 * dᵢ as the Eisenstein direction vectors. The sum lies strictly in (0, 2π) because the other
 * (even) sum is positive and the two total 2π, so it equals π exactly when Q is a negative real.
 * For Eisenstein integers that is `b === 0 && a < 0`: no angle is ever computed. Each product is
 * reduced to a primitive vector, which only drops a positive scale factor.
 *
 * A cyclic shift of the list swaps the odd and even sums, and the two are equal at the solution
 * (both π), so any starting point of the counter-clockwise order gives the same answer.
 *
 * @param directions - crease direction vectors in counter-clockwise cyclic order, pairwise on
 *   distinct rays
 * @returns false for odd degree and for an empty list
 * @throws RangeError if an intermediate product leaves the safe-integer range
 */
export function kawasakiFlat(directions: readonly Eisenstein[]): boolean {
  if (directions.length === 0 || directions.length % 2 !== 0) return false;
  let q = eis(1, 0);
  for (let i = 0; i < directions.length; i += 2) {
    const from = primitive(directions[i]!);
    const to = primitive(directions[i + 1]!);
    q = primitive(mul(q, mul(to, conj(from))));
  }
  return q.b === 0 && q.a < 0;
}

/**
 * Tests the Maekawa–Justin condition: mountains and valleys differ by exactly two.
 *
 * Theorem (Maekawa 1980, Justin 1986; Demaine & O'Rourke, Thm 12.2.4): at a flat-foldable
 * vertex, |#M − #V| = 2. The condition forces even degree.
 *
 * @param assignments - the M/V assignment of every crease at the vertex
 */
export function maekawaFlat(assignments: readonly ("M" | "V")[]): boolean {
  const m = assignments.filter((a) => a === "M").length;
  return Math.abs(m - (assignments.length - m)) === 2;
}

/**
 * Returns the indices of the vertices that are fully surrounded by bounded faces.
 *
 * A vertex qualifies when it has at least one crease, none is a border edge ("B"), and every
 * sector around it lies in a bounded face. Each sector at v is one visit of v by one face walk,
 * and `faces` lists only bounded faces, so the condition is: v occurs in the face walks exactly
 * deg(v) times. Vertices on the outer ring of a patch fail it, so they are not wrongly flagged.
 *
 * @returns vertex indices in increasing order
 */
export function interiorVertices(cp: CreasePattern): number[] {
  const visits = cp.vertices.map(() => 0);
  for (const face of cp.faces) for (const v of face) visits[v] = (visits[v] ?? 0) + 1;
  const result: number[] = [];
  cp.vertices.forEach((_, v) => {
    const around = cp.rotation[v] ?? [];
    const border = around.some((e) => cp.edges[e]?.assignment === "B");
    if (around.length > 0 && !border && visits[v] === around.length) result.push(v);
  });
  return result;
}

/** Which interior vertices violate which local condition. */
export type LocalFlatFoldabilityReport = {
  /** Interior vertices whose creases fail the Kawasaki condition. */
  readonly kawasaki: readonly number[];
  /** Interior vertices, fully assigned, whose M/V counts fail the Maekawa condition. */
  readonly maekawa: readonly number[];
  /** Interior vertices with an unassigned ("U") crease, whose Maekawa check is deferred. */
  readonly unassigned: readonly number[];
};

/**
 * Checks the Kawasaki and Maekawa conditions at every interior vertex of a crease pattern.
 *
 * Flat ("F") creases are ignored: they do not fold, so they divide no sector. Kawasaki is
 * geometric and treats "U" like any other crease. Maekawa needs M/V, so a vertex with a "U"
 * crease is listed under `unassigned` and left out of `maekawa`. Both conditions are necessary,
 * not sufficient, for flat-foldability.
 *
 * @throws RangeError as {@link kawasakiFlat} does
 */
export function checkLocalFlatFoldability(cp: CreasePattern): LocalFlatFoldabilityReport {
  const kawasaki: number[] = [];
  const maekawa: number[] = [];
  const unassigned: number[] = [];
  for (const v of interiorVertices(cp)) {
    const directions: Eisenstein[] = [];
    const assignments: Assignment[] = [];
    for (const e of cp.rotation[v] ?? []) {
      const edge = cp.edges[e]!;
      if (edge.assignment === "F") continue;
      const other = edge.v0 === v ? edge.v1 : edge.v0;
      directions.push(sub(cp.vertices[other]!, cp.vertices[v]!));
      assignments.push(edge.assignment);
    }
    if (!kawasakiFlat(directions)) kawasaki.push(v);
    if (assignments.includes("U")) unassigned.push(v);
    else if (!maekawaFlat(assignments as ("M" | "V")[])) maekawa.push(v);
  }
  return { kawasaki, maekawa, unassigned };
}
