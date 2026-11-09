/**
 * Which faces overlap in the flat-folded state.
 *
 * Sits at the "solve" stage of the data flow, right after `folded-faces.ts`: two faces need a
 * layer-order variable only if their folded interiors share area, so Phase 5 starts from this
 * relation. Faces may be non-convex, so each is cut into triangles by ear clipping, and triangle
 * pairs are compared with a separating-axis test. Every decision is an exact integer orientation
 * sign from `lattice/direction.ts`.
 *
 * Reference: Meisters, "Polygons have ears" (1975) for ear clipping; de Berg et al.,
 * "Computational Geometry", §3.1; the separating-axis theorem for convex sets (two convex polygons
 * have disjoint interiors iff some edge line separates them).
 */

import { orientation } from "../lattice/direction";
import type { Eisenstein } from "../lattice/eisenstein";
import type { CreasePattern, Face } from "../pattern/crease-pattern";
import { apply, type Affine } from "../symmetry/affine";

/** Three lattice points, in any orientation. */
export type Triangle = readonly [Eisenstein, Eisenstein, Eisenstein];

/**
 * Cuts a face into triangles whose union is the face and whose interiors are disjoint.
 *
 * Ear clipping (Meisters 1975). Vertices where the boundary goes straight on (collinear with their
 * neighbours) are dropped first: they do not change the region, and a straight vertex can never be
 * the tip of an ear. A vertex is then an ear tip when it turns left and no other remaining vertex
 * lies in the closed triangle with its two neighbours; the closed test rejects a diagonal that
 * touches the boundary. A simple polygon always has such an ear, so the loop cannot stall.
 *
 * @param vertices - vertex positions of the crease pattern
 * @param face - a counter-clockwise boundary walk of a simple polygon
 * @returns counter-clockwise triangles with positive area; empty for a face of zero area
 * @throws RangeError if the walk is not a simple polygon (no ear exists)
 */
export function triangulateFace(vertices: readonly Eisenstein[], face: Face): Triangle[] {
  let ring = face.map((v) => vertices[v]!);
  for (let again = true; again;) {
    again = false;
    for (let i = 0; i < ring.length && ring.length >= 3; i++) {
      const prev = ring[(i + ring.length - 1) % ring.length]!;
      const next = ring[(i + 1) % ring.length]!;
      if (orientation(prev, ring[i]!, next) === 0) {
        ring = ring.filter((_, j) => j !== i);
        again = true;
        i--;
      }
    }
  }
  const out: Triangle[] = [];
  while (ring.length > 3) {
    const n = ring.length;
    const ear = ring.findIndex((cur, i) => {
      const a = ring[(i + n - 1) % n]!;
      const c = ring[(i + 1) % n]!;
      if (orientation(a, cur, c) <= 0) return false;
      return ring.every(
        (q, j) =>
          j === i ||
          j === (i + n - 1) % n ||
          j === (i + 1) % n ||
          !(
            orientation(a, cur, q) >= 0 &&
            orientation(cur, c, q) >= 0 &&
            orientation(c, a, q) >= 0
          ),
      );
    });
    if (ear < 0) throw new RangeError("Face is not a simple polygon: no ear found");
    out.push([ring[(ear + n - 1) % n]!, ring[ear]!, ring[(ear + 1) % n]!]);
    ring = ring.filter((_, j) => j !== ear);
  }
  if (ring.length === 3) out.push([ring[0]!, ring[1]!, ring[2]!]);
  return out;
}

/**
 * Returns true when two triangles share interior area (touching along an edge or at a point does
 * not count).
 *
 * Separating-axis test: two convex polygons with non-empty interior have disjoint interiors iff
 * some edge of one has the whole other polygon on its closed outer side. With both triangles
 * counter-clockwise, "outer" is orientation ≤ 0 against the directed edge.
 *
 * @returns false if either triangle has zero area
 */
