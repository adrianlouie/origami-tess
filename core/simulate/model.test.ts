import { describe, expect, it } from "vitest";
import { GADGET_ENTRIES } from "../../app/viewer/gadgets";
import { faceAdjacency } from "../pattern/faces";
import { barHingeModel } from "./model";

describe.each(GADGET_ENTRIES)("barHingeModel: $name", ({ build }) => {
  const cp = build();
  const model = barHingeModel(cp);

  it("gives every crease-pattern vertex a bar, so no node floats free", () => {
    const used = new Set(model.bars.flatMap((b) => [b.a, b.b]));
    expect(used.size).toBe(cp.vertices.length);
    expect(Array.from(model.nodeStiffness).every((k) => k > 0)).toBe(true);
  });

  it("has one bar per distinct triangle edge, each used by at most two triangles", () => {
    const uses = new Map<string, number>();
    for (const [a, b, c] of model.triangles) {
      for (const [u, v] of [
        [a, b],
        [b, c],
        [c, a],
      ] as const) {
        const key = `${Math.min(u, v)}|${Math.max(u, v)}`;
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    expect(model.bars).toHaveLength(uses.size);
    expect(Math.max(...uses.values())).toBeLessThanOrEqual(2);
    expect(model.hinges).toHaveLength([...uses.values()].filter((n) => n === 2).length);
  });

  it("puts one hinge of the right sign on every M or V crease between two faces", () => {
    const between = new Set(faceAdjacency(cp).map((a) => a.edge));
    cp.edges.forEach((e, i) => {
      const hinges = model.hinges.filter((h) => h.edge === i);
      if (!between.has(i)) {
        expect(hinges, `edge ${i} is on the border`).toHaveLength(0);
      } else {
        expect(hinges, `edge ${i}`).toHaveLength(1);
        const sign = e.assignment === "V" ? 1 : e.assignment === "M" ? -1 : 0;
        expect(hinges[0]!.sign, `edge ${i}`).toBe(sign);
      }
    });
  });

  it("makes diagonals facet hinges and keeps every rest length positive", () => {
    expect(model.hinges.filter((h) => h.edge === -1).every((h) => h.sign === 0)).toBe(true);
    expect(model.bars.every((b) => b.rest > 0 && b.k > 0)).toBe(true);
  });

  it("pins the three corners of one triangle and has a positive time step", () => {
    expect(model.pinned).toHaveLength(3);
    expect(
      model.triangles.some((t) => model.pinned.every((p) => (t as readonly number[]).includes(p))),
    ).toBe(true);
    expect(model.dt).toBeGreaterThan(0);
    expect(model.damping).toBeGreaterThan(0);
  });

  it("starts flat: every node at z = 0", () => {
    for (let n = 0; n < cp.vertices.length; n++) expect(model.rest[3 * n + 2]).toBe(0);
  });
});
