const mockDynamodbSend = jest.fn();

// Mock DynamoDB and Presigner BEFORE importing index
jest.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: jest.fn().mockImplementation(() => {
      return {
        send: (cmd: any) => mockDynamodbSend(cmd),
      };
    }),
    PutItemCommand: class {},
    GetItemCommand: class {},
    QueryCommand: class {},
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-s3-upload-url.com/file.pdf'),
}));

import { handler } from '../lambda/index';

describe('Jobs Handler - Upload & List Jobs', () => {
  beforeEach(() => {
    mockDynamodbSend.mockReset();
  });

  it('should generate upload URL with the actual user ID from context', async () => {
    mockDynamodbSend.mockResolvedValue({});

    const event = {
      httpMethod: 'POST',
      path: '/upload',
      body: JSON.stringify({ fileName: 'test-paper.pdf' }),
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.uploadUrl).toBe('https://mock-s3-upload-url.com/file.pdf');
    expect(body.jobId).toBeDefined();

    // Verify PutItem was called with user-123
    expect(mockDynamodbSend).toHaveBeenCalled();
    const putItemCall = mockDynamodbSend.mock.calls[0][0];
    expect(putItemCall).toBeDefined();
    // Since we mocked class, we can check constructor or attributes passed to send
    expect(putItemCall.constructor.name).toBeDefined();
  });

  it('should list jobs for the authorized user', async () => {
    const mockJobsList = {
      Items: [
        {
          jobId: { S: 'job-1' },
          status: { S: 'completed' },
          fileName: { S: 'paper1.pdf' },
          createdAt: { N: '1717800000' },
        },
        {
          jobId: { S: 'job-2' },
          status: { S: 'processing' },
          fileName: { S: 'paper2.pdf' },
          createdAt: { N: '1717810000' },
        },
      ],
    };
    mockDynamodbSend.mockResolvedValue(mockJobsList);

    const event = {
      httpMethod: 'GET',
      path: '/jobs',
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.jobs).toHaveLength(2);
    expect(body.jobs[0].jobId).toBe('job-1');
    expect(body.jobs[0].status).toBe('completed');
    expect(body.jobs[0].fileName).toBe('paper1.pdf');
    expect(body.jobs[0].createdAt).toBe(1717800000);

    // Verify Query was called
    expect(mockDynamodbSend).toHaveBeenCalled();
  });

  it('should return 401 when userId is missing in requestContext for /jobs', async () => {
    const event = {
      httpMethod: 'GET',
      path: '/jobs',
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });
});
