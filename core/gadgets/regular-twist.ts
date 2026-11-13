/**
 * Regular twist generator: a triangle or hexagon twist at a chosen twist angle α on the triangular
 * lattice.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * …), next to the two shipped twists, and feeds the parameter sweep of step 8.1. It emits creases
 * as exact Eisenstein segments, all unassigned (`"U"`), so the M/V solver or an enumeration picks
 * the assignment. Every direction is a multiple of 30°, so α is limited to 30° and 60° and no
 * angle is ever computed as a float.
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), §3.4 and §3.6 (Eq. 3.13, Eq. 3.1).
 */

import { checkedMul, eis, mul, OMEGA, add, type Eisenstein } from "../lattice/eisenstein";
import { primitive } from "../lattice/direction";
import { hexDistance } from "../lattice/grid";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { hexagonFrame, rotate, scale, type Crease } from "./crease";
import { rayIndex, THIRTY_DEGREE_RAYS, type PiFraction } from "./twist-limits";

/** The polygons a regular twist can have on the triangular lattice with 30° pleats. */
export type TwistSides = 3 | 6;

/**
 * Turns a direction clockwise by k·30° and returns it as a primitive lattice vector.
 *
 * @param d - a direction on one of the twelve 30° rays
 * @param steps - the number of 30° steps, a non-negative integer
 */
function turnClockwise(d: Eisenstein, steps: number): Eisenstein {
  return THIRTY_DEGREE_RAYS[(((rayIndex(d) - steps) % 12) + 12) % 12]!;
}

/** The number of 30° steps in α, which must be π/6 or π/3 (a 30° or 60° twist). */
function angleSteps(alpha: PiFraction): number {
  const steps = (alpha.num * 6) / alpha.den;
  if (!Number.isInteger(steps) || steps < 1 || steps > 2) {
    throw new RangeError(
      `Twist angle must be 30 or 60 degrees (π/6 or π/3), got ${alpha.num}/${alpha.den}·π`,
    );
  }
  return steps;
}

/**
 * The corners Pₖ of the twist polygon, counter-clockwise, centred on the origin.
 *
 * The hexagon has Pₖ = s·uᵏ with u = 1 + ω = e^{iπ/3} (the shipped hexagon twist). The triangle has
 * Qₖ = t·ωᵏ·(2 + ω), whose circumcentre is the origin and whose side is 3t (|2 + ω| = √3, so the
 * corners are lattice points only for a side that is a multiple of 3). Centring both on the origin
 * keeps the twist and its hexagonal frame symmetric under the polygon's rotation, so every pleat
 * word in one rotation class folds or fails together.
 */
function corners(n: TwistSides, side: number): Eisenstein[] {
  if (!Number.isSafeInteger(side) || side < 1) {
    throw new RangeError(`Twist side must be a safe integer >= 1, got ${side}`);
  }
  if (n === 6) return Array.from({ length: 6 }, (_, k) => rotate(eis(side, 0), k));
  if (n === 3) {
    if (side % 3 !== 0) {
      throw new RangeError(
        `A lattice triangle twist needs a side that is a multiple of 3, got ${side}`,
      );
    }
    const first = scale(eis(2, 1), side / 3);
    return [first, mul(OMEGA, first), mul(OMEGA, mul(OMEGA, first))];
  }
  throw new RangeError(`A regular twist here has 3 or 6 sides, got ${String(n)}`);
}

/**
 * Lists the creases of a regular twist: for each side k, the polygon edge, then the two creases of
 * pleat k (from Pₖ and from Pₖ₊₁), then the hexagonal "B" frame ring of radius R.
 *
 * Construction (Lang §3.4): let dₖ be the direction of side PₖPₖ₊₁. A pleat is two parallel creases,
 * one leaving each end of the side on the outside of the polygon, in the direction dₖ turned
 * clockwise by β, where β = α for the default hand and β = π − α for the mirror hand. Each corner
 * then has the pleat creases of its two sides next to its two polygon edges; Kawasaki holds there
 * (for the hexagon at α = 30° the sectors are 120°, 150°, 60°, 30°), and the tests check it exactly
 * at every size. α is the acute angle between a pleat and a side of the polygon, the book's twist
 * angle, and its regime is set by αcrit = π/2 − π/n (Eq. 3.13); see `twistRegime`. The default hand
 * with n = 6 and α = 60° is exactly the shipped hexagon twist, and the mirror hand with n = 3 and
 * α = 60° is the shipped triangle twist (turned a half turn, because this triangle is centred).
 *
 * The creases are listed in a fixed order (see {@link pleatEdges}), all unassigned, and each pleat
 * crease is one segment that runs to the first ring point in its direction. It must end exactly on
 * the ring: a 30° ray changes the hex distance by 2 per step, so some radii miss.
 *
 * @param n - number of sides, 3 or 6
 * @param alpha - the twist angle, π/6 or π/3
 * @param side - polygon side in lattice units (a multiple of 3 for n = 3)
 * @param frameRadius - hexagonal frame radius R, larger than the polygon's circumradius
 * @param mirror - the mirror-image twist (β = π − α); the shipped triangle twist has this hand
 * @throws RangeError for an unsupported n, α or size, and when a pleat crease does not end exactly
 *   on the ring
 */
