import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis } from "../lattice/eisenstein";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { bigLittleBigFlat, borderSmallSectorRuns, singleVertexFlat } from "./big-little-big";
import { checkLocalFlatFoldability, kawasakiFlat, maekawaFlat } from "./local-flat-foldability";
import {
  allAssignments,
  candidates,
  foldsFlat,
  POOL,
  subsets,
  wedgeFoldsFlat,
  type MV,
} from "./testing";

describe("bigLittleBigFlat (Big-Little-Big lemma)", () => {
  // Corner of a four-valent triangle twist: X at 0°, edge at 120°, edge at 180°, R at 240°.
  const corner = [eis(1, 0), eis(0, 1), eis(-1, 0), eis(-1, -1)];

  it("accepts a run of two equal small sectors unless its three creases agree", () => {
    // Sectors 120°, 60°, 60°, 120°. The odd crease may be any of the three that bound the run
    // (directions 120°, 180°, 240°); a brute-force fold confirms each of these.
    for (const a of ["MMMV", "MVMM", "MMVM", "VVMV", "VMVV", "VVVM"]) {
      expect(bigLittleBigFlat(corner, [...a] as MV[])).toBe(true);
      expect(foldsFlat(corner, [...a] as MV[])).toBe(true);
    }
  });

  it("rejects the corner when the odd crease lies outside the run", () => {
    // Kawasaki and Maekawa hold for both, yet neither can fold flat.
    expect(kawasakiFlat(corner)).toBe(true);
    for (const a of ["VMMM", "MVVV"]) {
      expect(maekawaFlat([...a] as MV[])).toBe(true);
      expect(bigLittleBigFlat(corner, [...a] as MV[])).toBe(false);
      expect(foldsFlat(corner, [...a] as MV[])).toBe(false);
    }
  });

  it("is vacuous when no sector is strictly smaller than both neighbours", () => {
    const six = [eis(1, 0), eis(1, 1), eis(0, 1), eis(-1, 0), eis(-1, -1), eis(0, -1)];
    expect(bigLittleBigFlat(six, [..."MMMMVV"] as MV[])).toBe(true);
    expect(bigLittleBigFlat([eis(1, 0), eis(-1, 0)], [..."MV"] as MV[])).toBe(true);
  });

  it("rejects mismatched lengths", () => {
    expect(() => bigLittleBigFlat(corner, [..."MMV"] as MV[])).toThrow(RangeError);
  });

  it("is necessary: every vertex that folds flat passes (degrees 4 and 6, exhaustive)", () => {
    let folding = 0;
    let rejected = 0;
    for (const degree of [4, 6]) {
      for (const { dirs, assigns } of candidates(degree)) {
        const flat = foldsFlat(dirs, assigns);
        const blb = bigLittleBigFlat(dirs, assigns);
        if (flat) {
          folding++;
          expect(blb).toBe(true);
        }
        if (!blb) rejected++;
      }
    }
    // Non-vacuous: some vertices fold, and the check rejects some that satisfy Maekawa.
    expect(folding).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  it("is also sufficient at degree 4 (matches the brute-force fold)", () => {
    for (const { dirs, assigns } of candidates(4)) {
      expect(bigLittleBigFlat(dirs, assigns)).toBe(foldsFlat(dirs, assigns));
    }
  });

  it("is invariant under a cyclic shift and under swapping every M and V", () => {
    const all = [...candidates(4), ...candidates(6)];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: all.length - 1 }),
        fc.integer({ min: 1, max: 5 }),
        (i, s) => {
          const { dirs, assigns } = all[i]!;
          const k = s % dirs.length;
          const shift = <T>(xs: readonly T[]) => [...xs.slice(k), ...xs.slice(0, k)];
          const flipped = assigns.map((x) => (x === "M" ? "V" : "M")) as MV[];
          const base = bigLittleBigFlat(dirs, assigns);
          expect(bigLittleBigFlat(shift(dirs), shift(assigns))).toBe(base);
          expect(bigLittleBigFlat(dirs, flipped)).toBe(base);
        },
      ),
      { numRuns: 300 },
    );
  });
});

