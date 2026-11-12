import { describe, expect, it } from "vitest";
import { IDENTITY, reflection, rotation60, type Affine } from "./affine";
import { affineGroup, closure } from "./group";
import { expectGroupAxioms } from "./testing";

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

  it("does not depend on the order of the generators, or on redundant ones", () => {
    const sameSet = (x: Affine[], y: Affine[]) =>
      x.length === y.length && x.every((a) => y.some((b) => affineGroup.equals(a, b)));
    const r = rotation60(1);
    const s = reflection();
    const d6 = closure(affineGroup, [r, s], 100);
    expect(sameSet(closure(affineGroup, [s, r], 100), d6)).toBe(true);
    // The identity, a power of r and a repeated generator add nothing.
    expect(sameSet(closure(affineGroup, [IDENTITY, rotation60(2), s, r, r], 100), d6)).toBe(true);
  });

  it("no generators gives the trivial group", () => {
    expect(closure(affineGroup, [], 10)).toEqual([IDENTITY]);
  });

  it("throws when the group exceeds the limit (translations generate an infinite group)", () => {
    const t: Affine = { m: [1, 0, 0, 1], t: { a: 1, b: 0 } };
    expect(() => closure(affineGroup, [t], 50)).toThrow(RangeError);
  });
});
