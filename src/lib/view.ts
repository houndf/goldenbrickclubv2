import "server-only";
import { cookies } from "next/headers";
import type { Player } from "./player";

export const VIEW_COOKIE = "gbc_view";

/**
 * Extra Gold members see only fellow gold members unless they've switched
 * the brick to silver. Everyone else always sees everyone.
 */
export async function isGoldView(player: Player): Promise<boolean> {
  if (!player.extraGold) return false;
  const store = await cookies();
  return store.get(VIEW_COOKIE)?.value !== "all";
}
