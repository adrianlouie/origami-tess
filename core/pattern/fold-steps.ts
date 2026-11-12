/**
 * The folding sequence of a crease pattern: pre-crease the grid, then the M/V lines, then collapse.
 *
 * Sits in the pattern stage of the data flow, after `lines.ts` has merged unit edges into maximal
 * lines, and feeds the viewer's step panel and the step export. A tessellation has no step-by-step
 * fold: every crease is made first, then all of them fold at once (Lang, *Twists, Tilings, and
 * Tessellations*, pp. 205–206). Real tessellators pre-crease a triangular grid first (§5.4.5),
 * then add the gadget's creases, valleys from the front and mountains after turning the paper
 * over. Everything here is exact (integer lattice points, no floats).
 */

import { cross, halfPlane, onSegment, primitive, windingNumber } from "../lattice/direction";
import { add, eis, equals, neg, sub, type Eisenstein } from "../lattice/eisenstein";
import type { CreasePattern } from "./crease-pattern";
import { creaseLines, type CreaseLine } from "./lines";

/** A straight run of grid creases, from one lattice point to another. */
export type GridSegment = { readonly from: Eisenstein; readonly to: Eisenstein };

/** One step of the folding sequence. */
export type FoldStep =
  /** Fold and unfold every lattice line of one direction that crosses the sheet. */
  | {
      readonly kind: "grid";
      readonly direction: Eisenstein;
      readonly segments: readonly GridSegment[];
    }
  /** Fold and unfold the lines of one assignment and direction (valleys first, then mountains). */
  | {
      readonly kind: "crease";
      readonly assignment: "V" | "M";
      readonly direction: Eisenstein;
      readonly lines: readonly CreaseLine[];
    }
  /** Collapse: every crease folds at once. */
  | { readonly kind: "collapse" };

/**
 * The three lattice directions, as primitive vectors at 0°, 60° and 120° (counter-clockwise order).
 *
 * In the triangular lattice a + bω (ω at 120°) the unit vectors 1, 1 + ω and ω are the three
 * directions of lattice lines; any two of the lines meet only at lattice points.
 */
export const GRID_DIRECTIONS: readonly Eisenstein[] = [eis(1, 0), eis(1, 1), eis(0, 1)];

/**
 * Is the point whose doubled coordinates are `p2` in the closed sheet (the union of the bounded
 * faces)? Everything is doubled so that the midpoint of a unit step is an integer point.
 */
function inClosedSheet(cp: CreasePattern, p2: Eisenstein): boolean {
  return cp.faces.some((face) => {
    const polygon = face.map((v) => {
      const z = cp.vertices[v]!;
      return eis(2 * z.a, 2 * z.b);
    });
    for (let i = 0; i < polygon.length; i++) {
      if (onSegment(polygon[i]!, polygon[(i + 1) % polygon.length]!, p2)) return true;
    }
    return windingNumber(polygon, p2) !== 0;
  });
}

/** Smallest and largest of a non-empty list, by a loop so a long list cannot overflow the stack. */
function range(xs: readonly number[]): readonly [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of xs) {
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return [lo, hi];
}

/**
 * Lists the lattice lines of one direction that lie inside the sheet, as maximal segments.
 *
 * A unit step p → p + d is a grid crease when p, p + d and the midpoint are in the closed sheet
 * and the step does not run along a border ("B") edge, which is paper edge, not a crease. The
 * midpoint test is needed because a sheet may have a notch between two of its points; the sheets
 * of the shipped gadgets are convex with lattice-direction borders, so for them the end points
 * alone decide. Steps on one line (same {@link cross} with d) are sorted along it and joined
 * end to end into maximal segments.
 *
 * @param cp - the crease pattern; its bounded faces are the sheet
 * @param d - a unit lattice vector, one of {@link GRID_DIRECTIONS}
 * @returns the maximal segments, ordered by line then position
 */
