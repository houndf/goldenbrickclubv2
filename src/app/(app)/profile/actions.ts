"use server";

import { passwordProblem } from "@/lib/accounts";
import { requirePlayer } from "@/lib/player";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PasswordState {
  error?: string;
  done?: boolean;
}

export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  await requirePlayer();
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "That's already your password." };
    return { error: "Couldn't change your password. Try again." };
  }
  return { done: true };
}
