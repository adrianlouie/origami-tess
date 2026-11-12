/**
 * Theorem 11 on the fold signs round a vertex: no half-plane without a mountain together with
 * another without a valley.
 *
 * Sits at the "validate" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). The directions are exact Eisenstein integers; the fold signs come from
 * whoever calls it (an assignment, or the signs of a settled simulation), so the test itself is
 * exact. It is a necessary condition only: Maekawa's theorem catches what it lets through.
 */

import { compareAngle, cross } from "../lattice/direction";
import type { Eisenstein } from "../lattice/eisenstein";

/**
 * True when every direction lies in one open half-plane bounded by a line through the vertex.
 *
 * The directions lie in an open half-plane exactly when the counter-clockwise gap from one of them
 * to the next (cyclically, among the distinct ones) is larger than π, which is cross(a, b) < 0. A
 * gap of exactly π (two opposite directions) is not enough: both open half-planes then miss one of
 * them. No direction, or one direction, always fits.
 */
function inOpenHalfPlane(directions: readonly Eisenstein[]): boolean {
  const sorted = [...directions].sort(compareAngle);
  const distinct = sorted.filter((d, i) => i === 0 || compareAngle(sorted[i - 1]!, d) !== 0);
  if (distinct.length <= 1) return true;
  return distinct.some((d, i) => cross(d, distinct[(i + 1) % distinct.length]!) < 0);
}

/**
 * Reports whether the creases at a vertex break Theorem 11.
 *
 * Theorem 11 (Lang, *Twists, Tilings, and Tessellations*, p. 41): a vertex that can be at least
 * partly folded cannot have a half-plane with no mountain and another with no valley. The
 * half-planes are closed (bounded by a line through the vertex, with the boundary included), as in
 * Theorem 9. A closed half-plane with no mountain exists exactly when all the mountains lie in the
 * open half-plane opposite it, so the theorem fails when the mountains fit in one open half-plane
 * and so do the valleys. Closed matters: with open half-planes the right vertex M, M, M, V would
 * be flagged, and it folds flat (the tests count such vertices).
 *
 * A crease with sign 0 is unfolded and counts as neither mountain nor valley. A vertex with no
 * folded crease is not reported: there is nothing yet to violate the theorem.
 *
 * @param directions - the crease directions at the vertex, away from it
 * @param signs - one per crease: +1 valley, −1 mountain, 0 not folded
 * @returns true when the vertex has a half-plane without mountains and another without valleys
 * @throws RangeError if the lengths differ, or a direction is the zero vector
 */
export function halfPlaneMvSplit(
  directions: readonly Eisenstein[],
  signs: readonly (-1 | 0 | 1)[],
): boolean {
  if (directions.length !== signs.length) {
    throw new RangeError("every crease needs a direction and a sign");
  }
  if (directions.some((d) => d.a === 0 && d.b === 0)) {
    throw new RangeError("a crease direction cannot be the zero vector");
  }
  if (signs.every((s) => s === 0)) return false;
  const mountains = directions.filter((_, i) => signs[i] === -1);
  const valleys = directions.filter((_, i) => signs[i] === 1);
  return inOpenHalfPlane(mountains) && inOpenHalfPlane(valleys);
}
