import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { foldAngle, foldAngleGradient, type Hinge } from "./dihedral";

const HINGE: Hinge = { i: 0, j: 1, k: 2, l: 3 };

/** A hinge on the x axis, wings at ±y, each rising by `alpha` toward +z (valley when alpha > 0). */
function wings(alpha: number): Float64Array {
  const c = Math.cos(alpha);
  const s = Math.sin(alpha);
  return Float64Array.from([0.3, c, s, 0, 0, 0, 1, 0, 0, 0.7, -c, s]);
}

const finite = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true });
const point = fc.tuple(finite(-2, 2), finite(-2, 2), finite(-2, 2));

/** Distances of a point from the axis line through two others. */
function awayFromAxis(x: Float64Array, n: number): number {
  const e = [x[6]! - x[3]!, x[7]! - x[4]!, x[8]! - x[5]!];
  const len = Math.hypot(...e);
  const r = [x[3 * n]! - x[3]!, x[3 * n + 1]! - x[4]!, x[3 * n + 2]! - x[5]!];
  const t = (r[0]! * e[0]! + r[1]! * e[1]! + r[2]! * e[2]!) / len;
  return Math.sqrt(Math.max(0, r[0]! ** 2 + r[1]! ** 2 + r[2]! ** 2 - t * t));
}

/** Four random nodes whose hinge is well away from degenerate and from the ±π branch cut. */
const hingeNodes = fc
  .tuple(point, point, point, point)
  .map(([i, j, k, l]) => Float64Array.from([...i, ...j, ...k, ...l]))
  .filter((x) => {
    const axis = Math.hypot(x[6]! - x[3]!, x[7]! - x[4]!, x[8]! - x[5]!);
    if (axis < 0.3 || awayFromAxis(x, 0) < 0.3 || awayFromAxis(x, 3) < 0.3) return false;
    const a = foldAngle(x, HINGE);
    return Math.abs(a) < 2.8;
  });

/** Rotates by `angle` about the unit axis (Rodrigues) and then translates. */
function rigid(x: Float64Array, axis: number[], angle: number, shift: number[]): Float64Array {
  const n = Math.hypot(...axis);
  const [ux, uy, uz] = axis.map((v) => v / n) as [number, number, number];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const out = new Float64Array(x.length);
  for (let p = 0; p < x.length; p += 3) {
    const [vx, vy, vz] = [x[p]!, x[p + 1]!, x[p + 2]!];
    const d = ux * vx + uy * vy + uz * vz;
    out[p] = vx * c + (uy * vz - uz * vy) * s + ux * d * (1 - c) + shift[0]!;
    out[p + 1] = vy * c + (uz * vx - ux * vz) * s + uy * d * (1 - c) + shift[1]!;
    out[p + 2] = vz * c + (ux * vy - uy * vx) * s + uz * d * (1 - c) + shift[2]!;
  }
  return out;
}

describe("foldAngle", () => {
  it("is 0 for a flat hinge and 2α when each wing rises by α (valley positive)", () => {
    expect(foldAngle(wings(0), HINGE)).toBeCloseTo(0, 12);
    for (const alpha of [0.1, 0.5, 1, Math.PI / 2 - 0.01]) {
      expect(foldAngle(wings(alpha), HINGE)).toBeCloseTo(2 * alpha, 10);
      expect(foldAngle(wings(-alpha), HINGE)).toBeCloseTo(-2 * alpha, 10);
    }
  });

  it("is π when the wings lie face to face", () => {
    expect(Math.abs(foldAngle(wings(Math.PI / 2), HINGE))).toBeCloseTo(Math.PI, 10);
  });

  it("does not change under a rigid motion", () => {
    fc.assert(
      fc.property(
        hingeNodes,
        fc.tuple(finite(-1, 1), finite(-1, 1), finite(-1, 1)).filter((a) => Math.hypot(...a) > 0.1),
        finite(-3, 3),
        point,
        (x, axis, angle, shift) => {
          const moved = rigid(x, axis, angle, shift);
          expect(foldAngle(moved, HINGE)).toBeCloseTo(foldAngle(x, HINGE), 9);
        },
      ),
    );
  });

  it("changes sign when z is mirrored", () => {
    fc.assert(
      fc.property(hingeNodes, (x) => {
        const m = x.map((v, p) => (p % 3 === 2 ? -v : v));
        expect(foldAngle(m, HINGE)).toBeCloseTo(-foldAngle(x, HINGE), 9);
      }),
    );
  });

  it("throws for a zero-length axis and for a wing on the axis", () => {
    const same = Float64Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, -1, 0]);
    expect(() => foldAngle(same, HINGE)).toThrow(RangeError);
    const onAxis = Float64Array.from([0.5, 0, 0, 0, 0, 0, 1, 0, 0, 0, -1, 0]);
    expect(() => foldAngle(onAxis, HINGE)).toThrow(RangeError);
  });
});

describe("foldAngleGradient", () => {
  it("matches central differences", () => {
    fc.assert(
      fc.property(hingeNodes, (x) => {
        const g = new Float64Array(12);
        foldAngleGradient(x, HINGE, g);
        const h = 1e-6;
        for (let p = 0; p < 12; p++) {
          const up = Float64Array.from(x);
          const down = Float64Array.from(x);
          up[p] = up[p]! + h;
          down[p] = down[p]! - h;
          const numeric = (foldAngle(up, HINGE) - foldAngle(down, HINGE)) / (2 * h);
          expect(g[p]!).toBeCloseTo(numeric, 5);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("sums to zero and has no net torque (translation and rotation invariance)", () => {
    fc.assert(
      fc.property(hingeNodes, (x) => {
        const g = new Float64Array(12);
        foldAngleGradient(x, HINGE, g);
        const total = [0, 0, 0];
        const torque = [0, 0, 0];
        for (let n = 0; n < 4; n++) {
          const p = [x[3 * n]!, x[3 * n + 1]!, x[3 * n + 2]!];
          const f = [g[3 * n]!, g[3 * n + 1]!, g[3 * n + 2]!];
          total[0]! += f[0]!;
          total[1]! += f[1]!;
          total[2]! += f[2]!;
          torque[0]! += p[1]! * f[2]! - p[2]! * f[1]!;
          torque[1]! += p[2]! * f[0]! - p[0]! * f[2]!;
          torque[2]! += p[0]! * f[1]! - p[1]! * f[0]!;
        }
        for (const v of [...total, ...torque]) expect(Math.abs(v)).toBeLessThan(1e-9);
      }),
    );
  });

  it("returns the same angle as foldAngle", () => {
    const x = wings(0.4);
    expect(foldAngleGradient(x, HINGE, new Float64Array(12))).toBe(foldAngle(x, HINGE));
  });
});
