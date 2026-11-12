/**
 * Residuals of a settled bar-and-hinge state: how far it is from a true (isometric) fold.
 *
 * Sits in the physical stage of the data flow (… → solve → simulate), after `relax.ts`. `relax`
 * reports that a state is settled, not that it is a good fold: the panels may have stretched or
 * flexed. These functions measure that from the node positions alone, so they do not trust a spring
 * and do not depend on the stiffness that produced the state. A true fold of uncut paper keeps
 * every panel flat and every length, so each residual is 0 for it and shrinks to 0 as the panels
 * are made stiffer. Positions are a flat `Float64Array` (x, y, z per node), as everywhere in this
 * stage; angles are in radians.
 *
 * Reference: Lang, *Twists, Tilings, and Tessellations* (CRC Press, 2018): the developability
 * condition at a vertex (Eq. 1.43; Eq. 9.75), the consistency matrix (§9.4.2, Eqs. 9.57 to
 * 9.62), and the Gauss map of facet normals (§8.5).
 */

import { cornerAngleGradient } from "./angle";
import { foldAngle } from "./dihedral";
import type { TriangleIndices } from "./mesh";
import type { BarHingeModel } from "./model";

type Matrix = readonly (readonly number[])[];

const rotateX = (a: number): Matrix => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];

const rotateZ = (a: number): Matrix => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];

const multiply = (p: Matrix, q: Matrix): Matrix =>
  p.map((row) => [0, 1, 2].map((c) => row.reduce((sum, v, k) => sum + v * q[k]![c]!, 0)));

/**
 * Returns how far a vertex is from closing: the Frobenius norm ‖C − I‖ of C = Π Rₓ(γᵢ)·R_z(αᵢ).
 *
 * Formula (Lang §9.4.2, Eqs. 9.57 to 9.62; the spherical-linkage closure of Huffman 1976): walk
 * counter-clockwise round the vertex. Crease i turns the next panel about the crease direction (the
 * local x axis) by its fold angle γᵢ, positive for a valley, and sector i then turns the frame in
 * the panel's plane (about z) by its angle αᵢ to crease i + 1. The paper closes up exactly when the
 * whole product is the identity. The αᵢ must be the flat sector angles of the sheet. With the
 * angles measured in the folded state the product is the identity for any real vertex, whether or
 * not the paper stretched, and says nothing.
 *
 * The residual is the same for a state and its mirror image (all γᵢ negated, which conjugates C by
 * diag(1, 1, −1)), so it tells a wrong crease from a right one but not a fold from its reflection.
 *
 * @param sectors - the flat sector angles αᵢ, sector i lying between crease i and crease i + 1
 * @param folds - the fold angles γᵢ of the creases, in the same order
 * @returns ‖C − I‖_F, 0 for a vertex that closes
 * @throws RangeError if the two lists differ in length
 */
export function closureResidual(sectors: readonly number[], folds: readonly number[]): number {
  if (sectors.length !== folds.length) throw new RangeError("one sector per crease is needed");
  let c: Matrix = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  folds.forEach((gamma, i) => {
    c = multiply(multiply(c, rotateX(gamma)), rotateZ(sectors[i]!));
  });
  let sum = 0;
  c.forEach((row, r) =>
    row.forEach((v, k) => {
      sum += (v - (r === k ? 1 : 0)) ** 2;
    }),
  );
  return Math.sqrt(sum);
}

/**
 * The nodes round vertex `v` in counter-clockwise order, or null when v is not surrounded by
 * triangles (it is on the edge of the sheet, or in no triangle).
 *
 * A counter-clockwise triangle (v, p, q) has its sector at v from the ray to p to the ray to q, so
 * p → q chains the triangles into a ring. The ring is closed when it returns to its start having
 * used every triangle at v once.
 */
