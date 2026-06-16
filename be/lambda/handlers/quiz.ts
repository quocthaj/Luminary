// ============================================
// HANDLER: AI Quiz Generator
// Story 4.1 — Tự động sinh và làm bài Trắc nghiệm
// ============================================

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN } from '../utils/aws-clients';
import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface QuizQuestion {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface QuizData {
  questions: QuizQuestion[];
  questionCount: number;
}

export interface QuizValidationResult {
  valid: boolean;                  // true ONLY if all 5 questions valid AND length === 5
  validQuestions: QuizQuestion[];  // questions that individually passed validation
  errors: string[];                // aggregated errors/warnings for prompt feedback
  isCritical: boolean;             // true if validQuestions.length < 3 (quiz unusable)
}

interface QuizInput {
  jobId: string;
  userId: string;
  count?: number;
}

// ============================================
// GEMINI STRUCTURED OUTPUT SCHEMA
// ============================================

const quizResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    questions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          questionText: {
            type: SchemaType.STRING,
            description: 'Câu hỏi tập trung vào thuật toán, phương pháp, công thức, hoặc phát hiện thực nghiệm cốt lõi của bài báo'
          },
          options: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: 'Đúng 4 phương án lựa chọn'
          },
          correctOptionIndex: {
            type: SchemaType.INTEGER,
            description: 'Chỉ số đáp án đúng (0-3)'
          },
          explanation: {
            type: SchemaType.STRING,
            description: 'Giải thích chi tiết tại sao đáp án đó đúng, có thể chứa ký hiệu toán học'
          }
        },
        required: ['questionText', 'options', 'correctOptionIndex', 'explanation']
      },
      description: 'Đúng 5 câu hỏi trắc nghiệm'
    }
  },
  required: ['questions']
};

// ============================================
// VALIDATION
// ============================================

/**
 * Kiểm tra tính hợp lệ của dữ liệu Quiz sinh ra từ Gemini hoặc đọc từ S3 cache.
 */
export function validateQuiz(data: any, expectedCount: number = 10): QuizValidationResult {
  const errors: string[] = [];
  const validQuestions: QuizQuestion[] = [];
  let isCritical = false;

  // 1. Kiểm tra cấu trúc tổng thể
  if (!data || typeof data !== 'object') {
    return {
      valid: false,
      validQuestions: [],
      errors: ['Dữ liệu đầu vào không hợp lệ (phải là một đối tượng JSON).'],
      isCritical: true
    };
  }

  if (!Array.isArray(data.questions)) {
    return {
      valid: false,
      validQuestions: [],
      errors: ["Thuộc tính 'questions' phải là một mảng (Array)."],
      isCritical: true
    };
  }

  const questionsArray = data.questions;

  // 2. Kiểm tra số lượng câu hỏi
  // Tách rõ: lỗi nghiêm trọng vs cảnh báo không đạt mục tiêu
  const minQuestions = Math.ceil(expectedCount * 0.6);

  if (questionsArray.length < minQuestions) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Số lượng câu hỏi quá ít (${questionsArray.length} câu). ` +
      `Phải sinh đúng ${expectedCount} câu hỏi.`
    );
    isCritical = true;
  } else if (questionsArray.length > expectedCount) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Số lượng câu hỏi vượt quá giới hạn (${questionsArray.length} câu). ` +
      `Chỉ được phép sinh tối đa ${expectedCount} câu hỏi.`
    );
    isCritical = true;
  } else if (questionsArray.length !== expectedCount) {
    errors.push(
      `CẢNH BÁO: Số lượng câu hỏi không đạt mục tiêu (hiện có ${questionsArray.length} câu). ` +
      `Hãy sinh đủ ${expectedCount} câu hỏi.`
    );
  }

  // 3. Kiểm tra chi tiết từng câu hỏi
  for (let i = 0; i < questionsArray.length; i++) {
    const q = questionsArray[i];
    const qErrors: string[] = [];

    if (!q || typeof q !== 'object') {
      errors.push(`Câu ${i + 1}: Dữ liệu câu hỏi phải là một đối tượng JSON.`);
      continue;
    }

    if (!q.questionText || typeof q.questionText !== 'string' || q.questionText.trim() === '') {
      qErrors.push("'questionText' không được để trống.");
    }

    if (!Array.isArray(q.options)) {
      qErrors.push("'options' phải là một mảng.");
    } else {
      if (q.options.length !== 4) {
        qErrors.push(`'options' phải chứa đúng 4 phương án (hiện có ${q.options.length}).`);
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j] || typeof q.options[j] !== 'string' || q.options[j].trim() === '') {
          qErrors.push(`'options[${j}]' không được để trống.`);
        }
      }
    }

    if (typeof q.correctOptionIndex !== 'number' || !Number.isInteger(q.correctOptionIndex)) {
      qErrors.push("'correctOptionIndex' phải là số nguyên.");
    } else {
      const optLen = Array.isArray(q.options) ? q.options.length : 4;
      if (q.correctOptionIndex < 0 || q.correctOptionIndex >= optLen) {
        qErrors.push(
          `'correctOptionIndex' (${q.correctOptionIndex}) phải nằm trong khoảng 0 đến ${optLen - 1}.`
        );
      }
    }

    if (!q.explanation || typeof q.explanation !== 'string' || q.explanation.trim() === '') {
      qErrors.push("'explanation' không được để trống.");
    }

    if (qErrors.length === 0) {
      validQuestions.push(q as QuizQuestion);
    } else {
      errors.push(`Câu ${i + 1}: ${qErrors.join(', ')}`);
    }
  }

  // 4. Nếu số câu hợp lệ thực tế < minQuestions → cực kỳ nghiêm trọng
  if (validQuestions.length < minQuestions && !isCritical) {
    errors.push(
      `LỖI NGHIÊM TRỌNG: Chỉ có ${validQuestions.length} câu hỏi hợp lệ. ` +
      `Yêu cầu tối thiểu là ${minQuestions} câu để có thể sử dụng.`
    );
    isCritical = true;
  }

  const valid = errors.length === 0 && questionsArray.length === expectedCount && validQuestions.length === expectedCount;

  return { valid, validQuestions, errors, isCritical };
}

