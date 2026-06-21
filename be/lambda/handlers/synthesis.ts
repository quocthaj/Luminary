import { GoogleGenerativeAI } from '@google/generative-ai';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN, RESULTS_BUCKET, s3Client, dynamodbClient, JOBS_TABLE } from '../utils/aws-clients';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { QdrantClient } from '@qdrant/js-client-rest';
import { getEmbeddingsBatch } from '../utils/ai-providers';
import * as crypto from 'crypto';

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

export function getSynthesisCacheKey(jobIds: string[]): string {
  const sortedIds = [...jobIds].sort();
  const concatenated = sortedIds.join('_');
  return crypto.createHash('sha256').update(concatenated).digest('hex');
}

// Read cache helper
async function getSynthesisFromS3(cacheKey: string): Promise<string | null> {
  const key = `synthesis/${cacheKey}.json`;
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: key,
      })
    );
    return await response.Body?.transformToString() || null;
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

// Save cache helper
async function saveSynthesisToS3(cacheKey: string, content: string): Promise<void> {
  const key = `synthesis/${cacheKey}.json`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: key,
      Body: content,
      ContentType: 'application/json; charset=utf-8',
    })
  );
}

// DynamoDB Polling/Status helpers for Synthesis
async function getSynthesisStatus(cacheKey: string): Promise<{ status: string; userId: string; updatedAt: number } | null> {
  const pk = `synthesisKey#${cacheKey}`;
  try {
    const res = await dynamodbClient.send(
      new GetItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: pk } },
      })
    );
    if (!res.Item) return null;
    return {
      status: res.Item.status?.S || 'FAILED',
      userId: res.Item.userId?.S || '',
      updatedAt: res.Item.updatedAt?.N ? parseInt(res.Item.updatedAt.N, 10) : 0,
    };
  } catch (err) {
    console.error(`❌ Failed to get synthesis status for pk=${pk}:`, err);
    return null;
  }
}

async function acquireSynthesisLock(cacheKey: string, userId: string, jobIds: string[]): Promise<boolean> {
  const pk = `synthesisKey#${cacheKey}`;
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes lock
  const now = Date.now();
  const expiredTime = now - lockTimeoutMs;

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: pk } },
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          '#userId': 'userId',
          '#jobIds': 'jobIds',
        },
        UpdateExpression: 'SET #status = :generating, #updatedAt = :now, #userId = :userId, #jobIds = :jobIds',
        ConditionExpression: `attribute_not_exists(#status) OR #status = :idle OR #status = :failed OR #updatedAt < :expiredTime`,
        ExpressionAttributeValues: {
          ':generating': { S: 'GENERATING' },
          ':now': { N: now.toString() },
          ':userId': { S: userId },
          ':jobIds': { SS: jobIds },
          ':idle': { S: 'IDLE' },
          ':failed': { S: 'FAILED' },
          ':expiredTime': { N: expiredTime.toString() }
        }
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`🔒 [synthesis] Lock acquisition failed for pk=${pk}. Another request is generating.`);
      return false;
    }
    console.error(`❌ [synthesis] DynamoDB Lock acquisition failed for pk=${pk}:`, err);
    throw err;
  }
}

async function updateSynthesisStatus(cacheKey: string, status: 'COMPLETED' | 'FAILED'): Promise<void> {
  const pk = `synthesisKey#${cacheKey}`;
  const now = Date.now();
  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: pk } },
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt'
        },
        UpdateExpression: 'SET #status = :status, #updatedAt = :now',
        ExpressionAttributeValues: {
          ':status': { S: status },
          ':now': { N: now.toString() }
        }
      })
    );
  } catch (err: any) {
    console.error(`❌ [synthesis] Failed to update status to ${status} for pk=${pk}:`, err);
  }
}

// ----------------------------------------------------
// HANDLER: POST /synthesis (Báo cáo đối chiếu)
// ----------------------------------------------------
interface SynthesisPostInput {
  userId: string;
  jobIds: string[];
}

export interface SynthesisPostOutput {
  status: 'COMPLETED' | 'GENERATING' | 'FAILED';
  report?: string;
  error?: string;
}