export function trianglesOverlap(s: Triangle, t: Triangle): boolean {
  const ccw = (x: Triangle): Triangle | undefined => {
    const o = orientation(x[0], x[1], x[2]);
    if (o === 0) return undefined;
    return o > 0 ? x : [x[0], x[2], x[1]];
  };
  const a = ccw(s);
  const b = ccw(t);
  if (a === undefined || b === undefined) return false;
  const separates = (p: Triangle, q: Triangle) =>
    [0, 1, 2].some((i) => q.every((r) => orientation(p[i]!, p[(i + 1) % 3]!, r) <= 0));
  return !separates(a, b) && !separates(b, a);
}

/** Bounding box in lattice coordinates; disjoint boxes imply disjoint sets (the map to the plane is linear). */
type Box = { aMin: number; aMax: number; bMin: number; bMax: number };

const boxOf = (ts: readonly Triangle[]): Box => {
  const box = { aMin: Infinity, aMax: -Infinity, bMin: Infinity, bMax: -Infinity };
  for (const t of ts) {
    for (const p of t) {
      box.aMin = Math.min(box.aMin, p.a);
      box.aMax = Math.max(box.aMax, p.a);
      box.bMin = Math.min(box.bMin, p.b);
      box.bMax = Math.max(box.bMax, p.b);
    }
  }
  return box;
};

const boxesMeet = (x: Box, y: Box) =>
  x.aMin < y.aMax && y.aMin < x.aMax && x.bMin < y.bMax && y.bMin < x.bMax;

/**
 * Moves every face's triangulation to its flat-folded position.
 *
 * Each face is triangulated in the crease pattern and the triangles are moved by the face's folded
 * map. The map is an isometry, so triangles stay triangles and every later test stays exact.
 *
 * @param cp - the crease pattern
 * @param transforms - the folded map of each face, from `foldFaces`
 * @returns `result[f]` is the triangulation of face f in the folded plane
 * @throws RangeError if `transforms` does not have one entry per face
 */
export function foldedTriangles(cp: CreasePattern, transforms: readonly Affine[]): Triangle[][] {
  if (transforms.length !== cp.faces.length) {
    throw new RangeError(`Expected ${cp.faces.length} transforms, got ${transforms.length}`);
  }
  return cp.faces.map((face, f) =>
    triangulateFace(cp.vertices, face).map(
      (t) => t.map((p) => apply(transforms[f]!, p)) as unknown as Triangle,
    ),
  );
}

/**
 * Lists the pairs of faces whose flat-folded interiors overlap.
 *
 * Two faces overlap iff some pair of their triangles does. A face that folds onto its neighbour
 * across an M or V crease lies on top of it and so overlaps it; faces that meet across a flat ("F")
 * crease touch along it but do not overlap, so they appear only if they also share area elsewhere.
 *
 * @param cp - the crease pattern
 * @param transforms - the folded map of each face, from `foldFaces`
 * @returns pairs [i, j] with i < j, in lexicographic order
 * @throws RangeError if `transforms` does not have one entry per face
 */
export function overlappingFacePairs(
  cp: CreasePattern,
  transforms: readonly Affine[],
): [number, number][] {
  return overlapPairsOf(foldedTriangles(cp, transforms));
}

/** {@link overlappingFacePairs} for triangulations that are already folded. */
export function overlapPairsOf(folded: readonly (readonly Triangle[])[]): [number, number][] {
  const boxes = folded.map(boxOf);
  const out: [number, number][] = [];
  for (let i = 0; i < folded.length; i++) {
    for (let j = i + 1; j < folded.length; j++) {
      if (!boxesMeet(boxes[i]!, boxes[j]!)) continue;
      if (folded[i]!.some((s) => folded[j]!.some((t) => trianglesOverlap(s, t)))) out.push([i, j]);
    }
  }
  return out;
}

/** Do two bounding boxes (see {@link boxOf}) have overlapping interiors? */
export function trianglesBoxesMeet(x: readonly Triangle[], y: readonly Triangle[]): boolean {
  return boxesMeet(boxOf(x), boxOf(y));
}

/**
 * Do the closed segments pq and rs lie on one line and share a stretch of positive length?
 *
 * Both orientation tests must be zero (collinear), and the two intervals, projected on the lattice
 * coordinate along which pq varies, must overlap in more than a point. A lattice coordinate is a
 * linear function of position, so it orders collinear points the same way arc length does.
 *
 * @throws RangeError if p = q (a segment needs a direction)
 */
