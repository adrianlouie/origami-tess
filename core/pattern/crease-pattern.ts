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
import { compareAngle, cross, onSegment, orientation, windingNumber } from "../lattice/direction";
import type { Edge } from "../lattice/grid";

/**
 * Crease assignment, as in the FOLD format: mountain, valley, border, flat, unassigned.
 * Gadgets assign M/V themselves; the solver (Phase 4) fills in "U" for the rest.
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
 * {@link faceCount}). A face is its outer boundary walk. A connected component that sits inside a
 * bounded face is a hole of it: `holes[i]` lists the outer walks of the components nested directly
 * in `faces[i]` (clockwise, or degenerate for a tree), so every sector around every vertex belongs
 * to a walk in `faces` or `holes`, except sectors in the unbounded face. `rotation[i]` holds the
 * indices of the edges at vertex i in counter-clockwise order from the +x axis.
 */
export type CreasePattern = {
  readonly vertices: readonly Eisenstein[];
  readonly edges: readonly CreaseEdge[];
  readonly faces: readonly Face[];
  readonly holes: readonly (readonly Face[])[];
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
 * (negative) or a tree (zero). Such a walk is the outer boundary of a whole component: it is a
 * hole of the smallest bounded face of another component that contains it (exact winding number,
 * {@link windingNumber}), or part of the unbounded face if no face does. A vertex of one component
 * is never on the boundary of another component's face, because the graph is planar.
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
  const outerWalks: number[][] = [];
  for (let start = 0; start < 2 * es.length; start++) {
    if (visited.has(start)) continue;
    const walk: number[] = [];
    for (let h = start; !visited.has(h); h = next(h)) {
      visited.add(h);
      walk.push(origin(h));
    }
    if (faceDoubledArea(vertices, walk) > 0) faces.push(Object.freeze(walk));
    else outerWalks.push(walk);
  }
  const holes = assignHoles(vertices, es, faces, outerWalks);

  const rotation = outgoing.map((list) => Object.freeze(list.map((h) => h >> 1)));
  return Object.freeze({
    vertices: Object.freeze([...vertices]),
    edges: Object.freeze(es),
    faces: Object.freeze(faces),
    holes: Object.freeze(holes),
    rotation: Object.freeze(rotation),
  });
}

/**
 * Gives each component's outer walk to the smallest bounded face, of another component, that
 * contains it.
 *
 * Faces nest strictly, so among the faces containing a point the one with the least doubled area is
 * the innermost. Faces of the walk's own component are skipped: the walk's vertices lie on their
 * boundaries, where a winding number is undefined.
 *
 * @returns `holes[i]` for each entry of `faces`; walks inside no face are dropped
 */
function assignHoles(
  vertices: readonly Eisenstein[],
  es: readonly CreaseEdge[],
  faces: readonly Face[],
  outerWalks: readonly (readonly number[])[],
): Face[][] {
  const holes: Face[][] = faces.map(() => []);
  if (faces.length === 0) return holes;
  const parent = vertices.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (const e of es) parent[find(e.v0)] = find(e.v1);
  const polygons = faces.map((f) => f.map((v) => at(vertices, v)));
  const areas = faces.map((f) => faceDoubledArea(vertices, f));
  const roots = faces.map((f) => find(at(f, 0)));
  for (const walk of outerWalks) {
    const probe = at(walk, 0);
    const own = find(probe);
    let best = -1;
    faces.forEach((_, i) => {
      if (roots[i] === own) return;
      if (best !== -1 && at(areas, i) >= at(areas, best)) return;
      if (windingNumber(at(polygons, i), at(vertices, probe)) !== 0) best = i;
    });
    if (best !== -1) at(holes, best).push(Object.freeze([...walk]));
  }
  return holes.map((h) => Object.freeze(h) as Face[]);
}

/**
 * Builds a crease pattern from lattice points and segments, such as a grid or a tiling.
 *
 * Repeated positions are merged, segment endpoints missing from `points` are added, and an
 * undirected segment listed twice becomes one crease. This is the interface from Phases 1 and 2
 * and from the gadgets, which assign M/V per segment.
 *
 * @param points - vertices to include even if no segment touches them
 * @param segments - undirected segments between lattice points; a segment's own `assignment`
 *   overrides the default
 * @param assignment - default assignment for segments that carry none
 * @throws RangeError as {@link creasePattern} does, and when one segment is listed twice with
 *   different assignments (silently keeping one would hide a bug in the caller)
 */
export function fromSegments(
  points: readonly Eisenstein[],
  segments: readonly (Edge & { readonly assignment?: Assignment })[],
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
  const seen = new Map<string, Assignment>();
  const edges: { v0: number; v1: number; assignment: Assignment }[] = [];
  for (const s of segments) {
    const v0 = indexOf(s.from);
    const v1 = indexOf(s.to);
    const k = `${Math.min(v0, v1)}|${Math.max(v0, v1)}`;
    const a = s.assignment ?? assignment;
    const previous = seen.get(k);
    if (v0 !== v1 && previous !== undefined) {
      if (previous !== a) throw new RangeError(`Segment ${k} listed as both ${previous} and ${a}`);
      continue;
    }
    seen.set(k, a);
    edges.push({ v0, v1, assignment: a });
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

/**
 * Counts the excess degrees of freedom of a facial plane graph, a necessary test for a reciprocal
 * figure to exist before any is built.
 *
 * Formula (Lang, *Twists, Tilings, and Tessellations*, §6.4.1, Eqs. 6.22–6.29): with F the number
 * of bounded faces, E the number of edges and E_b the number of border edges (those with paper on
 * one side only), a reciprocal figure has 2F unknowns (one point per face), one linear condition
 * per interior edge (E − E_b of them) and three degrees of freedom (a translation and a uniform
 * scale) that change nothing, so the excess is
 * 2F − (E − E_b) − 3 = 2F − E + E_b − 3.
 * By Euler's formula for a connected pattern this equals F + E_b − V − 2, the book's condition
 * F + E_b − V ≥ 2 rearranged. It is sufficient only for generic embeddings: a symmetric one can
 * have a reciprocal figure despite a negative excess (Lang, Fig. 6.13).
 *
 * A side of an edge is paper when it lies on a bounded face walk or a hole walk; the sides of a
 * component nested inside a face face that face, so such an edge is not on the border.
 *
 * @returns an integer; negative means no generic embedding has a reciprocal figure
 */
export function maxwellExcess(cp: CreasePattern): number {
  const paper = new Set<string>();
  for (const walk of [...cp.faces, ...cp.holes.flat()]) {
    walk.forEach((v, i) => paper.add(`${v},${walk[(i + 1) % walk.length]}`));
  }
  let border = 0;
  for (const e of cp.edges) {
    if (paper.has(`${e.v0},${e.v1}`) !== paper.has(`${e.v1},${e.v0}`)) border++;
  }
  return 2 * cp.faces.length - cp.edges.length + border - 3;
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
