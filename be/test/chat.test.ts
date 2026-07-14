const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetEmbeddingsBatch = jest.fn();
const mockSearch = jest.fn();
const mockScroll = jest.fn();
const mockGenerateContent = jest.fn();

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
}));

jest.mock('../lambda/utils/ai-providers', () => ({
  getEmbeddingsBatch: (texts: string[], taskType?: string) => mockGetEmbeddingsBatch(texts, taskType),
}));

jest.mock('@qdrant/js-client-rest', () => {
  return {
    QdrantClient: jest.fn().mockImplementation(() => {
      return {
        search: (name: string, query: any) => mockSearch(name, query),
        scroll: (name: string, query: any) => mockScroll(name, query),
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

import { handleChatJob } from '../lambda/handlers/chat';

describe('Chat Handler - RAG QA Assistant', () => {
  beforeEach(() => {
    mockGetJobItem.mockReset();
    mockGetSecret.mockReset();
    mockGetEmbeddingsBatch.mockReset();
    mockSearch.mockReset();
    mockScroll.mockReset();
    mockGenerateContent.mockReset();

    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
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
                  content: 'Đây là câu trả lời dự phòng từ Groq Llama.'
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

  it('should successfully search Qdrant and generate response with Gemini using tools', async () => {
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
    mockGetEmbeddingsBatch.mockResolvedValue([[0.1, 0.2, 0.3]]);

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

    // 5. Mock Gemini Response (Tool call then final answer)
    // First call asks to run vectorSearch
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'vectorSearch',
                    args: { query: 'machine learning' }
                  }
                }
              ]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [
          {
            name: 'vectorSearch',
            args: { query: 'machine learning' }
          }
        ],
        text: () => ''
      }
    });

    // Second call gives final answer
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Câu trả lời trích xuất từ tài liệu [Đoạn 5].' }]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [],
        text: () => 'Câu trả lời trích xuất từ tài liệu [Đoạn 5].'
      }
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'Giải thích đoạn 5',
    };

    const result = await handleChatJob(event);

    expect(result.answer).toBe('Câu trả lời trích xuất từ tài liệu [Đoạn 5].');
    expect(mockGetJobItem).toHaveBeenCalledWith('job-abc');
    expect(mockGetEmbeddingsBatch).toHaveBeenCalledWith(['machine learning'], 'search_query');
    expect(mockSearch).toHaveBeenCalledWith('luminary-scholar-chunks', {
      vector: [0.1, 0.2, 0.3],
      filter: {
        must: [
          { key: 'userId', match: { value: 'user-123' } },
          { key: 'jobId', match: { value: 'job-abc' } },
        ],
      },
      limit: 4,
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it('should support fetchAdjacentParagraphs tool using Qdrant scroll', async () => {
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-123' },
      jobId: { S: 'job-abc' },
    });
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant.tech',
      apiKey: 'mock-key',
    }));

    // Mock Qdrant Scroll API response
    mockScroll.mockResolvedValue({
      points: [
        {
          payload: {
            chunkIndex: 4,
            text_original: 'Adjacent prev original',
            text_translated: 'Adjacent prev translated'
          }
        }
      ]
    });

    // Mock Gemini calls tool fetchAdjacentParagraphs
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'fetchAdjacentParagraphs',
                    args: { chunkIndex: 5, direction: 'prev', count: 1 }
                  }
                }
              ]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [
          {
            name: 'fetchAdjacentParagraphs',
            args: { chunkIndex: 5, direction: 'prev', count: 1 }
          }
        ],
        text: () => ''
      }
    });

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Đoạn lân cận chứa thông tin bổ sung [Đoạn 4].' }]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [],
        text: () => 'Đoạn lân cận chứa thông tin bổ sung [Đoạn 4].'
      }
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'Lấy đoạn văn trước đoạn 5',
    };

    const result = await handleChatJob(event);
    expect(result.answer).toBe('Đoạn lân cận chứa thông tin bổ sung [Đoạn 4].');
    expect(mockScroll).toHaveBeenCalledWith('luminary-scholar-chunks', {
      filter: {
        must: [
          { key: 'jobId', match: { value: 'job-abc' } },
          { key: 'chunkIndex', match: { any: [4] } }
        ]
      },
      limit: 1,
      with_payload: true,
      with_vector: false
    });
  });

  it('should support readExecutiveSummary tool retrieving from DynamoDB summary', async () => {
    const mockSummary = {
      tldr: { S: 'Tóm tắt bài báo.' },
      keyContributions: { L: [{ S: 'Đóng góp A' }] },
      methodology: { S: 'Phương pháp B' },
      limitations: { S: 'Hạn chế C' }
    };
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-123' },
      jobId: { S: 'job-abc' },
      summary: { M: mockSummary }
    });
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant.tech',
      apiKey: 'mock-key',
    }));

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'readExecutiveSummary',
                    args: {}
                  }
                }
              ]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [
          {
            name: 'readExecutiveSummary',
            args: {}
          }
        ],
        text: () => ''
      }
    });

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Đóng góp chính là Đóng góp A.' }]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [],
        text: () => 'Đóng góp chính là Đóng góp A.'
      }
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'Đóng góp chính của bài viết này là gì?',
    };

    const result = await handleChatJob(event);
    expect(result.answer).toBe('Đóng góp chính là Đóng góp A.');
  });

  it('should support searchExternalPapers tool querying Semantic Scholar API', async () => {
    mockGetJobItem.mockResolvedValue({
      userId: { S: 'user-123' },
      jobId: { S: 'job-abc' },
    });
    mockGetSecret.mockResolvedValue(JSON.stringify({
      url: 'https://mock-qdrant.tech',
      apiKey: 'mock-key',
    }));

    // Mock fetch for Semantic Scholar search
    const mockPapers = {
      data: [
        {
          paperId: 'paper-111',
          title: 'Attention Is All You Need',
          authors: [{ name: 'Ashish Vaswani' }],
          year: 2017,
          abstract: 'The dominant sequence transduction models...',
          url: 'https://semanticscholar.org/paper/111',
          openAccessPdf: { url: 'https://arxiv.org/pdf/1706.03762.pdf' }
        }
      ]
    };

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url: any) => {
      if (typeof url === 'string' && url.includes('api.semanticscholar.org')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockPapers),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ choices: [{ message: { content: 'Groq response' } }] }),
        text: () => Promise.resolve('ok')
      } as any);
    });

    // Mock Gemini calling tool
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'searchExternalPapers',
                    args: { query: 'attention mechanism', limit: 2 }
                  }
                }
              ]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [
          {
            name: 'searchExternalPapers',
            args: { query: 'attention mechanism', limit: 2 }
          }
        ],
        text: () => ''
      }
    });

    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Đây là các bài viết liên quan: [Attention Is All You Need](https://semanticscholar.org/paper/111)' }]
            },
            finishReason: 'STOP'
          }
        ],
        functionCalls: () => [],
        text: () => 'Đây là các bài viết liên quan: [Attention Is All You Need](https://semanticscholar.org/paper/111)'
      }
    });

    const event = {
      jobId: 'job-abc',
      userId: 'user-123',
      message: 'Tìm tài liệu liên quan về attention mechanism',
    };

    const result = await handleChatJob(event);
    expect(result.answer).toContain('Attention Is All You Need');
    expect(fetchSpy).toHaveBeenCalled();
  });
});
