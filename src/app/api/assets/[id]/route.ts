import { readAsset } from "@/server/services/assets";

/**
 * Serves uploaded images. Ids are unguessable (16 random chars) so published
 * and shared plans can display them; the stored type is sniffed on upload.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await readAsset(id).catch(() => null);
  if (!asset) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.row.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
