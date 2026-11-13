import { describe, expect, it } from "vitest";
import { pleatEdges, regularTwist } from "../gadgets/regular-twist";
import { piFraction } from "../gadgets/twist-limits";
import { layerOrder } from "../solve/layer-order";
import { locallyValidAssignments } from "../solve/local-solutions";
import { canonicalRotation, necklaceCount } from "../solve/necklace";
import { withMvAssignment } from "../solve/solver";
import { notesAllowWord, notesLimits } from "./testing";
import { twistSweep, type SweepRow } from "./twist-sweep";

const DEG30 = piFraction(1, 6);
const DEG60 = piFraction(1, 3);

/** Row lookup by side and radius. */
const at = (rows: readonly SweepRow[], side: number, radius: number): SweepRow => {
  const row = rows.find((r) => r.side === side && r.radius === radius);
  if (!row) throw new Error(`no row for side ${side}, radius ${radius}`);
  return row;
};
const word = (row: SweepRow, w: string) => row.necklaces.find((x) => x.word === w)!;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("hexagon twist, α = 60° = αcrit (closed-back)", () => {
  const { rows, skipped } = twistSweep({ n: 6, alpha: DEG60, sides: [1, 2], radii: [2, 3, 4, 5] });

  it("has 730 locally valid assignments, 66 with opposite pleat creases, in N(6) = 14 classes, and every class folds", () => {
    const row = at(rows, 1, 2);
    expect(row.regime).toBe("closed-back");
    expect(row.valid).toBe(730);
    expect(row.anto).toBe(66);
    expect(row.necklaces).toHaveLength(necklaceCount(6));
    expect(sum(row.necklaces.map((x) => x.members))).toBe(66);
    for (const x of row.necklaces) expect(x.folding).toBeGreaterThan(0);
  });

  it("has the same counts at every size, and a class folds in every size", () => {
    for (const row of rows) {
      expect(row.valid).toBe(730);
      expect(row.anto).toBe(66);
      expect(row.necklaces).toHaveLength(14);
      for (const x of row.necklaces) expect(x.folding).toBeGreaterThan(0);
    }
  });

  it("folds both polygon-edge assignments of an all-alike pleat word only on tight paper", () => {
    // Finding of 8.1 (the 7.3d test checked one assignment per class): 000000 and 111111 each have
    // two assignments of the six polygon edges. Both fold at (1, 2), (2, 3), (2, 4); only one folds
    // when the frame is larger. Every other class folds with all its members at every size.
    for (const [s, r, folds] of [
      [1, 2, 2],
      [2, 3, 2],
      [2, 4, 2],
      [1, 3, 1],
      [1, 4, 1],
      [1, 5, 1],
      [2, 5, 1],
    ] as const) {
      const row = at(rows, s, r);
      for (const w of ["000000", "111111"]) {
        expect(word(row, w).members).toBe(2);
        expect(word(row, w).folding).toBe(folds);
      }
      for (const x of row.necklaces) {
        if (x.word !== "000000" && x.word !== "111111") expect(x.folding).toBe(x.members);
      }
    }
  });

  it("keeps that boundary at R = 2s for side 3 (a sweep of sides 1 to 3, radii up to 8 shows R ≤ 2s)", () => {
    const wide = twistSweep({ n: 6, alpha: DEG60, sides: [3], radii: [6, 7] }).rows;
    expect(word(at(wide, 3, 6), "000000").folding).toBe(2);
    expect(word(at(wide, 3, 7), "000000").folding).toBe(1);
  });

  it("skips a radius that does not enclose the polygon", () => {
    expect(skipped).toEqual([{ side: 2, radius: 2 }]);
  });
});

describe("hexagon twist, α = 30° (open-back)", () => {
  const { rows, skipped } = twistSweep({ n: 6, alpha: DEG30, sides: [2, 4], radii: [4, 6, 8] });

  it("has 64 locally valid assignments, all with opposite pleat creases, and all 14 classes fold at every size", () => {
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.regime).toBe("open-back");
      expect(row.valid).toBe(64);
      expect(row.anto).toBe(64);
      expect(row.necklaces).toHaveLength(necklaceCount(6));
      for (const x of row.necklaces) expect(x.folding).toBe(x.members);
    }
  });

  it("skips the radius that does not enclose the polygon", () => {
    expect(skipped).toEqual([{ side: 4, radius: 4 }]);
  });
});

describe("triangle twist, α = 30° = αcrit (closed-back)", () => {
  const { rows } = twistSweep({ n: 3, alpha: DEG30, sides: [6], radii: [6, 8, 10] });

  it("has 8 locally valid assignments, all anto, and all N(3) = 4 classes fold at every size", () => {
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.regime).toBe("closed-back");
      expect(row.valid).toBe(8);
      expect(row.anto).toBe(8);
      expect(row.necklaces.map((x) => [x.word, x.members, x.folding])).toEqual([
        ["000", 1, 1],
        ["001", 3, 3],
        ["011", 3, 3],
        ["111", 1, 1],
      ]);
    }
  });
});

