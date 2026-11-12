import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexagonFrame } from "../gadgets/crease";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { halfPlane, onSegment, primitive } from "../lattice/direction";
import { add, eis, equals, neg, sub, type Eisenstein } from "../lattice/eisenstein";
import { toCartesian } from "../simulate/embed";
import { fromSegments, type CreasePattern } from "./crease-pattern";
import { foldSteps, GRID_DIRECTIONS, sheetGrid, type FoldStep } from "./fold-steps";

const GADGETS: readonly (readonly [string, CreasePattern])[] = [
  ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
  ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ["triangle twist (3, 1)", triangleTwist(3, 1)],
  ["triangle twist (4, 1)", triangleTwist(4, 1)],
  ["triangle twist (6, 2)", triangleTwist(6, 2)],
  ["star twist, full", starTwist(1, "full")],
  ["star twist, partial", starTwist(1, "partial")],
];

/** The direction on the same line as `z` that points into the upper half-plane [0, π). */
const upward = (z: Eisenstein) => (halfPlane(z) === 0 ? primitive(z) : neg(primitive(z)));

const key = (z: Eisenstein) => `${z.a},${z.b}`;
const stepKey = (p: Eisenstein, q: Eisenstein) => [key(p), key(q)].sort().join("|");

/** Unit steps (as sorted-pair keys) covered by the segments of a grid step. */
function unitSteps(segments: readonly { from: Eisenstein; to: Eisenstein }[], d: Eisenstein) {
  const out = new Set<string>();
  for (const { from, to } of segments) {
    let p = from;
    let guard = 0;
    while (!equals(p, to)) {
      const q = add(p, d);
      out.add(stepKey(p, q));
      p = q;
      if (++guard > 10_000) throw new Error("segment is not a multiple of its direction");
    }
  }
  return out;
}

type XY = { readonly x: number; readonly y: number };

/** Float reference: is (x, y) on the closed segment ab, within 1e-9? */
function onSegmentFloat(a: XY, b: XY, p: XY): boolean {
  const cr = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  return Math.abs(cr) / len < 1e-9 && dot >= -1e-9 && dot <= len * len + 1e-9;
}

/** Float reference: is the point inside or on a bounded face? (Even-odd rule.) */
function inSheetFloat(cp: CreasePattern, p: XY): boolean {
  return cp.faces.some((face) => {
    const pts = face.map((v) => toCartesian(cp.vertices[v]!));
    let inside = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      if (onSegmentFloat(a, b, p)) return true;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  });
}

/** Reference grid: every unit step in a lattice direction with ends and midpoint in the sheet and
 * not lying along a border edge, found by float tests over the bounding box. */
function referenceSteps(cp: CreasePattern, d: Eisenstein): Set<string> {
  const as = cp.vertices.map((v) => v.a);
  const bs = cp.vertices.map((v) => v.b);
  const out = new Set<string>();
  for (let a = Math.min(...as) - 1; a <= Math.max(...as) + 1; a++) {
    for (let b = Math.min(...bs) - 1; b <= Math.max(...bs) + 1; b++) {
      const p = eis(a, b);
      const q = add(p, d);
      const px = toCartesian(p);
      const qx = toCartesian(q);
      const mid = { x: (px.x + qx.x) / 2, y: (px.y + qx.y) / 2 };
      if (!inSheetFloat(cp, px) || !inSheetFloat(cp, qx) || !inSheetFloat(cp, mid)) continue;
      const onBorder = cp.edges.some(
        (e) =>
          e.assignment === "B" &&
          onSegmentFloat(toCartesian(cp.vertices[e.v0]!), toCartesian(cp.vertices[e.v1]!), mid),
      );
      if (!onBorder) out.add(stepKey(p, q));
    }
  }
  return out;
}

