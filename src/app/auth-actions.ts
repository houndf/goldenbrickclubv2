"use server";

import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  initialsFor,
  INVITE_PATTERN,
  normalizeInviteCode,
  normalizeUsername,
  passwordProblem,
  placeholderEmail,
  usernameProblem,
} from "@/lib/accounts";
import { SEASON_TAG } from "@/lib/archiveData";
import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  /** Echo the values back so the form keeps what was typed. */
  values?: Record<string, string>;
}

export interface InviteCheck {
  code?: string;
  valid?: boolean;
  legacyName?: string | null;
  error?: string;
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** Step 1 of joining: is this invite code usable? */
export async function checkInviteAction(_prev: InviteCheck, form: FormData): Promise<InviteCheck> {
  const code = normalizeInviteCode(text(form, "code"));
  if (!INVITE_PATTERN.test(code)) {
    return { code, valid: false, error: "Invite codes look like K7QX-M2PA." };
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("check_invite", { p_code: code });
  if (error) return { code, valid: false, error: "Couldn't check that code. Try again." };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.valid) {
    return { code, valid: false, error: "That code isn't valid or has already been used." };
  }
  return { code, valid: true, legacyName: row.legacy_name ?? null };
}

/** Step 2 of joining: create the account and sign in. */
export async function joinAction(_prev: FormState, form: FormData): Promise<FormState> {
  const code = normalizeInviteCode(text(form, "code"));
  const username = normalizeUsername(text(form, "username"));
  const password = text(form, "password");
  const confirm = text(form, "confirm");
  const values = { code, username };

  const problem = usernameProblem(username) ?? passwordProblem(password, confirm);
  if (problem) return { error: problem, values };
  if (!INVITE_PATTERN.test(code)) return { error: "That invite code isn't valid.", values };

  const admin = createSupabaseAdminClient();

  const { data: taken } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (taken) return { error: "That username is taken. Try another.", values };

  const email = placeholderEmail(randomUUID());
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created.user) {
    console.error("join: createUser failed", createError);
    return { error: "Couldn't create your account. Try again in a minute.", values };
  }

  const { error: claimError } = await admin.rpc("claim_invite", {
    p_code: code,
    p_user_id: created.user.id,
    p_username: username,
    p_initials: initialsFor(username),
  });
  if (claimError) {
    await admin.auth.admin.deleteUser(created.user.id);
    if (claimError.message.includes("invite_unavailable")) {
      return { error: "That code has already been used.", values };
    }
    if (claimError.code === "23505") return { error: "That username is taken. Try another.", values };
    console.error("join: claim_invite failed", claimError);
    return { error: "Couldn't create your account. Try again in a minute.", values };
  }

  // The new player (and any 2026 history they reconnected) shows up in the tables now.
  updateTag(SEASON_TAG);

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) redirect("/login");
  redirect("/home");
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(text(form, "username"));
  const password = text(form, "password");
  const values = { username };
  const wrong = { error: "Wrong username or password.", values };
  if (!username || !password) return wrong;

  // Usernames are case-insensitive (citext), so "jimmi g" finds "Jimmi G".
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (!profile) return wrong;

  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  const email = authUser?.user?.email;
  if (!email) return wrong;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return wrong;
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
