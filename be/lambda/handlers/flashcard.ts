import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN, dynamodbClient, JOBS_TABLE } from '../utils/aws-clients';
import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface FlashcardItem {
  term: string;
  pronunciation: string;
  translation: string;
  definition: string;
}

export interface FlashcardData {
  flashcards: FlashcardItem[];
  cardCount: number;
}

export interface FlashcardValidationResult {
  valid: boolean;                  // true ONLY if all cards are valid and count matches expected
  validCards: FlashcardItem[];      // cards that individually passed validation
  errors: string[];                // aggregated errors/warnings for prompt feedback
  isCritical: boolean;             // true if validCards.length < 60% of expected (unusable)
}

interface FlashcardInput {
  jobId: string;
  userId: string;
  count?: number;
}

// ============================================
// GEMINI STRUCTURED OUTPUT SCHEMA
// ============================================

const flashcardResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    flashcards: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          term: { 
            type: SchemaType.STRING, 
            description: 'Scientific or academic term in English (e.g., "Gradient Descent")' 
          },
          pronunciation: { 
            type: SchemaType.STRING, 
            description: 'Phonetic IPA guide. If the term is a formula or abbreviation without standard pronunciation, return empty string "". (e.g., "/ˈɡreɪdiənt dɪˈsɛnt/")' 
          },
          translation: { 
            type: SchemaType.STRING, 
            description: 'Brief translation in Vietnamese (e.g., "Cực tiểu hóa theo độ dốc")' 
          },
          definition: { 
            type: SchemaType.STRING, 
            description: 'Detailed definition in bilingual. First sentence in English, second sentence in Vietnamese.' 
          }
        },
        required: ['term', 'pronunciation', 'translation', 'definition']
      },
      description: 'List of academic flashcards'
    }
  },
  required: ['flashcards']
};

// ============================================
// VALIDATION
// ============================================

/**
 * Kiểm tra tính hợp lệ của dữ liệu Flashcard sinh ra từ Gemini hoặc đọc từ S3 cache.
 */