export function segmentsOverlapCollinear(
  p: Eisenstein,
  q: Eisenstein,
  r: Eisenstein,
  s: Eisenstein,
): boolean {
  if (p.a === q.a && p.b === q.b) throw new RangeError("Segment has zero length");
  if (orientation(p, q, r) !== 0 || orientation(p, q, s) !== 0) return false;
  const along = (z: Eisenstein) => (p.a !== q.a ? z.a : z.b);
  const lo = Math.max(Math.min(along(p), along(q)), Math.min(along(r), along(s)));
  const hi = Math.min(Math.max(along(p), along(q)), Math.max(along(r), along(s)));
  return lo < hi;
}

/**
 * Do two collinear segments point the same way? (+1) or opposite ways (−1).
 *
 * @throws RangeError if either segment has zero length
 */
export function sameDirection(p: Eisenstein, q: Eisenstein, r: Eisenstein, s: Eisenstein): 1 | -1 {
  const along = (u: Eisenstein, v: Eisenstein) => {
    const d = p.a !== q.a ? [v.a - u.a, q.a - p.a] : [v.b - u.b, q.b - p.b];
    return Math.sign(d[0]!) * Math.sign(d[1]!);
  };
  if ((r.a === s.a && r.b === s.b) || (p.a === q.a && p.b === q.b)) {
    throw new RangeError("Segment has zero length");
  }
  return along(r, s) >= 0 ? 1 : -1;
}

/** A half-plane A·x + B·y + C > 0 in lattice coordinates, with exact big integers. */
type HalfPlane = { readonly A: bigint; readonly B: bigint; readonly C: bigint };

/**
 * The open half-plane to the left of the directed line u → v.
 *
 * Formula: orientation(u, v, r) = (v.a − u.a)(r.b − u.b) − (v.b − u.b)(r.a − u.a), which is linear
 * in r = (x, y) = (r.a, r.b); its sign is the side of r (see `lattice/direction.ts`).
 */
function leftOf(u: Eisenstein, v: Eisenstein): HalfPlane {
  const dx = BigInt(v.a - u.a);
  const dy = BigInt(v.b - u.b);
  return { A: -dy, B: dx, C: dy * BigInt(u.a) - dx * BigInt(u.b) };
}

/** The three open half-planes whose intersection is the interior of a non-degenerate triangle. */
function triangleHalfPlanes(t: Triangle): HalfPlane[] | undefined {
  const o = orientation(t[0], t[1], t[2]);
  if (o === 0) return undefined;
  const c = o > 0 ? t : ([t[0], t[2], t[1]] as const);
  return [leftOf(c[0], c[1]), leftOf(c[1], c[2]), leftOf(c[2], c[0])];
}

/**
 * Do the interiors of some triangles share a common point (of positive area)?
 *
 * The intersection K of the closed half-planes is a convex polygon. If K has an interior, its
 * vertices are among the pairwise intersections of the boundary lines, so collect those that satisfy
 * every closed half-plane; the average of them, with positive weights and at least three
 * non-collinear points, lies in the interior of K. If K is empty, a point or a segment, the average
 * lies on some boundary line and the strict test fails. Points are kept as exact fractions (X/W,
 * Y/W) of big integers because line intersections are rational.
 *
 * Reference: de Berg et al., "Computational Geometry", §4.2 (half-plane intersection is a convex
 * polygon whose vertices are line intersections).
 *
 * @returns false if the list is empty or any triangle has zero area
 */
