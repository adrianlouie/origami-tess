import { describe, expect, it } from "vitest";
import { toCartesian } from "../simulate/embed";
import { eis } from "../lattice/eisenstein";
import { hexagonFrame } from "../gadgets/crease";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { borderRuns, paperWedges } from "./border-vertices";
import { borderLinePattern } from "./testing";

/** The angle of a direction in degrees, counter-clockwise from +x, in [0, 360). */
const degrees = (z: { a: number; b: number }) => {
  const p = toCartesian(z);
  const t = (Math.atan2(p.y, p.x) * 180) / Math.PI;
  return Math.round(t < 0 ? t + 360 : t);
};

describe("paperWedges", () => {
  const P = eis(2, 1);

  it("lists the rays at a border vertex counter-clockwise from one paper edge to the other", () => {
    const cp = borderLinePattern("U", "U");
    const v = cp.vertices.findIndex((z) => z.a === P.a && z.b === P.b);
    const wedges = paperWedges(cp).filter((w) => w.vertex === v);
    expect(wedges).toHaveLength(1);
    // The two frame edges run at 120° and 300°; the paper lies between them on the origin's side.
    expect(wedges[0]!.directions.map(degrees)).toEqual([120, 180, 210, 300]);
    expect(wedges[0]!.edges.map((e) => cp.edges[e]!.assignment)).toEqual(["B", "U", "U", "B"]);
  });

  it("never lists an interior vertex", () => {
    const cp = borderLinePattern("U", "U");
    const origin = cp.vertices.findIndex((z) => z.a === 0 && z.b === 0);
    expect(paperWedges(cp).some((w) => w.vertex === origin)).toBe(false);
  });

  it("leaves a flat crease out of the rays but keeps the sector it divides in one piece", () => {
    // Same vertex P, but the 180° crease is flat: the 120°-210° sector is one 90° sector.
    const cp = fromSegments(
      [],
      [
        ...hexagonFrame(2),
        { from: P, to: eis(-1, 1), assignment: "F" as Assignment },
        { from: P, to: eis(-2, -1), assignment: "U" as Assignment },
      ],
    );
    const v = cp.vertices.findIndex((z) => z.a === P.a && z.b === P.b);
    const wedge = paperWedges(cp).find((w) => w.vertex === v)!;
    expect(wedge.directions.map(degrees)).toEqual([120, 210, 300]);
  });

  it("splits a vertex into one wedge per stretch of paper when the sheet pinches there", () => {
    // Two triangles that touch at a vertex: the bow tie's centre has two wedges.
    const tri = (
      dx: number,
    ): { from: ReturnType<typeof eis>; to: ReturnType<typeof eis>; assignment: Assignment }[] => {
      const pts = [eis(0, 0), eis(dx, 0), eis(dx, dx > 0 ? 1 : -1)];
      return pts.map((p, i) => ({ from: p, to: pts[(i + 1) % 3]!, assignment: "B" as Assignment }));
    };
    const cp: CreasePattern = fromSegments([], [...tri(1), ...tri(-1)]);
    const centre = cp.vertices.findIndex((z) => z.a === 0 && z.b === 0);
    expect(paperWedges(cp).filter((w) => w.vertex === centre)).toHaveLength(2);
  });
});

describe("borderRuns", () => {
  it("returns the creases bounding the small sector at a border vertex", () => {
    const cp = borderLinePattern("U", "U");
    const runs = borderRuns(cp);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.edges.map((e) => cp.edges[e]!.assignment)).toEqual(["U", "U"]);
  });
});

describe("degenerate patterns", () => {
  it("lists no wedge and no run for an empty pattern, a lone vertex, or a single segment", () => {
    for (const cp of [
      fromSegments([], []),
      fromSegments([eis(0, 0)], []),
      fromSegments([], [{ from: eis(0, 0), to: eis(1, 0) }]),
    ]) {
      expect(paperWedges(cp)).toEqual([]);
      expect(borderRuns(cp)).toEqual([]);
    }
  });
});
