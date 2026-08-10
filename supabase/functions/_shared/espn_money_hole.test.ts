import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { holePointsFromRel, MONEY_HOLE_MULTIPLIER } from "./espn.ts";

describe("money hole scoring", () => {
  it("maps DK Classic hole values from relative-to-par", () => {
    assert.equal(holePointsFromRel(-3), 13);
    assert.equal(holePointsFromRel(-2), 8);
    assert.equal(holePointsFromRel(-1), 3);
    assert.equal(holePointsFromRel(0), 0.5);
    assert.equal(holePointsFromRel(1), -0.5);
    assert.equal(holePointsFromRel(2), -1);
    assert.equal(holePointsFromRel(5), -1);
  });

  it("applies ×3 as base tally + (multiplier − 1) extra", () => {
    const birdie = holePointsFromRel(-1);
    const extra = birdie * (MONEY_HOLE_MULTIPLIER - 1);
    assert.equal(birdie + extra, 9);

    const bogey = holePointsFromRel(1);
    const bogeyExtra = bogey * (MONEY_HOLE_MULTIPLIER - 1);
    assert.equal(bogey + bogeyExtra, -1.5);
  });
});
