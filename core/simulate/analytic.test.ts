/**
 * Tests for the closed-form bird's-foot relations (Lang, Eqs. 2.2 to 2.8, p. 139).
 *
 * The closed form is checked three ways that do not share its formula: hand values, the book's other
 * relations (which must agree with it), and the spherical-linkage closure of the vertex, which
 * knows only the sector angles.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { birdsFootMajor } from "./analytic";
import { closureResidual } from "./residuals";

const rad = (degrees: number) => (degrees * Math.PI) / 180;

describe("birdsFootMajor (Lang Eqs. 2.2 to 2.8)", () => {
  it("returns the minor fold as α tends to 0, where sec α = 1", () => {
    for (const minor of [0.3, 1, 2.5]) {
      expect(birdsFootMajor(1e-9, minor)).toBeCloseTo(minor, 9);
    }
  });

  it("doubles the half-angle tangent at α = 60°, where sec α = 2", () => {
    for (const minor of [0.3, 1, 2, 3]) {
      const major = birdsFootMajor(rad(60), minor);
      expect(Math.tan(major / 2)).toBeCloseTo(2 * Math.tan(minor / 2), 9);
    }
  });

  it("is zero at zero, π at π, and odd in the minor fold", () => {
    expect(birdsFootMajor(rad(40), 0)).toBe(0);
    expect(birdsFootMajor(rad(40), Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(birdsFootMajor(rad(40), -1.1)).toBeCloseTo(-birdsFootMajor(rad(40), 1.1), 12);
  });

  it("is never smaller than the minor fold and never past π (sec α ≥ 1)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.01, max: Math.PI / 2 - 0.01, noNaN: true }),
        fc.double({ min: 0, max: Math.PI, noNaN: true }),
        (alpha, minor) => {
          const major = birdsFootMajor(alpha, minor);
          expect(major).toBeGreaterThanOrEqual(minor - 1e-12);
          expect(major).toBeLessThanOrEqual(Math.PI + 1e-12);
        },
      ),
    );
  });

  it("agrees with the bend-angle relations of the same page, which do not use sec α", () => {
    // sin(β/2) = sin α sin(γ₊/2) and tan(β/2) = tan α sin(γ₋/2) describe one bend angle β, so the
    // two must give the same β for the γ₊ that the closed form returns.
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: Math.PI / 2 - 0.05, noNaN: true }),
        fc.double({ min: 0.05, max: Math.PI - 0.05, noNaN: true }),
        (alpha, minor) => {
          const major = birdsFootMajor(alpha, minor);
          const viaMajor = Math.asin(Math.sin(alpha) * Math.sin(major / 2));
          const viaMinor = Math.atan(Math.tan(alpha) * Math.sin(minor / 2));
          expect(viaMajor).toBeCloseTo(viaMinor, 9);
        },
      ),
    );
  });

  it("closes the vertex (α, α, π − α, π − α) in the spherical linkage, and a wrong major does not", () => {
    // Two opposite creases take the major fold and the other two the minor one, with some choice
    // of signs. The closure product knows only the sector angles, not the formula.
    const best = (alpha: number, major: number, minor: number): number => {
      const sectors = [alpha, alpha, Math.PI - alpha, Math.PI - alpha];
      let least = Infinity;
      for (const [x, y] of [
        [major, minor],
        [minor, major],
      ] as const) {
        for (let mask = 0; mask < 16; mask++) {
          const folds = [x, y, x, y].map((v, i) => ((mask >> i) & 1 ? -v : v));
          least = Math.min(least, closureResidual(sectors, folds));
        }
      }
      return least;
    };
    for (const degrees of [30, 45, 60, 75]) {
      for (const minor of [0.2, 0.7, 1.2, 2]) {
        const alpha = rad(degrees);
        expect(
          best(alpha, birdsFootMajor(alpha, minor), minor),
          `${degrees}°, ${minor}`,
        ).toBeLessThan(1e-9);
        expect(best(alpha, minor, minor), `${degrees}°, ${minor} without sec`).toBeGreaterThan(
          1e-3,
        );
      }
    }
  });

  it("rejects an α outside (0, π/2) and a minor fold outside [−π, π]", () => {
    expect(() => birdsFootMajor(0, 1)).toThrow(RangeError);
    expect(() => birdsFootMajor(Math.PI / 2, 1)).toThrow(RangeError);
    expect(() => birdsFootMajor(1, 4)).toThrow(RangeError);
    expect(() => birdsFootMajor(Number.NaN, 1)).toThrow(RangeError);
  });
});
