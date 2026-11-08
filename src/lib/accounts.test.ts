import { describe, expect, it } from "vitest";
import {
  initialsFor,
  normalizeInviteCode,
  passwordProblem,
  temporaryPassword,
  usernameProblem,
} from "./accounts";

describe("account rules", () => {
  it("accepts the 2026 usernames", () => {
    for (const name of [
      "Jimmi G",
      "Gregersen",
      "McGoalface",
      "RunBrooksRun",
      "stripedmoustache",
      "Unbeatable Peach",
      "SpecialHydration",
      "PorkchopTom",
      "JakeWurst",
    ]) {
      expect(usernameProblem(name), name).toBeNull();
    }
  });

  it("rejects bad usernames", () => {
    expect(usernameProblem("x")).not.toBeNull();
    expect(usernameProblem(" spaced")).not.toBeNull();
    expect(usernameProblem("bang!")).not.toBeNull();
    expect(usernameProblem("a".repeat(25))).not.toBeNull();
  });

  it("checks password length and confirmation", () => {
    expect(passwordProblem("short")).not.toBeNull();
    expect(passwordProblem("longenough", "different")).toBe("The passwords don't match.");
    expect(passwordProblem("longenough", "longenough")).toBeNull();
  });

  it("normalizes invite codes however they're typed", () => {
    expect(normalizeInviteCode("k7qx m2pa")).toBe("K7QX-M2PA");
    expect(normalizeInviteCode("K7QX-M2PA")).toBe("K7QX-M2PA");
  });

  it("makes initials", () => {
    expect(initialsFor("Unbeatable Peach")).toBe("UP");
    expect(initialsFor("stripedmoustache")).toBe("ST");
    expect(initialsFor("Jimmi G")).toBe("JG");
  });

  it("makes temporary passwords that pass the password rule", () => {
    for (let i = 0; i < 50; i++) expect(passwordProblem(temporaryPassword())).toBeNull();
  });
});