describe("triangle twist, α = 60° > αcrit = 30° (supercritical)", () => {
  const { rows, skipped } = twistSweep({
    n: 3,
    alpha: DEG60,
    sides: [3, 6],
    radii: [3, 4, 5, 6, 8],
  });

  it("folds the not-all-equal words at every size and the all-alike words at none on this hexagonal paper", () => {
    expect(rows).toHaveLength(8);
    for (const row of rows) {
      expect(row.regime).toBe("supercritical");
      expect(row.valid).toBe(26);
      expect(row.anto).toBe(8);
      expect(word(row, "001").folding).toBe(3);
      expect(word(row, "011").folding).toBe(3);
      for (const w of ["000", "111"]) {
        expect(word(row, w).folding).toBe(0);
        const score = word(row, w).bestScore!;
        expect(score.num).toBeLessThan(score.den);
        expect(score.num).toBeGreaterThan(0);
      }
    }
    // The shipped triangle twist has the same two classes fold when n ≥ 3m, but its paper is a
    // triangle that ends right after the rays; here the paper is a hexagon, so they never fold.
    expect(word(at(rows, 3, 3), "000").bestScore).toEqual({ num: 43, den: 54 });
  });

  it("skips the radii that do not enclose the polygon", () => {
    expect(skipped).toEqual([
      { side: 6, radius: 3 },
      { side: 6, radius: 4 },
    ]);
  });
});

describe("sweep structure", () => {
  const spec = { n: 6, alpha: DEG30, sides: [2], radii: [4, 6] } as const;

  it("is deterministic", () => {
    expect(twistSweep(spec)).toEqual(twistSweep(spec));
  });

  it("keys every class by its least rotation, so no two keys are rotations of each other", () => {
    for (const row of twistSweep(spec).rows) {
      const keys = row.necklaces.map((x) => x.word);
      for (const k of keys) {
        const digits = [...k].map(Number);
        expect(canonicalRotation(digits).join("")).toBe(k);
      }
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("is empty for no sides or no radii", () => {
    expect(twistSweep({ ...spec, sides: [] })).toEqual({ rows: [], skipped: [] });
    expect(twistSweep({ ...spec, radii: [] }).rows).toEqual([]);
  });

  it("rejects an unsupported polygon, angle or side, also when no radius is given", () => {
    expect(() => twistSweep({ ...spec, n: 4 as 3 })).toThrow(RangeError);
    expect(() => twistSweep({ ...spec, alpha: piFraction(1, 4) })).toThrow(RangeError);
    expect(() => twistSweep({ ...spec, sides: [0] })).toThrow(RangeError);
    expect(() => twistSweep({ ...spec, sides: [3], n: 3, alpha: DEG60 })).not.toThrow();
    expect(() => twistSweep({ n: 3, alpha: DEG60, sides: [4], radii: [] })).toThrow(RangeError);
  });
});

describe("the notes' limits against the solver (candidate predicates, not filters)", () => {
  /** What the notes predict and what the solver finds, for one twist at a representative size. */
  function compare(n: 3 | 6, alpha: typeof DEG30, side: number, radius: number) {
    const cp = regularTwist(n, alpha, side, radius);
    const edges = pleatEdges(n);
    const words = new Map<string, { folds: boolean; cyclic: boolean }>();
    for (const a of locallyValidAssignments(cp)) {
      if (!edges.every(([x, y]) => a[x] !== a[y])) continue;
      const key = canonicalRotation(edges.map(([x]) => (a[x] ? 1 : 0))).join("");
      const result = layerOrder(withMvAssignment(cp, a));
      const entry = words.get(key) ?? { folds: false, cyclic: false };
      words.set(key, entry);
      if (result.status === "ok") {
        entry.folds = true;
        if (result.order === null) entry.cyclic = true;
      }
    }
    const keys = [...words.keys()];
    return {
      classes: keys.length,
      notesAllow: keys.filter((w) => notesAllowWord(n, alpha, w)).length,
      solverFolds: keys.filter((w) => words.get(w)!.folds).length,
      cyclicClasses: keys.filter((w) => words.get(w)!.cyclic).length,
      notesAllowCyclic: notesLimits(n, alpha).cyclicStacking,
    };
  }

  // Where the two agree the table is one more check of the solver; where they differ, either the
  // notes mis-state the book or they mean something else (7.3d), and 8.1 does not filter on them.
  it.each([
    // n, α, side, radius, classes, notes allow, solver folds, classes with a stacking cycle
    [6, DEG60, 1, 2, 14, 1, 14, 2],
    [6, DEG30, 2, 4, 14, 14, 14, 2],
    [3, DEG60, 3, 3, 4, 4, 2, 0],
    [3, DEG30, 6, 6, 4, 4, 4, 2],
  ] as const)(
    "n=%i α=%o s=%i R=%i: %i classes, notes allow %i, the solver folds %i, %i have a stacking cycle",
    (n, alpha, side, radius, classes, notesAllow, solverFolds, cyclicClasses) => {
      const got = compare(n, alpha, side, radius);
      expect(got.classes).toBe(classes);
      expect(got.notesAllow).toBe(notesAllow);
      expect(got.solverFolds).toBe(solverFolds);
      expect(got.cyclicClasses).toBe(cyclicClasses);
      // The notes' Thm 17 says a cycle needs min(α, 180° − α) > 360°/n, which is false for all four
      // twists, yet three of them have cycles; only the triangle at 60° agrees.
      expect(got.notesAllowCyclic).toBe(false);
    },
  );
});
