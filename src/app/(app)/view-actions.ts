"use server";

import { cookies } from "next/headers";
import { requirePlayer } from "@/lib/player";
import { VIEW_COOKIE } from "@/lib/view";

/** Flip between the gold-only view and everyone. Only Extra Gold members can. */
export async function setGoldViewAction(goldOnly: boolean): Promise<void> {
  const player = await requirePlayer();
  if (!player.extraGold) return;
  const store = await cookies();
  store.set(VIEW_COOKIE, goldOnly ? "gold" : "all", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