export function trianglesShareInterior(triangles: readonly Triangle[]): boolean {
  const planes: HalfPlane[] = [];
  for (const t of triangles) {
    const h = triangleHalfPlanes(t);
    if (h === undefined) return false;
    planes.push(...h);
  }
  if (planes.length === 0) return false;
  const points: { X: bigint; Y: bigint; W: bigint }[] = [];
  for (let i = 0; i < planes.length; i++) {
    for (let j = i + 1; j < planes.length; j++) {
      const p = planes[i]!;
      const q = planes[j]!;
      const D = p.A * q.B - q.A * p.B;
      if (D === 0n) continue;
      let X = p.B * q.C - q.B * p.C;
      let Y = p.C * q.A - q.C * p.A;
      let W = D;
      if (W < 0n) {
        X = -X;
        Y = -Y;
        W = -W;
      }
      if (planes.every((h) => h.A * X + h.B * Y + h.C * W >= 0n)) points.push({ X, Y, W });
    }
  }
  if (points.length < 3) return false;
  const total = points.reduce((w, pt) => w * pt.W, 1n);
  let X = 0n;
  let Y = 0n;
  for (const pt of points) {
    X += pt.X * (total / pt.W);
    Y += pt.Y * (total / pt.W);
  }
  const W = total * BigInt(points.length);
  return planes.every((h) => h.A * X + h.B * Y + h.C * W > 0n);
}

/**
 * Does the open segment pq meet the interior of the triangle?
 *
 * With p(t) = p + t(q − p), each half-plane of the triangle gives a constraint α + βt > 0 where α
 * and β are its values at p and the change to q. The segment meets the open triangle iff some t in
 * (0, 1) satisfies all of them: the largest lower bound must be below the smallest upper bound.
 * Bounds are exact fractions compared by cross-multiplication.
 */
function openSegmentMeetsTriangle(p: Eisenstein, q: Eisenstein, t: Triangle): boolean {
  const planes = triangleHalfPlanes(t);
  if (planes === undefined) return false;
  const at = (h: HalfPlane, z: Eisenstein) => h.A * BigInt(z.a) + h.B * BigInt(z.b) + h.C;
  // t > 0 and t < 1 are the constraints (0, 1) and (1, −1).
  const constraints = [
    [0n, 1n],
    [1n, -1n],
    ...planes.map((h) => [at(h, p), at(h, q) - at(h, p)] as [bigint, bigint]),
  ] as [bigint, bigint][];
  let lower: [bigint, bigint] | undefined; // t > n/d with d > 0
  let upper: [bigint, bigint] | undefined; // t < n/d with d > 0
  for (const [alpha, beta] of constraints) {
    if (beta === 0n) {
      if (alpha <= 0n) return false;
    } else if (beta > 0n) {
      const bound: [bigint, bigint] = [-alpha, beta];
      if (lower === undefined || bound[0] * lower[1] > lower[0] * bound[1]) lower = bound;
    } else {
      const bound: [bigint, bigint] = [alpha, -beta];
      if (upper === undefined || bound[0] * upper[1] < upper[0] * bound[1]) upper = bound;
    }
  }
  if (lower === undefined || upper === undefined) return true;
  return lower[0] * upper[1] < upper[0] * lower[1];
}

/**
 * Does the open segment pq pass through the interior of a face, given its triangulation?
 *
 * True iff the segment meets the open interior of some triangle, or runs along a diagonal of the
 * triangulation. A diagonal is an edge shared by two triangles, so it lies in the open interior of
 * the face yet only on the boundary of each triangle, which the first test alone would miss. A
 * segment along the face's own boundary is not crossing it.
 */
export function segmentCrossesFace(
  p: Eisenstein,
  q: Eisenstein,
  triangles: readonly Triangle[],
): boolean {
  if (triangles.some((t) => openSegmentMeetsTriangle(p, q, t))) return true;
  const count = new Map<string, { u: Eisenstein; v: Eisenstein; n: number }>();
  for (const t of triangles) {
    for (let i = 0; i < 3; i++) {
      const u = t[i]!;
      const v = t[(i + 1) % 3]!;
      const key =
        u.a < v.a || (u.a === v.a && u.b < v.b)
          ? `${u.a},${u.b}|${v.a},${v.b}`
          : `${v.a},${v.b}|${u.a},${u.b}`;
      const seen = count.get(key);
      if (seen) seen.n++;
      else count.set(key, { u, v, n: 1 });
    }
  }
  for (const { u, v, n } of count.values()) {
    if (n >= 2 && segmentsOverlapCollinear(p, q, u, v)) return true;
  }
  return false;
}
