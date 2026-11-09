import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis } from "../lattice/eisenstein";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { bigLittleBigFlat } from "./big-little-big";
import { checkLocalFlatFoldability, kawasakiFlat, maekawaFlat } from "./local-flat-foldability";
import { candidates, foldsFlat, type MV } from "./testing";

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
