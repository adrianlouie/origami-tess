import { describe, expect, it } from "vitest";
import { eis, ZERO } from "../../core/lattice/eisenstein";
import { creasePattern, fromSegments } from "../../core/pattern/crease-pattern";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { toCartesian } from "../render/cartesian";
import { ASSIGNMENTS, sheetGeometry } from "./sheet";

describe("sheetGeometry", () => {
  it("is empty for an empty pattern", () => {
    const g = sheetGeometry(creasePattern([], []));
    expect(g.positions.length).toBe(0);
    expect(g.triangles.length).toBe(0);
    for (const a of ASSIGNMENTS) expect(g.creases[a].length).toBe(0);
  });

  it("keeps one position per vertex, in order, at z = 0", () => {
    const cp = hexagonTwist(1, 2);
    const g = sheetGeometry(cp);
    expect(g.positions.length).toBe(3 * cp.vertices.length);
    cp.vertices.forEach((z, i) => {
      expect(g.positions[3 * i]).toBeCloseTo(toCartesian(z).x, 5);
      expect(g.positions[3 * i + 1]).toBeCloseTo(toCartesian(z).y, 5);
      expect(g.positions[3 * i + 2]).toBe(0);
    });
  });

  it("bounds contain every vertex and are attained", () => {
    const g = sheetGeometry(hexagonTwist(1, 2));
    const xs = Array.from({ length: g.positions.length / 3 }, (_, i) => g.positions[3 * i]!);
    expect(g.bounds.min[0]).toBeCloseTo(Math.min(...xs), 5);
    expect(g.bounds.max[0]).toBeCloseTo(Math.max(...xs), 5);
  });

  it("triangulates a face whose boundary has collinear vertices", () => {
    // A triangle with an extra vertex halfway along one side.
    const cp = fromSegments(
      [],
      [
        { from: ZERO, to: eis(1, 0) },
        { from: eis(1, 0), to: eis(2, 0) },
        { from: eis(2, 0), to: eis(0, 2) },
        { from: eis(0, 2), to: ZERO },
      ],
    );
    const g = sheetGeometry(cp);
    expect(g.triangles.length).toBe(3);
  });

  it("rejects a face with a hole", () => {
    const outer = [eis(0, 0), eis(9, 0), eis(0, 9)];
    const inner = [eis(1, 1), eis(3, 1), eis(1, 3)];
    const cp = creasePattern(
      [...outer, ...inner],
      [
        { v0: 0, v1: 1 },
        { v0: 1, v1: 2 },
        { v0: 2, v1: 0 },
        { v0: 3, v1: 4 },
        { v0: 4, v1: 5 },
        { v0: 5, v1: 3 },
      ],
    );
    expect(() => sheetGeometry(cp)).toThrow(RangeError);
  });
});
