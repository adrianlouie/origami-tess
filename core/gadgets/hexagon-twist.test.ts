import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { toCartesian } from "../../app/render/cartesian";
import { cross } from "../lattice/direction";
import { add, eis, equals, rot60, sub, type Eisenstein } from "../lattice/eisenstein";
import { componentCount, faceCount } from "../pattern/crease-pattern";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import type { Crease } from "./crease";
import { hexagonTwist, hexagonTwistCreases } from "./hexagon-twist";

/** The k-th corner s·uᵏ of the hexagon. */
const corner = (s: number, k: number): Eisenstein => {
  let z = eis(s, 0);
  for (let i = 0; i < k; i++) z = rot60(z);
  return z;
};

const sizes = fc
  .integer({ min: 1, max: 6 })
  .chain((s) => fc.integer({ min: s + 1, max: s + 5 }).map((r) => [s, r] as const));

const key = (c: Crease) => {
  const [x, y] = [c.from, c.to].map((z) => `${z.a},${z.b}`).sort();
  return `${x}|${y}|${c.assignment}`;
};

describe("hexagonTwist", () => {
  it("passes Kawasaki and Maekawa at every interior vertex (s=1, R=2)", () => {
    const cp = hexagonTwist(1, 2);
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
    });
    const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
    expect(interior).toHaveLength(6);
    for (let k = 0; k < 6; k++) expect(interior.some((z) => equals(z, corner(1, k)))).toBe(true);
  });

  it("satisfies Kawasaki and Maekawa at exactly the six corners, for all sizes", () => {
    fc.assert(
      fc.property(sizes, ([s, r]) => {
        const cp = hexagonTwist(s, r);
        expect(checkLocalFlatFoldability(cp)).toEqual({
          kawasaki: [],
          maekawa: [],
          unassigned: [],
          bigLittleBig: [],
        });
        const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
        expect(interior).toHaveLength(6);
        for (let k = 0; k < 6; k++)
          expect(interior.some((z) => equals(z, corner(s, k)))).toBe(true);
      }),
    );
  });

  it("has the counted V, E and 13 bounded faces, and satisfies Euler's formula", () => {
    fc.assert(
      fc.property(sizes, ([s, r]) => {
        const cp = hexagonTwist(s, r);
        expect(cp.vertices).toHaveLength(6 + 6 * r);
        expect(cp.edges).toHaveLength(18 + 6 * r);
        expect(cp.faces).toHaveLength(13);
        expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(1 + componentCount(cp));
      }),
    );
  });

  it("is invariant under 60° rotation, assignments included", () => {
    fc.assert(
      fc.property(sizes, ([s, r]) => {
        const creases = hexagonTwistCreases(s, r);
        const rotated = creases.map((c) => ({ ...c, from: rot60(c.from), to: rot60(c.to) }));
        expect(new Set(rotated.map(key))).toEqual(new Set(creases.map(key)));
      }),
    );
  });

  it("builds each pleat from two parallel rays of length R − s with opposite M/V", () => {
    fc.assert(
      fc.property(sizes, ([s, r]) => {
        const have = new Set(hexagonTwistCreases(s, r).map(key));
        for (let k = 0; k < 6; k++) {
          // Extension X_k leaves P_k along uᵏ⁺¹ and radial R_{k+1} leaves P_{k+1} along the same
          // direction, so the pair is parallel by construction; both end on the frame ring.
          let step = eis(r - s, 0);
          for (let i = 0; i < k + 1; i++) step = rot60(step);
          const ends = (p: Eisenstein): Crease => ({
            from: p,
            to: add(p, step),
            assignment: "M",
          });
          const x = ends(corner(s, k));
          const radial = ends(corner(s, k + 1));
          expect(cross(sub(x.to, x.from), sub(radial.to, radial.from))).toBe(0);
          expect(have.has(key({ ...x, assignment: "V" }))).toBe(true);
          expect(have.has(key({ ...radial, assignment: "M" }))).toBe(true);
        }
      }),
    );
  });

  it("matches a float sector sum at each corner (alternating sectors total π)", () => {
    const cp = hexagonTwist(2, 4);
    for (const v of interiorVertices(cp)) {
      const angles = cp.rotation[v]!.map((e) => {
        const ed = cp.edges[e]!;
        const o = cp.vertices[ed.v0 === v ? ed.v1 : ed.v0]!;
        const d = toCartesian(sub(o, cp.vertices[v]!));
        const t = Math.atan2(d.y, d.x);
        return t < 0 ? t + 2 * Math.PI : t;
      });
      let sum = 0;
      for (let i = 0; i < angles.length; i += 2) {
        const next = angles[(i + 1) % angles.length]!;
        sum += next - angles[i]! + (next < angles[i]! ? 2 * Math.PI : 0);
      }
      expect(sum).toBeCloseTo(Math.PI, 9);
    }
  });

  it("rejects bad sizes", () => {
    expect(() => hexagonTwist(0, 3)).toThrow(RangeError);
    expect(() => hexagonTwist(-1, 3)).toThrow(RangeError);
    expect(() => hexagonTwist(1.5, 3)).toThrow(RangeError);
    expect(() => hexagonTwist(2, 2)).toThrow(RangeError);
    expect(() => hexagonTwist(2, 2.5)).toThrow(RangeError);
  });
});
