/**
 * The bar-and-hinge model of a crease pattern.
 *
 * Sits in the physical stage of the data flow (… → solve → simulate): it turns the exact crease
 * graph into the springs that `relax.ts` moves. Two models of a fold meet in this project (Lang,
 * *Twists, Tilings, and Tessellations*, Table 1.1, p. 4): flat-foldable origami (Phases 3 to 5),
 * where the paper ends flat and every fold angle is ±π, and polyhedral origami (this stage), where
 * the facets stay flat and the fold angles vary from 0 to ±π. A pattern can be flat-foldable and
 * still unreachable by a rigid motion between the two. Whether it is depends on the polygon and the
 * assignment: no triangle twist is rigidly foldable (Lang §7.6.1, Eq. 7.81), a square twist is only
 * for some assignments (M²V² and M³V, not the cyclic M⁴ or the alternating (MV)²), and the hexagon
 * and star twists are undecided here. So the panels must be allowed to stretch and bend a little; a
 * bar-and-hinge model does that with axial springs (bars) along every triangle edge and rotational
 * springs (hinges) across every interior edge. Everything here is a float, because the model is
 * past the exact-lattice stage; positions come from `toCartesian` and the one tolerance is
 * `RENDER_TOLERANCE`.
 *
 * Each triangle corner also carries an angle spring (see `angle.ts`), which stops a flat obtuse
 * triangle from collapsing or turning inside out.
 *
 * Reference: Schenk and Guest, "Origami folding: a structural engineering approach" (2011);
 * Filipov, Tachi and Paulino, "Origami tubes assembled into stiff, yet reconfigurable structures"
 * (2015), §2 for the bar-and-hinge idealisation; Ghassaei et al., "Fast, interactive origami
 * simulation using GPU computation" (2018), §3 for the stiffness scaling and default values.
 */

import type { CreasePattern } from "../pattern/crease-pattern";
import { cornerAngleGradient, type Corner } from "./angle";
import { foldAngleGradient, type Hinge } from "./dihedral";
import { toCartesian } from "./embed";
import { triangulateFaceKeepingVertices, type TriangleIndices } from "./mesh";

/**
 * Stiffness and damping of the model. Dimensionless; lengths are in lattice units.
 *
 * The bar stiffness of an edge of rest length L is `axial / L` (EA/L with EA = `axial`). A crease
 * hinge has stiffness `crease · L` and a facet hinge `facet · L`, where L is the length of the
 * shared edge, so a long crease cut into unit segments has the same total stiffness as one hinge.
 */
export type BarHingeParams = {
  /** Axial rigidity EA of every bar. */
  readonly axial: number;
  /** Rotational stiffness per unit length of an M or V crease. */
  readonly crease: number;
  /** Rotational stiffness per unit length of a facet hinge (a diagonal, or an F or U crease). */
  readonly facet: number;
  /** Stiffness of each triangle corner angle, energy per rad². */
  readonly angle: number;
  /**
   * Damping ratio ζ against the soft (hinge) modes. The coefficient is c = 2ζ·√(k_soft·m), with
   * k_soft the smaller of `crease` and `facet`; see {@link BarHingeModel.damping}.
   */
  readonly damping: number;
};

/**
 * Origami Simulator's defaults, `axialStiffness` 20, `creaseStiffness` 0.7, `faceStiffness` 0.2 and
 * `percentDamping` 0.45 (`js/globals.js` in github.com/amandaghassaei/OrigamiSimulator; checked in
 * the 6.3 audit), plus our own corner angle spring, which the original does not have.
 */
export const DEFAULT_PARAMS: BarHingeParams = {
  axial: 20,
  crease: 0.7,
  facet: 0.2,
  angle: 20,
  damping: 0.45,
};

/** An axial spring between two nodes. */
export type Bar = {
  readonly a: number;
  readonly b: number;
  /** Rest length. */
  readonly rest: number;
  /** Spring constant EA/L. */
  readonly k: number;
};

/** A rotational spring. `sign` is +1 for a valley, −1 for a mountain and 0 for a facet. */
export type HingeSpring = Hinge & {
  /** Rotational spring constant (`k` is already the second axis node of {@link Hinge}). */
  readonly stiffness: number;
  readonly sign: -1 | 0 | 1;
  /** Index of the crease-pattern edge, or −1 for a diagonal of the triangulation. */
  readonly edge: number;
};

