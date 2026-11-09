/**
 * Conflict sets and minimum repairs of an unsatisfiable CNF formula whose clauses carry tags.
 *
 * Sits at the "solve" stage of the data flow (… → validate → solve → simulate/render), beside
 * `solver.ts`, which it calls. A tag is the unit of blame a person can act on: a face for the
 * stacking clauses, a vertex for the mountain/valley clauses (adapters live in
 * `near-foldability.ts`). A clause with no tag is hard and is never given up; a clause with tags is
 * dropped as soon as any of its tags is. Dropping tags only ever drops clauses, so satisfiability is
 * monotone in the set of kept tags, which is what both algorithms below rely on.
 *
 * - {@link minimalConflict}: a minimal set of tags that is already unsatisfiable (a minimal
 *   unsatisfiable subset, MUS), by deletion: try to drop each tag and keep it dropped if the
 *   formula is still unsatisfiable. Marques-Silva, "Minimal unsatisfiability: models, algorithms
 *   and applications", ISMVL 2010.
 * - {@link minimumRepair}: the cheapest set of tags whose removal makes the formula satisfiable (a
 *   weighted minimum correction set), by implicit hitting sets: every repair must hit every
 *   conflict, so alternate between a minimum hitting set of the conflicts found so far and a new
 *   conflict that set misses. Davies & Bacchus, "Solving MaxSAT by solving a sequence of simpler SAT
 *   instances", CP 2011.
 */

import type { Literal } from "./clauses";
import { solveClauses } from "./solver";

/** A CNF formula with a list of tags (non-negative integers) on each clause. */
export type TaggedCnf = {
  /** Variables are 1 … variableCount (DIMACS), as in `solveClauses`. */
  readonly variableCount: number;
  readonly clauses: readonly (readonly Literal[])[];
  /** `tags[c]` are the tags of clause c; empty means the clause is hard. */
  readonly tags: readonly (readonly number[])[];
};

/** A minimal unsatisfiable subset, by tag and by clause. */
export type Conflict = {
  /** Sorted tags; removing any one of them makes the rest satisfiable. */
  readonly tags: readonly number[];
  /** Sorted indices of the clauses whose tags all lie in `tags`, cut down to a minimal subset. */
  readonly clauses: readonly number[];
};

/** A cheapest set of tags to give up. */
export type Repair = {
  /** Sorted tags whose removal makes the formula satisfiable. */
  readonly removed: readonly number[];
  /** The conflicts that forced it: each is hit by `removed`. */
  readonly conflicts: readonly (readonly number[])[];
  /** False when the search gave up at a limit and `removed` is only an upper bound. */
  readonly exact: boolean;
};

/** Largest repair the exact search is allowed to build before it returns an upper bound. */
export const MAX_REPAIR_SIZE = 12;

/** Most conflicts the exact search collects before it returns an upper bound. */
export const MAX_CONFLICTS = 200;

/** Whether the listed clauses of a formula have a model. */
function satisfiable(cnf: TaggedCnf, keep: readonly number[]): boolean {
  return (
    solveClauses(
      cnf.variableCount,
      keep.map((c) => cnf.clauses[c]!),
    ) !== null
  );
}

/** Indices of the clauses all of whose tags are allowed (hard clauses always are). */
function clausesWithin(cnf: TaggedCnf, allowed: ReadonlySet<number>): number[] {
  const kept: number[] = [];
  cnf.tags.forEach((tags, c) => {
    if (tags.every((t) => allowed.has(t))) kept.push(c);
  });
  return kept;
}

/**
 * Finds a minimal conflict among the tags that are not removed.
 *
 * Deletion algorithm: starting from every tag outside `removed`, each tag is dropped in increasing
 * order and stays dropped when the clauses within the remaining tags are still unsatisfiable. The
 * result T is unsatisfiable and T minus any tag is satisfiable, by monotonicity. A second deletion
 * over the clauses within T then leaves a minimal set of clauses, which names the creases or
 * vertices that actually fight. The result is deterministic.
 *
 * @param cnf - the tagged formula
 * @param removed - tags to treat as already given up (default none)
 * @param withClauses - also minimise at clause level (default true; the repair search skips it)
 * @returns the conflict, or null if the formula is satisfiable without `removed`. When the hard
 *   clauses alone are unsatisfiable the conflict has no tags
 * @throws RangeError if the formula is malformed (see `solveClauses`)
 */