export function sheetGrid(cp: CreasePattern, d: Eisenstein): readonly GridSegment[] {
  if (cp.vertices.length === 0) return [];
  const as = cp.vertices.map((v) => v.a);
  const bs = cp.vertices.map((v) => v.b);
  const borders = cp.edges
    .filter((e) => e.assignment === "B")
    .map((e) => [cp.vertices[e.v0]!, cp.vertices[e.v1]!] as const);
  // Position along the line: the coordinate that d changes.
  const along = (z: Eisenstein) => (d.a !== 0 ? z.a : z.b);

  // Loops, not Math.min(...xs): spreading a large vertex list overflows the call stack (6.3).
  const [minA, maxA] = range(as);
  const [minB, maxB] = range(bs);
  const byLine = new Map<number, Eisenstein[]>();
  for (let b = minB; b <= maxB; b++) {
    for (let a = minA; a <= maxA; a++) {
      const p = eis(a, b);
      const q = add(p, d);
      const mid2 = add(p, q);
      if (!inClosedSheet(cp, eis(2 * p.a, 2 * p.b))) continue;
      if (!inClosedSheet(cp, eis(2 * q.a, 2 * q.b))) continue;
      if (!inClosedSheet(cp, mid2)) continue;
      const onBorder = borders.some(
        ([u, w]) =>
          cross(sub(w, u), d) === 0 &&
          onSegment(eis(2 * u.a, 2 * u.b), eis(2 * w.a, 2 * w.b), mid2),
      );
      if (onBorder) continue;
      const line = cross(d, p);
      byLine.set(line, [...(byLine.get(line) ?? []), p]);
    }
  }

  const segments: GridSegment[] = [];
  for (const line of [...byLine.keys()].sort((x, y) => x - y)) {
    const starts = byLine.get(line)!.sort((x, y) => along(x) - along(y));
    let from = starts[0]!;
    let to = add(from, d);
    for (const p of starts.slice(1)) {
      if (equals(p, to)) {
        to = add(p, d);
      } else {
        segments.push({ from, to });
        from = p;
        to = add(p, d);
      }
    }
    segments.push({ from, to });
  }
  return segments;
}

/** The direction of a line, as the primitive vector in the half-plane [0, π). */
function lineDirection(line: CreaseLine): Eisenstein {
  const d = primitive(sub(line.to, line.from));
  return halfPlane(d) === 0 ? d : neg(d);
}

/** Orders two directions of [0, π) by counter-clockwise angle: the cross product sign decides. */
const byAngle = (u: Eisenstein, v: Eisenstein) => -Math.sign(cross(u, v));

/**
 * Builds the folding sequence of a crease pattern.
 *
 * Order: one grid step per lattice direction that has any grid (0°, 60°, 120°), then one step per
 * (assignment, direction) of the maximal crease lines, all valleys before all mountains and
 * directions counter-clockwise from 0°, then one collapse. Border, flat and unassigned creases
 * are not folded in any step. An empty pattern gives only the collapse.
 *
 * @param cp - the crease pattern
 * @returns the steps; every mountain and valley edge is in exactly one crease step
 */
export function foldSteps(cp: CreasePattern): readonly FoldStep[] {
  const steps: FoldStep[] = [];
  for (const direction of GRID_DIRECTIONS) {
    const segments = sheetGrid(cp, direction);
    if (segments.length > 0) steps.push({ kind: "grid", direction, segments });
  }
  const lines = creaseLines(cp);
  for (const assignment of ["V", "M"] as const) {
    const mine = lines.filter((l) => l.assignment === assignment);
    const directions: Eisenstein[] = [];
    for (const l of mine) {
      const d = lineDirection(l);
      if (!directions.some((e) => equals(e, d))) directions.push(d);
    }
    directions.sort(byAngle);
    for (const direction of directions) {
      steps.push({
        kind: "crease",
        assignment,
        direction,
        lines: mine.filter((l) => equals(lineDirection(l), direction)),
      });
    }
  }
  steps.push({ kind: "collapse" });
  return steps;
}
