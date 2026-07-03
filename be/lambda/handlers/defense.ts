// ============================================
// HANDLER: Thesis Defense & Research Copilot
// ============================================

import { 
  GetItemCommand, 
  PutItemCommand, 
  ScanCommand, 
  QueryCommand 
} from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

import { 
  dynamodbClient, 
  getSecret, 
  GEMINI_SECRET_ARN,
  THESIS_DEFENSE_SESSIONS_TABLE,
  USER_COMPETENCY_PROFILE_TABLE
} from '../utils/aws-clients';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getEmbeddingsBatch } from '../utils/ai-providers';
import { 
  SessionFact, 
  UserCompetencyProfile, 
  scoreToStatus, 
  clamp, 
  trimToN, 
  applyDecay 
} from '../utils/competency';

const COLLECTION_NAME = 'vietai-scholar-chunks';
let qdrantClientInstance: QdrantClient | null = null;
let geminiGenAIInstance: GoogleGenerativeAI | null = null;

async function getQdrantClient(): Promise<QdrantClient> {
  if (!qdrantClientInstance) {
    const qdrantSecretArn = process.env.QDRANT_SECRET_ARN || '';
    if (!qdrantSecretArn) {
      throw new Error('QDRANT_SECRET_ARN environment variable is not defined');
    }
    const qdrantSecretStr = await getSecret(qdrantSecretArn);
    const qdrantConfig = JSON.parse(qdrantSecretStr);
    const qdrantUrl = qdrantConfig.url;
    const qdrantApiKey = qdrantConfig.apiKey;

    if (!qdrantUrl) {
      throw new Error('Qdrant URL is not defined in secret config');
    }

    qdrantClientInstance = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });
  }
  return qdrantClientInstance;
}

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (!geminiGenAIInstance) {
    const geminiSecretStr = await getSecret(GEMINI_SECRET_ARN);
    geminiGenAIInstance = new GoogleGenerativeAI(geminiSecretStr);
  }
  return geminiGenAIInstance;
}

// ============================================
// DYNAMODB SCHEMAS & HELPERS
// ============================================

interface SessionTurn {
  question: string;
  answer?: string;
  convincing?: boolean;
  gaps?: string[];
}

interface ConceptStatus {
  concept_id: string;
  status: 'MASTERED' | 'WARNING' | 'GAP';
  last_gap_summary?: string;
}