export async function handleSynthesisPost(input: SynthesisPostInput): Promise<SynthesisPostOutput> {
  const { userId, jobIds } = input;
  console.log(`📊 [synthesis] handleSynthesisPost — user=${userId}, jobIds=`, jobIds);

  // 1. Validation
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 10) {
    throw new Error('INVALID_INPUT');
  }

  // 2. Ownership & Existence check
  for (const jobId of jobIds) {
    const jobItem = await getJobItem(jobId);
    if (!jobItem) {
      throw new Error('JOB_NOT_FOUND');
    }
    const jobOwnerId = jobItem.userId?.S || 'guest';
    if (jobOwnerId !== 'guest' && jobOwnerId !== userId) {
      console.warn(`⚠️ [synthesis] Unauthorized access: User ${userId} to job ${jobId} owned by ${jobOwnerId}`);
      throw new Error('FORBIDDEN');
    }
  }

  // 3. Cache check in S3
  const cacheKey = getSynthesisCacheKey(jobIds);
  const cached = await getSynthesisFromS3(cacheKey);
  if (cached) {
    console.log(`✅ [synthesis] Cache hit for key=${cacheKey}`);
    const parsed = JSON.parse(cached);
    return { status: 'COMPLETED', report: parsed.report };
  }

  console.log(`🔄 [synthesis] Cache miss on S3. Checking status in DynamoDB for key=${cacheKey}...`);

  // 4. Polling/Lock Check in DynamoDB
  const dbStatus = await getSynthesisStatus(cacheKey);
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes lock
  
  if (dbStatus && dbStatus.status === 'GENERATING' && (Date.now() - dbStatus.updatedAt < lockTimeoutMs)) {
    console.log(`🔒 [synthesis] Job is currently generating. Returning status GENERATING.`);
    return { status: 'GENERATING' };
  }

  // 5. Try to acquire lock and invoke generator
  const locked = await acquireSynthesisLock(cacheKey, userId, jobIds);
  if (locked) {
    console.log(`🔒 [synthesis] Lock acquired. Invoking async lambda generator...`);
    const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'vietai-orchestrator',
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              asyncRun: true,
              tool: 'synthesis',
              userId,
              cacheKey,
              jobIds,
              invocationDepth: 1,
            })
          ),
        })
      );
    } catch (err: any) {
      console.error(`❌ [synthesis] Failed to invoke async Lambda generator:`, err);
      await updateSynthesisStatus(cacheKey, 'FAILED');
      throw err;
    }
  }

  return { status: 'GENERATING' };
}

// ----------------------------------------------------
// HANDLER: Background Async Synthesis worker
// ----------------------------------------------------
interface AsyncSynthesisInput {
  userId: string;
  cacheKey: string;
  jobIds: string[];
  invocationDepth: number;
}