export function regularTwistCreases(
  n: TwistSides,
  alpha: PiFraction,
  side: number,
  frameRadius: number,
  mirror = false,
): Crease[] {
  const steps = angleSteps(alpha);
  const turn = mirror ? 6 - steps : steps;
  const points = corners(n, side);
  const reach = Math.max(...points.map(hexDistance));
  if (!Number.isSafeInteger(frameRadius) || frameRadius <= reach) {
    throw new RangeError(`Frame radius must be a safe integer > ${reach}, got ${frameRadius}`);
  }
  const creases: Crease[] = [];
  for (let k = 0; k < n; k++) {
    const p = points[k]!;
    const q = points[(k + 1) % n]!;
    const direction = turnClockwise(primitive({ a: q.a - p.a, b: q.b - p.b }), turn);
    creases.push({ from: p, to: q, assignment: "U" });
    for (const start of [p, q]) {
      creases.push({ from: start, to: rayEnd(start, direction, frameRadius), assignment: "U" });
    }
  }
  creases.push(...hexagonFrame(frameRadius));
  return creases;
}

/**
 * The first ring point from `start` along `direction`, in whole steps of `direction`.
 *
 * @throws RangeError when the walk passes the ring without landing on it
 */
function rayEnd(start: Eisenstein, direction: Eisenstein, radius: number): Eisenstein {
  let p = start;
  const limit = checkedMul(2, radius) + 2;
  for (let i = 0; i < limit; i++) {
    p = add(p, direction);
    const d = hexDistance(p);
    if (d === radius) return p;
    if (d > radius) break;
  }
  throw new RangeError(
    `A pleat crease from (${start.a}, ${start.b}) along (${direction.a}, ${direction.b}) misses the ring of radius ${radius}`,
  );
}

/**
 * The edge indices of each pleat's two creases in the pattern built from
 * {@link regularTwistCreases}.
 *
 * `fromSegments` keeps segment order and the creases are distinct, so side k's polygon edge is
 * edge 3k and pleat k is the pair (3k + 1, 3k + 2). This lets a sweep read the pleat word from an
 * assignment without searching the geometry.
 *
 * @param n - number of sides, 3 or 6
 */
export function pleatEdges(n: TwistSides): [number, number][] {
  return Array.from({ length: n }, (_, k) => [3 * k + 1, 3 * k + 2]);
}

/**
 * Builds a regular twist as a crease pattern, with every polygon and pleat crease unassigned.
 *
 * @throws RangeError as {@link regularTwistCreases} does, and when two pleat creases cross or meet
 *   in a T (`creasePattern` rejects non-planar input), which happens when the paper is too large
 *   for the pleats to stay apart
 */
export function regularTwist(
  n: TwistSides,
  alpha: PiFraction,
  side: number,
  frameRadius: number,
  mirror = false,
): CreasePattern {
  return fromSegments([], regularTwistCreases(n, alpha, side, frameRadius, mirror));
}

/**
 * The frame radii at which a regular twist exists: every R up to `maxRadius` for which every pleat
 * crease lands exactly on the ring (and the pattern is planar), in increasing order.
 *
 * @param maxRadius - the largest radius to try, a safe integer
 * @throws RangeError for an unsupported n, α or side
 */
export function twistFrameRadii(
  n: TwistSides,
  alpha: PiFraction,
  side: number,
  maxRadius: number,
  mirror = false,
): number[] {
  angleSteps(alpha);
  const reach = Math.max(...corners(n, side).map(hexDistance));
  const radii: number[] = [];
  for (let r = reach + 1; r <= maxRadius; r++) {
    try {
      regularTwist(n, alpha, side, r, mirror);
      radii.push(r);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  }
  return radii;
}
