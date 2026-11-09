/**
 * Near-foldability: where a pattern fails to fold, and how much of it still would.
 *
 * Sits at the end of the "solve" stage of the data flow (… → validate → solve → simulate/render),
 * after `layer-order.ts`, which only says `ok` or `unfoldable`. Real tessellations are often
 * foldable in part, so this module names a minimal set of faces (or vertices) whose constraints
 * contradict each other, and the cheapest set to give up to make the rest consistent. The answer
 * feeds the layered render (draw the foldable part, mark the conflict, step 5.3), the fold
 * simulation (what distortion the dropped constraints cost, step 6.2) and the repair loop of the
 * generator (change what the conflict names, step 8.2).
 *
 * Both searches are the tag-level ones of `conflict.ts`. For stacking, a tag is a face and a clause
 * is blamed on the faces of the pairs it mentions; for mountain/valley, a tag is a vertex. "Giving
 * up a face" means dropping every stacking constraint that involves it: this is a measure of how
 * far the pattern is from folding, not a claim that the remaining paper folds without it.
 */

import { faceDoubledArea, type CreasePattern } from "../pattern/crease-pattern";
import type { Clause, MvFormula } from "./clauses";
import { localMvClauses } from "./clauses";
import { minimalConflict, minimumRepair, type TaggedCnf } from "./conflict";
import { foldFaces, type FoldedFaces } from "./folded-faces";
import {
  stackingClauses,
  type Folded,
  type StackingClause,
  type StackingFormula,
} from "./stacking";

/** The part of the paper that still folds, as an exact fraction of the pattern's area. */
export type FoldableShare = {
  /** Doubled area of the faces that are kept. */
  readonly num: number;
  /** Doubled area of all faces. */
  readonly den: number;
};

/** The outcome of {@link nearFoldabilityOf}. */
export type NearFoldability =
  | {
      readonly status: "ok";
      readonly folded: Folded;
      readonly formula: StackingFormula;
      readonly score: FoldableShare;
    }
  | {
      readonly status: "partial";
      readonly folded: Folded;
      readonly formula: StackingFormula;
      /** A minimal set of faces whose stacking constraints contradict each other. */
      readonly conflict: {
        /** Sorted face indices; dropping any one makes the rest consistent. */
        readonly faces: readonly number[];
        /** The minimal contradicting clauses, with the crease or faces each one comes from. */
        readonly clauses: readonly StackingClause[];
        /** Sorted edge indices named by those clauses (the creases that fight). */
        readonly creases: readonly number[];
      };
      /** The least paper to give up so that the rest stacks consistently. */
      readonly repair: {
        /** Sorted face indices. */
        readonly faces: readonly number[];
        /** False when the search hit a limit and this is only an upper bound. */
        readonly exact: boolean;
        /** Every conflict that forced the repair; each contains a face of `faces`. */
        readonly conflicts: readonly (readonly number[])[];
      };
      readonly score: FoldableShare;
    }
  | Exclude<FoldedFaces, { readonly status: "ok" }>;

/**
 * Tags the stacking clauses by face.
 *
 * Variable k of the formula is the pair `pairs[k]`, so a clause is blamed on every face of every
 * pair its literals mention. This covers all six clause kinds without a case for each.
 */
export function stackingCnf(formula: StackingFormula): TaggedCnf {
  return {
    variableCount: formula.variableCount,
    clauses: formula.clauses.map((c) => c.literals),
    tags: formula.clauses.map((c) => {
      const faces = new Set<number>();
      for (const l of c.literals) for (const f of formula.pairs[Math.abs(l) - 1]!) faces.add(f);
      return [...faces].sort((a, b) => a - b);
    }),
  };
}

/** The edges a stacking clause is about. */
function creasesOf(clause: StackingClause): readonly number[] {
  switch (clause.kind) {
    case "crease":
    case "crossing":
      return [clause.edge];
    case "taco-taco":
    case "taco-tortilla":
    case "tortilla-tortilla":
      return clause.edges;
    case "transitivity":
      return [];
  }
}

/**
 * Measures how far an already folded pattern is from stacking consistently.
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @param folded - the result of `foldFaces`
 * @returns `ok` when the stacking clauses are satisfiable (score 1), otherwise `partial` with a
 *   minimal conflict, a minimum repair weighted by face area (so ties go to the least paper), and
 *   the share of area that is kept
 * @throws RangeError as `stackingClauses` does
 */
