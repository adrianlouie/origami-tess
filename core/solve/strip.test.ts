/**
 * Strip fixtures for the layer solver (Lang, §2.6, Fig. 2.107, pp. 178 to 179).
 *
 * A strip cut by parallel creases is the one-dimensional case of flat folding, where an exact
 * answer is cheap to compute. `stripFoldsFlat` (in `testing.ts`) is that answer, written without
 * `stackingClauses`; these tests compare the solver with it.
 *
 * The book's notes say the alternating assignment is unsatisfiable where Fig. 2.107 circles a
 * covered edge. It is not: an accordion stacks its facets in order, so no hinge is ever caught
 * between layers. The tests assert that alternating strips always fold.
 */

import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { CreasePattern } from "../pattern/crease-pattern";
import { layerOrder } from "./layer-order";
import { nearFoldability } from "./near-foldability";
import { parallelStrip, stripFoldsFlat } from "./testing";

type MV = "M" | "V";

/** Every assignment of `n` creases. */
function allMv(n: number): MV[][] {
  return Array.from({ length: 2 ** n }, (_, bits) =>
    Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? "V" : "M") as MV),
  );
}

/** All width lists of length `k` with entries 1 … `max`. */
function widthLists(k: number, max: number): number[][] {
  let out: number[][] = [[]];
  for (let i = 0; i < k; i++) {
    out = out.flatMap((w) => Array.from({ length: max }, (_, x) => [...w, x + 1]));
  }
  return out;
}

const folds = (segments: readonly number[], assignments: readonly MV[]) =>
  layerOrder(parallelStrip(segments, assignments)).status === "ok";

/** The faces of a strip from left to right, by the mean x of their corners. */
function leftToRight(cp: CreasePattern): number[] {
  const meanX = (face: readonly number[]) =>
    face.reduce((sum, v) => sum + cp.vertices[v]!.a - cp.vertices[v]!.b / 2, 0) / face.length;
  return cp.faces.map((_, f) => f).sort((p, q) => meanX(cp.faces[p]!) - meanX(cp.faces[q]!));
}

const widths = fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 1, maxLength: 12 });

describe("the layer solver agrees with the exact one-dimensional strip oracle", () => {
  it.each([
    { k: 2, max: 4 },
    { k: 3, max: 4 },
    { k: 4, max: 3 },
    { k: 5, max: 3 },
    { k: 6, max: 2 },
  ])("on every assignment of every strip of $k facets of width 1 to $max", ({ k, max }) => {
    let yes = 0;
    let no = 0;
    for (const w of widthLists(k, max)) {
      for (const a of allMv(k - 1)) {
        const expected = stripFoldsFlat(w, a);
        const status = layerOrder(parallelStrip(w, a)).status;
        expect(status, `${w.join(",")} ${a.join("")}`).toBe(expected ? "ok" : "unfoldable");
        if (expected) yes++;
        else no++;
      }
    }
    // Vacuity guard: from three facets on, both outcomes occur.
    if (k >= 3) {
      expect(yes).toBeGreaterThan(0);
      expect(no).toBeGreaterThan(0);
    }
  });
});

describe("constructive strip assignments fold (Lang, Fig. 2.107)", () => {
  it("folds every accordion (alternating creases), whatever the widths", () => {
    fc.assert(
      fc.property(widths, fc.boolean(), (w, startV) => {
        const a = Array.from(
          { length: w.length - 1 },
          (_, i) => ((i % 2 === 0) === startV ? "V" : "M") as MV,
        );
        expect(folds(w, a)).toBe(true);
        // The same answer from the independent oracle for the strips it can search.
        if (w.length <= 7) expect(stripFoldsFlat(w, a)).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("folds a spiral: one assignment throughout and widths that do not grow", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 9 }),
        fc.constantFrom<MV>("M", "V"),
        (raw, x) => {
          const w = [...raw].sort((p, q) => q - p);
          expect(
            folds(
              w,
              w.slice(1).map(() => x),
            ),
          ).toBe(true);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("folds an end fold: a flap no wider than its neighbour, creased the same way", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom<MV>("M", "V"),
        (b, c, x) => {
          fc.pre(c <= b);
          expect(folds([4, b, c], [x, x])).toBe(true);
        },
      ),
    );
  });

  it("folds a crimp: two creases of opposite assignment", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        fc.constantFrom<[MV, MV]>(["M", "V"], ["V", "M"]),
        (a, b, c, pair) => {
          expect(folds([a, b, c], pair)).toBe(true);
        },
      ),
    );
  });

  it("rejects the end fold that does not fit: both outer facets wider than the middle", () => {
    expect(folds([3, 1, 3], ["V", "V"])).toBe(false);
    expect(folds([3, 1, 3], ["M", "M"])).toBe(false);
    expect(stripFoldsFlat([3, 1, 3], ["V", "V"])).toBe(false);
  });
});

describe("nearFoldability blames the strip where it fails", () => {
  it("names all three facets and both creases of the strip of thirds [3, 1, 3]", () => {
    const cp = parallelStrip([3, 1, 3], ["V", "V"]);
    const result = nearFoldability(cp);
    if (result.status !== "partial") throw new Error("expected a partial fold");
    expect(result.conflict.faces).toEqual([0, 1, 2]);
    const creaseEdges = cp.edges
      .map((e, i) => (e.assignment === "V" ? i : -1))
      .filter((i) => i >= 0);
    expect(result.conflict.creases).toEqual(creaseEdges);
  });

  it("confines every conflict to a window of the strip that is unfoldable by itself", () => {
    // Every clause among the conflict faces is a clause of the strip cut to the faces between the
    // first and last of them, so that window must be unfoldable; the oracle decides it.
    let checked = 0;
    for (const w of [...widthLists(4, 3), ...widthLists(5, 2)]) {
      for (const a of allMv(w.length - 1)) {
        if (stripFoldsFlat(w, a)) continue;
        const cp = parallelStrip(w, a);
        const result = nearFoldability(cp);
        if (result.status !== "partial") throw new Error(`${w} ${a}: expected partial`);
        const rank = new Map(leftToRight(cp).map((f, i) => [f, i]));
        const ranks = result.conflict.faces.map((f) => rank.get(f)!);
        const first = Math.min(...ranks);
        const last = Math.max(...ranks);
        expect(
          stripFoldsFlat(w.slice(first, last + 1), a.slice(first, last)),
          `${w.join(",")} ${a.join("")} window ${first}..${last}`,
        ).toBe(false);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});
