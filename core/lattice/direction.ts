/**
 * Exact direction predicates on the triangular lattice.
 *
 * Sits between the lattice and the pattern in the data flow (lattice → … → pattern): the crease
 * graph needs the counter-clockwise order of edges around a vertex and exact crossing tests, and
 * both must be decided without floating point. Every predicate is an integer sign computation in
 * (a, b) coordinates, guarded by checked arithmetic.
 *
 * Reference: de Berg et al., "Computational Geometry", §1.1 (orientation test); the Eisenstein
 * identity below is derived from the Cartesian map a + bω ↦ (a − b/2, b√3/2).
 */

import { checkedAdd, checkedMul, conj, eis, mul, neg, sub, type Eisenstein } from "./eisenstein";

/**
 * Returns ad − bc for u = a + bω and v = c + dω.
 *
 * Formula: with u ↦ (a − b/2, b√3/2) and v ↦ (c − d/2, d√3/2), the 2-D cross product is
 * (√3/2)(ad − bc). The factor √3/2 is positive, so this integer has exactly the sign of the
 * Cartesian cross product: positive when v is counter-clockwise from u.
 */
export function cross(u: Eisenstein, v: Eisenstein): number {
  return checkedAdd(checkedMul(u.a, v.b), -checkedMul(u.b, v.a));
}

/**
 * Returns 0 for directions in [0, π) and 1 for directions in [π, 2π).
 *
 * The Cartesian y of a + bω is (√3/2)b, so the sign of b decides the half-plane; b = 0 lies on
 * the x axis, where the sign of a (equal to the sign of x) decides.
 *
 * @throws RangeError for the zero vector, which has no direction
 */
export function halfPlane(z: Eisenstein): 0 | 1 {
  if (z.a === 0 && z.b === 0) throw new RangeError("The zero vector has no direction");
  return z.b > 0 || (z.b === 0 && z.a > 0) ? 0 : 1;
}

/**
 * Compares two directions by counter-clockwise angle in [0, 2π) from the +x axis.
 *
 * Within one half-plane the cross product decides, since angles differ by less than π there.
 *
 * @returns negative if u comes first, positive if v does, 0 if they are positive multiples
 */
export function compareAngle(u: Eisenstein, v: Eisenstein): number {
  const h = halfPlane(u) - halfPlane(v);
  if (h !== 0) return h;
  return Math.sign(-cross(u, v)) + 0;
}

/**
 * Returns +1 if p → q → r turns counter-clockwise, −1 if clockwise, 0 if collinear.
 *
 * This is the sign of cross(q − p, r − p) (de Berg et al., §1.1).
 */
export function orientation(p: Eisenstein, q: Eisenstein, r: Eisenstein): -1 | 0 | 1 {
  return Math.sign(cross(sub(q, p), sub(r, p))) as -1 | 0 | 1;
}

/**
 * Returns true when r lies on the closed segment pq.
 *
 * Collinearity plus a bounding-box test in (a, b) coordinates. The map (a, b) ↦ Cartesian is a
 * linear bijection, so it preserves "between two collinear points" and the box test is exact.
 */
export function onSegment(p: Eisenstein, q: Eisenstein, r: Eisenstein): boolean {
  return (
    orientation(p, q, r) === 0 &&
    Math.min(p.a, q.a) <= r.a &&
    r.a <= Math.max(p.a, q.a) &&
    Math.min(p.b, q.b) <= r.b &&
    r.b <= Math.max(p.b, q.b)
  );
}

/** Greatest common divisor of two non-negative integers (Euclid's algorithm). */
export function gcd(x: number, y: number): number {
  return y === 0 ? x : gcd(y, x % y);
}

/**
 * Divides z by the gcd of its coordinates, giving the primitive vector on the same ray.
 *
 * A positive scalar does not change a direction, so every verdict that depends only on direction
 * is unaffected, and the smaller numbers keep products far from the 2⁵³ limit. The zero vector is
 * returned unchanged.
 */
