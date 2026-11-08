/**
 * Triangle twist gadget: the three-pleat twist fold on the triangular lattice.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * …), next to the hexagon twist. It emits creases as exact Eisenstein segments with a full
 * mountain/valley assignment, and `triangleTwist` hands them to `fromSegments` so the validators
 * can read the result. All arithmetic is on integers; no angle is ever computed.
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), ch. 5; Gjerde, "Origami
 * Tessellations" (2009).
 */

import { add, eis, mul, OMEGA, type Eisenstein } from "../lattice/eisenstein";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { scale, type Crease } from "./crease";

/**
 * Lists the creases of a triangle twist of side n with rays of length m inside a triangular frame.
 *
 * Construction: with ω = e^{2πi/3} and u = 1 + ω = e^{iπ/3}, the triangle has corners P₀ = 0,
 * P₁ = n, P₂ = n·u, counter-clockwise. The map ρ(z) = ωz + n turns the plane by 2π/3 radians and
 * permutes the corners (ρ(P₀) = P₁, ρ(P₁) = P₂, ρ(P₂) = P₀ because ω·nu + n = n(ω + ω²) + n = 0).
 * At P₁ the triangle edges leave along ω and −1; two rays of length m leave along +1 (M) and
 * ω̄ = −1 − ω (V). The creases at P₂ and P₀ are the images of those under ρ and ρ², so the
 * gadget has threefold symmetry. Each ray is parallel to a ray of opposite assignment at the next
 * corner, giving three pleats.
 *
 * Sectors at P₁ are 2π/3, π/3, π/3, 2π/3 (radians) counter-clockwise from the +1 ray, so the
 * alternating sum is 2π/3 + π/3 = π and Kawasaki holds for every n and m. Three M and one V give
 * Maekawa. The lone V bounds the two small sectors together with two M creases, so the three
 * creases around the small run are not all equal and Big-Little-Big holds.
 *
 * The frame is the triangle with corners A₀ = −m(2 + ω), A₁ = n + m(1 − ω) and A₂ = ρ(A₁), whose
 * side n + 3m is listed as unit "B" edges. Without a frame the regions between pleats are
 * unbounded and no vertex is interior, so the validators would pass vacuously; listing every
 * frame point also avoids T-junctions where a ray ends. Every ray ends in the interior of a
 * frame side, never at a frame corner.
 *
 * @param side - triangle side n, a safe integer ≥ 1 (lattice units)
 * @param rayLength - ray length m, a safe integer ≥ 1 (lattice units)
 * @throws RangeError for sizes outside those ranges or too large for exact arithmetic
 */
export function triangleTwistCreases(side: number, rayLength: number): Crease[] {
  if (!Number.isSafeInteger(side) || side < 1) {
    throw new RangeError(`Triangle side must be a safe integer >= 1, got ${side}`);
  }
  if (!Number.isSafeInteger(rayLength) || rayLength < 1) {
    throw new RangeError(`Ray length must be a safe integer >= 1, got ${rayLength}`);
  }
  const n = side;
  const m = rayLength;
  const rho = (z: Eisenstein): Eisenstein => add(mul(OMEGA, z), eis(n, 0));
  const p1 = eis(n, 0);
  const p2 = rho(p1);
  const p0 = rho(p2);

  // Creases at P₁ and their images under ρ, ρ² (a Crease is mapped endpoint by endpoint).
  const atP1: Crease[] = [
    { from: p1, to: p2, assignment: "M" },
    { from: p1, to: p0, assignment: "M" },
    { from: p1, to: add(p1, scale(eis(1, 0), m)), assignment: "M" },
    { from: p1, to: add(p1, scale(eis(-1, -1), m)), assignment: "V" },
  ];
  const creases: Crease[] = [];
  let current = atP1;
  for (let k = 0; k < 3; k++) {
    creases.push(...current);
    current = current.map((c) => ({ ...c, from: rho(c.from), to: rho(c.to) }));
  }

  // Frame: side A_k → A_{k+1} runs along ωᵏ, and A_{k+1} = ρ(A_k).
  const frameSide = n + 3 * m;
  let corner = eis(-2 * m, -m);
  let step = eis(1, 0);
  for (let k = 0; k < 3; k++) {
    let p = corner;
    for (let i = 0; i < frameSide; i++) {
      const q = add(p, step);
      creases.push({ from: p, to: q, assignment: "B" });
      p = q;
    }
    corner = rho(corner);
    step = mul(OMEGA, step);
  }
  return creases;
}

/**
 * Builds the triangle twist as a crease pattern.
 *
 * The three corners Pₖ are the only interior vertices, so a validator run over the result checks
 * exactly the twist's vertices. See {@link triangleTwistCreases} for the construction.
 *
 * @param side - triangle side n, a safe integer ≥ 1
 * @param rayLength - ray length m, a safe integer ≥ 1
 * @throws RangeError as {@link triangleTwistCreases} does
 */
export function triangleTwist(side: number, rayLength: number): CreasePattern {
  return fromSegments([], triangleTwistCreases(side, rayLength));
}
