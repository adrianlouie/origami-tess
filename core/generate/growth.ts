/**
 * Cellular-automaton growth of the paper: a birth-only totalistic automaton over the tiles of a
 * regular tiling, whose live region is then shrink-rotated into a twist tessellation.
 *
 * Sits in Phase 8 after `shrink-rotate.ts`: the automaton decides which tiles are part of the sheet
 * (the paper's shape), `grownOrientation` picks every pleat's mountain/valley from the tiles' birth
 * generations, and `shrinkRotate` and `orientedPattern` build the exact crease pattern that the
 * solver then judges. Everything here is exact and combinatorial; no float appears.
 *
 * The region must stay a topological disk: a face with a hole throws in `foldFaces` and
 * `sheetGeometry`, and a pinch vertex (two arcs of live tiles meeting at a point) throws in
 * `shrinkRotate`. `isDisk` is the guard and `growthStep` never lets a generation break it.
 */

import { cross } from "../lattice/direction";
import { eis, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import type { CreasePattern } from "../pattern/crease-pattern";
import {
  orientedPattern,
  regularTiling,
  shrinkRotate,
  type ShrinkRotated,
  type Tile,
  type TilingKind,
} from "./shrink-rotate";

const key = (z: Eisenstein): string => `${z.a},${z.b}`;

/** A pair of tiles sharing a side, with the keys of the side's two end vertices. */
type SharedSide = {
  readonly a: number;
  readonly b: number;
  readonly ends: readonly [string, string];
};

/** The universe of cells: a window of a regular tiling and its adjacency, computed once. */
export type GrowthBoard = {
  readonly kind: TilingKind;
  readonly radius: number;
  /** Tiles from `regularTiling`, corners counter-clockwise, scale 9. */
  readonly tiles: readonly Tile[];
  /** `neighbours[t]` lists the tiles that share a side with tile t. */
  readonly neighbours: readonly (readonly number[])[];
  /** Every side shared by two tiles. */
  readonly shared: readonly SharedSide[];
  /** The vertex keys of each tile. */
  readonly tileVertices: readonly (readonly string[])[];
  /** The side keys of each tile (a side is its two vertex keys, sorted). */
  readonly tileSides: readonly (readonly string[])[];
};

/**
 * Builds the board of a tiling window.
 *
 * @param kind - the tiling
 * @param radius - window radius in unit lattice steps, a safe integer ≥ 1 (as `regularTiling`)
 * @throws RangeError as `regularTiling` does
 */
export function growthBoard(kind: TilingKind, radius: number): GrowthBoard {
  const tiles = regularTiling(kind, radius);
  const sideOwners = new Map<string, { tile: number; ends: [string, string] }[]>();
  const tileVertices = tiles.map((t) => t.map(key));
  const tileSides = tiles.map((tile, f) =>
    tile.map((v, i) => {
      const ends = [key(v), key(tile[(i + 1) % tile.length]!)].sort() as [string, string];
      const k = ends.join("|");
      const list = sideOwners.get(k) ?? [];
      list.push({ tile: f, ends });
      sideOwners.set(k, list);
      return k;
    }),
  );
  const neighbours: number[][] = tiles.map(() => []);
  const shared: SharedSide[] = [];
  for (const owners of sideOwners.values()) {
    if (owners.length !== 2) continue;
    const [p, q] = owners as [(typeof owners)[number], (typeof owners)[number]];
    neighbours[p.tile]!.push(q.tile);
    neighbours[q.tile]!.push(p.tile);
    shared.push({ a: p.tile, b: q.tile, ends: p.ends });
  }
  return Object.freeze({
    kind,
    radius,
    tiles,
    neighbours: neighbours.map((n) => Object.freeze(n)),
    shared: Object.freeze(shared),
    tileVertices: tileVertices.map((v) => Object.freeze(v)),
    tileSides: tileSides.map((s) => Object.freeze(s)),
  });
}

/**
 * Whether the live tiles form a topological disk (a connected region with no hole and no pinch).
 *
 * The tile complex of a connected planar region has Euler characteristic χ = V − E + F = 1 − b₁,
 * where b₁ counts the independent loops (Euler–Poincaré formula, planar so b₂ = 0). A hole is a
 * loop, and so is a pinch: two arcs of live tiles meeting at a vertex while joined by side-adjacent
 * tiles elsewhere close a loop through that vertex. So a connected region is a disk exactly when
 * χ = 1, and no separate pinch test is needed (the tests check this against an independent
 * angle-sorting pinch count). V, E and F count the vertices, sides and tiles of the live region.
 *
 * @param board - the board
 * @param live - one Boolean per board tile
 * @throws RangeError if `live` has the wrong length
 */
export function isDisk(board: GrowthBoard, live: readonly boolean[]): boolean {
  if (live.length !== board.tiles.length) {
    throw new RangeError(`Need ${board.tiles.length} flags, got ${live.length}`);
  }
  const start = live.indexOf(true);
  if (start < 0) return false;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const t = queue.pop()!;
    for (const u of board.neighbours[t]!) {
      if (live[u] && !seen.has(u)) {
        seen.add(u);
        queue.push(u);
      }
    }
  }
  const liveCount = live.filter(Boolean).length;
  if (seen.size !== liveCount) return false;

  const vertices = new Set<string>();
  const sides = new Set<string>();
  live.forEach((on, t) => {
    if (!on) return;
    for (const v of board.tileVertices[t]!) vertices.add(v);
    for (const s of board.tileSides[t]!) sides.add(s);
  });
  return vertices.size - sides.size + liveCount === 1;
}

