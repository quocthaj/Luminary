// ============================================
// TESTS: AI Quiz Generator Handler (Story 4.1)
// be/test/quiz.test.ts
// ============================================

const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetResultFromS3 = jest.fn();
const mockSaveResultToS3 = jest.fn();
const mockGenerateContent = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => ({
  generateContent: (args: any) => mockGenerateContent(args),
}));

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
}));

jest.mock('../lambda/utils/s3-helpers', () => ({
  getResultFromS3: (key: string) => mockGetResultFromS3(key),
  saveResultToS3: (...args: any[]) => mockSaveResultToS3(...args),
}));

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: (config: any) => mockGetGenerativeModel(config),
  })),
  SchemaType: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
    INTEGER: 'INTEGER',
  },
}));

import { handleQuizJob, validateQuiz } from '../lambda/handlers/quiz';

// ============================================
// TEST FIXTURES
// ============================================

const VALID_JOB_ITEM = {
  userId: { S: 'user-123' },
  jobId: { S: 'job-abc' },
  status: { S: 'completed' },
  s3OutputKey: { S: 'results/job-abc/analysis.md' },
  fileName: { S: 'paper.pdf' },
};

function makeQuestion(overrides: Record<string, any> = {}) {
  return {
    questionText: 'Thuật toán nào được đề xuất trong bài báo?',
    options: ['Phương án A', 'Phương án B', 'Phương án C', 'Phương án D (đúng)'],
    correctOptionIndex: 3,
    explanation: 'Giải thích chi tiết về phương án D.',
    ...overrides,
  };
}

function makeValidQuizPayload(count = 5) {
  return {
    questions: Array.from({ length: count }, (_, i) => makeQuestion({
      questionText: `Câu hỏi số ${i + 1} về bài báo?`,
    })),
  };
}

// ============================================
// TESTS: validateQuiz()
// ============================================

describe('validateQuiz()', () => {
  it('returns valid=true, isCritical=false for a perfect 10-question quiz', () => {
    const result = validateQuiz(makeValidQuizPayload(10), 10);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validQuestions).toHaveLength(10);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false, isCritical=false for 8 valid questions (warning, not critical)', () => {
    const result = validateQuiz(makeValidQuizPayload(8), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.validQuestions).toHaveLength(8);
    expect(result.errors.some(e => e.includes('CẢNH BÁO'))).toBe(true);
  });

  it('returns isCritical=true when questions.length < minQuestions (e.g. 5 out of 10)', () => {
    const result = validateQuiz(makeValidQuizPayload(5), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });

  it('returns isCritical=true when questions.length > expectedCount', () => {
    const result = validateQuiz(makeValidQuizPayload(11), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });

  it('validates custom expectedCount (e.g., 5)', () => {
    const result = validateQuiz(makeValidQuizPayload(5), 5);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validQuestions).toHaveLength(5);
  });

  it('validates custom expectedCount (e.g., 20)', () => {
    const result = validateQuiz(makeValidQuizPayload(20), 20);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validQuestions).toHaveLength(20);
  });

  it('returns isCritical=true when validQuestions.length < minQuestions due to per-question errors', () => {
    const data = {
      questions: [
        makeQuestion(),                                          // valid
        makeQuestion(),                                          // valid
        makeQuestion(),                                          // valid
        makeQuestion({ questionText: '' }),                      // invalid
        makeQuestion({ options: ['A', 'B'] }),                   // invalid (2 options)
        makeQuestion({ correctOptionIndex: 99 }),                // invalid
        makeQuestion({ explanation: '' }),                       // invalid
        makeQuestion(),                                          // valid
        makeQuestion(),                                          // valid
        makeQuestion({ questionText: '' }),                      // invalid
      ],
    };
    const result = validateQuiz(data, 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true); // only 5 valid questions, which is less than min (6)
    expect(result.validQuestions).toHaveLength(5);
  });

  it('includes per-question error messages in errors[]', () => {
    const data = {
      questions: [makeQuestion({ correctOptionIndex: 10 }), ...Array.from({ length: 9 }, () => makeQuestion())],
    };
    const result = validateQuiz(data, 10);
    expect(result.errors.some(e => e.includes('correctOptionIndex'))).toBe(true);
  });

  it('returns isCritical=true for non-object input', () => {
    const result = validateQuiz('invalid string');
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });

  it('returns isCritical=true when questions field is missing', () => {
    const result = validateQuiz({ notQuestions: [] });
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });
});