describe.each(GADGETS)("foldSteps of %s", (_name, cp) => {
  const steps = foldSteps(cp);
  const creaseSteps = steps.filter(
    (s): s is Extract<FoldStep, { kind: "crease" }> => s.kind === "crease",
  );

  it("is three grid steps, then valley steps, then mountain steps, then one collapse", () => {
    expect(steps.slice(0, 3).map((s) => s.kind)).toEqual(["grid", "grid", "grid"]);
    expect(steps.at(-1)!.kind).toBe("collapse");
    expect(steps.filter((s) => s.kind === "collapse")).toHaveLength(1);
    const middle = steps.slice(3, -1);
    expect(middle.every((s) => s.kind === "crease")).toBe(true);
    const order = creaseSteps.map((s) => s.assignment);
    expect(order).toEqual([...order].sort((x, y) => (x === y ? 0 : x === "V" ? -1 : 1)));
  });

  it("covers every mountain and valley edge exactly once and no other edge", () => {
    const seen = creaseSteps.flatMap((s) => s.lines.flatMap((l) => l.edges)).sort((a, b) => a - b);
    const expected = cp.edges
      .map((e, i) => [e.assignment, i] as const)
      .filter(([a]) => a === "M" || a === "V")
      .map(([, i]) => i);
    expect(seen).toEqual(expected);
  });

  it("puts into each crease step only lines of its assignment and its direction", () => {
    for (const s of creaseSteps) {
      expect(s.lines.length).toBeGreaterThan(0);
      for (const line of s.lines) {
        expect(line.assignment).toBe(s.assignment);
        expect(equals(upward(sub(line.to, line.from)), s.direction)).toBe(true);
      }
    }
  });

  it("lists the directions of each assignment once, in counter-clockwise order", () => {
    for (const a of ["V", "M"] as const) {
      const ds = creaseSteps.filter((s) => s.assignment === a).map((s) => s.direction);
      const angles = ds.map((d) => Math.atan2(toCartesian(d).y, toCartesian(d).x));
      expect(angles).toEqual([...angles].sort((x, y) => x - y));
      expect(new Set(ds.map(key)).size).toBe(ds.length);
    }
  });

  it.each(GRID_DIRECTIONS.map((d, i) => [i, d] as const))(
    "has grid direction %i equal to the reference lattice lines inside the sheet",
    (_i, d) => {
      const step = steps.find((s) => s.kind === "grid" && equals(s.direction, d));
      if (step?.kind !== "grid") throw new Error("missing grid step");
      const got = unitSteps(step.segments, d);
      expect(got).toEqual(referenceSteps(cp, d));
      // Disjoint: the segments add up to exactly the union of their unit steps.
      const total = step.segments.reduce((n, { from, to }) => {
        const v = sub(to, from);
        return n + Math.max(Math.abs(v.a), Math.abs(v.b));
      }, 0);
      expect(total).toBe(got.size);
    },
  );

  it("makes grid segments maximal: none ends where another on the same line begins", () => {
    for (const s of steps) {
      if (s.kind !== "grid") continue;
      const ends = new Map<string, number>();
      for (const { from, to } of s.segments) {
        for (const p of [from, to]) ends.set(key(p), (ends.get(key(p)) ?? 0) + 1);
      }
      // Two segments in one direction can share a point only by meeting end to end (one more
      // segment of the same direction through a point would overlap), which maximality forbids.
      expect([...ends.values()].every((n) => n === 1)).toBe(true);
    }
  });

  it("pre-creases every mountain and valley edge that runs along a lattice direction", () => {
    for (const e of cp.edges) {
      if (e.assignment !== "M" && e.assignment !== "V") continue;
      const u = cp.vertices[e.v0]!;
      const w = cp.vertices[e.v1]!;
      const d = upward(sub(w, u));
      const step = steps.find((s) => s.kind === "grid" && equals(s.direction, d));
      if (step?.kind !== "grid") continue;
      expect(
        step.segments.some((g) => onSegment(g.from, g.to, u) && onSegment(g.from, g.to, w)),
      ).toBe(true);
    }
  });
});

describe("foldSteps edge cases", () => {
  it("gives only the collapse for an empty pattern", () => {
    expect(foldSteps(fromSegments([], []))).toEqual([{ kind: "collapse" }]);
  });

  it("gives the grid and the collapse for a frame with no mountain or valley creases", () => {
    const steps = foldSteps(fromSegments([], hexagonFrame(2)));
    expect(steps.map((s) => s.kind)).toEqual(["grid", "grid", "grid", "collapse"]);
  });

  it("is deterministic", () => {
    expect(foldSteps(hexagonTwist(1, 2))).toEqual(foldSteps(hexagonTwist(1, 2)));
  });
});

describe("sheetGrid of a hexagonal sheet", () => {
  it("has 2R − 1 segments and 3R² − R unit steps in each direction (R ≥ 1)", () => {
    // The hexagon of side R has 2R + 1 lattice lines in each direction; the two along the border
    // are excluded, and the rest cross the convex sheet in one segment of length 2R − |k|.
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (R) => {
        const cp = fromSegments([], hexagonFrame(R));
        for (const d of GRID_DIRECTIONS) {
          const segments = sheetGrid(cp, d);
          expect(segments).toHaveLength(2 * R - 1);
          expect(unitSteps(segments, d).size).toBe(3 * R * R - R);
        }
      }),
    );
  });
});
