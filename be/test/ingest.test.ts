const mockGetResultFromS3 = jest.fn();
const mockGetJobItem = jest.fn();
const mockUpdateJobSummary = jest.fn();
const mockGetSecret = jest.fn();
const mockGetEmbeddingsBatch = jest.fn();

const mockCollectionExists = jest.fn();
const mockCreateCollection = jest.fn();
const mockGetCollections = jest.fn();
const mockUpsert = jest.fn();
const mockGenerateContent = jest.fn();
const mockCreatePayloadIndex = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => {
  return {
    generateContent: (prompt: string) => mockGenerateContent(prompt),
  };
});

jest.mock('../lambda/utils/s3-helpers', () => ({
  getResultFromS3: (key: string) => mockGetResultFromS3(key),
}));

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
  updateJobSummary: (jobId: string, summary: any) => mockUpdateJobSummary(jobId, summary),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
}));

jest.mock('../lambda/utils/ai-providers', () => ({
  getEmbeddingsBatch: (texts: string[], taskType?: string) => mockGetEmbeddingsBatch(texts, taskType),
}));

jest.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: jest.fn().mockImplementation(() => {
      return {
        getCollections: () => mockGetCollections(),
        createCollection: (name: string, config: any) => mockCreateCollection(name, config),
        createPayloadIndex: (name: string, config: any) => mockCreatePayloadIndex(name, config),
        upsert: (name: string, payload: any) => mockUpsert(name, payload),
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
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER',
    }
  };
});

import { handler } from '../lambda/handlers/ingest';

