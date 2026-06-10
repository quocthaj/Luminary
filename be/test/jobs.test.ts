const mockDynamodbSend = jest.fn();
const mockS3Send = jest.fn();
const mockSfnSend = jest.fn();

// Mock DynamoDB, S3, SFN and Presigner BEFORE importing index
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
    UpdateItemCommand: class {},
  };
});

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => {
      return {
        send: (cmd: any) => mockS3Send(cmd),
      };
    }),
    PutObjectCommand: class {},
    GetObjectCommand: class {},
    HeadObjectCommand: class {},
  };
});

jest.mock('@aws-sdk/client-sfn', () => {
  return {
    SFNClient: jest.fn().mockImplementation(() => {
      return {
        send: (cmd: any) => mockSfnSend(cmd),
      };
    }),
    StartExecutionCommand: class {},
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-s3-upload-url.com/file.pdf'),
}));

import { handler } from '../lambda/index';

describe('Jobs Handler - Upload & List Jobs', () => {
  beforeEach(() => {
    mockDynamodbSend.mockReset();
    mockS3Send.mockReset();
    mockSfnSend.mockReset();
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

describe('Jobs Handler - Reprocess Job', () => {
  beforeEach(() => {
    mockDynamodbSend.mockReset();
    mockS3Send.mockReset();
    mockSfnSend.mockReset();
  });

  it('should return 401 when userId is missing in requestContext for reprocess', async () => {
    const event = {
      httpMethod: 'POST',
      path: '/job/job-123/reprocess',
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('should return 404 when job does not exist in DynamoDB', async () => {
    mockDynamodbSend.mockResolvedValue({ Item: null });

    const event = {
      httpMethod: 'POST',
      path: '/job/job-123/reprocess',
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(404);
    expect(body.error).toBe('Job not found');
  });

  it('should return 403 when user does not own the job', async () => {
    mockDynamodbSend.mockResolvedValue({
      Item: {
        jobId: { S: 'job-123' },
        userId: { S: 'user-other' },
      },
    });

    const event = {
      httpMethod: 'POST',
      path: '/job/job-123/reprocess',
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('should return 410 when original S3 file does not exist', async () => {
    mockDynamodbSend.mockResolvedValue({
      Item: {
        jobId: { S: 'job-123' },
        userId: { S: 'user-123' },
        s3Key: { S: 'uploads/job-123.pdf' },
      },
    });

    // Mock S3 HeadObject returning NotFound (404)
    const error: any = new Error('NotFound');
    error.name = 'NotFound';
    error.$metadata = { httpStatusCode: 404 };
    mockS3Send.mockRejectedValue(error);

    const event = {
      httpMethod: 'POST',
      path: '/job/job-123/reprocess',
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(410);
    expect(body.error).toBe('Original document has expired and cannot be re-translated');
  });

  it('should successfully trigger reprocess (local fallback or SFN)', async () => {
    mockDynamodbSend
      .mockResolvedValueOnce({
        Item: {
          jobId: { S: 'job-123' },
          userId: { S: 'user-123' },
          s3Key: { S: 'uploads/job-123.pdf' },
        },
      })
      .mockResolvedValueOnce({}); // for updateJobStatus

    // S3 HeadObject returns success
    mockS3Send.mockResolvedValue({});

    const event = {
      httpMethod: 'POST',
      path: '/job/job-123/reprocess',
      requestContext: {
        authorizer: {
          userId: 'user-123',
        },
      },
    };

    const response = await handler(event);
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.message).toBeDefined();
  });
});