/** An angle spring on a triangle corner, with the angle it has in the flat rest state. */
export type CornerSpring = Corner & { readonly stiffness: number; readonly rest: number };

/** Everything `relax` needs. Built once per pattern and never changed. */
export type BarHingeModel = {
  /** Flat rest positions, x, y, z per node, z = 0; node i is crease-pattern vertex i. */
  readonly rest: Float64Array;
  readonly triangles: readonly TriangleIndices[];
  readonly bars: readonly Bar[];
  readonly hinges: readonly HingeSpring[];
  readonly corners: readonly CornerSpring[];
  /** Nodes held at their rest position, which removes the six rigid-body motions. */
  readonly pinned: readonly number[];
  /** Stiffness seen by each node, Σ bar k + Σ hinge and corner k·|∂/∂x|² at rest; sets dt. */
  readonly nodeStiffness: Float64Array;
  /**
   * Time step, 1 / (2π·ω_max) with ω_max = √(max nodeStiffness / mass). Origami Simulator uses the
   * same form, 0.9 / (2π·f_max) with f_max its largest beam natural frequency (`calcDt` in
   * `dynamicSolver.js`); we drop the 0.9 because dt is already about 0.16/ω_max, an order of
   * magnitude inside the stability limit dt < 2/ω of symplectic Euler. `nodeStiffness` estimates
   * ω_max² rather than bounding it, so stability is checked by the tests (every gadget settles at
   * every fold) and `relax` throws if the state ever diverges.
   */
  readonly dt: number;
  /**
   * Viscous coefficient c, the same for every node: c = 2ζ·√(k_soft·m). Critical damping of the
   * stiffest mode (2ζ·√(K_n·m), the first choice) overdamps the soft hinge modes by the ratio of
   * the stiffnesses, and relaxation then takes hundreds of thousands of steps; the stiff modes
   * still decay at rate c/2m.
   */
  readonly damping: number;
  readonly params: BarHingeParams;
};

/** Unit mass per node. The relaxation is a way to reach equilibrium, not a clock, so the mass only scales dt. */
const MASS = 1;

/**
 * Builds the bar-and-hinge model of a crease pattern lying flat.
 *
 * Every face is triangulated with every boundary vertex kept ({@link triangulateFaceKeepingVertices}).
 * Each triangle edge is a bar. Each edge shared by two triangles is a hinge: a crease hinge when it
 * is an M or V edge of the pattern (target angle ±fold·π), and a facet hinge (target 0) when it is a
 * diagonal or an F, U or B edge. The pinned nodes are the corners of the triangle nearest the
 * centre of the bounding box.
 *
 * @param cp - the crease pattern
 * @param params - stiffness and damping; defaults to {@link DEFAULT_PARAMS}
 * @returns the model
 * @throws RangeError if a face has a hole, the pattern has no face, or a parameter is not positive
 */
