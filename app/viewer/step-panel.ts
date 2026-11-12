/**
 * What the folding-step panel shows for a step, as plain data: the pure half of the panel.
 *
 * Viewer end of the data flow, between `core/pattern/fold-steps.ts` (the step list) and `main.ts`
 * (the DOM). Pulling it out of `main.ts` lets the clamping, the button states and the fold target
 * be tested without a browser, and gives the `?step=` deep link a parser to match.
 */

import type { FoldStep } from "../../core/pattern/fold-steps";
import { stepCaption, stepHighlight, type StepHighlight } from "../render/step-text";

/** The caption shown before the first Next. */
export const NO_STEP_CAPTION = "Press Next for the folding steps.";

/** Everything the panel needs to show one step. */
export type StepView = {
  /** The step shown, clamped to [-1, count - 1]; -1 is "before the first step". */
  readonly index: number;
  readonly caption: string;
  /** The grid or creases to draw over the sheet, or null for none. */
  readonly highlight: StepHighlight | null;
  readonly prevDisabled: boolean;
  readonly nextDisabled: boolean;
  /** The fold slider's target: 100 for the collapse, else 0 (the pre-crease steps are flat). */
  readonly foldPercent: 0 | 100;
};

/**
 * Works out the panel for a step index.
 *
 * @param steps - the pattern's folding steps
 * @param index - the wanted step; -1 for none. Anything outside [-1, steps.length - 1] is clamped
 * @returns the clamped index with its caption, highlight, button states and fold target
 */
export function stepView(steps: readonly FoldStep[], index: number): StepView {
  const clamped = Math.max(-1, Math.min(steps.length - 1, index));
  const step = steps[clamped];
  const highlight = step ? stepHighlight(step) : null;
  return {
    index: clamped,
    caption: step ? stepCaption(steps, clamped) : NO_STEP_CAPTION,
    highlight,
    prevDisabled: clamped < 0,
    nextDisabled: clamped >= steps.length - 1,
    foldPercent: step?.kind === "collapse" ? 100 : 0,
  };
}

/**
 * Reads the `?step=` URL parameter. It is one-based, like the "Step 3 of 12" captions.
 *
 * @param raw - the parameter's text, or null when absent
 * @param count - how many steps there are
 * @returns the zero-based index; -1 (no step) when absent, empty, not an integer, or below 1 or
 *   when there are no steps; a number past the end gives the last step
 */
export function parseStepParam(raw: string | null, count: number): number {
  if (raw === null || raw.trim() === "") return -1;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return -1;
  return Math.min(n, count) - 1;
}
