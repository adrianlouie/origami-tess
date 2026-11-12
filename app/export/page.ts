/**
 * Page fitting for printed exports: one uniform scale, centred, inside a margin.
 *
 * Render end of the data flow, used by the PDF writer. Works in plain floats (the render boundary):
 * a drawing's bounding box in lattice units, y up, is mapped to a page in PDF points (1/72 inch),
 * y up as well, so the mapping never flips an axis.
 */

import type { Point } from "../render/cartesian";

/** Page sizes in PDF points (1/72 inch), portrait: ISO 216 A4 and US Letter. */
export const PAGE_SIZES = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;

/** A named page size. */
export type PageName = keyof typeof PAGE_SIZES;

/** Portrait, landscape, or whichever gives the larger drawing. */
export type Orientation = "auto" | "portrait" | "landscape";

/** An axis-aligned box, in lattice units with y up. */
export type Extent = {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
};

/** The mapping from a drawing to a page: `page = (z − min)·scale + offset`, per axis. */
export type PageFit = {
  readonly width: number;
  readonly height: number;
  /** Points per lattice unit. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
};

/** Bounding box of a point list; all zeros for none, so an empty pattern still has a page. */
export function extentOf(points: readonly Point[]): Extent {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  // A loop, not Math.min(...xs): spreading a large array overflows the call stack.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Largest scale at which a `w` × `h` drawing fits a page `pw` × `ph` with margin `m`. */
function scaleFor(w: number, h: number, pw: number, ph: number, m: number, top: number): number {
  // A zero extent on an axis puts no limit on that axis; a point has no limit at all, so use 1.
  const sx = w > 0 ? (pw - 2 * m) / w : Infinity;
  const sy = h > 0 ? (ph - 2 * m - top) / h : Infinity;
  const s = Math.min(sx, sy);
  return Number.isFinite(s) ? s : 1;
}

/**
 * Fits a drawing onto a page: the largest uniform scale that keeps it inside `margin` on every
 * side, centred. With `auto`, the orientation with the larger scale wins (portrait on a tie).
 *
 * @param extent - bounding box of the drawing, lattice units, y up
 * @param page - page size name
 * @param margin - margin on every side, in points; less than half the shorter page side
 * @param orientation - portrait, landscape or auto
 * @param reserveTop - extra points kept free along the top edge, for a caption (default 0)
 * @returns the page size and the lattice-to-page mapping
 * @throws RangeError for an unknown page or orientation, a bad margin, or an inverted extent
 */
export function fitToPage(
  extent: Extent,
  page: PageName,
  margin: number,
  orientation: Orientation,
  reserveTop = 0,
): PageFit {
  const size = PAGE_SIZES[page];
  if (size === undefined) throw new RangeError(`Unknown page size ${String(page)}`);
  if (!["auto", "portrait", "landscape"].includes(orientation)) {
    throw new RangeError(`Unknown orientation ${String(orientation)}`);
  }
  if (!Number.isFinite(margin) || margin < 0 || 2 * margin >= size.width) {
    throw new RangeError(`margin must be in [0, ${size.width / 2}), got ${margin}`);
  }
  if (!Number.isFinite(reserveTop) || reserveTop < 0 || reserveTop + 2 * margin >= size.width) {
    throw new RangeError(
      `reserveTop must be in [0, ${size.width - 2 * margin}), got ${reserveTop}`,
    );
  }
  const w = extent.maxX - extent.minX;
  const h = extent.maxY - extent.minY;
  if (!(w >= 0 && h >= 0)) throw new RangeError("extent is inverted or not finite");

  const portrait = { width: size.width, height: size.height };
  const landscape = { width: size.height, height: size.width };
  const sp = scaleFor(w, h, portrait.width, portrait.height, margin, reserveTop);
  const sl = scaleFor(w, h, landscape.width, landscape.height, margin, reserveTop);
  const useLandscape = orientation === "landscape" || (orientation === "auto" && sl > sp);
  const { width, height } = useLandscape ? landscape : portrait;
  const scale = useLandscape ? sl : sp;
  return {
    width,
    height,
    scale,
    offsetX: (width - w * scale) / 2,
    offsetY: (height - reserveTop - h * scale) / 2,
  };
}
