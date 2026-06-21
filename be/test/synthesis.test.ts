const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetEmbeddingsBatch = jest.fn();
const mockSearch = jest.fn();
const mockGenerateContent = jest.fn();
const mockS3Send = jest.fn();
const mockDynamoDBSend = jest.fn();
const mockLambdaSend = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => {
  return {
    generateContent: (args: any) => mockGenerateContent(args),
  };
});

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
  RESULTS_BUCKET: 'vietai-results-mock',
  JOBS_TABLE: 'mock-jobs-table',
  s3Client: {
    send: (cmd: any) => mockS3Send(cmd),
  },
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
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

jest.mock('../lambda/utils/ai-providers', () => ({
  getEmbeddingsBatch: (texts: string[], taskType?: string) => mockGetEmbeddingsBatch(texts, taskType),
}));

jest.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: jest.fn().mockImplementation(() => {
      return {
        search: (name: string, query: any) => mockSearch(name, query),
      };
    }),
  };
});

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: (config: any) => mockGetGenerativeModel(config),
      };
    }),
  };
});

// Mock S3 commands
jest.mock('@aws-sdk/client-s3', () => {
  return {
    GetObjectCommand: jest.fn().mockImplementation((args) => ({ type: 'GetObject', ...args })),
    PutObjectCommand: jest.fn().mockImplementation((args) => ({ type: 'PutObject', ...args })),
  };
});

import { handleSynthesisPost, handleSynthesisChat, handleAsyncSynthesisJob } from '../lambda/handlers/synthesis';

