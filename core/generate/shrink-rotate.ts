/**
 * Shrink-rotate tessellations on the triangular lattice: regular tilings turned into twist
 * tessellations by shrinking and rotating every tile about its centre.
 *
 * Sits in Phase 8 (generative math), at the front of the data flow: it builds an exact crease
 * pattern (lattice → gadgets → pattern) whose creases are unassigned except for the one Boolean per
 * tile edge that picks the pleat orientation. `orientedPattern` fills in the rest with the local
 * M/V solver, and the layer solver then judges the result (`repair.ts`).
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), §6.1–6.2 (shrink-rotate, Eqs.
 * 6.1–6.5), §6.4.3 (crease assignment from the oriented dual graph, Fig. 6.17) and Thm 23
 * (Kawasaki holds at every vertex of a shrink-rotate tessellation).
 */

import {
  add,
  checkedMul,
  conj,
  eis,
  mul,
  rot60,
  sub,
  type Eisenstein,
} from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { fromSegments, type CreasePattern } from "../pattern/crease-pattern";
import { inLattice } from "../symmetry/p6m";
import { solveMv, withMvAssignment } from "../solve/solver";

/** The regular and semiregular tilings available on the triangular lattice. */
export type TilingKind = "3^6" | "6^3" | "3.6.3.6";

/** A tile: its corners counter-clockwise, already multiplied by {@link TILING_SCALE}. */
export type Tile = readonly Eisenstein[];

/**
 * The factor every tiling is built at. A tile centroid is a third of a corner sum, and the
 * shrink-rotate map divides by a further 3 (the denominator of {@link LATTICE_LAMBDA}), so scaling
 * by 3 · 3 keeps every new vertex an exact lattice point.
 */
export const TILING_SCALE = 9;

/**
 * The shrink-rotate multiplier λ = μ/m = (2 + ω)/3 (rotate by 30°, shrink by 1/√3) and the only one
 * that keeps every crease on a 30° direction with a non-degenerate twist.
 *
 * Derivation (scratch brute force over μ/m with m ≤ 12, pinned in the tests): a shrunken tile edge
 * is λ·e and a pleat is (1 − λ)(c_f − c_g) with c_f − c_g perpendicular to the shared edge e, so the
 * creases are on the lattice exactly when arg λ and arg(1 − λ) are multiples of 30°. The twist
 * parallelogram has signed area proportional to Re λ − |λ|²: (1 + ω)/2 and (2 + ω)/2 give zero
 * (a 90° angle at λ) and (1 + 2ω)/3 gives a negative one (the folds cross). Its conjugate is the
 * mirror hand.
 */
export const LATTICE_LAMBDA = Object.freeze({ mu: eis(2, 1), m: 3 });

const key = (z: Eisenstein): string => `${z.a},${z.b}`;

/** Multiplies a lattice point by an integer. */
function times(k: number, z: Eisenstein): Eisenstein {
  return eis(checkedMul(k, z.a), checkedMul(k, z.b));
}

/** Divides a lattice point by an integer, which must be exact. */
function divExact(z: Eisenstein, n: number): Eisenstein {
  if (z.a % n !== 0 || z.b % n !== 0) {
    throw new RangeError(`(${z.a}, ${z.b}) is not divisible by ${n}: the tile is not at scale 9`);
  }
  return eis(z.a / n, z.b / n);
}

/** The six unit steps counter-clockwise from 1: the corners of the hexagon around a centre. */
function hexagonAround(centre: Eisenstein): Eisenstein[] {
  const corners: Eisenstein[] = [];
  let step = eis(1, 0);
  for (let k = 0; k < 6; k++) {
    corners.push(add(centre, step));
    step = rot60(step);
  }
  return corners;
}

