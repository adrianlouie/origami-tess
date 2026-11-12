/**
 * Minimal PDF writer for a crease pattern: one page, stroked lines only.
 *
 * Render end of the data flow, after `core/pattern/lines.ts` (maximal lines, so a dash pattern runs
 * the length of a ray) and `page.ts` (fit to the page). A crease pattern is coloured, dashed lines,
 * so the file needs no fonts, images or compression, and no dates or ids, which keeps the bytes
 * deterministic and snapshot-testable.
 *
 * File structure: ISO 32000-1 §7.5 (header, body of numbered objects, cross-reference table with
 * the byte offset of each object, trailer, `startxref`, `%%EOF`). Line dash pattern `[array] phase
 * d`: §8.4.3.6; round line cap `1 J`: §8.4.3.3. Every character written is ASCII, so a string's
 * length is its byte length and the offsets can be counted on the string.
 */

import { creaseLines } from "../../core/pattern/lines";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { toCartesian } from "../render/cartesian";
import { CREASE_STYLE, DRAW_ORDER } from "../render/crease-style";
import { checkOptions } from "../render/svg";
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

/** A number for the content stream: three decimals (1/1000 point), no exponent, no "-0". */
function num(n: number): string {
  const s = n.toFixed(3);
  return Number(s) === 0 ? "0.000" : s;
}

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
    if (mine.length === 0) return [];
    const style = CREASE_STYLE[a];
    const rgb = [(style.color >> 16) & 255, (style.color >> 8) & 255, style.color & 255]
      .map((c) => num(c / 255))
      .join(" ");
    const dash = style.dash.map((d) => num(d * strokeWidth)).join(" ");
    return [
      "q",
      `${rgb} RG`,
      `${num(style.width * strokeWidth)} w`,
      `${style.dash.includes(0) ? 1 : 0} J`,
      `[${dash}] 0 d`,
      ...mine.map((l) => `${place(l.from)} m ${place(l.to)} l S`),
      "Q",
    ];
  });
  const stream = content.length ? `${content.join("\n")}\n` : "";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(fit.width)} ${num(fit.height)}] /Resources << >> /Contents 4 0 R >>`,
    // `Length` counts the stream's bytes between the "stream" and "endstream" keywords' newlines.
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];

  let file = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = file.length;
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = file.length;
  const pad = (n: number) => String(n).padStart(10, "0");
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  file += offsets.map((o) => `${pad(o)} 00000 n \n`).join("");
  file += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(file);
}
