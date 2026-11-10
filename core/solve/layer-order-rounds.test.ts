import { describe, expect, it, vi } from "vitest";

// A solver that always answers with the same cyclic model, so only the round limit can stop the loop.
const calls = vi.hoisted(() => ({ n: 0, acyclicFrom: Infinity }));
vi.mock("./solver", () => ({
  solveClauses: () => {
    calls.n++;
    if (calls.n >= calls.acyclicFrom) return [true, true, true];
    return [true, false, true]; // 0 > 1, 2 > 0, 1 > 2: a ring
  },
}));

import { MAX_CYCLE_ROUNDS, stackFaces } from "./layer-order";

describe("stackFaces: the round limit", () => {
  const formula = {
    variableCount: 3,
    pairs: [
      [0, 1],
      [0, 2],
      [1, 2],
    ] as const,
    clauses: [],
  };

  it("still checks the model found after the last blocking clause", () => {
    calls.n = 0;
    calls.acyclicFrom = 1 + MAX_CYCLE_ROUNDS; // the solve that follows the last allowed clause
    expect(stackFaces(3, formula)).toEqual({ above: [true, true, true], order: [0, 1, 2] });
    calls.acyclicFrom = Infinity;
  });

  it("adds at most MAX_CYCLE_ROUNDS blocking clauses, so solves at most one more time than that", () => {
    calls.n = 0;
    const result = stackFaces(3, formula);
    expect(result).toEqual({ above: [true, false, true], order: null });
    // One solve for the first model and one after each blocking clause.
    expect(calls.n).toBe(1 + MAX_CYCLE_ROUNDS);
  });
});