/**
 * Lists the tiles of a tiling that lie inside the hexagonal window hexDistance ≤ radius, scaled by
 * {@link TILING_SCALE}.
 *
 * 3⁶ has every unit triangle, 6³ has a hexagon around each point of the sublattice (2 + ω)Λ, and
 * 3.6.3.6 has a hexagon around each point of 2Λ plus the unit triangles that touch none of them.
 * A tile is kept only when all its corners are in the window, so the pieces are whole tiles. The
 * origin is a vertex of 3⁶ and the centre of a hexagon in the other two, a 6-fold centre of each.
 *
 * @param kind - the tiling
 * @param radius - window radius in unit lattice steps, a safe integer ≥ 1
 * @throws RangeError for a radius that is not a safe integer ≥ 1
 */
export function regularTiling(kind: TilingKind, radius: number): Tile[] {
  if (!Number.isSafeInteger(radius) || radius < 1) {
    throw new RangeError(`Tiling radius must be a safe integer >= 1, got ${radius}`);
  }
  const inside = (corners: readonly Eisenstein[]): boolean =>
    corners.every((z) => hexDistance(z) <= radius);
  const sixtyUnit = eis(1, 1);
  const tiles: Tile[] = [];
  const doubleLattice = eis(2, 0);
  const tripleSub = eis(2, 1);
  for (let a = -radius; a <= radius; a++) {
    for (let b = -radius; b <= radius; b++) {
      const p = eis(a, b);
      if (hexDistance(p) > radius) continue;
      if (kind === "6^3" && inLattice(p, tripleSub)) {
        const hex = hexagonAround(p);
        if (inside(hex)) tiles.push(hex);
      }
      if (kind === "3.6.3.6" && inLattice(p, doubleLattice)) {
        const hex = hexagonAround(p);
        if (inside(hex)) tiles.push(hex);
      }
      if (kind === "3^6" || kind === "3.6.3.6") {
        const up = [p, add(p, eis(1, 0)), add(p, sixtyUnit)];
        const down = [p, add(p, sixtyUnit), add(p, eis(0, 1))];
        for (const triangle of [up, down]) {
          const touchesHexagon = triangle.some((z) => inLattice(z, doubleLattice));
          if (inside(triangle) && (kind === "3^6" || !touchesHexagon)) tiles.push(triangle);
        }
      }
    }
  }
  return tiles.map((tile) => tile.map((z) => times(TILING_SCALE, z)));
}

/** One edge shared by two tiles: the pleat of the twist tessellation runs along it. */
export type InteriorEdge = {
  /** The tiles on the two sides, lower index first. */
  readonly tiles: readonly [number, number];
  /** The tiling edge's two ends (scaled tiling coordinates), ordered by (a, b). */
  readonly ends: readonly [Eisenstein, Eisenstein];
  /**
   * The crease indices of the two shrunken copies of the edge, the one on `tiles[0]` first. They are
   * the two parallel creases of one pleat, and always opposite (Lang §6.4.3, Fig. 6.17).
   */
  readonly creases: readonly [number, number];
};

/** A shrink-rotate tessellation: the crease pattern and the bookkeeping that assigns it. */
export type ShrinkRotated = {
  /** Every crease unassigned except the sheet outline, which is "B". */
  readonly cp: CreasePattern;
  readonly tiles: readonly Tile[];
  /** The tiling edges shared by two tiles, one pleat each, in a fixed order. */
  readonly interior: readonly InteriorEdge[];
};

/** Orders two lattice points by (a, b) so an undirected pair has one spelling. */
function sortedEnds(p: Eisenstein, q: Eisenstein): [Eisenstein, Eisenstein] {
  return (p.a - q.a || p.b - q.b) <= 0 ? [p, q] : [q, p];
}

