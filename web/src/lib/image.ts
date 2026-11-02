import { createClient } from "@/lib/supabase/client";

/** Scales a photo down to at most `maxSide` px and re-encodes it as JPEG (keeps uploads and AI calls small). */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Bild konnte nicht verarbeitet werden"))), "image/jpeg", quality),
  );
}

/** Resizes and uploads a photo to the plant-photos bucket under `folder/`; returns the object path. */
export async function uploadPhoto(file: File, folder: string): Promise<string> {
  const blob = await resizeImage(file);
  const path = `${folder}/${crypto.randomUUID()}.jpg`;
  const { error } = await createClient().storage.from("plant-photos").upload(path, blob, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}
