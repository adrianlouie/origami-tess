/**
 * Local mountain/valley constraints as Boolean clauses.
 *
 * Sits at the "solve" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). It turns the M/V conditions that `validate/` only checks (Maekawa and
 * Big-Little-Big at every interior vertex, Big-Little-Big alone at every vertex on the edge of the
 * sheet) into a CNF formula with one variable per crease, so the SAT/backtracking solver of step
 * 4.2 can search for an assignment. The formula is exact for those conditions: an assignment
 * satisfies it iff `checkLocalFlatFoldability` reports no Maekawa or Big-Little-Big failure. They
 * are necessary only, so a solution still has to pass the global layer ordering of Phase 5.
 *
 * Variable numbering follows DIMACS: edge e is variable e + 1, a positive literal means mountain
 * and a negative literal means valley. Kawasaki depends only on geometry, so it yields no
 * clauses; vertices that fail it are reported so a solver can refuse them.
 *
 * Reference: Demaine & O'Rourke, "Geometric Folding Algorithms", §12.2 (Maekawa–Justin theorem
 * and the Big-Little-Big lemma); Biere et al., "Handbook of Satisfiability", ch. 2 (CNF, DIMACS).
 */

import { bigLittleBigFlat, singleVertexFlat, smallSectorRuns } from "../validate/big-little-big";
import { borderRuns } from "../validate/border-vertices";
import { foldingCreases, interiorVertices, kawasakiFlat } from "../validate/local-flat-foldability";
import type { CreasePattern } from "../pattern/crease-pattern";
import type { Eisenstein } from "../lattice/eisenstein";

/** A DIMACS literal: +(e + 1) is "edge e is a mountain", −(e + 1) is "edge e is a valley". */
export type Literal = number;

/** Where a clause comes from, so a solver can say which vertex made a pattern infeasible. */
export type ClauseSource =
  | { readonly kind: "fixed"; readonly edge: number }
  | {
      readonly kind: "maekawa" | "big-little-big" | "border-big-little-big" | "single-vertex";
      readonly vertex: number;
    };

/** A disjunction of literals; the empty clause is unsatisfiable. */
export type Clause = ClauseSource & { readonly literals: readonly Literal[] };

/** The CNF formula for a crease pattern. */
export type MvFormula = {
  /** Number of variables: one per edge, including edges that never appear in a clause. */
  readonly variableCount: number;
  readonly clauses: readonly Clause[];
  /** Interior vertices that fail Kawasaki: no M/V assignment can fix them. */
  readonly kawasaki: readonly number[];
};

/**
 * Largest vertex degree the Maekawa encoding accepts.
 *
 * Maekawa is a parity-sensitive cardinality condition, so its CNF needs on the order of 2ⁿ
 * clauses at degree n. 12 gives at most 4096 clauses per vertex; real tessellation vertices have
 * degree 4 to 6.
 */
export const MAX_ENCODED_DEGREE = 12;

const popcount = (x: number): number => {
  let c = 0;
  for (let v = x; v > 0; v >>= 1) c += v & 1;
  return c;
};

/** The literal "edge e is a mountain". */
const mountain = (e: number): Literal => e + 1;

/**
 * Builds the Maekawa and Big-Little-Big clauses for one vertex.
 *
 * Maekawa–Justin (D&O Thm 12.2.4): a flat-foldable vertex of degree n has #M − #V = ±2, that is
 * #M ∈ {n/2 − 1, n/2 + 1}. Each full assignment outside that set is excluded by one blocking
 * clause (the negation of the assignment), which gives 2ⁿ − 2·C(n, n/2 + 1) clauses. Odd degree
 * can never satisfy the theorem, so it yields the empty clause; so does degree 0 (#M = 0 is not
 * ±1), though `localMvClauses` never calls this for a vertex without folding creases.
 *
 * Big-Little-Big (D&O §12.2): for every run of small sectors from {@link smallSectorRuns}, the
 * bounding creases must not all agree, which is the pair (x₁ ∨ … ∨ x_m) and (¬x₁ ∨ … ∨ ¬x_m).
 * The lemma presumes Kawasaki, so these clauses are produced only when `directions` pass it.
 *
 * Hull's single-vertex test (Lang §1.2.7), {@link singleVertexFlat}, is exact where Big-Little-Big
 * is only necessary. At degree 6 and above, each assignment that passes Maekawa and Big-Little-Big
 * but fails Hull's reduction gets one blocking clause of kind "single-vertex", so the formula
 * accepts exactly the assignments that fold the vertex flat.
 *
 * @param vertex - vertex index, recorded on every clause
 * @param edges - edge indices of the folding creases, counter-clockwise
 * @param directions - the matching crease directions
 * @throws RangeError if the degree exceeds {@link MAX_ENCODED_DEGREE} or the lists differ in length
 */
