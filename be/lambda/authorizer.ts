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
      Effect: 'Allow' | 'Deny';
      Resource: string;
    }>;
  };
  context?: Record<string, any>;
}

let secretsClient: SecretsManagerClient | null = null;
let cachedSecret: string | null = null;

async function getAuthSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

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

  const parsed = JSON.parse(response.SecretString);
  const secret = parsed.AUTH_SECRET || parsed.authSecret;
  if (!secret) {
    throw new Error('AUTH_SECRET not found in secrets payload');
  }

  cachedSecret = secret;
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

  try {
    // 1. Parse payload to check exp
    const payloadJson = Buffer.from(payloadStr, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      console.warn('Token has expired');
      throw new Error('Unauthorized');
    }

    // 2. Fetch AUTH_SECRET
    const secret = await getAuthSecret();

    // 3. Verify signature
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

    return generatePolicy(principalId, 'Allow', event.methodArn, userId);
  } catch (err: any) {
    console.error('Authorization failed:', err.message || err);
    throw new Error('Unauthorized');
  }
}

function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
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
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context: {
      userId,
    },
  };
}
