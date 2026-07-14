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
  GROQ_SECRET_ARN,
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

const COLLECTION_NAME = 'luminary-scholar-chunks';
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
  academicRole?: string;
  defenseIntensity?: string;
  academicAffiliation?: string;
  report?: {
    overallScore: number;
    overallComment: string;
    strengths: string[];
    weaknesses: string[];
    concepts_evaluated?: ConceptStatus[];
    facts?: SessionFact[];
  };
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
    ...(session.archivedAt ? { archivedAt: { S: session.archivedAt } } : {}),
    ...(session.academicRole ? { academicRole: { S: session.academicRole } } : {}),
    ...(session.defenseIntensity ? { defenseIntensity: { S: session.defenseIntensity } } : {}),
    ...(session.academicAffiliation ? { academicAffiliation: { S: session.academicAffiliation } } : {}),
    ...(session.report ? {
      report: {
        M: {
          overallScore: { N: session.report.overallScore.toString() },
          overallComment: { S: session.report.overallComment },
          strengths: { L: session.report.strengths.map(s => ({ S: s })) },
          weaknesses: { L: session.report.weaknesses.map(w => ({ S: w })) },
          ...(session.report.facts ? {
            facts: {
              L: session.report.facts.map(f => ({
                M: {
                  concept_id: { S: f.concept_id },
                  verdict: { S: f.verdict },
                  ...(f.gap_summary ? { gap_summary: { S: f.gap_summary } } : {})
                }
              }))
            }
          } : {})
        }
      }
    } : {})
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

  let report: any = undefined;
  if (item.report?.M) {
    const rm = item.report.M;
    report = {
      overallScore: rm.overallScore?.N ? parseInt(rm.overallScore.N) : 0,
      overallComment: rm.overallComment?.S || '',
      strengths: rm.strengths?.L ? rm.strengths.L.map((s: any) => s.S || '') : [],
      weaknesses: rm.weaknesses?.L ? rm.weaknesses.L.map((w: any) => w.S || '') : [],
      facts: rm.facts?.L ? rm.facts.L.map((f: any) => {
        const fm = f.M || {};
        return {
          concept_id: fm.concept_id?.S || '',
          verdict: fm.verdict?.S || 'GAP',
          gap_summary: fm.gap_summary?.S || ''
        };
      }) : undefined
    };
  }

  return {
    sessionId: item.sessionId?.S || '',
    userId: item.userId?.S || '',
    jobId: item.jobId?.S || '',
    status: (item.status?.S || 'ACTIVE') as 'ACTIVE' | 'CLOSED',
    recent_turns,
    concept_status,
    createdAt: item.createdAt?.S || '',
    updatedAt: item.updatedAt?.S || '',
    archivedAt: item.archivedAt?.S,
    academicRole: item.academicRole?.S,
    defenseIntensity: item.defenseIntensity?.S,
    academicAffiliation: item.academicAffiliation?.S,
    report
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

async function generateInitialQuestion(
  jobItem: Record<string, any>,
  academicRole?: string,
  defenseIntensity?: string,
  academicAffiliation?: string
): Promise<string> {
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

  const roleText = academicRole === 'phd' ? 'Nghiên cứu sinh Tiến sĩ' 
                 : academicRole === 'lecturer' ? 'Giảng viên Đại học'
                 : academicRole === 'researcher' ? 'Nhà nghiên cứu Độc lập'
                 : 'Sinh viên Đại học';

  const intensityText = defenseIntensity === 'aggressive' 
                      ? 'Nghiêm khắc, khó tính, xoáy sâu vào các lỗ hổng kỹ thuật và đòi hỏi lập luận vô cùng chặt chẽ như một Q1 Reviewer thực thụ'
                      : 'Thân thiện, nâng đỡ học viên, đóng góp ý kiến mang tính xây dựng nhưng vẫn giữ tính học thuật';

  const affiliationText = academicAffiliation ? ` đến từ tổ chức/trường ${academicAffiliation}` : '';

  const prompt = `
Bạn là một giáo sư phản biện luận án khoa học (Professor) đang đặt câu hỏi mở đầu cho người bảo vệ đóng vai trò là ${roleText}${affiliationText}.
Thái độ và phong cách phản biện của bạn phải: ${intensityText}.

Hãy đọc thông tin về đề tài nghiên cứu sau và viết một câu hỏi mở đầu tiên để bắt đầu phiên bảo vệ luận án của học viên.
Câu hỏi phải mang tính học thuật chuyên sâu sắc sảo, mở đầu lịch sự, yêu cầu người bảo vệ tóm tắt hoặc làm rõ đóng góp cốt lõi/phương pháp nghiên cứu.

Tên đề tài: ${title}
Tóm tắt đề tài:
${summaryText}

Lưu ý: Phản hồi bằng tiếng Việt học thuật, trực tiếp đưa ra câu hỏi của giáo sư phản biện, không thêm lời chào hay dẫn dắt thừa thãi của AI.
Câu hỏi phải mang phong thái và ngôn từ của một giáo sư phản biện thực thụ, sâu sắc và chặt chẽ.
`;

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    if (text) return text;
  } catch (err) {
    console.warn('⚠️ Gemini initial question failed, trying Groq:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `Bạn là một giáo sư phản biện luận án khoa học sắc sảo đang chấm điểm học viên đóng vai trò là ${roleText}${affiliationText}. Thái độ: ${intensityText}. Hãy đưa ra câu hỏi phản biện trực tiếp bằng tiếng Việt học thuật.`
            },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      }
    } catch (groqErr) {
      console.error('❌ Groq initial question fallback also failed:', groqErr);
    }
  }

  return `Chào mừng bạn đến với phiên phản biện đề tài "${title}". Dưới góc độ của hội đồng phản biện, xin vui lòng tóm tắt ngắn gọn đóng góp khoa học chính hoặc phương pháp nghiên cứu mà bạn đã áp dụng trong đề tài này, và chỉ rõ luận điểm đột phá nhất của nghiên cứu.`;
}

