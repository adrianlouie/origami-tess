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
 * Lists the pairs of faces whose flat-folded interiors overlap.
 *
 * Each face is triangulated in the crease pattern, the triangles are moved by the face's folded
 * map (an isometry, so triangles stay triangles and exactness is kept), and two faces overlap iff
 * some pair of their triangles does. Faces that fold onto neighbours across a crease touch along
 * that crease but do not overlap, so adjacent faces appear only if they also share area elsewhere.
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
  if (transforms.length !== cp.faces.length) {
    throw new RangeError(`Expected ${cp.faces.length} transforms, got ${transforms.length}`);
  }
  const folded = cp.faces.map((face, f) =>
    triangulateFace(cp.vertices, face).map(
      (t) => t.map((p) => apply(transforms[f]!, p)) as unknown as Triangle,
    ),
  );
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
