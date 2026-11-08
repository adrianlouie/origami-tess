import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, mul, OMEGA, type Eisenstein } from "../lattice/eisenstein";
import { IDENTITY, compose, equals, inverse, isIsometry } from "./affine";
import { affineGroup } from "./group";
import { contains, inLattice, p6m } from "./p6m";
import { expectGroupAxioms, randomElement, validPeriod, wordArb } from "./testing";

describe("p6m", () => {
  it("every generator is an isometry", () => {
    for (const g of p6m(eis(2, 0)).generators) expect(isIsometry(g)).toBe(true);
  });

  it("its point group is D6 of order 12 and satisfies the group axioms", () => {
    const group = p6m();
    expect(group.pointGroup).toHaveLength(12);
    expectGroupAxioms(affineGroup, group.pointGroup);
  });

  it("rejects a period whose lattice is not mirror-symmetric (that group is p6, not p6m)", () => {
    expect(() => p6m(eis(3, 1))).toThrow(RangeError); // N = 7, conj(π) is not an associate
    expect(() => p6m(eis(0, 0))).toThrow(RangeError);
  });

  it("accepts self-conjugate periods", () => {
    for (const p of [eis(1, 0), eis(2, 0), eis(1, -1), eis(2, 1)]) {
      expect(() => p6m(p)).not.toThrow();
    }
  });

  it("is a group: the generated elements contain the identity and are closed under compose and inverse", () => {
    fc.assert(
      fc.property(validPeriod, wordArb, wordArb, (period, w1, w2) => {
        const group = p6m(period);
        const f = randomElement(group, w1);
        const g = randomElement(group, w2);
        expect(contains(group, IDENTITY)).toBe(true);
        expect(contains(group, f)).toBe(true);
        expect(contains(group, compose(f, g))).toBe(true);
        expect(contains(group, inverse(f))).toBe(true);
      }),
    );
  });

  it("contains rejects a translation off the lattice and a non-D6 linear part", () => {
    const group = p6m(eis(2, 0));
    expect(contains(group, { m: [1, 0, 0, 1], t: eis(1, 0) })).toBe(false);
    expect(contains(group, { m: [1, 1, 0, 1], t: eis(0, 0) })).toBe(false);
    expect(equals(group.pointGroup[0]!, IDENTITY)).toBe(true);
  });
});

describe("inLattice", () => {
  it("agrees with brute force: z is in πΛ iff z = π·k for some lattice k", () => {
    fc.assert(
      fc.property(validPeriod, (period) => {
        const members = new Set<string>();
        for (let m = -20; m <= 20; m++) {
          for (let n = -20; n <= 20; n++) {
            const z = mul(period, eis(m, n));
            members.add(`${z.a},${z.b}`);
          }
        }
        for (let a = -6; a <= 6; a++) {
          for (let b = -6; b <= 6; b++) {
            const z: Eisenstein = eis(a, b);
            expect(inLattice(z, period)).toBe(members.has(`${a},${b}`));
          }
        }
      }),
    );
  });

  it("πΛ is closed under rotation by ω, an ideal property", () => {
    expect(inLattice(mul(eis(2, 0), OMEGA), eis(2, 0))).toBe(true);
  });
});
