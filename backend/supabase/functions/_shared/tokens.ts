// Token accounting for Claude calls. Pure logic (no Deno/Supabase imports) so `node --test` can run it.
//
// Claude bills an image by area: one visual token per 28 × 28 px patch. Opus 4.7 and later
// (including Opus 5.5) use the high-resolution tier, which downscales images above 2576 px on the
// long edge or 4784 visual tokens. A 1600 px phone photo therefore costs ~2,500 tokens. For the
// health check and species ID the app sends a smaller "AI copy" of each photo instead (≤ 1,200
// tokens, the size Anthropic's cost guide suggests as a safe default).
// https://platform.claude.com/docs/en/build-with-claude/vision

export const PATCH = 28;
export const HIGH_RES_TIER = { maxEdge: 2576, maxTokens: 4784 };
/** Visual-token budget for the AI copy of a photo. */
export const AI_COPY_BUDGET = 1200;
/** Long edge of the stored display photo (web/src/lib/image.ts resizes uploads to this). */
export const DISPLAY_EDGE = 1600;

const tokensAt = (w: number, h: number) => Math.ceil(w / PATCH) * Math.ceil(h / PATCH);

/** Visual tokens Claude bills for an image of this size, after its own downscaling. */
export function visualTokens(width: number, height: number, tier = HIGH_RES_TIER): number {
  if (width <= 0 || height <= 0) return 0;
  const edge = Math.max(width, height);
  const s = Math.min(1, tier.maxEdge / edge);
  const w = width * s;
  const h = height * s;
  if (tokensAt(w, h) <= tier.maxTokens) return tokensAt(w, h);
  return tokensAt(...fitDims(w, h, tier.maxTokens));
}

/** Largest size with the same aspect ratio (never upscaled) that costs at most `budget` visual tokens. */
export function fitToBudget(width: number, height: number, budget: number): { width: number; height: number } {
  const [w, h] = fitDims(width, height, budget);
  return { width: Math.max(1, Math.floor(w)), height: Math.max(1, Math.floor(h)) };
}

function fitDims(width: number, height: number, budget: number): [number, number] {
  if (tokensAt(width, height) <= budget) return [width, height];
  let s = Math.sqrt((budget * PATCH * PATCH) / (width * height));
  while (s > 0 && tokensAt(Math.floor(width * s), Math.floor(height * s)) > budget) s *= 0.99;
  return [width * s, height * s];
}

/** Object path of the AI copy that belongs to a stored photo: `a/b.jpg` → `a/b.ai.jpg`. */
export function aiCopyPath(path: string): string {
  return path.replace(/\.(jpe?g|png|webp)$/i, "") + ".ai.jpg";
}

/** Width and height from a JPEG or PNG header, or null if the format is not recognised. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  // PNG: signature, then IHDR with width and height as big-endian uint32.
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: v.getUint32(16), height: v.getUint32(20) };
  }
  // JPEG: walk the markers until a start-of-frame segment.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    i += 2 + len;
  }
  return null;
}

/** Tokens the display photo would have cost, estimated from its AI copy (same aspect ratio, long edge DISPLAY_EDGE). */
export function displayTokensFromCopy(width: number, height: number): number {
  const k = DISPLAY_EDGE / Math.max(width, height);
  return visualTokens(width * k, height * k);
}