interface DefenseSession {
  sessionId: string;
  userId: string;
  jobId: string;
  status: 'ACTIVE' | 'CLOSED';
  recent_turns: SessionTurn[];
  concept_status: ConceptStatus[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

function marshallSession(session: DefenseSession): Record<string, any> {
  return {
    sessionId: { S: session.sessionId },
    userId: { S: session.userId },
    jobId: { S: session.jobId },
    status: { S: session.status },
    recent_turns: {
      L: session.recent_turns.map(turn => ({
        M: {
          question: { S: turn.question },
          ...(turn.answer ? { answer: { S: turn.answer } } : {}),
          ...(turn.convincing !== undefined ? { convincing: { BOOL: turn.convincing } } : {}),
          ...(turn.gaps ? { gaps: { L: turn.gaps.map(g => ({ S: g })) } } : {})
        }
      }))
    },
    concept_status: {
      L: session.concept_status.map(cs => ({
        M: {
          concept_id: { S: cs.concept_id },
          status: { S: cs.status },
          ...(cs.last_gap_summary ? { last_gap_summary: { S: cs.last_gap_summary } } : {})
        }
      }))
    },
    createdAt: { S: session.createdAt },
    updatedAt: { S: session.updatedAt },
    ...(session.archivedAt ? { archivedAt: { S: session.archivedAt } } : {})
  };
}

function unmarshallSession(item: Record<string, any>): DefenseSession {
  const recentTurnsList = item.recent_turns?.L || [];
  const recent_turns: SessionTurn[] = recentTurnsList.map((val: any) => {
    const m = val.M || {};
    return {
      question: m.question?.S || '',
      answer: m.answer?.S,
      convincing: m.convincing ? m.convincing.BOOL : undefined,
      gaps: m.gaps?.L ? m.gaps.L.map((gVal: any) => gVal.S || '') : undefined
    };
  });

  const conceptStatusList = item.concept_status?.L || [];
  const concept_status: ConceptStatus[] = conceptStatusList.map((val: any) => {
    const m = val.M || {};
    return {
      concept_id: m.concept_id?.S || '',
      status: (m.status?.S || 'GAP') as 'MASTERED' | 'WARNING' | 'GAP',
      last_gap_summary: m.last_gap_summary?.S
    };
  });

  return {
    sessionId: item.sessionId?.S || '',
    userId: item.userId?.S || '',
    jobId: item.jobId?.S || '',
    status: (item.status?.S || 'ACTIVE') as 'ACTIVE' | 'CLOSED',
    recent_turns,
    concept_status,
    createdAt: item.createdAt?.S || '',
    updatedAt: item.updatedAt?.S || '',
    archivedAt: item.archivedAt?.S
  };
}

async function getProfile(userId: string, conceptId: string): Promise<UserCompetencyProfile | null> {
  const res = await dynamodbClient.send(
    new GetItemCommand({
      TableName: USER_COMPETENCY_PROFILE_TABLE,
      Key: {
        PK: { S: `USER#${userId}` },
        SK: { S: `CONCEPT#${conceptId}` }
      }
    })
  );

  if (!res.Item) return null;

  const item = res.Item;
  const gapHistoryList = item.gap_history?.L || [];
  const gap_history = gapHistoryList.map((val: any) => {
    const m = val.M || {};
    return {
      session_id: m.session_id?.S || '',
      gap_summary: m.gap_summary?.S || '',
      timestamp: m.timestamp?.S || ''
    };
  });

  return {
    PK: item.PK?.S || '',
    SK: item.SK?.S || '',
    mastery_score: item.mastery_score?.N ? parseFloat(item.mastery_score.N) : 0,
    status: (item.status?.S || 'GAP') as 'MASTERED' | 'WARNING' | 'GAP',
    gap_history,
    last_reviewed_at: item.last_reviewed_at?.S || '',
    review_count: item.review_count?.N ? parseInt(item.review_count.N) : 0,
    updated_at: item.updated_at?.S || ''
  };
}

async function putProfile(userId: string, conceptId: string, profile: Omit<UserCompetencyProfile, 'PK' | 'SK'> & { PK: string, SK: string }) {
  await dynamodbClient.send(
    new PutItemCommand({
      TableName: USER_COMPETENCY_PROFILE_TABLE,
      Item: {
        PK: { S: profile.PK },
        SK: { S: profile.SK },
        mastery_score: { N: profile.mastery_score.toString() },
        status: { S: profile.status },
        gap_history: {
          L: profile.gap_history.map(gap => ({
            M: {
              session_id: { S: gap.session_id },
              gap_summary: { S: gap.gap_summary },
              timestamp: { S: gap.timestamp }
            }
          }))
        },
        last_reviewed_at: { S: profile.last_reviewed_at },
        review_count: { N: profile.review_count.toString() },
        updated_at: { S: profile.updated_at }
      }
    })
  );
}

// ============================================
// VECTORS / RAG CONTEXT HELPER
// ============================================

async function vectorSearch(jobId: string, userId: string, query: string): Promise<string> {
  try {
    const [embedding] = await getEmbeddingsBatch([query], 'search_query');
    if (!embedding) return '';

    const qdrantClient = await getQdrantClient();
    const searchResults = await qdrantClient.search(COLLECTION_NAME, {
      vector: embedding,
      filter: {
        must: [
          { key: 'userId', match: { value: userId } },
          { key: 'jobId', match: { value: jobId } }
        ]
      },
      limit: 3,
    });

    return searchResults.map((hit) => {
      const payload = hit.payload || {};
      return `[Đoạn ${payload.chunkIndex}]: ${payload.text_translated || payload.text_original || ''}`;
    }).join('\n\n');
  } catch (err) {
    console.error('Vector search failed for defense:', err);
    return '';
  }
}

// ============================================
// INITIAL QUESTION GENERATION
// ============================================

async function generateInitialQuestion(jobItem: Record<string, any>): Promise<string> {
  const title = jobItem.fileName?.S || 'Nghiên cứu khoa học';
  const summaryAttr = jobItem.summary?.M;
  let summaryText = '';
  if (summaryAttr) {
    summaryText = `
TL;DR: ${summaryAttr.tldr?.S || ''}
Contributions: ${summaryAttr.keyContributions?.L?.map((item: any) => item.S || '').join(', ') || ''}
Methodology: ${summaryAttr.methodology?.S || ''}
`;
  }

  const prompt = `
Bạn là một AI giám khảo phản biện luận án khoa học.
Hãy đọc thông tin về đề tài nghiên cứu sau và viết một câu hỏi mở đầu tiên để bắt đầu phiên bảo vệ.
Câu hỏi cần mang tính học thuật chuyên sâu nhưng mở đầu thân thiện, yêu cầu người bảo vệ tóm tắt hoặc làm rõ đóng góp cốt lõi/phương pháp nghiên cứu.

Tên đề tài: ${title}
Tóm tắt đề tài:
${summaryText}

Lưu ý: Phản hồi bằng tiếng Việt, trực tiếp đưa ra câu hỏi, không thêm lời chào hay dẫn dắt thừa thãi của AI.
`;

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error('Failed to generate initial question, using default:', err);
    return `Chào mừng bạn đến với phiên phản biện đề tài "${title}". Để bắt đầu, xin vui lòng tóm tắt ngắn gọn đóng góp khoa học chính hoặc phương pháp nghiên cứu mà bạn đã áp dụng trong đề tài này.`;
  }
}

// ============================================
// 1. INITIALIZE / RESTORE SESSION
// ============================================

export async function handleDefenseSessionInit(input: { userId: string; jobId?: string; sessionId?: string }): Promise<any> {
  const { userId, jobId, sessionId } = input;

  if (sessionId) {
    const res = await dynamodbClient.send(
      new GetItemCommand({
        TableName: THESIS_DEFENSE_SESSIONS_TABLE,
        Key: { sessionId: { S: sessionId } }
      })
    );
    if (!res.Item) {
      throw new Error('SESSION_NOT_FOUND');
    }
    const session = unmarshallSession(res.Item);
    if (session.userId !== userId) {
      throw new Error('FORBIDDEN');
    }
    return session;
  }

  if (!jobId) {
    throw new Error('JOB_ID_OR_SESSION_ID_REQUIRED');
  }

  // Query active session for this user and jobId
  const scanResult = await dynamodbClient.send(
    new ScanCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      FilterExpression: 'userId = :userId AND jobId = :jobId AND #status = :activeStatus',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':userId': { S: userId },
        ':jobId': { S: jobId },
        ':activeStatus': { S: 'ACTIVE' }
      }
    })
  );

  if (scanResult.Items && scanResult.Items.length > 0) {
    return unmarshallSession(scanResult.Items[0]);
  }

  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const initialQuestion = await generateInitialQuestion(jobItem);

  const newSessionId = uuidv4();
  const now = new Date().toISOString();
  const newSession: DefenseSession = {
    sessionId: newSessionId,
    userId,
    jobId,
    status: 'ACTIVE',
    recent_turns: [
      {
        question: initialQuestion
      }
    ],
    concept_status: [],
    createdAt: now,
    updatedAt: now
  };

  await dynamodbClient.send(
    new PutItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Item: marshallSession(newSession)
    })
  );

  return newSession;
}

