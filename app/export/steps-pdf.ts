/**
 * Step-by-step folding instructions as a PDF: a cover page, then one page per folding step.
 *
 * Render end of the data flow, after `core/pattern/fold-steps.ts` (the exact step list),
 * `app/render/step-drawing.ts` (what each step draws), `page.ts` (fit to the page) and
 * `pdf-writer.ts` (file structure, Helvetica text). One placement serves every page, so the paper
 * does not jump from page to page, and a caption band is kept free along the top of each.
 * Everything written is ASCII; the degree sign goes out as a WinAnsi octal escape.
 */

import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { foldSteps } from "../../core/pattern/fold-steps";
import { toCartesian } from "../render/cartesian";
import type { Layer } from "../render/step-drawing";
import { patternLayers, stepLayers } from "../render/step-drawing";
import { stepCaption } from "../render/step-text";
import { checkOptions } from "../render/svg";
import { extentOf, fitToPage } from "./page";
import type { PdfOptions } from "./pdf";
import { num, pdfDocument, strokeBlock, textBlock, wrapText } from "./pdf-writer";

/** Caption type size and line spacing, in points. */
const BODY = 11;
const LEADING = 14;
/** Cover title size and line spacing, in points. */
const TITLE = 16;
const TITLE_LEADING = 20;

/** Colour key printed on the cover. */
const LEGEND = "Crease pattern. Mountain folds are red dash-dot, valley folds are blue dashed.";

/**
 * Renders the folding steps of a crease pattern as a multi-page PDF.
 *
 * Page 1 is the whole pattern in its mountain/valley styles under the name; page i + 1 is step i:
 * its caption (`stepCaption`, print wording) over the pattern drawn faint with that step's lines
 * in full colour (`stepLayers`). The orientation is chosen once from the pattern's size so every
 * page matches, and the caption band is as tall as the longest text on any page.
 *
 * @param cp - the crease pattern
 * @param name - shown as the cover title; printable ASCII
 * @param opts - page, margin, base stroke width and orientation, as for `creasePatternToPdf`
 * @returns the bytes of the PDF file
 * @throws RangeError for a bad option, or a name with a character Helvetica's table lacks
 */
export function foldStepsToPdf(
  cp: CreasePattern,
  name: string,
  opts: PdfOptions = {},
): Uint8Array<ArrayBuffer> {
  const { page = "a4", margin = 36, strokeWidth = 1, orientation = "auto" } = opts;
  checkOptions({ strokeWidth }, (n) => n > 0, "a positive finite number");
  const extent = extentOf(cp.vertices.map(toCartesian));
  // The page shape depends on the pattern alone; the band depends on the shape, so fix the shape first.
  const shape = fitToPage(extent, page, margin, orientation);
  const fixed = shape.width > shape.height ? "landscape" : "portrait";
  const textWidth = shape.width - 2 * margin;

  const steps = foldSteps(cp);
  const titleLines = wrapText(name, TITLE, textWidth);
  const legendLines = wrapText(LEGEND, BODY, textWidth);
  const captions = steps.map((_, i) => wrapText(stepCaption(steps, i, "print"), BODY, textWidth));
  const coverBand = titleLines.length * TITLE_LEADING + legendLines.length * LEADING + 6;
  const captionBand = Math.max(...captions.map((c) => c.length), 1) * LEADING + 6;
  const band = Math.max(coverBand, captionBand);

  const fit = fitToPage(extent, page, margin, fixed, band);
  const place = (z: Parameters<typeof toCartesian>[0]) => {
    const p = toCartesian(z);
    return `${num((p.x - extent.minX) * fit.scale + fit.offsetX)} ${num((p.y - extent.minY) * fit.scale + fit.offsetY)}`;
  };
  const top = fit.height - margin;
  const draw = (layers: readonly Layer[]) =>
    layers.map((l) => strokeBlock(l.style, strokeWidth, l.lines, place));
  const text = (lines: readonly string[], size: number, leading: number, from: number) =>
    lines.map((line, i) => textBlock(line, margin, from - size - i * leading, size));

  const make = (words: readonly string[], layers: readonly Layer[]) => ({
    width: fit.width,
    height: fit.height,
    content: `${[...words, ...draw(layers)].join("\n")}\n`,
  });

  const cover = make(
    [
      ...text(titleLines, TITLE, TITLE_LEADING, top),
      ...text(legendLines, BODY, LEADING, top - titleLines.length * TITLE_LEADING),
    ],
    patternLayers(cp),
  );
  const stepPages = steps.map((_, i) =>
    make(text(captions[i]!, BODY, LEADING, top), stepLayers(cp, steps, i)),
  );
  return pdfDocument([cover, ...stepPages], { font: true });
}