describe('Synthesis Handler - Cross-Paper Synthesis & Chat', () => {
  beforeEach(() => {
    mockGetJobItem.mockReset();
    mockGetSecret.mockReset();
    mockGetEmbeddingsBatch.mockReset();
    mockSearch.mockReset();
    mockGenerateContent.mockReset();
    mockS3Send.mockReset();
    mockDynamoDBSend.mockReset();
    mockLambdaSend.mockReset();

    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
  });

  describe('handleSynthesisPost (Báo cáo đối chiếu)', () => {
    it('should throw INVALID_INPUT if jobIds count is less than 2', async () => {
      await expect(
        handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1'] })
      ).rejects.toThrow('INVALID_INPUT');
    });

    it('should throw JOB_NOT_FOUND if one of the jobs does not exist', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
      });
      mockGetJobItem.mockResolvedValueOnce(null); // second job not found

      await expect(
        handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1', 'job-2'] })
      ).rejects.toThrow('JOB_NOT_FOUND');
    });

    it('should throw FORBIDDEN if the user does not own all the jobs', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-other' },
        jobId: { S: 'job-2' },
      });

      await expect(
        handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1', 'job-2'] })
      ).rejects.toThrow('FORBIDDEN');
    });

    it('should return cached report from S3 if cache hit', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-2' },
      });

      // Mock S3 cache hit
      mockS3Send.mockResolvedValueOnce({
        Body: {
          transformToString: async () => JSON.stringify({ report: 'Cached comparison report content' }),
        },
      });

      const result = await handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1', 'job-2'] });
      expect(result.status).toBe('COMPLETED');
      expect(result.report).toBe('Cached comparison report content');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('should return GENERATING and invoke lambda on S3 cache miss and lock acquired', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-2' },
      });

      // 1. Mock S3 GetObject cache miss
      mockS3Send.mockRejectedValueOnce({ name: 'NoSuchKey' });
      // 2. Mock DynamoDB GetItem (synthesis status checks) -> not found
      mockDynamoDBSend.mockResolvedValueOnce({ Item: null });
      // 3. Mock DynamoDB UpdateItem (synthesis lock acquisition) -> success
      mockDynamoDBSend.mockResolvedValueOnce({});
      // 4. Mock Lambda invoke send
      mockLambdaSend.mockResolvedValueOnce({});

      const result = await handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1', 'job-2'] });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).toHaveBeenCalledTimes(1);
    });

    it('should return GENERATING and NOT invoke lambda on cache miss if lock acquisition fails', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-2' },
      });

      // 1. Mock S3 cache miss
      mockS3Send.mockRejectedValueOnce({ name: 'NoSuchKey' });
      // 2. Mock DynamoDB GetItem -> not found
      mockDynamoDBSend.mockResolvedValueOnce({ Item: null });
      // 3. Mock DynamoDB lock conditional check fail (another request running)
      const condError = new Error('ConditionalCheckFailedException');
      condError.name = 'ConditionalCheckFailedException';
      mockDynamoDBSend.mockRejectedValueOnce(condError);

      const result = await handleSynthesisPost({ userId: 'user-1', jobIds: ['job-1', 'job-2'] });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });

  describe('handleAsyncSynthesisJob (Background worker)', () => {
    it('should retrieve summaries, call Gemini, save to S3, and update status to COMPLETED', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
        fileName: { S: 'Paper A.pdf' },
        summary: {
          M: {
            tldr: { S: 'TLDR A' },
            keyContributions: { L: [{ S: 'Contribution A' }] },
            methodology: { S: 'Method A' },
            limitations: { S: 'Limit A' },
          },
        },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-2' },
        fileName: { S: 'Paper B.pdf' },
        summary: {
          M: {
            tldr: { S: 'TLDR B' },
            keyContributions: { L: [{ S: 'Contribution B' }] },
            methodology: { S: 'Method B' },
            limitations: { S: 'Limit B' },
          },
        },
      });

      // Mock Gemini secret
      mockGetSecret.mockResolvedValueOnce('mock-gemini-key');

      // Mock Gemini content generation
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Generated comparative synthesis report content',
        },
      });

      // Mock S3 PutObject
      mockS3Send.mockResolvedValueOnce({});
      
      // Mock DynamoDB UpdateItem for COMPLETED status
      mockDynamoDBSend.mockResolvedValueOnce({});

      await handleAsyncSynthesisJob({
        userId: 'user-1',
        cacheKey: 'mock-cache-key',
        jobIds: ['job-1', 'job-2'],
        invocationDepth: 1,
      });

      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledTimes(1); // S3 save
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(1); // Status update
    });
  });

  describe('handleSynthesisChat (Chat liên tài liệu)', () => {
    it('should successfully query Qdrant and generate response with Gemini', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-1' },
        fileName: { S: 'Paper A.pdf' },
      });
      mockGetJobItem.mockResolvedValueOnce({
        userId: { S: 'user-1' },
        jobId: { S: 'job-2' },
        fileName: { S: 'Paper B.pdf' },
      });

      // Mock Qdrant config secret
      mockGetSecret.mockResolvedValueOnce(JSON.stringify({
        url: 'https://mock-qdrant.tech',
        apiKey: 'mock-key',
      }));

      // Mock Embedding
      mockGetEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

      // Mock Qdrant Search Result (each parallel call returns a ScoredPoint mock)
      mockSearch.mockResolvedValue([
        {
          score: 0.85,
          payload: {
            chunkIndex: 12,
            text_original: 'Bilingual RAG context',
            text_translated: 'Ngữ cảnh RAG song ngữ',
            userId: 'user-1',
            jobId: 'job-1',
          },
        },
      ]);

      // Mock Gemini Secret and call
      mockGetSecret.mockResolvedValueOnce('mock-gemini-key');
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Câu trả lời so sánh hai bài báo dựa trên [Paper A.pdf - Đoạn 12].',
        },
      });

      const result = await handleSynthesisChat({
        userId: 'user-1',
        jobIds: ['job-1', 'job-2'],
        message: 'So sánh phương pháp nghiên cứu giữa hai bài báo',
      });

      expect(result.answer).toBe('Câu trả lời so sánh hai bài báo dựa trên [Paper A.pdf - Đoạn 12].');
      expect(mockSearch).toHaveBeenCalledTimes(2);
      expect(mockSearch).toHaveBeenNthCalledWith(1, 'vietai-scholar-chunks', {
        vector: [0.1, 0.2, 0.3],
        filter: {
          must: [
            { key: 'userId', match: { value: 'user-1' } },
            { key: 'jobId', match: { value: 'job-1' } },
          ],
        },
        limit: 3,
      });
      expect(mockSearch).toHaveBeenNthCalledWith(2, 'vietai-scholar-chunks', {
        vector: [0.1, 0.2, 0.3],
        filter: {
          must: [
            { key: 'userId', match: { value: 'user-1' } },
            { key: 'jobId', match: { value: 'job-2' } },
          ],
        },
        limit: 3,
      });
    });
  });
});
