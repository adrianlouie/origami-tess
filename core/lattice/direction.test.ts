import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { eis, rot60, sub, type Eisenstein } from "./eisenstein";
import {
  compareAngle,
  cross,
  gcd,
  halfPlane,
  onSegment,
  orientation,
  primitive,
  windingNumber,
} from "./direction";

const coord = fc.integer({ min: -50, max: 50 });
const nonzero = fc
  .tuple(coord, coord)
  .filter(([a, b]) => a !== 0 || b !== 0)
  .map(([a, b]) => eis(a, b));

/** Cartesian image of a + bω, kept local because core/ must not import app/. */
function toCartesian(z: Eisenstein): { x: number; y: number } {
  return { x: z.a - z.b / 2, y: (z.b * Math.sqrt(3)) / 2 };
}

/** Angle in [0, 2π) of z, computed in floats as the reference for the exact predicates. */
function angle(z: Eisenstein): number {
  const { x, y } = toCartesian(z);
  const t = Math.atan2(y, x);
  return t < 0 ? t + 2 * Math.PI : t;
}

describe("cross", () => {
  it("has the sign of the Cartesian 2-D cross product (Im(ū·v) = (√3/2)(ad − bc))", () => {
    fc.assert(
      fc.property(nonzero, nonzero, (u, v) => {
        const p = toCartesian(u);
        const q = toCartesian(v);
        const ref = p.x * q.y - p.y * q.x;
        expect(Math.sign(cross(u, v))).toBe(Math.abs(ref) < 1e-9 ? 0 : Math.sign(ref));
      }),
    );
  });

  it("is antisymmetric", () => {
    fc.assert(
      fc.property(nonzero, nonzero, (u, v) => {
        expect(cross(u, v)).toBe(-cross(v, u) + 0);
      }),
    );
  });

  it("throws RangeError rather than returning a wrong sign when a product leaves 2^53", () => {
    const big = eis(2 ** 27, 2 ** 27);
    expect(() => cross(big, eis(2 ** 27, -(2 ** 27)))).toThrow(RangeError);
  });
});

describe("halfPlane and compareAngle", () => {
  it("orders non-parallel directions like atan2 does", () => {
    fc.assert(
      fc.property(nonzero, nonzero, (u, v) => {
        fc.pre(Math.abs(angle(u) - angle(v)) > 1e-9);
        expect(Math.sign(compareAngle(u, v))).toBe(Math.sign(angle(u) - angle(v)));
      }),
    );
  });

  it("returns 0 for directions that are positive multiples of each other", () => {
    expect(compareAngle(eis(1, 1), eis(3, 3))).toBe(0);
  });

  it("puts the +x axis first and the -x axis in the upper half-turn's end", () => {
    expect(halfPlane(eis(1, 0))).toBe(0);
    expect(halfPlane(eis(-1, 0))).toBe(1);
    expect(compareAngle(eis(1, 0), eis(-1, 0))).toBeLessThan(0);
  });

  it("is invariant under rot60: rotating both directions keeps their cyclic order", () => {
    fc.assert(
      fc.property(nonzero, nonzero, nonzero, (u, v, w) => {
        const ccw = (x: Eisenstein, y: Eisenstein, z: Eisenstein) => {
          const [k0, k1, k2] = [angle(x), angle(y), angle(z)];
          // three angles are in cyclic ccw order iff exactly one descent occurs around the cycle
          return [k0 < k1, k1 < k2, k2 < k0].filter(Boolean).length === 2;
        };
        fc.pre(new Set([u, v, w].map((z) => angle(z).toFixed(6))).size === 3);
        expect(ccw(rot60(u), rot60(v), rot60(w))).toBe(ccw(u, v, w));
      }),
    );
  });

  it("rejects the zero direction", () => {
    expect(() => halfPlane(eis(0, 0))).toThrow(RangeError);
  });
});

