import { describe, expect, it } from "vitest";
import { foldSteps } from "../../core/pattern/fold-steps";
import { creaseLines } from "../../core/pattern/lines";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { CREASE_STYLE, FAINT_STYLE } from "./crease-style";
import { patternLayers, stepLayers } from "./step-drawing";
import { HIGHLIGHT_GRID_COLOR } from "./step-text";

describe.each(GADGET_ENTRIES)("step drawing: $name", ({ build }) => {
  const cp = build();
  const steps = foldSteps(cp);
  const lines = creaseLines(cp);

  it("draws the full pattern in the shared styles, folds last", () => {
    const layers = patternLayers(cp);
    expect(layers.flatMap((l) => l.lines)).toHaveLength(lines.length);
    for (const l of layers) expect(l.style).toBe(CREASE_STYLE[l.assignment!]);
    const order = layers.map((l) => l.assignment);
    expect(order.indexOf("M")).toBeGreaterThan(order.indexOf("V"));
  });

  it("draws the faint pattern, the paper edge, then the step on top, for every step", () => {
    steps.forEach((step, i) => {
      const layers = stepLayers(cp, steps, i);
      if (step.kind === "collapse") {
        expect(layers).toEqual(patternLayers(cp));
        return;
      }
      const top = layers.at(-1)!;
      expect(top.style.color).toBe(
        step.kind === "grid" ? HIGHLIGHT_GRID_COLOR : CREASE_STYLE[step.assignment].color,
      );
      expect(top.lines).toHaveLength(
        step.kind === "grid" ? step.segments.length : step.lines.length,
      );
      const faint = layers.filter((l) => l.style === FAINT_STYLE).flatMap((l) => l.lines);
      expect(faint).toHaveLength(lines.filter((l) => l.assignment !== "B").length);
      const edge = layers.filter((l) => l.assignment === "B").flatMap((l) => l.lines);
      expect(edge).toHaveLength(lines.filter((l) => l.assignment === "B").length);
      expect(layers.indexOf(top)).toBe(layers.length - 1);
      expect(layers.findIndex((l) => l.style === FAINT_STYLE)).toBeLessThan(layers.indexOf(top));
    });
  });
});
