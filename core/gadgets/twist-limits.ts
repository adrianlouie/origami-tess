/**
 * Exact angle limits for the twist folds of a regular n-gon, and exact angles between lattice
 * directions.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → …). It does
 * not build creases; it states what the book says a twist of angle α can and cannot do, so tests
 * can check the shipped gadgets against it and step 8.1 can use it to filter a sweep before the
 * solver runs. Every angle is an exact rational multiple of π (`PiFraction`), so no float appears
 * and the comparisons are decided by integer cross-multiplication.
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), §3.4 and §3.6 (Eq. 3.13). The
 * mm/vv and mv/vm limits (Eqs. 3.11, 3.12), Thm 17 and αsafe (Eq. 3.16) are deliberately absent:
 * the repo's notes state them without the book at hand, and as transcribed they disagree with the
 * solver on the shipped hexagon twist (see docs/PLAN.md 7.3d), so they wait for step 8.1.
 */

import { gcd, primitive } from "../lattice/direction";
import { checkedMul, eis, equals, rot60, type Eisenstein } from "../lattice/eisenstein";

/** An angle of (num/den)·π radians, in lowest terms with den ≥ 1. */
export type PiFraction = { readonly num: number; readonly den: number };

/**
 * Builds the angle (num/den)·π in lowest terms.
 *
 * @param num - numerator, an integer
 * @param den - denominator, a non-zero integer (its sign is moved to the numerator)
 * @throws RangeError for a zero denominator or a non-integer argument
 */
export function piFraction(num: number, den: number): PiFraction {
  if (!Number.isSafeInteger(num) || !Number.isSafeInteger(den) || den === 0) {
    throw new RangeError(`An angle needs an integer numerator and a non-zero integer denominator`);
  }
  const g = gcd(Math.abs(num), Math.abs(den));
  const sign = den < 0 ? -1 : 1;
  return { num: (sign * num) / g, den: Math.abs(den) / g };
}

/** Sign of a − b for two angles, by cross-multiplication (both denominators are positive). */
function compare(a: PiFraction, b: PiFraction): number {
  return Math.sign(checkedMul(a.num, b.den) - checkedMul(b.num, a.den));
}

function checkSides(n: number): void {
  if (!Number.isSafeInteger(n) || n < 3) {
    throw new RangeError(`A twist polygon needs an integer n >= 3 sides, got ${n}`);
  }
}

/**
 * The critical twist angle of a regular n-gon, αcrit = π/2 − π/n.
 *
 * Source: Lang Eq. 3.13 (90° − 180°/n). At α = αcrit the twist is closed-back; the pleats of
 * neighbouring corners meet exactly at the polygon's circumcircle and the back has no hole. α is
 * the angle between a pleat and a side of the polygon (radians, as a multiple of π).
 *
 * @param n - number of sides, an integer ≥ 3
 * @throws RangeError for n < 3 or a non-integer
 */
export function criticalTwistAngle(n: number): PiFraction {
  checkSides(n);
  return piFraction(n - 2, checkedMul(2, n));
}

/** The regimes of a twist angle against αcrit (see {@link twistRegime}). */
export type TwistRegime = "open-back" | "closed-back" | "supercritical";

/**
 * Classifies a twist angle against the critical angle of a regular n-gon.
 *
 * Source: Lang §3.4 and §3.6. Below αcrit the twist leaves a shrunken, rotated copy of the polygon
 * as a hole (open-back); at αcrit it closes; above it the pleats of neighbouring corners would
 * cross inside the polygon, so the paper must end early for the fold to exist (supercritical).
 *
 * @param n - number of sides, an integer ≥ 3
 * @param alpha - the twist angle α, as a multiple of π
 */
export function twistRegime(n: number, alpha: PiFraction): TwistRegime {
  const c = compare(alpha, criticalTwistAngle(n));
  return c < 0 ? "open-back" : c === 0 ? "closed-back" : "supercritical";
}

/** The twelve 30° directions, counter-clockwise from +x; index i is the angle i·π/6. */
const THIRTY_DEGREE_RAYS: readonly Eisenstein[] = (() => {
  const rays: Eisenstein[] = [];
  let a = eis(1, 0);
  let b = eis(2, 1);
  for (let k = 0; k < 6; k++) {
    rays.push(a, b);
    a = rot60(a);
    b = rot60(b);
  }
  return rays;
})();

function rayIndex(z: Eisenstein): number {
  const p = primitive(z);
  const i = THIRTY_DEGREE_RAYS.findIndex((r) => equals(r, primitive(p)));
  if (i < 0) {
    throw new RangeError(`Direction (${z.a}, ${z.b}) is not a non-zero multiple of 30 degrees`);
  }
  return i;
}

/**
 * The counter-clockwise angle from direction u to direction v, as a multiple of π.
 *
 * Both directions must lie on one of the twelve 30° rays, so the angle is a multiple of π/6 and is
 * found exactly by matching primitive vectors, never by a float. The result is in [0, 2π).
 *
 * @param u - the starting direction, non-zero
 * @param v - the ending direction, non-zero
 * @throws RangeError if either direction is zero or not a multiple of 30°
 */
export function latticeAngle(u: Eisenstein, v: Eisenstein): PiFraction {
  const i = rayIndex(u);
  const j = rayIndex(v);
  return piFraction((j - i + 12) % 12, 6);
}

/**
 * The acute angle between two lattice lines, as a multiple of π, in [0, π/2].
 *
 * This is the twist angle α of Lang §3.4: the angle between a pleat and a side of the twist polygon,
 * where only the lines matter, so a direction and its opposite give the same answer. Parallel lines
 * give 0.
 *
 * @param u - direction of the first line, non-zero and a multiple of 30°
 * @param v - direction of the second line, non-zero and a multiple of 30°
 * @throws RangeError as {@link latticeAngle} does
 */
export function lineAngle(u: Eisenstein, v: Eisenstein): PiFraction {
  const x = latticeAngle(u, v);
  const mod = x.num >= x.den ? piFraction(x.num - x.den, x.den) : x;
  const rest = piFraction(mod.den - mod.num, mod.den);
  return compare(mod, rest) <= 0 ? mod : rest;
}
