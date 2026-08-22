import { createDecipheriv, createHash, createCipheriv, createSecretKey, randomBytes, timingSafeEqual } from 'crypto';

const COROS_TOKEN_PREFIX = 'enc:v1';
const COROS_TOKEN_IV_BYTES = 12;
const COROS_TOKEN_KEY_BYTES = 32;

function decodeEncryptionKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== COROS_TOKEN_KEY_BYTES) {
    throw new Error('COROS_TOKEN_ENCRYPTION_KEY_INVALID');
  }

  return key;
}

export function encryptCorosToken(plaintext: string, encodedKey: string): string {
  const key = createSecretKey(Uint8Array.from(decodeEncryptionKey(encodedKey)));
  const iv = Uint8Array.from(randomBytes(COROS_TOKEN_IV_BYTES));
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Uint8Array.from([...cipher.update(plaintext, 'utf8'), ...cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    COROS_TOKEN_PREFIX,
    Buffer.from(iv).toString('base64url'),
    Buffer.from(ciphertext).toString('base64url'),
    authenticationTag.toString('base64url'),
  ].join(':');
}

export function decryptCorosToken(value: string, encodedKey: string): string {
  const [prefix, version, encodedIv, encodedCiphertext, encodedAuthenticationTag, extra] = value.split(':');
  if (prefix !== 'enc' || version !== 'v1' || extra !== undefined) {
    throw new Error('COROS_TOKEN_CIPHERTEXT_INVALID');
  }

  const key = createSecretKey(Uint8Array.from(decodeEncryptionKey(encodedKey)));
  const iv = decodeBase64Url(encodedIv ?? '');
  const ciphertext = decodeBase64Url(encodedCiphertext ?? '');
  const authenticationTag = decodeBase64Url(encodedAuthenticationTag ?? '');
  if (iv.length !== COROS_TOKEN_IV_BYTES || authenticationTag.length !== 16 || ciphertext.length === 0) {
    throw new Error('COROS_TOKEN_CIPHERTEXT_INVALID');
  }

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authenticationTag);
  const plaintext = Uint8Array.from([...decipher.update(ciphertext), ...decipher.final()]);
  return new TextDecoder().decode(plaintext);
}

function decodeBase64Url(value: string): Uint8Array {
  const decoded = Buffer.from(value, 'base64url');
  if (!value || decoded.toString('base64url') !== value) {
    throw new Error('COROS_TOKEN_CIPHERTEXT_INVALID');
  }
  return Uint8Array.from(decoded);
}

export function isCorosUserAllowed(input: {
  mode: string | undefined;
  pilotUserIds: string | undefined;
  userId: string;
}): boolean {
  const mode = input.mode?.trim().toLowerCase();
  if (mode === 'public') {
    return true;
  }
  if (mode !== 'pilot') {
    return false;
  }

  const pilotUserIds = new Set(
    (input.pilotUserIds ?? '')
      .split(',')
      .map(userId => userId.trim())
      .filter(Boolean),
  );
  return pilotUserIds.has(input.userId);
}

export function validateCorosFitUrl(value: string, allowedHosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('COROS_FIT_URL_INVALID');
  }

  const normalizedAllowedHosts = new Set(allowedHosts.map(host => host.trim().toLowerCase()).filter(Boolean));
  const isAllowed = normalizedAllowedHosts.has(url.hostname.toLowerCase());
  const hasDefaultPort = url.port === '' || url.port === '443';
  if (
    url.protocol !== 'https:' ||
    !isAllowed ||
    !hasDefaultPort ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    !url.pathname.toLowerCase().endsWith('.fit')
  ) {
    throw new Error('COROS_FIT_URL_NOT_ALLOWED');
  }

  return url;
}

function constantTimeStringEqual(actual: string, expected: string): boolean {
  const actualHash = Uint8Array.from(createHash('sha256').update(actual, 'utf8').digest());
  const expectedHash = Uint8Array.from(createHash('sha256').update(expected, 'utf8').digest());
  return timingSafeEqual(actualHash, expectedHash);
}

export function verifyCorosWebhookCredentials(input: {
  actualClient: string | undefined;
  actualSecret: string | undefined;
  expectedClient: string;
  expectedSecret: string;
}): boolean {
  if (!input.actualClient || !input.actualSecret || !input.expectedClient || !input.expectedSecret) {
    return false;
  }

  const clientMatches = constantTimeStringEqual(input.actualClient, input.expectedClient);
  const secretMatches = constantTimeStringEqual(input.actualSecret, input.expectedSecret);
  return clientMatches && secretMatches;
}
