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

import { checkedAdd, checkedMul, eis, sub, type Eisenstein } from "./eisenstein";

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