/**
 * Every wedge of paper whose rays are POOL directions: the first ray, then `rays - 1` later ones
 * counter-clockwise within one turn, with every assignment of the creases between the two edges.
 */
function wedges(rays: number): { dirs: (typeof POOL)[number][]; assigns: MV[] }[] {
  const out: { dirs: (typeof POOL)[number][]; assigns: MV[] }[] = [];
  for (let first = 0; first < POOL.length; first++) {
    for (const later of subsets(POOL.length - 1, rays - 1)) {
      const dirs = [POOL[first]!, ...later.map((k) => POOL[(first + 1 + k) % POOL.length]!)];
      for (const crease of allAssignments(rays - 2))
        out.push({ dirs, assigns: ["M", ...crease, "M"] });
    }
  }
  return out;
}

describe("borderSmallSectorRuns (Lang, Fig. 1.45: Big-Little-Big at a border vertex)", () => {
  it("finds the small sector between two larger paper sectors on a straight edge", () => {
    // Rays at 0°, 60°, 90°, 180° (the paper edge runs along 0° and 180°): sectors 60°, 30°, 90°.
    const rays = [eis(1, 0), eis(1, 1), eis(1, 2), eis(-1, 0)];
    expect(borderSmallSectorRuns(rays)).toEqual([[1, 2]]);
  });

  it("never counts a sector that touches a paper edge, which has one neighbour only", () => {
    // Sectors 30°, 60°: the 30° sector is smaller than its only neighbour but is an end sector.
    expect(borderSmallSectorRuns([eis(1, 0), eis(2, 1), eis(1, 2)])).toEqual([]);
    expect(borderSmallSectorRuns([eis(1, 0), eis(-1, 0)])).toEqual([]);
    expect(borderSmallSectorRuns([])).toEqual([]);
  });

  it("is necessary: no wedge that folds flat is rejected (up to five sectors, exhaustive)", () => {
    let rejected = 0;
    for (const rays of [3, 4, 5, 6]) {
      for (const { dirs, assigns } of wedges(rays)) {
        const passes = borderSmallSectorRuns(dirs).every((run) =>
          run.some((c) => assigns[c] !== assigns[run[0]!]),
        );
        if (!passes) rejected++;
        if (wedgeFoldsFlat(dirs, assigns)) expect(passes).toBe(true);
      }
    }
    // Non-vacuous: the rule does reject some assignments.
    expect(rejected).toBeGreaterThan(0);
  });

  it("is also sufficient up to four sectors (matches the brute-force wedge fold)", () => {
    for (const rays of [3, 4, 5]) {
      for (const { dirs, assigns } of wedges(rays)) {
        const passes = borderSmallSectorRuns(dirs).every((run) =>
          run.some((c) => assigns[c] !== assigns[run[0]!]),
        );
        expect(passes).toBe(wedgeFoldsFlat(dirs, assigns));
      }
    }
  });

  it("is not sufficient at five sectors: another layer rule can still forbid the wedge", () => {
    const gap = wedges(6).find(
      ({ dirs, assigns }) =>
        borderSmallSectorRuns(dirs).every((run) =>
          run.some((c) => assigns[c] !== assigns[run[0]!]),
        ) && !wedgeFoldsFlat(dirs, assigns),
    );
    expect(gap).toBeDefined();
  });
});

