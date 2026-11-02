// Shared helpers for Edge Functions that send photos from the plant-photos bucket to Claude.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const BUCKET = "plant-photos";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // API limit per image
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Downloads an image and returns it base64-encoded for a Claude image block. */
export async function loadImage(supabase: SupabaseClient, path: string): Promise<{ media_type: MediaType; data: string }> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !blob) throw new HttpError(404, `image not found: ${path}`);
  if (!MEDIA_TYPES.includes(blob.type as MediaType)) {
    throw new HttpError(415, `unsupported image type ${blob.type}; use JPEG, PNG or WebP`);
  }
  if (blob.size > MAX_IMAGE_BYTES) throw new HttpError(413, "image larger than 5 MB; resize before upload");
  return { media_type: blob.type as MediaType, data: toBase64(new Uint8Array(await blob.arrayBuffer())) };
}

const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** Downloads a room scan (floor plan exported by a LiDAR app) as a Claude image or document block. */
export async function loadScan(
  supabase: SupabaseClient,
  path: string,
): Promise<
  | { type: "image"; source: { type: "base64"; media_type: MediaType; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
> {
  const { data: blob, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !blob) throw new HttpError(404, `scan not found: ${path}`);
  if (blob.type === "application/pdf") {
    if (blob.size > MAX_PDF_BYTES) throw new HttpError(413, "PDF larger than 20 MB");
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: toBase64(new Uint8Array(await blob.arrayBuffer())) } };
  }
  return { type: "image", source: { type: "base64", ...(await loadImage(supabase, path)) } };
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** True if the request carries a signed-in user's token (the platform JWT check also admits the anon key). */
export async function isSignedIn(supabase: SupabaseClient, req: Request): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer /i, "");
  if (!token) return false;
  const { data } = await supabase.auth.getUser(token);
  return Boolean(data?.user);
}