export function minimalConflict(
  cnf: TaggedCnf,
  removed: ReadonlySet<number> = new Set(),
  withClauses = true,
): Conflict | null {
  const everything = new Set(cnf.tags.flat().filter((t) => !removed.has(t)));
  if (satisfiable(cnf, clausesWithin(cnf, everything))) return null;

  const current = new Set(everything);
  for (const tag of [...everything].sort((a, b) => a - b)) {
    current.delete(tag);
    // Still unsatisfiable without this tag: it is not needed. Otherwise it is part of the core.
    if (satisfiable(cnf, clausesWithin(cnf, current))) current.add(tag);
  }
  const tags = [...current].sort((a, b) => a - b);
  if (!withClauses) return { tags, clauses: clausesWithin(cnf, current) };

  let clauses = clausesWithin(cnf, current);
  for (const c of [...clauses]) {
    const rest = clauses.filter((d) => d !== c);
    if (!satisfiable(cnf, rest)) clauses = rest;
  }
  return { tags, clauses };
}

/** Total weight of a tag set. */
function weightOf(tags: readonly number[], weight: (tag: number) => number): number {
  return tags.reduce((sum, t) => sum + weight(t), 0);
}

/** Lexicographic comparison of two sorted tag lists. */
function compareLists(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

/**
 * A minimum hitting set of some tag sets: fewest tags, then least weight, then lexicographically
 * first, so the answer is unique.
 *
 * Branch and bound: take the unhit set with fewest tags and branch on which of its tags to pick;
 * a branch is cut when it already has more tags than the best set found. Exponential in the size of
 * the answer only, which {@link MAX_REPAIR_SIZE} bounds.
 *
 * @returns the set, or null if every hitting set has more than `limit` tags
 */
function minimumHittingSet(
  sets: readonly (readonly number[])[],
  weight: (tag: number) => number,
  limit: number,
): number[] | null {
  let best: number[] | null = null;
  let bestWeight = Infinity;
  let bound = limit;

  const better = (candidate: number[]): boolean => {
    if (best === null) return true;
    if (candidate.length !== best.length) return candidate.length < best.length;
    const w = weightOf(candidate, weight);
    if (w !== bestWeight) return w < bestWeight;
    return compareLists(candidate, best) < 0;
  };

  const search = (chosen: Set<number>): void => {
    if (chosen.size > bound) return;
    let target: readonly number[] | null = null;
    for (const s of sets) {
      if (s.some((t) => chosen.has(t))) continue;
      if (target === null || s.length < target.length) target = s;
    }
    if (target === null) {
      const candidate = [...chosen].sort((a, b) => a - b);
      if (better(candidate)) {
        best = candidate;
        bestWeight = weightOf(candidate, weight);
        bound = candidate.length;
      }
      return;
    }
    if (chosen.size === bound) return;
    for (const t of target) {
      chosen.add(t);
      search(chosen);
      chosen.delete(t);
    }
  };
  search(new Set());
  return best;
}

/**
 * Finds the cheapest set of tags to remove so that the formula becomes satisfiable.
 *
 * Implicit hitting set loop: H is a minimum hitting set of the conflicts known so far; if the
 * formula without H is satisfiable, H is optimal, because any repair must hit every known conflict
 * and H is the cheapest set that does. Otherwise {@link minimalConflict} among the tags outside H
 * is a new conflict H misses, and the loop repeats; it ends because each round adds a conflict not
 * hit by the previous set. If H outgrows {@link MAX_REPAIR_SIZE} or more than {@link MAX_CONFLICTS}
 * conflicts are collected, the search stops and returns a greedy repair (repeatedly removing the
 * lightest tag of a fresh conflict) marked `exact: false`.
 *
 * @param cnf - the tagged formula
 * @param weight - cost of giving up a tag, a positive integer (default 1)
 * @returns the repair (empty if the formula is satisfiable), or null if the hard clauses alone are
 *   unsatisfiable, so that no removal of tags helps
 * @throws RangeError if the formula is malformed (see `solveClauses`)
 */
export function minimumRepair(
  cnf: TaggedCnf,
  weight: (tag: number) => number = () => 1,
): Repair | null {
  const conflicts: number[][] = [];
  let removed: number[] = [];
  for (;;) {
    const found = minimalConflict(cnf, new Set(removed), false);
    if (found === null) return { removed, conflicts, exact: true };
    if (found.tags.length === 0) return null;
    conflicts.push([...found.tags]);
    const hitting =
      conflicts.length > MAX_CONFLICTS
        ? null
        : minimumHittingSet(conflicts, weight, MAX_REPAIR_SIZE);
    if (hitting === null) return greedyRepair(cnf, weight, conflicts);
    removed = hitting;
  }
}

/** The upper-bound fallback of {@link minimumRepair}: drop the lightest tag of each fresh conflict. */
function greedyRepair(
  cnf: TaggedCnf,
  weight: (tag: number) => number,
  conflicts: readonly (readonly number[])[],
): Repair {
  const removed = new Set<number>();
  for (;;) {
    const found = minimalConflict(cnf, removed, false);
    if (found === null) break;
    const lightest = [...found.tags].sort((a, b) => weight(a) - weight(b) || a - b)[0]!;
    removed.add(lightest);
  }
  return { removed: [...removed].sort((a, b) => a - b), conflicts, exact: false };
}
