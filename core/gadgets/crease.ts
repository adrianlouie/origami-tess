/**
 * Shared pieces of the twist gadgets.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → …). Every
 * gadget emits a list of {@link Crease} segments that `fromSegments` turns into a crease pattern,
 * so the segment type and the exact scaling helper live here instead of in each gadget.
 */

import { checkedMul, eis, type Eisenstein } from "../lattice/eisenstein";
import type { Edge } from "../lattice/grid";
import type { Assignment } from "../pattern/crease-pattern";

/** A crease segment with its mountain/valley assignment; the unit gadgets emit. */
export type Crease = Edge & { readonly assignment: Assignment };

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