export function primitive(z: Eisenstein): Eisenstein {
  const g = gcd(Math.abs(z.a), Math.abs(z.b));
  return g <= 1 ? z : eis(z.a / g, z.b / g);
}

/**
 * Returns the winding number of the closed polygon `polygon` around the point `p`.
 *
 * Algorithm: the crossing rule of Sunday (2001), as analysed by Hormann & Agathos (2001): count
 * +1 for each edge that crosses the horizontal ray from `p` going upward with `p` on its left, and
 * −1 for each that crosses it going downward with `p` on its right, using the exact {@link orientation} sign. The Cartesian y of a + bω is
 * (√3/2)b, so comparing the b coordinates compares heights exactly. The result is non-zero
 * exactly when `p` is inside a polygon traversed counter-clockwise (1) or clockwise (−1).
 *
 * `p` must not lie on the boundary: the caller guarantees it, since in a planar crease graph a
 * vertex of one component is never on another component's face boundary.
 *
 * @param polygon - vertices of the closed polygon in order, at least 3
 * @param p - the query point
 */
export function windingNumber(polygon: readonly Eisenstein[], p: Eisenstein): number {
  let wn = 0;
  for (let i = 0; i < polygon.length; i++) {
    const v0 = polygon[i]!;
    const v1 = polygon[(i + 1) % polygon.length]!;
    if (v0.b <= p.b) {
      if (v1.b > p.b && orientation(v0, v1, p) > 0) wn++;
    } else if (v1.b <= p.b && orientation(v0, v1, p) < 0) {
      wn--;
    }
  }
  return wn;
}

/**
 * Finds the fourth crease that makes a degree-4 vertex satisfy Kawasaki's condition.
 *
 * Theorem (Kawasaki–Justin, Lang §1.4.4, Figs. 1.30–1.33): at a flat-foldable vertex of degree 4
 * the sectors satisfy α₁ + α₃ = π, so with creases at angles φ₁ < φ₂ < φ₃ < φ₄ (radians,
 * counter-clockwise, αᵢ = φᵢ₊₁ − φᵢ) the fourth is φ₄ = π + φ₁ + φ₃ − φ₂. As direction vectors
 * (up to a positive scale) that is d₄ ∝ −d₁ · d₃ · conj(d₂): the arguments add and subtract, and
 * the minus sign is the π. It is one product of lattice vectors, so the answer is exact in Z[ω]
 * with no square root and no search; gadgets and the Phase 8 generators can build Kawasaki-valid
 * vertices by construction instead of by trial.
 *
 * The ray exists only if it falls strictly between d₃ and d₁ going counter-clockwise. That holds
 * exactly when the sector from d₂ to d₃ is less than π: then α₃ = π − α₁ fits in what is left of
 * the circle.
 *
 * @param d1 - first crease direction
 * @param d2 - second crease direction, counter-clockwise from d1
 * @param d3 - third crease direction, counter-clockwise from d2 and within one turn of d1
 * @returns the primitive direction of the fourth crease, or null if the three are not distinct
 *   rays in counter-clockwise order or the fourth would not lie between d3 and d1
 * @throws RangeError if a product leaves the safe-integer range
 */
export function completeDegree4(d1: Eisenstein, d2: Eisenstein, d3: Eisenstein): Eisenstein | null {
  const rays = [d1, d2, d3];
  // Counter-clockwise cyclic order of distinct rays means exactly one descent round the cycle,
  // and no two consecutive rays equal.
  if (!isCounterClockwise(rays)) return null;
  const d4 = primitive(neg(mul(mul(primitive(d1), primitive(d3)), conj(primitive(d2)))));
  return isCounterClockwise([...rays, d4]) ? d4 : null;
}

/** Whether the rays are distinct and in counter-clockwise cyclic order within one turn. */
function isCounterClockwise(rays: readonly Eisenstein[]): boolean {
  let descents = 0;
  for (let i = 0; i < rays.length; i++) {
    const order = compareAngle(rays[i]!, rays[(i + 1) % rays.length]!);
    if (order === 0) return false;
    if (order > 0) descents++;
  }
  return descents === 1;
}
