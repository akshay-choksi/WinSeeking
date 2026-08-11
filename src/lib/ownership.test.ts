import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOwnershipRoasts,
  computeOwnershipStats,
  isChalkPick,
  ownershipFraction,
  ownershipKind,
} from "./ownership.ts";

describe("ownershipKind", () => {
  it("hides badges below two lineups", () => {
    assert.equal(ownershipKind(1, 1), null);
    assert.equal(ownershipKind(0, 4), null);
  });

  it("labels unique, everyone, and shared", () => {
    assert.equal(ownershipKind(1, 4), "unique");
    assert.equal(ownershipKind(4, 4), "everyone");
    assert.equal(ownershipKind(2, 4), "shared");
    assert.equal(ownershipFraction(2, 4), "2/4");
  });
});

describe("isChalkPick", () => {
  it("treats everyone as chalk", () => {
    assert.equal(isChalkPick(2, 2), true);
    assert.equal(isChalkPick(1, 2), false);
  });

  it("uses majority when three or more lineups", () => {
    assert.equal(isChalkPick(2, 3), true);
    assert.equal(isChalkPick(1, 3), false);
    assert.equal(isChalkPick(2, 4), true);
    assert.equal(isChalkPick(1, 4), false);
  });
});

describe("computeOwnershipStats + buildOwnershipRoasts", () => {
  const lineups = [
    { id: "l1", user_id: "u1" },
    { id: "l2", user_id: "u2" },
    { id: "l3", user_id: "u3" },
  ];
  const entries = [
    { lineup_id: "l1", golfer_id: "g-scottie" },
    { lineup_id: "l2", golfer_id: "g-scottie" },
    { lineup_id: "l3", golfer_id: "g-scottie" },
    { lineup_id: "l1", golfer_id: "g-rory" },
    { lineup_id: "l2", golfer_id: "g-rory" },
    { lineup_id: "l1", golfer_id: "g-fade" },
    { lineup_id: "l3", golfer_id: "g-other" },
  ];

  it("counts picks across lineups", () => {
    const stats = computeOwnershipStats(lineups, entries);
    assert.equal(stats.lineupCount, 3);
    assert.equal(stats.pickCounts.get("g-scottie"), 3);
    assert.equal(stats.pickCounts.get("g-rory"), 2);
    assert.equal(stats.pickCounts.get("g-fade"), 1);
    assert.deepEqual(stats.ownersByGolfer.get("g-fade"), ["u1"]);
  });

  it("builds unique, everyone, and chalk-stack roasts", () => {
    const stats = computeOwnershipStats(lineups, entries);
    const roasts = buildOwnershipRoasts(stats, {
      golferName: (id) =>
        ({ "g-scottie": "Scheffler", "g-rory": "Rory", "g-fade": "Fade", "g-other": "Other" })[id] ??
        id,
      userName: (id) => ({ u1: "Akshay", u2: "Sam", u3: "Pat" })[id] ?? id,
    });

    const kinds = roasts.map((r) => r.kind);
    assert.ok(kinds.includes("unique"));
    assert.ok(kinds.includes("everyone"));
    assert.ok(kinds.includes("chalk-stack"));

    const unique = roasts.find((r) => r.kind === "unique" && r.golferId === "g-fade");
    assert.ok(unique && unique.kind === "unique");
    assert.equal(unique.text, "Only Akshay took Fade");

    const everyone = roasts.find((r) => r.kind === "everyone");
    assert.ok(everyone && everyone.kind === "everyone");
    assert.equal(everyone.text, "Everyone locked Scheffler");

    const stack = roasts.find((r) => r.kind === "chalk-stack");
    assert.ok(stack && stack.kind === "chalk-stack");
    assert.equal(stack.userId, "u1");
    assert.ok(stack.chalkCount >= 2);
  });

  it("returns empty when fewer than two lineups", () => {
    const stats = computeOwnershipStats([{ id: "l1", user_id: "u1" }], [
      { lineup_id: "l1", golfer_id: "g1" },
    ]);
    assert.deepEqual(
      buildOwnershipRoasts(stats, { golferName: () => "G", userName: () => "U" }),
      [],
    );
  });
});
