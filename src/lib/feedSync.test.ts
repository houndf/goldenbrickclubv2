import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./supabase/server", () => ({ createSupabaseAdminClient: () => null }));
vi.mock("./tournamentCrown", () => ({ crownOracle: async () => null }));

const { segmentFor } = await import("./feedSync");

describe("season segments", () => {
  it("splits 34 matches into 9, 9, 8, 8", () => {
    const sizes = [0, 0, 0, 0];
    for (let i = 0; i < 34; i++) sizes[segmentFor(i, 34) - 1]++;
    expect(sizes).toEqual([9, 9, 8, 8]);
  });
  it("handles an even split", () => {
    expect([0, 3, 4, 15].map((i) => segmentFor(i, 16))).toEqual([1, 1, 2, 4]);
  });
});
