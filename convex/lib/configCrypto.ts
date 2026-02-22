const ENC_PREFIX = "enc:v1:";
const IV_LENGTH = 12;

const SENSITIVE_KEY_RE =
  /(^|[_\-.])(api_key|access_token|refresh_token|token|secret|password|private_key|signing_secret|app_secret|bot_token|webhook_secret)([_\-.]|$)/i;
const SENSITIVE_EXACT_KEYS = new Set([
  "ai.provider_profiles",
  "ai_oauth_credentials",
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getEnv(name: string): string | undefined {
  const env = (globalThis as any)?.process?.env as Record<string, string | undefined> | undefined;
  return env?.[name];
}

function getEncryptionSecret(): string | null {
  return getEnv("ENCRYPTION_SECRET") || getEnv("AUTH_SECRET") || null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("WebCrypto is not available");
  }
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export function isSensitiveConfigKey(key: string): boolean {
  return SENSITIVE_EXACT_KEYS.has(key) || SENSITIVE_KEY_RE.test(key);
}

export function isEncryptedConfigValue(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export async function encryptConfigValue(value: string): Promise<string> {
  if (!value) return value;
  const secret = getEncryptionSecret();
  if (!secret) return value;
  if (typeof crypto === "undefined" || !crypto.subtle) return value;

  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(value),
  );

  const ct = new Uint8Array(ciphertext);
  const packed = new Uint8Array(IV_LENGTH + ct.length);
  packed.set(iv, 0);
  packed.set(ct, IV_LENGTH);

  return ENC_PREFIX + bytesToBase64(packed);
}

export async function decryptConfigValue(value: string): Promise<string> {
  if (!isEncryptedConfigValue(value)) return value;
  const secret = getEncryptionSecret();
  if (!secret) return "";
  if (typeof crypto === "undefined" || !crypto.subtle) return "";

  const raw = value.slice(ENC_PREFIX.length);
  const packed = base64ToBytes(raw);
  if (packed.length <= IV_LENGTH) return "";

  const iv = packed.slice(0, IV_LENGTH);
  const ciphertext = packed.slice(IV_LENGTH);
  const key = await deriveKey(secret);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return textDecoder.decode(plaintext);
  } catch {
    return "";
  }
}

export async function encodeConfigForStorage(key: string, value: string): Promise<string> {
  if (!isSensitiveConfigKey(key)) return value;
  if (!value || isEncryptedConfigValue(value)) return value;
  return await encryptConfigValue(value);
}

export async function decodeConfigForRead(_key: string, value: string): Promise<string> {
  return await decryptConfigValue(value);
}
