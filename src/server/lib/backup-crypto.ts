import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { z } from "zod";

export const ENCRYPTED_FORMAT = "waypoint-backup-encrypted";
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const envelopeSchema = z.object({
  format: z.literal(ENCRYPTED_FORMAT),
  version: z.literal(1),
  kdf: z.literal("scrypt"),
  salt: z.string(),
  iv: z.string(),
  tag: z.string(),
  data: z.string(),
});

const key = (password: string, salt: Buffer) => scryptSync(password.normalize("NFKC"), salt, 32, SCRYPT);

/** AES-256-GCM with a scrypt-derived key; the result is a small JSON envelope. */
export function encryptBackup(plain: Buffer, password: string): Buffer {
  if (password.length < 8) throw new Error("A senha precisa de pelo menos 8 caracteres.");
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(password, salt), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      format: ENCRYPTED_FORMAT,
      version: 1,
      kdf: "scrypt",
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}

export function isEncryptedBackup(raw: Buffer) {
  const head = raw.subarray(0, 120).toString("utf8");
  return head.includes(`"${ENCRYPTED_FORMAT}"`);
}

/** Throws a readable error when the password is wrong or the file was changed. */
export function decryptBackup(raw: Buffer, password: string): Buffer {
  const env = envelopeSchema.parse(JSON.parse(raw.toString("utf8")));
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(password, Buffer.from(env.salt, "base64")), Buffer.from(env.iv, "base64"));
    decipher.setAuthTag(Buffer.from(env.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(env.data, "base64")), decipher.final()]);
  } catch {
    throw new Error("Senha incorreta ou arquivo alterado.");
  }
}
