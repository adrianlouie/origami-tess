/**
 * Tests for Theorem 11 (Lang, p. 41): a vertex that can be at least partly folded has no half-plane
 * with no mountain together with another half-plane with no valley.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { cross } from "../lattice/direction";
import { neg, type Eisenstein } from "../lattice/eisenstein";
import { halfPlaneMvSplit } from "./half-plane";
import { candidates, foldsFlat, POOL, type MV } from "./testing";

const signOf = (a: MV): -1 | 1 => (a === "M" ? -1 : 1);

/** True when every direction lies in one closed half-plane bounded by a line through the vertex. */
function inClosedHalfPlane(ds: readonly Eisenstein[]): boolean {
  if (ds.length === 0) return true;
  // A set inside a closed half-plane is inside one whose boundary passes through a member.
  return ds.some((d) => [d, neg(d)].some((side) => ds.every((r) => cross(side, r) >= 0)));
}

describe("halfPlaneMvSplit", () => {
  it("flags three mountains on one side and three valleys on the other", () => {
    // Directions 30°, 90°, 150° (mountains) and 210°, 270°, 330° (valleys): M - V = 0, so the
    // vertex cannot fold, and the two open half-planes above and below the x axis show it.
    const dirs = [1, 3, 5, 7, 9, 11].map((i) => POOL[i]!);
    expect(halfPlaneMvSplit(dirs, [-1, -1, -1, 1, 1, 1])).toBe(true);
  });

  it("does not flag the right vertex M, M, M, V, which folds flat", () => {
    const dirs = [0, 3, 6, 9].map((i) => POOL[i]!);
    expect(halfPlaneMvSplit(dirs, [-1, -1, -1, 1])).toBe(false);
  });

  it("treats a pair of opposite mountains as spanning a closed, not an open, half-plane", () => {
    // Mountains at 0° and 180° lie in no open half-plane, so the test does not split them from the
    // valleys at 90° and 270°. This vertex still cannot fold (M − V = 0, Maekawa): Thm 11 is a
    // necessary condition, and Maekawa's theorem catches what it lets through.
    const dirs = [0, 3, 6, 9].map((i) => POOL[i]!);
    expect(halfPlaneMvSplit(dirs, [-1, 1, -1, 1])).toBe(false);
  });

  it("ignores unfolded creases, and reports no split when nothing is folded", () => {
    const dirs = [0, 3, 6, 9].map((i) => POOL[i]!);
    expect(halfPlaneMvSplit(dirs, [0, 0, 0, 0])).toBe(false);
    expect(halfPlaneMvSplit([], [])).toBe(false);
    // One folded crease alone cannot be split from nothing: it needs a half-plane with no
    // mountain (any) and one with no valley (the one that holds it), and the theorem says such a
    // vertex cannot fold, so it is flagged.
    expect(halfPlaneMvSplit(dirs, [-1, 0, 0, 0])).toBe(true);
  });

  it("rejects mismatched input and the zero vector", () => {
    expect(() => halfPlaneMvSplit([POOL[0]!], [1, -1])).toThrow(RangeError);
    expect(() => halfPlaneMvSplit([{ a: 0, b: 0 }], [1])).toThrow(RangeError);
  });

  it("never flags a vertex that folds flat, at degrees 4 and 6 (Thm 11)", () => {
    let vertices = 0;
    let openReadingFlags = 0;
    for (const degree of [4, 6]) {
      for (const { dirs, assigns } of candidates(degree)) {
        if (!foldsFlat(dirs, assigns)) continue;
        vertices++;
        expect(halfPlaneMvSplit(dirs, assigns.map(signOf))).toBe(false);
        // The other reading, an open half-plane with no mountain, is not a theorem: the right
        // vertex M, M, M, V has no mountain in the open lower half-plane and no valley in the open
        // upper one. The half-planes of the theorem are closed.
        const mountains = dirs.filter((_, i) => assigns[i] === "M");
        const valleys = dirs.filter((_, i) => assigns[i] === "V");
        if (inClosedHalfPlane(mountains) && inClosedHalfPlane(valleys)) openReadingFlags++;
      }
    }
    expect(vertices).toBeGreaterThan(0);
    expect(openReadingFlags).toBeGreaterThan(0);
  }, 60_000);
});

describe("halfPlaneMvSplit against a brute-force reference (Thm 11)", () => {
  /**
   * Reference by the theorem's own words. POOL[i] points at 30°·i, so work in units of 15°: the
   * closed half-plane with boundary at 15°·j holds direction i when (2i − j) mod 24 is in [0, 12].
   * Every line through the vertex that matters is a multiple of 15° (a boundary at a direction or
   * midway between two), so trying j = 0..23 covers all closed half-planes up to which directions
   * they hold.
   */
  function splitByBruteForce(indices: readonly number[], signs: readonly number[]): boolean {
    const missing = (sign: number) =>
      Array.from({ length: 24 }, (_, j) => j).some((j) =>
        indices.every((i, k) => {
          const inside = (((2 * i - j) % 24) + 24) % 24 <= 12;
          return !(inside && signs[k] === sign);
        }),
      );
    if (signs.every((s) => s === 0)) return false;
    return missing(-1) && missing(1);
  }

  it("agrees with the closed half-plane definition for any signs on any directions", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 0, max: 11 }), { maxLength: 8 }),
        fc.array(fc.constantFrom<-1 | 0 | 1>(-1, 0, 1), { minLength: 8, maxLength: 8 }),
        (indices, allSigns) => {
          const signs = allSigns.slice(0, indices.length);
          const dirs = indices.map((i) => POOL[i]!);
          expect(halfPlaneMvSplit(dirs, signs)).toBe(splitByBruteForce(indices, signs));
        },
      ),
      { numRuns: 2000 },
    );
  });
});
