/**
 * SAT/backtracking solver for mountain/valley assignments.
 *
 * Sits at the "solve" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render), right after `clauses.ts`. It searches the CNF formula of step 4.1 for
 * an assignment, so a pattern with unassigned ("U") creases, or a partly fixed one, is completed to
 * one that passes Maekawa and Big-Little-Big at every interior vertex. Both conditions are
 * necessary only, so a solution is a candidate for the layer ordering of Phase 5, not a proof of
 * flat-foldability. {@link mvSolutions} yields further candidates for when one does not fold.
 *
 * Reference: Davis, Logemann & Loveland, "A machine program for theorem-proving" (1962), and
 * Biere et al., "Handbook of Satisfiability", ch. 3 (DPLL, unit propagation).
 */

import type { Assignment, CreasePattern } from "../pattern/crease-pattern";
import { localMvClauses, type Literal, type MvFormula } from "./clauses";

/** A satisfying assignment: `assignment[e]` is true for mountain, false for valley. */
export type MvSolution = { readonly status: "sat"; readonly assignment: readonly boolean[] };

/**
 * Why no assignment exists.
 *
 * `kawasaki`: the listed vertices fail the geometric Kawasaki condition, which no M/V choice can
 * fix. `unsat`: the clauses contradict each other; `vertices` names the vertices of the clauses
 * that led to a contradiction found by propagation alone (an odd-degree vertex, or fixed creases
 * that already break Maekawa). It is empty when the contradiction only appears after branching,
 * and it is not a minimal unsatisfiable core.
 */
export type MvFailure = {
  readonly status: "kawasaki" | "unsat";
  readonly vertices: readonly number[];
};

/** The outcome of a solve. */
export type MvResult = MvSolution | MvFailure;

/** What the DPLL core returns: a model, or the clauses behind a root-level conflict. */
type Search = { readonly model: boolean[] } | { readonly model: null; readonly core: number[] };

/**
 * Runs DPLL on a list of clauses.
 *
 * Unit propagation runs to a fixpoint; then the variable of the first unassigned literal in the
 * shortest unsatisfied clause is set to valley, and to mountain on backtracking. The order is
 * fixed, so the result is deterministic. Backtracking is chronological with an explicit stack, so
 * depth cannot overflow the JS call stack. Every clause is rescanned each round: formulas have a
 * few thousand short clauses, so watched literals are not worth their complexity yet.
 *
 * Variables in no clause stay unassigned and read as false in the model.
 *
 * @returns a model, or (when propagation alone refutes the formula before any branching) the
 *   indices of the clauses on the conflict's implication chain
 */
function dpll(variableCount: number, clauses: readonly (readonly Literal[])[]): Search {
  const value: number[] = new Array<number>(variableCount).fill(0); // 1 true, −1 false, 0 free
  const reason: number[] = new Array<number>(variableCount).fill(-1);
  const trail: number[] = [];
  const stack: { trailLength: number; variable: number; flipped: boolean }[] = [];

  const assign = (literal: Literal, why: number): void => {
    const v = Math.abs(literal) - 1;
    value[v] = literal > 0 ? 1 : -1;
    reason[v] = why;
    trail.push(v);
  };
  const undoTo = (length: number): void => {
    while (trail.length > length) value[trail.pop()!] = 0;
  };

  /** Propagates unit clauses to a fixpoint; returns a falsified clause index or −1. */
  const propagate = (): number => {
    for (let changed = true; changed;) {
      changed = false;
      for (let c = 0; c < clauses.length; c++) {
        let satisfied = false;
        let free = 0;
        let last = 0;
        for (const l of clauses[c]!) {
          const val = value[Math.abs(l) - 1]!;
          if (val === 0) {
            free++;
            last = l;
          } else if (val > 0 === l > 0) {
            satisfied = true;
            break;
          }
        }
        if (satisfied) continue;
        if (free === 0) return c;
        if (free === 1) {
          assign(last, c);
          changed = true;
        }
      }
    }
    return -1;
  };

  /** The variable to branch on, or −1 when every clause is satisfied. */
  const pickBranch = (): number => {
    let best = -1;
    let bestFree = Infinity;
    for (const clause of clauses) {
      let free = 0;
      let first = 0;
      let satisfied = false;
      for (const l of clause) {
        const val = value[Math.abs(l) - 1]!;
        if (val === 0) {
          if (free++ === 0) first = Math.abs(l) - 1;
        } else if (val > 0 === l > 0) {
          satisfied = true;
          break;
        }
      }
      if (!satisfied && free < bestFree) {
        bestFree = free;
        best = first;
      }
    }
    return best;
  };

  for (;;) {
    const conflict = propagate();
    if (conflict >= 0) {
      if (stack.length === 0) return { model: null, core: implicationChain(conflict) };
      // Chronological backtracking: undo to the newest decision not yet flipped and try mountain.
      let top = stack.pop()!;
      undoTo(top.trailLength);
      while (top.flipped) {
        if (stack.length === 0) return { model: null, core: [] };
        top = stack.pop()!;
        undoTo(top.trailLength);
      }
      stack.push({ trailLength: top.trailLength, variable: top.variable, flipped: true });
      assign(top.variable + 1, -1);
      continue;
    }
    const v = pickBranch();
    if (v < 0) return { model: value.map((x) => x > 0) };
    stack.push({ trailLength: trail.length, variable: v, flipped: false });
    assign(-(v + 1), -1);
  }

  /** Clauses reachable from a root-level conflict through the reasons of their variables. */
  function implicationChain(conflict: number): number[] {
    const seen = new Set<number>();
    const todo = [conflict];
    while (todo.length > 0) {
      const c = todo.pop()!;
      if (seen.has(c)) continue;
      seen.add(c);
      for (const l of clauses[c]!) {
        const why = reason[Math.abs(l) - 1]!;
        if (why >= 0) todo.push(why);
      }
    }
    return [...seen];
  }
}

