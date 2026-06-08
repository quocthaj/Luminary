import { handler, _resetCacheForTesting } from '../lambda/authorizer';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import * as crypto from 'crypto';

// Setup Mock for Secrets Manager using standard Jest mock
jest.mock('@aws-sdk/client-secrets-manager');

const mockSend = jest.fn();
(SecretsManagerClient as jest.Mock).mockImplementation(() => {
  return {
    send: mockSend
  };
});

// Helper to base64url encode
function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Helper to sign standard HS256 JWT
async function generateTestJwt(payload: any, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerStr = base64url(JSON.stringify(header));
  const payloadStr = base64url(JSON.stringify(payload));
  const partialToken = `${headerStr}.${payloadStr}`;

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(partialToken);
  const signatureStr = hmac.digest('base64url');

  return `${partialToken}.${signatureStr}`;
}

describe('Lambda Authorizer JWT Verification', () => {
  const SECRET = 'test-secret-key-12345';
  process.env.AUTH_SECRET_SECRET_NAME = 'vietai/auth-secret';

  beforeEach(() => {
    _resetCacheForTesting();
    mockSend.mockReset();
    // Default mock behavior to return the test secret
    mockSend.mockResolvedValue({
      SecretString: JSON.stringify({ AUTH_SECRET: SECRET })
    });
  });

  it('should authorize a valid JWT token', async () => {
    const payload = {
      sub: 'test-user-id',
      email: 'test@vietai.org',
      exp: Math.floor(Date.now() / 1000) + 120 // valid for 2 mins
    };
    const token = await generateTestJwt(payload, SECRET);

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    const response = await handler(event);

    expect(response.principalId).toBe('test-user-id');
    expect(response.context?.userId).toBe('test@vietai.org');
    expect(response.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(response.policyDocument.Statement[0].Resource).toBe('arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/*');
  });

  it('should reject an expired JWT token by throwing Unauthorized', async () => {
    const payload = {
      sub: 'test-user-id',
      email: 'test@vietai.org',
      exp: Math.floor(Date.now() / 1000) - 10 // expired 10 seconds ago
    };
    const token = await generateTestJwt(payload, SECRET);

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should reject a JWT token with invalid signature by throwing Unauthorized', async () => {
    const payload = {
      sub: 'test-user-id',
      email: 'test@vietai.org',
      exp: Math.floor(Date.now() / 1000) + 120
    };
    const token = await generateTestJwt(payload, 'wrong-secret-key');

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should reject a malformed authorization header', async () => {
    const event = {
      type: 'TOKEN',
      authorizationToken: 'InvalidHeaderFormat',
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should reject a JWT token with no exp claim', async () => {
    const payload = { sub: 'test-user-id', email: 'test@vietai.org' }; // no exp
    const token = await generateTestJwt(payload, SECRET);

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should reject a JWT token with unsupported algorithm', async () => {
    // Manually craft a token with alg: RS256 header
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payloadStr = base64url(JSON.stringify({
      sub: 'test-user-id',
      exp: Math.floor(Date.now() / 1000) + 120
    }));
    const token = `${header}.${payloadStr}.fakesignature`;

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should reject a JWT token with non-numeric exp claim', async () => {
    const payload = { sub: 'test-user-id', email: 'test@vietai.org', exp: 'not-a-number' };
    const token = await generateTestJwt(payload, SECRET);

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    await expect(handler(event)).rejects.toThrow('Unauthorized');
  });

  it('should bubble up Secrets Manager operational errors (not throw Unauthorized)', async () => {
    const payload = {
      sub: 'test-user-id',
      email: 'test@vietai.org',
      exp: Math.floor(Date.now() / 1000) + 120
    };
    const token = await generateTestJwt(payload, SECRET);

    const event = {
      type: 'TOKEN',
      authorizationToken: `Bearer ${token}`,
      methodArn: 'arn:aws:execute-api:ap-southeast-1:123456789012:api-id/dev/POST/upload'
    };

    // Force Secrets Manager to throw an error
    mockSend.mockRejectedValue(new Error('Secrets Manager connection timeout'));

    await expect(handler(event)).rejects.toThrow('Secrets Manager connection timeout');
  });
});
