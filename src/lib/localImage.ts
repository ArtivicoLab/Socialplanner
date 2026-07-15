// Device-photo picking: resize + compress a picked file client-side before it
// ever touches IndexedDB. A phone camera photo is routinely 3-12MB at 4000px+;
// without this every pick would bloat local storage and slow the app to a
// crawl once a user has a few dozen posts with photos.
const MAX_DIM = 1080;
const JPEG_QUALITY = 0.85;

async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through to the <img> path below (some browsers can't
      // createImageBitmap directly from certain file types)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Resize `file` to fit within MAX_DIM (longest edge) and re-encode as a
 *  compressed JPEG. Throws with a user-friendly message on unreadable files. */
export async function resizeImageFile(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await decodeToBitmap(file);
  } catch {
    throw new Error("Couldn't read that photo. Try a different one.");
  }

  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't process that photo. Try a different one.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob) throw new Error("Couldn't process that photo. Try a different one.");
  return blob;
}
