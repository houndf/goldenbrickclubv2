import { revalidatePath, revalidateTag } from "next/cache";
import { connection } from "next/server";
import { SEASON_TAG } from "@/lib/archiveData";
import { syncFeed } from "@/lib/feedSync";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { TOURNAMENTS_TAG } from "@/lib/tournamentData";

/**
 * Daily job (Vercel Cron, see vercel.json).
 *
 * 1. Keeps the database awake: Supabase's free plan pauses a project after a
 *    week without activity, which would take the app offline in the offseason.
 * 2. Imports the latest results file even if nobody has opened the app since
 *    the last deploy.
 *
 * If CRON_SECRET is set in Vercel, only Vercel's scheduler (which sends it) can
 * run this. Either way it can only read the database and import the results
 * file that ships with the app.
 */
export async function GET(request: Request) {
  await connection(); // run on every call, never at build time
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ ok: false, notes: ["not configured"] });
  }

  try {
    const db = createSupabaseAdminClient();
    const { error: pingError } = await db.from("league_settings").select("feed_version").eq("id", true).single();
    if (pingError) throw pingError;

    const result = await syncFeed();
    if (result.applied) {
      revalidateTag(TOURNAMENTS_TAG, { expire: 0 });
      revalidateTag(SEASON_TAG, { expire: 0 });
      revalidatePath("/", "layout");
    }
    return Response.json({ ok: true, feed: { applied: result.applied, version: result.version } });
  } catch (err) {
    console.error("daily cron failed", err);
    return Response.json({ ok: false, error: "cron failed" }, { status: 500 });
  }
}