// ============================================
// 2. SUBMIT ANSWER & EXECUTE REASONING LOOP
// ============================================

export async function handleDefenseSessionAnswer(input: { userId: string; sessionId: string; userAnswer: string }): Promise<any> {
  const { userId, sessionId, userAnswer } = input;
  if (!sessionId || !userAnswer || userAnswer.trim() === '') {
    throw new Error('INVALID_INPUT');
  }

  // 1. Fetch current session
  const res = await dynamodbClient.send(
    new GetItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Key: { sessionId: { S: sessionId } }
    })
  );
  if (!res.Item) {
    throw new Error('SESSION_NOT_FOUND');
  }
  const session = unmarshallSession(res.Item);
  if (session.userId !== userId) {
    throw new Error('FORBIDDEN');
  }
  if (session.status === 'CLOSED') {
    throw new Error('SESSION_CLOSED');
  }

  const lastTurn = session.recent_turns[session.recent_turns.length - 1];
  if (!lastTurn || lastTurn.answer !== undefined) {
    throw new Error('NO_ACTIVE_QUESTION');
  }

  // 2. Query vector DB context based on question + answer
  const ragContext = await vectorSearch(session.jobId, userId, `${lastTurn.question} ${userAnswer}`);

  // 3. Step 1: Evaluator (Reflect)
  const genAI = await getGeminiClient();
  const evaluatorModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          convincing: { type: SchemaType.BOOLEAN },
          gaps: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          },
          concepts_evaluated: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: {
                concept_id: { type: SchemaType.STRING },
                verdict: { type: SchemaType.STRING, enum: ['MASTERED', 'WARNING', 'GAP'] } as any,
                gap_summary: { type: SchemaType.STRING }
              },
              required: ['concept_id', 'verdict']
            }
          }
        },
        required: ['convincing', 'gaps', 'concepts_evaluated']
      }
    }
  });

  const evaluatorPrompt = `
Bạn là một AI giám khảo phản biện luận án khoa học (Evaluator).
Nhiệm vụ của bạn là đánh giá tính thuyết phục của câu trả lời từ người bảo vệ.

Ngữ cảnh tham chiếu từ tài liệu gốc:
---
${ragContext}
---

Lịch sử đối thoại gần đây (recent turns):
${JSON.stringify(session.recent_turns.slice(-2), null, 2)}

Câu hỏi phản biện: "${lastTurn.question}"
Câu trả lời của học viên: "${userAnswer}"

Hãy chấm điểm xem câu trả lời có thuyết phục không (convincing: true/false), chỉ ra các lỗ hổng cụ thể (gaps), và xác định danh sách các khái niệm chuyên ngành (concepts) được đánh giá cùng verdict tương ứng.
`;

  let evaluatorResult = { convincing: false, gaps: [], concepts_evaluated: [] };
  try {
    const evalRes = await evaluatorModel.generateContent(evaluatorPrompt);
    evaluatorResult = JSON.parse(evalRes.response.text().trim());
  } catch (err) {
    console.warn('⚠️ [METRIC] EvaluatorFallbackTriggered - Evaluator LLM error, running fallback:', err);
    // basic fallback evaluation
    evaluatorResult = {
      convincing: userAnswer.length > 20,
      gaps: userAnswer.length < 20 ? ["Câu trả lời quá ngắn và thiếu lập luận kỹ thuật."] : [],
      concepts_evaluated: [
        {
          concept_id: "general_methodology",
          verdict: userAnswer.length > 20 ? "MASTERED" : "GAP",
          gap_summary: userAnswer.length < 20 ? "Học viên chưa tóm tắt thuyết phục được phương pháp." : ""
        }
      ]
    } as any;
  }

  // 4. Step 2: Planner/Generator (Act)
  const plannerModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          thinking_steps: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING }
          },
          action: { type: SchemaType.STRING, enum: ['deepen', 'switch', 'conclude'] } as any,
          next_question: { type: SchemaType.STRING }
        },
        required: ['thinking_steps', 'action', 'next_question']
      }
    }
  });

  const plannerPrompt = `
Bạn là một AI giám khảo phản biện luận án khoa học (Planner/Generator).
Dựa trên kết quả đánh giá câu trả lời gần nhất của học viên, hãy quyết định hành động tiếp theo.

Kết quả đánh giá từ Evaluator:
${JSON.stringify(evaluatorResult, null, 2)}

Trạng thái các khái niệm đã tích lũy trong phiên (concept_status):
${JSON.stringify(session.concept_status, null, 2)}

Lịch sử đối thoại:
${JSON.stringify(session.recent_turns, null, 2)}

Quyết định hành động (action):
- "deepen": tiếp tục hỏi sâu thêm về lỗ hổng vừa phát hiện.
- "switch": chuyển sang chủ đề hoặc khái niệm khác nếu khái niệm hiện tại đã được nắm vững hoặc muốn khảo sát phần khác của tài liệu.
- "conclude": kết thúc phiên phản biện nếu đã khảo sát đủ hoặc hết thời gian.

Yêu cầu:
1. Sinh câu hỏi tiếp theo (next_question) nếu action là "deepen" hoặc "switch". Nếu action là "conclude", viết câu nhận xét tổng kết.
2. Trả về mảng suy nghĩ "thinking_steps" mô phỏng quá trình phân tích (từ 2-3 bước).
`;

  let plannerResult: { thinking_steps: string[]; action: string; next_question: string } = { thinking_steps: [], action: 'switch', next_question: '' };
  try {
    const planRes = await plannerModel.generateContent(plannerPrompt);
    plannerResult = JSON.parse(planRes.response.text().trim());
  } catch (err) {
    console.error('Planner LLM error, running fallback:', err);
    plannerResult = {
      thinking_steps: ["Đang chuyển chủ đề để khảo sát rộng hơn..."],
      action: 'switch',
      next_question: 'Bạn có thể giải thích thêm về kết quả thực nghiệm và các chỉ số đo lường hiệu năng của mô hình không?'
    };
  }

  // 5. Update session states
  // Update last turn
  lastTurn.answer = userAnswer;
  lastTurn.convincing = evaluatorResult.convincing;
  lastTurn.gaps = evaluatorResult.gaps;

  // Update concept status nén
  for (const ce of evaluatorResult.concepts_evaluated as any[]) {
    const existingIdx = session.concept_status.findIndex(cs => cs.concept_id === ce.concept_id);
    if (existingIdx >= 0) {
      session.concept_status[existingIdx].status = ce.verdict;
      if (ce.gap_summary) {
        session.concept_status[existingIdx].last_gap_summary = ce.gap_summary;
      }
    } else {
      session.concept_status.push({
        concept_id: ce.concept_id,
        status: ce.verdict,
        last_gap_summary: ce.gap_summary
      });
    }
  }

  // Check action to append next question or conclude
  if (plannerResult.action === 'conclude') {
    session.status = 'CLOSED';
    session.recent_turns.push({
      question: plannerResult.next_question
    });
    session.updatedAt = new Date().toISOString();

    let facts: SessionFact[] = [];
    if (!session.archivedAt) {
      facts = await extractSessionFacts(session);
      await updateCompetencyProfile(userId, sessionId, facts);
      session.archivedAt = new Date().toISOString();
    }

    // Save session back
    await dynamodbClient.send(
      new PutItemCommand({
        TableName: THESIS_DEFENSE_SESSIONS_TABLE,
        Item: marshallSession(session)
      })
    );

    return {
      sessionId,
      thinking_steps: plannerResult.thinking_steps,
      next_question: plannerResult.next_question,
      status: session.status,
      recent_turns: session.recent_turns,
      concept_status: session.concept_status,
      report: {
        concepts_evaluated: session.concept_status,
        facts
      }
    };
  } else {
    // Append next question
    session.recent_turns.push({
      question: plannerResult.next_question
    });
    // Keep rolling window: only keep last 3 turns
    session.recent_turns = trimToN(session.recent_turns, 3);
  }

  session.updatedAt = new Date().toISOString();

  // Save session back
  await dynamodbClient.send(
    new PutItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Item: marshallSession(session)
    })
  );

  return {
    sessionId,
    thinking_steps: plannerResult.thinking_steps,
    next_question: plannerResult.next_question,
    status: session.status,
    recent_turns: session.recent_turns,
    concept_status: session.concept_status
  };
}

