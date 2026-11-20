import { aiCopyPath, fitToBudget } from "@/lib/ai-copy";
import { createClient } from "@/lib/supabase/client";

/** Scales a photo down to at most `maxSide` px and re-encodes it as JPEG (keeps uploads and AI calls small). */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await decode(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const blob = await toJpeg(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), quality);
  bitmap.close();
  return blob;
}

function toJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden"))), "image/jpeg", quality),
  );
}

const looksHeic = (f: File) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/** Decodes a photo; iPhone HEIC files are converted in the browser (Chrome can't read them natively). */
async function decode(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (e) {
    const { heicTo, isHeic } = await import("heic-to/next"); // large WASM, only loaded when needed
    if (!looksHeic(file) && !(await isHeic(file))) {
      throw new Error("Dieses Bildformat kann der Browser nicht lesen – bitte als JPEG oder PNG hochladen.", { cause: e });
    }
    return heicTo({ blob: file, type: "bitmap", options: { imageOrientation: "from-image" } });
  }
}

/**
 * Resizes and uploads a photo to the plant-photos bucket under `folder/`; returns the object path.
 * With `aiCopy` (default) a second, smaller JPEG `<name>.ai.jpg` is stored next to it: the Edge
 * Functions send that one to Claude, which costs about half the image tokens of the 1600 px photo.
 */
export async function uploadPhoto(file: File, folder: string, { aiCopy = true } = {}): Promise<string> {
  const bitmap = await decode(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const blob = await toJpeg(bitmap, width, height, 0.85);
  const small = aiCopy ? fitToBudget(width, height) : null;
  const copy = small ? await toJpeg(bitmap, small.width, small.height, 0.85) : null;
  bitmap.close();

  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const storage = createClient().storage.from("plant-photos");
  const { error } = await storage.upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  // The AI copy is an optimisation: if it fails, the functions fall back to the photo itself.
  if (copy) await storage.upload(aiCopyPath(path), copy, { contentType: "image/jpeg" }).catch(() => undefined);
  return path;
}

/** Uploads a room scan: PDFs as they are, images scaled to 2400 px so dimensions stay legible. */
export async function uploadScan(file: File, folder: string): Promise<string> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf && file.size > 20 * 1024 * 1024) throw new Error("PDF ist größer als 20 MB.");
  const blob = isPdf ? file : await resizeImage(file, 2400, 0.9);
  const path = `${folder}/${crypto.randomUUID()}.${isPdf ? "pdf" : "jpg"}`;
  const { error } = await createClient()
    .storage.from("plant-photos")
    .upload(path, blob, { contentType: isPdf ? "application/pdf" : "image/jpeg" });
  if (error) throw error;
  return path;
}