describe('Ingest Handler', () => {
  beforeEach(() => {
    mockGetResultFromS3.mockReset();
    mockGetJobItem.mockReset();
    mockUpdateJobSummary.mockReset();
    mockGetSecret.mockReset();
    mockGetEmbeddingsBatch.mockReset();
    mockGetCollections.mockReset();
    mockCreateCollection.mockReset();
    mockUpsert.mockReset();
    mockGenerateContent.mockReset();
    mockCreatePayloadIndex.mockReset();

    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
    process.env.GEMINI_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key';
    process.env.GROQ_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/groq-key';

    jest.spyOn(global, 'fetch').mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('groq.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    tldr: 'Tóm tắt bài báo về nghiên cứu dịch thuật song ngữ.',
                    keyContributions: [
                      'Đóng góp 1: Cải tiến dịch thuật.',
                      'Đóng góp 2: Nâng cao hiệu năng.'
                    ],
                    methodology: 'Sử dụng LLM và học sâu.',
                    limitations: 'Giới hạn về kích thước đoạn văn.'
                  })
                }
              }
            ]
          }),
          text: () => Promise.resolve('ok')
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('ok')
      } as any);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should successfully parse merged markdown, call Gemini embeddings, generate executive summary, and upsert to Qdrant', async () => {
    // Mock DynamoDB Job item
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-456' },
      jobId: { S: 'job-789' },
    });

    // Mock S3 bilingual markdown file content
    const mockContent = 
      "## English\n\n" +
      "{#chunk-0}This is the first English paragraph.\n\n" +
      "{#chunk-1}This is the second English paragraph.\n\n" +
      "---\n\n" +
      "## Tiếng Việt\n\n" +
      "{#chunk-0}Đây là đoạn tiếng Việt thứ nhất.\n\n" +
      "{#chunk-1}Đây là đoạn tiếng Việt thứ hai.\n\n" +
      "---\n\n" +
      "## 📚 Danh mục tài liệu tham khảo\n\n" +
      "- Reference 1";
    mockGetResultFromS3.mockResolvedValue(mockContent);

    // Mock Secrets
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant-cloud.qdrant.tech',
      apiKey: 'mock-api-key-123',
    }));

    // Mock Nomic embeddings output (2 chunks, 768 dimensions)
    const mockEmbeddings = [
      new Array(768).fill(0.1),
      new Array(768).fill(0.2),
    ];
    mockGetEmbeddingsBatch.mockResolvedValue(mockEmbeddings);

    // Mock Qdrant collections list
    mockGetCollections.mockResolvedValue({ collections: [] });
    mockCreateCollection.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});

    // Mock Gemini Summary Output
    const mockSummaryObj = {
      tldr: 'Tóm tắt bài báo về nghiên cứu dịch thuật song ngữ.',
      keyContributions: [
        'Đóng góp 1: Cải tiến dịch thuật.',
        'Đóng góp 2: Nâng cao hiệu năng.'
      ],
      methodology: 'Sử dụng LLM và học sâu.',
      limitations: 'Giới hạn về kích thước đoạn văn.'
    };
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockSummaryObj)
      }
    });

    const event = {
      jobId: 'job-789',
      outputKey: 'results/job-789/analysis.md',
      chunksCount: 2,
    };

    const result = await handler(event);

    expect(result.jobId).toBe('job-789');
    expect(result.status).toBe('ingested');

    // Verify S3 and DynamoDB calls
    expect(mockGetJobItem).toHaveBeenCalledWith('job-789');
    expect(mockGetResultFromS3).toHaveBeenCalledWith('results/job-789/analysis.md');

    // Verify Nomic embeddings called on original English texts
    expect(mockGetEmbeddingsBatch).toHaveBeenCalledWith([
      'This is the first English paragraph.',
      'This is the second English paragraph.',
    ], 'search_document');

    // Verify Qdrant collection creation and upsert
    expect(mockGetCollections).toHaveBeenCalled();
    expect(mockCreateCollection).toHaveBeenCalledWith('luminary-scholar-chunks', {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });

    expect(mockUpsert).toHaveBeenCalled();

    // Verify Executive Summary is generated and saved via Groq fetch call
    expect(global.fetch).toHaveBeenCalled();
    expect(mockUpdateJobSummary).toHaveBeenCalledWith('job-789', {
      tldr: mockSummaryObj.tldr,
      keyContributions: mockSummaryObj.keyContributions,
      methodology: mockSummaryObj.methodology,
      limitations: mockSummaryObj.limitations
    });
  });

  it('should fallback to Gemini 2.0 Flash for executive summary if Groq fails', async () => {
    // Override fetch mock to fail
    jest.spyOn(global, 'fetch').mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Groq Internal Error')
      } as any);
    });

    // Mock DynamoDB Job item
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-456' },
      jobId: { S: 'job-789' },
    });

    // Mock S3 bilingual markdown file content
    const mockContent = 
      "## English\n\n" +
      "{#chunk-0}This is the first English paragraph.\n\n" +
      "---\n\n" +
      "## Tiếng Việt\n\n" +
      "{#chunk-0}Đây là đoạn tiếng Việt thứ nhất.\n\n" +
      "---\n\n" +
      "## 📚 Danh mục tài liệu tham khảo\n\n" +
      "- Reference 1";
    mockGetResultFromS3.mockResolvedValue(mockContent);

    // Mock Secrets
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant-cloud.qdrant.tech',
      apiKey: 'mock-api-key-123',
    }));

    // Mock Nomic embeddings output (1 chunk, 768 dimensions)
    const mockEmbeddings = [
      new Array(768).fill(0.1),
    ];
    mockGetEmbeddingsBatch.mockResolvedValue(mockEmbeddings);

    // Mock Qdrant collections list
    mockGetCollections.mockResolvedValue({ collections: [] });
    mockCreateCollection.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});

    // Mock Gemini Summary Output
    const mockSummaryObj = {
      tldr: 'Tóm tắt bài báo về nghiên cứu dịch thuật song ngữ.',
      keyContributions: [
        'Đóng góp 1: Cải tiến dịch thuật.'
      ],
      methodology: 'Sử dụng LLM và học sâu.',
      limitations: 'Giới hạn về kích thước đoạn văn.'
    };
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify(mockSummaryObj)
      }
    });

    const event = {
      jobId: 'job-789',
      outputKey: 'results/job-789/analysis.md',
      chunksCount: 1,
    };

    const result = await handler(event);

    expect(result.jobId).toBe('job-789');
    expect(result.status).toBe('ingested');

    // Verify Gemini was called due to Groq failure
    expect(mockGenerateContent).toHaveBeenCalled();
    expect(mockUpdateJobSummary).toHaveBeenCalledWith('job-789', {
      tldr: mockSummaryObj.tldr,
      keyContributions: mockSummaryObj.keyContributions,
      methodology: mockSummaryObj.methodology,
      limitations: mockSummaryObj.limitations
    });
  });
});
