/**
 * Shared pieces of the twist gadgets.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → …). Every
 * gadget emits a list of {@link Crease} segments that `fromSegments` turns into a crease pattern,
 * so the segment type and the exact scaling helper live here instead of in each gadget.
 */

import { add, checkedMul, eis, rot60, type Eisenstein } from "../lattice/eisenstein";
import type { Edge } from "../lattice/grid";
import type { Assignment } from "../pattern/crease-pattern";

/** A crease segment with its mountain/valley assignment; the unit gadgets emit. */
export type Crease = Edge & { readonly assignment: Assignment };

/**
 * Rotates z by k·60° (k·π/3 radians) counter-clockwise, as k applications of `rot60`.
 *
 * @param z - the point
 * @param k - a non-negative integer number of sixth-turns
 */
export function rotate(z: Eisenstein, k: number): Eisenstein {
  let r = z;
  for (let i = 0; i < k; i++) r = rot60(r);
  return r;
}

/**
 * Lists the "B" frame ring of a hexagonal frame: the 6R lattice points at hexDistance R.
 *
 * The ring walks from each corner R·uᵏ (u = 1 + ω = e^{iπ/3}) toward R·uᵏ⁺¹ along uᵏ⁺², R unit
 * steps per side. Gadgets close their pattern with it because, without a boundary, the regions
 * between rays are unbounded and no vertex is interior, so the validators would pass vacuously.
 * Listing every ring point as its own unit edge also avoids T-junctions where a ray ends.
 *
 * @param radius - frame radius R, a safe integer ≥ 1 (lattice units)
 * @throws RangeError if a product leaves the safe-integer range (see `checkedMul`)
 */
export function hexagonFrame(radius: number): Crease[] {
  const ring: Crease[] = [];
  for (let k = 0; k < 6; k++) {
    const step = rotate(eis(1, 0), k + 2);
    let p = scale(rotate(eis(1, 0), k), radius);
    for (let i = 0; i < radius; i++) {
      const q = add(p, step);
      ring.push({ from: p, to: q, assignment: "B" });
      p = q;
    }
  }
  return ring;
}

/**
 * Scales a lattice point by an integer: k·(a + bω) = ka + kbω.
 *
 * @param z - the point
 * @param k - an integer factor
 * @throws RangeError if a product leaves the safe-integer range (see `checkedMul`)
 */
export function scale(z: Eisenstein, k: number): Eisenstein {
  return eis(checkedMul(z.a, k), checkedMul(z.b, k));
}
