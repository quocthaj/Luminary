import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';

let secretsClient: SecretsManagerClient | null = null;
let cachedSecret: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function getAuthSecret(): Promise<string> {
  if (cachedSecret && Date.now() < cacheExpiresAt) return cachedSecret;

  const secretName = process.env.AUTH_SECRET_SECRET_NAME;
  if (!secretName) {
    throw new Error('AUTH_SECRET_SECRET_NAME env variable not configured');
  }

  if (!secretsClient) {
    secretsClient = new SecretsManagerClient({});
  }

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );

  if (!response.SecretString) {
    throw new Error('SecretString is empty');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(response.SecretString);
  } catch (err: any) {
    throw new Error(`Failed to parse SecretString JSON: ${err.message}`);
  }
  const secret = parsed.AUTH_SECRET || parsed.authSecret;
  if (!secret) {
    throw new Error('AUTH_SECRET not found in secrets payload');
  }

  cachedSecret = secret;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return secret;
}

/**
 * Verifies a JWT from the Authorization header (e.g. "Bearer <token>").
 * Returns the verified userId (email or sub) if valid, or "guest" if missing/invalid.
 */
export async function verifyToken(authorizationHeader: string | undefined): Promise<string> {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    console.log('No valid Authorization header found, defaulting to guest');
    return 'guest';
  }

  const token = authorizationHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.warn('Token does not have 3 parts, defaulting to guest');
    return 'guest';
  }

  const [headerStr, payloadStr, signatureStr] = parts;

  try {
    // 1. Fetch the secret
    const secret = await getAuthSecret();

    // 2. Verify alg header is HS256
    const header = JSON.parse(Buffer.from(headerStr, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') {
      console.warn('Unsupported JWT algorithm:', header.alg);
      return 'guest';
    }

    // 3. Parse payload and check expiration
    const payloadJson = Buffer.from(payloadStr, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
      console.warn('Token is expired or exp claim is invalid/missing');
      return 'guest';
    }

    // 4. Verify signature using node crypto
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(`${headerStr}.${payloadStr}`);
    const signatureBytes = new Uint8Array(Buffer.from(signatureStr, 'base64url'));

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      cryptoKey,
      signatureBytes,
      messageData
    );

    if (!isValid) {
      console.warn('JWT signature verification failed');
      return 'guest';
    }

    const principalId = payload.sub || 'user';
    const userId = payload.email || principalId;
    return userId;
  } catch (err: any) {
    console.error('Error verifying token, defaulting to guest:', err.message || err);
    return 'guest';
  }
}
