import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/** Supabase client acting as the signed-in user (RLS applies). */
export async function createClient() {
  await connection(); // per-request data: keeps Cache Components from prerendering past this point
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; the proxy refreshes the session.
        }
      },
    },
  });
}

/** Calls one of our Edge Functions with the signed-in user's access token. */
export async function callFunction<T>(name: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("not signed in");
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: init.method ?? "POST",
    headers: {
      authorization: `Bearer ${data.session.access_token}`,
      apikey: SUPABASE_KEY,
      "content-type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `${name} failed (${res.status})`);
  return json as T;
}
