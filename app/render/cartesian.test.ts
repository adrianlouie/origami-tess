import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { OMEGA, ONE, add, eis, rot60 } from "../../core/lattice/eisenstein";
import { RENDER_TOLERANCE, toCartesian } from "./cartesian";

const coord = fc.integer({ min: -1_000, max: 1_000 });
const eisenstein = fc.tuple(coord, coord).map(([a, b]) => eis(a, b));

describe("toCartesian", () => {
  it("sends 1 to (1, 0) and ω to (−1/2, √3/2), i.e. ω at 120°", () => {
    const one = toCartesian(ONE);
    const omega = toCartesian(OMEGA);
    expect(one.x).toBeCloseTo(1, 12);
    expect(one.y).toBeCloseTo(0, 12);
    expect(omega.x).toBeCloseTo(-0.5, 12);
    expect(omega.y).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  it("is additive: the embedding of the A2 lattice is linear", () => {
    fc.assert(
      fc.property(eisenstein, eisenstein, (z, w) => {
        const sum = toCartesian(add(z, w));
        const p = toCartesian(z);
        const q = toCartesian(w);
        expect(Math.abs(sum.x - (p.x + q.x))).toBeLessThan(RENDER_TOLERANCE);
        expect(Math.abs(sum.y - (p.y + q.y))).toBeLessThan(RENDER_TOLERANCE);
      }),
    );
  });

  it("commutes rot60 with a 60° rotation of the plane (multiplying by e^{iπ/3})", () => {
    const c = Math.cos(Math.PI / 3);
    const s = Math.sin(Math.PI / 3);
    fc.assert(
      fc.property(eisenstein, (z) => {
        const { x, y } = toCartesian(z);
        const rotated = toCartesian(rot60(z));
        expect(Math.abs(rotated.x - (c * x - s * y))).toBeLessThan(RENDER_TOLERANCE);
        expect(Math.abs(rotated.y - (s * x + c * y))).toBeLessThan(RENDER_TOLERANCE);
      }),
    );
  });
});
