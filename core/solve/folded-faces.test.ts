import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { eis, equals as eqz, norm, sub, ZERO } from "../lattice/eisenstein";
import { hexagonFrame } from "../gadgets/crease";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { fromSegments } from "../pattern/crease-pattern";
import { faceAdjacency } from "../pattern/faces";
import { apply, compose, equals, IDENTITY, isIsometry, reflection } from "../symmetry/affine";
import { kawasakiFlat } from "../validate/local-flat-foldability";
import { creaseReflection, foldFaces } from "./folded-faces";
import { rawTriangleTwist, SPOKE_ENDS, spokePattern, subsetsOf } from "./testing";

describe("creaseReflection", () => {
  it("is the real-axis reflection for the x axis through the origin", () => {
    expect(equals(creaseReflection(ZERO, eis(1, 0)), reflection())).toBe(true);
  });

  it("rejects a zero direction and a direction that is not a lattice mirror axis", () => {
    expect(() => creaseReflection(ZERO, ZERO)).toThrow(RangeError);
    // (3, 1) is at about 19°, not a multiple of 30°.
    expect(() => creaseReflection(ZERO, eis(3, 1))).toThrow(RangeError);
  });

  it("is an orientation-reversing involution that fixes the crease line (property)", () => {
    const axis = fc.constantFrom(...SPOKE_ENDS);
    const coord = fc.integer({ min: -6, max: 6 });
    fc.assert(
      fc.property(
        coord,
        coord,
        axis,
        fc.integer({ min: 1, max: 4 }),
        coord,
        coord,
        (pa, pb, d, t, za, zb) => {
          const p = eis(pa, pb);
          const f = creaseReflection(p, d);
          const z = eis(za, zb);
          expect(isIsometry(f)).toBe(true);
          expect(f.m[0] * f.m[3] - f.m[1] * f.m[2]).toBe(-1);
          expect(equals(compose(f, f), IDENTITY)).toBe(true);
          const onLine = eis(pa + t * d.a, pb + t * d.b);
          expect(eqz(apply(f, onLine), onLine)).toBe(true);
          // A reflection preserves the distance to every point of its mirror.
          expect(norm(sub(apply(f, z), p))).toBe(norm(sub(z, p)));
        },
      ),
    );
  });
});

describe("foldFaces", () => {
  it("is consistent exactly when Kawasaki holds at the centre (exhaustive spokes)", () => {
    let ok = 0;
    let inconsistent = 0;
    for (let k = 2; k <= 6; k++) {
      for (const spokes of subsetsOf(12, k)) {
        const folded = foldFaces(spokePattern(spokes, "M"));
        const expected = kawasakiFlat(spokes.map((i) => SPOKE_ENDS[i]!));
        expect(folded.status === "ok").toBe(expected);
        if (expected) ok++;
        else inconsistent++;
      }
    }
    // Non-vacuous in both directions.
    expect(ok).toBeGreaterThan(0);
    expect(inconsistent).toBeGreaterThan(0);
  });

  it("reports the creases that disagree when the folds do not close up", () => {
    // Spokes at 0°, 60°, 120°, 180° leave sectors 60°, 60°, 60°, 180°: odd sum 120° ≠ 180°.
    const folded = foldFaces(spokePattern([0, 2, 4, 6], "M"));
    expect(folded.status).toBe("inconsistent");
    if (folded.status === "inconsistent") expect(folded.edges.length).toBeGreaterThan(0);
  });

  it("flips the far side of a straight M crease and keeps it flat across an F crease", () => {
    const fold = foldFaces(spokePattern([0, 6], "M"));
    expect(fold.status).toBe("ok");
    if (fold.status === "ok") {
      expect(fold.transforms.every((f) => isIsometry(f))).toBe(true);
      expect([...fold.flipped].sort()).toEqual([false, true]);
    }
    const flat = foldFaces(spokePattern([0, 6], "F"));
    expect(flat.status).toBe("ok");
    if (flat.status === "ok") {
      expect(flat.flipped).toEqual([false, false]);
      expect(flat.transforms.every((f) => equals(f, IDENTITY))).toBe(true);
    }
  });

  it.each([
    ["hexagon twist", hexagonTwist(2, 4)],
    ["hexagon twist, small", hexagonTwist(1, 2)],
    ["triangle twist", triangleTwist(6, 2)],
    ["triangle twist, long rays, unfoldable", rawTriangleTwist(1, 3)],
    ["star twist", starTwist(1)],
  ])("folds the %s consistently, agreeing on every crease", (_, cp) => {
    const folded = foldFaces(cp);
    expect(folded.status).toBe("ok");
    if (folded.status !== "ok") return;
    for (const a of faceAdjacency(cp)) {
      const e = cp.edges[a.edge]!;
      if (e.assignment === "B") continue;
      const fl = folded.transforms[a.left]!;
      const fr = folded.transforms[a.right]!;
      for (const v of [e.v0, e.v1]) {
        expect(eqz(apply(fl, cp.vertices[v]!), apply(fr, cp.vertices[v]!))).toBe(true);
      }
      expect(folded.flipped[a.left]).not.toBe(folded.flipped[a.right]);
    }
  });

  it("rejects an unassigned crease", () => {
    expect(() => foldFaces(spokePattern([0, 6], "U"))).toThrow(RangeError);
  });

  it("rejects a face with a hole", () => {
    const cp = fromSegments(
      [],
      [
        ...hexagonFrame(3),
        { from: ZERO, to: eis(1, 0), assignment: "M" },
        { from: eis(1, 0), to: eis(0, 1), assignment: "M" },
        { from: eis(0, 1), to: ZERO, assignment: "M" },
      ],
    );
    expect(cp.holes.some((h) => h.length > 0)).toBe(true);
    expect(() => foldFaces(cp)).toThrow(RangeError);
  });
});
