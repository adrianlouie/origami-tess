import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { foldSteps } from "../../core/pattern/fold-steps";
import { stepCaption, stepHighlight } from "../render/step-text";
import { GADGET_ENTRIES } from "./gadgets";
import { parseStepParam, stepView } from "./step-panel";

const lists = GADGET_ENTRIES.map((e) => ({ name: e.name, steps: foldSteps(e.build()) }));

describe("stepView", () => {
  it.each(lists)("follows the step list of $name at every index", ({ steps }) => {
    const n = steps.length;
    for (let i = -1; i < n; i++) {
      const v = stepView(steps, i);
      expect(v.index).toBe(i);
      expect(v.prevDisabled).toBe(i < 0);
      expect(v.nextDisabled).toBe(i >= n - 1);
      expect(v.caption).toBe(i < 0 ? "Press Next for the folding steps." : stepCaption(steps, i));
      expect(v.highlight).toEqual(i < 0 ? null : stepHighlight(steps[i]!));
      // The collapse is the only step that folds; every other step shows the flat sheet.
      expect(v.foldPercent).toBe(steps[i]?.kind === "collapse" ? 100 : 0);
    }
  });

  it("clamps an index outside the list (property)", () => {
    const { steps } = lists[0]!;
    fc.assert(
      fc.property(fc.integer({ min: -1000, max: 1000 }), (i) => {
        const v = stepView(steps, i);
        expect(v.index).toBe(Math.max(-1, Math.min(steps.length - 1, i)));
      }),
    );
  });

  it("has no step to show for an empty list", () => {
    const v = stepView([], 5);
    expect(v.index).toBe(-1);
    expect(v.prevDisabled).toBe(true);
    expect(v.nextDisabled).toBe(true);
    expect(v.highlight).toBeNull();
    expect(v.foldPercent).toBe(0);
  });
});

describe("parseStepParam", () => {
  it("is -1 (no step) when absent, empty or not an integer", () => {
    for (const raw of [null, "", "  ", "abc", "1.5", "NaN", "Infinity", "0", "-3"]) {
      expect(parseStepParam(raw, 10)).toBe(-1);
    }
  });

  it("is one-based like the captions: ?step=1 is the first step", () => {
    expect(parseStepParam("1", 10)).toBe(0);
    expect(parseStepParam("10", 10)).toBe(9);
  });

  it("clamps a number past the end to the last step, and is -1 for an empty list", () => {
    expect(parseStepParam("11", 10)).toBe(9);
    expect(parseStepParam("1e9", 10)).toBe(9);
    expect(parseStepParam("5", 0)).toBe(-1);
  });

  it("always gives an index stepView leaves unchanged (property)", () => {
    const { steps } = lists[0]!;
    fc.assert(
      fc.property(fc.oneof(fc.integer(), fc.string(), fc.constant(null)), (raw) => {
        const i = parseStepParam(typeof raw === "number" ? String(raw) : raw, steps.length);
        expect(i).toBeGreaterThanOrEqual(-1);
        expect(i).toBeLessThan(steps.length);
        expect(stepView(steps, i).index).toBe(i);
      }),
    );
  });
});
