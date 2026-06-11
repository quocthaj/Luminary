// ============================================
// HANDLER: RAG Chat Assistant
// ============================================

import { QdrantClient } from '@qdrant/js-client-rest';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN } from '../utils/aws-clients';
import { getGeminiEmbeddingsBatch } from '../utils/ai-providers';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ChatInput {
  jobId: string;
  userId: string;
  message: string;
}

interface ChatOutput {
  answer: string;
}

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

    console.log(`📡 [chat] Connecting to Qdrant at: ${qdrantUrl}`);
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

export const handleChatJob = async (event: ChatInput): Promise<ChatOutput> => {
  const { jobId, userId, message } = event;
  console.log(`💬 [chat] Processing RAG chat for job=${jobId}, user=${userId}`);

  if (!message || message.trim().length === 0) {
    return { answer: 'Vui lòng cung cấp nội dung câu hỏi.' };
  }

  // 1. Fetch job from DynamoDB and check ownership
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S || 'guest';
  if (jobOwnerId !== 'guest' && jobOwnerId !== userId) {
    console.warn(`⚠️ [chat] User ${userId} unauthorized access to job ${jobId} owned by ${jobOwnerId}`);
    throw new Error('FORBIDDEN');
  }

  const totalStart = performance.now();

  // 2. Generate question embedding
  const embedStart = performance.now();
  const [embedding] = await getGeminiEmbeddingsBatch([message]);
  if (!embedding) {
    throw new Error('Failed to generate embedding for the question');
  }
  console.log(`⏱️ [chat] Embedding generated in ${(performance.now() - embedStart).toFixed(0)}ms`);

  // 3. Connect to Qdrant and search
  const qdrantStart = performance.now();
  const qdrantClient = await getQdrantClient();
  console.log(`🔍 [chat] Querying Qdrant collection=${COLLECTION_NAME} for user=${userId}, job=${jobId}`);
  
  const searchResults = await qdrantClient.search(COLLECTION_NAME, {
    vector: embedding,
    filter: {
      must: [
        { key: 'userId', match: { value: userId } },
        { key: 'jobId', match: { value: jobId } }
      ]
    },
    limit: 4,
  });
  console.log(`⏱️ [chat] Qdrant search completed in ${(performance.now() - qdrantStart).toFixed(0)}ms (retrieved ${searchResults.length} chunks)`);

  // 4. Formulate Prompt context
  let contextString = '';
  if (searchResults.length > 0) {
    contextString = searchResults.map((hit) => {
      const payload = hit.payload || {};
      const chunkIndex = payload.chunkIndex ?? 'unknown';
      const original = payload.text_original ?? '';
      const translated = payload.text_translated ?? '';
      return `[Đoạn ${chunkIndex}]:
English: ${original}
Tiếng Việt: ${translated}`;
    }).join('\n\n---\n\n');
  } else {
    contextString = '(Không tìm thấy đoạn trích dẫn phù hợp nào)';
  }

  const systemMessage = `Bạn là một trợ lý học thuật thông minh hỗ trợ người dùng đọc và hiểu tài liệu khoa học song ngữ.
Dưới đây là một số đoạn trích dẫn có liên quan được tìm thấy trong bài báo hiện tại:

---
${contextString}
---

Hãy trả lời câu hỏi sau của người dùng dựa trên thông tin trích dẫn trên.
Câu hỏi: "${message}"

Quy tắc trả lời:
1. Chỉ trả lời dựa trên các đoạn trích dẫn được cung cấp ở trên. Nếu không thể trả lời từ ngữ cảnh đó, hãy lịch sự thông báo cho người dùng.
2. Sử dụng định dạng Markdown phong phú để câu trả lời dễ đọc.
3. Ở cuối câu trả lời hoặc tại các luận điểm quan trọng, hãy bắt buộc chèn số thứ tự đoạn trích dẫn nguồn dưới dạng [Đoạn X] (với X là số của chunkIndex từ đoạn trích dẫn tương ứng). Ví dụ: "...như đã được mô tả [Đoạn 3]".
4. Phản hồi bằng tiếng Việt thân thiện và chuyên nghiệp.`;

  // 5. Generate answer using Gemini 2.0 Flash
  const geminiStart = performance.now();
  let answer = 'Không có phản hồi từ mô hình AI.';
  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const responseResult = await model.generateContent(systemMessage);
    const candidate = responseResult.response.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY' || candidate?.finishReason === 'RECITATION') {
      answer = 'Câu trả lời bị chặn bởi bộ lọc an toàn hoặc bản quyền của mô hình AI.';
    } else {
      answer = responseResult.response.text() || answer;
    }
  } catch (err: any) {
    console.error('❌ [chat] Error generating content from Gemini:', err);
    answer = `Không thể tạo câu trả lời do lỗi hệ thống AI: ${err.message || err}`;
  }
  console.log(`⏱️ [chat] Gemini text generation completed in ${(performance.now() - geminiStart).toFixed(0)}ms`);
  console.log(`⏱️ [chat] Total RAG Chat completed in ${(performance.now() - totalStart).toFixed(0)}ms`);

  return { answer };
};
