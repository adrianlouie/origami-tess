/**
 * Layered view of a flat-folded pattern: which face is visible where, even when no global order exists.
 *
 * Sits at the end of the "solve" stage of the data flow (… → validate → solve → simulate/render),
 * after `near-foldability.ts`, and is the input of the layered render in `app/render/`. A stacking
 * model (`layer-order.ts`) says, for every pair of overlapping faces, which one is on top. That
 * relation need not be a linear order: the hexagon twists stack six faces in a ring, each pair
 * ordered but no face on top of the ring, so a painter's algorithm over one sorted list is
 * impossible. The pairwise relation is still enough to say what is visible at any point: the faces
 * covering a point share that point, so the transitivity clauses of `stacking.ts` order them
 * totally there, and the visible face is the one with no covering face above it. The renderer
 * therefore masks each face by the faces above it instead of sorting.
 *
 * A pattern that folds only in part is viewed without its repair faces (`minimumRepair`): the
 * stacking of the rest is consistent, and the dropped faces are reported so they can be marked.
 */

import { checkedMul, type Eisenstein } from "../lattice/eisenstein";
import { onSegment, windingNumber } from "../lattice/direction";
import { apply } from "../symmetry/affine";
import type { CreasePattern } from "../pattern/crease-pattern";
import { isAbove, layerOrderOf } from "./layer-order";
import { nearFoldability, stackingCnf, type NearFoldability } from "./near-foldability";
import { foldedTriangles, type Triangle } from "./overlap";
import { solveClauses } from "./solver";
import type { Folded, StackingFormula } from "./stacking";

/** A point (a/d, b/d) in lattice coordinates; the common denominator keeps sample points exact. */
export type ScaledPoint = { readonly a: number; readonly b: number; readonly d: number };

/** A flat-folded pattern with a stacking of its kept faces. */
export type LayeredView = {
  /** `ok` when every face is kept; `partial` when the repair faces were dropped. */
  readonly status: "ok" | "partial";
  readonly folded: Folded;
  readonly formula: StackingFormula;
  /** `above[k]` is true when face i lies above face j for `formula.pairs[k]` = [i, j]. */
  readonly above: readonly boolean[];
  /** Sorted faces given up so that the rest stacks consistently; empty when `ok`. */
  readonly dropped: readonly number[];
  /** Sorted edges that fight in a minimal conflict; empty when `ok`. */
  readonly conflictCreases: readonly number[];
  /** `outlines[f]` is the boundary walk of face f at its folded position (exact). */
  readonly outlines: readonly (readonly Eisenstein[])[];
  /** `triangles[f]` is the triangulation of face f in the folded plane. */
  readonly triangles: readonly (readonly Triangle[])[];
};

/**
 * Solves the stacking clauses that do not involve any of the dropped faces.
 *
 * Giving a face up removes every clause that mentions it (`stackingCnf` tags each clause with the
 * faces of the pairs it names). `minimumRepair` guarantees that the remaining clauses are
 * satisfiable for the repair set it returns; for other sets the answer may be null.
 *
 * @param formula - the stacking formula of the pattern
 * @param drop - faces to give up
 * @returns a model indexed like `formula.pairs`, or null when the kept clauses contradict
 */
export function stackWithout(formula: StackingFormula, drop: readonly number[]): boolean[] | null {
  const dropped = new Set(drop);
  const cnf = stackingCnf(formula);
  const kept = cnf.clauses.filter((_, k) => !cnf.tags[k]!.some((f) => dropped.has(f)));
  return solveClauses(cnf.variableCount, kept);
}

/**
 * Builds the layered view of a crease pattern.
 *
 * For a foldable pattern the model comes from `layerOrderOf`, which steers away from cyclic models
 * where a linear order exists. For a partly foldable one it is a model of the clauses without the
 * minimum repair faces; those faces are reported in `dropped` and the creases of one minimal
 * conflict in `conflictCreases`.
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @returns the view, or `inconsistent` when the folds around a cycle do not close
 * @throws RangeError as `foldFaces` and `stackingClauses` do
 */