describe("singleVertexFlat (Hull's crimp reduction, Lang §1.2.7)", () => {
  const corner = [eis(1, 0), eis(0, 1), eis(-1, 0), eis(-1, -1)];

  it("decides the corner of a four-valent triangle twist exactly", () => {
    for (const a of ["MMMV", "MVMM", "MMVM", "VVMV", "VMVV", "VVVM"]) {
      expect(singleVertexFlat(corner, [...a] as MV[])).toBe(true);
    }
    for (const a of ["VMMM", "MVVV", "MMMM", "MVMV"]) {
      expect(singleVertexFlat(corner, [...a] as MV[])).toBe(false);
    }
  });

  it("accepts a straight crease only when both halves agree, and rejects what is not Kawasaki", () => {
    const line = [eis(1, 0), eis(-1, 0)];
    expect(singleVertexFlat(line, [..."MM"] as MV[])).toBe(true);
    expect(singleVertexFlat(line, [..."VV"] as MV[])).toBe(true);
    expect(singleVertexFlat(line, [..."MV"] as MV[])).toBe(false);
    expect(singleVertexFlat([], [])).toBe(false);
    expect(singleVertexFlat([eis(1, 0), eis(0, 1), eis(-1, -1)], [..."MVM"] as MV[])).toBe(false);
    // Four creases that fail Kawasaki: sectors 30°, 90°, 120°, 120°.
    const skew = [eis(1, 0), eis(2, 1), eis(-1, 0), eis(-1, -1)];
    expect(kawasakiFlat(skew)).toBe(false);
    expect(singleVertexFlat(skew, [..."MMMV"] as MV[])).toBe(false);
  });

  it("rejects mismatched lengths", () => {
    expect(() => singleVertexFlat(corner, [..."MMV"] as MV[])).toThrow(RangeError);
  });

  it("is exact at degrees 4 and 6: it matches the brute-force fold for every assignment", () => {
    let folding = 0;
    let beyondBigLittleBig = 0;
    for (const degree of [4, 6]) {
      for (const dirs of new Set(candidates(degree).map((c) => c.dirs))) {
        for (const assigns of allAssignments(degree)) {
          const flat = foldsFlat(dirs, assigns);
          expect(singleVertexFlat(dirs, assigns)).toBe(flat);
          if (flat) folding++;
          if (maekawaFlat(assigns) && bigLittleBigFlat(dirs, assigns) && !flat)
            beyondBigLittleBig++;
        }
      }
    }
    expect(folding).toBeGreaterThan(0);
    // Big-Little-Big is exact only up to degree 4: at degree 6 some assignments pass it and
    // Maekawa and still cannot fold, and Hull's reduction is what rejects them.
    expect(beyondBigLittleBig).toBeGreaterThan(0);
  });

  it("agrees with the brute-force fold at degree 8 on a spread of vertices", () => {
    const dirsOf = new Set(subsets(POOL.length, 8).map((idx) => idx.map((i) => POOL[i]!)));
    const sets = [...dirsOf].filter((d) => kawasakiFlat(d));
    const assignments = allAssignments(8).filter((a) => maekawaFlat(a));
    // Brute force tries 8! layer orders, so look at every 25th vertex of the Kawasaki sets and
    // every 200th Maekawa assignment: a few dozen cases, folding and not.
    let folding = 0;
    let failing = 0;
    sets.forEach((dirs, i) => {
      if (i % 25 !== 0) return;
      assignments.forEach((assigns, j) => {
        if (j % 200 !== 0) return;
        const flat = foldsFlat(dirs, assigns);
        expect(singleVertexFlat(dirs, assigns)).toBe(flat);
        if (flat) folding++;
        else failing++;
      });
    });
    expect(folding).toBeGreaterThan(0);
    expect(failing).toBeGreaterThan(0);
  });

  it("is invariant under a cyclic shift and under swapping every M and V", () => {
    const all = [...candidates(4), ...candidates(6)];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: all.length - 1 }),
        fc.integer({ min: 1, max: 5 }),
        (i, s) => {
          const { dirs, assigns } = all[i]!;
          const k = s % dirs.length;
          const shift = <T>(xs: readonly T[]) => [...xs.slice(k), ...xs.slice(0, k)];
          const flipped = assigns.map((x) => (x === "M" ? "V" : "M")) as MV[];
          const base = singleVertexFlat(dirs, assigns);
          expect(singleVertexFlat(shift(dirs), shift(assigns))).toBe(base);
          expect(singleVertexFlat(dirs, flipped)).toBe(base);
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("checkLocalFlatFoldability: Big-Little-Big", () => {
  it("passes every hexagon twist corner", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 5 })
          .chain((s) => fc.integer({ min: s + 1, max: s + 4 }).map((r) => [s, r] as const)),
        ([s, r]) => {
          expect(checkLocalFlatFoldability(hexagonTwist(s, r)).bigLittleBig).toEqual([]);
        },
      ),
    );
  });
});
