/**
 * Test helpers for the Phase 5 modules (not imported by shipped code).
 *
 * Builds "spoke" patterns: a hexagonal "B" frame of radius 2 with creases from the origin to chosen
 * ring points. Every spoke direction is a multiple of 30°, a mirror axis of the lattice, so the
 * fold maps are exact; the origin is the only interior vertex, so global flat-foldability reduces
 * to the single-vertex conditions and can be checked against the validators.
 */

import { gcd } from "../lattice/direction";
import { add, eis, equals, sub, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { hexagonFrame, rotate, type Crease } from "../gadgets/crease";
import { triangleTwistCreases } from "../gadgets/triangle-twist";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { foldFaces } from "./folded-faces";

/**
 * The twelve ring points at hexDistance 2, in counter-clockwise order from +x, 30° apart: the six
 * corners 2·uᵏ (even index) and the six edge points uᵏ·(2 + ω) (odd index).
 */
export const SPOKE_ENDS: readonly Eisenstein[] = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0 ? rotate(eis(2, 0), i / 2) : rotate(eis(2, 1), (i - 1) / 2),
);

/**
 * Builds the frame plus one crease from the origin to each listed ring point.
 *
 * @param spokes - indices into {@link SPOKE_ENDS}, increasing so the creases are in
 *   counter-clockwise order
 * @param assignment - assignment of every spoke, or one per spoke in the same order
 */
export function spokePattern(
  spokes: readonly number[],
  assignment: Assignment | readonly Assignment[],
): CreasePattern {
  return fromSegments(
    [ZERO],
    [
      ...hexagonFrame(2),
      ...spokes.map((i, k) => ({
        from: ZERO,
        to: SPOKE_ENDS[i]!,
        assignment: typeof assignment === "string" ? assignment : assignment[k]!,
      })),
    ],
  );
}

/**
 * The face counter-clockwise of each spoke of a {@link spokePattern}, in spoke order.
 *
 * Sector j of the single-vertex oracle lies between crease j and crease j + 1, so it is the face
 * on the left of the ray from the origin along spoke j. A face walk keeps its face on the left of
 * each directed pair, so that face is the walk containing the pair (origin, end of spoke j).
 *
 * @returns `faces[j]` is the index into `cp.faces` of the face counter-clockwise of spoke j
 */
export function sectorFaces(cp: CreasePattern): number[] {
  const origin = cp.vertices.findIndex((p) => p.a === 0 && p.b === 0);
  return cp.rotation[origin]!.map((e) => {
    const edge = cp.edges[e]!;
    const end = edge.v0 === origin ? edge.v1 : edge.v0;
    return cp.faces.findIndex((walk) =>
      walk.some((v, i) => v === origin && walk[(i + 1) % walk.length] === end),
    );
  });
}

/** Every subset of {0, …, n − 1} with `size` elements, each in increasing order. */
export { subsets as subsetsOf } from "../validate/testing";

/**
 * Whole lattice lines in a radius-2 hexagon, as unit edges inside a "B" frame, all unassigned.
 * Every crossing of lattice lines passes Kawasaki, so M/V is the only thing left to get right.
 */
