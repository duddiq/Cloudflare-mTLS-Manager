const ENCRYPTION_ALGORITHM = 'AES-GCM';

// Derives a 256-bit AES-GCM key from any secret string using SHA-256 hashing.
async function getCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = enc.encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', keyMaterial);
  return await crypto.subtle.importKey(
    'raw',
    hash,
    { name: ENCRYPTION_ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts cleartext using AES-GCM with a random IV.
 * Returns a base64 encoded string containing the IV prepended to the ciphertext.
 */
export async function encryptText(text: string, secret: string): Promise<string> {
  if (!text) return '';
  const key = await getCryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    enc.encode(text)
  );

  // Combine IV and Ciphertext for single-string storage
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  // Base64 encoding
  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypts a base64 string encrypted by encryptText.
 */
export async function decryptText(encryptedBase64: string, secret: string): Promise<string> {
  if (!encryptedBase64) return '';
  const key = await getCryptoKey(secret);
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedBase64));

  if (combined.length < 13) {
    throw new Error('Invalid encrypted content length');
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: ENCRYPTION_ALGORITHM, iv },
    key,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decrypted);
}

// Base64 helpers for Cloudflare Workers/Browser environment
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