// ============================================
// CACHE HELPERS
// ============================================

function matchesRequestedCount(cachedCount: number, requestedCount: number): boolean {
  if (cachedCount === requestedCount) return true;
  const minQuestions = Math.ceil(requestedCount * 0.6);
  if (cachedCount >= minQuestions && cachedCount <= requestedCount) return true;
  return false;
}

/**
 * Đọc quiz cache từ S3. Sử dụng isCritical (không phải valid) để quyết định cache hit/miss.
 */
async function readCachedQuiz(quizKey: string, requestedCount: number): Promise<QuizData | null> {
  try {
    const raw = await getResultFromS3(quizKey);
    const parsed = JSON.parse(raw);
    const { isCritical } = validateQuiz(parsed, requestedCount);
    if (isCritical) {
      console.warn(`⚠️ [quiz] Cached quiz at ${quizKey} is corrupt or unusable — treating as cache miss.`);
      return null;
    }
    if (!matchesRequestedCount(parsed.questionCount, requestedCount)) {
      console.log(`🔄 [quiz] Cached count (${parsed.questionCount}) does not match requested count (${requestedCount}) — treating as miss.`);
      return null;
    }
    return parsed as QuizData;
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
  return `Bạn là một chuyên gia giáo dục học thuật. Nhiệm vụ của bạn là tạo ra ĐÚNG ${count} câu hỏi trắc nghiệm bốn lựa chọn (A, B, C, D) để kiểm tra mức độ hiểu biết sâu về bài báo khoa học dưới đây.

YÊU CẦU BẮT BUỘC:
- Tập trung 100% vào: thuật toán cốt lõi, công thức toán học, phương pháp thực nghiệm, và kết quả chính của bài báo.
- TUYỆT ĐỐI KHÔNG hỏi về từ vựng, định nghĩa đơn giản, hay thông tin ngoài lề.
- Mỗi câu hỏi phải có ĐÚNG 4 phương án lựa chọn.
- correctOptionIndex phải là số nguyên từ 0 đến 3 (tương ứng với phương án đúng trong mảng options).
- explanation phải giải thích rõ ràng tại sao đáp án đó đúng và các đáp án kia sai.
- Viết câu hỏi và giải thích bằng Tiếng Việt học thuật, rõ ràng.

NỘI DUNG BÀI BÁO:
---
${analysisContent.slice(0, 50000)}
---

Sinh ĐÚNG ${count} câu hỏi trắc nghiệm.`;
}

function buildFeedbackPrompt(basePrompt: string, errors: string[], count: number): string {
  const errorSummary = errors.slice(0, 10).join('\n');
  return `${basePrompt}

LỖI TỪ LẦN SINH TRƯỚC (hãy sửa lại):
${errorSummary}

Sinh lại ĐÚNG ${count} câu hỏi trắc nghiệm đúng schema, không lặp lại các lỗi trên.`;
}

async function callGeminiStructuredOutput(prompt: string): Promise<any> {
  const geminiKey = await getSecret(GEMINI_SECRET_ARN);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: quizResponseSchema as any,
      temperature: 0.4,
    }
  });
  const result = await model.generateContent(prompt);
  const raw = result.response.text();
  return JSON.parse(raw);
}

