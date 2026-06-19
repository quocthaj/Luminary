import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN, dynamodbClient, JOBS_TABLE } from '../utils/aws-clients';
import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface MindmapData {
  status: 'COMPLETED';
  mermaidCode: string;
}

export interface MindmapValidationResult {
  valid: boolean;
  errors: string[];
}

// ============================================
// GEMINI STRUCTURED OUTPUT SCHEMA
// ============================================

const mindmapResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    mermaidCode: {
      type: SchemaType.STRING,
      description: 'Mã Mermaid.js sơ đồ tư duy hợp lệ. Phải bắt đầu bằng chữ "mindmap" ở dòng đầu tiên, sử dụng thụt lề bằng khoảng trắng để biểu diễn phân cấp nhánh con. Tuyệt đối không chứa thẻ HTML, CSS nội dòng, hoặc ký tự định dạng markdown block.'
    }
  },
  required: ['mermaidCode']
};

// ============================================
// VALIDATION
// ============================================

export function validateMindmap(data: any): MindmapValidationResult {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      errors: ['Dữ liệu đầu vào không hợp lệ (phải là một đối tượng JSON).']
    };
  }

  if (!data.mermaidCode || typeof data.mermaidCode !== 'string' || data.mermaidCode.trim() === '') {
    return {
      valid: false,
      errors: ["Thuộc tính 'mermaidCode' không được trống."]
    };
  }

  const code = data.mermaidCode.trim();
  if (!code.startsWith('mindmap')) {
    errors.push("Mã Mermaid phải bắt đầu bằng từ khóa 'mindmap' ở dòng đầu tiên.");
  }

  if (code.includes('<') || code.includes('>')) {
    errors.push("Mã Mermaid không được chứa các ký tự HTML '<' hoặc '>'.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ============================================
// CACHE HELPERS
// ============================================

async function readCachedMindmap(mindmapKey: string): Promise<MindmapData | null> {
  try {
    const raw = await getResultFromS3(mindmapKey);
    const parsed = JSON.parse(raw);
    const { valid } = validateMindmap(parsed);
    if (!valid) {
      console.warn(`⚠️ [mindmap] Cached mindmap at ${mindmapKey} is corrupt or invalid — treating as cache miss.`);
      return null;
    }
    return parsed as MindmapData;
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

// ============================================
// PROMPT BUILDERS
// ============================================

function buildBasePrompt(analysisContent: string): string {
  return `Bạn là một trợ lý học thuật chuyên nghiệp. Nhiệm vụ của bạn là đọc bản phân tích và dịch song ngữ chi tiết của bài nghiên cứu khoa học dưới đây, trích xuất cấu trúc phân cấp các khái niệm chính, phương pháp luận, kết quả và kết luận để vẽ sơ đồ tư duy (mindmap) bằng Mermaid.js.

YÊU CẦU BẮT BUỘC:
1. Sử dụng đúng cú pháp "mindmap" của Mermaid.js. Dòng đầu tiên phải là từ khóa "mindmap".
2. Sử dụng thụt lề bằng khoảng trắng thống nhất (2 hoặc 4 khoảng trắng) để biểu diễn mối quan hệ cha-con.
3. Để đảm bảo sơ đồ render chính xác và không bị lỗi cú pháp:
   - Root node: Viết trực tiếp dưới dạng văn bản thuần, KHÔNG sử dụng dấu ngoặc tròn, ngoặc vuông, ngoặc nhọn hay dấu nháy kép bao quanh (ví dụ: mindmap\\n  Deep Learning in Medicine).
   - Child nodes: Chỉ sử dụng text chữ bình thường, KHÔNG sử dụng dấu nháy kép, nháy đơn bao quanh, và KHÔNG sử dụng các hình dạng ngoặc như (( )), ( ), [ ], { }, {{ }}.
   - Cho phép chứa dấu cách trong tên nút mà không cần bọc nháy kép.
   - TUYỆT ĐỐI không chèn bất kỳ thẻ HTML nào như <br/>, <b>, <i>, v.v.
   - Chỉ sử dụng văn bản ngắn gọn (1-5 từ) cho các nhãn nút.
4. Sinh đúng định dạng JSON khớp với schema yêu cầu.

Ví dụ định dạng mã Mermaid hợp lệ:
mindmap
  Deep Learning in Medicine
    Introduction
      Context
      Problem Statement
    Methodology
      Algorithm X
      Data Collection
    Results
      Accuracy
      Execution Time

BẢN PHÂN TÍCH CHI TIẾT:
---
${analysisContent.slice(0, 50000)}
---

Hãy sinh mã Mermaid sơ đồ tư duy phù hợp nhất cho bài báo trên.`;
}

function buildFeedbackPrompt(basePrompt: string, errors: string[]): string {
  const errorSummary = errors.slice(0, 10).join('\n');
  return `${basePrompt}

LỖI CÚ PHÁP TỪ LẦN SINH TRƯỚC (hãy khắc phục hoàn toàn):
${errorSummary}

Hãy sinh lại mã Mermaid.js hợp lệ không lặp lại lỗi trên.`;
}

async function callGeminiStructuredOutput(prompt: string): Promise<any> {
  const geminiKey = await getSecret(GEMINI_SECRET_ARN);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: mindmapResponseSchema as any,
      temperature: 0.3,
    }
  });
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  return JSON.parse(raw);
}

// ============================================
// MAIN HANDLER
// ============================================

export async function handleMindmapJob(input: { jobId: string; userId: string }): Promise<MindmapData> {
  const { jobId, userId } = input;
  console.log(`🧠 [mindmap] handleMindmapJob — jobId=${jobId}, userId=${userId}`);

  // 1. Ownership check (Fail Fast on Auth)
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    console.warn(`⚠️ [mindmap] User ${userId} unauthorized access to job ${jobId} (owned by ${jobOwnerId})`);
    throw new Error('FORBIDDEN');
  }

  // 2. Translation status check
  const jobStatus = jobItem.status?.S;
  const s3OutputKey = jobItem.s3OutputKey?.S;
  if (jobStatus !== 'completed' || !s3OutputKey) {
    console.warn(`⚠️ [mindmap] Job ${jobId} not ready (status=${jobStatus}, s3OutputKey=${s3OutputKey})`);
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // 3. Cache read
  const fileName = jobItem.fileName?.S || jobId;
  const mindmapKey = `results/${jobId}/mindmap.json`;
  const cached = await readCachedMindmap(mindmapKey);
  if (cached) {
    console.log(`✅ [mindmap] Cache hit for jobId=${jobId}`);
    return cached;
  }

  console.log(`🔄 [mindmap] Cache miss for jobId=${jobId}. Loading analysis and generating mindmap...`);

  // 4. Load analysis.md from S3
  const analysisContent = await getResultFromS3(s3OutputKey);
  if (!analysisContent || analysisContent.trim().length === 0) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // 5. Generate with Feedback-Driven Retry
  const basePrompt = buildBasePrompt(analysisContent);
  let lastResult: MindmapValidationResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`🤖 [mindmap] Gemini attempt ${attempt}/2 for jobId=${jobId}`);

    try {
      const prompt = attempt === 1
        ? basePrompt
        : buildFeedbackPrompt(basePrompt, lastResult!.errors);

      const parsed = await callGeminiStructuredOutput(prompt);
      lastResult = validateMindmap(parsed);

      if (lastResult.valid) {
        const mindmapData: MindmapData = {
          status: 'COMPLETED',
          mermaidCode: parsed.mermaidCode,
        };
        await saveResultToS3(jobId, fileName, JSON.stringify(mindmapData), 'mindmap.json');
        console.log(`✅ [mindmap] Mindmap generated successfully (attempt ${attempt})`);
        return mindmapData;
      }

      console.warn(`⚠️ [mindmap] Attempt ${attempt} failed validation:`, lastResult.errors.slice(0, 5));

    } catch (err: any) {
      console.error(`❌ [mindmap] Gemini call failed (attempt ${attempt}):`, err?.message || err);
      throw err;
    }
  }

  // 6. Fallback (if validation fails after 2 attempts, we throw error to mark job as failed)
  console.error(`❌ [mindmap] Mindmap generation failed after 2 attempts. jobId=${jobId}`);
  throw new Error('MINDMAP_GENERATION_FAILED');
}