export function validateFlashcards(data: any, expectedCount: number = 10): FlashcardValidationResult {
  const errors: string[] = [];
  const validCards: FlashcardItem[] = [];
  let isCritical = false;

  // 1. Kiểm tra cấu trúc tổng thể
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      validCards: [],
      errors: ['Dữ liệu đầu vào không hợp lệ (phải là một đối tượng JSON).'],
      isCritical: true
    };
  }

  if (!Array.isArray(data.flashcards)) {
    return {
      valid: false,
      validCards: [],
      errors: ["Thuộc tính 'flashcards' phải là một mảng (Array)."],
      isCritical: true
    };
  }

  const cardsArray = data.flashcards;

  // 2. Kiểm tra số lượng thẻ
  const minCards = Math.ceil(expectedCount * 0.6);

  if (cardsArray.length < minCards) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Số lượng thẻ quá ít (${cardsArray.length} thẻ). ` +
      `Phải sinh tối thiểu là ${minCards} thẻ.`
    );
    isCritical = true;
  } else if (cardsArray.length > expectedCount) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Số lượng thẻ vượt quá giới hạn (${cardsArray.length} thẻ). ` +
      `Chỉ được phép sinh tối đa ${expectedCount} thẻ.`
    );
    isCritical = true;
  } else if (cardsArray.length !== expectedCount) {
    errors.push(
      `CẢNH BÁO: Số lượng thẻ không đạt mục tiêu (hiện có ${cardsArray.length} thẻ). ` +
      `Hãy sinh đủ ${expectedCount} thẻ.`
    );
  }

  // 3. Kiểm tra chi tiết từng thẻ
  for (let i = 0; i < cardsArray.length; i++) {
    const card = cardsArray[i];
    const cardErrors: string[] = [];

    if (!card || typeof card !== 'object') {
      errors.push(`Thẻ ${i + 1}: Dữ liệu thẻ phải là một đối tượng JSON.`);
      continue;
    }

    if (!card.term || typeof card.term !== 'string' || card.term.trim() === '') {
      cardErrors.push("'term' không được để trống.");
    }

    // pronunciation là required trong schema của Gemini, nhưng có thể là chuỗi rỗng ""
    if (typeof card.pronunciation !== 'string') {
      cardErrors.push("'pronunciation' phải là một chuỗi (có thể để trống '').");
    }

    if (!card.translation || typeof card.translation !== 'string' || card.translation.trim() === '') {
      cardErrors.push("'translation' không được để trống.");
    }

    if (!card.definition || typeof card.definition !== 'string' || card.definition.trim() === '') {
      cardErrors.push("'definition' không được để trống.");
    }

    if (cardErrors.length === 0) {
      validCards.push(card as FlashcardItem);
    } else {
      errors.push(`Thẻ ${i + 1}: ${cardErrors.join(', ')}`);
    }
  }

  // 4. Nếu số thẻ hợp lệ thực tế < minCards → cực kỳ nghiêm trọng
  if (validCards.length < minCards && !isCritical) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Chỉ có ${validCards.length} thẻ hợp lệ. ` +
      `Yêu cầu tối thiểu là ${minCards} thẻ để có thể sử dụng.`
    );
    isCritical = true;
  }

  const valid = errors.length === 0 && cardsArray.length === expectedCount && validCards.length === expectedCount;

  return { valid, validCards, errors, isCritical };
}

// ============================================
// CACHE HELPERS
// ============================================

function matchesRequestedCount(cachedCount: number, requestedCount: number): boolean {
  if (cachedCount === requestedCount) return true;
  const minCards = Math.ceil(requestedCount * 0.6);
  if (cachedCount >= minCards && cachedCount <= requestedCount) return true;
  return false;
}

/**
 * Đọc flashcard cache từ S3. Sử dụng isCritical (không phải valid) để quyết định cache hit/miss.
 */
async function readCachedFlashcards(flashcardKey: string, requestedCount: number): Promise<FlashcardData | null> {
  try {
    const raw = await getResultFromS3(flashcardKey);
    const parsed = JSON.parse(raw);
    const { isCritical } = validateFlashcards(parsed, requestedCount);
    if (isCritical) {
      console.warn(`⚠️ [flashcard] Cached flashcards at ${flashcardKey} is corrupt or unusable — treating as cache miss.`);
      return null;
    }
    if (!matchesRequestedCount(parsed.cardCount, requestedCount)) {
      console.log(`🔄 [flashcard] Cached count (${parsed.cardCount}) does not match requested count (${requestedCount}) — treating as miss.`);
      return null;
    }
    return parsed as FlashcardData;
  } catch (err: any) {
    if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw err;
  }
}

// ============================================
// GEMINI CALL HELPERS
// ============================================

function buildBasePrompt(analysisContent: string, count: number): string {
  return `Bạn là một trợ lý học thuật chuyên nghiệp. Nhiệm vụ của bạn là trích xuất ĐÚNG ${count} thuật ngữ khoa học khó, khái niệm cốt lõi, hoặc phương pháp luận từ bài nghiên cứu khoa học dưới đây để tạo thành bộ thẻ ghi nhớ (Flashcards).

YÊU CẦU BẮT BUỘC:
1. Trích xuất đúng và chỉ tập trung vào các khái niệm chuyên ngành, thuật toán, công thức toán học khó xuất hiện trong bài báo. TUYỆT ĐỐI KHÔNG chọn các từ vựng tiếng Anh phổ thông.
2. Với mỗi thẻ, sinh thông tin chính xác theo cấu trúc:
   - term: Thuật ngữ tiếng Anh gốc (Ví dụ: "Gradient Descent").
   - pronunciation: Phiên âm IPA chuẩn quốc tế (Ví dụ: "/ˈɡreɪdiənt dɪˈsɛnt/"). Nếu thuật ngữ là công thức toán học, từ viết tắt không có phiên âm chuẩn, hãy trả về chuỗi rỗng "".
   - translation: Bản dịch nghĩa tiếng Việt ngắn gọn, súc tích (Ví dụ: "Cực tiểu hóa theo độ dốc").
   - definition: Định nghĩa song ngữ chi tiết của khái niệm. Câu đầu tiên viết bằng tiếng Anh, câu thứ hai dịch sang tiếng Việt (Hỗ trợ render công thức toán học bằng ký hiệu LaTeX giữa các dấu $ hoặc $$, ví dụ: $E=mc^2$).
