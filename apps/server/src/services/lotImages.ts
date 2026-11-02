/**
 * Lots imported from Excel can bring their own pictures by address. The server fetches them (the sheet goes to the vision model,
 * photos go into the download), so only public http(s) hosts, only images, and a size limit.
 */
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[|.*\.local$|.*\.internal$)/i;

export function isPublicImageUrl(u: string): boolean {
  try {
    const x = new URL(u);
    return /^https?:$/.test(x.protocol) && !PRIVATE_HOST.test(x.hostname);
  } catch {
    return false;
  }
}

const MAX_BYTES = 10 * 1024 * 1024;

export async function fetchImage(url: string): Promise<{ buf: Buffer; mime: string; ext: string }> {
  if (!isPublicImageUrl(url)) throw new Error("Not a public image address");
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!isPublicImageUrl(r.url)) throw new Error("Not a public image address");
  const mime = (r.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!r.ok || !mime.startsWith("image/")) throw new Error(`No image at that address (${r.status})`);
  if (Number(r.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("The image is over 10 MB");
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("The image is over 10 MB");
  return { buf, mime, ext: mime.split("/")[1]!.replace("jpeg", "jpg").replace(/\+.*/, "") };
}
