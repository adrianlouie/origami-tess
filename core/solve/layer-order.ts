/**
 * Layer order of a flat-folded crease pattern: from a satisfying model to a stacking of the faces.
 *
 * Sits at the end of the "solve" stage of the data flow (… → validate → solve → simulate/render),
 * after `stacking.ts`: that module says which "above" relations are allowed, this one finds one,
 * and arranges it as a list of faces from the top sheet down, the input of the layered render
 * (step 5.3) and of the repair of unfoldable gadgets (step 5.2b).
 *
 * The clauses only force the relation to be transitive where three faces share a point. Three
 * pairwise-overlapping faces in a ring may legally be stacked cyclically (each pair is ordered, but
 * no one face is on top), so a model can fail to be a linear order even though it is a valid
 * folding. Such a model is steered away from by blocking the cycle and solving again (lazy
 * constraint generation); if every model has a cycle the folding is still reported, with `order`
 * null, and the render has to order the faces region by region.
 */

import type { CreasePattern } from "../pattern/crease-pattern";
import { foldFaces, type FoldedFaces } from "./folded-faces";
import { solveClauses } from "./solver";
import { aboveLiteral, stackingClauses, type Folded, type StackingFormula } from "./stacking";

/** How many cycle-blocking clauses are added before giving up on a global order. */
export const MAX_CYCLE_ROUNDS = 1000;

/** The outcome of {@link layerOrder}. */
export type LayerOrder =
  | {
      readonly status: "ok";
      readonly folded: Folded;
      readonly formula: StackingFormula;
      /** `above[k]` is true when face i lies above face j for `formula.pairs[k]` = [i, j]. */
      readonly above: readonly boolean[];
      /**
       * Every face, from the top sheet (nearest the viewer) down, or null when the folding has no
       * global order (see the module comment). Faces that overlap nothing are placed too, in
       * index order among the free choices.
       */
      readonly order: readonly number[] | null;
    }
  | { readonly status: "unfoldable"; readonly folded: Folded; readonly formula: StackingFormula }
  | Exclude<FoldedFaces, { readonly status: "ok" }>;

/**
 * Sorts faces by a set of "above" arcs, top first.
 *
 * Kahn's topological sort (Kahn, "Topological sorting of large networks", CACM 1962) that always
 * takes the smallest-index face with nothing above it, so the result is deterministic. If the arcs
 * contain a cycle the sort stalls with every remaining face still having a remaining face above
 * it; walking from any of them to an upper neighbour must repeat a face, and that loop is a cycle.
 *
 * @param faceCount - faces are 0 … faceCount − 1
 * @param arcs - `[hi, lo]`: face hi lies above face lo
 * @returns the order, or a cycle `c` with `c[k]` above `c[k + 1]` and the last above the first
 */
export function orderFromRelation(
  faceCount: number,
  arcs: readonly (readonly [number, number])[],
): { readonly order: number[] } | { readonly cycle: number[] } {
  const below: number[][] = Array.from({ length: faceCount }, () => []);
  const above: number[][] = Array.from({ length: faceCount }, () => []);
  const waiting = new Array<number>(faceCount).fill(0);
  for (const [hi, lo] of arcs) {
    below[hi]!.push(lo);
    above[lo]!.push(hi);
    waiting[lo]!++;
  }
  const placed = new Array<boolean>(faceCount).fill(false);
  const order: number[] = [];
  while (order.length < faceCount) {
    const next = waiting.findIndex((w, f) => w === 0 && !placed[f]);
    if (next < 0) break;
    placed[next] = true;
    order.push(next);
    for (const lo of below[next]!) waiting[lo]!--;
  }
  if (order.length === faceCount) return { order };

  // Every unplaced face has an unplaced face above it; follow those upward until one repeats.
  const walk: number[] = [placed.findIndex((p) => !p)];
  const at = new Map<number, number>([[walk[0]!, 0]]);
  for (;;) {
    const upper = above[walk[walk.length - 1]!]!.find((f) => !placed[f])!;
    const seen = at.get(upper);
    if (seen !== undefined) {
      // walk[seen..] climbs the cycle, each face below the next; reverse to read top to bottom.
      return { cycle: walk.slice(seen).reverse() };
    }
    at.set(upper, walk.length);
    walk.push(upper);
  }
}