// ============================================
// POLLING API CONTROLLERS
// ============================================

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

export async function handleMindmapPost(input: { jobId: string; userId: string }): Promise<any> {
  const { jobId, userId } = input;

  // 1. Checks
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }
  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    throw new Error('FORBIDDEN');
  }
  const jobStatus = jobItem.status?.S;
  const s3OutputKey = jobItem.s3OutputKey?.S;
  if (jobStatus !== 'completed' || !s3OutputKey) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // 2. Cache check
  const mindmapKey = `results/${jobId}/mindmap.json`;
  const cached = await readCachedMindmap(mindmapKey);
  if (cached) {
    console.log(`✅ [mindmap-post] Cache hit for jobId=${jobId}. Setting completed in DB.`);
    await updateMindmapStatus(jobId, 'COMPLETED');
    return {
      status: 'COMPLETED',
      mermaidCode: cached.mermaidCode
    };
  }

  // 3. Acquire lock
  const locked = await acquireLock(jobId);
  if (locked) {
    console.log(`🔒 [mindmap-post] Lock acquired. Invoking async generator for jobId=${jobId}...`);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'vietai-orchestrator',
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              asyncRun: true,
              tool: 'mindmap',
              jobId,
              userId,
              invocationDepth: 1
            })
          )
        })
      );
    } catch (invokeErr: any) {
      console.error(`❌ [mindmap-post] Failed to invoke lambda:`, invokeErr);
      await updateMindmapStatus(jobId, 'FAILED');
      throw invokeErr;
    }
  }

  return { status: 'GENERATING' };
}