export async function handleAsyncSynthesisJob(event: AsyncSynthesisInput): Promise<void> {
  const { userId, cacheKey, jobIds, invocationDepth } = event;
  console.log(`🤖 [synthesis-async] Background worker started — cacheKey=${cacheKey}, depth=${invocationDepth}`);

  if (invocationDepth && invocationDepth > 1) {
    console.error(`❌ [synthesis-async] Circuit breaker: Recursive call detected! depth=${invocationDepth}. Aborting.`);
    return;
  }

  try {
    // 1. Retrieve job items from DynamoDB
    const jobItems: any[] = [];
    for (const jobId of jobIds) {
      const jobItem = await getJobItem(jobId);
      if (!jobItem) {
        throw new Error('JOB_NOT_FOUND');
      }
      jobItems.push(jobItem);
    }

    // 2. Map summaries
    const summaries = jobItems.map((item) => {
      const title = item.fileName?.S || item.jobId?.S || 'Tài liệu không tên';
      const summaryAttr = item.summary?.M;
      return {
        jobId: item.jobId?.S,
        title,
        tldr: summaryAttr?.tldr?.S || '',
        keyContributions: summaryAttr?.keyContributions?.L?.map((c: any) => c.S || '') || [],
        methodology: summaryAttr?.methodology?.S || '',
        limitations: summaryAttr?.limitations?.S || '',
      };
    });

    // 3. Build Prompt & Call Gemini
    const prompt = `Bạn là trợ lý AI học thuật chuyên nghiệp viết Literature Review. Dưới đây là thông tin tóm tắt của ${summaries.length} bài báo khoa học đã chọn:

${summaries.map((s, idx) => `
[Tài liệu ${idx + 1}]: ${s.title}
- ID: ${s.jobId}
- Tóm tắt (TL;DR): ${s.tldr}
- Đóng góp chính: ${s.keyContributions.join('; ')}
- Phương pháp nghiên cứu: ${s.methodology}
- Hạn chế: ${s.limitations}
`).join('\n---\n')}

Nhiệm vụ của bạn:
1. Tạo một bảng so sánh đối chiếu song ngữ Anh - Việt chi tiết (Bảng có các cột: Tiêu chí/Tài liệu | Tài liệu 1 | Tài liệu 2 | ...).
   Bảng so sánh phải bao gồm các tiêu chí: Mục tiêu nghiên cứu (Research Objective), Phương pháp luận (Methodology), Kết quả chính (Key Results), Hạn chế (Limitations).
2. Viết một báo cáo phân tích tổng hợp (Synthesis Report) khoảng 500-1000 từ bằng tiếng Việt chia sẻ:
   - Các điểm tương đồng (common themes) và các điểm khác biệt (differences) giữa các nghiên cứu.
   - Các nghiên cứu này bổ khuyết hay tương phản với nhau như thế nào?
   - Kết luận tổng quan về hướng nghiên cứu chung này.
3. Đảm bảo toàn bộ nội dung hiển thị dưới dạng Markdown chuẩn, chuyên nghiệp, giữ nguyên các công thức toán học dạng LaTeX (ví dụ: $E = mc^2$ hoặc $$y = ax + b$$) nếu có.

Hãy tạo báo cáo đối chiếu song ngữ chất lượng cao.`;

    const gemini = await getGeminiClient();
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const reportText = result.response.text();

    const responseObj = { report: reportText };
    await saveSynthesisToS3(cacheKey, JSON.stringify(responseObj));
    await updateSynthesisStatus(cacheKey, 'COMPLETED');
    console.log(`✅ [synthesis-async] Report generated and cached successfully for key=${cacheKey}`);
  } catch (err: any) {
    console.error(`❌ [synthesis-async] Error during generation:`, err);
    await updateSynthesisStatus(cacheKey, 'FAILED');
  }
}

// ----------------------------------------------------
// HANDLER: POST /synthesis/chat (Chat liên tài liệu)
// ----------------------------------------------------
interface SynthesisChatInput {
  userId: string;
  jobIds: string[];
  message: string;
}

