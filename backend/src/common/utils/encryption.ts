/**
 * AES-256-GCM encryption for sensitive health data (consultation notes).
 * Key is stored as env variable; IV is random per encryption (stored alongside ciphertext).
 * GCM mode provides both confidentiality and integrity.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 16;
const AUTH_TAG_BYTES = 16;

export function encrypt(plaintext: string, keyHex: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(ciphertext: string, iv: string, authTag: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
