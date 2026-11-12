/**
 * Minimal PDF writer for a crease pattern: one page, stroked lines only.
 *
 * Render end of the data flow, after `core/pattern/lines.ts` (maximal lines, so a dash pattern runs
 * the length of a ray) and `page.ts` (fit to the page). A crease pattern is coloured, dashed lines,
 * so the file needs no fonts, images or compression, and no dates or ids, which keeps the bytes
 * deterministic and snapshot-testable.
 *
 * The file structure and the stroke operators live in `pdf-writer.ts`, which the step-by-step
 * export shares; this module decides what to draw and where.
 */

import { creaseLines } from "../../core/pattern/lines";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { toCartesian } from "../render/cartesian";
import { CREASE_STYLE, DRAW_ORDER } from "../render/crease-style";
import { checkOptions } from "../render/svg";
import { num, pdfDocument, strokeBlock } from "./pdf-writer";
import { extentOf, fitToPage, type Orientation, type PageName } from "./page";

/** Options for {@link creasePatternToPdf}. */
export type PdfOptions = {
  /** Page size. Default A4. */
  readonly page?: PageName;
  /** Margin on every side, in points. Default 36 (half an inch). */
  readonly margin?: number;
  /** Base stroke width in points; each style scales it. Default 1. */
  readonly strokeWidth?: number;
  /** Default `auto`: the orientation that makes the drawing larger. */
  readonly orientation?: Orientation;
};

/**
 * Renders a crease pattern as a one-page PDF with mountain/valley line styles.
 *
 * The drawing is fitted to the page with one uniform scale and centred ({@link fitToPage}). One
 * block per assignment present, in the shared draw order (flat and unassigned first, folds last):
 * stroke colour, width, dash array and cap from `CREASE_STYLE`, then one `m`/`l` segment per
 * maximal straight crease. PDF's y axis points up like the lattice's, so there is no y flip.
 *
 * @param cp - the crease pattern
 * @param opts - page, margin, base stroke width and orientation
 * @returns the bytes of the PDF file
 * @throws RangeError for a non-positive stroke width, or a bad page, margin or orientation
 */
export function creasePatternToPdf(
  cp: CreasePattern,
  opts: PdfOptions = {},
): Uint8Array<ArrayBuffer> {
  const { page = "a4", margin = 36, strokeWidth = 1, orientation = "auto" } = opts;
  checkOptions({ strokeWidth }, (n) => n > 0, "a positive finite number");
  const points = cp.vertices.map(toCartesian);
  const extent = extentOf(points);
  const fit = fitToPage(extent, page, margin, orientation);
  const place = (z: (typeof cp.vertices)[number]) => {
    const p = toCartesian(z);
    return `${num((p.x - extent.minX) * fit.scale + fit.offsetX)} ${num((p.y - extent.minY) * fit.scale + fit.offsetY)}`;
  };

  const lines = creaseLines(cp);
  const content = DRAW_ORDER.flatMap((a) => {
    const mine = lines.filter((l) => l.assignment === a);
    return mine.length === 0 ? [] : [strokeBlock(CREASE_STYLE[a], strokeWidth, mine, place)];
  });
  const stream = content.length ? `${content.join("\n")}\n` : "";
  return pdfDocument([{ width: fit.width, height: fit.height, content: stream }]);
}
