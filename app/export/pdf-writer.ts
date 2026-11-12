/**
 * Low-level PDF writing shared by the one-page crease-pattern export and the step-by-step export.
 *
 * Render end of the data flow. It knows the file structure (header, numbered objects, page tree,
 * cross-reference table, trailer) and the few content-stream operators the exports use, but nothing
 * about origami. Everything written is ASCII, so a string's length is its byte length and the xref
 * offsets can be counted on the string; `pdfDocument` checks that and throws rather than write a
 * file whose offsets would be wrong.
 *
 * File structure: ISO 32000-1 §7.5 (header, body, cross-reference table, trailer, `startxref`,
 * `%%EOF`); page tree §7.7; literal strings §7.3.4.2; text operators `BT Tf Td Tj ET` §9.4; line
 * dash `d` §8.4.3.6 and cap `J` §8.4.3.3. Text uses the base-14 font Helvetica (§9.6.2.2) with
 * WinAnsiEncoding, so no font file is embedded; its advance widths are from Adobe's Helvetica AFM.
 */

import type { Eisenstein } from "../../core/lattice/eisenstein";
import type { CreaseStyle } from "../render/crease-style";

/** A page: its size in points and its content stream (operators, ASCII). */
export type PdfPage = {
  readonly width: number;
  readonly height: number;
  readonly content: string;
};

/** The largest magnitude `num` writes; `toFixed` switches to exponent form at 1e21. */
const MAX_NUMBER = 1e15;

/**
 * A number for a content stream: three decimals (1/1000 point), no exponent, no "-0".
 *
 * @throws RangeError for NaN, an infinity or a magnitude of 1e15 or more, none of which a PDF
 *   content stream can hold (and far beyond any page)
 */
export function num(n: number): string {
  if (!Number.isFinite(n) || Math.abs(n) >= MAX_NUMBER) {
    throw new RangeError(`Cannot write ${n} in a PDF content stream`);
  }
  const s = n.toFixed(3);
  return Number(s) === 0 ? "0.000" : s;
}

/**
 * Helvetica advance widths in 1/1000 em for the printable ASCII characters 32 to 126, in order.
 * Source: the Adobe Helvetica AFM (Core 14 fonts), WinAnsi glyph for each code.
 */
const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
] as const;

/** The degree sign: WinAnsi code 0xB0 (octal 260), advance 400. Captions give angles in degrees. */
const DEGREE = { char: "°", octal: "\\260", width: 400 } as const;

/** Advance width of one character in 1/1000 em, or throws if the font table lacks it. */
function advance(ch: string): number {
  if (ch === DEGREE.char) return DEGREE.width;
  const code = ch.charCodeAt(0);
  const w = code >= 32 && code <= 126 ? ASCII_WIDTHS[code - 32] : undefined;
  if (w === undefined) throw new RangeError(`No Helvetica width for ${JSON.stringify(ch)}`);
  return w;
}

/**
 * Width of a text line in Helvetica.
 *
 * @param text - printable ASCII and "°"
 * @param size - font size in points
 * @returns the width in points (sum of AFM advances × size / 1000; no kerning)
 * @throws RangeError for a character outside that set
 */
export function textWidth(text: string, size: number): number {
  let sum = 0;
  for (const ch of text) sum += advance(ch);
  return (sum * size) / 1000;
}

/**
 * Greedy word wrap: each line takes words while it still fits.
 *
 * @param text - words separated by spaces
 * @param size - font size in points
 * @param maxWidth - the widest a line may be, in points; a word wider than this gets its own line
 * @returns the lines; their words joined by single spaces rebuild the text; none for empty text
 */
export function wrapText(text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && textWidth(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "") lines.push(line);
  return lines;
}

/**
 * A PDF literal string, `(…)`, with `\`, `(` and `)` escaped and "°" written as the octal escape
 * for its WinAnsi code (ISO 32000-1 §7.3.4.2), so the file stays ASCII.
 *
 * @throws RangeError for a character that is neither printable ASCII nor "°"
 */
export function pdfString(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === DEGREE.char) out += DEGREE.octal;
    else if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (ch >= " " && ch <= "~") out += ch;
    else throw new RangeError(`Cannot write ${JSON.stringify(ch)} in an ASCII PDF string`);
  }
  return `(${out})`;
}

/** One line of text in the document font (`/F1`), baseline origin at (x, y), in page points. */
export function textBlock(text: string, x: number, y: number, size: number): string {
  return [
    "BT",
    `/F1 ${num(size)} Tf`,
    `${num(x)} ${num(y)} Td`,
    `${pdfString(text)} Tj`,
    "ET",
  ].join("\n");
}

/**
 * Strokes straight lines in one style: colour, width, cap and dash, then one `m`/`l` per line.
 *
 * @param style - from `CREASE_STYLE` or a faint style
 * @param strokeWidth - base stroke width in points; the style's width and dashes scale with it
 * @param lines - the lines to stroke
 * @param place - maps a lattice point to "x y" in page points
 * @returns a `q … Q` block (round caps when the style has a zero-length dash, so dots show)
 */
export function strokeBlock(
  style: CreaseStyle,
  strokeWidth: number,
  lines: readonly { readonly from: Eisenstein; readonly to: Eisenstein }[],
  place: (z: Eisenstein) => string,
): string {
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
    ...lines.map((l) => `${place(l.from)} m ${place(l.to)} l S`),
    "Q",
  ].join("\n");
}

/**
 * Assembles pages into a PDF 1.4 file.
 *
 * Object numbers: 1 catalog, 2 page tree, then a page and its content stream for each page
 * (3 and 4, 5 and 6, …), then the font if asked. Keeping the font last means a one-page file with
 * no font has the same bytes as before the writer was shared. No dates or ids, so the bytes are
 * deterministic.
 *
 * @param pages - at least one
 * @param opts - `font`: add Helvetica as `/F1` for `textBlock`
 * @returns the file bytes; a content stream that does not end on a newline gets one, so the last
 *   operator never runs into `endstream`
 * @throws RangeError for no pages, any non-ASCII character in a content stream, or text that
 *   uses `/F1` when `font` is off (the page would name a font it does not have)
 */
export function pdfDocument(
  pages: readonly PdfPage[],
  opts: { readonly font?: boolean } = {},
): Uint8Array<ArrayBuffer> {
  if (pages.length === 0) throw new RangeError("A PDF needs at least one page");
  const fontObj = 3 + 2 * pages.length;
  const resources = opts.font ? `<< /Font << /F1 ${fontObj} 0 R >> >>` : "<< >>";
  const kids = pages.map((_, i) => `${3 + 2 * i} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`,
    ...pages.flatMap((p, i) => {
      if (/[^\n -~]/.test(p.content)) throw new RangeError("Page content must be ASCII");
      if (!opts.font && /\/F1 /.test(p.content)) {
        throw new RangeError("Page content uses the font /F1 but the document has none");
      }
      const content = p.content === "" || p.content.endsWith("\n") ? p.content : `${p.content}\n`;
      return [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.width)} ${num(p.height)}] /Resources ${resources} /Contents ${4 + 2 * i} 0 R >>`,
        // `Length` counts the stream's bytes between the "stream" and "endstream" keywords' newlines.
        `<< /Length ${content.length} >>\nstream\n${content}endstream`,
      ];
    }),
    ...(opts.font
      ? ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
      : []),
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