// ============================================
// MAIN HANDLER
// ============================================

export async function handleQuizJob(input: QuizInput): Promise<QuizData> {
  const { jobId, userId, count } = input;
  const requestedCount = count && [5, 10, 20].includes(count) ? count : 10;
  console.log(`🧠 [quiz] handleQuizJob — jobId=${jobId}, userId=${userId}, count=${requestedCount}`);

  // ─────────────────────────────────────────
  // BƯỚC 1: Ownership check (Fail Fast on Auth)
  // ─────────────────────────────────────────
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    console.warn(`⚠️ [quiz] User ${userId} unauthorized access to job ${jobId} (owned by ${jobOwnerId})`);
    throw new Error('FORBIDDEN');
  }

  // ─────────────────────────────────────────
  // BƯỚC 2: Translation status check → 409
  // ─────────────────────────────────────────
  const jobStatus = jobItem.status?.S;
  const s3OutputKey = jobItem.s3OutputKey?.S;
  if (jobStatus !== 'completed' || !s3OutputKey) {
    console.warn(`⚠️ [quiz] Job ${jobId} not ready (status=${jobStatus}, s3OutputKey=${s3OutputKey})`);
    throw new Error('ANALYSIS_NOT_FOUND');
  }

  // ─────────────────────────────────────────
  // BƯỚC 3: Cache read (sử dụng isCritical và count check)
  // ─────────────────────────────────────────
  const fileName = jobItem.fileName?.S || jobId;
  const quizKey = `results/${jobId}/quiz-${requestedCount}.json`;
  const cached = await readCachedQuiz(quizKey, requestedCount);
  if (cached) {
    console.log(`✅ [quiz] Cache hit for jobId=${jobId} (${cached.questionCount} questions)`);
    return cached;
  }

  console.log(`🔄 [quiz] Cache miss for jobId=${jobId}. Loading analysis and generating quiz...`);

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
  let lastResult: QuizValidationResult | null = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`🤖 [quiz] Gemini attempt ${attempt}/2 for jobId=${jobId}`);

    try {
      const prompt = attempt === 1
        ? basePrompt
        : buildFeedbackPrompt(basePrompt, lastResult!.errors, requestedCount);

      const parsed = await callGeminiStructuredOutput(prompt);
      lastResult = validateQuiz(parsed, requestedCount);

        if (lastResult.valid) {
          const quizData: QuizData = {
            questions: lastResult.validQuestions,
            questionCount: lastResult.validQuestions.length,
          };
          await saveResultToS3(jobId, fileName, JSON.stringify(quizData), `quiz-${requestedCount}.json`);
          console.log(`✅ [quiz] Quiz generated successfully (attempt ${attempt}) — ${requestedCount} questions.`);
          return quizData;
        }

        console.warn(`⚠️ [quiz] Attempt ${attempt} failed validation:`, lastResult.errors.slice(0, 5));

      } catch (err: any) {
        console.error(`❌ [quiz] Gemini call failed (attempt ${attempt}):`, err?.message || err);
        throw err;
      }
    }

    // ─────────────────────────────────────────
    // BƯỚC 6: Fallback sau 2 lần thất bại validation
    // ─────────────────────────────────────────
    if (!lastResult) {
      throw new Error('QUIZ_GENERATION_FAILED');
    }

    const { isCritical, validQuestions } = lastResult;

    if (!isCritical) {
      console.warn(`⚠️ [quiz] Fallback: accepting partial quiz (${validQuestions.length} questions) for jobId=${jobId}`);
      const quizData: QuizData = {
        questions: validQuestions,
        questionCount: validQuestions.length,
      };
      await saveResultToS3(jobId, fileName, JSON.stringify(quizData), `quiz-${requestedCount}.json`);
      return quizData;
    }

  console.error(`❌ [quiz] Quiz generation failed after 2 attempts. Only ${validQuestions.length} valid questions. jobId=${jobId}`);
  throw new Error('QUIZ_GENERATION_FAILED');
}
