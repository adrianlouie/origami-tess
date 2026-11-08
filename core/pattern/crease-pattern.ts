/**
 * Crease pattern (CP) graph: vertices, edges with an M/V slot, and faces.
 *
 * Sits at the "pattern" stage of the data flow (lattice → symmetry/gadgets → pattern → validate →
 * solve → simulate/render). Gadgets and tilings emit bare segments; this module turns them into a
 * planar graph with exact topology, so the validators (Kawasaki, Maekawa) can read the
 * counter-clockwise edge order at each vertex and the layer solver can read the faces. Vertex
 * positions are Eisenstein integers and every geometric decision is an exact integer predicate
 * from `lattice/direction.ts`.
 *
 * The graph is immutable: every field is frozen at construction.
 *
 * Reference: de Berg et al., "Computational Geometry", §2.2 (doubly connected edge list);
 * Demaine & O'Rourke, "Geometric Folding Algorithms", ch. 12; FOLD format spec (edge assignments).
 */

import { checkedAdd, sub, type Eisenstein } from "../lattice/eisenstein";
import { compareAngle, cross, onSegment, orientation } from "../lattice/direction";
import type { Edge } from "../lattice/grid";

/**
 * Crease assignment, as in the FOLD format: mountain, valley, border, flat, unassigned.
 * The solver (Phase 4) replaces "U"; until then every crease is unassigned.
 */
export type Assignment = "M" | "V" | "B" | "F" | "U";

/** An undirected crease between vertex indices `v0` and `v1`. */
export type CreaseEdge = {
  readonly v0: number;
  readonly v1: number;
  readonly assignment: Assignment;
};

/** A bounded face as the vertex indices of its boundary walk, counter-clockwise. */
export type Face = readonly number[];

/**
 * A planar crease graph.
 *
 * `faces` lists the bounded faces only; the single unbounded face is implicit (see
 * {@link faceCount}). A face is its outer boundary walk, so a component sitting inside a face is
 * not listed as a hole of it. `rotation[i]` holds the indices of the edges at vertex i in
 * counter-clockwise order from the +x axis.
 */
export type CreasePattern = {
  readonly vertices: readonly Eisenstein[];
  readonly edges: readonly CreaseEdge[];
  readonly faces: readonly Face[];
  readonly rotation: readonly (readonly number[])[];
};

/** Indexes an array whose bounds the caller has already established (strict index checks off). */
function at<T>(xs: readonly T[], i: number): T {
  const x = xs[i];
  if (x === undefined) throw new RangeError(`Index ${i} out of range`);
  return x;
}

const key = (z: Eisenstein) => `${z.a},${z.b}`;

/**
 * Builds a crease pattern from vertices and edges, computing rotations and faces.
 *
 * Faces come from half-edge traversal: with each vertex's edges sorted counter-clockwise, the
 * successor of the half-edge u→v is the half-edge that precedes v→u in counter-clockwise order
 * around v, which keeps the face on the left (de Berg et al., §2.2). A walk with positive
 * shoelace area is a bounded face; walks with area ≤ 0 are the outer boundary of a component
 * (negative) or a tree (zero), and all belong to the unbounded face.
 *
 * Planarity is checked, not repaired, using exact orientation tests.
 *
 * @param vertices - distinct lattice points
 * @param edges - creases by vertex index; `assignment` defaults to "U"
 * @throws RangeError on duplicate positions, bad indices, self-loops, duplicate edges, two edges
 *   that cross, a vertex inside an edge, or coordinates too large for exact arithmetic
 */
export function creasePattern(
  vertices: readonly Eisenstein[],
  edges: readonly { readonly v0: number; readonly v1: number; readonly assignment?: Assignment }[],
): CreasePattern {
  validate(vertices, edges);
  const es: CreaseEdge[] = edges.map((e) =>
    Object.freeze({ v0: e.v0, v1: e.v1, assignment: e.assignment ?? "U" }),
  );

  // Half-edge h = 2e is v0→v1 and h = 2e + 1 is v1→v0, so the twin of h is h ^ 1.
  const origin = (h: number) => (h & 1 ? at(es, h >> 1).v1 : at(es, h >> 1).v0);
  const dest = (h: number) => origin(h ^ 1);

  const outgoing: number[][] = vertices.map(() => []);
  es.forEach((_, e) => {
    at(outgoing, at(es, e).v0).push(2 * e);
    at(outgoing, at(es, e).v1).push(2 * e + 1);
  });
  const direction = (h: number) => sub(at(vertices, dest(h)), at(vertices, origin(h)));
  for (const list of outgoing) list.sort((x, y) => compareAngle(direction(x), direction(y)));
  const position = new Map<number, number>();
  for (const list of outgoing) list.forEach((h, i) => position.set(h, i));

  const next = (h: number): number => {
    const list = at(outgoing, dest(h));
    const here = position.get(h ^ 1);
    if (here === undefined) throw new RangeError(`Half-edge ${h} has no twin position`);
    return at(list, (here - 1 + list.length) % list.length);
  };

  const visited = new Set<number>();
  const faces: Face[] = [];
  for (let start = 0; start < 2 * es.length; start++) {
    if (visited.has(start)) continue;
    const walk: number[] = [];
    for (let h = start; !visited.has(h); h = next(h)) {
      visited.add(h);
      walk.push(origin(h));
    }
    if (faceDoubledArea(vertices, walk) > 0) faces.push(Object.freeze(walk));
  }

  const rotation = outgoing.map((list) => Object.freeze(list.map((h) => h >> 1)));
  return Object.freeze({
    vertices: Object.freeze([...vertices]),
    edges: Object.freeze(es),
    faces: Object.freeze(faces),
    rotation: Object.freeze(rotation),
  });
}

