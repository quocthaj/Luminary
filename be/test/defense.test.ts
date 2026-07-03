// ============================================
// TEST: Thesis Defense & Research Copilot
// ============================================

const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetEmbeddingsBatch = jest.fn();
const mockSearch = jest.fn();
const mockDynamoDBSend = jest.fn();
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
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
  THESIS_DEFENSE_SESSIONS_TABLE: 'vietai-thesis-defense-sessions',
  USER_COMPETENCY_PROFILE_TABLE: 'vietai-user-competency-profile',
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
    SchemaType: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      ARRAY: 'ARRAY',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
    }
  };
});

import { 
  handleDefenseSessionInit, 
  handleDefenseSessionAnswer, 
  handleDefenseSessionClose,
  handleCopilotSuggest,
  handleGetCompetencyProfile
} from '../lambda/handlers/defense';

describe('Thesis Defense & Copilot Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.QDRANT_SECRET_ARN = 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/qdrant-config';
  });

  describe('handleDefenseSessionInit()', () => {
    it('creates a new session and returns it when no active session exists', async () => {
      // 1. Mock DynamoDB active session search -> empty
      mockDynamoDBSend.mockResolvedValueOnce({ Items: [] }); // Scan result
      
      // 2. Mock job item lookup
      mockGetJobItem.mockResolvedValueOnce({
        jobId: { S: 'job-123' },
        fileName: { S: 'BaoCaoKhaoSatRAG.pdf' },
        summary: {
          M: {
            tldr: { S: 'Nghiên cứu về tối ưu hóa tham số K trong RAG.' },
            keyContributions: { L: [{ S: 'Cải tiến thuật toán RAG' }] },
            methodology: { S: 'Vector Search' }
          }
        }
      });

      // 3. Mock Gemini initial question generation
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => 'Đóng góp chính của báo cáo này là gì?'
        }
      });

      // 4. Mock DynamoDB save
      mockDynamoDBSend.mockResolvedValueOnce({}); // PutItem result

      const result = await handleDefenseSessionInit({ userId: 'user-789', jobId: 'job-123' });

      expect(result.sessionId).toBeDefined();
      expect(result.status).toBe('ACTIVE');
      expect(result.recent_turns[0].question).toBe('Đóng góp chính của báo cáo này là gì?');
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2);
    });

    it('returns the existing active session if one exists', async () => {
      // Mock existing active session
      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [
          {
            sessionId: { S: 'session-exist-123' },
            userId: { S: 'user-789' },
            jobId: { S: 'job-123' },
            status: { S: 'ACTIVE' },
            recent_turns: {
              L: [
                {
                  M: {
                    question: { S: 'Đóng góp chính là gì?' }
                  }
                }
              ]
            },
            concept_status: { L: [] },
            createdAt: { S: '2026-07-01T00:00:00Z' },
            updatedAt: { S: '2026-07-01T00:00:00Z' }
          }
        ]
      });

      const result = await handleDefenseSessionInit({ userId: 'user-789', jobId: 'job-123' });

      expect(result.sessionId).toBe('session-exist-123');
      expect(result.status).toBe('ACTIVE');
      expect(mockGetJobItem).not.toHaveBeenCalled();
    });
  });

  describe('handleDefenseSessionAnswer()', () => {
    it('runs the 2-step evaluation and planning loop for user answer', async () => {
      // 1. Mock existing session state
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          sessionId: { S: 'session-123' },
          userId: { S: 'user-789' },
          jobId: { S: 'job-123' },
          status: { S: 'ACTIVE' },
          recent_turns: {
            L: [
              {
                M: {
                  question: { S: 'Đóng góp chính là gì?' }
                }
              }
            ]
          },
          concept_status: { L: [] },
          createdAt: { S: '2026-07-01T00:00:00Z' },
          updatedAt: { S: '2026-07-01T00:00:00Z' }
        }
      });

      // Mock secrets and embeddings for vectorSearch RAG context
      mockGetSecret.mockResolvedValueOnce(JSON.stringify({ url: 'https://mock.qdrant', apiKey: 'key' }));
      mockGetEmbeddingsBatch.mockResolvedValueOnce([[0.1, 0.2]]);
      mockSearch.mockResolvedValueOnce([
        {
          payload: {
            chunkIndex: 1,
            text_translated: 'Đóng góp chính của chúng tôi là đề xuất cơ chế tự học.'
          }
        }
      ]);

      // 2. Mock Evaluator (Step 1)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            convincing: true,
            gaps: [],
            concepts_evaluated: [
              {
                concept_id: "rag_contributions",
                verdict: "MASTERED",
                gap_summary: ""
              }
            ]
          })
        }
      });

      // 3. Mock Planner (Step 2)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            thinking_steps: ["Đang phân tích câu trả lời...", "Nhận thấy học viên nắm rõ đóng góp.", "Đang soạn câu hỏi tiếp theo..."],
            action: "switch",
            next_question: "Hãy giải thích thêm về phương pháp đánh giá thực nghiệm."
          })
        }
      });

      // 4. Mock save session update
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handleDefenseSessionAnswer({
        userId: 'user-789',
        sessionId: 'session-123',
        userAnswer: 'Chúng tôi cải tiến RAG bằng cơ chế tự học.'
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.thinking_steps).toContain('Đang phân tích câu trả lời...');
      expect(result.next_question).toBe('Hãy giải thích thêm về phương pháp đánh giá thực nghiệm.');
      expect(result.concept_status).toContainEqual(expect.objectContaining({
        concept_id: 'rag_contributions',
        status: 'MASTERED'
      }));
    });

    it('automatically archives session facts to long-term memory on conclude action', async () => {
      // 1. Mock existing session state
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          sessionId: { S: 'session-123' },
          userId: { S: 'user-789' },
          jobId: { S: 'job-123' },
          status: { S: 'ACTIVE' },
          recent_turns: {
            L: [
              {
                M: {
                  question: { S: 'Đóng góp chính là gì?' }
                }
              }
            ]
          },
          concept_status: { L: [] },
          createdAt: { S: '2026-07-01T00:00:00Z' },
          updatedAt: { S: '2026-07-01T00:00:00Z' }
        }
      });

      // Mock secrets and embeddings for vectorSearch RAG context
      mockGetSecret.mockResolvedValueOnce(JSON.stringify({ url: 'https://mock.qdrant', apiKey: 'key' }));
      mockGetEmbeddingsBatch.mockResolvedValueOnce([[0.1, 0.2]]);
      mockSearch.mockResolvedValueOnce([
        {
          payload: {
            chunkIndex: 1,
            text_translated: 'Đóng góp chính của chúng tôi là đề xuất cơ chế tự học.'
          }
        }
      ]);

      // 2. Mock Evaluator (Step 1)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            convincing: true,
            gaps: [],
            concepts_evaluated: [
              {
                concept_id: "rag_contributions",
                verdict: "MASTERED",
                gap_summary: ""
              }
            ]
          })
        }
      });

      // 3. Mock Planner with action "conclude" (Step 2)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            thinking_steps: ["Đang phân tích...", "Đã đánh giá đủ.", "Đang kết thúc phiên bảo vệ."],
            action: "conclude",
            next_question: "Cảm ơn bạn đã hoàn thành phiên bảo vệ luận án giả lập."
          })
        }
      });

      // 4. Mock extractSessionFacts LLM call (called during auto-archive)
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([
            {
              concept_id: "rag_contributions",
              verdict: "MASTERED",
              gap_summary: ""
            }
          ])
        }
      });

      // 5. Mock getProfile lookup (no existing profile concept record)
      mockDynamoDBSend.mockResolvedValueOnce({ Item: null });

      // 6. Mock putProfile save competency record
      mockDynamoDBSend.mockResolvedValueOnce({});

      // 7. Mock save session update (with status CLOSED and archivedAt set)
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handleDefenseSessionAnswer({
        userId: 'user-789',
        sessionId: 'session-123',
        userAnswer: 'Chúng tôi cải tiến RAG bằng cơ chế tự học.'
      });

      expect(result.status).toBe('CLOSED');
      expect(result.report).toBeDefined();
      expect(result.report.facts).toContainEqual(expect.objectContaining({
        concept_id: 'rag_contributions',
        verdict: 'MASTERED'
      }));
    });
  });

  describe('handleDefenseSessionClose()', () => {
    it('closes the session and updates the competency profile', async () => {
      // 1. Mock existing session state
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          sessionId: { S: 'session-123' },
          userId: { S: 'user-789' },
          jobId: { S: 'job-123' },
          status: { S: 'ACTIVE' },
          recent_turns: { L: [] },
          concept_status: {
            L: [
              {
                M: {
                  concept_id: { S: 'rag_contributions' },
                  status: { S: 'MASTERED' }
                }
              }
            ]
          },
          createdAt: { S: '2026-07-01T00:00:00Z' },
          updatedAt: { S: '2026-07-01T00:00:00Z' }
        }
      });

      // 2. Mock extractSessionFacts LLM call
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify([
            {
              concept_id: 'rag_contributions',
              verdict: 'MASTERED',
              gap_summary: ''
            }
          ])
        }
      });

      // 3. Mock getProfile lookup (no existing profile concept record)
      mockDynamoDBSend.mockResolvedValueOnce({ Item: null });

      // 4. Mock putProfile save competency record
      mockDynamoDBSend.mockResolvedValueOnce({});

      // 5. Mock save session update (CLOSED status + archivedAt)
      mockDynamoDBSend.mockResolvedValueOnce({});

      const result = await handleDefenseSessionClose({
        userId: 'user-789',
        sessionId: 'session-123'
      });

      expect(result.status).toBe('CLOSED');
      expect(result.report.facts).toContainEqual(expect.objectContaining({
        concept_id: 'rag_contributions',
        verdict: 'MASTERED'
      }));
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(4);
    });

    it('returns early without re-archiving if the session is already archived', async () => {
      // 1. Mock existing session state that is already archived
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          sessionId: { S: 'session-123' },
          userId: { S: 'user-789' },
          jobId: { S: 'job-123' },
          status: { S: 'CLOSED' },
          recent_turns: { L: [] },
          concept_status: {
            L: [
              {
                M: {
                  concept_id: { S: 'rag_contributions' },
                  status: { S: 'MASTERED' }
                }
              }
            ]
          },
          createdAt: { S: '2026-07-01T00:00:00Z' },
          updatedAt: { S: '2026-07-01T00:00:00Z' },
          archivedAt: { S: '2026-07-01T00:05:00Z' }
        }
      });

      const result = await handleDefenseSessionClose({
        userId: 'user-789',
        sessionId: 'session-123'
      });

      expect(result.status).toBe('CLOSED');
      expect(result.report.alreadyArchived).toBe(true);
      expect(result.report.facts).toEqual([]);
      // Should only call GetItemCommand, no PutItemCommand or LLM calls
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });
  });

  describe('handleCopilotSuggest()', () => {
    it('returns smart suggestions based on user profile and gaps', async () => {
      // 1. Mock queryUserProfile DynamoDB lookup
      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [
          {
            PK: { S: 'USER#user-789' },
            SK: { S: 'CONCEPT#rag_limits' },
            mastery_score: { N: '0.3' },
            status: { S: 'GAP' },
            gap_history: { L: [] },
            last_reviewed_at: { S: '2026-06-20T00:00:00Z' }, // More than 7 days ago
            review_count: { N: '2' },
            updated_at: { S: '2026-06-20T00:00:00Z' }
          }
        ]
      });

      // 2. Mock active session gap lookup
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          sessionId: { S: 'session-123' },
          userId: { S: 'user-789' },
          jobId: { S: 'job-123' },
          status: { S: 'ACTIVE' },
          recent_turns: { L: [] },
          concept_status: {
            L: [
              {
                M: {
                  concept_id: { S: 'rag_eval' },
                  status: { S: 'WARNING' },
                  last_gap_summary: { S: 'Học viên chưa giải thích rõ F1-score.' }
                }
              }
            ]
          },
          createdAt: { S: '2026-07-01T00:00:00Z' },
          updatedAt: { S: '2026-07-01T00:00:00Z' }
        }
      });

      // 3. Mock Gemini suggestion generator
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            suggestions: [
              {
                title: "Xem lại giới hạn thuật toán",
                description: "Khái niệm rag_limits của bạn đang ở mức GAP. Hãy đọc thêm tài liệu để củng cố lý thuyết.",
                action: "READ_MORE",
                payload: "rag_limits"
              }
            ]
          })
        }
      });

      const result = await handleCopilotSuggest({
        userId: 'user-789',
        jobId: 'job-123',
        sessionId: 'session-123'
      });

      expect(result.suggestions[0].title).toBe('Xem lại giới hạn thuật toán');
      expect(result.suggestions[0].action).toBe('READ_MORE');
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleGetCompetencyProfile()', () => {
    it('retrieves the decayed competency profile for a user', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [
          {
            PK: { S: 'USER#user-789' },
            SK: { S: 'CONCEPT#rag_limits' },
            mastery_score: { N: '0.85' },
            status: { S: 'MASTERED' },
            gap_history: { L: [] },
            last_reviewed_at: { S: new Date().toISOString() },
            review_count: { N: '2' },
            updated_at: { S: new Date().toISOString() }
          }
        ]
      });

      const result = await handleGetCompetencyProfile({
        userId: 'user-789'
      });

      expect(result.profile.rag_limits).toBeDefined();
      expect(result.profile.rag_limits.status).toBe('MASTERED');
      expect(result.profile.rag_limits.mastery_score).toBeCloseTo(0.85);
    });
  });
});
