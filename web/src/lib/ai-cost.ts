// What the AI calls cost and what the token-saving measures save. Pure logic, tested in ai-cost.test.ts.

/** Claude API list prices in USD per million tokens (input, output, cache read, cache write 5 min). */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
};
const FALLBACK = PRICES["claude-opus-5-5"];

export type UsageRow = {
  created_at: string;
  function: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  image_count: number;
  image_tokens: number | null;
  image_tokens_full: number | null;
};

const priceOf = (model: string) => PRICES[model] ?? Object.entries(PRICES).find(([k]) => model.startsWith(k))?.[1] ?? FALLBACK;

export function costUsd(r: UsageRow): number {
  const p = priceOf(r.model);
  return (r.input_tokens * p.input + r.output_tokens * p.output + r.cache_read_tokens * p.cacheRead + r.cache_write_tokens * p.cacheWrite) / 1e6;
}

export const FUNCTION_LABELS: Record<string, string> = {
  "analyze-photo": "Foto-Check",
  "plant-species:identify": "Art erkennen",
  "plant-species:profile": "Artenprofil",
  "plan-room": "Raumplan",
};

export type Summary = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  byFunction: { fn: string; label: string; calls: number; avgInput: number; avgOutput: number; costUsd: number }[];
  /** Image tokens actually sent vs. what the full-size photos would have cost (only calls with images). */
  images: { sent: number; full: number; savedTokens: number; savedUsd: number; savedShare: number } | null;
};

export function summarize(rows: UsageRow[]): Summary {
  const groups = new Map<string, UsageRow[]>();
  for (const r of rows) groups.set(r.function, [...(groups.get(r.function) ?? []), r]);
  const byFunction = [...groups.entries()]
    .map(([fn, rs]) => ({
      fn,
      label: FUNCTION_LABELS[fn] ?? fn,
      calls: rs.length,
      avgInput: Math.round(rs.reduce((a, r) => a + r.input_tokens, 0) / rs.length),
      avgOutput: Math.round(rs.reduce((a, r) => a + r.output_tokens, 0) / rs.length),
      costUsd: rs.reduce((a, r) => a + costUsd(r), 0),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  const withImages = rows.filter((r) => r.image_tokens !== null && r.image_tokens_full !== null);
  const sent = withImages.reduce((a, r) => a + (r.image_tokens ?? 0), 0);
  const full = withImages.reduce((a, r) => a + (r.image_tokens_full ?? 0), 0);
  const savedUsd = withImages.reduce((a, r) => a + (((r.image_tokens_full ?? 0) - (r.image_tokens ?? 0)) * priceOf(r.model).input) / 1e6, 0);

  return {
    calls: rows.length,
    inputTokens: rows.reduce((a, r) => a + r.input_tokens, 0),
    outputTokens: rows.reduce((a, r) => a + r.output_tokens, 0),
    costUsd: rows.reduce((a, r) => a + costUsd(r), 0),
    byFunction,
    images: withImages.length ? { sent, full, savedTokens: full - sent, savedUsd, savedShare: full > 0 ? (full - sent) / full : 0 } : null,
  };
}

/** "0,042 $" for small amounts, "1,20 $" otherwise. */
export function usd(v: number): string {
  return `${v.toLocaleString("de-AT", { minimumFractionDigits: v < 1 ? 3 : 2, maximumFractionDigits: v < 1 ? 3 : 2 })} $`;
}
