/**
 * SVG renderer for triangular grids and motif tilings.
 *
 * Draws the exact grid from `core/lattice/grid.ts`, or a tiling from
 * `core/symmetry/orbit.ts`, as a standalone SVG string.
 * It is the render boundary of the lattice stage: Eisenstein points become floats
 * here via `toCartesian`. Returning a string (no DOM) keeps it testable in Node.
 */

import type { TriangularGrid } from "../../core/lattice/grid";
import type { Tiling } from "../../core/symmetry/motif";
import { RENDER_PRECISION, toCartesian } from "./cartesian";

/** Options for {@link gridToSvg}; also the base of {@link TilingSvgOptions}. */
export type SvgOptions = {
  /** Pixels per lattice unit. Default 100. */
  readonly scale?: number;
  /** Stroke width in pixels. Default 1. */
  readonly strokeWidth?: number;
  /** Padding around the grid, in lattice units. Default 0.5. */
  readonly margin?: number;
};

/** Throws RangeError unless every named option is finite and satisfies `ok`. */
export function checkOptions(
  values: Record<string, number>,
  ok: (n: number) => boolean,
  rule: string,
): void {
  for (const [name, n] of Object.entries(values)) {
    if (!Number.isFinite(n) || !ok(n)) throw new RangeError(`${name} must be ${rule}, got ${n}`);
  }
}

/** Formats a number to the shared precision, avoiding "-0". */
export function fmt(n: number): string {
  const s = n.toFixed(RENDER_PRECISION);
  return Number(s) === 0 ? (0).toFixed(RENDER_PRECISION) : s;
}

/** Options for {@link tilingToSvg}. */
export type TilingSvgOptions = SvgOptions & {
  /** Radius of the circle drawn at each point, in pixels. Default 3. */
  readonly pointRadius?: number;
};

export type Px = { readonly x: number; readonly y: number };

/** Maps an exact lattice point to pixels; y is negated because SVG's y-axis points down. */
export function toPixels(z: Parameters<typeof toCartesian>[0], scale: number): Px {
  const p = toCartesian(z);
  return { x: p.x * scale, y: -p.y * scale };
}

/**
 * Wraps drawn elements in an SVG document whose viewBox is the bounding box of
 * `extent` plus `margin` lattice units. An empty extent gives a zero-size box.
 */
export function svgDocument(
  extent: readonly Px[],
  body: readonly string[],
  margin: number,
  scale: number,
): string {
  const pad = margin * scale;
  // A loop, not Math.min(...xs): spreading a large array overflows the call stack.
  let lo = { x: Infinity, y: Infinity };
  let hi = { x: -Infinity, y: -Infinity };
  for (const p of extent) {
    lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y) };
    hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y) };
  }
  const minX = extent.length ? lo.x - pad : 0;
  const minY = extent.length ? lo.y - pad : 0;
  const width = extent.length ? hi.x + pad - minX : 0;
  const height = extent.length ? hi.y + pad - minY : 0;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[minX, minY, width, height].map(fmt).join(" ")}">`,
    ...body,
    `</svg>`,
    ``,
  ].join("\n");
}

/** One <line> element between two lattice points. */
function lineElement(
  from: Parameters<typeof toCartesian>[0],
  to: Parameters<typeof toCartesian>[0],
  scale: number,
): string {
  const p = toPixels(from, scale);
  const q = toPixels(to, scale);
  return `  <line x1="${fmt(p.x)}" y1="${fmt(p.y)}" x2="${fmt(q.x)}" y2="${fmt(q.y)}"/>`;
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
  checkOptions({ scale, strokeWidth }, (n) => n > 0, "a positive finite number");
  checkOptions({ margin }, (n) => n >= 0, "a non-negative finite number");
  return svgDocument(
    grid.vertices.map((v) => toPixels(v, scale)),
    [
      `<g stroke="black" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round">`,
      ...grid.edges.map((e) => lineElement(e.from, e.to, scale)),
      `</g>`,
    ],
    margin,
    scale,
  );
}

/**
 * Renders a tiling as an SVG document string: one `<line>` per edge, one
 * `<circle>` per point, both in the tiling's deterministic order.
 *
 * The viewBox covers every point and every edge endpoint, since an edge endpoint
 * need not be a listed point. Same y-flip and precision as {@link gridToSvg}.
 *
 * @param tiling - result of `tile`
 * @param opts - scale, stroke width, margin and point radius
 * @returns a standalone SVG document
 */
export function tilingToSvg(tiling: Tiling, opts: TilingSvgOptions = {}): string {
  const { scale = 100, strokeWidth = 1, margin = 0.5, pointRadius = 3 } = opts;
  checkOptions({ scale, strokeWidth, pointRadius }, (n) => n > 0, "a positive finite number");
  checkOptions({ margin }, (n) => n >= 0, "a non-negative finite number");
  const extent = [
    ...tiling.points.map((z) => toPixels(z, scale)),
    ...tiling.edges.flatMap((e) => [toPixels(e.from, scale), toPixels(e.to, scale)]),
  ];
  return svgDocument(
    extent,
    [
      `<g stroke="black" stroke-width="${fmt(strokeWidth)}" stroke-linecap="round">`,
      ...tiling.edges.map((e) => lineElement(e.from, e.to, scale)),
      `</g>`,
      `<g fill="black">`,
      ...tiling.points.map((z) => {
        const p = toPixels(z, scale);
        return `  <circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(pointRadius)}"/>`;
      }),
      `</g>`,
    ],
    margin,
    scale,
  );
}