/**
 * A totalistic birth rule: a dead tile is born when its live-neighbour count is in `birth`.
 *
 * Counts are integers in 1..6 (a hexagon has six sides). A triangle has three, so counts above 3
 * can only fire on hexagons; a set with none that applies stops at once with status `stable`.
 */
export type GrowthRule = { readonly birth: readonly number[] };

/** The tiles of a tiling that contain the origin: the seed of the automaton. */
export function seedBirth(board: GrowthBoard): number[] {
  return board.tiles.map((tile) => {
    const sum = tile.reduce((s, z) => eis(s.a + z.a, s.b + z.b), eis(0, 0));
    return (sum.a === 0 && sum.b === 0) || tile.some((z) => z.a === 0 && z.b === 0) ? 0 : -1;
  });
}

function checkRule(rule: GrowthRule): void {
  if (rule.birth.length === 0) throw new RangeError("A birth set must not be empty");
  for (const n of rule.birth) {
    if (!Number.isInteger(n) || n < 1 || n > 6) {
      throw new RangeError(`A birth count must be an integer in 1..6, got ${n}`);
    }
  }
}

/** The outcome of one {@link growthStep}. */
export type GrowthStep = {
  /** The new birth array (a copy). */
  readonly birth: readonly number[];
  /** Tiles born in this step, ascending. */
  readonly born: readonly number[];
  /** `grew`, `stable` (no dead tile has a birth count) or `stalled` (candidates, none safe). */
  readonly status: "grew" | "stable" | "stalled";
};

/**
 * Applies one synchronous birth step, keeping the region a disk.
 *
 * Every dead tile whose live-neighbour count is in `rule.birth` is a candidate. When the live tiles
 * plus all candidates are still a disk they are all born. Otherwise (a synchronous birth would
 * close a hole or pinch the region) only the candidates that touch no other candidate and keep the
 * region a disk on their own are born: additions that share no vertex cannot interact, so their
 * union is a disk too. The rest wait. Both branches depend only on adjacency, so a symmetry of the
 * region is kept.
 *
 * @param board - the board
 * @param birth - birth generation per tile, −1 for dead
 * @param rule - the birth rule
 * @param generation - the generation number recorded for the new tiles, a safe integer ≥ 1 (a
 *   negative value would mark a born tile dead, and 0 is the seed's generation)
 * @throws RangeError for a bad rule, a bad generation number or a `birth` of the wrong length
 */
export function growthStep(
  board: GrowthBoard,
  birth: readonly number[],
  rule: GrowthRule,
  generation: number,
): GrowthStep {
  checkRule(rule);
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new RangeError(`Generation must be a safe integer >= 1, got ${generation}`);
  }
  if (birth.length !== board.tiles.length) {
    throw new RangeError(`Need ${board.tiles.length} birth entries, got ${birth.length}`);
  }
  const live = birth.map((b) => b >= 0);
  const candidates: number[] = [];
  birth.forEach((b, t) => {
    if (b >= 0) return;
    const count = board.neighbours[t]!.filter((u) => live[u]).length;
    if (rule.birth.includes(count)) candidates.push(t);
  });
  if (candidates.length === 0) return { birth: [...birth], born: [], status: "stable" };

  let accepted = candidates;
  const all = live.map((on, t) => on || candidates.includes(t));
  if (!isDisk(board, all)) {
    const owner = new Map<string, number>();
    for (const t of candidates) {
      for (const v of board.tileVertices[t]!) owner.set(v, (owner.get(v) ?? 0) + 1);
    }
    accepted = candidates.filter((t) => {
      if (board.tileVertices[t]!.some((v) => owner.get(v)! > 1)) return false;
      return isDisk(
        board,
        live.map((on, u) => on || u === t),
      );
    });
  }
  if (accepted.length === 0) return { birth: [...birth], born: [], status: "stalled" };
  const next = [...birth];
  for (const t of accepted) next[t] = generation;
  return { birth: next, born: accepted, status: "grew" };
}

/** The result of {@link grow}. */
export type Growth = {
  /** Birth generation per board tile, −1 for a tile that never lived. */
  readonly birth: readonly number[];
  /** `history[g]` is the number of tiles born in generation g (0 is the seed); never empty. */
  readonly history: readonly number[];
  /** `stable`, `stalled` (see {@link GrowthStep}) or `limit` when the generations ran out. */
  readonly status: "stable" | "stalled" | "limit";
};

