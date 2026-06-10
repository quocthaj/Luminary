const mockGetResultFromS3 = jest.fn();
const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetGeminiEmbeddingsBatch = jest.fn();

const mockCollectionExists = jest.fn();
const mockCreateCollection = jest.fn();
const mockGetCollections = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../lambda/utils/s3-helpers', () => ({
  getResultFromS3: (key: string) => mockGetResultFromS3(key),
}));

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
}));

jest.mock('../lambda/utils/ai-providers', () => ({
  getGeminiEmbeddingsBatch: (texts: string[]) => mockGetGeminiEmbeddingsBatch(texts),
}));

jest.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: jest.fn().mockImplementation(() => {
      return {
        getCollections: () => mockGetCollections(),
        createCollection: (name: string, config: any) => mockCreateCollection(name, config),
        upsert: (name: string, payload: any) => mockUpsert(name, payload),
      };
    }),
  };
});

import { handler } from '../lambda/handlers/ingest';

describe('Ingest Handler', () => {
  beforeEach(() => {
    mockGetResultFromS3.mockReset();
    mockGetJobItem.mockReset();
    mockGetSecret.mockReset();
    mockGetGeminiEmbeddingsBatch.mockReset();
    mockGetCollections.mockReset();
    mockCreateCollection.mockReset();
    mockUpsert.mockReset();

    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
  });

  it('should successfully parse merged markdown, call Gemini embeddings, and upsert points to Qdrant', async () => {
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

    // Mock Qdrant config secret
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant-cloud.qdrant.tech',
      apiKey: 'mock-api-key-123',
    }));

    // Mock Gemini embeddings output (2 chunks, 768 dimensions)
    const mockEmbeddings = [
      new Array(768).fill(0.1),
      new Array(768).fill(0.2),
    ];
    mockGetGeminiEmbeddingsBatch.mockResolvedValue(mockEmbeddings);

    // Mock Qdrant collections list (empty collection list initially)
    mockGetCollections.mockResolvedValue({ collections: [] });
    mockCreateCollection.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});

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

    // Verify Gemini embeddings called on original English texts
    expect(mockGetGeminiEmbeddingsBatch).toHaveBeenCalledWith([
      'This is the first English paragraph.',
      'This is the second English paragraph.',
    ]);

    // Verify Qdrant collection creation and upsert
    expect(mockGetCollections).toHaveBeenCalled();
    expect(mockCreateCollection).toHaveBeenCalledWith('vietai-scholar-chunks', {
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    });

    expect(mockUpsert).toHaveBeenCalled();
    const upsertCall = mockUpsert.mock.calls[0];
    expect(upsertCall[0]).toBe('vietai-scholar-chunks');
    expect(upsertCall[1].points).toHaveLength(2);
    expect(upsertCall[1].points[0].payload.userId).toBe('user-456');
    expect(upsertCall[1].points[0].payload.jobId).toBe('job-789');
    expect(upsertCall[1].points[0].payload.chunkIndex).toBe(0);
    expect(upsertCall[1].points[0].payload.text_original).toBe('This is the first English paragraph.');
    expect(upsertCall[1].points[0].payload.text_translated).toBe('Đây là đoạn tiếng Việt thứ nhất.');
  });
});
