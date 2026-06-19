const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetResultFromS3 = jest.fn();
const mockSaveResultToS3 = jest.fn();
const mockGenerateContent = jest.fn();
const mockDynamoDBSend = jest.fn();
const mockLambdaSend = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => ({
  generateContent: (args: any) => mockGenerateContent(args),
}));

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
  JOBS_TABLE: 'mock-jobs-table',
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: (cmd: any) => mockLambdaSend(cmd),
  })),
  InvokeCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  UpdateItemCommand: jest.fn().mockImplementation((payload) => payload),
  GetItemCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('../lambda/utils/s3-helpers', () => ({
  getResultFromS3: (key: string) => mockGetResultFromS3(key),
  saveResultToS3: (...args: any[]) => mockSaveResultToS3(...args),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: (config: any) => mockGetGenerativeModel(config),
  })),
  SchemaType: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

import {
  handleMindmapJob,
  validateMindmap,
  handleMindmapPost,
  handleMindmapGet,
  handleAsyncMindmapJob
} from '../lambda/handlers/mindmap';

// ============================================
// TEST FIXTURES
// ============================================

const VALID_JOB_ITEM = {
  userId: { S: 'user-123' },
  jobId: { S: 'job-abc' },
  status: { S: 'completed' },
  s3OutputKey: { S: 'results/job-abc/analysis.md' },
  fileName: { S: 'paper.pdf' },
};

const VALID_MERMAID_CODE = `mindmap
  root(("Machine Learning"))
    Supervised
      Regression
      Classification
    Unsupervised
      Clustering`;

// ============================================
// TESTS: validateMindmap()
// ============================================

describe('validateMindmap()', () => {
  it('returns valid=true for a correct mindmap payload', () => {
    const data = { mermaidCode: VALID_MERMAID_CODE };
    const result = validateMindmap(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false when mermaidCode is empty or missing', () => {
    expect(validateMindmap(null).valid).toBe(false);
    expect(validateMindmap({}).valid).toBe(false);
    expect(validateMindmap({ mermaidCode: '' }).valid).toBe(false);
    expect(validateMindmap({ mermaidCode: '   ' }).valid).toBe(false);
  });

  it('returns valid=false when mermaidCode does not start with mindmap keyword', () => {
    const data = { mermaidCode: 'graph TD\n  A --> B' };
    const result = validateMindmap(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("bắt đầu bằng từ khóa 'mindmap'");
  });

  it('returns valid=false when mermaidCode contains HTML tags', () => {
    const data = { mermaidCode: 'mindmap\n  root(("Concept <b>Bold</b>"))' };
    const result = validateMindmap(data);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('không được chứa các ký tự HTML');
  });
});

// ============================================
// TESTS: handleMindmapJob() (Gemini calls)
// ============================================

describe('handleMindmapJob()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws JOB_NOT_FOUND when job does not exist in DB', async () => {
    mockGetJobItem.mockResolvedValueOnce(null);
    await expect(handleMindmapJob({ jobId: 'job-missing', userId: 'user-123' }))
      .rejects.toThrow('JOB_NOT_FOUND');
  });

  it('throws FORBIDDEN when user does not own the job', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      ...VALID_JOB_ITEM,
      userId: { S: 'user-different' },
    });
    await expect(handleMindmapJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('FORBIDDEN');
  });

  it('throws ANALYSIS_NOT_FOUND when job translation is not completed', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      ...VALID_JOB_ITEM,
      status: { S: 'pending' },
    });
    await expect(handleMindmapJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ANALYSIS_NOT_FOUND');
  });

  it('returns S3 cached mindmap directly if available', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const cachedData = {
      status: 'COMPLETED',
      mermaidCode: VALID_MERMAID_CODE,
    };
    mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

    const result = await handleMindmapJob({ jobId: 'job-abc', userId: 'user-123' });
    expect(result).toEqual(cachedData);
    expect(mockGetResultFromS3).toHaveBeenCalledWith('results/job-abc/mindmap.json');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('retries with feedback on first fail, succeeds on second attempt', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockImplementation((key) => {
      if (key.includes('analysis.md')) return 'This is mock paper analysis content';
      throw { name: 'NoSuchKey' };
    });
    mockGetSecret.mockResolvedValue('fake-key');

    // 1st attempt: invalid (missing mindmap keyword)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ mermaidCode: 'root(("Title"))\n  Node' }) }
    });
    // 2nd attempt: valid
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ mermaidCode: VALID_MERMAID_CODE }) }
    });

    const result = await handleMindmapJob({ jobId: 'job-abc', userId: 'user-123' });
    expect(result.mermaidCode).toBe(VALID_MERMAID_CODE);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
  });

  it('throws MINDMAP_GENERATION_FAILED when both attempts fail validation', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockImplementation((key) => {
      if (key.includes('analysis.md')) return 'This is mock paper analysis content';
      throw { name: 'NoSuchKey' };
    });
    mockGetSecret.mockResolvedValue('fake-key');

    // Attempt 1: invalid
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ mermaidCode: 'invalid' }) }
    });
    // Attempt 2: invalid
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ mermaidCode: 'invalid' }) }
    });

    await expect(handleMindmapJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('MINDMAP_GENERATION_FAILED');
  });
});

