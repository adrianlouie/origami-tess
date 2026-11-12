/**
 * SVG renderer for a flat crease pattern with mountain/valley line styles.
 *
 * Render end of the data flow, reading a `CreasePattern` after `core/pattern/lines.ts` has merged
 * its unit edges into maximal lines, so a dash pattern runs along a whole ray and is not restarted
 * at every lattice point. One `<g>` per assignment carries the style from `crease-style.ts`; exact
 * lattice points become floats only through `toPixels`.
 */

import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { creaseLines } from "../../core/pattern/lines";
import { CREASE_STYLE, DRAW_ORDER, hexColor } from "./crease-style";
import { checkOptions, fmt, svgDocument, toPixels, type SvgOptions } from "./svg";

/**
 * Renders a crease pattern as an SVG document string.
 *
 * Each assignment present is a `<g data-assignment="A">` holding one `<line data-edges="…">` per
 * maximal straight crease (the edge indices it covers). Groups come in {@link DRAW_ORDER}.
 * Stroke width and dash lengths are the style's multiples of `opts.strokeWidth`, in pixels. A
 * dotted style (zero-length dashes) gets round caps so the dots show.
 *
 * @param cp - the crease pattern
 * @param opts - scale, base stroke width and margin
 * @returns a standalone SVG document
 * @throws RangeError for a non-positive size or negative margin
 */
export function creasePatternToSvg(cp: CreasePattern, opts: SvgOptions = {}): string {
  const { scale = 100, strokeWidth = 1, margin = 0.5 } = opts;
  checkOptions({ scale, strokeWidth }, (n) => n > 0, "a positive finite number");
  checkOptions({ margin }, (n) => n >= 0, "a non-negative finite number");

  const lines = creaseLines(cp);
  const body = DRAW_ORDER.flatMap((a) => {
    const mine = lines.filter((l) => l.assignment === a);
    if (mine.length === 0) return [];
    const style = CREASE_STYLE[a];
    const dash = style.dash.length
      ? ` stroke-dasharray="${style.dash.map((d) => fmt(d * strokeWidth)).join(" ")}"`
      : "";
    const cap = style.dash.includes(0) ? "round" : "butt";
    return [
      `<g data-assignment="${a}" stroke="${hexColor(style.color)}" stroke-width="${fmt(style.width * strokeWidth)}"${dash} stroke-linecap="${cap}" fill="none">`,
      ...mine.map((l) => {
        const p = toPixels(l.from, scale);
        const q = toPixels(l.to, scale);
        return `  <line data-edges="${l.edges.join(" ")}" x1="${fmt(p.x)}" y1="${fmt(p.y)}" x2="${fmt(q.x)}" y2="${fmt(q.y)}"/>`;
      }),
      `</g>`,
    ];
  });

  return svgDocument(
    cp.vertices.map((v) => toPixels(v, scale)),
    body,
    margin,
    scale,
  );
}
