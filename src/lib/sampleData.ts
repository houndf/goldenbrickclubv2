/**
 * Placeholder data for screens that aren't wired to Supabase or the stats
 * API yet. Everything here gets replaced by real queries.
 */
export type FormResult = "W" | "D" | "L";

export const sampleClubRecord = {
  team: "Atlanta United",
  season: 2026,
  conferenceRank: "6th in East",
  wins: 14,
  draws: 8,
  losses: 12,
  points: 50,
  /** Newest first. */
  lastFive: ["W", "D", "D", "L", "W"] as FormResult[],
};

export const sampleSeasonTop3 = {
  played: 24,
  total: 34,
  leaders: [
    { name: "Marco", points: 41, color: "#D7263D" },
    { name: "Dana", points: 39, color: "#F5C230" },
    { name: "stripedmoustache", points: 37, color: "#3DD6C4" },
  ],
};