/**
 * Builds a crease pattern from lattice points and segments, such as a grid or a tiling.
 *
 * Repeated positions are merged, segment endpoints missing from `points` are added, and an
 * undirected segment listed twice becomes one crease. This is the interface from Phases 1 and 2.
 *
 * @param points - vertices to include even if no segment touches them
 * @param segments - undirected segments between lattice points
 * @param assignment - assignment given to every crease
 * @throws RangeError as {@link creasePattern} does
 */
export function fromSegments(
  points: readonly Eisenstein[],
  segments: readonly Edge[],
  assignment: Assignment = "U",
): CreasePattern {
  const index = new Map<string, number>();
  const vertices: Eisenstein[] = [];
  const indexOf = (z: Eisenstein): number => {
    let i = index.get(key(z));
    if (i === undefined) {
      i = vertices.length;
      index.set(key(z), i);
      vertices.push(z);
    }
    return i;
  };
  for (const p of points) indexOf(p);
  const seen = new Set<string>();
  const edges: { v0: number; v1: number; assignment: Assignment }[] = [];
  for (const s of segments) {
    const v0 = indexOf(s.from);
    const v1 = indexOf(s.to);
    const k = `${Math.min(v0, v1)}|${Math.max(v0, v1)}`;
    if (v0 !== v1 && seen.has(k)) continue;
    seen.add(k);
    edges.push({ v0, v1, assignment });
  }
  return creasePattern(vertices, edges);
}

/**
 * Returns twice the signed area of the polygon through `face`'s vertices, in lattice units.
 *
 * Formula: the shoelace sum Σ cross(p_i, p_{i+1}) in (a, b) coordinates. The map from (a, b) to
 * the plane scales area by √3/2, a positive constant, so the sign is exact and a unit lattice
 * triangle has value 1. Positive means counter-clockwise.
 */
export function faceDoubledArea(vertices: readonly Eisenstein[], face: Face): number {
  let sum = 0;
  for (let i = 0; i < face.length; i++) {
    sum = checkedAdd(
      sum,
      cross(at(vertices, at(face, i)), at(vertices, at(face, (i + 1) % face.length))),
    );
  }
  return sum;
}

/**
 * Returns F, the number of faces including the single unbounded one.
 *
 * With this convention Euler's formula for a planar graph reads V − E + F = 1 + C (Euler 1758;
 * Diestel, "Graph Theory", Thm 4.2.9).
 */
export function faceCount(cp: CreasePattern): number {
  return cp.faces.length + 1;
}

/** Returns C, the number of connected components, by union-find; isolated vertices count. */
export function componentCount(cp: CreasePattern): number {
  const parent = cp.vertices.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  let count = cp.vertices.length;
  for (const e of cp.edges) {
    const a = find(e.v0);
    const b = find(e.v1);
    if (a !== b) {
      parent[a] = b;
      count--;
    }
  }
  return count;
}

/** Throws RangeError unless the input is a simple straight-line planar graph. */
function validate(
  vertices: readonly Eisenstein[],
  edges: readonly { readonly v0: number; readonly v1: number }[],
): void {
  const positions = new Set<string>();
  for (const z of vertices) {
    if (positions.has(key(z))) throw new RangeError(`Duplicate vertex position ${key(z)}`);
    positions.add(key(z));
  }
  const pairs = new Set<string>();
  for (const e of edges) {
    for (const i of [e.v0, e.v1]) {
      if (!Number.isInteger(i) || i < 0 || i >= vertices.length) {
        throw new RangeError(`Edge refers to missing vertex ${i}`);
      }
    }
    if (e.v0 === e.v1) throw new RangeError(`Self-loop at vertex ${e.v0}`);
    const k = `${Math.min(e.v0, e.v1)}|${Math.max(e.v0, e.v1)}`;
    if (pairs.has(k)) throw new RangeError(`Duplicate edge ${k}`);
    pairs.add(k);
  }
  // A vertex strictly inside an edge would split it; this also catches collinear overlaps, since
  // two overlapping collinear edges always put an endpoint inside the other.
  for (const e of edges) {
    const p = vertices[e.v0]!;
    const q = vertices[e.v1]!;
    vertices.forEach((r, i) => {
      if (i !== e.v0 && i !== e.v1 && onSegment(p, q, r)) {
        throw new RangeError(`Vertex ${i} lies inside edge ${e.v0}-${e.v1}`);
      }
    });
  }
  // With touching cases excluded above, edges cross only if each separates the other's ends.
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b, c, d] = [edges[i]!.v0, edges[i]!.v1, edges[j]!.v0, edges[j]!.v1];
      if (a === c || a === d || b === c || b === d) continue;
      const [p, q, r, s] = [vertices[a]!, vertices[b]!, vertices[c]!, vertices[d]!];
      if (
        orientation(p, q, r) * orientation(p, q, s) < 0 &&
        orientation(r, s, p) * orientation(r, s, q) < 0
      ) {
        throw new RangeError(`Edges ${a}-${b} and ${c}-${d} cross`);
      }
    }
  }
}