export async function handleSynthesisChat(input: SynthesisChatInput): Promise<{ answer: string }> {
  const { userId, jobIds, message } = input;
  console.log(`💬 [synthesis-chat] user=${userId}, jobIds=`, jobIds, `message=${message}`);

  if (!message || message.trim().length === 0) {
    return { answer: 'Vui lòng cung cấp nội dung câu hỏi.' };
  }

  // 1. Validation
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 10) {
    throw new Error('INVALID_INPUT');
  }

  // 2. Ownership & Metadata mapping
  const jobMap: Record<string, string> = {}; // jobId -> Title
  for (const jobId of jobIds) {
    const jobItem = await getJobItem(jobId);
    if (!jobItem) {
      throw new Error('JOB_NOT_FOUND');
    }
    const jobOwnerId = jobItem.userId?.S || 'guest';
    if (jobOwnerId !== 'guest' && jobOwnerId !== userId) {
      console.warn(`⚠️ [synthesis-chat] Unauthorized access: User ${userId} to job ${jobId}`);
      throw new Error('FORBIDDEN');
    }
    jobMap[jobId] = jobItem.fileName?.S || jobItem.jobId?.S || 'Tài liệu';
  }

  // 3. Search related chunks from Qdrant Cloud (Parallel search per jobId to ensure fair representation)
  const [embedding] = await getEmbeddingsBatch([message], 'search_query');
  if (!embedding) {
    throw new Error('Failed to generate embedding for the search query');
  }

  const qdrantClient = await getQdrantClient();
  
  // Thực hiện truy vấn song song cho từng jobId bằng Promise.all để giữ latency tối ưu
  const results = await Promise.all(
    jobIds.map(async (jobId) => {
      const searchResults = await qdrantClient.search(COLLECTION_NAME, {
        vector: embedding,
        filter: {
          must: [
            { key: 'userId', match: { value: userId } },
            { key: 'jobId', match: { value: jobId } } // Lọc chính xác theo jobId cụ thể
          ]
        },
        limit: 3, // K=3 cố định cho mỗi tài liệu để đảm bảo độ dày ngữ cảnh tối thiểu
      });
      return searchResults.map((hit) => ({
        jobId,
        score: hit.score,
        payload: hit.payload || {},
      }));
    })
  );

  // Gộp phẳng kết quả từ các truy vấn song song
  // NOTE: Không cần deduplicate ở đây vì mỗi point trong Qdrant chỉ gắn với duy nhất 1 jobId,
  // và danh sách jobIds đầu vào là tập hợp các ID duy nhất. Do đó, các kết quả trả về từ
  // các truy vấn song song cho từng jobId là các tập hợp hoàn toàn rời nhau (mutually exclusive).
  const flatResults = results.flat();

  const contextChunks = flatResults.map((item) => {
    const title = jobMap[item.jobId] || 'Tài liệu';
    return {
      title,
      chunkIndex: item.payload.chunkIndex ?? 'unknown',
      score: item.score,
      text_original: item.payload.text_original ?? '',
      text_translated: item.payload.text_translated ?? ''
    };
  });

  console.log(`🔍 [synthesis-chat] Chunks retrieved from Qdrant:`, 
    contextChunks.map(c => ({ title: c.title, index: c.chunkIndex, score: c.score }))
  );

  // 4. Generate Answer using Gemini
  // NOTE: Nhúng score (% độ liên quan) vào context header của từng chunk để cung cấp tín hiệu
  // trọng số cho LLM, tránh hiện tượng "manufactured relevance" (AI bịa ra sự liên quan của các
  // tài liệu thực chất có độ tương đồng thấp khi so sánh với câu hỏi).
  const prompt = `Bạn là trợ lý AI học thuật song ngữ. Nhiệm vụ của bạn là hỗ trợ người dùng đọc và hiểu tài liệu khoa học song ngữ, đồng thời trả lời các câu hỏi dựa trên các tài liệu đã chọn.
Bạn đang hỗ trợ người dùng so sánh/tìm hiểu trên phạm vi các tài liệu sau:
${Object.entries(jobMap).map(([id, title]) => `- ${title} (ID: ${id})`).join('\n')}

Dưới đây là ngữ cảnh trích xuất từ các tài liệu để hỗ trợ trả lời câu hỏi:
---
${contextChunks.map(c => `[Tài liệu: ${c.title} - Đoạn ${c.chunkIndex} (Độ liên quan: ${Math.round(c.score * 100)}%)]:
Tiếng Anh: ${c.text_original}
Tiếng Việt: ${c.text_translated}`).join('\n\n')}
---

Yêu cầu câu trả lời:
1. Trình bày câu trả lời rõ ràng bằng Markdown (bôi đậm, vẽ bảng, bullet points).
2. Đính kèm liên kết trích dẫn ngược dưới dạng [Tên bài báo - Đoạn X] (với X là chunkIndex, Tên bài báo là tên ngắn của bài viết) trỏ đúng về nguồn của thông tin đó. Ví dụ: "...như đã được thảo luận [Tài liệu: ${contextChunks[0]?.title || 'Tên bài báo'} - Đoạn 5]".
3. Phản hồi hoàn toàn bằng tiếng Việt thân thiện và chuyên nghiệp.

Câu hỏi của người dùng: ${message}`;

  const gemini = await getGeminiClient();
  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const answer = result.response.text();

  return { answer };
}
