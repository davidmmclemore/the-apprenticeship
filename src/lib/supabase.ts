import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser client for the `apprenticeship` schema. Only the project URL and
 * the publishable (anon) key are ever used here; row access is decided by
 * RLS on the signed-in user's JWT. No privileged key exists in this app.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && key);

let client: SupabaseClient<any, "apprenticeship"> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any

export function supabase(): SupabaseClient<any, "apprenticeship"> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  if (!client) {
    client = createClient(url, key, {
      db: { schema: "apprenticeship" },
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** A readable message for a PostgREST / Auth error, without leaking internals. */
export function describeError(error: unknown): string {
  if (!error) return "Something went wrong.";
  const e = error as { message?: string; code?: string; status?: number };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return "You appear to be offline. This change needs a connection.";
  }
  if (e.message && /Failed to fetch|NetworkError|Load failed/i.test(e.message)) {
    return "Couldn’t reach the server. Check your connection and try again.";
  }
  switch (e.code) {
    case "23505":
      return "That already exists.";
    case "23503":
      return "That change would break a connection to another record, so it wasn’t made.";
    case "23514":
      return "Some details aren’t valid yet. Please check the form.";
    case "42501":
      return "You don’t have access to that.";
    case "PGRST106":
    case "PGRST205":
      return "The app’s database schema isn’t reachable yet. See README: expose the ‘apprenticeship’ schema in the Supabase Data API settings.";
    case "PGRST301":
    case "PGRST303":
      return "Your session has expired. Please sign in again.";
  }
  return e.message || "Something went wrong.";
}
