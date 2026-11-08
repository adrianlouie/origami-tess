import { describe, expect, it } from "vitest";
import { tilingToSvg } from "../../app/render/svg";
import { toCartesian, RENDER_TOLERANCE } from "../../app/render/cartesian";
import { add, eis, equals, sub, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { componentCount, faceCount, type CreasePattern } from "../pattern/crease-pattern";
import { checkLocalFlatFoldability, interiorVertices } from "../validate/local-flat-foldability";
import { rotate, scale, type Crease } from "./crease";
import { hexagonTwist, hexagonTwistCreases } from "./hexagon-twist";
import { starTwist, starTwistCreases } from "./star-twist";
import { triangleTwist, triangleTwistCreases } from "./triangle-twist";

/**
 * Interface tests between Phase 3 gadgets and the rest of the pipeline (step 3.7): every gadget
 * output must feed the crease graph, satisfy the validators at exactly its documented vertices,
 * agree with a float angle sum, and render. Per-gadget details live in each gadget's own test.
 */

const u = (k: number) => rotate(eis(1, 0), k);

type Case = {
  name: string;
  creases: Crease[];
  cp: CreasePattern;
  /** The vertices the gadget's TSDoc names as its interior vertices. */
  vertices: Eisenstein[];
};

function cases(): Case[] {
  const out: Case[] = [];
  for (const [s, r] of [
    [1, 2],
    [2, 5],
    [3, 4],
  ] as const) {
    out.push({
      name: `hexagon twist (s=${s}, R=${r})`,
      creases: hexagonTwistCreases(s, r),
      cp: hexagonTwist(s, r),
      vertices: [0, 1, 2, 3, 4, 5].map((k) => scale(u(k), s)),
    });
  }
  for (const [n, m] of [
    [1, 1],
    [2, 1],
    [1, 3],
    [3, 2],
  ] as const) {
    const p1 = eis(n, 0);
    // Corners P₀ = 0, P₁ = n, P₂ = n·u.
    out.push({
      name: `triangle twist (n=${n}, m=${m})`,
      creases: triangleTwistCreases(n, m),
      cp: triangleTwist(n, m),
      vertices: [ZERO, p1, scale(u(1), n)],
    });
  }
  for (const s of [1, 2, 3]) {
    const vertices: Eisenstein[] = [ZERO];
    for (let k = 0; k < 6; k++) {
      vertices.push(scale(u(k), s), add(scale(u(k), s), scale(u(k + 1), s)), scale(u(k), 2 * s));
    }
    out.push({
      name: `star twist (s=${s})`,
      creases: starTwistCreases(s),
      cp: starTwist(s),
      vertices,
    });
  }
  return out;
}

/** Sum of the odd-numbered sector angles at vertex v, in radians, from floating-point atan2. */
function oddSectorSum(cp: CreasePattern, v: number): number {
  const here = cp.vertices[v]!;
  const angles = cp.rotation[v]!.map((e) => {
    const edge = cp.edges[e]!;
    const other = edge.v0 === v ? edge.v1 : edge.v0;
    const p = toCartesian(sub(cp.vertices[other]!, here));
    const t = Math.atan2(p.y, p.x);
    return t < 0 ? t + 2 * Math.PI : t;
  });
  let sum = 0;
  for (let i = 0; i < angles.length; i += 2) {
    const next = angles[(i + 1) % angles.length]!;
    sum += next - angles[i]! + (next < angles[i]! ? 2 * Math.PI : 0);
  }
  return sum;
}

describe.each(cases())("$name", ({ creases, cp, vertices }) => {
  it("has a clean local-flat-foldability report", () => {
    expect(checkLocalFlatFoldability(cp)).toEqual({
      kawasaki: [],
      maekawa: [],
      unassigned: [],
      bigLittleBig: [],
    });
  });

  it("has exactly the documented interior vertices, so the report is not vacuous", () => {
    const interior = interiorVertices(cp).map((v) => cp.vertices[v]!);
    expect(interior).toHaveLength(vertices.length);
    for (const z of vertices) expect(interior.some((w) => equals(w, z))).toBe(true);
  });

  it("is one connected component with no nested parts, and satisfies Euler's formula", () => {
    expect(componentCount(cp)).toBe(1);
    expect(cp.holes.every((h) => h.length === 0)).toBe(true);
    expect(cp.vertices.length - cp.edges.length + faceCount(cp)).toBe(2);
  });

  it("has odd sector angles summing to π at every interior vertex (float cross-check)", () => {
    for (const v of interiorVertices(cp)) {
      expect(Math.abs(oddSectorSum(cp, v) - Math.PI)).toBeLessThan(RENDER_TOLERANCE);
    }
  });

  it("lists every crease segment once (no repeated or reversed duplicates)", () => {
    const keys = creases.map((c) =>
      [c.from, c.to]
        .map((z) => `${z.a},${z.b}`)
        .sort()
        .join("|"),
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(creases).toHaveLength(cp.edges.length);
  });

  it("renders: one line per crease, all inside the viewBox", () => {
    const svg = tilingToSvg({ points: cp.vertices, edges: creases });
    const box = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [
      number,
      number,
      number,
      number,
    ];
    const lines = [...svg.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)];
    expect(lines).toHaveLength(cp.edges.length);
    for (const line of lines) {
      const [x1, y1, x2, y2] = line.slice(1).map(Number) as [number, number, number, number];
      for (const [x, y] of [
        [x1, y1],
        [x2, y2],
      ] as const) {
        expect(x).toBeGreaterThanOrEqual(box[0]);
        expect(x).toBeLessThanOrEqual(box[0] + box[2]);
        expect(y).toBeGreaterThanOrEqual(box[1]);
        expect(y).toBeLessThanOrEqual(box[1] + box[3]);
      }
    }
  });
});
