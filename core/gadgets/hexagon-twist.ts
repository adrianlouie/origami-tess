/**
 * Hexagon twist gadget: the six-pleat twist fold on the triangular lattice.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * …). It emits creases as exact Eisenstein segments with a full mountain/valley assignment, and
 * `hexagonTwist` hands them to `fromSegments` so the validators can read the result. Everything is
 * integer arithmetic on the lattice; no angle is ever computed.
 *
 * Reference: Fujimoto's hexagon twist; Lang, "Twists, Tilings, and Tessellations" (2018), ch. 5;
 * Gjerde, "Origami Tessellations" (2009).
 */

import { add, eis, rot60, type Eisenstein } from "../lattice/eisenstein";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { scale, type Crease } from "./crease";

/** Rotates z by k·60° (k·π/3 radians) counter-clockwise. */
function rotate(z: Eisenstein, k: number): Eisenstein {
  let r = z;
  for (let i = 0; i < k; i++) r = rot60(r);
  return r;
}

/**
 * Lists the creases of a hexagon twist of side s inside a hexagonal frame of radius R.
 *
 * Construction: with u = 1 + ω = e^{iπ/3} (`rot60`), the hexagon has corners Pₖ = s·uᵏ,
 * k = 0..5. At each Pₖ two pleat rays leave the outside: a radial ray Rₖ along uᵏ and an
 * extension ray Xₖ along uᵏ⁺¹, which continues the hexagon edge Pₖ₋₁Pₖ. Rₖ₊₁ and Xₖ are parallel
 * (both along uᵏ⁺¹), and together they form one pleat; six pleats give the 60° twist.
 *
 * Sectors at Pₖ are 2π/3, 2π/3, π/3, π/3 (radians) in counter-clockwise order from Rₖ, so the
 * alternating sum is π/3 + 2π/3 = π and Kawasaki holds for every s. Hexagon edges and radial
 * rays are mountains and extension rays are valleys: three M and one V, so |#M − #V| = 2
 * (Maekawa), and each pleat pairs one M with one V.
 *
 * The frame is the ring hexDistance = R, listed as 6R unit "B" edges through every lattice point
 * on the ring. Without it the regions between pleats are unbounded and no vertex is interior, so
 * the validators would pass vacuously; listing every ring point also avoids T-junctions where a
 * ray ends. Rays end on the ring because Xₖ and Rₖ move one hex step per unit length, so each
 * has length R − s.
 *
 * @param side - hexagon side s, a safe integer ≥ 1 (lattice units)
 * @param frameRadius - frame radius R, a safe integer ≥ s + 1
 * @throws RangeError for sizes outside those ranges or too large for exact arithmetic
 */
export function hexagonTwistCreases(side: number, frameRadius: number): Crease[] {
  if (!Number.isSafeInteger(side) || side < 1) {
    throw new RangeError(`Hexagon side must be a safe integer >= 1, got ${side}`);
  }
  if (!Number.isSafeInteger(frameRadius) || frameRadius < side + 1) {
    throw new RangeError(`Frame radius must be a safe integer >= side + 1, got ${frameRadius}`);
  }
  const creases: Crease[] = [];
  const length = frameRadius - side;
  const corner = (k: number) => rotate(eis(side, 0), k);
  for (let k = 0; k < 6; k++) {
    const p = corner(k);
    creases.push({ from: p, to: corner(k + 1), assignment: "M" });
    creases.push({ from: p, to: add(p, scale(rotate(eis(1, 0), k), length)), assignment: "M" });
    creases.push({ from: p, to: add(p, scale(rotate(eis(1, 0), k + 1), length)), assignment: "V" });
  }
  // The ring walks from each corner R·uᵏ toward R·uᵏ⁺¹ along uᵏ⁺²: R unit steps per side.
  for (let k = 0; k < 6; k++) {
    const step = rotate(eis(1, 0), k + 2);
    let p = scale(rotate(eis(1, 0), k), frameRadius);
    for (let i = 0; i < frameRadius; i++) {
      const q = add(p, step);
      creases.push({ from: p, to: q, assignment: "B" });
      p = q;
    }
  }
  return creases;
}

/**
 * Builds the hexagon twist as a crease pattern.
 *
 * The six corners Pₖ are the only interior vertices, so a validator run over the result checks
 * exactly the twist's vertices. See {@link hexagonTwistCreases} for the construction.
 *
 * @param side - hexagon side s, a safe integer ≥ 1
 * @param frameRadius - frame radius R, a safe integer ≥ s + 1
 * @throws RangeError as {@link hexagonTwistCreases} does
 */
export function hexagonTwist(side: number, frameRadius: number): CreasePattern {
  return fromSegments([], hexagonTwistCreases(side, frameRadius));
}
