import { checkRateLimit, rateLimitResponse } from '../lambda/utils/rate-limiter';
import { dynamodbClient } from '../lambda/utils/aws-clients';

jest.mock('../lambda/utils/aws-clients', () => ({
  dynamodbClient: {
    send: jest.fn()
  },
  JOBS_TABLE: 'vietai-jobs'
}));

describe('Rate Limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow request if under limit', async () => {
    // Mock DynamoDB returning count = 5
    (dynamodbClient.send as jest.Mock).mockResolvedValue({
      Attributes: { toolsCount: { N: '5' } }
    });

    const result = await checkRateLimit('user-123', 'tools', 20);
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(15);
    expect(dynamodbClient.send).toHaveBeenCalledTimes(1);
    
    // Verify UpdateExpression params
    const updateCommand = (dynamodbClient.send as jest.Mock).mock.calls[0][0];
    expect(updateCommand.input.TableName).toBe('vietai-jobs');
    expect(updateCommand.input.Key.jobId.S).toContain('rateLimit#user-123#');
  });

  it('should deny request if exactly at limit', async () => {
    // Mock DynamoDB returning count = 21 (since we add 1 on every update, limit 20 means count reaches 21)
    (dynamodbClient.send as jest.Mock).mockResolvedValue({
      Attributes: { toolsCount: { N: '21' } }
    });

    const result = await checkRateLimit('user-123', 'tools', 20);
    
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should fail-open if DynamoDB throws an error', async () => {
    // Mock DynamoDB throwing ProvisionedThroughputExceededException
    (dynamodbClient.send as jest.Mock).mockRejectedValue(new Error('ProvisionedThroughputExceededException'));

    // We spy on console.error to avoid noise in test output
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await checkRateLimit('user-123', 'tools', 20);
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });

  it('should return correct HTTP response format from rateLimitResponse', () => {
    const response = rateLimitResponse('Quiz');
    
    expect(response.statusCode).toBe(429);
    expect(response.headers['Content-Type']).toBe('application/json');
    
    const body = JSON.parse(response.body);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(body.message).toContain('Quiz');
    expect(body.remaining).toBe(0);
    expect(body.resetAt).toBeDefined();
  });
});
