"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginAction, type FormState } from "../auth-actions";
import ui from "@/components/ui.module.css";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  const [forgot, setForgot] = useState(false);

  return (
    <form action={formAction} className={ui.form}>
      <div className={ui.field}>
        <label htmlFor="username" className={ui.label}>
          Username
        </label>
        <input
          id="username"
          name="username"
          className={ui.input}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.values?.username}
        />
      </div>

      <div className={ui.field}>
        <label htmlFor="password" className={ui.label}>
          Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            className={ui.input}
            style={{ paddingRight: "5rem" }}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className={ui.textLink}
            style={{ position: "absolute", right: "0.25rem", top: "0.375rem", color: "#5e5470", textDecoration: "none" }}
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
          >
            {showPassword ? "HIDE" : "SHOW"}
          </button>
        </div>
      </div>

      {state.error && (
        <p className={ui.error} role="alert">
          {state.error}
        </p>
      )}

      <button type="submit" className={`${ui.button} ${ui.primary}`} disabled={pending}>
        {pending ? "CHECKING…" : "LET'S GO"}
      </button>

      <button type="button" className={ui.textLink} onClick={() => setForgot((v) => !v)} aria-expanded={forgot}>
        Forgot your password?
      </button>
      {forgot && (
        <p className={ui.notice}>
          Ask the commissioner to reset it. They&apos;ll give you a temporary password, and you can change it in
          your profile.
        </p>
      )}

      <p className={ui.lead} style={{ textAlign: "center" }}>
        Got an invite code? <Link href="/join">Join the club</Link>
      </p>
    </form>
  );
}
