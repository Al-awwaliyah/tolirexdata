const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
}

function encodeBase64(value: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptionKey() {
  const encoded = Deno.env.get("KYC_ENCRYPTION_KEY");
  if (!encoded) throw new Error("KYC_ENCRYPTION_KEY is not configured");
  const raw = decodeBase64(encoded);
  if (raw.byteLength !== 32) throw new Error("KYC_ENCRYPTION_KEY must decode to exactly 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptIdentity(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, encoder.encode(value).buffer as ArrayBuffer);
  return `${encodeBase64(iv.buffer as ArrayBuffer)}.${encodeBase64(encrypted)}`;
}

export async function decryptIdentity(value: string): Promise<string> {
  const [ivPart, encryptedPart] = value.split(".");
  if (!ivPart || !encryptedPart) throw new Error("Stored identity ciphertext is invalid");
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(ivPart) },
    key,
    decodeBase64(encryptedPart),
  );
  return decoder.decode(decrypted);
}