3. Sinh đúng định dạng JSON khớp với schema yêu cầu.

NỘI DUNG BÀI BÁO:
---
${analysisContent.slice(0, 50000)}
---

Hãy sinh ĐÚNG ${count} thẻ ghi nhớ.`;
}

function buildFeedbackPrompt(basePrompt: string, errors: string[], count: number): string {
  const errorSummary = errors.slice(0, 10).join('\n');
  return `${basePrompt}

LỖI TỪ LẦN SINH TRƯỚC (hãy sửa lại để đảm bảo cấu trúc chính xác):
${errorSummary}

Sinh lại ĐÚNG ${count} thẻ ghi nhớ đúng schema và không lặp lại lỗi trên.`;
}

async function callGeminiStructuredOutput(prompt: string): Promise<any> {
  const geminiKey = await getSecret(GEMINI_SECRET_ARN);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: flashcardResponseSchema as any,
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

export async function handleFlashcardJob(input: FlashcardInput): Promise<FlashcardData> {
  const { jobId, userId, count } = input;
  const requestedCount = count && [5, 10, 20].includes(count) ? count : 10;
  console.log(`🧠 [flashcard] handleFlashcardJob — jobId=${jobId}, userId=${userId}, count=${requestedCount}`);

  // ─────────────────────────────────────────
  // BƯỚC 1: Ownership check (Fail Fast on Auth)
  // ─────────────────────────────────────────
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    console.warn(`⚠️ [flashcard] User ${userId} unauthorized access to job ${jobId} (owned by ${jobOwnerId})`);
    throw new Error('FORBIDDEN');
  }

  // ─────────────────────────────────────────
  // BƯỚC 2: Translation status check → 409
  // ─────────────────────────────────────────
  const jobStatus = jobItem.status?.S;
  const s3OutputKey = jobItem.s3OutputKey?.S;
  if (jobStatus !== 'completed' || !s3OutputKey) {
    console.warn(`⚠️ [flashcard] Job ${jobId} not ready (status=${jobStatus}, s3OutputKey=${s3OutputKey})`);
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // ─────────────────────────────────────────
  // BƯỚC 3: Cache read (sử dụng isCritical và count check)
  // ─────────────────────────────────────────
  const fileName = jobItem.fileName?.S || jobId;
  const flashcardKey = `results/${jobId}/flashcards-${requestedCount}.json`;
  const cached = await readCachedFlashcards(flashcardKey, requestedCount);
  if (cached) {
    console.log(`✅ [flashcard] Cache hit for jobId=${jobId} (${cached.cardCount} cards)`);
    return cached;
  }

  console.log(`🔄 [flashcard] Cache miss for jobId=${jobId}. Loading analysis and generating flashcards...`);

  // ─────────────────────────────────────────
  // BƯỚC 4: Load analysis.md từ S3
  // ─────────────────────────────────────────
  const analysisContent = await getResultFromS3(s3OutputKey);
  if (!analysisContent || analysisContent.trim().length === 0) {
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // ─────────────────────────────────────────
  // BƯỚC 5: Generate với Feedback-Driven Retry
  // ─────────────────────────────────────────
  const basePrompt = buildBasePrompt(analysisContent, requestedCount);
  let lastResult: FlashcardValidationResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`🤖 [flashcard] Gemini attempt ${attempt}/2 for jobId=${jobId}`);

    try {
      const prompt = attempt === 1
        ? basePrompt
        : buildFeedbackPrompt(basePrompt, lastResult!.errors, requestedCount);

      const parsed = await callGeminiStructuredOutput(prompt);
      lastResult = validateFlashcards(parsed, requestedCount);

      if (lastResult.valid) {
        const flashcardData: FlashcardData = {
          flashcards: lastResult.validCards,
          cardCount: lastResult.validCards.length,
        };
        await saveResultToS3(jobId, fileName, JSON.stringify(flashcardData), `flashcards-${requestedCount}.json`);
        console.log(`✅ [flashcard] Flashcards generated successfully (attempt ${attempt}) — ${requestedCount} cards.`);
        return flashcardData;
      }

      console.warn(`⚠️ [flashcard] Attempt ${attempt} failed validation:`, lastResult.errors.slice(0, 5));

    } catch (err: any) {
      console.error(`❌ [flashcard] Gemini call failed (attempt ${attempt}):`, err?.message || err);
      throw err;
    }
  }

  // ─────────────────────────────────────────
  // BƯỚC 6: Fallback sau 2 lần thất bại validation
  // ─────────────────────────────────────────
  if (!lastResult) {
    throw new Error('FLASHCARD_GENERATION_FAILED');
  }

  const { isCritical, validCards } = lastResult;

  if (!isCritical) {
    console.warn(`⚠️ [flashcard] Fallback: accepting partial flashcards (${validCards.length} cards) for jobId=${jobId}`);
    const flashcardData: FlashcardData = {
      flashcards: validCards,
      cardCount: validCards.length,
    };
    await saveResultToS3(jobId, fileName, JSON.stringify(flashcardData), `flashcards-${requestedCount}.json`);
    return flashcardData;
  }

  console.error(`❌ [flashcard] Flashcard generation failed after 2 attempts. Only ${validCards.length} valid cards. jobId=${jobId}`);
  throw new Error('FLASHCARD_GENERATION_FAILED');
}

// ============================================
// POLLING API CONTROLLERS
// ============================================

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

export async function handleFlashcardPost(input: { jobId: string; userId: string; count?: number }): Promise<any> {
  const { jobId, userId, count } = input;
  const requestedCount = count && [5, 10, 20].includes(count) ? count : 10;

  // 1. Ownership & translation status checks
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

  // Validate count parameter is strictly supported
  if (count !== undefined && ![5, 10, 20].includes(count)) {
    throw new Error('INVALID_COUNT');
  }

  // 2. Cache check
  const flashcardKey = `results/${jobId}/flashcards-${requestedCount}.json`;
  const cached = await readCachedFlashcards(flashcardKey, requestedCount);
  if (cached) {
    console.log(`✅ [flashcard-post] Cache hit for jobId=${jobId}, count=${requestedCount}. Setting completed in DB.`);
    await updateFlashcardStatus(jobId, requestedCount, 'COMPLETED');
    return {
      status: 'COMPLETED',
      flashcards: cached.flashcards,
      cardCount: cached.cardCount
    };
  }

  // 3. Acquire lock
  const locked = await acquireLock(jobId, requestedCount);
  if (locked) {
    console.log(`🔒 [flashcard-post] Lock acquired. Invoking async generator for jobId=${jobId}, count=${requestedCount}...`);
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'vietai-orchestrator',
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              asyncRun: true,
              tool: 'flashcard',
              jobId,
              userId,
              count: requestedCount,
              invocationDepth: 1
            })
          )
        })
      );
    } catch (invokeErr: any) {
      console.error(`❌ [flashcard-post] Failed to invoke lambda:`, invokeErr);
      // Release lock on invocation failure so user doesn't wait 5 mins
      await updateFlashcardStatus(jobId, requestedCount, 'FAILED');
      throw invokeErr;
    }
  }

  return { status: 'GENERATING' };
}

export async function handleFlashcardGet(input: { jobId: string; userId: string; count?: number }): Promise<any> {
  const { jobId, userId, count } = input;
  const requestedCount = count && [5, 10, 20].includes(count) ? count : 10;

  // Validate count parameter is strictly supported
  if (count !== undefined && ![5, 10, 20].includes(count)) {
    throw new Error('INVALID_COUNT');
  }

  // 1. Ownership checks
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }
  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    throw new Error('FORBIDDEN');
  }

  // 2. Read status from DynamoDB
  const status = jobItem[`flashcardStatus_${requestedCount}`]?.S || 'IDLE';

  if (status === 'COMPLETED') {
    // Read cached flashcards from S3
    const flashcardKey = `results/${jobId}/flashcards-${requestedCount}.json`;
    const cached = await readCachedFlashcards(flashcardKey, requestedCount);
    if (cached) {
      return {
        status: 'COMPLETED',
        flashcards: cached.flashcards,
        cardCount: cached.cardCount
      };
    } else {
      console.warn(`⚠️ [flashcard-get] Status is COMPLETED but cache file is missing on S3. Falling back to IDLE.`);
      await updateFlashcardStatus(jobId, requestedCount, 'IDLE');
      return { status: 'IDLE' };
    }
  }

  return { status };
}

export async function handleAsyncFlashcardJob(event: { jobId: string; userId: string; count: number; invocationDepth: number }): Promise<void> {
  const { jobId, userId, count, invocationDepth } = event;
  console.log(`🤖 [flashcard-async] Background worker started for jobId=${jobId}, count=${count}, depth=${invocationDepth}`);

  if (invocationDepth && invocationDepth > 1) {
    console.error(`❌ [flashcard-async] Circuit breaker: Recursive call detected! depth=${invocationDepth}. Aborting.`);
    return;
  }

  try {
    // Call the core generator handler
    await handleFlashcardJob({ jobId, userId, count });
    
    // Set status to COMPLETED
    await updateFlashcardStatus(jobId, count, 'COMPLETED');
    console.log(`✅ [flashcard-async] Generation successful for jobId=${jobId}, count=${count}. Status COMPLETED.`);
  } catch (err: any) {
    console.error(`❌ [flashcard-async] Error during generation for jobId=${jobId}, count=${count}:`, err?.message || err);
    // Always update status to FAILED on error
    await updateFlashcardStatus(jobId, count, 'FAILED');
  }
}

async function acquireLock(jobId: string, count: number): Promise<boolean> {
  const lockTimeoutMs = 5 * 60 * 1000; // 5 minutes lock
  const now = Date.now();
  const expiredTime = now - lockTimeoutMs;

  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': `flashcardStatus_${count}`,
          '#updatedAt': `flashcardUpdatedAt_${count}`
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
      console.log(`🔒 [flashcard-post] Lock acquisition failed for jobId=${jobId}, count=${count}. Another request is generating.`);
      return false;
    }
    console.error(`❌ [flashcard-post] DynamoDB Lock acquisition failed for jobId=${jobId}:`, err);
    throw err;
  }
}

async function updateFlashcardStatus(jobId: string, count: number, status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED'): Promise<void> {
  const now = Date.now();
  try {
    await dynamodbClient.send(
      new UpdateItemCommand({
        TableName: JOBS_TABLE,
        Key: { jobId: { S: jobId } },
        ExpressionAttributeNames: {
          '#status': `flashcardStatus_${count}`,
          '#updatedAt': `flashcardUpdatedAt_${count}`
        },
        UpdateExpression: 'SET #status = :status, #updatedAt = :now',
        ExpressionAttributeValues: {
          ':status': { S: status },
          ':now': { N: now.toString() }
        }
      })
    );
  } catch (err: any) {
    console.error(`❌ [flashcard-post] Failed to update flashcardStatus_${count} to ${status} for jobId=${jobId}:`, err);
  }
}