export async function handleMindmapGet(input: { jobId: string; userId: string }): Promise<any> {
  const { jobId, userId } = input;

  // 1. Checks
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }
  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    throw new Error('FORBIDDEN');
  }

  // 2. Read status from DynamoDB
  const status = jobItem.mindmapStatus?.S || 'IDLE';

  if (status === 'COMPLETED') {
    const mindmapKey = `results/${jobId}/mindmap.json`;
    const cached = await readCachedMindmap(mindmapKey);
    if (cached) {
      return {
        status: 'COMPLETED',
        mermaidCode: cached.mermaidCode
      };
    } else {
      console.warn(`⚠️ [mindmap-get] Status is COMPLETED but cache file is missing on S3. Falling back to IDLE.`);
      await updateMindmapStatus(jobId, 'IDLE');
      return { status: 'IDLE' };
    }
  }

  return { status };
}

export async function handleAsyncMindmapJob(event: { jobId: string; userId: string; invocationDepth: number }): Promise<void> {
  const { jobId, userId, invocationDepth } = event;
  console.log(`🤖 [mindmap-async] Background worker started for jobId=${jobId}, depth=${invocationDepth}`);

  if (invocationDepth && invocationDepth > 1) {
    console.error(`❌ [mindmap-async] Circuit breaker: Recursive call detected! depth=${invocationDepth}. Aborting.`);
    return;
  }

  try {
    await handleMindmapJob({ jobId, userId });
    await updateMindmapStatus(jobId, 'COMPLETED');
    console.log(`✅ [mindmap-async] Generation successful for jobId=${jobId}. Status COMPLETED.`);
  } catch (err: any) {
    console.error(`❌ [mindmap-async] Error during generation for jobId=${jobId}:`, err?.message || err);
    await updateMindmapStatus(jobId, 'FAILED');
  }
}

async function acquireLock(jobId: string): Promise<boolean> {
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes lock
  const now = Date.now();
  const expiredTime = now - lockTimeoutMs;

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': 'mindmapStatus',
          '#updatedAt': 'mindmapUpdatedAt'
        },
        UpdateExpression: 'SET #status = :generating, #updatedAt = :now',
        ConditionExpression: `attribute_not_exists(#status) OR #status = :idle OR #status = :failed OR #updatedAt < :expiredTime`,
        ExpressionAttributeValues: {
          ':generating': { S: 'GENERATING' },
          ':now': { N: now.toString() },
          ':idle': { S: 'IDLE' },
          ':failed': { S: 'FAILED' },
          ':expiredTime': { N: expiredTime.toString() }
        }
      })
    );
    return true;
  } catch (err: any) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`🔒 [mindmap-post] Lock acquisition failed for jobId=${jobId}. Another request is generating.`);
      return false;
    }
    console.error(`❌ [mindmap-post] DynamoDB Lock acquisition failed for jobId=${jobId}:`, err);
    throw err;
  }
}

async function updateMindmapStatus(jobId: string, status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED'): Promise<void> {
  const now = Date.now();
  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': 'mindmapStatus',
          '#updatedAt': 'mindmapUpdatedAt'
        },
        UpdateExpression: 'SET #status = :status, #updatedAt = :now',
        ExpressionAttributeValues: {
          ':status': { S: status },
          ':now': { N: now.toString() }
        }
      })
    );
  } catch (err: any) {
    console.error(`❌ [mindmap-post] Failed to update mindmapStatus to ${status} for jobId=${jobId}:`, err);
  }
}