describe("orientation and onSegment", () => {
  it("orientation is +1 for a counter-clockwise triple, -1 for clockwise, 0 for collinear", () => {
    expect(orientation(eis(0, 0), eis(1, 0), eis(1, 1))).toBe(1);
    expect(orientation(eis(0, 0), eis(1, 1), eis(1, 0))).toBe(-1);
    expect(orientation(eis(0, 0), eis(1, 1), eis(2, 2))).toBe(0);
  });

  it("orientation flips sign when two points swap", () => {
    fc.assert(
      fc.property(nonzero, nonzero, nonzero, (p, q, r) => {
        expect(orientation(p, q, r)).toBe(-orientation(p, r, q) + 0);
      }),
    );
  });

  it("onSegment accepts the endpoints and interior, rejects collinear points beyond", () => {
    const p = eis(0, 0);
    const q = eis(4, 2);
    expect(onSegment(p, q, p)).toBe(true);
    expect(onSegment(p, q, q)).toBe(true);
    expect(onSegment(p, q, eis(2, 1))).toBe(true);
    expect(onSegment(p, q, eis(6, 3))).toBe(false);
    expect(onSegment(p, q, eis(2, 2))).toBe(false);
  });

  it("onSegment agrees with a parametric check on the sub-difference", () => {
    fc.assert(
      fc.property(
        nonzero,
        fc.integer({ min: 0, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        (d, k, n) => {
          const p = eis(1, -2);
          const q = eis(p.a + d.a * n, p.b + d.b * n);
          const r = eis(p.a + d.a * k, p.b + d.b * k);
          expect(onSegment(p, q, r)).toBe(k <= n);
          expect(sub(r, p)).toEqual(eis(d.a * k, d.b * k));
        },
      ),
    );
  });
});

describe("compareAngle as an order", () => {
  it("is a total preorder: antisymmetric and transitive (exact, no atan2)", () => {
    fc.assert(
      fc.property(nonzero, nonzero, nonzero, (u, v, w) => {
        // Summed, not negated: -Math.sign(0) is -0, which `toBe` (Object.is) tells apart from +0.
        expect(Math.sign(compareAngle(u, v)) + Math.sign(compareAngle(v, u))).toBe(0);
        if (compareAngle(u, v) <= 0 && compareAngle(v, w) <= 0) {
          expect(compareAngle(u, w)).toBeLessThanOrEqual(0);
        }
      }),
    );
  });
});

describe("gcd and primitive", () => {
  it("gcd divides both arguments and is greatest on small inputs", () => {
    fc.assert(
      fc.property(fc.nat(500), fc.nat(500), (x, y) => {
        const g = gcd(x, y);
        let best = 0;
        for (let d = 1; d <= Math.max(x, y); d++) if (x % d === 0 && y % d === 0) best = d;
        expect(g).toBe(x === 0 && y === 0 ? 0 : best);
      }),
    );
  });

  it("primitive keeps the ray, has coprime coordinates, and is idempotent", () => {
    fc.assert(
      fc.property(nonzero, (z) => {
        const p = primitive(z);
        expect(compareAngle(p, z)).toBe(0);
        expect(gcd(Math.abs(p.a), Math.abs(p.b))).toBe(1);
        expect(primitive(p)).toEqual(p);
      }),
    );
    expect(primitive(eis(0, 0))).toEqual(eis(0, 0));
  });
});

describe("windingNumber", () => {
  /** Float reference: even-odd ray casting in Cartesian coordinates. */
  function insideByRayCast(polygon: readonly Eisenstein[], p: Eisenstein): boolean {
    const q = toCartesian(p);
    let inside = false;
    for (let i = 0; i < polygon.length; i++) {
      const a = toCartesian(polygon[i]!);
      const b = toCartesian(polygon[(i + 1) % polygon.length]!);
      if (a.y > q.y !== b.y > q.y && q.x < a.x + ((q.y - a.y) * (b.x - a.x)) / (b.y - a.y)) {
        inside = !inside;
      }
    }
    return inside;
  }

  const small = fc.integer({ min: -6, max: 6 });
  const point = fc.tuple(small, small).map(([a, b]) => eis(a, b));

  it("is ±1 inside a simple polygon, 0 outside, and flips sign with orientation", () => {
    // Convex hulls are simple; a star-shaped fan about the first point is also simple.
    const square = [eis(0, 0), eis(4, 0), eis(4, 4), eis(0, 4)];
    expect(windingNumber(square, eis(2, 2))).toBe(1);
    expect(windingNumber([...square].reverse(), eis(2, 2))).toBe(-1);
    expect(windingNumber(square, eis(9, 2))).toBe(0);
    expect(windingNumber(square, eis(-1, -1))).toBe(0);
  });

  it("agrees with float ray casting for points off the boundary", () => {
    fc.assert(
      fc.property(fc.array(point, { minLength: 3, maxLength: 7 }), point, (polygon, p) => {
        const onBoundary = polygon.some((v, i) =>
          onSegment(v, polygon[(i + 1) % polygon.length]!, p),
        );
        fc.pre(!onBoundary);
        // Even-odd and non-zero winding agree for simple polygons, so require |wn| <= 1.
        const wn = windingNumber(polygon, p);
        fc.pre(Math.abs(wn) <= 1);
        expect(wn !== 0).toBe(insideByRayCast(polygon, p));
      }),
    );
  });
});
