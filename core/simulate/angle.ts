/**
 * The in-plane angle at a triangle corner, and its gradient.
 *
 * Sits in the physical stage of the data flow (… → solve → simulate), beside `dihedral.ts`. A
 * bar-and-hinge model has only axial springs inside a panel, so a flat obtuse triangle (the 120°
 * corners of the lattice patterns) can open to 180° at a few per cent of bar strain; past that
 * point the triangle turns inside out and the hinge angle across its edge jumps by π, so no
 * equilibrium exists. A spring on each corner angle keeps panels from shearing flat or inverting.
 * Positions are a flat `Float64Array` (x, y, z per node), as in `dihedral.ts`.
 */

/** A triangle corner: the angle at `b` between the rays to `a` and to `c`. */
export type Corner = { readonly a: number; readonly b: number; readonly c: number };

/**
 * Below this |u × w| the corner is treated as flat and its gradient is taken as zero. The cross
 * product is twice the triangle's area, in squared lattice units (unit edge length), so this is an
 * absolute threshold, not a relative one; it is far below any triangle of a lattice pattern (the
 * smallest has area √3/4) and only guards the division by |u × w| for a collapsed triangle.
 */
const FLAT = 1e-12;

/**
 * Writes ∂θ/∂x for the three nodes of a corner into `out` and returns θ.
 *
 * Formula: with u = x_a − x_b and w = x_c − x_b, θ = atan2(|u × w|, u·w) ∈ [0, π]. With the unit
 * normal n̂ = (u × w)/|u × w|, ∂θ/∂x_a = (u × n̂)/|u|² and ∂θ/∂x_c = (n̂ × w)/|w|²: each is the
 * unit in-plane direction perpendicular to its ray, scaled by 1/length (a node moving a distance d
 * along it turns its ray by d/|ray|). ∂θ/∂x_b is minus their sum, so the gradient is
 * translation invariant. For a flat corner (|u × w| < 10⁻¹²) the direction n̂ is undefined and the
 * gradient is zero.
 *
 * @param x - node positions, x, y, z per node
 * @param corner - the three node indices
 * @param out - receives 9 numbers: the gradients at a, b, c in that order
 * @returns the angle θ in radians
 */
export function cornerAngleGradient(x: Float64Array, corner: Corner, out: Float64Array): number {
  const { a, b, c } = corner;
  const u = [x[3 * a]! - x[3 * b]!, x[3 * a + 1]! - x[3 * b + 1]!, x[3 * a + 2]! - x[3 * b + 2]!];
  const w = [x[3 * c]! - x[3 * b]!, x[3 * c + 1]! - x[3 * b + 1]!, x[3 * c + 2]! - x[3 * b + 2]!];
  const n = [
    u[1]! * w[2]! - u[2]! * w[1]!,
    u[2]! * w[0]! - u[0]! * w[2]!,
    u[0]! * w[1]! - u[1]! * w[0]!,
  ];
  const area2 = Math.hypot(n[0]!, n[1]!, n[2]!);
  const theta = Math.atan2(area2, u[0]! * w[0]! + u[1]! * w[1]! + u[2]! * w[2]!);
  if (area2 < FLAT) {
    out.fill(0, 0, 9);
    return theta;
  }
  const nh = [n[0]! / area2, n[1]! / area2, n[2]! / area2];
  const uu = u[0]! ** 2 + u[1]! ** 2 + u[2]! ** 2;
  const ww = w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2;
  const ga = [
    (u[1]! * nh[2]! - u[2]! * nh[1]!) / uu,
    (u[2]! * nh[0]! - u[0]! * nh[2]!) / uu,
    (u[0]! * nh[1]! - u[1]! * nh[0]!) / uu,
  ];
  const gc = [
    (nh[1]! * w[2]! - nh[2]! * w[1]!) / ww,
    (nh[2]! * w[0]! - nh[0]! * w[2]!) / ww,
    (nh[0]! * w[1]! - nh[1]! * w[0]!) / ww,
  ];
  for (let d = 0; d < 3; d++) {
    out[d] = ga[d]!;
    out[6 + d] = gc[d]!;
    out[3 + d] = -ga[d]! - gc[d]!;
  }
  return theta;
}