// ============================================
// TESTS: handleQuizJob()
// ============================================

describe('handleQuizJob()', () => {
  beforeEach(() => {
    mockGetJobItem.mockReset();
    mockGetSecret.mockReset();
    mockGetResultFromS3.mockReset();
    mockSaveResultToS3.mockReset();
    mockGenerateContent.mockReset();

    // Default: Gemini returns a valid API key
    mockGetSecret.mockResolvedValue('fake-gemini-api-key');

    // Default: saveResultToS3 succeeds silently
    mockSaveResultToS3.mockResolvedValue('results/job-abc/quiz-10.json');
  });

  // ──────────────────────────────────────────
  // AUTH & OWNERSHIP
  // ──────────────────────────────────────────

  it('[auth] throws JOB_NOT_FOUND when job does not exist in DynamoDB', async () => {
    mockGetJobItem.mockResolvedValue(null);
    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('JOB_NOT_FOUND');
  });

  it('[auth] throws FORBIDDEN when userId does not match job owner', async () => {
    mockGetJobItem.mockResolvedValue({ ...VALID_JOB_ITEM, userId: { S: 'user-OWNER' } });
    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-INTRUDER' }))
      .rejects.toThrow('FORBIDDEN');
  });

  it('[auth] does not allow guest fallback — strict ownership check', async () => {
    mockGetJobItem.mockResolvedValue({ ...VALID_JOB_ITEM, userId: { S: 'guest' } });
    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('FORBIDDEN');
  });

  // ──────────────────────────────────────────
  // TRANSLATION STATUS CHECK
  // ──────────────────────────────────────────

  it('[status] throws ANALYSIS_NOT_FOUND when job status is not completed', async () => {
    mockGetJobItem.mockResolvedValue({ ...VALID_JOB_ITEM, status: { S: 'processing' } });
    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ANALYSIS_NOT_FOUND');
  });

  it('[status] throws ANALYSIS_NOT_FOUND when s3OutputKey is missing', async () => {
    const { s3OutputKey: _removed, ...jobWithoutKey } = VALID_JOB_ITEM;
    mockGetJobItem.mockResolvedValue(jobWithoutKey);
    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ANALYSIS_NOT_FOUND');
  });

  // ──────────────────────────────────────────
  // CACHE HIT
  // ──────────────────────────────────────────

  it('[cache-hit] returns cached quiz without calling Gemini when cache is valid', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const cachedQuiz = makeValidQuizPayload(10);
    // First S3 call = quiz-10.json cache read (hit)
    mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify({
      ...cachedQuiz,
      questionCount: 10,
    }));

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });

    expect(result.questionCount).toBe(10);
    expect(result.questions).toHaveLength(10);
    // Gemini must NOT have been called
    expect(mockGenerateContent).not.toHaveBeenCalled();
    // S3 write must NOT have been called (no regeneration)
    expect(mockSaveResultToS3).not.toHaveBeenCalled();
  });

  it('[cache-hit] accepts partial cached quiz (8 questions, isCritical=false) without regenerating', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify({
      ...makeValidQuizPayload(8),
      questionCount: 8,
    }));

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });

    expect(result.questions).toHaveLength(8);
    expect(result.questionCount).toBe(8);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('[cache-hit] treats corrupt cache (isCritical=true) as cache miss and regenerates', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);

    // quiz-10.json cache: corrupt (only 5 valid questions out of 10 -> isCritical)
    const corruptCache = {
      questions: Array.from({ length: 5 }, () => makeQuestion({ questionText: '' })), 
      questionCount: 5,
    };
    mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(corruptCache));

    // analysis.md content read
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo dài...');

    // Gemini returns a valid 10-question quiz
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(makeValidQuizPayload(10)) },
    });

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });
    expect(result.questions).toHaveLength(10);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
  });

  it('[cache-hit] propagates real S3 errors (AccessDenied) without treating as cache miss', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const s3Error = Object.assign(new Error('Access Denied'), { name: 'AccessDenied' });
    mockGetResultFromS3.mockRejectedValueOnce(s3Error);

    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('Access Denied');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────
  // GENERATION — PASS-1
  // ──────────────────────────────────────────

  it('[pass-1] generates and caches quiz successfully on first Gemini attempt', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    // Cache miss (NoSuchKey)
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    // analysis.md
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo...');

    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(makeValidQuizPayload(10)) },
    });

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });

    expect(result.questions).toHaveLength(10);
    expect(result.questionCount).toBe(10);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
    // Verify saved content includes questionCount
    const savedContent = JSON.parse(mockSaveResultToS3.mock.calls[0][2]);
    expect(savedContent.questionCount).toBe(10);
  });

  // ──────────────────────────────────────────
  // GENERATION — PASS-2 (retry with feedback)
  // ──────────────────────────────────────────

  it('[pass-2] retries with feedback on first fail, succeeds on second attempt', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo...');

    // Attempt 1: invalid (only 5 valid questions, which is critical for 10)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidQuizPayload(5)) },
    });
    // Attempt 2: valid 10 questions
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidQuizPayload(10)) },
    });

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });

    expect(result.questions).toHaveLength(10);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // Verify the second prompt contains the error feedback
    const secondCallPrompt = mockGenerateContent.mock.calls[1][0];
    const promptText = typeof secondCallPrompt === 'string'
      ? secondCallPrompt
      : JSON.stringify(secondCallPrompt);
    expect(promptText).toMatch(/lỗi|CẢNH BÁO/i);
  });

  // ──────────────────────────────────────────
  // GENERATION — FALLBACK (partial quiz)
  // ──────────────────────────────────────────

  it('[fallback-ok] saves partial quiz (8 valid questions) after 2 failed attempts', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo...');

    // Both attempts return 8 valid questions (valid=false, isCritical=false)
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(makeValidQuizPayload(8)) },
    });

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123' });

    expect(result.questions).toHaveLength(8);
    expect(result.questionCount).toBe(8);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
    const savedContent = JSON.parse(mockSaveResultToS3.mock.calls[0][2]);
    expect(savedContent.questions).toHaveLength(8);
  });

  // ──────────────────────────────────────────
  // GENERATION — CRITICAL FAIL (no cache write)
  // ──────────────────────────────────────────

  it('[fallback-fail] throws QUIZ_GENERATION_FAILED and does NOT save cache when <6 valid questions', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo...');

    // Both attempts return only 5 valid questions (isCritical=true)
    const criticalPayload = {
      questions: [
        makeQuestion(),       // valid
        makeQuestion(),       // valid
        makeQuestion(),       // valid
        makeQuestion(),       // valid
        makeQuestion(),       // valid
        makeQuestion({ questionText: '' }), // invalid
        makeQuestion({ options: [] }),      // invalid
        makeQuestion({ correctOptionIndex: 99 }), // invalid
      ],
    };
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(criticalPayload) },
    });

    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('QUIZ_GENERATION_FAILED');

    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // CRITICAL: S3 must NOT be written to (avoid poison cache)
    expect(mockSaveResultToS3).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────
  // NETWORK ERROR — propagate immediately
  // ──────────────────────────────────────────

  it('[network-error] propagates Gemini network error immediately without retry or fallback', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Nội dung bài báo...');

    const networkError = new Error('ECONNREFUSED: Gemini API unreachable');
    mockGenerateContent.mockRejectedValue(networkError);

    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ECONNREFUSED');

    // Must have tried only once (no retry on network error)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockSaveResultToS3).not.toHaveBeenCalled();
  });

  // ──────────────────────────────────────────
  // NULL-GUARD — lastResult safety
  // ──────────────────────────────────────────

  it('[null-guard] throws QUIZ_GENERATION_FAILED safely when lastResult is null (Gemini throws on attempt 1)', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    // No cache
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Content...');

    // Gemini throws immediately — lastResult stays null
    mockGenerateContent.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(handleQuizJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ECONNREFUSED');

    // Fallback block must NOT be reached with null lastResult
    expect(mockSaveResultToS3).not.toHaveBeenCalled();
  });

  it('generates custom count of questions requested via count parameter (e.g. 5)', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const missError = Object.assign(new Error('Not Found'), { name: 'NoSuchKey' });
    mockGetResultFromS3.mockRejectedValueOnce(missError);
    mockGetResultFromS3.mockResolvedValueOnce('Content...');

    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify(makeValidQuizPayload(5)) },
    });

    const result = await handleQuizJob({ jobId: 'job-abc', userId: 'user-123', count: 5 });

    expect(result.questions).toHaveLength(5);
    expect(result.questionCount).toBe(5);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
    expect(mockSaveResultToS3.mock.calls[0][3]).toBe('quiz-5.json');
  });
});
