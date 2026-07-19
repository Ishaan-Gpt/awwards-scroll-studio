// Server-only: encrypt/decrypt each user's worker bearer token before it hits
// the database. Uses AES-256-GCM with a project-wide key from env.
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";

function key(): Buffer {
  const raw = process.env.WORKER_TOKEN_ENC_KEY;
  if (!raw) throw new Error("WORKER_TOKEN_ENC_KEY is not configured");
  // Accept any length; derive a stable 32-byte key via SHA-256.
  return createHash("sha256").update(raw).digest();
}

export function encryptWorkerToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptWorkerToken(stored: string): string {
  const buf = Buffer.from(stored, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