/**
 * Rejects a formula the solver cannot read.
 *
 * The solver indexes its value table by |literal| − 1, so a zero, fractional or out-of-range
 * literal would read `undefined` and be treated as satisfied (negative) or false (positive)
 * instead of failing.
 *
 * @throws RangeError if `variableCount` is not a non-negative integer, or a literal is not a
 *   nonzero integer with |literal| ≤ `variableCount`
 */
function checkFormula(formula: MvFormula): void {
  const n = formula.variableCount;
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`variableCount must be a non-negative integer, got ${n}`);
  }
  for (const clause of formula.clauses) {
    for (const l of clause.literals) {
      if (!Number.isInteger(l) || l === 0 || Math.abs(l) > n) {
        throw new RangeError(`Literal ${l} is not a nonzero integer within ±${n}`);
      }
    }
  }
}

/** The vertices named by the clauses with these indices, sorted and without repeats. */
function verticesOf(formula: MvFormula, core: readonly number[]): number[] {
  const vertices = new Set<number>();
  for (const c of core) {
    const clause = formula.clauses[c]!;
    if (clause.kind !== "fixed") vertices.add(clause.vertex);
  }
  return [...vertices].sort((a, b) => a - b);
}

/**
 * Finds one assignment satisfying a formula, by DPLL.
 *
 * A formula with Kawasaki failures is refused before any search: those vertices are geometric, so
 * no M/V choice can fix them and a "solution" would be misleading.
 *
 * @returns an assignment with one Boolean per edge, or why there is none
 * @throws RangeError if the formula is malformed (see {@link checkFormula})
 */
export function solveFormula(formula: MvFormula): MvResult {
  checkFormula(formula);
  if (formula.kawasaki.length > 0) return { status: "kawasaki", vertices: formula.kawasaki };
  const search = dpll(
    formula.variableCount,
    formula.clauses.map((c) => c.literals),
  );
  if (search.model) return { status: "sat", assignment: search.model };
  return { status: "unsat", vertices: verticesOf(formula, search.core) };
}

/**
 * Yields every assignment of the constrained variables that satisfies a formula, lazily.
 *
 * After each solution its negation over the variables that occur in some clause is added as a
 * blocking clause and the search restarts, so solutions are distinct and none is missed. Variables
 * in no clause are always false and do not multiply the count. Phase 5 can pull candidates until
 * one admits a layer ordering. Yields nothing if the formula has Kawasaki failures.
 *
 * @throws RangeError on the first `next()` if the formula is malformed (see {@link checkFormula})
 */
export function* mvSolutions(formula: MvFormula): Generator<readonly boolean[]> {
  checkFormula(formula);
  if (formula.kawasaki.length > 0) return;
  const clauses: (readonly Literal[])[] = formula.clauses.map((c) => c.literals);
  const used = [...new Set(clauses.flat().map((l) => Math.abs(l) - 1))].sort((a, b) => a - b);
  for (;;) {
    const search = dpll(formula.variableCount, clauses);
    if (!search.model) return;
    yield search.model;
    const model = search.model;
    clauses.push(used.map((v) => (model[v] ? -(v + 1) : v + 1)));
  }
}

/**
 * Finds an M/V assignment for a crease pattern's local conditions.
 *
 * Encodes the pattern with {@link localMvClauses} and solves it, so creases already M or V are
 * kept and "U" creases are chosen. Use {@link withMvAssignment} to apply the result.
 *
 * @throws RangeError as `localMvClauses` does (degree above `MAX_ENCODED_DEGREE`, overflow)
 */
export function solveMv(cp: CreasePattern): MvResult {
  return solveFormula(localMvClauses(cp));
}

/**
 * Returns the pattern with its "U" creases set from an assignment; geometry is shared, not copied.
 *
 * Only "U" creases change; the result is frozen like any pattern from `creasePattern`. A "U" crease that no interior vertex constrains reads false from the
 * solver, so it becomes a valley. "B" and "F" creases are never touched.
 *
 * @param assignment - one Boolean per edge, true for mountain
 * @throws RangeError if the assignment is shorter than the edge list, or disagrees with a crease
 *   that is already M or V
 */
export function withMvAssignment(cp: CreasePattern, assignment: readonly boolean[]): CreasePattern {
  if (assignment.length < cp.edges.length) {
    throw new RangeError(`Need ${cp.edges.length} values, got ${assignment.length}`);
  }
  const edges = cp.edges.map((edge, e) => {
    const mountain = assignment[e] === true;
    if (edge.assignment === "M" && !mountain) {
      throw new RangeError(`Edge ${e} is a mountain but the assignment says valley`);
    }
    if (edge.assignment === "V" && mountain) {
      throw new RangeError(`Edge ${e} is a valley but the assignment says mountain`);
    }
    if (edge.assignment !== "U") return edge;
    const assigned: Assignment = mountain ? "M" : "V";
    return Object.freeze({ v0: edge.v0, v1: edge.v1, assignment: assigned });
  });
  return Object.freeze({ ...cp, edges: Object.freeze(edges) });
}
