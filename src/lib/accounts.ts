/**
 * Account rules shared by the join form, the server actions and the tests.
 * They mirror the database checks so players see a friendly message first.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,22}[A-Za-z0-9]$/;
export const PASSWORD_MIN_LENGTH = 8;
export const INVITE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export function normalizeInviteCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return compact.length === 8 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function usernameProblem(username: string): string | null {
  if (username.length < 2) return "Usernames need at least 2 characters.";
  if (username.length > 24) return "Usernames can be up to 24 characters.";
  if (!USERNAME_PATTERN.test(username)) {
    return "Use letters, numbers, spaces, dots, dashes or underscores, starting and ending with a letter or number.";
  }
  return null;
}

export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Passwords need at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 72) return "Passwords can be up to 72 characters.";
  if (confirm !== undefined && password !== confirm) return "The passwords don't match.";
  return null;
}

/** "Unbeatable Peach" → "UP", "stripedmoustache" → "ST", "Jimmi G" → "JG". */
export function initialsFor(username: string): string {
  const words = username
    .split(/[\s_.-]+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter(Boolean);
  const raw = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "??").slice(0, 2);
  return raw.toUpperCase();
}

/**
 * Supabase sign-in needs an email address, but players don't give one.
 * Each account gets a private placeholder address that never receives mail.
 */
export function placeholderEmail(id: string): string {
  const domain = process.env.PLAYER_EMAIL_DOMAIN || "players.goldenbrickclub.invalid";
  return `${id}@${domain}`;
}

/** A temporary password the commissioner can read out: e.g. "brick-7KQ2-goal". */
export function temporaryPassword(): string {
  const words = ["brick", "goal", "five", "atl", "gold", "spoon", "pitch", "kick", "derby", "volley"];
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const pick = (n: number) => words[bytes[n] % words.length];
  const middle = Array.from(bytes.slice(2, 6), (b) => alphabet[b % alphabet.length]).join("");
  return `${pick(0)}-${middle}-${pick(1)}`;
}
