import { describe, expect, it } from "vitest";
import { IDENTITY, reflection, rotation60, type Affine } from "./affine";
import { affineGroup, closure, type Group } from "./group";

/** Checks every group axiom exhaustively over a finite set of elements. */
function expectGroupAxioms<T>(g: Group<T>, elements: readonly T[]): void {
  const has = (x: T) => elements.some((y) => g.equals(x, y));
  expect(has(g.identity)).toBe(true);
  for (const x of elements) {
    expect(g.equals(g.compose(g.identity, x), x)).toBe(true);
    expect(g.equals(g.compose(x, g.identity), x)).toBe(true);
    expect(g.equals(g.compose(x, g.inverse(x)), g.identity)).toBe(true);
    expect(has(g.inverse(x))).toBe(true);
    for (const y of elements) {
      expect(has(g.compose(x, y))).toBe(true);
      for (const z of elements) {
        expect(g.equals(g.compose(g.compose(x, y), z), g.compose(x, g.compose(y, z)))).toBe(true);
      }
    }
  }
}

describe("closure", () => {
  it("<r> is the cyclic group C6 of order 6, and satisfies the group axioms", () => {
    const c6 = closure(affineGroup, [rotation60(1)], 100);
    expect(c6).toHaveLength(6);
    expectGroupAxioms(affineGroup, c6);
  });

  it("<r, s> is the dihedral group D6 of order 12, and satisfies the group axioms", () => {
    const d6 = closure(affineGroup, [rotation60(1), reflection()], 100);
    expect(d6).toHaveLength(12);
    expectGroupAxioms(affineGroup, d6);
  });

  it("no generators gives the trivial group", () => {
    expect(closure(affineGroup, [], 10)).toEqual([IDENTITY]);
  });

  it("throws when the group exceeds the limit (translations generate an infinite group)", () => {
    const t: Affine = { m: [1, 0, 0, 1], t: { a: 1, b: 0 } };
    expect(() => closure(affineGroup, [t], 50)).toThrow(RangeError);
  });
});
