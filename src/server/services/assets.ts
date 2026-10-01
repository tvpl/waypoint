import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../db";
import { newId } from "@/lib/utils";
import { UserError } from "./workspaces";

// SVG is deliberately excluded: it can carry script.
export const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

const dir = () => process.env.UPLOADS_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads");

/** Checks magic bytes so the declared type can't be spoofed. */
function sniff(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && (buf.subarray(0, 6).toString("ascii") === "GIF87a" || buf.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp" && /avi[fs]/.test(buf.subarray(8, 12).toString("ascii"))) return "image/avif";
  return null;
}

export async function saveAsset(workspaceId: string, userId: string, file: File) {
  if (file.size > MAX_ASSET_BYTES) throw new UserError("Imagem muito grande (máx. 5 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) throw new UserError("Formato não suportado. Use PNG, JPG, GIF, WebP ou AVIF.");
  const id = newId();
  await fs.mkdir(dir(), { recursive: true });
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir(), `${id}.${IMAGE_TYPES[mime]}`), buf);
  getDb()
    .insert(schema.assets)
    .values({ id, workspaceId, fileName: file.name.slice(0, 200) || "imagem", mimeType: mime, size: buf.length, createdBy: userId })
    .run();
  return { id, url: `/api/assets/${id}`, mimeType: mime };
}

export async function readAsset(id: string) {
  if (!/^[a-z0-9]{16}$/.test(id)) return null;
  const row = getDb().select().from(schema.assets).where(eq(schema.assets.id, id)).get();
  if (!row) return null;
  const data = await fs.readFile(path.join(/*turbopackIgnore: true*/ dir(), `${id}.${IMAGE_TYPES[row.mimeType]}`));
  return { row, data };
}
