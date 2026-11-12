/**
 * The Kawasaki–Justin condition at one vertex, decided exactly.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). It is its own module so that `big-little-big.ts`, which needs it for
 * Hull's single-vertex test, and `local-flat-foldability.ts`, which needs that test for its report,
 * do not import each other. `local-flat-foldability.ts` re-exports it.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", §12.2; Hull, "Project Origami",
 * ch. 4.
 */

import { primitive } from "../lattice/direction";
import { conj, eis, mul, type Eisenstein } from "../lattice/eisenstein";

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
