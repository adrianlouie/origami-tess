/**
 * Star twist gadget: a six-pointed (hexagram) collapse on the triangular lattice.
 *
 * Sits at the "gadgets" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * …), next to the hexagon and triangle twists. It emits creases as exact Eisenstein segments with a
 * full mountain/valley assignment, and `starTwist` hands them to `fromSegments` so the validators
 * can read the result. All arithmetic is on integers; no angle is ever computed.
 *
 * This is a collapsed star, not a rotating twist: the hexagram outline is creased, and the
 * creases inside and around it make every vertex locally flat-foldable. Local flatness does not
 * imply the whole pattern folds flat, so the gadget comes in two variants that share every crease
 * position and differ only in which creases are mountain and which are valley (see
 * {@link StarFold}): `full` folds flat with a layer order, `partial` folds flat except for a small
 * region (4 of 30 faces, score 50/54 from `nearFoldability`). Both are kept on purpose: a pattern
 * that collapses except for a little at the end is a legitimate design, and the partial variant is
 * the repo's worked example of one.
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), ch. 5; Gjerde, "Origami
 * Tessellations" (2009).
 */

import { add, eis, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { hexagonFrame, rotate, scale, type Crease } from "./crease";

/**
 * Which mountain/valley assignment of the star's creases to use.
 *
 * - `full`: folds flat. The stacking clauses are satisfiable, there is a linear layer order, and the
 *   physical layer oracle finds no broken rule in it. Found by searching the locally valid
 *   assignments with half-turn symmetry (500 sampled, 2 fold), then checked as above; it is not
 *   derived from a closed form, so it is given as the table {@link FULL_ROWS}.
 * - `partial`: locally valid but not flat-foldable as a whole. `nearFoldability` gives score 50/54:
 *   giving up 4 of the 30 faces leaves the rest stacking consistently. "Giving up" a face drops its
 *   stacking constraints; it measures distance from folding and does not claim the remaining paper
 *   folds without those faces (see `near-foldability.ts`).
 */
export type StarFold = "full" | "partial";

/**
 * The `full` assignment, one row per k mod 3, one letter per crease in the order a, b, e, g, h, x,
 * y⁺, y⁻ (the order `starTwistCreases` emits them for one k). The rows repeat every three spokes, so
 * the assignment is invariant under the half-turn z ↦ −z but not under a 120° turn. The centre
 * spokes read V, M, V, V, M, V: two M and four V (Maekawa).
 */
const FULL_ROWS = ["VVVMMMVV", "MVMVMMVV", "VMVMMMMV"] as const;

/** The opposite fold direction; only "M" and "V" are flipped. */
const flip = (a: "M" | "V"): "M" | "V" => (a === "M" ? "V" : "M");

/**
 * Lists the creases of a star twist of size s inside a hexagonal frame of radius 3s.
 *
 * Construction: with ω = e^{2πi/3}, u = 1 + ω = e^{iπ/3} (`rot60`) and indices k taken mod 6, the
 * vertices are the centre O = 0, the inner corners Pₖ = s·uᵏ, the tips Tₖ = Pₖ + Pₖ₊₁ (the apex of
 * the equilateral triangle on the side PₖPₖ₊₁) and the outer corners Qₖ = 2s·uᵏ. The creases, each
 * of length s, are
 *   aₖ = O→Pₖ, bₖ = Pₖ→Qₖ  (a spoke through Pₖ),
 *   eₖ = Pₖ→Tₖ, gₖ = Pₖ₊₁→Tₖ  (the hexagram outline),
 *   hₖ = Tₖ→Qₖ₊₁  (half of the outer hexagon edge),
 *   xₖ = Tₖ→Tₖ + s·uᵏ  (gₖ continued straight through the tip, to the frame),
 *   y⁺ₖ = Qₖ→Qₖ + s·uᵏ⁺¹ and y⁻ₖ = Qₖ→Qₖ + s·uᵏ⁻¹  (two rays from Qₖ to the frame).
 * The hexagram's inner hexagon edges are deliberately not creased: they would leave Pₖ with
 * sectors π/3, 2π/3, π/3, 2π/3 and fail Kawasaki. The first construction tried, which kept the
 * whole outer hexagon (both halves at each tip), also failed: at Tₖ the sectors were π/3, π/3,
 * π/3, π (radians), so the odd-position sum was 2π/3, not π. Extending gₖ straight through the tip
 * is what restores 2π/3, π/3, π/3, 2π/3 there.
 *
 * Sectors (radians, counter-clockwise from the first crease listed) and the Kawasaki sum:
 *   O: six sectors of π/3 (odd sum π); Pₖ: π/3, 2π/3, 2π/3, π/3; Tₖ and Qₖ: 2π/3, π/3, π/3, 2π/3.
 * Each degree-4 vertex has a single small run of two π/3 sectors, bounded by three creases, so
 * Big-Little-Big asks only that those three not all agree.
 *
 * Mountain/valley, `partial` variant: let pₖ = M, V, V repeating (k = 0, 1, 2, 3, 4, 5) and ¬ swap
 * M and V. Then
 *   aₖ = bₖ = pₖ,  eₖ = V,  gₖ = M,  hₖ = xₖ = y⁺ₖ = y⁻ₖ = ¬pₖ₊₁.
 * The centre carries aₖ = M, V, V, M, V, V: two M and four V, so |#M − #V| = 2 (Maekawa). It
 * cannot be a 3-fold or 6-fold pattern in M/V, since an alternating or uniform spoke assignment
 * gives 3/3 or 6/0 at the centre. The pattern is invariant under the half-turn z ↦ −z, assignments
 * included. Every degree-4 vertex is 3 + 1, and the unit tests confirm Big-Little-Big for
 * every size.
 *
 * Mountain/valley, `full` variant: the table {@link FULL_ROWS} indexed by k mod 3. It is also
 * half-turn symmetric and has two M and four V at the centre, and every degree-4 vertex is 3 + 1,
 * so it passes the same local checks; unlike `partial`, its stacking is consistent.
 *
 * The frame is the hexagonal ring at hexDistance 3s, listed as unit "B" edges. The rays xₖ and y⁺ₖ
 * end on the same ring point, (3s, s) for k = 0, so a larger frame would make them cross and a
 * smaller one would cut them short; that is why the frame radius is fixed at 3s. No ray ends at a
 * ring corner, so there are no T-junctions.
 *
 * @param side - star size s, a safe integer ≥ 1 (lattice units)
 * @param fold - which M/V assignment to use, see {@link StarFold}; default `full`
 * @throws RangeError for sizes outside that range, too large for exact arithmetic, or an unknown
 *   `fold`
 */
export function starTwistCreases(side: number, fold: StarFold = "full"): Crease[] {
  if (!Number.isSafeInteger(side) || side < 1) {
    throw new RangeError(`Star size must be a safe integer >= 1, got ${side}`);
  }
  if (fold !== "full" && fold !== "partial") {
    throw new RangeError(`Star fold must be "full" or "partial", got ${String(fold)}`);
  }
  const s = side;
  const unit = (k: number) => rotate(eis(1, 0), k % 6);
  const corner = (k: number) => scale(unit(k), s);
  const outer = (k: number) => scale(unit(k), 2 * s);
  const tip = (k: number) => add(corner(k), corner(k + 1));
  const pleat = (k: number): "M" | "V" => (k % 3 === 0 ? "M" : "V");
  const creases: Crease[] = [];
  const push = (from: Eisenstein, to: Eisenstein, assignment: Assignment) =>
    creases.push({ from, to, assignment });
  for (let k = 0; k < 6; k++) {
    const p = pleat(k % 6);
    const q = flip(pleat((k + 1) % 6));
    const row = FULL_ROWS[k % 3]!;
    // Role r is the r-th crease of the row: a, b, e, g, h, x, y⁺, y⁻.
    const pick = (role: number, partial: "M" | "V"): "M" | "V" =>
      fold === "full" ? (row[role] as "M" | "V") : partial;
    push(ZERO, corner(k), pick(0, p));
    push(corner(k), outer(k), pick(1, p));
    push(corner(k), tip(k), pick(2, "V"));
    push(corner(k + 1), tip(k), pick(3, "M"));
    push(tip(k), outer(k + 1), pick(4, q));
    push(tip(k), add(tip(k), scale(unit(k), s)), pick(5, q));
    push(outer(k), add(outer(k), scale(unit(k + 1), s)), pick(6, q));
    push(outer(k), add(outer(k), scale(unit(k + 5), s)), pick(7, q));
  }
  creases.push(...hexagonFrame(3 * s));
  return creases;
}

/**
 * Builds the star twist as a crease pattern.
 *
 * The 19 points O, Pₖ, Tₖ and Qₖ are the only interior vertices, so a validator run over the
 * result checks exactly the star's vertices. See {@link starTwistCreases} for the construction.
 *
 * @param side - star size s, a safe integer ≥ 1
 * @param fold - which M/V assignment to use, see {@link StarFold}; default `full`
 * @throws RangeError as {@link starTwistCreases} does
 */
export function starTwist(side: number, fold: StarFold = "full"): CreasePattern {
  return fromSegments([], starTwistCreases(side, fold));
}
