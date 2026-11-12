/**
 * What to draw for each folding step, as layers of styled lines.
 *
 * Render end of the data flow, between `core/pattern/fold-steps.ts` and the two step exporters
 * (`app/export/steps-pdf.ts`, `app/render/steps-svg.ts`), so the PDF and the SVG sheet show the
 * same picture. Exact lattice lines only; floats appear later, in each writer's own placement.
 */

import type { Eisenstein } from "../../core/lattice/eisenstein";
import type { Assignment, CreasePattern } from "../../core/pattern/crease-pattern";
import type { FoldStep } from "../../core/pattern/fold-steps";
import { creaseLines } from "../../core/pattern/lines";
import { CREASE_STYLE, DRAW_ORDER, FAINT_STYLE, type CreaseStyle } from "./crease-style";
import { HIGHLIGHT_GRID_COLOR } from "./step-text";

/** Straight lines drawn in one style. `assignment` is set when the style is that assignment's. */
export type Layer = {
  readonly style: CreaseStyle;
  readonly lines: readonly { readonly from: Eisenstein; readonly to: Eisenstein }[];
  readonly assignment?: Assignment;
};

/** Grid steps are solid in the viewer's highlight colour; their lines are not creases yet. */
const GRID_STYLE: CreaseStyle = { color: HIGHLIGHT_GRID_COLOR, width: 1, dash: [] };

/**
 * The whole pattern in its mountain/valley styles, in the shared draw order (folds last).
 *
 * @param cp - the crease pattern
 * @returns one layer per assignment present
 */
export function patternLayers(cp: CreasePattern): readonly Layer[] {
  const lines = creaseLines(cp);
  return DRAW_ORDER.flatMap((a) => {
    const mine = lines.filter((l) => l.assignment === a);
    return mine.length === 0 ? [] : [{ style: CREASE_STYLE[a], lines: mine, assignment: a }];
  });
}

/**
 * The picture for one step: every fold line faint, the paper edge in its own style so the sheet
 * is visible, then the step's own lines on top. A grid step is solid in the grid colour and a
 * crease step keeps its dash, so a black-and-white print still tells mountain from valley. The
 * collapse shows the whole finished pattern.
 *
 * @param cp - the crease pattern
 * @param steps - the sequence from `foldSteps(cp)`
 * @param index - which step, 0-based
 * @returns layers in drawing order, first drawn first
 * @throws RangeError if `index` is outside the list
 */
export function stepLayers(
  cp: CreasePattern,
  steps: readonly FoldStep[],
  index: number,
): readonly Layer[] {
  const step = steps[index];
  if (!step) throw new RangeError(`Step ${index} is outside 0..${steps.length - 1}`);
  if (step.kind === "collapse") return patternLayers(cp);
  const lines = creaseLines(cp);
  const faint = lines.filter((l) => l.assignment !== "B");
  const edge = lines.filter((l) => l.assignment === "B");
  const top: Layer =
    step.kind === "grid"
      ? { style: GRID_STYLE, lines: step.segments }
      : { style: CREASE_STYLE[step.assignment], lines: step.lines, assignment: step.assignment };
  return [
    ...(faint.length ? [{ style: FAINT_STYLE, lines: faint }] : []),
    ...(edge.length ? [{ style: CREASE_STYLE.B, lines: edge, assignment: "B" as const }] : []),
    top,
  ];
}
