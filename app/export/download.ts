/**
 * Export-as-file helper for the viewer: the bytes, file name and MIME type of a crease-pattern
 * export. Pure (no DOM), so it is tested in Node; `main.ts` only wraps the result in a `Blob`
 * and a temporary download link.
 */

import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { creasePatternToSvg } from "../render/crease-svg";
import { foldStepsToSvg } from "../render/steps-svg";
import type { PageName } from "./page";
import { creasePatternToPdf } from "./pdf";
import { foldStepsToPdf } from "./steps-pdf";

/** A file ready to hand to the browser. */
export type ExportedFile = {
  readonly filename: string;
  readonly mime: string;
  readonly data: string | Uint8Array<ArrayBuffer>;
};

/** File formats the viewer can export. */
export type ExportKind = "svg" | "pdf" | "steps-pdf" | "steps-svg";

/** A lower-case, dash-separated file stem from a display name; "pattern" if nothing is left. */
export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s === "" ? "pattern" : s;
}

/**
 * Renders the flat crease pattern as a downloadable file.
 *
 * @param cp - the pattern, always exported flat whatever the fold slider says
 * @param name - display name, used for the file name
 * @param kind - `svg` or `pdf` (the flat pattern), or `steps-pdf` or `steps-svg` (the folding steps)
 * @param page - page size for a PDF (ignored for SVG, which has no page)
 * @throws RangeError for an unknown kind
 */
export function exportFile(
  cp: CreasePattern,
  name: string,
  kind: ExportKind,
  page: PageName,
): ExportedFile {
  const stem = `${slug(name)}-cp`;
  if (kind === "svg") {
    return { filename: `${stem}.svg`, mime: "image/svg+xml", data: creasePatternToSvg(cp) };
  }
  if (kind === "pdf") {
    return {
      filename: `${stem}.pdf`,
      mime: "application/pdf",
      data: creasePatternToPdf(cp, { page }),
    };
  }
  if (kind === "steps-pdf") {
    return {
      filename: `${slug(name)}-steps.pdf`,
      mime: "application/pdf",
      data: foldStepsToPdf(cp, name, { page }),
    };
  }
  if (kind === "steps-svg") {
    return {
      filename: `${slug(name)}-steps.svg`,
      mime: "image/svg+xml",
      data: foldStepsToSvg(cp, name),
    };
  }
  throw new RangeError(`Unknown export kind ${String(kind)}`);
}