export function vertexClauses(
  vertex: number,
  edges: readonly number[],
  directions: readonly Eisenstein[],
): Clause[] {
  const n = edges.length;
  if (directions.length !== n) {
    throw new RangeError(`Got ${n} edges but ${directions.length} directions`);
  }
  if (n > MAX_ENCODED_DEGREE) {
    throw new RangeError(`Vertex ${vertex} has degree ${n} > ${MAX_ENCODED_DEGREE}`);
  }
  const clauses: Clause[] = [];
  if (n % 2 === 1) {
    clauses.push({ kind: "maekawa", vertex, literals: [] });
  } else {
    for (let bits = 0; bits < 2 ** n; bits++) {
      const m = popcount(bits);
      if (m === n / 2 - 1 || m === n / 2 + 1) continue;
      // Bit i set means crease i is a mountain; the clause forbids exactly this assignment.
      const literals = edges.map((e, i) => ((bits >> i) & 1 ? -mountain(e) : mountain(e)));
      clauses.push({ kind: "maekawa", vertex, literals });
    }
  }
  if (kawasakiFlat(directions)) {
    for (const run of smallSectorRuns(directions)) {
      const lits = run.map((c) => mountain(edges[c]!));
      clauses.push({ kind: "big-little-big", vertex, literals: lits });
      clauses.push({ kind: "big-little-big", vertex, literals: lits.map((l) => -l) });
    }
    // Big-Little-Big is exact only up to degree 4. Hull's reduction decides the vertex at any
    // degree, so block each assignment that Maekawa and Big-Little-Big let through and it rejects.
    for (let bits = 0; n >= 6 && bits < 2 ** n; bits++) {
      const m = popcount(bits);
      if (m !== n / 2 - 1 && m !== n / 2 + 1) continue;
      const mv = edges.map((_, i) => ((bits >> i) & 1 ? "M" : "V") as "M" | "V");
      if (!bigLittleBigFlat(directions, mv) || singleVertexFlat(directions, mv)) continue;
      const literals = edges.map((e, i) => ((bits >> i) & 1 ? -mountain(e) : mountain(e)));
      clauses.push({ kind: "single-vertex", vertex, literals });
    }
  }
  return clauses;
}

/**
 * Encodes the local M/V conditions of a whole crease pattern.
 *
 * Creases already set to M or V get a unit clause, so the formula alone says whether the existing
 * assignment is allowed and a solver completes a partial assignment without special cases. "U"
 * creases are free; "B" and "F" creases never appear. Only interior vertices (see
 * {@link interiorVertices}) get Maekawa and Big-Little-Big, and vertices with only "F" creases are
 * skipped as trivially flat, as in `checkLocalFlatFoldability`. Vertices on the edge of the sheet
 * get Big-Little-Big alone, from {@link borderRuns}.
 *
 * @throws RangeError as {@link vertexClauses} does, or as `kawasakiFlat` does on overflow
 */
export function localMvClauses(cp: CreasePattern): MvFormula {
  const clauses: Clause[] = [];
  cp.edges.forEach((edge, e) => {
    if (edge.assignment === "M") clauses.push({ kind: "fixed", edge: e, literals: [mountain(e)] });
    if (edge.assignment === "V") clauses.push({ kind: "fixed", edge: e, literals: [-mountain(e)] });
  });
  const kawasaki: number[] = [];
  for (const v of interiorVertices(cp)) {
    const { edges, directions } = foldingCreases(cp, v);
    if (directions.length === 0) continue;
    if (!kawasakiFlat(directions)) kawasaki.push(v);
    clauses.push(...vertexClauses(v, edges, directions));
  }
  // A vertex on the edge of the sheet has no Kawasaki or Maekawa condition, but a strictly small
  // sector between two paper sectors still forces its two bounding creases to differ (Lang, p. 52,
  // Fig. 1.45). Without these clauses the solver returns assignments the layer stage rejects.
  for (const { vertex, edges } of borderRuns(cp)) {
    const lits = edges.map(mountain);
    clauses.push({ kind: "border-big-little-big", vertex, literals: lits });
    clauses.push({ kind: "border-big-little-big", vertex, literals: lits.map((l) => -l) });
  }
  return { variableCount: cp.edges.length, clauses, kawasaki };
}

/** Whether one literal holds, given `assignment[e]` true for mountain and false for valley. */
function holds(literal: Literal, assignment: readonly boolean[]): boolean {
  return literal > 0 ? assignment[literal - 1] === true : assignment[-literal - 1] === false;
}

/**
 * Lists the clauses an assignment violates.
 *
 * @param assignment - one Boolean per edge (true = mountain); entries for "B" and "F" edges are
 *   never read
 * @throws RangeError if the assignment is shorter than the variable count
 */
export function violatedClauses(
  formula: MvFormula,
  assignment: readonly boolean[],
): readonly Clause[] {
  if (assignment.length < formula.variableCount) {
    throw new RangeError(`Need ${formula.variableCount} values, got ${assignment.length}`);
  }
  return formula.clauses.filter((c) => !c.literals.some((l) => holds(l, assignment)));
}

/** Whether an assignment satisfies every clause; see {@link violatedClauses}. */
export function satisfies(formula: MvFormula, assignment: readonly boolean[]): boolean {
  return violatedClauses(formula, assignment).length === 0;
}

/**
 * Reads the Boolean assignment off a pattern whose creases are all set.
 *
 * "M" is true; "V" is false. "B" and "F" edges are not variables in any clause, so they read as
 * false.
 *
 * @throws RangeError if some crease is still "U"
 */
export function assignmentFromPattern(cp: CreasePattern): boolean[] {
  return cp.edges.map((edge, e) => {
    if (edge.assignment === "U") throw new RangeError(`Edge ${e} is unassigned`);
    return edge.assignment === "M";
  });
}
