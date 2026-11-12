/**
 * Line styles for crease-pattern drawings, one table shared by the viewer and the exporters.
 *
 * Render end of the data flow. Colour alone fails in a black-and-white print, so mountain and
 * valley differ in dash pattern too (the origami diagram convention: valley dashed, mountain
 * dash-dot). Dash lengths are multiples of the stroke width, so a pattern scales with its line.
 */

import type { Assignment } from "../../core/pattern/crease-pattern";

/** How one assignment is drawn. */
export type CreaseStyle = {
  /** 0xRRGGBB. */
  readonly color: number;
  /** Stroke width as a multiple of the base stroke width. */
  readonly width: number;
  /** Alternating dash and gap lengths in stroke widths; empty is solid. A zero dash is a dot. */
  readonly dash: readonly number[];
};

/** Mountain red dash-dot, valley blue dashed, border dark solid, flat thin grey, unassigned dotted. */
export const CREASE_STYLE: Readonly<Record<Assignment, CreaseStyle>> = {
  M: { color: 0xd62828, width: 1, dash: [8, 3, 1, 3] },
  V: { color: 0x1d4ed8, width: 1, dash: [6, 4] },
  B: { color: 0x333333, width: 1.5, dash: [] },
  F: { color: 0x9ca3af, width: 0.5, dash: [] },
  U: { color: 0x6b7280, width: 1, dash: [0, 3] },
};

/** Drawing order for exports: faint lines first so the folds lie on top. */
export const DRAW_ORDER: readonly Assignment[] = ["F", "U", "B", "V", "M"];

/** `#rrggbb` for a 0xRRGGBB colour. */
export function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
