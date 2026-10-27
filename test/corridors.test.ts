import { describe, expect, it } from "vitest";
import {
  CHAIN_PROFILES, CORRIDORS, DIRECTIONS, corridorList, corridorProfile, corridorWindows, getCorridor, isCorridorId, parseCorridorId, recommendWindows,
} from "../src/index.js";
import type { CorridorId } from "../src/index.js";

const ids: CorridorId[] = ["robinhood-chain", "base", "ethereum"];

describe("corridors", () => {
  it("lists Robinhood Chain first, Base second and Ethereum third", () => {
    expect(corridorList().map((c) => c.id)).toEqual(["robinhood-chain", "base", "ethereum"]);
    expect(corridorList().map((c) => c.order)).toEqual([1, 2, 3]);
  });
  it("every corridor is a direct ETH<>XMR pair with both directions", () => {
    for (const id of ids) {
      const c = getCorridor(id);
      expect(c.pair).toBe("ETH<>XMR");
      expect(c.routing).toBe("direct");
      expect([...c.directions]).toEqual([...DIRECTIONS]);
    }
  });
  it("each corridor uses exactly one existing chain profile", () => {
    for (const id of ids) expect(CHAIN_PROFILES[CORRIDORS[id].profile]).toBeDefined();
    expect(corridorProfile("ethereum").dataFeeCountsAgainstGasLimit).toBe(false);
    expect(corridorProfile("robinhood-chain").dataFeeCountsAgainstGasLimit).toBe(true);
    expect(corridorProfile("base").dataFeeCountsAgainstGasLimit).toBe(true);
  });
  it("window recommendations are valid for every corridor", () => {
    for (const id of ids) {
      const w = corridorWindows(id);
      expect(w.report.valid).toBe(true);
      expect(w.t1Sec).toBeGreaterThan(w.t0Sec);
      expect(w.latestSafeClaimSec).toBeLessThan(w.t1Sec);
    }
  });
  it("matches the plain window calculator for the same profile", () => {
    expect(corridorWindows("base")).toEqual(recommendWindows({ profile: CHAIN_PROFILES["layer-2-rollup"] }));
  });
  it("passes overrides through to the calculator", () => {
    const a = corridorWindows("ethereum", { detectionPollSec: 30 });
    const b = corridorWindows("ethereum", { detectionPollSec: 90 });
    expect(b.t0Sec).toBeGreaterThan(a.t0Sec);
  });
  it("rejects bad overrides", () => {
    expect(() => corridorWindows("base", { congestionFactor: 0.5 })).toThrow(RangeError);
  });
  it("isCorridorId accepts only the three corridor ids", () => {
    for (const id of ids) expect(isCorridorId(id)).toBe(true);
    for (const bad of ["Base", "arbitrum", "", "toString", "__proto__", 3, null, undefined]) expect(isCorridorId(bad)).toBe(false);
  });
  it("parseCorridorId returns a known id and names the valid ids on failure", () => {
    expect(parseCorridorId("base")).toBe("base");
    expect(() => parseCorridorId("optimism")).toThrow(RangeError);
    expect(() => parseCorridorId("optimism")).toThrow(/robinhood-chain, base, ethereum/);
  });
  it("lookups reject an unknown id instead of returning undefined", () => {
    expect(() => getCorridor("constructor" as CorridorId)).toThrow(RangeError);
    expect(() => corridorProfile("nope" as CorridorId)).toThrow(RangeError);
    expect(() => corridorWindows("nope" as CorridorId)).toThrow(RangeError);
  });
});
