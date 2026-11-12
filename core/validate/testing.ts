/**
 * Test helpers: a brute-force single-vertex flat-folding oracle (not imported by shipped code).
 *
 * Shared by the Big-Little-Big tests (Phase 3) and the stacking-clause tests (Phase 5), which both
 * need an independent answer to "does this vertex fold flat?". Everything here is floating point and
 * exhaustive; it exists to cross-check the exact, clause-based code, never to replace it.
 */

import { toCartesian } from "../../app/render/cartesian";
import { compareAngle } from "../lattice/direction";
import { eis, rot60, ZERO, type Eisenstein } from "../lattice/eisenstein";
import { hexagonFrame } from "../gadgets/crease";
import { fromSegments, type Assignment, type CreasePattern } from "../pattern/crease-pattern";
import { kawasakiFlat, maekawaFlat } from "./local-flat-foldability";

/** A mountain or valley crease. */
export type MV = "M" | "V";

/** Twelve crease directions at multiples of 30°, counter-clockwise from +x. */
export const POOL: readonly Eisenstein[] = (() => {
  const dirs: Eisenstein[] = [];
  for (const base of [eis(1, 0), eis(2, 1)]) {
    let z = base;
    for (let k = 0; k < 6; k++) {
      dirs.push(z);
      z = rot60(z);
    }
  }
  return dirs.sort(compareAngle);
})();

/** All k-element index subsets of 0..n-1, in increasing order. */
export function subsets(n: number, k: number): number[][] {
  const out: number[][] = [];
  const walk = (start: number, chosen: number[]) => {
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < n; i++) walk(i + 1, [...chosen, i]);
  };
  walk(0, []);
  return out;
}

/** All permutations of 0..n-1; the layer ranks of n sectors. */
export function permutations(n: number): number[][] {
  const out: number[][] = [];
  const walk = (rest: number[], chosen: number[]) => {
    if (rest.length === 0) out.push(chosen);
    rest.forEach((x, i) => walk([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, x]));
  };
  walk(
    Array.from({ length: n }, (_, i) => i),
    [],
  );
  return out;
}

/** All M/V strings of length n with |#M − #V| = 2 (Maekawa). */
export function maekawaAssignments(n: number): MV[][] {
  return allAssignments(n).filter((a) => maekawaFlat(a));
}

/** All 2ⁿ M/V strings of length n. */
export function allAssignments(n: number): MV[][] {
  const out: MV[][] = [];
  for (let bits = 0; bits < 2 ** n; bits++) {
    out.push(Array.from({ length: n }, (_, i) => ((bits >> i) & 1 ? "M" : "V") as MV));
  }
  return out;
}

const EPS = 1e-9;
const PERMS = new Map<number, number[][]>();

/**
 * Folded geometry of a vertex: crease positions and the extent of each sector on the line.
 *
 * With `open` the directions are the rays of a wedge of paper, first and last being its two edges,
 * so there are one fewer sectors than rays and no sector closes the circle.
 */
function foldModel(dirs: readonly Eisenstein[], open = false) {
  const n = open ? dirs.length - 1 : dirs.length;
  const theta = dirs.map((d) => {
    const p = toCartesian(d);
    const t = Math.atan2(p.y, p.x);
    return t < 0 ? t + 2 * Math.PI : t;
  });
  const width = theta.slice(0, n).map((t, i) => {
    const next = theta[(i + 1) % dirs.length]!;
    return next - t + (next <= t ? 2 * Math.PI : 0);
  });
  const pos: number[] = [0];
  for (let i = 0; i < n - 1; i++) pos.push(pos[i]! + (i % 2 === 0 ? width[i]! : -width[i]!));
  const lo = width.map((w, i) => Math.min(pos[i]!, pos[i]! + (i % 2 === 0 ? w : -w)));
  const hi = width.map((w, i) => Math.max(pos[i]!, pos[i]! + (i % 2 === 0 ? w : -w)));
  return { n, pos, lo, hi };
}

/**
 * Is this stacking of the sectors a valid flat folding of the vertex?
 *
 * Sector j lies between crease j and crease j + 1 (counter-clockwise), so crease j separates
 * sectors j − 1 and j. Sector 0 is unflipped and a higher `rank` is nearer the viewer. Folded
 * positions: crease 0 sits at 0 and each sector turns the next crease by ±its width (alternating,
 * because every fold reflects). A stacking is valid when each crease's two sectors are stacked on
 * the side M/V demands, no sector passes through a crease between its two sheets, and the folds at
 * one position nest rather than interleave (Hull, "Project Origami", ch. 4; Bern & Hayes 1996 for
 * the single-vertex case).
 *
 * @param rank - `rank[s]` is the layer of sector s, a permutation of 0..n-1
 */