export function barHingeModel(
  cp: CreasePattern,
  params: BarHingeParams = DEFAULT_PARAMS,
): BarHingeModel {
  for (const [name, v] of Object.entries(params)) {
    if (!(v > 0) || !Number.isFinite(v)) throw new RangeError(`parameter ${name} must be positive`);
  }
  if (cp.holes.some((h) => h.length > 0)) {
    throw new RangeError("faces with holes are not supported by the simulation");
  }
  if (cp.faces.length === 0) throw new RangeError("the pattern has no face to simulate");

  const n = cp.vertices.length;
  const rest = new Float64Array(3 * n);
  cp.vertices.forEach((z, i) => {
    const p = toCartesian(z);
    rest[3 * i] = p.x;
    rest[3 * i + 1] = p.y;
  });
  const dist = (a: number, b: number) =>
    Math.hypot(rest[3 * a]! - rest[3 * b]!, rest[3 * a + 1]! - rest[3 * b + 1]!);

  const triangles = cp.faces.flatMap((face) => triangulateFaceKeepingVertices(cp.vertices, face));

  const edgeOf = new Map<string, number>();
  cp.edges.forEach((e, i) => edgeOf.set(`${Math.min(e.v0, e.v1)}|${Math.max(e.v0, e.v1)}`, i));

  // Directed triangle edges u → v, each with the node opposite it. A counter-clockwise triangle
  // keeps its third node on the left of every directed edge, which is what `Hinge` asks for.
  const opposite = new Map<string, number>();
  const bars: Bar[] = [];
  const seenBar = new Set<string>();
  for (const [a, b, c] of triangles) {
    for (const [u, v, w] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      opposite.set(`${u}|${v}`, w);
      const key = `${Math.min(u, v)}|${Math.max(u, v)}`;
      if (seenBar.has(key)) continue;
      seenBar.add(key);
      const rest0 = dist(u, v);
      bars.push({ a: Math.min(u, v), b: Math.max(u, v), rest: rest0, k: params.axial / rest0 });
    }
  }

  const hinges: HingeSpring[] = [];
  for (const [key, i] of opposite) {
    const [j, k] = key.split("|").map(Number) as [number, number];
    const l = opposite.get(`${k}|${j}`);
    if (l === undefined || j > k) continue;
    const edge = edgeOf.get(`${j}|${k}`) ?? -1;
    const assignment = edge >= 0 ? cp.edges[edge]!.assignment : undefined;
    const sign = assignment === "V" ? 1 : assignment === "M" ? -1 : 0;
    const length = dist(j, k);
    hinges.push({
      i,
      j,
      k,
      l,
      sign,
      edge,
      stiffness: (sign === 0 ? params.facet : params.crease) * length,
    });
  }

  const corners: CornerSpring[] = [];
  const angleOf = new Float64Array(9);
  for (const [a, b, c] of triangles) {
    for (const [p, q, r] of [
      [a, b, c],
      [b, c, a],
      [c, a, b],
    ] as const) {
      const corner = { a: p, b: q, c: r };
      corners.push({
        ...corner,
        stiffness: params.angle,
        rest: cornerAngleGradient(rest, corner, angleOf),
      });
    }
  }

  const nodeStiffness = new Float64Array(n);
  for (const bar of bars) {
    nodeStiffness[bar.a]! += bar.k;
    nodeStiffness[bar.b]! += bar.k;
  }
  const g = new Float64Array(12);
  for (const h of hinges) {
    foldAngleGradient(rest, h, g);
    [h.i, h.j, h.k, h.l].forEach((node, slot) => {
      const s = g[3 * slot]! ** 2 + g[3 * slot + 1]! ** 2 + g[3 * slot + 2]! ** 2;
      nodeStiffness[node]! += h.stiffness * s;
    });
  }
  for (const corner of corners) {
    cornerAngleGradient(rest, corner, angleOf);
    [corner.a, corner.b, corner.c].forEach((node, slot) => {
      const s = angleOf[3 * slot]! ** 2 + angleOf[3 * slot + 1]! ** 2 + angleOf[3 * slot + 2]! ** 2;
      nodeStiffness[node]! += corner.stiffness * s;
    });
  }
  // A loop, not Math.max(...array): spreading throws RangeError past about 10^5 arguments.
  let top = 0;
  for (const k of nodeStiffness) top = Math.max(top, k);
  const dt = 1 / (2 * Math.PI * Math.sqrt(top / MASS));
  const damping = 2 * params.damping * Math.sqrt(Math.min(params.crease, params.facet) * MASS);

  return {
    rest,
    triangles,
    bars,
    hinges,
    corners,
    pinned: pinnedTriangle(rest, triangles),
    nodeStiffness,
    dt,
    damping,
    params,
  };
}

/** The three nodes of the triangle whose centroid is nearest the centre of the bounding box. */
function pinnedTriangle(rest: Float64Array, triangles: readonly TriangleIndices[]): number[] {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < rest.length; i += 3) {
    xs.push(rest[i]!);
    ys.push(rest[i + 1]!);
  }
  // Loops, not Math.min(...xs): spreading throws RangeError past about 10^5 arguments.
  const middle = (v: readonly number[]): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const x of v) {
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    return (lo + hi) / 2;
  };
  const cx = middle(xs);
  const cy = middle(ys);
  let best: TriangleIndices = triangles[0]!;
  let bestDist = Infinity;
  for (const t of triangles) {
    const mx = (xs[t[0]]! + xs[t[1]]! + xs[t[2]]!) / 3;
    const my = (ys[t[0]]! + ys[t[1]]! + ys[t[2]]!) / 3;
    const d = Math.hypot(mx - cx, my - cy);
    if (d < bestDist) {
      bestDist = d;
      best = t;
    }
  }
  return [...best];
}
