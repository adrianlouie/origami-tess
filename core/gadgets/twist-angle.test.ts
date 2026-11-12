import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { add, eis, equals, mul, OMEGA, rot60, sub, type Eisenstein } from "../lattice/eisenstein";
import type { CreasePattern } from "../pattern/crease-pattern";
import { foldFaces } from "../solve/folded-faces";
import { compose, inverse, rotation60 } from "../symmetry/affine";
import type { Crease } from "./crease";
import { hexagonTwist, hexagonTwistCreases } from "./hexagon-twist";
import { triangleTwist, triangleTwistCreases } from "./triangle-twist";
import { lineAngle, piFraction, twistRegime, type PiFraction } from "./twist-limits";

/** The k-th corner s·uᵏ of the hexagon, counter-clockwise. */
const hexCorner = (s: number, k: number): Eisenstein => {
  let z = eis(s, 0);
  for (let i = 0; i < k; i++) z = rot60(z);
  return z;
};

/** The corners of the triangle twist, counter-clockwise: 0, n and n·(1 + ω). */
const triCorners = (n: number): Eisenstein[] => [
  eis(0, 0),
  eis(n, 0),
  mul(eis(n, 0), add(eis(1, 0), OMEGA)),
];

/**
 * The twist angle α at every corner: the acute angle between each pleat crease leaving the corner
 * and the polygon side that leaves it counter-clockwise (Lang §3.4). Pleats are the creases at a
 * corner that are neither a polygon side nor a frame edge.
 */
function twistAngles(creases: readonly Crease[], corners: readonly Eisenstein[]): PiFraction[] {
  const isCorner = (z: Eisenstein) => corners.some((c) => equals(c, z));
  const angles: PiFraction[] = [];
  corners.forEach((p, k) => {
    const side = sub(corners[(k + 1) % corners.length]!, p);
    for (const c of creases) {
      if (c.assignment === "B" || !equals(c.from, p) || isCorner(c.to)) continue;
      angles.push(lineAngle(side, sub(c.to, c.from)));
    }
  });
  return angles;
}

/**
 * The turn of the central polygon relative to the paper around it, in 60° steps.
 *
 * The centre face is the one whose corners are exactly the polygon's. The outer wedges are the
 * faces on the same side of the paper as the centre (not flipped) that touch the frame. Each
 * wedge W gives the map T_W⁻¹∘T_centre, and `foldFaces` places faces by reflections across creases
 * only, so the relative map does not depend on which face it holds fixed. Returns the step count k
 * with that map's linear part rotation60(k) for each wedge, or null where it is not a rotation.
 */
function centreTurns(cp: CreasePattern, corners: readonly Eisenstein[]): (number | null)[] {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("the twist must be consistent");
  const isCorner = (v: number) => corners.some((c) => equals(c, cp.vertices[v]!));
  const centre = cp.faces.findIndex((f) => f.length === corners.length && f.every(isCorner));
  expect(centre).toBeGreaterThanOrEqual(0);
  const touchesFrame = (f: readonly number[]) =>
    f.some((v, i) => {
      const w = f[(i + 1) % f.length]!;
      return cp.edges.some(
        (e) => e.assignment === "B" && ((e.v0 === v && e.v1 === w) || (e.v0 === w && e.v1 === v)),
      );
    });
  const turns: (number | null)[] = [];
  cp.faces.forEach((f, i) => {
    if (i === centre || folded.flipped[i] || !touchesFrame(f)) return;
    const rel = compose(inverse(folded.transforms[i]!), folded.transforms[centre]!);
    const k = [0, 1, 2, 3, 4, 5].find((s) => rel.m.join() === rotation60(s).m.join());
    turns.push(k ?? null);
  });
  return turns;
}

const hexSizes = fc
  .integer({ min: 1, max: 4 })
  .chain((s) => fc.integer({ min: s + 1, max: s + 3 }).map((r) => [s, r] as const));
const triSizes = fc
  .integer({ min: 1, max: 3 })
  .chain((m) => fc.integer({ min: 3 * m, max: 3 * m + 4 }).map((n) => [n, m] as const));

/**
 * The central turn in 60° steps when the centre turns through 2α: 2α/(π/3) = 6α/π. It is an
 * integer for every 30° pleat angle that is a multiple of 30°, and the turn may go either way.
 */
const stepsOfTwoAlpha = (alpha: PiFraction) => (6 * alpha.num) / alpha.den;

describe("the hexagon twist against Lang Ch. 3", () => {
  it("has twist angle α = 60° at every pleat, which is αcrit(6): a closed-back twist", () => {
    fc.assert(
      fc.property(hexSizes, ([s, r]) => {
        const corners = Array.from({ length: 6 }, (_, k) => hexCorner(s, k));
        const angles = twistAngles(hexagonTwistCreases(s, r), corners);
        expect(angles).toHaveLength(12);
        for (const a of angles) {
          expect(a).toEqual(piFraction(1, 3));
          expect(twistRegime(6, a)).toBe("closed-back");
        }
      }),
    );
  });

  it("turns its centre by 2α = 120° against every outer wedge, the same way for all six", () => {
    fc.assert(
      fc.property(hexSizes, ([s, r]) => {
        const corners = Array.from({ length: 6 }, (_, k) => hexCorner(s, k));
        const turns = centreTurns(hexagonTwist(s, r), corners);
        expect(turns).toHaveLength(6);
        const alpha = twistAngles(hexagonTwistCreases(s, r), corners)[0]!;
        const steps = stepsOfTwoAlpha(alpha);
        expect(steps).toBe(2);
        expect(new Set(turns).size).toBe(1);
        expect([steps, 6 - steps]).toContain(turns[0]);
      }),
      { numRuns: 20 },
    );
  });
});

describe("the triangle twist against Lang Ch. 3", () => {
  it("has twist angle α = 60° at every pleat, above αcrit(3) = 30°: a supercritical twist", () => {
    fc.assert(
      fc.property(triSizes, ([n, m]) => {
        const angles = twistAngles(triangleTwistCreases(n, m), triCorners(n));
        expect(angles).toHaveLength(6);
        for (const a of angles) {
          expect(a).toEqual(piFraction(1, 3));
          expect(twistRegime(3, a)).toBe("supercritical");
        }
      }),
    );
  });

  it("turns its centre by 2α = 120° against every outer wedge, the same way for all three", () => {
    fc.assert(
      fc.property(triSizes, ([n, m]) => {
        const turns = centreTurns(triangleTwist(n, m), triCorners(n));
        expect(turns).toHaveLength(3);
        const alpha = twistAngles(triangleTwistCreases(n, m), triCorners(n))[0]!;
        const steps = stepsOfTwoAlpha(alpha);
        expect(steps).toBe(2);
        expect(new Set(turns).size).toBe(1);
        expect([steps, 6 - steps]).toContain(turns[0]);
      }),
      { numRuns: 20 },
    );
  });
});