export function arrangement(lines: readonly { dir: number; offset: number }[]): Crease[] {
  const dirs = [eis(1, 0), eis(0, 1), eis(1, 1)];
  const creases: Crease[] = hexagonFrame(2);
  const seen = new Set<string>();
  for (const { dir, offset } of lines) {
    const d = dirs[dir]!;
    const base = dir === 0 ? eis(0, offset) : eis(offset, 0);
    const points: Eisenstein[] = [];
    for (let t = -6; t <= 6; t++) {
      const p = add(base, { a: d.a * t, b: d.b * t });
      if (hexDistance(p) <= 2) points.push(p);
    }
    for (let i = 0; i + 1 < points.length; i++) {
      const from = points[i]!;
      const to = points[i + 1]!;
      if (hexDistance(from) === 2 && hexDistance(to) === 2) continue;
      const key = `${from.a},${from.b}-${to.a},${to.b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      creases.push({ from, to, assignment: "U" });
    }
  }
  return creases;
}

/** The nine lattice lines (three directions, offsets −1, 0, 1) that cross the radius-2 hexagon. */
export const ALL_LINES = [0, 1, 2].flatMap((dir) => [-1, 0, 1].map((offset) => ({ dir, offset })));

/** Every choice of `size` lines from the nine that cross the radius-2 hexagon. */
export function lineSets(size: number): { dir: number; offset: number }[][] {
  const out: { dir: number; offset: number }[][] = [];
  const pick = (start: number, chosen: { dir: number; offset: number }[]) => {
    if (chosen.length === size) {
      out.push(chosen);
      return;
    }
    for (let i = start; i < ALL_LINES.length; i++) pick(i + 1, [...chosen, ALL_LINES[i]!]);
  };
  pick(0, []);
  return out;
}

/** The folded placement of a pattern, or an error if it does not fold consistently. */
export function foldedOrThrow(cp: CreasePattern) {
  const folded = foldFaces(cp);
  if (folded.status !== "ok") throw new Error("pattern does not fold");
  return folded;
}

/** The pattern with every M/V crease reset to "U", ready for the M/V solver. */
export function freed(cp: CreasePattern): CreasePattern {
  return {
    ...cp,
    edges: cp.edges.map((e) =>
      e.assignment === "M" || e.assignment === "V" ? { ...e, assignment: "U" as const } : e,
    ),
  };
}

/**
 * The triangle twist crease pattern for any n, m ≥ 1, including n < 3m where it is locally valid
 * but does not fold flat (`triangleTwist` itself rejects those sizes).
 */
export function rawTriangleTwist(side: number, rayLength: number): CreasePattern {
  return fromSegments([], triangleTwistCreases(side, rayLength));
}

/** The unit steps of a straight lattice segment: its primitive vector repeated gcd(|a|, |b|) times. */
function primitiveSteps(from: Eisenstein, to: Eisenstein, assignment: Assignment): Crease[] {
  const delta = sub(to, from);
  const n = gcd(Math.abs(delta.a), Math.abs(delta.b));
  const step = eis(delta.a / n, delta.b / n);
  return Array.from({ length: n }, (_, i) => ({
    from: add(from, { a: step.a * i, b: step.b * i }),
    to: add(from, { a: step.a * (i + 1), b: step.b * (i + 1) }),
    assignment,
  }));
}

/**
 * Hull's impossible triangle (Lang, Fig. 1.40): Kawasaki and Maekawa hold at every vertex, yet no
 * mountain/valley assignment exists.
 *
 * An equilateral triangle A = 0, B = side, C = side·(1 + ω) has a degree-4 vertex at each corner
 * with sectors 60°, 90°, 120°, 90° (the 60° inside the triangle). The 60° sector is strictly
 * smaller than both neighbours, so Big-Little-Big forces the two triangle sides at each corner to
 * differ; three sides cannot pairwise differ (an odd cycle in the local-flat-foldability graph,
 * Lang p. 47). The outer rays leave at 150° and 270° from A, 270° and 30° from B, and 30° and 150°
 * from C, so they come in parallel pairs and never cross; they end on a hexagonal frame at ring
 * points. All creases are unassigned.
 *
 * With `notch` the corner C is a vertex on the edge of the sheet instead (Fig. 1.45): the 120°
 * sector between its two outer rays is cut away, leaving a 240° wedge of paper with sectors 90°,
 * 60°, 90°, so the two interior corners A and B pass everything and only the border vertex C
 * forces the contradiction. Without Big-Little-Big at border vertices the solver accepted it.
 *
 * @param side - triangle side in lattice units, a positive even integer: along a 30° ray the
 *   distance from the origin changes by 2 per step, so rays from A and from C reach one common
 *   ring only when the parities agree
 * @param notch - cut away the 120° sector above C
 * @returns the pattern and the frame radius it needed
 * @throws RangeError if `side` is not a positive even safe integer
 */
export function hullTriangle(
  side: number,
  notch = false,
): { pattern: CreasePattern; radius: number } {
  if (!Number.isSafeInteger(side) || side < 2 || side % 2 !== 0) {
    throw new RangeError(`Side must be a positive even safe integer, got ${side}`);
  }
  const A = ZERO;
  const B = eis(side, 0);
  const C = eis(side, side);
  const NE = eis(2, 1);
  const NW = eis(-1, 1);
  const S = eis(-1, -2);
  const rays: [Eisenstein, Eisenstein][] = [
    [A, NW],
    [A, S],
    [B, S],
    [B, NE],
    [C, NE],
    [C, NW],
  ];
  // The smallest frame radius at which every ray reaches a ring point exactly: a ray whose lattice
  // steps jump over the ring would end off the frame. Along a 30° ray the distance grows by 2 per
  // step, so the parity of the radius matters and some radii miss.
  for (let radius = 2 * side + 2; radius <= 8 * side + 16; radius++) {
    const ends = rays.map(([from, dir]) => {
      let p = from;
      while (hexDistance(p) < radius) p = add(p, dir);
      return hexDistance(p) === radius ? p : null;
    });
    if (ends.some((p) => p === null)) continue;
    const frame = hexagonFrame(radius);
    const U = "U" as const;
    const triangle = [
      { from: A, to: B, assignment: U },
      { from: B, to: C, assignment: U },
      { from: C, to: A, assignment: U },
    ];
    if (!notch) {
      const spokes = rays.map(([from], i) => ({ from, to: ends[i]!, assignment: U }));
      return { pattern: fromSegments([], [...frame, ...triangle, ...spokes]), radius };
    }
    // Cut the notch: drop the ring arc between C's two outer rays and close the sheet through C.
    const [left, right] = [ends[5]!, ends[4]!];
    const start = frame.findIndex((c) => equals(c.from, left));
    const stop = frame.findIndex((c) => equals(c.from, right));
    const kept: Crease[] = [];
    for (let i = start; i !== stop; i = (i + 1) % frame.length) kept.push(frame[i]!);
    const spokes = rays.slice(0, 4).map(([from], i) => ({ from, to: ends[i]!, assignment: U }));
    return {
      pattern: fromSegments(
        [],
        [
          ...kept,
          ...primitiveSteps(right, C, "B"),
          ...primitiveSteps(C, left, "B"),
          ...triangle,
          ...spokes,
        ],
      ),
      radius,
    };
  }
  throw new RangeError(`No frame radius fits the outer rays of a triangle of side ${side}`);
}

/**
 * A strip of facets cut by parallel creases (Lang, Fig. 1.5 for three facets, Fig. 2.107 for the
 * general strip, pp. 178 to 179): a rectangle one lattice unit tall whose k facets have the given
 * widths, with one crease between each neighbouring pair.
 *
 * The creases run along 90°, a mirror axis of the lattice, so the fold maps are exact.
 *
 * @param segments - facet widths from left to right, positive integers
 * @param assignments - one "M" or "V" per crease, so `segments.length - 1` of them
 * @throws RangeError for an empty strip, a width that is not a positive safe integer, or a count
 *   of assignments that does not match
 */
export function parallelStrip(
  segments: readonly number[],
  assignments: readonly ("M" | "V")[],
): CreasePattern {
  if (segments.length === 0) throw new RangeError("a strip needs at least one facet");
  if (!segments.every((w) => Number.isSafeInteger(w) && w > 0)) {
    throw new RangeError("facet widths must be positive safe integers");
  }
  if (assignments.length !== segments.length - 1) {
    throw new RangeError("a strip of k facets has k - 1 creases");
  }
  const up = eis(1, 2);
  const width = segments.reduce((a, b) => a + b, 0);
  const bottom = (x: number) => eis(x, 0);
  const top = (x: number) => add(eis(x, 0), up);
  const lines: { from: Eisenstein; to: Eisenstein; assignment: Assignment }[] = [];
  for (let x = 0; x < width; x++) {
    lines.push({ from: bottom(x), to: bottom(x + 1), assignment: "B" });
    lines.push({ from: top(x), to: top(x + 1), assignment: "B" });
  }
  lines.push({ from: bottom(0), to: top(0), assignment: "B" });
  lines.push({ from: bottom(width), to: top(width), assignment: "B" });
  let x = 0;
  assignments.forEach((assignment, i) => {
    x += segments[i]!;
    lines.push({ from: bottom(x), to: top(x), assignment });
  });
  return fromSegments([], lines);
}

/**
 * Decides whether a strip folds flat, by trying every stacking order of its facets.
 *
 * This is the one-dimensional flat-folding model (Arkin et al., "When can you fold a map?", 2004;
 * Lang, §2.6, Fig. 2.107). Facet i occupies the interval between its two folded creases; a stack
 * order (a permutation) is valid when:
 *
 * 1. at each crease the M/V sign says which of its two facets is above. Facet i is face-up when i
 *    is even, so a valley lifts facet i + 1 above facet i exactly when i is even;
 * 2. no facet whose open interval holds a crease lies between that crease's two facets (a layer
 *    cannot pass through the hinge);
 * 3. two creases at the same place that open the same way do not interleave (their hinges would
 *    cross).
 *
 * It shares no code with `stackingClauses`, so it is an independent reference. The search is
 * exponential in the facet count, so keep strips to about eight facets.
 *
 * @param segments - facet widths, positive integers
 * @param assignments - one "M" or "V" per crease
 * @returns whether some stacking order is valid
 */
export function stripFoldsFlat(
  segments: readonly number[],
  assignments: readonly ("M" | "V")[],
): boolean {
  const k = segments.length;
  const lo: number[] = [];
  const hi: number[] = [];
  const hingeX: number[] = [];
  const hingeSide: number[] = [];
  let q = 0;
  let dir = 1;
  for (let i = 0; i < k; i++) {
    const end = q + dir * segments[i]!;
    lo.push(Math.min(q, end));
    hi.push(Math.max(q, end));
    if (i < k - 1) {
      hingeX.push(end);
      // Both facets of a crease lie on the side they came from.
      hingeSide.push(-dir);
    }
    q = end;
    dir = -dir;
  }
  const nextAbove = assignments.map((a, i) => (a === "V") !== (i % 2 === 1));

  const pos: number[] = new Array<number>(k).fill(-1);
  const used: boolean[] = new Array<boolean>(k).fill(false);

  const complete = (): boolean => {
    for (let i = 0; i < k - 1; i++) {
      const a = Math.min(pos[i]!, pos[i + 1]!);
      const b = Math.max(pos[i]!, pos[i + 1]!);
      for (let s = 0; s < k; s++) {
        if (s === i || s === i + 1) continue;
        if (lo[s]! < hingeX[i]! && hingeX[i]! < hi[s]! && a < pos[s]! && pos[s]! < b) return false;
      }
      for (let j = i + 1; j < k - 1; j++) {
        if (hingeX[j] !== hingeX[i] || hingeSide[j] !== hingeSide[i]) continue;
        const inside = (p: number) => a < p && p < b;
        if (inside(pos[j]!) !== inside(pos[j + 1]!)) return false;
      }
    }
    return true;
  };

  const place = (slot: number): boolean => {
    if (slot === k) return complete();
    for (let s = 0; s < k; s++) {
      if (used[s]) continue;
      pos[s] = slot;
      const adjacentOk = [s - 1, s].every((i) => {
        if (i < 0 || i >= k - 1 || pos[i]! < 0 || pos[i + 1]! < 0) return true;
        return nextAbove[i]! ? pos[i + 1]! > pos[i]! : pos[i + 1]! < pos[i]!;
      });
      if (adjacentOk) {
        used[s] = true;
        if (place(slot + 1)) return true;
        used[s] = false;
      }
      pos[s] = -1;
    }
    return false;
  };
  return place(0);
}