function fanAt(triangles: readonly TriangleIndices[], v: number): number[] | null {
  const next = new Map<number, number>();
  for (const t of triangles) {
    const i = t.indexOf(v);
    if (i < 0) continue;
    const p = t[(i + 1) % 3]!;
    if (next.has(p)) return null;
    next.set(p, t[(i + 2) % 3]!);
  }
  if (next.size === 0) return null;
  const start = next.keys().next().value!;
  const ring = [start];
  let at = next.get(start)!;
  while (at !== start) {
    if (!next.has(at) || ring.length > next.size) return null;
    ring.push(at);
    at = next.get(at)!;
  }
  return ring.length === next.size ? ring : null;
}

/**
 * Returns the nodes that triangles surround completely, in increasing order.
 *
 * These are the vertices where the developability and consistency conditions apply: a node on the
 * edge of the sheet has no full turn. For the patterns of this project they are the interior
 * vertices of the crease pattern (the tests check it), but the mesh is all the model knows.
 */
export function interiorMeshVertices(model: BarHingeModel): number[] {
  const out: number[] = [];
  for (let v = 0; v < model.rest.length / 3; v++) {
    if (fanAt(model.triangles, v) !== null) out.push(v);
  }
  return out;
}

/** The ring of nodes round an interior vertex, or a RangeError naming the vertex. */
function ringOrThrow(model: BarHingeModel, v: number): number[] {
  const ring = fanAt(model.triangles, v);
  if (ring === null) throw new RangeError(`vertex ${v} is not surrounded by triangles`);
  return ring;
}

/**
 * Returns the angle defect 2π − Σ θᵢ at an interior vertex, θᵢ the angles of the triangles there
 * in the folded state.
 *
 * Formula (Lang Eq. 1.43, and Eq. 9.75): the angles round a vertex of a developable surface
 * sum to 2π, the paper having neither stretched nor been cut, so the defect is the discrete
 * Gaussian curvature and is 0 for a true fold. It is positive where the paper has been gathered
 * into a cone and negative at a saddle. Unlike bar strain it sees shear and flex of a panel, and it
 * does not depend on the bars' stiffness.
 *
 * @param model - the model the state belongs to
 * @param x - node positions, x, y, z per node
 * @param v - an interior vertex (see {@link interiorMeshVertices})
 * @throws RangeError if v is not surrounded by triangles
 */
export function angleDefect(model: BarHingeModel, x: Float64Array, v: number): number {
  const ring = ringOrThrow(model, v);
  const scratch = new Float64Array(9);
  let sum = 0;
  ring.forEach((p, i) => {
    sum += cornerAngleGradient(x, { a: p, b: v, c: ring[(i + 1) % ring.length]! }, scratch);
  });
  return 2 * Math.PI - sum;
}

/**
 * Returns the consistency residual ‖C − I‖ at an interior vertex: {@link closureResidual} of the
 * flat sector angles and the fold angles measured in the folded state.
 *
 * Every edge of the triangle fan at v is a hinge, a diagonal of the triangulation included (its
 * fold is near 0, and the flat sectors on either side of it add up to the sector of the panel). The
 * flat angles are those of the model's rest state, which are the paper's own. It is 0 for a fold
 * that is an isometry of the paper, and independent of bar strain and of the 6.2a closure test,
 * which reads only the four creases of one fixture. It works at any degree.
 *
 * @param model - the model the state belongs to
 * @param x - node positions, x, y, z per node
 * @param v - an interior vertex (see {@link interiorMeshVertices})
 * @throws RangeError if v is not surrounded by triangles
 */
export function consistencyResidual(model: BarHingeModel, x: Float64Array, v: number): number {
  const ring = ringOrThrow(model, v);
  const edgeKey = (a: number, b: number) => `${Math.min(a, b)}|${Math.max(a, b)}`;
  const hinges = new Map(model.hinges.map((h) => [edgeKey(h.j, h.k), h]));
  const rest = new Map<string, number>();
  for (const c of model.corners) {
    if (c.b === v) rest.set(edgeKey(c.a, c.c), c.rest);
  }
  const folds = ring.map((p) => {
    const hinge = hinges.get(edgeKey(v, p));
    if (!hinge) throw new RangeError(`edge ${v}-${p} has no hinge`);
    return foldAngle(x, hinge);
  });
  const sectors = ring.map((p, i) => {
    const angle = rest.get(edgeKey(p, ring[(i + 1) % ring.length]!));
    if (angle === undefined) throw new RangeError(`corner ${p}-${v} has no rest angle`);
    return angle;
  });
  return closureResidual(sectors, folds);
}

