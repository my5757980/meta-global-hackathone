import { mkdirSync, writeFileSync, createReadStream, existsSync, statSync, rmSync } from "node:fs";
import { resolve, extname } from "node:path";
import { eq } from "drizzle-orm";
import { filesDir } from "../env";
import type { DBorTx } from "../db/client";
import { db } from "../db/client";
import { files } from "../db/schema";
import { genId } from "../lib/id";

export interface SaveFileOpts {
  kind: string;
  mime: string;
  originalName?: string;
  ownerUserId?: string | null;
}

const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a", // voice notes from the phone app (AAC in MP4)
  "audio/aac": ".aac",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/zip": ".zip",
};

/** Store bytes under .data/files/<kind>/<id><ext> and record them. Bytes are never served without an access check. */
export async function saveFile(buf: Buffer, opts: SaveFileOpts, tx: DBorTx = db()): Promise<{ id: string; path: string }> {
  const id = genId();
  const ext = EXT[opts.mime] ?? (opts.originalName ? extname(opts.originalName).slice(0, 8) : "") ?? "";
  const rel = `${opts.kind}/${id}${ext}`;
  const abs = resolve(filesDir, rel);
  mkdirSync(resolve(filesDir, opts.kind), { recursive: true });
  writeFileSync(abs, buf);
  await tx.insert(files).values({
    id,
    kind: opts.kind,
    mime: opts.mime,
    size: buf.length,
    path: rel,
    originalName: opts.originalName ?? null,
    ownerUserId: opts.ownerUserId ?? null,
  });
  return { id, path: rel };
}

export async function getFile(id: string) {
  const [f] = await db().select().from(files).where(eq(files.id, id)).limit(1);
  if (!f) return null;
  const abs = resolve(filesDir, f.path);
  if (!existsSync(abs)) return null;
  return { ...f, abs, size: statSync(abs).size };
}

/** Remove a stored file: its row and its bytes. */
export async function deleteFile(id: string) {
  const f = await getFile(id);
  await db().delete(files).where(eq(files.id, id));
  if (f) rmSync(f.abs, { force: true });
}

export function fileStream(abs: string) {
  return createReadStream(abs);
}

export function fileAbsPath(rel: string): string {
  return resolve(filesDir, rel);
}
