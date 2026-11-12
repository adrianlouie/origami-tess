/**
 * Step-by-step folding instructions as one SVG sheet of numbered panels.
 *
 * Render end of the data flow, after `core/pattern/fold-steps.ts` and `step-drawing.ts` (what each
 * step draws, shared with the PDF export). Each panel holds a bold step number, the caption in
 * wrapped text and the pattern drawn faint with that step's lines in full colour. Panels sit in
 * rows of `columns`. Caption wrapping uses the same Helvetica widths as the PDF writer, so the
 * text fits the panel in any viewer that substitutes Helvetica or Arial. Exact lattice points
 * become floats only through `toPixels`.
 */

import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { foldSteps } from "../../core/pattern/fold-steps";
import { wrapText } from "../export/pdf-writer";
import { FAINT_STYLE, hexColor } from "./crease-style";
import { stepLayers, type Layer } from "./step-drawing";
import { stepCaption } from "./step-text";
import { checkOptions, fmt, svgDocument, toPixels, type SvgOptions } from "./svg";

/** Options for {@link foldStepsToSvg}. */
export type StepsSvgOptions = SvgOptions & {
  /** Panels per row. A positive integer. Default 3. */
  readonly columns?: number;
};

/** Caption type size and line spacing, in pixels. */
const FONT = 12;
const LEADING = 16;
/** Width kept for the step number at the left of its caption, in pixels. */
const NUMBER_WIDTH = 28;
/** Height of the sheet's title row, in pixels. */
const TITLE_HEIGHT = 36;
const FAMILY = "Helvetica, Arial, sans-serif";

/**
 * Escapes the characters that are special in XML text and attribute values.
 *
 * @throws RangeError for a control character other than tab, newline and carriage return, which
 *   XML 1.0 (§2.2 `Char`) does not allow even escaped, so the sheet would not parse
 */
function xml(text: string): string {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const legal =
      c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c !== 0xfffe && c !== 0xffff);
    if (!legal) throw new RangeError("Text contains a character XML 1.0 cannot hold");
  }
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders the folding steps of a crease pattern as one SVG sheet.
 *
 * Each panel is `<g data-step="i" transform="translate(x y)">`. Inside it, one
 * `<g data-layer="…">` per layer of `stepLayers` (faint, border, then the step on top) in the
 * styles of `crease-style.ts` (dashes scale with `strokeWidth`), the number as
 * `<text data-role="number">` and the caption as `<tspan>` lines. `scale` is pixels per lattice
 * unit (default 40, smaller than a single-pattern export because many panels share the sheet);
 * `margin` is the panel padding in lattice units.
 *
 * @param cp - the crease pattern
 * @param name - the sheet's title; XML-escaped
 * @param opts - scale, stroke width, margin and columns
 * @returns a standalone SVG document
 * @throws RangeError for a non-positive size, a negative margin, or `columns` that is not a
 *   positive integer
 */
export function foldStepsToSvg(
  cp: CreasePattern,
  name: string,
  opts: StepsSvgOptions = {},
): string {
  const { scale = 40, strokeWidth = 1, margin = 0.5, columns = 3 } = opts;
  checkOptions({ scale, strokeWidth }, (n) => n > 0, "a positive finite number");
  checkOptions({ margin }, (n) => n >= 0, "a non-negative finite number");
  checkOptions({ columns }, (n) => Number.isInteger(n) && n >= 1, "a positive integer");

  const steps = foldSteps(cp);
  const pad = margin * scale;
  const pixels = cp.vertices.map((v) => toPixels(v, scale));
  let lo = { x: Infinity, y: Infinity };
  let hi = { x: -Infinity, y: -Infinity };
  for (const p of pixels) {
    lo = { x: Math.min(lo.x, p.x), y: Math.min(lo.y, p.y) };
    hi = { x: Math.max(hi.x, p.x), y: Math.max(hi.y, p.y) };
  }
  if (pixels.length === 0) lo = hi = { x: 0, y: 0 };
  const drawW = hi.x - lo.x;
  const drawH = hi.y - lo.y;
  // A panel is at least wide enough for a readable caption, even for a tiny pattern.
  const inner = Math.max(drawW, 12 * FONT);
  const cellW = inner + 2 * pad;

  const captions = steps.map((_, i) =>
    wrapText(
      stepCaption(steps, i, "print").replace(/^Step \d+ of \d+: /, ""),
      FONT,
      inner - NUMBER_WIDTH,
    ),
  );
  const captionH = captions.reduce((m, c) => Math.max(m, c.length), 1) * LEADING + 8;
  const cellH = pad + captionH + drawH + pad;

  const layerElement = (layer: Layer, ox: number, oy: number): string[] => {
    const s = layer.style;
    const role = layer.style === FAINT_STYLE ? "faint" : (layer.assignment ?? "grid");
    const dash = s.dash.length
      ? ` stroke-dasharray="${s.dash.map((d) => fmt(d * strokeWidth)).join(" ")}"`
      : "";
    const cap = s.dash.includes(0) ? "round" : "butt";
    return [
      `  <g data-layer="${role}" stroke="${hexColor(s.color)}" stroke-width="${fmt(s.width * strokeWidth)}"${dash} stroke-linecap="${cap}" fill="none">`,
      ...layer.lines.map((l) => {
        const p = toPixels(l.from, scale);
        const q = toPixels(l.to, scale);
        return `    <line x1="${fmt(p.x + ox)}" y1="${fmt(p.y + oy)}" x2="${fmt(q.x + ox)}" y2="${fmt(q.y + oy)}"/>`;
      }),
      `  </g>`,
    ];
  };

  const panel = (i: number): string[] => {
    const tx = (i % columns) * cellW;
    const ty = TITLE_HEIGHT + Math.floor(i / columns) * cellH;
    // Local origin of the pattern: centred in the panel, below the caption.
    const ox = pad + (inner - drawW) / 2 - lo.x;
    const oy = pad + captionH - lo.y;
    return [
      `<g data-step="${i}" transform="translate(${fmt(tx)} ${fmt(ty)})">`,
      `  <rect width="${fmt(cellW)}" height="${fmt(cellH)}" fill="none" stroke="#9ca3af" stroke-width="0.5"/>`,
      `  <text data-role="number" x="${fmt(pad)}" y="${fmt(pad + FONT)}" font-family="${FAMILY}" font-size="${FONT + 4}" font-weight="bold">${i + 1}</text>`,
      `  <text data-role="caption" font-family="${FAMILY}" font-size="${FONT}">`,
      ...captions[i]!.map(
        (line, k) =>
          `    <tspan x="${fmt(pad + NUMBER_WIDTH)}" y="${fmt(pad + FONT + k * LEADING)}">${xml(line)}</tspan>`,
      ),
      `  </text>`,
      ...stepLayers(cp, steps, i).flatMap((l) => layerElement(l, ox, oy)),
      `</g>`,
    ];
  };

  const rows = Math.ceil(steps.length / columns);
  const width = Math.min(columns, Math.max(steps.length, 1)) * cellW;
  const height = TITLE_HEIGHT + rows * cellH;
  return svgDocument(
    [
      { x: 0, y: 0 },
      { x: width, y: height },
    ],
    [
      `<title>${xml(name)}</title>`,
      `<text data-role="title" x="${fmt(pad)}" y="${fmt(TITLE_HEIGHT - 12)}" font-family="${FAMILY}" font-size="20" font-weight="bold">${xml(name)}</text>`,
      ...steps.flatMap((_, i) => panel(i)),
    ],
    0,
    1,
  );
}