// ============================================
// 1. INITIALIZE / RESTORE SESSION
// ============================================

export async function handleDefenseSessionInit(input: { 
  userId: string; 
  jobId?: string; 
  sessionId?: string;
  academicRole?: string;
  defenseIntensity?: string;
  academicAffiliation?: string;
}): Promise<any> {
  const { userId, jobId, sessionId, academicRole, defenseIntensity, academicAffiliation } = input;

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

  const initialQuestion = await generateInitialQuestion(jobItem, academicRole, defenseIntensity, academicAffiliation);

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
    updatedAt: now,
    academicRole,
    defenseIntensity,
    academicAffiliation
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

export async function handleDefenseSessionAnswer(input: { 
  userId: string; 
  sessionId: string; 
  userAnswer: string;
  academicRole?: string;
  defenseIntensity?: string;
  academicAffiliation?: string;
}): Promise<any> {
  const { userId, sessionId, userAnswer, academicRole, defenseIntensity, academicAffiliation } = input;
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

  const roleText = academicRole === 'phd' ? 'Nghiên cứu sinh Tiến sĩ' 
                 : academicRole === 'lecturer' ? 'Giảng viên Đại học'
                 : academicRole === 'researcher' ? 'Nhà nghiên cứu Độc lập'
                 : 'Sinh viên Đại học';

  const intensityText = defenseIntensity === 'aggressive' 
                      ? 'Nghiêm khắc, khó tính, xoáy sâu vào các lỗ hổng kỹ thuật và đòi hỏi lập luận vô cùng chặt chẽ như một Q1 Reviewer thực thụ'
                      : 'Thân thiện, nâng đỡ học viên, đóng góp ý kiến mang tính xây dựng nhưng vẫn giữ tính học thuật';

  const affiliationText = academicAffiliation ? ` đến từ tổ chức/trường ${academicAffiliation}` : '';

  // 3. Step 1: Evaluator (Reflect)
  const evaluatorPrompt = `
Bạn là một AI giám khảo phản biện luận án khoa học (Evaluator) đang đánh giá câu trả lời của học viên đóng vai trò là ${roleText}${affiliationText}.
Thái độ đánh giá: ${intensityText}.

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

  let evaluatorResult: any = null;
  try {
    const genAI = await getGeminiClient();
    const evaluatorModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
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
    const evalRes = await evaluatorModel.generateContent(evaluatorPrompt);
    evaluatorResult = JSON.parse(evalRes.response.text().trim());
  } catch (err) {
    console.warn('⚠️ [METRIC] Evaluator LLM error, trying Groq fallback:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: `Bạn là một Evaluator phản biện luận án khoa học đang chấm điểm học viên đóng vai trò là ${roleText}${affiliationText}. Bạn PHẢI trả về dữ liệu dưới dạng JSON thuần túy có định dạng: {"convincing": boolean, "gaps": string[], "concepts_evaluated": [{"concept_id": string, "verdict": "MASTERED"|"WARNING"|"GAP", "gap_summary": string}]}`
            },
            { role: 'user', content: evaluatorPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          evaluatorResult = JSON.parse(content);
        }
      }
    } catch (groqErr) {
      console.error('❌ Groq Evaluator fallback failed:', groqErr);
    }
  }

  // Double fallback if both failed
  if (!evaluatorResult) {
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
    };
  }

  // 4. Step 2: Planner/Generator (Act)
  const plannerPrompt = `
Bạn là một giáo sư phản biện luận án khoa học ${defenseIntensity === 'aggressive' ? 'nghiêm khắc, xoáy sâu và sắc bén' : 'thân thiện và có tinh thần xây dựng'}.
Học viên đang bảo vệ đóng vai trò là ${roleText}${affiliationText}.
Dựa trên kết quả đánh giá câu trả lời gần nhất của học viên, hãy quyết định hành động tiếp theo.

Kết quả đánh giá từ Evaluator:
${JSON.stringify(evaluatorResult, null, 2)}

Trạng thái các khái niệm đã tích lũy trong phiên (concept_status):
${JSON.stringify(session.concept_status, null, 2)}

Lịch sử đối thoại:
${JSON.stringify(session.recent_turns, null, 2)}

Quyết định hành động (action):
- "deepen": tiếp tục hỏi sâu thêm về lỗ hổng/điểm yếu vừa phát hiện trong câu trả lời của học viên.
- "switch": chuyển sang khảo sát một khía cạnh hoặc khái niệm chuyên môn khác của tài liệu nghiên cứu (như phương pháp, kết quả thực nghiệm, tính mới, hay giới hạn).
- "conclude": kết thúc phiên phản biện và viết nhận xét tổng kết sắc sảo nếu đã qua 3+ lượt đối thoại hoặc học viên đã bộc lộ đủ năng lực.

Yêu cầu:
1. Sinh câu hỏi tiếp theo (next_question) nếu hành động là "deepen" hoặc "switch". Câu hỏi phải được viết bằng tiếng Việt, mang giọng điệu phản biện tương ứng với thái độ phản biện đã chọn, hỏi sâu vào bản chất kỹ thuật và lập luận logic của đề tài. Tránh hỏi những câu chung chung mơ hồ.
2. Nếu hành động là "conclude", hãy đưa ra lời nhận xét tổng kết (next_question) đánh giá toàn diện ưu/nhược điểm và thái độ nghiên cứu của học viên dưới vai trò giáo sư phản biện của bạn.
3. Trả về mảng "thinking_steps" mô tả ngắn gọn logic lựa chọn hành động phản biện.
`;

  let plannerResult: any = null;
  try {
    const genAI = await getGeminiClient();
    const plannerModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
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
    const planRes = await plannerModel.generateContent(plannerPrompt);
    plannerResult = JSON.parse(planRes.response.text().trim());
  } catch (err) {
    console.warn('⚠️ [METRIC] Planner LLM error, trying Groq fallback:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Bạn là một Planner phản biện luận án khoa học. Bạn PHẢI trả về JSON thuần túy có định dạng: {"thinking_steps": string[], "action": "deepen"|"switch"|"conclude", "next_question": string}'
            },
            { role: 'user', content: plannerPrompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.4
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          plannerResult = JSON.parse(content);
        }
      }
    } catch (groqErr) {
      console.error('❌ Groq Planner fallback failed:', groqErr);
    }
  }

  // Double fallback if both failed
  if (!plannerResult) {
    // Generate a slightly dynamic fallback question based on whether the answer was convincing
    const fallbackQuestion = evaluatorResult.convincing
      ? "Bạn có thể làm rõ hơn về tính đóng góp thực tiễn và khả năng mở rộng của mô hình/giải pháp trong nghiên cứu này không?"
      : "Tôi nhận thấy câu trả lời của bạn còn khá sơ lược. Hãy giải thích rõ hơn về cơ sở lý thuyết hoặc các công trình đối chứng trực tiếp làm nền tảng cho nghiên cứu này.";
    
    plannerResult = {
      thinking_steps: ["Đang sử dụng câu hỏi dự phòng do hệ thống quá tải..."],
      action: 'switch',
      next_question: fallbackQuestion
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

    // Generate overall session report
    const sessionReport = await generateSessionReport(session, academicRole, defenseIntensity);
    session.report = {
      ...sessionReport,
      facts,
      concepts_evaluated: session.concept_status
    };

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
      report: session.report
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
      model: 'gemini-2.5-flash',
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
    console.warn('⚠️ Failed to extract session facts via Gemini, trying Groq fallback:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Bạn là chuyên gia trích xuất dữ liệu học thuật. Bạn PHẢI trả về JSON array thuần túy có định dạng: [{"concept_id": string, "verdict": "MASTERED"|"WARNING"|"GAP", "gap_summary": string}]'
            },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        }),
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return JSON.parse(content);
        }
      }
    } catch (groqErr) {
      console.error('❌ Groq extractSessionFacts fallback failed:', groqErr);
    }

    // fallback to current session concept_status
    return session.concept_status.map(cs => ({
      concept_id: cs.concept_id,
      verdict: cs.status,
      gap_summary: cs.last_gap_summary || ''
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

async function generateSessionReport(
  session: DefenseSession,
  academicRole?: string,
  defenseIntensity?: string
): Promise<{
  overallScore: number;
  overallComment: string;
  strengths: string[];
  weaknesses: string[];
}> {
  const roleVal = academicRole || session.academicRole;
  const intensityVal = defenseIntensity || session.defenseIntensity;

  const roleText = roleVal === 'phd' ? 'Nghiên cứu sinh Tiến sĩ' 
                 : roleVal === 'lecturer' ? 'Giảng viên Đại học'
                 : roleVal === 'researcher' ? 'Nhà nghiên cứu Độc lập'
                 : 'Sinh viên Đại học';

  const intensityText = intensityVal === 'aggressive' 
                      ? 'nghiêm khắc, đòi hỏi cực kỳ khắt khe'
                      : 'thân thiện và có tinh thần xây dựng';

  const prompt = `
Bạn là hội đồng phản biện luận án khoa học (được đóng vai bởi giáo sư phản biện có phong thái ${intensityText}).
Hãy đọc lịch sử phiên đối thoại phản biện và kết quả đánh giá các khái niệm dưới đây của người bảo vệ (đóng vai trò là ${roleText}):

Lịch sử đối thoại:
${JSON.stringify(session.recent_turns, null, 2)}

Kết quả đánh giá khái niệm:
${JSON.stringify(session.concept_status, null, 2)}

Nhiệm vụ của bạn là:
1. Cho điểm tổng quan (overallScore) trên thang điểm 100 (từ 0 đến 100) dựa vào độ chính xác khoa học, tính thuyết phục, logic phản biện của học viên.
2. Đưa ra nhận xét tổng quát (overallComment) khoảng 2-3 câu bằng tiếng Việt học thuật, mang tính xây dựng hoặc phê bình sâu sắc (tương ứng với phong thái phản biện).
3. Chỉ ra từ 1 đến 3 điểm mạnh cốt lõi (strengths) dạng danh sách mà học viên đã thể hiện.
4. Chỉ ra từ 1 đến 3 điểm yếu/lỗ hổng cần khắc phục (weaknesses) dạng danh sách của học viên.

Bạn PHẢI trả về dữ liệu dưới dạng JSON thuần túy theo cấu trúc sau:
{
  "overallScore": number,
  "overallComment": "chuỗi văn bản nhận xét tổng quát",
  "strengths": ["điểm mạnh 1", "điểm mạnh 2"],
  "weaknesses": ["điểm yếu 1", "điểm yếu 2"]
}
`;

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            overallScore: { type: SchemaType.INTEGER },
            overallComment: { type: SchemaType.STRING },
            strengths: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            },
            weaknesses: {
              type: SchemaType.ARRAY,
              items: { type: SchemaType.STRING }
            }
          },
          required: ['overallScore', 'overallComment', 'strengths', 'weaknesses']
        }
      }
    });
    const result = await model.generateContent(prompt);
    return JSON.parse(result.response.text().trim());
  } catch (err) {
    console.warn('⚠️ Gemini report generation failed, trying Groq fallback:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Bạn là Hội đồng phản biện luận án khoa học. Bạn PHẢI trả về JSON thuần túy có định dạng: {"overallScore": number, "overallComment": string, "strengths": string[], "weaknesses": string[]}'
            },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return JSON.parse(content);
        }
      }
    } catch (groqErr) {
      console.error('❌ Groq report generation fallback failed:', groqErr);
    }

    // Double fallback
    const masteredCount = session.concept_status.filter(c => c.status === 'MASTERED').length;
    const totalCount = session.concept_status.length || 1;
    const score = Math.round((masteredCount / totalCount) * 40 + 60); // 60 to 100
    return {
      overallScore: score,
      overallComment: "Học viên hoàn thành phiên phản biện luận án giả lập. Cần tiếp tục ôn tập và củng cố thêm các khái niệm có đánh giá WARNING hoặc GAP.",
      strengths: ["Có tinh thần học thuật, nỗ lực làm rõ các câu hỏi phản biện của hội đồng."],
      weaknesses: ["Một số câu trả lời còn mang tính lý thuyết tổng quát, cần làm rõ thực nghiệm."]
    };
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
      report: session.report || {
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

  // Generate overall session report
  const sessionReport = await generateSessionReport(session);
  session.report = {
    ...sessionReport,
    facts,
    concepts_evaluated: session.concept_status
  };

  await dynamodbClient.send(
    new PutItemCommand({
      TableName: THESIS_DEFENSE_SESSIONS_TABLE,
      Item: marshallSession(session)
    })
  );

  return {
    sessionId,
    status: 'CLOSED',
    report: session.report
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
      model: 'gemini-2.5-flash',
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
    console.warn('⚠️ Failed to generate suggestions via Gemini, trying Groq fallback:', err);
    try {
      const groqKey = await getSecret(GROQ_SECRET_ARN);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            {
              role: 'system',
              content: 'Bạn là một Research Copilot. Bạn PHẢI trả về JSON thuần túy có định dạng: {"suggestions": [{"title": string, "description": string, "action": "SCHOLAR_SEARCH"|"SYNTHESIS_DOCS"|"THESIS_DEFENSE"|"READ_MORE", "payload": string}]}'
            },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) {
          return JSON.parse(content);
        }
      }
    } catch (groqErr) {
      console.error('❌ Groq Copilot suggest fallback failed:', groqErr);
    }

    // Double fallback
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
