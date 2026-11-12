import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { toCartesian } from "../../core/simulate/embed";
import { foldSteps } from "../../core/pattern/fold-steps";
import { CREASE_STYLE } from "../render/crease-style";
import { HIGHLIGHT_GRID_COLOR, stepCaption, stepHighlight } from "./step-text";

const steps = foldSteps(starTwist(1, "full"));

describe("stepCaption", () => {
  it("numbers every step out of the total and ends with the collapse", () => {
    steps.forEach((_, i) => {
      expect(stepCaption(steps, i).startsWith(`Step ${i + 1} of ${steps.length}: `)).toBe(true);
    });
    expect(stepCaption(steps, steps.length - 1)).toMatch(/Collapse/);
  });

  it("names the three grid directions 0, 60 and 120 degrees", () => {
    const text = [0, 1, 2].map((i) => stepCaption(steps, i));
    expect(text[0]).toMatch(/at 0°/);
    expect(text[1]).toMatch(/at 60°/);
    expect(text[2]).toMatch(/at 120°/);
  });

  it("tells the folder to turn the paper over exactly once, at the first mountain step", () => {
    const captions = steps.map((_, i) => stepCaption(steps, i));
    const turns = captions.flatMap((c, i) => (/Turn the paper over/.test(c) ? [i] : []));
    const firstMountain = steps.findIndex((s) => s.kind === "crease" && s.assignment === "M");
    expect(turns).toEqual([firstMountain]);
  });

  it("says valley for V steps and mountain for M steps, with the line count", () => {
    steps.forEach((s, i) => {
      if (s.kind !== "crease") return;
      const text = stepCaption(steps, i);
      expect(text).toMatch(s.assignment === "V" ? /Valley-fold/ : /mountains from the front/);
      expect(text).toContain(`${s.lines.length} ${s.lines.length === 1 ? "line" : "lines"}`);
    });
  });

  it("rejects an index outside the list", () => {
    expect(() => stepCaption(steps, -1)).toThrow(RangeError);
    expect(() => stepCaption(steps, steps.length)).toThrow(RangeError);
  });
});

describe("stepHighlight", () => {
  const cp = hexagonTwist(1, 2);
  const list = foldSteps(cp);

  it("is nothing for the collapse", () => {
    expect(stepHighlight(list.at(-1)!)).toBeNull();
  });

  it("gives a grid step's segments in Cartesian floats and a neutral colour", () => {
    const step = list[0]!;
    if (step.kind !== "grid") throw new Error("expected a grid step");
    const h = stepHighlight(step)!;
    expect(h.color).toBe(HIGHLIGHT_GRID_COLOR);
    expect(h.segments).toHaveLength(step.segments.length);
    const first = step.segments[0]!;
    expect(h.segments[0]).toEqual([toCartesian(first.from), toCartesian(first.to)]);
  });

  it("colours a crease step by its assignment", () => {
    for (const step of list) {
      if (step.kind !== "crease") continue;
      expect(stepHighlight(step)!.color).toBe(CREASE_STYLE[step.assignment].color);
      expect(stepHighlight(step)!.segments).toHaveLength(step.lines.length);
    }
  });
});