// ============================================
// 3. CLOSE SESSION & ARCHIVE TO LONG-TERM PROFILE
// ============================================

async function extractSessionFacts(session: DefenseSession): Promise<SessionFact[]> {
  const prompt = `
    Dựa trên kết quả phiên bảo vệ sau, với mỗi concept hãy sinh:
    - concept_id
    - verdict: MASTERED | WARNING | GAP
    - gap_summary: tối đa 1 câu, chỉ nêu bản chất lỗ hổng (nếu có)
    Session concept_status: ${JSON.stringify(session.concept_status)}
  `;

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              concept_id: { type: SchemaType.STRING },
              verdict: { type: SchemaType.STRING, enum: ['MASTERED', 'WARNING', 'GAP'] },
              gap_summary: { type: SchemaType.STRING }
            },
            required: ['concept_id', 'verdict']
          }
        } as any
      }
    });

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().trim());
  } catch (err) {
    console.error('Failed to extract session facts, falling back:', err);
    return session.concept_status.map(cs => ({
      concept_id: cs.concept_id,
      verdict: cs.status,
      gap_summary: cs.last_gap_summary
    }));
  }
}

async function updateCompetencyProfile(userId: string, sessionId: string, facts: SessionFact[]) {
  const nowStr = new Date().toISOString();
  
  for (const fact of facts) {
    const existing = await getProfile(userId, fact.concept_id);

    let newScore: number;
    if (!existing) {
      newScore = fact.verdict === 'MASTERED' ? 0.7 
               : fact.verdict === 'WARNING' ? 0.4 : 0.2;
    } else {
      const delta = fact.verdict === 'MASTERED' ? +0.2
                   : fact.verdict === 'WARNING' ? -0.05 : -0.2;
      newScore = clamp(existing.mastery_score + delta, 0, 1);
    }

    const newStatus = scoreToStatus(newScore);

    const newGapHistory = fact.gap_summary 
      ? trimToN([
          ...(existing?.gap_history ?? []), 
          { session_id: sessionId, gap_summary: fact.gap_summary, timestamp: nowStr }
        ], 5)
      : existing?.gap_history ?? [];

    await putProfile(userId, fact.concept_id, {
      PK: `USER#${userId}`,
      SK: `CONCEPT#${fact.concept_id}`,
      mastery_score: newScore,
      status: newStatus,
      gap_history: newGapHistory,
      last_reviewed_at: nowStr,
      review_count: (existing?.review_count ?? 0) + 1,
      updated_at: nowStr
    });
  }
}

