/**
 * Captions and highlight geometry for the folding steps (`core/pattern/fold-steps.ts`).
 *
 * Sits at the render end of the data flow: it turns an exact `FoldStep` into the sentence a folder
 * reads and the float segments the viewer draws over the paper. Pure, so Node tests cover it.
 * Lattice points become floats only through `toCartesian`.
 */

import type { Eisenstein } from "../../core/lattice/eisenstein";
import type { FoldStep } from "../../core/pattern/fold-steps";
import { toCartesian, type Point } from "./cartesian";
import { CREASE_STYLE } from "./crease-style";

/** Highlight colour of a grid step: neither the mountain red nor the valley blue. */
export const HIGHLIGHT_GRID_COLOR = 0xe69f00;

/** The segments to draw for a step and the colour to draw them in. */
export type StepHighlight = {
  readonly segments: readonly (readonly [Point, Point])[];
  /** 0xRRGGBB. */
  readonly color: number;
};

/** Direction of a step in whole degrees, 0 to 179. */
function degrees(direction: Eisenstein): number {
  const { x, y } = toCartesian(direction);
  const deg = Math.round((Math.atan2(y, x) * 180) / Math.PI);
  return ((deg % 180) + 180) % 180;
}

const lines = (n: number) => `${n} ${n === 1 ? "line" : "lines"}`;

/**
 * Writes the instruction for one step.
 *
 * The first mountain step also says to turn the paper over: the mountains are valley folds made
 * from the back, so every valley is done first and the paper is turned once.
 *
 * @param steps - the whole sequence from `foldSteps`
 * @param index - which step, 0-based
 * @param medium - `viewer` (the collapse mentions the slider) or `print` (it does not)
 * @returns a sentence starting "Step i of n: "
 * @throws RangeError if `index` is outside the list
 */
export function stepCaption(
  steps: readonly FoldStep[],
  index: number,
  medium: "viewer" | "print" = "viewer",
): string {
  const step = steps[index];
  if (!step) throw new RangeError(`Step ${index} is outside 0..${steps.length - 1}`);
  const head = `Step ${index + 1} of ${steps.length}: `;
  switch (step.kind) {
    case "grid":
      return `${head}pre-crease the grid. Fold and unfold ${lines(step.segments.length)} at ${degrees(step.direction)}°, both ways.`;
    case "crease": {
      const where = `${lines(step.lines.length)} at ${degrees(step.direction)}°`;
      if (step.assignment === "V") return `${head}Valley-fold and unfold ${where}.`;
      const firstMountain = steps.findIndex((s) => s.kind === "crease" && s.assignment === "M");
      const turn = index === firstMountain ? "Turn the paper over. " : "";
      return `${head}${turn}Fold and unfold ${where} (mountains from the front).`;
    }
    case "collapse":
      return `${head}Collapse. Push the pattern together so every crease folds at once.${medium === "viewer" ? " Drag the slider to watch." : ""}`;
  }
}

/**
 * Gives the segments to highlight for a step.
 *
 * @param step - a step from `foldSteps`
 * @returns the segments with a colour, or null for the collapse (nothing to point at)
 */
export function stepHighlight(step: FoldStep): StepHighlight | null {
  switch (step.kind) {
    case "grid":
      return {
        segments: step.segments.map((s) => [toCartesian(s.from), toCartesian(s.to)] as const),
        color: HIGHLIGHT_GRID_COLOR,
      };
    case "crease":
      return {
        segments: step.lines.map((l) => [toCartesian(l.from), toCartesian(l.to)] as const),
        color: CREASE_STYLE[step.assignment].color,
      };
    case "collapse":
      return null;
  }
}
