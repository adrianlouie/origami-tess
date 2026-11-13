import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { primitive } from "../lattice/direction";
import { eis, equals, sub, type Eisenstein } from "../lattice/eisenstein";
import { solveMv, withMvAssignment } from "../solve/solver";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import { cross } from "../lattice/direction";
import { hexagonTwistCreases } from "./hexagon-twist";
import {
  pleatEdges,
  regularTwist,
  regularTwistCreases,
  twistFrameRadii,
  type TwistSides,
} from "./regular-twist";
import { triangleTwistCreases } from "./triangle-twist";
import { piFraction } from "./twist-limits";

const DEG30 = piFraction(1, 6);
const DEG60 = piFraction(1, 3);

/** The (n, α, side, radius) cases with a twist, taken from `twistFrameRadii` so none is guessed. */
const CASES = (
  [
    [6, DEG60, [1, 2, 3]],
    [6, DEG30, [2, 4]],
    [3, DEG60, [3, 6]],
    [3, DEG30, [6]],
  ] as const
).flatMap(([n, alpha, sides]) =>
  sides.flatMap((side) =>
    twistFrameRadii(n, alpha, side, 10).map((radius) => ({ n, alpha, side, radius })),
  ),
);

/** A crease as text: where it starts and its primitive direction, ignoring assignment and length. */
const lineKey = (c: { from: Eisenstein; to: Eisenstein }) => {
  const d = primitive(sub(c.to, c.from));
  return `${c.from.a},${c.from.b}>${d.a},${d.b}`;
};
const segmentKey = (c: { from: Eisenstein; to: Eisenstein }) =>
  `${c.from.a},${c.from.b}>${c.to.a},${c.to.b}`;

describe("regularTwistCreases against the shipped gadgets", () => {
  it.each([
    [1, 2],
    [2, 5],
    [3, 4],
  ])("α = 60° with n = 6 is exactly the shipped hexagon twist (s=%i, R=%i)", (s, r) => {
    const mine = regularTwistCreases(6, DEG60, s, r).map(segmentKey).sort();
    const shipped = hexagonTwistCreases(s, r).map(segmentKey).sort();
    expect(mine).toEqual(shipped);
  });

  it.each([2, 4])(
    "α = 60° with n = 3 and the mirror hand has the shipped triangle's creases, turned a half turn (t=%i)",
    (t) => {
      // The shipped triangle has a corner at 0; mine has its circumcentre there, so the shipped
      // pattern maps to mine by z ↦ c − z with c = t(2 + ω), a rotation (it keeps the hand).
      const c = eis(2 * t, t);
      const half = (z: Eisenstein) => eis(c.a - z.a, c.b - z.b);
      const shipped = triangleTwistCreases(3 * t, 1)
        .filter((x) => x.assignment !== "B")
        .map((x) => lineKey({ from: half(x.from), to: half(x.to) }));
      const mine = new Set(
        regularTwistCreases(3, DEG60, 3 * t, 4 * t, true)
          .filter((x) => x.assignment !== "B")
          .map(lineKey),
      );
      expect(shipped).toHaveLength(9);
      for (const k of shipped) expect(mine.has(k)).toBe(true);
      // The default hand is the other twist: it does not contain them all.
      const plain = new Set(
        regularTwistCreases(3, DEG60, 3 * t, 4 * t, false)
          .filter((x) => x.assignment !== "B")
          .map(lineKey),
      );
      expect(shipped.every((k) => plain.has(k))).toBe(false);
    },
  );
});