export async function handleDefenseSessionClose(input: { userId: string; sessionId: string }): Promise<any> {
  const { userId, sessionId } = input;
  if (!sessionId) {
    throw new Error('SESSION_ID_REQUIRED');
  }

  // 1. Get current session
  const res = await dynamodbClient.send(
    new GetItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Key: { sessionId: { S: sessionId } }
    })
  );
  if (!res.Item) {
    throw new Error('SESSION_NOT_FOUND');
  }
  const session = unmarshallSession(res.Item);
  if (session.userId !== userId) {
    throw new Error('FORBIDDEN');
  }

  // Idempotency Guard: if already archived, return immediately
  if (session.archivedAt) {
    return {
      sessionId,
      status: 'CLOSED',
      report: {
        alreadyArchived: true,
        concepts_evaluated: session.concept_status,
        facts: []
      }
    };
  }

  // 2. Set to CLOSED
  session.status = 'CLOSED';
  session.updatedAt = new Date().toISOString();

  // 3. Extract and update profile
  const facts = await extractSessionFacts(session);
  await updateCompetencyProfile(userId, sessionId, facts);

  session.archivedAt = new Date().toISOString();

  await dynamodbClient.send(
    new PutItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Item: marshallSession(session)
    })
  );

  return {
    sessionId,
    status: 'CLOSED',
    report: {
      concepts_evaluated: session.concept_status,
      facts
    }
  };
}

