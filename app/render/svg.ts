/**
 * SVG renderer for triangular grids.
 *
 * Draws the exact grid from `core/lattice/grid.ts` as a standalone SVG string.
 * It is the render boundary of the lattice stage: Eisenstein points become floats
 * here via `toCartesian`. Returning a string (no DOM) keeps it testable in Node.
 */

import type { TriangularGrid } from "../../core/lattice/grid";
import { RENDER_PRECISION, toCartesian } from "./cartesian";

/** Options for {@link gridToSvg}. */
export type SvgOptions = {
  /** Pixels per lattice unit. Default 100. */
  readonly scale?: number;
  /** Stroke width in pixels. Default 1. */
  readonly strokeWidth?: number;
  /** Padding around the grid, in lattice units. Default 0.5. */
  readonly margin?: number;
};

/** Formats a number to the shared precision, avoiding "-0". */
function fmt(n: number): string {
  const s = n.toFixed(RENDER_PRECISION);
  return Number(s) === 0 ? (0).toFixed(RENDER_PRECISION) : s;
}

/**
 * Renders a triangular grid as an SVG document string.
 *
 * Each edge becomes one `<line>`, in the grid's deterministic order, so output is
 * snapshot-stable. SVG's y-axis points down, so y is negated to keep the math
 * orientation (ω up-left of 1). The viewBox is the grid's bounding box plus margin.
 *
 * @param grid - grid from `triangularGrid`
 * @param opts - scale, stroke width and margin
 * @returns a standalone SVG document
 */
export function gridToSvg(grid: TriangularGrid, opts: SvgOptions = {}): string {
  const { scale = 100, strokeWidth = 1, margin = 0.5 } = opts;
  const pts = grid.vertices.map((v) => {
    const p = toCartesian(v);
    return { x: p.x * scale, y: -p.y * scale };
  });
  const pad = margin * scale;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) + pad - minX;
  const height = Math.max(...ys) + pad - minY;

  const lines = grid.edges.map((e) => {
    const p = toCartesian(e.from);
    const q = toCartesian(e.to);
    return (
      `  <line x1="${fmt(p.x * scale)}" y1="${fmt(-p.y * scale)}" ` +
      `x2="${fmt(q.x * scale)}" y2="${fmt(-q.y * scale)}"/>`
    );
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[minX, minY, width, height].map(fmt).join(" ")}">`,
    `<g stroke="black" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round">`,
    ...lines,
    `</g>`,
    `</svg>`,
    ``,
  ].join("\n");
}