describe.each(CASES)("regular twist n=$n α=$alpha.num/$alpha.den s=$side R=$radius", (spec) => {
  const { n, alpha, side, radius } = spec;
  const cp = regularTwist(n, alpha, side, radius);

  it("has exactly the polygon's n corners as interior vertices, so the checks are not vacuous", () => {
    const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
    expect(interior).toHaveLength(n);
    expect(cp.edges.filter((e) => e.assignment === "U")).toHaveLength(3 * n);
  });

  it("satisfies Kawasaki at every corner, and every locally valid assignment passes all checks", () => {
    expect(checkLocalFlatFoldability(cp).kawasaki).toEqual([]);
    const result = solveMv(cp);
    expect(result.status).toBe("sat");
    if (result.status !== "sat") return;
    expect(checkLocalFlatFoldability(withMvAssignment(cp, result.assignment))).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
      borderBigLittleBig: [],
      singleVertex: [],
    });
  });

  it("lists each pleat as two parallel creases of one direction, leaving the two ends of a side", () => {
    pleatEdges(n).forEach(([x, y], k) => {
      expect([x, y]).toEqual([3 * k + 1, 3 * k + 2]);
      const [e0, e1, side0] = [x, y, 3 * k].map((i) => cp.edges[i]!);
      const dir = (e: typeof e0) => sub(cp.vertices[e!.v1]!, cp.vertices[e!.v0]!);
      expect(cross(dir(e0), dir(e1))).toBe(0);
      expect(equals(primitive(dir(e0)), primitive(dir(e1)))).toBe(true);
      expect(e0!.v0).toBe(side0!.v0);
      expect(e1!.v0).toBe(side0!.v1);
    });
  });

  it("has a mirror-hand twist of the same size, with the same counts of everything", () => {
    const mirror = regularTwist(n, alpha, side, radius, true);
    expect(mirror.edges).toHaveLength(cp.edges.length);
    expect(mirror.vertices).toHaveLength(cp.vertices.length);
    expect(mirror.faces).toHaveLength(cp.faces.length);
  });
});

describe("frame radii", () => {
  it("lists the radii at which a twist exists, which depend on parity for a 30° twist", () => {
    // A 30° ray changes the hex distance by 2 per step, so only some radii are hit exactly.
    expect(twistFrameRadii(6, DEG30, 2, 10)).toEqual([4, 6, 8, 10]);
    expect(twistFrameRadii(6, DEG30, 1, 10)).toEqual([]);
    expect(twistFrameRadii(6, DEG30, 3, 10)).toEqual([5]);
    expect(twistFrameRadii(6, DEG60, 2, 6)).toEqual([3, 4, 5, 6]);
  });

  it("rejects a radius where a ray misses the ring", () => {
    expect(() => regularTwistCreases(6, DEG30, 2, 5)).toThrow(RangeError);
    expect(() => regularTwist(6, DEG30, 3, 7)).toThrow(RangeError);
  });

  it("rejects a frame that does not enclose the polygon", () => {
    expect(() => regularTwistCreases(6, DEG60, 3, 3)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, DEG60, 3, 2.5)).toThrow(RangeError);
  });
});

describe("planarity", () => {
  it("builds a planar pattern at every radius where the creases land on the ring", () => {
    // `regularTwist` would throw for a crossing; none exists in this range (and none in a scan of
    // sides 1 to 12 and radii up to 40), so the radii list is exactly the radii where rays land.
    for (const [n, alpha, sides] of [
      [6, DEG60, [1, 2, 3, 4]],
      [6, DEG30, [2, 4, 6]],
      [3, DEG60, [3, 6, 9]],
      [3, DEG30, [6, 9]],
    ] as const) {
      for (const side of sides) {
        const radii = twistFrameRadii(n, alpha, side, 16);
        for (let r = 1; r <= 16; r++) {
          let lands = true;
          try {
            regularTwistCreases(n, alpha, side, r);
          } catch {
            lands = false;
          }
          expect(radii.includes(r)).toBe(lands);
        }
      }
    }
  });
});

describe("argument checks", () => {
  it("rejects unsupported polygons, angles and sizes", () => {
    expect(() => regularTwistCreases(4 as TwistSides, DEG60, 2, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, piFraction(1, 4), 2, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, piFraction(1, 2), 2, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, piFraction(0, 1), 2, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, DEG60, 0, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(6, DEG60, 1.5, 6)).toThrow(RangeError);
    expect(() => regularTwistCreases(3, DEG60, 4, 8)).toThrow(RangeError);
    expect(() => twistFrameRadii(6, piFraction(1, 4), 2, 6)).toThrow(RangeError);
    expect(() => twistFrameRadii(4 as TwistSides, DEG60, 2, 6)).toThrow(RangeError);
  });
});

describe("properties over every case", () => {
  it("every case is planar, with one component and the frame as its only boundary", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CASES), ({ n, alpha, side, radius }) => {
        const cp = regularTwist(n, alpha, side, radius);
        const ring = cp.edges.filter((e) => e.assignment === "B");
        expect(ring).toHaveLength(6 * radius);
        expect(cp.edges.filter((e) => e.assignment !== "B")).toHaveLength(3 * n);
      }),
      { numRuns: 30 },
    );
  });
});
