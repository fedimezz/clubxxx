import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

describe("mapWithConcurrency", () => {
  it("never runs more than `limit` jobs at once and keeps input order", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 2;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(out.map((o) => (o.status === "fulfilled" ? o.value : null))).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });
  it("a failing job does not stop the others", async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    });
    expect(out.map((o) => o.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });
  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
