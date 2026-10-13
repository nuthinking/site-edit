/*
  Sealed values: the session cookie, the sign-in state, the one-minute grant that carries a login
  to a preview origin, and the notify marker in an issue. AES-256-GCM through WebCrypto, so it runs
  in Node and in edge runtimes alike. Key = SHA-256(secret); output = base64url(iv | ciphertext+tag).
  Pure, so the preview email script can open markers with the same secret.
*/
const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function seal(value: unknown, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(secret), enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + body.length);
  out.set(iv);
  out.set(body, iv.length);
  return toBase64url(out);
}

export async function open<T>(sealed: string, secret: string): Promise<T | null> {
  try {
    const raw = fromBase64url(sealed);
    const body = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12) }, await key(secret), raw.subarray(12));
    return JSON.parse(dec.decode(body)) as T;
  } catch {
    return null;
  }
}
