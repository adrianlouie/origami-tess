/**
 * Closed-form fold angles of a rigidly folding vertex, used as exact targets for `relax`.
 *
 * Sits in the physical stage of the data flow (… → solve → simulate), beside `relax.ts`. The
 * bar-and-hinge model is approximate, so its settled angles are checked against analytic results
 * that do not depend on it. Floats are fine here: this stage is past every exact one. Angles are in
 * radians.
 *
 * Reference: Lang, *Twists, Tilings, and Tessellations* (CRC Press, 2018), §2.4.3, Eqs. 2.2 to 2.8
 * (p. 139), for the symmetric bird's-foot vertex.
 */

/**
 * Returns the major fold angle γ₊ of a symmetric bird's-foot vertex from its minor fold angle γ₋.
 *
 * Formula (Lang, Eq. 2.2): for sectors (α, α, π − α, π − α), whose opposite creases fold by equal
 * angles in pairs, tan(γ₊/2) = sec α · tan(γ₋/2). The relation is the one-degree-of-freedom rigid
 * motion of the vertex (Huffman 1976), so it holds along the whole fold. It is evaluated as
 * γ₊ = 2·atan2(sin(γ₋/2), cos α · cos(γ₋/2)), which is the same value without the tangent, so
 * γ₋ = ±π gives exactly ±π (the flat-folded vertex) and not a number near it. Because sec α ≥ 1,
 * |γ₊| ≥ |γ₋|: the major pair is the one that folds more.
 *
 * @param alpha - the sector angle α, in (0, π/2); the sectors are (α, α, π − α, π − α)
 * @param minor - the minor fold angle γ₋, in [−π, π]; a valley is positive, as in `foldAngle`
 * @returns the major fold angle γ₊, with the sign of γ₋
 * @throws RangeError if α is not in (0, π/2) or γ₋ is outside [−π, π]
 */
export function birdsFootMajor(alpha: number, minor: number): number {
  if (!(alpha > 0 && alpha < Math.PI / 2)) {
    throw new RangeError("alpha must lie in (0, π/2)");
  }
  if (!(Math.abs(minor) <= Math.PI)) throw new RangeError("the minor fold must lie in [−π, π]");
  const half = minor / 2;
  return 2 * Math.atan2(Math.sin(half), Math.cos(alpha) * Math.cos(half));
}