export function nearFoldabilityOf(cp: CreasePattern, folded: Folded): NearFoldability {
  const formula = stackingClauses(cp, folded);
  const cnf = stackingCnf(formula);
  const area = cp.faces.map((face) => faceDoubledArea(cp.vertices, face));
  const total = area.reduce((a, b) => a + b, 0);
  const conflict = minimalConflict(cnf);
  if (conflict === null) {
    return Object.freeze({
      status: "ok",
      folded,
      formula,
      score: Object.freeze({ num: total, den: total }),
    });
  }
  const repair = minimumRepair(cnf, (face) => area[face]!);
  // Every stacking clause names two faces, so none is hard and a repair always exists.
  if (repair === null) throw new Error("Stacking clauses unsatisfiable without any face");
  const clauses = conflict.clauses.map((c) => formula.clauses[c]!);
  const creases = [...new Set(clauses.flatMap((c) => creasesOf(c)))].sort((a, b) => a - b);
  const given = repair.removed.reduce((sum, f) => sum + area[f]!, 0);
  return Object.freeze({
    status: "partial",
    folded,
    formula,
    conflict: Object.freeze({ faces: conflict.tags, clauses, creases }),
    repair: Object.freeze({
      faces: repair.removed,
      exact: repair.exact,
      conflicts: repair.conflicts,
    }),
    score: Object.freeze({ num: total - given, den: total }),
  });
}

/**
 * Folds a crease pattern and measures how far it is from stacking consistently.
 *
 * @param cp - a pattern with every crease assigned M, V, F or B
 * @returns see {@link nearFoldabilityOf}, or `inconsistent` when the folds around a cycle do not close
 * @throws RangeError as `foldFaces` and `stackingClauses` do
 */
export function nearFoldability(cp: CreasePattern): NearFoldability {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") return folded;
  return nearFoldabilityOf(cp, folded);
}

/**
 * Tags the local mountain/valley clauses by vertex.
 *
 * Fixed creases (already M or V) are hard; the Maekawa and Big-Little-Big clauses of a vertex are
 * blamed on it, so giving a vertex up means not requiring it to be locally flat-foldable.
 */
export function mvCnf(formula: MvFormula): TaggedCnf {
  return {
    variableCount: formula.variableCount,
    clauses: formula.clauses.map((c) => c.literals),
    tags: formula.clauses.map((c) => (c.kind === "fixed" ? [] : [c.vertex])),
  };
}

/** The outcome of {@link mvConflict}. */
export type MvConflict =
  | { readonly status: "sat" }
  | { readonly status: "kawasaki"; readonly vertices: readonly number[] }
  | {
      readonly status: "unsat";
      /** A minimal set of vertices whose clauses contradict each other, and those clauses. */
      readonly conflict: {
        readonly vertices: readonly number[];
        readonly clauses: readonly Clause[];
      };
      /** The fewest vertices to stop requiring, and whether that is proven the fewest. */
      readonly repair: { readonly vertices: readonly number[]; readonly exact: boolean };
    };

/**
 * Explains why a pattern's local mountain/valley conditions cannot be met.
 *
 * Improves on the `unsat.vertices` of `solveMv`, which is not minimal and is empty when branching
 * was needed. Kawasaki failures are geometric, so they are reported as they are: no assignment of
 * M and V, and no choice of vertices to give up, changes them.
 *
 * @throws RangeError as `localMvClauses` does
 */
export function mvConflict(cp: CreasePattern): MvConflict {
  const formula = localMvClauses(cp);
  if (formula.kawasaki.length > 0) return { status: "kawasaki", vertices: formula.kawasaki };
  const cnf = mvCnf(formula);
  const conflict = minimalConflict(cnf);
  if (conflict === null) return { status: "sat" };
  const repair = minimumRepair(cnf);
  // Fixed creases are unit clauses on distinct variables, so the hard clauses alone are satisfiable.
  if (repair === null) throw new Error("Local clauses unsatisfiable without any vertex");
  return {
    status: "unsat",
    conflict: {
      vertices: conflict.tags,
      clauses: conflict.clauses.map((c) => formula.clauses[c]!),
    },
    repair: { vertices: repair.removed, exact: repair.exact },
  };
}
