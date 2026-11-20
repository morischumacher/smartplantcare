// AI copies of photos: a smaller JPEG next to each photo that the Edge Functions send to Claude.
// Claude bills one visual token per 28 × 28 px patch, so a 1600 px photo costs ~2,500 tokens and the
// AI copy at most AI_COPY_BUDGET. Keep in sync with backend/supabase/functions/_shared/tokens.ts.

export const AI_COPY_BUDGET = 1200;
const PATCH = 28;

const tokensAt = (w: number, h: number) => Math.ceil(w / PATCH) * Math.ceil(h / PATCH);

/** Largest size with the same aspect ratio (never upscaled) that costs at most `budget` visual tokens. */
export function fitToBudget(width: number, height: number, budget = AI_COPY_BUDGET): { width: number; height: number } {
  if (tokensAt(width, height) <= budget) return { width, height };
  let s = Math.sqrt((budget * PATCH * PATCH) / (width * height));
  while (s > 0 && tokensAt(Math.floor(width * s), Math.floor(height * s)) > budget) s *= 0.99;
  return { width: Math.max(1, Math.floor(width * s)), height: Math.max(1, Math.floor(height * s)) };
}

/** `a/b.jpg` → `a/b.ai.jpg` */
export function aiCopyPath(path: string): string {
  return path.replace(/\.(jpe?g|png|webp)$/i, "") + ".ai.jpg";
}

/** The given storage paths plus their AI copies, for deleting both at once. */
export function withAiCopies(paths: string[]): string[] {
  return paths.flatMap((p) => (p.endsWith(".ai.jpg") || p.endsWith(".pdf") ? [p] : [p, aiCopyPath(p)]));
}