/**
 * Grows a seed for up to `generations` steps.
 *
 * @param board - the board
 * @param rule - the birth rule
 * @param generations - the most steps to take, a safe integer ≥ 0
 * @param seed - a birth array for generation 0 (default {@link seedBirth}); its live tiles must be a disk
 * @throws RangeError for a bad rule, a bad generation count, or a seed that is not a disk
 */
export function grow(
  board: GrowthBoard,
  rule: GrowthRule,
  generations: number,
  seed?: readonly number[],
): Growth {
  checkRule(rule);
  if (!Number.isSafeInteger(generations) || generations < 0) {
    throw new RangeError(`Generations must be a safe integer >= 0, got ${generations}`);
  }
  let birth = seed === undefined ? seedBirth(board) : seed.map((b) => (b >= 0 ? 0 : -1));
  if (
    !isDisk(
      board,
      birth.map((b) => b >= 0),
    )
  )
    throw new RangeError("The seed is not a disk");
  const history = [birth.filter((b) => b >= 0).length];
  for (let g = 1; g <= generations; g++) {
    const step = growthStep(board, birth, rule, g);
    if (step.status !== "grew") return { birth, history, status: step.status };
    birth = [...step.birth];
    history.push(step.born.length);
  }
  return { birth, history, status: "limit" };
}

/**
 * How a pleat's mountain crease is placed.
 *
 * Each pleat is shared by two tiles; the "outward" tile is the newer one (ties: the one whose
 * centroid is farther from the origin, then the one counter-clockwise of the other). `outward`
 * puts the pleat's mountain crease on the outward tile, `inward` on the other, and `alternate`
 * is `outward` when the older tile's generation is even and `inward` when it is odd.
 */
export type PleatRule = "outward" | "inward" | "alternate";

function centroid(tile: Tile): Eisenstein {
  const sum = tile.reduce((s, z) => eis(s.a + z.a, s.b + z.b), eis(0, 0));
  if (sum.a % tile.length !== 0 || sum.b % tile.length !== 0) {
    throw new RangeError("A tile centroid is not a lattice point");
  }
  return eis(sum.a / tile.length, sum.b / tile.length);
}

/**
 * Picks `mountainOnFirst` for every interior pleat from the tiles' birth generations.
 *
 * Only rotation-invariant quantities are used (generation, `hexDistance` of a centroid, and the
 * sign of the exact cross product of two centroids), so a rotation of the region about the origin
 * maps the orientation to itself.
 *
 * @param sr - the tessellation of the live tiles
 * @param ages - birth generation of each `sr.tiles[i]`
 * @param rule - the pleat rule
 * @returns `mountainOnFirst` for {@link orientedPattern}
 * @throws RangeError if two adjacent tiles of equal age lie at equal distance on a line through the origin
 */
export function grownOrientation(
  sr: ShrinkRotated,
  ages: readonly number[],
  rule: PleatRule,
): boolean[] {
  const centres = sr.tiles.map(centroid);
  return sr.interior.map(({ tiles: [f, g] }) => {
    const [af, ag] = [ages[f]!, ages[g]!];
    let fOutward: boolean;
    if (af !== ag) fOutward = af > ag;
    else {
      const [df, dg] = [hexDistance(centres[f]!), hexDistance(centres[g]!)];
      if (df !== dg) fOutward = df > dg;
      else {
        const c = cross(centres[f]!, centres[g]!);
        if (c === 0) throw new RangeError("Two adjacent tiles have no rotational order");
        fOutward = c < 0;
      }
    }
    const outward = rule === "outward" || (rule === "alternate" && Math.min(af, ag) % 2 === 0);
    return fOutward === outward;
  });
}

/** A grown tessellation: the shrink-rotate bookkeeping and the fully assigned pattern. */
export type GrownPattern = {
  readonly sr: ShrinkRotated;
  /** Null when the local M/V clauses reject the orientation. */
  readonly cp: CreasePattern | null;
};

/**
 * Builds the crease pattern of a grown region.
 *
 * @param board - the board
 * @param birth - birth generation per tile, −1 for dead; the live tiles must be a disk
 * @param pleat - the pleat rule
 * @param options - `mirror` uses the conjugate shrink-rotate multiplier
 * @throws RangeError for a bad `birth`, or as `shrinkRotate` and {@link grownOrientation} do
 */
export function grownPattern(
  board: GrowthBoard,
  birth: readonly number[],
  pleat: PleatRule,
  options: { readonly mirror: boolean },
): GrownPattern {
  if (birth.length !== board.tiles.length) {
    throw new RangeError(`Need ${board.tiles.length} birth entries, got ${birth.length}`);
  }
  const liveIndex = birth.flatMap((b, t) => (b >= 0 ? [t] : []));
  const sr = shrinkRotate(
    liveIndex.map((t) => board.tiles[t]!),
    options,
  );
  const orientation = grownOrientation(
    sr,
    liveIndex.map((t) => birth[t]!),
    pleat,
  );
  return { sr, cp: orientedPattern(sr, orientation) };
}
