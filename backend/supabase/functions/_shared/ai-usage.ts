// Writes one row per Claude call to ai_usage, so the web app can show what the AI costs
// and how much the AI copies of photos save. Logging never fails the request.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

type Usage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export async function logUsage(
  supabase: SupabaseClient,
  fn: string,
  response: { model: string; usage?: Usage | null },
  images: { tokens: number; fullTokens: number }[] = [],
): Promise<void> {
  const u = response.usage ?? {};
  const sum = (k: "tokens" | "fullTokens") => images.reduce((a, i) => a + i[k], 0);
  const { error } = await supabase.from("ai_usage").insert({
    function: fn,
    model: response.model,
    input_tokens: u.input_tokens ?? 0,
    output_tokens: u.output_tokens ?? 0,
    cache_read_tokens: u.cache_read_input_tokens ?? 0,
    cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    image_count: images.length,
    image_tokens: images.length ? sum("tokens") : null,
    image_tokens_full: images.length ? sum("fullTokens") : null,
  });
  if (error) console.error("ai_usage insert failed", error.message);
}