/**
 * Solves stacking clauses and arranges the model as a list, steering away from cyclic models.
 *
 * Solves, sorts the model's "above" relation with {@link orderFromRelation}, and while the sort
 * finds a cycle adds a clause that forbids exactly that cycle and solves again, up to
 * {@link MAX_CYCLE_ROUNDS} times. Each blocking clause is implied by the existence of a linear
 * order (some arc of a cycle must go the other way), so it never removes a model that has one.
 *
 * @param faceCount - number of faces in the pattern
 * @param formula - the stacking formula; only `variableCount`, `pairs` and the clause literals are read
 * @returns null if the clauses are unsatisfiable; otherwise a model with its order, or, when every
 *   model is cyclic (or the round limit is hit), the first model with `order` null
 */
export function stackFaces(
  faceCount: number,
  formula: Pick<StackingFormula, "variableCount" | "pairs" | "clauses">,
): { readonly above: boolean[]; readonly order: number[] | null } | null {
  const cnf: (readonly number[])[] = formula.clauses.map((c) => c.literals);
  const first = solveClauses(formula.variableCount, cnf);
  if (first === null) return null;
  const arcsOf = (model: readonly boolean[]) =>
    formula.pairs.map(([i, j], k) => (model[k] ? [i, j] : [j, i]) as [number, number]);
  let model: boolean[] = first;
  for (let round = 0; round <= MAX_CYCLE_ROUNDS; round++) {
    const result = orderFromRelation(faceCount, arcsOf(model));
    if ("order" in result) return { above: model, order: result.order };
    // Forbid this exact cycle: at least one of its arcs must go the other way.
    const { cycle } = result;
    cnf.push(cycle.map((f, k) => -aboveLiteral(formula, f, cycle[(k + 1) % cycle.length]!)));
    const next = solveClauses(formula.variableCount, cnf);
    if (next === null) break;
    model = next;
  }
  return { above: first, order: null };
}

/**
 * Finds a layer order of an already folded pattern.
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @param folded - the result of `foldFaces`
 * @returns `ok` with a model of the stacking clauses and, if one exists, a global order that is a
 *   linear extension of it; `unfoldable` when the clauses are unsatisfiable
 * @throws RangeError as {@link stackingClauses} does
 */
export function layerOrderOf(cp: CreasePattern, folded: Folded): LayerOrder {
  const formula = stackingClauses(cp, folded);
  const stacked = stackFaces(cp.faces.length, formula);
  if (stacked === null) return Object.freeze({ status: "unfoldable", folded, formula });
  return Object.freeze({
    status: "ok",
    folded,
    formula,
    above: Object.freeze(stacked.above),
    order: stacked.order === null ? null : Object.freeze(stacked.order),
  });
}

/**
 * Finds a layer order of a crease pattern: folds it, builds the stacking clauses and solves them.
 *
 * Passing the local validators does not imply a pattern folds flat (see `stacking.ts`); `unfoldable`
 * is the global verdict.
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @returns the order, `unfoldable`, or `inconsistent` when the folds around a cycle do not close
 * @throws RangeError as {@link foldFaces} and {@link stackingClauses} do
 */
export function layerOrder(cp: CreasePattern): LayerOrder {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") return folded;
  return layerOrderOf(cp, folded);
}

/**
 * Does face p lie above face q in a found stacking?
 *
 * @returns undefined when the two faces do not overlap (no variable) or are the same face
 */
export function isAbove(
  result: { readonly formula: StackingFormula; readonly above: readonly boolean[] },
  p: number,
  q: number,
): boolean | undefined {
  if (p === q) return undefined;
  const [i, j] = p < q ? [p, q] : [q, p];
  const k = result.formula.pairs.findIndex(([a, b]) => a === i && b === j);
  if (k < 0) return undefined;
  return p < q ? result.above[k] : !result.above[k];
}
