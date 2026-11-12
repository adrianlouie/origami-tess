import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexagonTwist } from "../gadgets/hexagon-twist";
import { starTwist } from "../gadgets/star-twist";
import { triangleTwist } from "../gadgets/triangle-twist";
import { primitive } from "../lattice/direction";
import { add, eis, equals, neg, sub, type Eisenstein } from "../lattice/eisenstein";
import { fromSegments, type Assignment, type CreasePattern } from "./crease-pattern";
import { creaseLines } from "./lines";

const E1 = eis(1, 0);
const E2 = eis(0, 1);

/** Unit steps from `from` along `dir` (a unit lattice vector), `n` of them, as segments. */
function ray(from: Eisenstein, dir: Eisenstein, n: number, assignment: Assignment) {
  const out = [];
  let p = from;
  for (let i = 0; i < n; i++) {
    const q = add(p, dir);
    out.push({ from: p, to: q, assignment });
    p = q;
  }
  return out;
}

const pattern = (segments: ReturnType<typeof ray>) => fromSegments([], segments);

/** Reference merge: union-find over edges, joining two same-assignment edges at a shared vertex of
 * degree 2 (within that assignment) whose outward directions are opposite. */
function bruteForceRuns(cp: CreasePattern): number[][] {
  const parent = cp.edges.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let v = 0; v < cp.vertices.length; v++) {
    for (const a of ["M", "V", "B", "F", "U"] as const) {
      const here = cp.rotation[v]!.filter((e) => cp.edges[e]!.assignment === a);
      if (here.length !== 2) continue;
      const out = here.map((e) => {
        const { v0, v1 } = cp.edges[e]!;
        return primitive(sub(cp.vertices[v0 === v ? v1 : v0]!, cp.vertices[v]!));
      });
      if (equals(out[0]!, neg(out[1]!))) parent[find(here[0]!)] = find(here[1]!);
    }
  }
  const groups = new Map<number, number[]>();
  cp.edges.forEach((_, e) => groups.set(find(e), [...(groups.get(find(e)) ?? []), e]));
  return [...groups.values()].sort((x, y) => x[0]! - y[0]!);
}

describe("creaseLines", () => {
  it("returns nothing for a pattern with no edges", () => {
    expect(creaseLines(fromSegments([eis(0, 0)], []))).toEqual([]);
  });

  it("merges a straight ray of unit edges into one line, ends in order", () => {
    const lines = creaseLines(pattern(ray(eis(0, 0), E1, 4, "M")));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.assignment).toBe("M");
    expect(lines[0]!.edges).toEqual([0, 1, 2, 3]);
    expect([lines[0]!.from, lines[0]!.to].sort((p, q) => p.a - q.a)).toEqual([
      eis(0, 0),
      eis(4, 0),
    ]);
  });

  it("splits where the assignment changes along a straight line", () => {
    const lines = creaseLines(
      pattern([...ray(eis(0, 0), E1, 2, "M"), ...ray(eis(2, 0), E1, 2, "V")]),
    );
    expect(lines.map((l) => l.assignment).sort()).toEqual(["M", "V"]);
    expect(lines.every((l) => l.edges.length === 2)).toBe(true);
  });

  it("splits where a third crease of the same assignment meets the line (a T)", () => {
    const lines = creaseLines(
      pattern([...ray(eis(0, 0), E1, 2, "M"), ...ray(eis(1, 0), E2, 1, "M")]),
    );
    expect(lines).toHaveLength(3);
  });

  it("does not merge edges that bend", () => {
    const lines = creaseLines(
      pattern([...ray(eis(0, 0), E1, 1, "V"), ...ray(eis(1, 0), E2, 1, "V")]),
    );
    expect(lines).toHaveLength(2);
  });

  it("is a partition: every edge exactly once, one assignment per line (all gadgets)", () => {
    for (const cp of [
      hexagonTwist(1, 2),
      hexagonTwist(2, 3),
      triangleTwist(3, 1),
      triangleTwist(6, 2),
      starTwist(1, "full"),
      starTwist(1, "partial"),
    ]) {
      const lines = creaseLines(cp);
      const seen = lines.flatMap((l) => l.edges).sort((x, y) => x - y);
      expect(seen).toEqual(cp.edges.map((_, i) => i));
      for (const l of lines) {
        expect(l.edges.every((e) => cp.edges[e]!.assignment === l.assignment)).toBe(true);
      }
    }
  });

  it("agrees with a brute-force union-find merge on every gadget", () => {
    for (const cp of [hexagonTwist(2, 3), triangleTwist(6, 2), starTwist(1, "full")]) {
      expect(
        creaseLines(cp)
          .map((l) => [...l.edges])
          .sort((x, y) => x[0]! - y[0]!),
      ).toEqual(bruteForceRuns(cp));
    }
  });

  it("is maximal and straight on random line arrangements (property)", () => {
    const dirs = [E1, E2, eis(-1, -1)];
    const seg = fc.record({
      x: fc.integer({ min: -3, max: 3 }),
      y: fc.integer({ min: -3, max: 3 }),
      d: fc.integer({ min: 0, max: 2 }),
      n: fc.integer({ min: 1, max: 3 }),
      a: fc.constantFrom<Assignment>("M", "V", "B"),
    });
    fc.assert(
      fc.property(fc.array(seg, { minLength: 1, maxLength: 5 }), (specs) => {
        // Overlapping or crossing input is rejected by fromSegments; skip those draws.
        let cp: CreasePattern;
        try {
          cp = pattern(specs.flatMap((s) => ray(eis(s.x, s.y), dirs[s.d]!, s.n, s.a)));
        } catch {
          return;
        }
        const lines = creaseLines(cp);
        expect(lines.map((l) => [...l.edges]).sort((x, y) => x[0]! - y[0]!)).toEqual(
          bruteForceRuns(cp),
        );
        for (const l of lines) {
          // Straight: all edges share one primitive direction up to sign.
          const d = primitive(sub(l.to, l.from));
          for (const e of l.edges) {
            const { v0, v1 } = cp.edges[e]!;
            const u = primitive(sub(cp.vertices[v1]!, cp.vertices[v0]!));
            expect(equals(u, d) || equals(u, neg(d))).toBe(true);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
