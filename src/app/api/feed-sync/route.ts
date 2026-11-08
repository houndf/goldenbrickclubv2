import { revalidatePath, revalidateTag } from "next/cache";
import { SEASON_TAG } from "@/lib/archiveData";
import { syncFeed } from "@/lib/feedSync";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { TOURNAMENTS_TAG } from "@/lib/tournamentData";

/**
 * Imports the bundled data/feed.json if it's newer than the database.
 * Pinged by visitors' browsers (once per tab) after a deploy; it only does
 * work once per feed version and only ever reads the file shipped with the app.
 */
export async function POST() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ applied: false, notes: ["not configured"] });
  }
  try {
    const result = await syncFeed();
    if (result.applied) {
      revalidateTag(TOURNAMENTS_TAG, { expire: 0 });
      revalidateTag(SEASON_TAG, { expire: 0 });
      revalidatePath("/", "layout");
    }
    return Response.json({ applied: result.applied, version: result.version });
  } catch (err) {
    console.error("feed sync failed", err);
    return Response.json({ applied: false, error: "sync failed" }, { status: 500 });
  }
}
