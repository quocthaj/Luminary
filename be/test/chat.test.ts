const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetGeminiEmbeddingsBatch = jest.fn();
const mockSearch = jest.fn();
const mockGenerateContent = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => {
  return {
    generateContent: (prompt: string) => mockGenerateContent(prompt),
  };
});

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
}));

jest.mock('../lambda/utils/ai-providers', () => ({
  getGeminiEmbeddingsBatch: (texts: string[]) => mockGetGeminiEmbeddingsBatch(texts),
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

import { handleChatJob } from '../lambda/handlers/chat';

describe('Chat Handler - RAG QA Assistant', () => {
  beforeEach(() => {
    mockGetJobItem.mockReset();
    mockGetSecret.mockReset();
    mockGetGeminiEmbeddingsBatch.mockReset();
    mockSearch.mockReset();
    mockGenerateContent.mockReset();

    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
  });

  it('should successfully search Qdrant and generate response with Gemini', async () => {
    // 1. Mock DynamoDB Job ownership
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-123' },
      jobId: { S: 'job-abc' },
    });

    // 2. Mock Secrets
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant.tech',
      apiKey: 'mock-key',
    }));

    // 3. Mock Embedding
    mockGetGeminiEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

    // 4. Mock Qdrant Search Result
    mockSearch.mockResolvedValue([
      {
        payload: {
          chunkIndex: 5,
          text_original: 'This is the source paragraph.',
          text_translated: 'Đây là đoạn nguồn.',
          userId: 'user-123',
          jobId: 'job-abc',
        },
      },
    ]);

    // 5. Mock Gemini Response
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => 'Câu trả lời trích xuất từ tài liệu [Đoạn 5].',
      },
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'Giải thích đoạn 5',
    };

    const result = await handleChatJob(event);

    expect(result.answer).toBe('Câu trả lời trích xuất từ tài liệu [Đoạn 5].');
    expect(mockGetJobItem).toHaveBeenCalledWith('job-abc');
    expect(mockSearch).toHaveBeenCalledWith('vietai-scholar-chunks', {
      vector: [0.1, 0.2, 0.3],
      filter: {
        must: [
          { key: 'userId', match: { value: 'user-123' } },
          { key: 'jobId', match: { value: 'job-abc' } },
        ],
      },
      limit: 4,
    });
    expect(mockGenerateContent).toHaveBeenCalled();
  });

  it('should throw an error if the job is not found in DynamoDB', async () => {
    mockGetJobItem.mockResolvedValue(null);

    const event = {
      jobId: 'job-invalid',
      userId: 'user-123',
      message: 'hello',
    };

    await expect(handleChatJob(event)).rejects.toThrow('JOB_NOT_FOUND');
  });

  it('should throw an error if the job belongs to another user', async () => {
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-other' },
      jobId: { S: 'job-abc' },
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'hello',
    };

    await expect(handleChatJob(event)).rejects.toThrow('FORBIDDEN');
  });

  it('should return error message if query message is empty', async () => {
    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: '',
    };

    const result = await handleChatJob(event);
    expect(result.answer).toContain('Vui lòng cung cấp');
  });
});
