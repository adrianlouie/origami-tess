import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eis } from "../lattice/eisenstein";
import { apply, rotation60, translation } from "../symmetry/affine";
import { edgeOrbits, mulberry32, randomOrientation } from "./symmetric-motif";
import {
  orientedPattern,
  regularTiling,
  shrinkRotate,
  TILING_SCALE,
  type TilingKind,
} from "./shrink-rotate";
import type { CreasePattern } from "../pattern/crease-pattern";

const key = (z: { a: number; b: number }) => `${z.a},${z.b}`;

/** Each crease as sorted end points and its assignment, for comparing a pattern with its image. */
function creaseTable(cp: CreasePattern): Map<string, string> {
  return new Map(
    cp.edges.map((e) => {
      const ends = [key(cp.vertices[e.v0]!), key(cp.vertices[e.v1]!)].sort().join("|");
      return [ends, e.assignment] as const;
    }),
  );
}

describe("edge orbits under a rotation about the origin", () => {
  const CASES: readonly (readonly [TilingKind, number, 2 | 3 | 6])[] = [
    ["3^6", 2, 6],
    ["3^6", 2, 3],
    ["3^6", 2, 2],
    ["6^3", 3, 6],
    ["3.6.3.6", 3, 6],
  ];

  it.each(CASES)(
    "%s radius %i, order %i: the generated pattern is invariant under the rotation",
    (kind, radius, order) => {
      const sr = shrinkRotate(regularTiling(kind, radius), { mirror: false });
      const orbits = edgeOrbits(sr, { rotation: order });
      for (const seed of [1, 2, 3]) {
        const b = randomOrientation(orbits, sr.interior.length, mulberry32(seed));
        const cp = orientedPattern(sr, b)!;
        const table = creaseTable(cp);
        const r = rotation60(6 / order);
        for (const e of cp.edges) {
          const ends = [apply(r, cp.vertices[e.v0]!), apply(r, cp.vertices[e.v1]!)];
          const image = ends.map(key).sort().join("|");
          expect(table.get(image)).toBe(e.assignment);
        }
      }
    },
  );

  it("has as many orbits as an independent brute-force count of edge classes", () => {
    const sr = shrinkRotate(regularTiling("3^6", 2), { mirror: false });
    for (const order of [1, 2, 3, 6] as const) {
      const r = rotation60(6 / order);
      const classes = new Set<string>();
      for (const e of sr.interior) {
        const images: string[] = [];
        let ends = [...e.ends];
        for (let k = 0; k < order; k++) {
          images.push(ends.map(key).sort().join("|"));
          ends = ends.map((z) => apply(r, z));
        }
        classes.add(images.sort()[0]!);
      }
      expect(edgeOrbits(sr, { rotation: order }).length).toBe(classes.size);
    }
  });

  it("keeps every edge in exactly one orbit", () => {
    const sr = shrinkRotate(regularTiling("6^3", 3), { mirror: false });
    const orbits = edgeOrbits(sr, { rotation: 6 });
    const members = orbits.flatMap((o) => o.members.map((m) => m.edge)).sort((x, y) => x - y);
    expect(members).toEqual(sr.interior.map((_, j) => j));
  });

  it("rejects an unsupported rotation order and a symmetry with no symmetric assignment", () => {
    const sr = shrinkRotate(regularTiling("3^6", 3), { mirror: false });
    expect(() => edgeOrbits(sr, { rotation: 4 as 2 })).toThrow(RangeError);
    // A half turn together with a unit translation contains half turns about edge midpoints,
    // which swap the two tiles of an edge: its pleat cannot keep its own mountain and valley.
    expect(() => edgeOrbits(sr, { rotation: 2, period: eis(1, 0) })).toThrow(RangeError);
  });
});

describe("edge orbits under a lattice translation", () => {
  it("equal orientations at edges a translation maps onto each other", () => {
    const sr = shrinkRotate(regularTiling("3^6", 3), { mirror: false });
    const period = eis(1, 0);
    const orbits = edgeOrbits(sr, { rotation: 1, period });
    expect(orbits.length).toBeLessThan(sr.interior.length);
    const b = randomOrientation(orbits, sr.interior.length, mulberry32(7));
    const t = translation(eis(TILING_SCALE * period.a, TILING_SCALE * period.b));
    const edgeAt = new Map(sr.interior.map((e, j) => [e.ends.map(key).sort().join("|"), j]));
    let linked = 0;
    sr.interior.forEach((e, j) => {
      const target = edgeAt.get(
        e.ends
          .map((z) => key(apply(t, z)))
          .sort()
          .join("|"),
      );
      if (target === undefined) return;
      linked++;
      // The translate of tile f is the tile with the translated corners.
      const corners = (f: number) =>
        sr.tiles[f]!.map((z) => key(apply(t, z)))
          .sort()
          .join("|");
      const same = sr.tiles.findIndex((_, f) => f === sr.interior[target]!.tiles[0]);
      const sameTile = corners(e.tiles[0]) === sr.tiles[same]!.map(key).sort().join("|");
      expect(b[target]).toBe(sameTile ? b[j] : !b[j]);
    });
    expect(linked).toBeGreaterThan(0);
  });
});

describe("mulberry32 and randomOrientation", () => {
  it("is reproducible, in [0, 1) and different for different seeds", () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    const xs = Array.from({ length: 20 }, () => a());
    expect(xs).toEqual(Array.from({ length: 20 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(xs).not.toEqual(Array.from({ length: 20 }, mulberry32(6)));
  });

  it("stays in [0, 1) for any 32-bit seed, and a seed and its 2^32 shift agree", () => {
    fc.assert(
      fc.property(fc.integer({ min: -(2 ** 31), max: 2 ** 32 - 1 }), (seed) => {
        const rng = mulberry32(seed);
        for (let i = 0; i < 50; i++) {
          const x = rng();
          expect(x >= 0 && x < 1).toBe(true);
        }
        expect(mulberry32(seed + 2 ** 32)()).toBe(mulberry32(seed)());
      }),
    );
  });

  it("assigns one value per orbit, up to the orbit's flips", () => {
    const sr = shrinkRotate(regularTiling("3^6", 2), { mirror: false });
    const orbits = edgeOrbits(sr, { rotation: 6 });
    const b = randomOrientation(orbits, sr.interior.length, mulberry32(3));
    for (const orbit of orbits) {
      const base = orbit.members[0]!;
      for (const m of orbit.members) expect(b[m.edge] !== m.flip).toBe(b[base.edge] !== base.flip);
    }
  });
});