export function layerOrderValid(
  dirs: readonly Eisenstein[],
  assigns: readonly MV[],
  rank: readonly number[],
): boolean {
  return checkOrder(foldModel(dirs), assigns, rank);
}

function checkOrder(
  { n, pos, lo, hi }: ReturnType<typeof foldModel>,
  assigns: readonly MV[],
  rank: readonly number[],
  first = 0,
): boolean {
  const pairLo: number[] = [];
  const pairHi: number[] = [];
  for (let j = first; j < n; j++) {
    const a = (j + n - 1) % n;
    const above = a % 2 === 0 ? assigns[j] === "V" : assigns[j] === "M";
    if (rank[j]! > rank[a]! !== above) return false;
    pairLo[j] = Math.min(rank[a]!, rank[j]!);
    pairHi[j] = Math.max(rank[a]!, rank[j]!);
    for (let c = 0; c < n; c++) {
      if (c === a || c === j) continue;
      if (lo[c]! + EPS < pos[j]! && pos[j]! < hi[c]! - EPS) {
        if (rank[c]! > pairLo[j]! && rank[c]! < pairHi[j]!) return false;
      }
    }
  }
  for (let j = first; j < n; j++) {
    for (let k = j + 1; k < n; k++) {
      if (Math.abs(pos[j]! - pos[k]!) > EPS) continue;
      const [a, b, c, d] = [pairLo[j]!, pairHi[j]!, pairLo[k]!, pairHi[k]!];
      if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) return false;
    }
  }
  return true;
}

/**
 * Brute-force reference: does this single vertex fold flat, by trying every layer order?
 *
 * Floats are fine here: it is a test oracle.
 */
export function foldsFlat(dirs: readonly Eisenstein[], assigns: readonly MV[]): boolean {
  const n = dirs.length;
  if (!PERMS.has(n)) PERMS.set(n, permutations(n));
  const model = foldModel(dirs);
  return PERMS.get(n)!.some((rank) => checkOrder(model, assigns, rank));
}

/**
 * Brute-force reference for a wedge of paper at the edge of a sheet: can it fold flat?
 *
 * The directions are the rays counter-clockwise, the first and last being the two paper edges, and
 * `assigns[i]` is the crease along ray i (entries 0 and last are never read). Sector i lies between
 * rays i and i + 1; there is no closing sector, so no Kawasaki or Maekawa condition applies and
 * only the layer rules decide. Floats are fine: it is a test oracle.
 */
export function wedgeFoldsFlat(dirs: readonly Eisenstein[], assigns: readonly MV[]): boolean {
  const sectors = dirs.length - 1;
  if (!PERMS.has(sectors)) PERMS.set(sectors, permutations(sectors));
  const model = foldModel(dirs, true);
  return PERMS.get(sectors)!.some((rank) => checkOrder(model, assigns, rank, 1));
}

/** Every Kawasaki vertex of the given degree drawn from POOL, with every Maekawa assignment. */
export function candidates(degree: number): { dirs: Eisenstein[]; assigns: MV[] }[] {
  const out: { dirs: Eisenstein[]; assigns: MV[] }[] = [];
  const assignments = maekawaAssignments(degree);
  for (const idx of subsets(POOL.length, degree)) {
    const dirs = idx.map((i) => POOL[i]!);
    if (!kawasakiFlat(dirs)) continue;
    for (const assigns of assignments) out.push({ dirs, assigns });
  }
  return out;
}

/**
 * A sheet with two whole creases that meet at a vertex on its edge, leaving a small sector there.
 *
 * The frame is the radius-2 hexagon. P = 2 + ω is the middle of one side, so the paper there is a
 * 180° wedge between the frame edges at 120° and 300°. A crease `a` runs from P west along 180°
 * to the frame point at −1 + ω, and a crease `b` runs from P at 210° through the origin to the
 * opposite frame point. The wedge has sectors 60°, 30° and 90°, so the 30° sector is strictly
 * smaller than both neighbours and its two creases are the Big-Little-Big pair (Lang, p. 52).
 * Every other interior vertex has degree 2 and lies on one straight crease, so the only vertex
 * with a condition beyond "both sides of a straight crease agree" is P.
 *
 * @param a - assignment of every unit edge of the 180° crease
 * @param b - assignment of both edges of the 210° crease
 */
export function borderLinePattern(a: Assignment, b: Assignment): CreasePattern {
  const p = eis(2, 1);
  const west = [p, eis(1, 1), eis(0, 1), eis(-1, 1)];
  return fromSegments(
    [ZERO],
    [
      ...hexagonFrame(2),
      ...west.slice(1).map((to, i) => ({ from: west[i]!, to, assignment: a })),
      { from: p, to: ZERO, assignment: b },
      { from: ZERO, to: eis(-2, -1), assignment: b },
    ],
  );
}