export function layeredView(
  cp: CreasePattern,
): LayeredView | Exclude<NearFoldability, { status: "ok" | "partial" }> {
  const nf = nearFoldability(cp);
  if (nf.status !== "ok" && nf.status !== "partial") return nf;
  const triangles = foldedTriangles(cp, nf.folded.transforms);
  const outlines = cp.faces.map((face, f) =>
    face.map((v) => apply(nf.folded.transforms[f]!, cp.vertices[v]!)),
  );
  if (nf.status === "ok") {
    const stacked = layerOrderOf(cp, nf.folded);
    if (stacked.status !== "ok") throw new Error("Foldable pattern has no stacking model");
    return Object.freeze({
      status: "ok",
      folded: nf.folded,
      formula: nf.formula,
      above: stacked.above,
      dropped: Object.freeze([]),
      conflictCreases: Object.freeze([]),
      outlines,
      triangles,
    });
  }
  const model = stackWithout(nf.formula, nf.repair.faces);
  // The repair is defined as a set whose removal leaves the clauses satisfiable.
  if (model === null) throw new Error("Stacking clauses unsatisfiable without the repair faces");
  return Object.freeze({
    status: "partial",
    folded: nf.folded,
    formula: nf.formula,
    above: Object.freeze(model),
    dropped: nf.repair.faces,
    conflictCreases: nf.conflict.creases,
    outlines,
    triangles,
  });
}

/**
 * The kept faces that lie above face f somewhere (they overlap it and the model puts them on top).
 *
 * @returns sorted face indices; empty when f is itself dropped, since a dropped face is not stacked
 * @throws RangeError if f is not a face of the view
 */
export function facesAbove(view: LayeredView, f: number): number[] {
  if (!Number.isInteger(f) || f < 0 || f >= view.triangles.length) {
    throw new RangeError(`Face ${f} is not in 0..${view.triangles.length - 1}`);
  }
  if (view.dropped.includes(f)) return [];
  const out: number[] = [];
  view.formula.pairs.forEach(([i, j], k) => {
    const top = view.above[k]! ? i : j;
    const bottom = view.above[k]! ? j : i;
    if (bottom === f && !view.dropped.includes(top)) out.push(top);
  });
  return out.sort((x, y) => x - y);
}

/**
 * Is p strictly inside the polygon? Exact: the scale d multiplies the vertices.
 *
 * Inside means off every edge and with a non-zero winding number (`windingNumber` needs p off the
 * boundary, which the edge test guarantees). Testing the whole outline, not its triangles, matters:
 * a point on an internal diagonal of the ear-clipping triangulation lies in the face but strictly
 * inside none of its triangles.
 */
function strictlyInside(outline: readonly Eisenstein[], p: ScaledPoint): boolean {
  const poly = outline.map((v) => ({ a: checkedMul(v.a, p.d), b: checkedMul(v.b, p.d) }));
  const q = { a: p.a, b: p.b };
  const onEdge = poly.some((v, i) => onSegment(v, poly[(i + 1) % poly.length]!, q));
  return !onEdge && windingNumber(poly, q) !== 0;
}

/**
 * The visible face at a point of the folded plane.
 *
 * Among the kept faces whose interiors contain p, the visible one is the face that no other
 * covering face is above. Two faces covering p overlap, so the stacking relation orders them, and
 * the transitivity clauses of `stackingClauses` (any three faces sharing a point) make the covering
 * faces totally ordered, so exactly one face is visible. This holds even when the whole relation
 * has a cycle elsewhere.
 *
 * @param view - from {@link layeredView}
 * @param p - a point not on any crease line; points on a boundary are covered by no face
 * @returns the face, or null when no kept face covers p
 * @throws RangeError if p is not an integer point over a positive integer denominator
 * @throws Error if the covering faces are not totally ordered (would be a solver bug)
 */
export function topFaceAt(view: LayeredView, p: ScaledPoint): number | null {
  if (!Number.isInteger(p.a) || !Number.isInteger(p.b) || !Number.isInteger(p.d) || p.d <= 0) {
    throw new RangeError(
      `Point needs integer a, b and an integer d > 0, got ${p.a}, ${p.b}, ${p.d}`,
    );
  }
  const cover: number[] = [];
  view.outlines.forEach((outline, f) => {
    if (!view.dropped.includes(f) && strictlyInside(outline, p)) cover.push(f);
  });
  if (cover.length === 0) return null;
  const tops = cover.filter((f) => cover.every((g) => g === f || isAbove(view, f, g) === true));
  if (tops.length !== 1) {
    throw new Error(`Faces ${cover.join(", ")} cover the point but have ${tops.length} top faces`);
  }
  return tops[0]!;
}
