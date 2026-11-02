import { createBrowserClient } from "@supabase/ssr";

/** Browser client, used for direct uploads to Supabase Storage. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