/**
 * Returns the unit normal of every triangle, three numbers each, in the order of `triangles`.
 *
 * Formula: n = (b − a) × (c − a) / |(b − a) × (c − a)| for a counter-clockwise triangle (a, b, c),
 * which is +z for the flat sheet. These are the points of the Gauss map (Lang §8.5): a folded
 * pattern's facets map to points on the unit sphere, and the structure of that image (one great
 * circle for a cylindrical fold, a few points for a Miura-ori) is exact. A collapsed triangle,
 * with no normal, gives the zero vector.
 *
 * @param x - node positions, x, y, z per node
 * @param triangles - counter-clockwise triangles of node indices
 */
export function faceNormals(x: Float64Array, triangles: readonly TriangleIndices[]): Float64Array {
  const out = new Float64Array(3 * triangles.length);
  triangles.forEach(([a, b, c], i) => {
    const u = [0, 1, 2].map((d) => x[3 * b + d]! - x[3 * a + d]!);
    const w = [0, 1, 2].map((d) => x[3 * c + d]! - x[3 * a + d]!);
    const n = [
      u[1]! * w[2]! - u[2]! * w[1]!,
      u[2]! * w[0]! - u[0]! * w[2]!,
      u[0]! * w[1]! - u[1]! * w[0]!,
    ];
    const length = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (length > 0) for (let d = 0; d < 3; d++) out[3 * i + d] = n[d]! / length;
  });
  return out;
}

/** Returns the largest |L/L₀ − 1| over all bars: the axial strain of the worst bar. */
export function maxStrain(model: BarHingeModel, x: Float64Array): number {
  let worst = 0;
  for (const b of model.bars) {
    const length = Math.hypot(
      x[3 * b.a]! - x[3 * b.b]!,
      x[3 * b.a + 1]! - x[3 * b.b + 1]!,
      x[3 * b.a + 2]! - x[3 * b.b + 2]!,
    );
    worst = Math.max(worst, Math.abs(length / b.rest - 1));
  }
  return worst;
}

/** The worst case of each residual over a settled state. */
export type SettledResiduals = {
  /** Largest axial strain of a bar. */
  readonly maxStrain: number;
  /** Largest |{@link angleDefect}| over the interior vertices, radians. */
  readonly maxDefect: number;
  /** Largest {@link consistencyResidual} over the interior vertices. */
  readonly maxConsistency: number;
  /**
   * Largest fold angle of a hinge inside a panel (a diagonal of the triangulation), radians: how
   * far the worst panel has bent. It is also the angle between the normals of two triangles of one
   * panel. A rigid panel has none.
   */
  readonly maxPanelFlex: number;
};

/**
 * Measures how far a state is from a true fold of the paper.
 *
 * Reported next to the bar strain (4.5% at triangle twist (6, 2)), because the strain alone cannot
 * see a panel that has sheared or bent without stretching a bar.
 *
 * @param model - the model the state belongs to
 * @param x - node positions, x, y, z per node
 * @returns the four worst-case residuals; the vertex ones are 0 when no vertex is interior
 */
export function settledResiduals(model: BarHingeModel, x: Float64Array): SettledResiduals {
  let maxDefect = 0;
  let maxConsistency = 0;
  for (const v of interiorMeshVertices(model)) {
    maxDefect = Math.max(maxDefect, Math.abs(angleDefect(model, x, v)));
    maxConsistency = Math.max(maxConsistency, consistencyResidual(model, x, v));
  }
  let maxPanelFlex = 0;
  for (const h of model.hinges) {
    if (h.edge < 0) maxPanelFlex = Math.max(maxPanelFlex, Math.abs(foldAngle(x, h)));
  }
  return { maxStrain: maxStrain(model, x), maxDefect, maxConsistency, maxPanelFlex };
}