/**
 * Builds the shrink-rotate tessellation of a tiling.
 *
 * Construction (Lang §6.1–6.2): each tile f with centroid c_f becomes c_f + λ(v − c_f) for each
 * corner v, with λ = {@link LATTICE_LAMBDA} (or its conjugate for the mirror hand). The creases are
 * the edges of every shrunken tile and, for each tiling edge uv shared by tiles f and g, the pleat
 * segments from f's copy of u to g's copy of u, and the same for v. At a tiling vertex all of whose
 * tiles are present, the pleats close up into the twist polygon; at a vertex on the window's edge
 * the polygon is closed by a chord that belongs to the sheet's outline ("B"), unless only two
 * tiles meet there (the single pleat is the outline) or one does (nothing to close). Every
 * crease vertex inside has degree 4 and Kawasaki holds there (Thm 23), which the tests check.
 *
 * The creases are exact because the tiles are at {@link TILING_SCALE} (centroids and λ(v − c) are
 * then integers); `checkedMul` throws past 2⁵³. `creasePattern` rejects a non-planar result.
 *
 * @param tiles - tiles from {@link regularTiling} (corners counter-clockwise, scale 9)
 * @param options - `mirror` uses the conjugate multiplier
 * @throws RangeError for a tile that is not at scale 9, an empty tiling, or a non-planar result
 */
export function shrinkRotate(
  tiles: readonly Tile[],
  options: { readonly mirror: boolean },
): ShrinkRotated {
  if (tiles.length === 0) throw new RangeError("A tessellation needs at least one tile");
  const mu = options.mirror ? conj(LATTICE_LAMBDA.mu) : LATTICE_LAMBDA.mu;
  const shrunk = tiles.map((tile) => {
    const sum = tile.reduce((s, z) => add(s, z), eis(0, 0));
    const centre = divExact(sum, tile.length);
    return tile.map((v) => add(centre, divExact(mul(mu, sub(v, centre)), LATTICE_LAMBDA.m)));
  });

  // Each tiling edge, by its two ends, lists the tiles with it as a side and the corner index.
  const sides = new Map<string, { tile: number; at: number }[]>();
  const sideKey = (p: Eisenstein, q: Eisenstein): string => {
    const [lo, hi] = sortedEnds(p, q);
    return `${key(lo)}|${key(hi)}`;
  };
  tiles.forEach((tile, f) => {
    tile.forEach((v, i) => {
      const k = sideKey(v, tile[(i + 1) % tile.length]!);
      const list = sides.get(k) ?? [];
      list.push({ tile: f, at: i });
      sides.set(k, list);
    });
  });

  const segments: { from: Eisenstein; to: Eisenstein; assignment: "U" | "B" }[] = [];
  const copyOf = (f: number, i: number): Eisenstein => shrunk[f]![i % shrunk[f]!.length]!;
  tiles.forEach((tile, f) => {
    tile.forEach((v, i) => {
      const shared = sides.get(sideKey(v, tile[(i + 1) % tile.length]!))!.length === 2;
      segments.push({
        from: copyOf(f, i),
        to: copyOf(f, i + 1),
        assignment: shared ? "U" : "B",
      });
    });
  });

  // Tiling vertices: which tiles have them and where, and whether an unshared side touches them.
  const atVertex = new Map<string, { tile: number; at: number; open: boolean }[]>();
  tiles.forEach((tile, f) => {
    tile.forEach((v, i) => {
      const prev = tile[(i + tile.length - 1) % tile.length]!;
      const next = tile[(i + 1) % tile.length]!;
      const open =
        sides.get(sideKey(v, next))!.length === 1 || sides.get(sideKey(prev, v))!.length === 1;
      const list = atVertex.get(key(v)) ?? [];
      list.push({ tile: f, at: i, open });
      atVertex.set(key(v), list);
    });
  });
  const cornerOf = (f: number, v: Eisenstein): number =>
    tiles[f]!.findIndex((z) => key(z) === key(v));
  const interiorTiles: {
    f: number;
    g: number;
    fAt: number;
    gAt: number;
    p: Eisenstein;
    q: Eisenstein;
  }[] = [];
  for (const list of sides.values()) {
    if (list.length !== 2) continue;
    const [a, b] = list as [{ tile: number; at: number }, { tile: number; at: number }];
    const [f, g] = a.tile < b.tile ? [a, b] : [b, a];
    const corners = tiles[f.tile]!;
    const [p, q] = sortedEnds(corners[f.at]!, corners[(f.at + 1) % corners.length]!);
    interiorTiles.push({ f: f.tile, g: g.tile, fAt: f.at, gAt: g.at, p, q });
  }
  interiorTiles.sort((x, y) => x.f - y.f || x.g - y.g || x.p.a - y.p.a || x.p.b - y.p.b);

  const vertexOpen = (v: Eisenstein): boolean => atVertex.get(key(v))!.some((t) => t.open);
  const vertexCount = (v: Eisenstein): number => atVertex.get(key(v))!.length;
  for (const { f, g, p, q } of interiorTiles) {
    for (const v of [p, q]) {
      const fi = cornerOf(f, v);
      const gi = cornerOf(g, v);
      // On the sheet's edge a vertex with two tiles has a single pleat, and that pleat is the edge.
      const outline = vertexOpen(v) && vertexCount(v) === 2;
      segments.push({
        from: copyOf(f, fi),
        to: copyOf(g, gi),
        assignment: outline ? "B" : "U",
      });
    }
  }
  for (const [vk, list] of atVertex) {
    if (!list.some((t) => t.open) || list.length < 3) continue;
    const ends = list.filter((t) => t.open);
    if (ends.length !== 2) {
      throw new RangeError(`Tiling vertex ${vk} has ${ends.length} open corners, expected 2`);
    }
    segments.push({
      from: copyOf(ends[0]!.tile, ends[0]!.at),
      to: copyOf(ends[1]!.tile, ends[1]!.at),
      assignment: "B",
    });
  }

  const cp = fromSegments([], segments);
  const vertexIndex = new Map(cp.vertices.map((z, i) => [key(z), i]));
  const edgeIndex = new Map<string, number>();
  cp.edges.forEach((e, i) => edgeIndex.set(`${Math.min(e.v0, e.v1)}|${Math.max(e.v0, e.v1)}`, i));
  const crease = (a: Eisenstein, b: Eisenstein): number => {
    const v0 = vertexIndex.get(key(a))!;
    const v1 = vertexIndex.get(key(b))!;
    return edgeIndex.get(`${Math.min(v0, v1)}|${Math.max(v0, v1)}`)!;
  };
  const interior: InteriorEdge[] = interiorTiles.map(({ f, g, fAt, gAt, p, q }) =>
    Object.freeze({
      tiles: [f, g] as const,
      ends: [p, q] as const,
      creases: [
        crease(copyOf(f, fAt), copyOf(f, fAt + 1)),
        crease(copyOf(g, gAt), copyOf(g, gAt + 1)),
      ] as const,
    }),
  );
  return Object.freeze({ cp, tiles, interior: Object.freeze(interior) });
}