// ============================================
// 4. RESEARCH COPILOT SMART SUGGESTIONS
// ============================================

async function queryUserProfile(userId: string): Promise<UserCompetencyProfile[]> {
  try {
    const res = await dynamodbClient.send(
      new QueryCommand({
        TableName: USER_COMPETENCY_PROFILE_TABLE,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': { S: `USER#${userId}` }
        }
      })
    );

    const items = res.Items || [];
    return items.map(item => {
      const gapHistoryList = item.gap_history?.L || [];
      const gap_history = gapHistoryList.map((val: any) => {
        const m = val.M || {};
        return {
          session_id: m.session_id?.S || '',
          gap_summary: m.gap_summary?.S || '',
          timestamp: m.timestamp?.S || ''
        };
      });

      const profile: UserCompetencyProfile = {
        PK: item.PK?.S || '',
        SK: item.SK?.S || '',
        mastery_score: item.mastery_score?.N ? parseFloat(item.mastery_score.N) : 0,
        status: (item.status?.S || 'GAP') as 'MASTERED' | 'WARNING' | 'GAP',
        gap_history,
        last_reviewed_at: item.last_reviewed_at?.S || '',
        review_count: item.review_count?.N ? parseInt(item.review_count.N) : 0,
        updated_at: item.updated_at?.S || ''
      };

      return applyDecay(profile);
    });
  } catch (err) {
    console.error('Failed to query user profile:', err);
    return [];
  }
}

