import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, rot60 } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { hexagonFrame, rotate } from "./crease";

const coord = fc.integer({ min: -20, max: 20 });

describe("rotate", () => {
  it("equals k applications of rot60, reduced mod 6 (rot60⁶ = identity), for any integer k", () => {
    fc.assert(
      fc.property(coord, coord, fc.integer({ min: -30, max: 30 }), (a, b, k) => {
        const z = eis(a, b);
        let expected = z;
        for (let i = 0; i < ((k % 6) + 6) % 6; i++) expected = rot60(expected);
        expect(rotate(z, k)).toEqual(expected);
        expect(rotate(z, k)).toEqual(rotate(z, k + 6));
      }),
    );
  });

  it("turns clockwise for negative k", () => {
    expect(rotate(eis(1, 0), -1)).toEqual(rotate(eis(1, 0), 5));
    expect(rotate(rotate(eis(3, 2), -2), 2)).toEqual(eis(3, 2));
  });

  it("rejects a non-integer turn count", () => {
    expect(() => rotate(eis(1, 0), 0.5)).toThrow(RangeError);
    expect(() => rotate(eis(1, 0), NaN)).toThrow(RangeError);
  });
});

describe("hexagonFrame", () => {
  it("lists 6R unit B edges on the ring of hex distance R", () => {
    for (const r of [1, 2, 5]) {
      const ring = hexagonFrame(r);
      expect(ring).toHaveLength(6 * r);
      for (const c of ring) {
        expect(c.assignment).toBe("B");
        expect(hexDistance(c.from)).toBe(r);
        expect(hexDistance(c.to)).toBe(r);
      }
    }
  });

  it("rejects a radius that would give an empty or invalid ring", () => {
    for (const r of [0, -1, 1.5, NaN, 2 ** 60]) expect(() => hexagonFrame(r)).toThrow(RangeError);
  });
});
