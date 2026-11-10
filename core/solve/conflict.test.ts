import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { minimalConflict, minimumRepair, type TaggedCnf } from "./conflict";

/** Brute-force satisfiability over all 2ⁿ assignments (shares no code with the DPLL solver). */
function bruteSat(n: number, clauses: readonly (readonly number[])[]): boolean {
  for (let bits = 0; bits < 2 ** n; bits++) {
    const ok = clauses.every((c) =>
      c.some((l) => (((bits >> (Math.abs(l) - 1)) & 1) === 1) === l > 0),
    );
    if (ok) return true;
  }
  return false;
}

const TAGS = 4;

/** Clauses of the formula whose tags all lie in `kept`. */
function within(cnf: TaggedCnf, kept: ReadonlySet<number>): (readonly number[])[] {
  return cnf.clauses.filter((_c, i) => cnf.tags[i]!.every((t) => kept.has(t)));
}

const taggedCnf = fc.integer({ min: 1, max: 4 }).chain((n) =>
  fc
    .array(
      fc.record({
        literals: fc.array(
          fc.tuple(fc.integer({ min: 1, max: n }), fc.boolean()).map(([v, neg]) => (neg ? -v : v)),
          { minLength: 1, maxLength: 3 },
        ),
        tags: fc.uniqueArray(fc.integer({ min: 0, max: TAGS - 1 }), { maxLength: 2 }),
      }),
      { maxLength: 14 },
    )
    .map((cs): TaggedCnf => ({
      variableCount: n,
      clauses: cs.map((c) => c.literals),
      tags: cs.map((c) => [...c.tags].sort((a, b) => a - b)),
    })),
);

const subsetsOfTags = Array.from({ length: 2 ** TAGS }, (_, mask) =>
  Array.from({ length: TAGS }, (_x, t) => t).filter((t) => (mask >> t) & 1),
);

describe("minimalConflict", () => {
  it("is null exactly when the formula is satisfiable, and otherwise minimal (deletion MUS)", () => {
    fc.assert(
      fc.property(taggedCnf, (cnf) => {
        const all = new Set(cnf.tags.flat());
        const result = minimalConflict(cnf);
        expect(result === null).toBe(bruteSat(cnf.variableCount, within(cnf, all)));
        if (result === null) return;
        const tags = new Set(result.tags);
        expect(bruteSat(cnf.variableCount, within(cnf, tags))).toBe(false);
        for (const t of tags) {
          const rest = new Set([...tags].filter((u) => u !== t));
          expect(bruteSat(cnf.variableCount, within(cnf, rest))).toBe(true);
        }
        // The clause-level core is unsatisfiable and no clause of it can be dropped.
        const lits = result.clauses.map((c) => cnf.clauses[c]!);
        expect(bruteSat(cnf.variableCount, lits)).toBe(false);
        lits.forEach((_l, i) => {
          expect(
            bruteSat(
              cnf.variableCount,
              lits.filter((_m, j) => j !== i),
            ),
          ).toBe(true);
        });
      }),
      { numRuns: 300 },
    );
  });

  it("ignores removed tags, and reports no tags when the hard clauses alone conflict", () => {
    const cnf: TaggedCnf = { variableCount: 1, clauses: [[1], [-1]], tags: [[0], [1]] };
    expect(minimalConflict(cnf)?.tags).toEqual([0, 1]);
    expect(minimalConflict(cnf, new Set([0]))).toBeNull();
    const hard: TaggedCnf = { variableCount: 1, clauses: [[1], [-1]], tags: [[], []] };
    expect(minimalConflict(hard)?.tags).toEqual([]);
  });
});

describe("minimumRepair", () => {
  it("removes the fewest tags, then the least weight, as brute force over tag subsets says", () => {
    const weight = (t: number) => t + 1;
    fc.assert(
      fc.property(taggedCnf, (cnf) => {
        const all = new Set(cnf.tags.flat());
        const hardOk = bruteSat(cnf.variableCount, within(cnf, new Set()));
        const result = minimumRepair(cnf, weight);
        if (!hardOk) {
          expect(result).toBeNull();
          return;
        }
        let best: { size: number; weight: number } | null = null;
        for (const removed of subsetsOfTags) {
          const kept = new Set([...all].filter((t) => !removed.includes(t)));
          if (!bruteSat(cnf.variableCount, within(cnf, kept))) continue;
          const w = removed.reduce((s, t) => s + weight(t), 0);
          if (
            best === null ||
            removed.length < best.size ||
            (removed.length === best.size && w < best.weight)
          ) {
            best = { size: removed.length, weight: w };
          }
        }
        expect(result).not.toBeNull();
        expect(result!.exact).toBe(true);
        expect(result!.removed.length).toBe(best!.size);
        expect(result!.removed.reduce((s, t) => s + weight(t), 0)).toBe(best!.weight);
        for (const conflict of result!.conflicts) {
          expect(conflict.some((t) => result!.removed.includes(t))).toBe(true);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("returns null when the hard clauses are unsatisfiable, instead of looping", () => {
    const hard: TaggedCnf = { variableCount: 1, clauses: [[1], [-1], [1]], tags: [[], [], [0]] };
    expect(minimumRepair(hard)).toBeNull();
  });

  it("is empty for a satisfiable formula", () => {
    const cnf: TaggedCnf = { variableCount: 2, clauses: [[1, 2], [-1]], tags: [[0], [1]] };
    expect(minimumRepair(cnf)).toEqual({ removed: [], conflicts: [], exact: true });
  });

  it("prefers one cheap shared tag over two others: weights break ties deterministically", () => {
    // Clauses (x) tagged {0}, (¬x) tagged {1}: either tag fixes it; the lighter one is chosen.
    const cnf: TaggedCnf = { variableCount: 1, clauses: [[1], [-1]], tags: [[0], [1]] };
    expect(minimumRepair(cnf, (t) => (t === 0 ? 5 : 2))?.removed).toEqual([1]);
    expect(minimumRepair(cnf)?.removed).toEqual([0]);
  });
});

describe("minimumRepair: weights", () => {
  // x and ¬x, each blamed on its own tag: giving up either tag repairs it.
  const cnf: TaggedCnf = { variableCount: 1, clauses: [[1], [-1]], tags: [[0], [1]] };

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the weight %s, which would break the least-weight tie-break",
    (bad) => {
      expect(() => minimumRepair(cnf, () => bad)).toThrow(RangeError);
    },
  );

  it("accepts positive integer weights and prefers the lighter tag", () => {
    expect(minimumRepair(cnf, (t) => (t === 0 ? 5 : 2))!.removed).toEqual([1]);
  });
});

describe("conflict engine: formulas with no clauses", () => {
  const empty: TaggedCnf = { variableCount: 0, clauses: [], tags: [] };

  it("has no conflict and needs no repair", () => {
    expect(minimalConflict(empty)).toBeNull();
    expect(minimumRepair(empty)).toEqual({ removed: [], conflicts: [], exact: true });
  });
});