// ============================================
// TESTS: handleMindmapPost() & handleMindmapGet()
// ============================================

describe('Polling API Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMindmapPost()', () => {
    it('returns COMPLETED immediately on S3 cache hit', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      const cachedData = {
        status: 'COMPLETED',
        mermaidCode: VALID_MERMAID_CODE,
      };
      mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await handleMindmapPost({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('COMPLETED');
      expect(result.mermaidCode).toBe(VALID_MERMAID_CODE);
    });

    it('returns GENERATING and invokes lambda when cache miss and lock acquired', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockRejectedValueOnce({ name: 'NoSuchKey' });
      mockDynamoDBSend.mockResolvedValueOnce({}); // Lock success

      const result = await handleMindmapPost({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).toHaveBeenCalled();
    });

    it('returns GENERATING without invoking lambda when lock acquisition fails', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const condError = new Error('ConditionalCheckFailedException');
      condError.name = 'ConditionalCheckFailedException';
      mockDynamoDBSend.mockRejectedValueOnce(condError); // Lock fail

      const result = await handleMindmapPost({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });

  describe('handleMindmapGet()', () => {
    it('returns IDLE when status attribute is missing in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
      }); // No mindmapStatus attribute
      const result = await handleMindmapGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('IDLE');
    });

    it('returns GENERATING when status matches in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
        mindmapStatus: { S: 'GENERATING' },
      });
      const result = await handleMindmapGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('GENERATING');
    });

    it('returns COMPLETED with mermaidCode when status is COMPLETED and cache exists', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
        mindmapStatus: { S: 'COMPLETED' },
      });
      const cachedData = {
        status: 'COMPLETED',
        mermaidCode: VALID_MERMAID_CODE,
      };
      mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await handleMindmapGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('COMPLETED');
      expect(result.mermaidCode).toBe(VALID_MERMAID_CODE);
    });
  });

  describe('handleAsyncMindmapJob()', () => {
    it('generates mindmap and updates status to COMPLETED on success', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockImplementation((key) => {
        if (key.includes('analysis.md')) return 'This is mock paper analysis content';
        throw { name: 'NoSuchKey' };
      });
      mockGetSecret.mockResolvedValue('fake-key');
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ mermaidCode: VALID_MERMAID_CODE }) }
      });

      await handleAsyncMindmapJob({ jobId: 'job-abc', userId: 'user-123', invocationDepth: 1 });
      // Updates status to COMPLETED
      expect(mockDynamoDBSend).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ':status': { S: 'COMPLETED' }
        })
      }));
    });
  });
});
