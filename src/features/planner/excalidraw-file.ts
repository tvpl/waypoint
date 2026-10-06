/**
 * Excalidraw files: the `.excalidraw` JSON and PNG/SVG images that carry the scene inside, in
 * Excalidraw's own encoding (zlib-deflated "bstring" payload), so they open as editable drawings
 * on excalidraw.com and come back into Waypoint the same way. Works in browsers and Node.
 */
import { EXCALIDRAW_MIME, parseScene, type ExScene } from "./excalidraw";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Bytes as a "byte string" (one char per byte), Excalidraw's `bstring`. */
function toByteString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

function fromByteString(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Excalidraw's EncodedData: `{ version: "1", encoding: "bstring", compressed: true, encoded }`. */
export async function encodePayload(json: string): Promise<string> {
  const deflated = await pipe(enc.encode(json), new CompressionStream("deflate"));
  return JSON.stringify({ version: "1", encoding: "bstring", compressed: true, encoded: toByteString(deflated) });
}

export async function decodePayload(text: string): Promise<string> {
  const data = JSON.parse(text) as { encoding?: string; compressed?: boolean; encoded?: string } & Record<string, unknown>;
  // Old files put the scene there as plain JSON.
  if (typeof data.encoded !== "string") return text;
  if (data.encoding !== "bstring") throw new Error("unknown encoding");
  const bytes = fromByteString(data.encoded);
  return dec.decode(data.compressed ? await pipe(bytes, new DecompressionStream("deflate")) : bytes);
}

export function sceneJson(scene: ExScene): string {
  return JSON.stringify(scene, null, 2);
}

// ------------------------------------------------------------------ PNG (tEXt chunk)

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Chunk = { type: string; data: Uint8Array };

function readChunks(png: Uint8Array): Chunk[] {
  if (!PNG_SIG.every((b, i) => png[i] === b)) throw new Error("not a PNG");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  for (let at = 8; at + 8 <= png.length; ) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    out.push({ type, data: png.subarray(at + 8, at + 8 + len) });
    at += 12 + len;
    if (type === "IEND") break;
  }
  return out;
}

function writeChunks(chunks: Chunk[]): Uint8Array {
  const size = 8 + chunks.reduce((s, c) => s + 12 + c.data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(PNG_SIG, 0);
  let at = 8;
  for (const c of chunks) {
    view.setUint32(at, c.data.length);
    const typed = new Uint8Array(4 + c.data.length);
    typed.set([...c.type].map((ch) => ch.charCodeAt(0)));
    typed.set(c.data, 4);
    out.set(typed, at + 4);
    view.setUint32(at + 8 + c.data.length, crc32(typed));
    at += 12 + c.data.length;
  }
  return out;
}

/** Adds the scene to a PNG as a tEXt chunk keyed by Excalidraw's MIME type. */
export async function embedInPng(png: Uint8Array, scene: ExScene): Promise<Uint8Array> {
  const text = await encodePayload(JSON.stringify(scene));
  const data = new Uint8Array(EXCALIDRAW_MIME.length + 1 + text.length);
  data.set(fromByteString(EXCALIDRAW_MIME), 0);
  data.set(fromByteString(text), EXCALIDRAW_MIME.length + 1);
  const chunks = readChunks(png).filter((c) => !(c.type === "tEXt" && dec.decode(c.data.subarray(0, EXCALIDRAW_MIME.length)) === EXCALIDRAW_MIME));
  const end = chunks.findIndex((c) => c.type === "IEND");
  chunks.splice(end < 0 ? chunks.length : end, 0, { type: "tEXt", data });
  return writeChunks(chunks);
}

export async function sceneFromPng(png: Uint8Array): Promise<unknown | null> {
  for (const c of readChunks(png)) {
    if (c.type !== "tEXt") continue;
    const zero = c.data.indexOf(0);
    if (zero < 0 || toByteString(c.data.subarray(0, zero)) !== EXCALIDRAW_MIME) continue;
    return JSON.parse(await decodePayload(toByteString(c.data.subarray(zero + 1))));
  }
  return null;
}

// ------------------------------------------------------------------ SVG (metadata comment)

/** Puts the scene in the SVG's <metadata>, as Excalidraw's "embed scene" export does. */
export async function embedInSvg(svg: string, scene: ExScene): Promise<string> {
  const payload = btoa(await encodePayload(JSON.stringify(scene)));
  const meta =
    `<!-- svg-source:excalidraw --><metadata><!-- payload-type:${EXCALIDRAW_MIME} --><!-- payload-version:2 -->` +
    `<!-- payload-start -->${payload}<!-- payload-end --></metadata>`;
  return svg.replace(/<svg\b[^>]*>/, (open) => open + meta);
}

export async function sceneFromSvg(svg: string): Promise<unknown | null> {
  if (!svg.includes(`payload-type:${EXCALIDRAW_MIME}`)) return null;
  const m = /<!-- payload-start -->\s*(.+?)\s*<!-- payload-end -->/s.exec(svg);
  if (!m) return null;
  const version = /<!-- payload-version:(\d+) -->/.exec(svg)?.[1] ?? "1";
  const raw = atob(m[1]);
  // Version 1 base64-encoded UTF-8 text; version 2 a byte string.
  const text = version === "1" ? dec.decode(fromByteString(raw)) : raw;
  return JSON.parse(await decodePayload(text));
}

// ------------------------------------------------------------------ reading any of them

export const EXCALIDRAW_ACCEPT = ".excalidraw,.json,.png,.svg,application/json,image/png,image/svg+xml";

/** The scene in a dropped or picked file (`.excalidraw`, `.json`, or a PNG/SVG with the scene embedded). */
export async function readSceneFile(file: Blob & { name?: string }): Promise<ReturnType<typeof parseScene>> {
  const name = file.name?.toLowerCase() ?? "";
  try {
    if (file.type === "image/png" || name.endsWith(".png")) return parseScene(await sceneFromPng(new Uint8Array(await file.arrayBuffer())));
    const text = await file.text();
    if (file.type === "image/svg+xml" || name.endsWith(".svg")) return parseScene(await sceneFromSvg(text));
    return parseScene(JSON.parse(text));
  } catch {
    return null;
  }
}

export function isSceneFile(file: { name?: string; type?: string }): boolean {
  const name = file.name?.toLowerCase() ?? "";
  return name.endsWith(".excalidraw") || file.type === EXCALIDRAW_MIME;
}
