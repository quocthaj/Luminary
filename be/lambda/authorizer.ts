import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';

interface APIGatewayTokenAuthorizerEvent {
  type: string;
  authorizationToken: string;
  methodArn: string;
}

interface APIGatewayAuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: Array<{
      Action: string;
      Effect: 'Allow';
      Resource: string;
    }>;
  };
  context?: Record<string, any>;
}

let secretsClient: SecretsManagerClient | null = null;
let cachedSecret: string | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — allows secret rotation to take effect

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

export async function handler(
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  const authorizationToken = event.authorizationToken;
  if (!authorizationToken || !authorizationToken.startsWith('Bearer ')) {
    console.error('Invalid Authorization header format');
    throw new Error('Unauthorized');
  }

  const token = authorizationToken.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 3) {
    console.error('Token does not have 3 parts');
    throw new Error('Unauthorized');
  }

  const [headerStr, payloadStr, signatureStr] = parts;

  // 1. Fetch AUTH_SECRET (operational call outside of verification try-catch)
  const secret = await getAuthSecret();

  try {
    // 2. Verify alg header is HS256
    const header = JSON.parse(Buffer.from(headerStr, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') {
      console.error('Unsupported JWT algorithm:', header.alg);
      throw new Error('Unauthorized');
    }

    // 3. Parse payload and enforce exp (required — no exp or non-numeric = reject)
    const payloadJson = Buffer.from(payloadStr, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
      console.warn('Token is expired, missing, or has invalid type for exp claim');
      throw new Error('Unauthorized');
    }

    // 4. Verify signature
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
      console.error('JWT signature verification failed');
      throw new Error('Unauthorized');
    }

    // Determine principalId and userId
    const principalId = payload.sub || 'user';
    const userId = payload.email || principalId;

    // Split the ARN to create a wildcard resource (supporting API Gateway caching)
    const arnParts = event.methodArn.split('/');
    const wildcardResource = arnParts.length >= 2 ? `${arnParts[0]}/${arnParts[1]}/*` : event.methodArn;

    return generatePolicy(principalId, wildcardResource, userId);
  } catch (err: any) {
    console.error('Authorization failed:', err.message || err);
    throw new Error('Unauthorized');
  }
}

function generatePolicy(
  principalId: string,
  resource: string,
  userId: string
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: resource,
        },
      ],
    },
    context: {
      userId,
    },
  };
}

export function _resetCacheForTesting(): void {
  cachedSecret = null;
  cacheExpiresAt = 0;
  secretsClient = null;
}