/**
 * Returns the fully assigned pattern for a pleat orientation, or null when the local M/V clauses
 * have no solution with it.
 *
 * Each interior tiling edge is a pleat of two parallel creases that must be opposite (Lang §6.4.3):
 * `mountainOnFirst[j]` says whether the copy on `interior[j].tiles[0]` is the mountain. That fixes
 * the pleats; the twist polygon's edges are then forced by Maekawa and Big-Little-Big, and
 * `solveMv` fills them in (the tests check the answer is unique for every orientation).
 *
 * @param sr - the tessellation
 * @param mountainOnFirst - one Boolean per interior edge
 * @throws RangeError if the array is shorter than `sr.interior`
 */
export function orientedPattern(
  sr: ShrinkRotated,
  mountainOnFirst: readonly boolean[],
): CreasePattern | null {
  if (mountainOnFirst.length < sr.interior.length) {
    throw new RangeError(`Need ${sr.interior.length} orientations, got ${mountainOnFirst.length}`);
  }
  const assigned = new Map<number, "M" | "V">();
  sr.interior.forEach(({ creases }, j) => {
    const mountain = mountainOnFirst[j] === true;
    assigned.set(creases[0], mountain ? "M" : "V");
    assigned.set(creases[1], mountain ? "V" : "M");
  });
  const edges = sr.cp.edges.map((e, i) => ({ ...e, assignment: assigned.get(i) ?? e.assignment }));
  const base: CreasePattern = Object.freeze({ ...sr.cp, edges: Object.freeze(edges) });
  const result = solveMv(base);
  return result.status === "sat" ? withMvAssignment(base, result.assignment) : null;
}