export async function handleCopilotSuggest(input: { userId: string; jobId?: string; sessionId?: string }): Promise<any> {
  const { userId, jobId, sessionId } = input;

  const profile = await queryUserProfile(userId);

  let activeSessionGaps: string[] = [];
  if (sessionId) {
    const sRes = await dynamodbClient.send(
      new GetItemCommand({
        TableName: THESIS_DEFENSE_SESSIONS_TABLE,
        Key: { sessionId: { S: sessionId } }
      })
    );
    if (sRes.Item) {
      const session = unmarshallSession(sRes.Item);
      activeSessionGaps = session.concept_status
        .filter(cs => cs.status === 'GAP' || cs.status === 'WARNING')
        .map(cs => `${cs.concept_id}: ${cs.last_gap_summary || ''}`);
    }
  }

  const weakConcepts = profile
    .filter(p => p.status === 'GAP' || p.status === 'WARNING')
    .map(p => {
      const conceptId = p.SK.replace('CONCEPT#', '');
      return `${conceptId} (score: ${p.mastery_score.toFixed(2)}, status: ${p.status})`;
    });

  const prompt = `
Bạn là một Research Copilot chuyên hỗ trợ người học ôn tập đề tài nghiên cứu.
Dựa trên năng lực dài hạn hiện tại của người dùng (weak concepts) và các lỗ hổng phát hiện trong phiên phản biện hiện tại (current session gaps):

Weak concepts:
${weakConcepts.join('\n')}

Current session gaps:
${activeSessionGaps.join('\n')}

Hãy tạo ra 2-4 gợi ý ôn tập thông minh (smart suggestions) hướng dẫn người dùng hành động.
Mỗi gợi ý bắt buộc phải chọn một hành động (action) trong danh sách sau:
- "SCHOLAR_SEARCH": Tìm kiếm các nghiên cứu liên quan để củng cố lý thuyết.
- "SYNTHESIS_DOCS": Tổng hợp so sánh tài liệu hiện tại với các bài báo khác.
- "THESIS_DEFENSE": Bắt đầu một phiên phản biện mới để thử thách bản thân.
- "READ_MORE": Đọc sâu hơn các phần kiến thức trong tài liệu gốc.

Yêu cầu định dạng phản hồi: Định dạng JSON hợp lệ theo schema yêu cầu.
`;

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            suggestions: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  title: { type: SchemaType.STRING },
                  description: { type: SchemaType.STRING },
                  action: { type: SchemaType.STRING, enum: ['SCHOLAR_SEARCH', 'SYNTHESIS_DOCS', 'THESIS_DEFENSE', 'READ_MORE'] } as any,
                  payload: { type: SchemaType.STRING, description: 'Query/parameters needed for the action' }
                },
                required: ['title', 'description', 'action']
              }
            }
          },
          required: ['suggestions']
        }
      }
    });

    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().trim());
  } catch (err) {
    console.error('Failed to generate suggestions via Gemini structured:', err);
    return {
      suggestions: [
        {
          title: "Ôn tập khái niệm yếu",
          description: "Khảo sát thêm tài liệu để bổ sung kiến thức về các khái niệm chưa vững.",
          action: "READ_MORE",
          payload: weakConcepts.join(', ')
        },
        {
          title: "Thử thách phản biện lại",
          description: "Bắt đầu một phiên bảo vệ thử nghiệm mới cho bài báo.",
          action: "THESIS_DEFENSE",
          payload: jobId || ""
        }
      ]
    };
  }
}

export async function handleGetCompetencyProfile(input: { userId: string }): Promise<any> {
  const profile = await queryUserProfile(input.userId);
  const result: Record<string, { status: string; mastery_score: number }> = {};
  profile.forEach(p => {
    const conceptId = p.SK.replace('CONCEPT#', '');
    result[conceptId] = {
      status: p.status,
      mastery_score: p.mastery_score
    };
  });
  return { profile: result };
}
