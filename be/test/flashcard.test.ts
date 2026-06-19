const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetResultFromS3 = jest.fn();
const mockSaveResultToS3 = jest.fn();
const mockGenerateContent = jest.fn();
const mockDynamoDBSend = jest.fn();
const mockLambdaSend = jest.fn();

const mockGetGenerativeModel = jest.fn().mockImplementation(() => ({
  generateContent: (args: any) => mockGenerateContent(args),
}));

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: (arn: string) => mockGetSecret(arn),
  GEMINI_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:vietai/gemini-key',
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
  JOBS_TABLE: 'mock-jobs-table',
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: (cmd: any) => mockLambdaSend(cmd),
  })),
  InvokeCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  UpdateItemCommand: jest.fn().mockImplementation((payload) => payload),
  GetItemCommand: jest.fn().mockImplementation((payload) => payload),
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

import { handleFlashcardJob, validateFlashcards, handleFlashcardPost, handleFlashcardGet, handleAsyncFlashcardJob } from '../lambda/handlers/flashcard';

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

function makeFlashcard(overrides: Record<string, any> = {}) {
  return {
    term: 'Gradient Descent',
    pronunciation: '/ˈɡreɪdiənt dɪˈsɛnt/',
    translation: 'Cực tiểu hóa theo độ dốc',
    definition: 'An optimization algorithm. Một thuật toán tối ưu hóa.',
    ...overrides,
  };
}

function makeValidFlashcardPayload(count = 5) {
  return {
    flashcards: Array.from({ length: count }, (_, i) => makeFlashcard({
      term: `Thuật ngữ ${i + 1}`,
    })),
  };
}

// ============================================
// TESTS: validateFlashcards()
// ============================================

describe('validateFlashcards()', () => {
  it('returns valid=true, isCritical=false for a perfect 10-card set', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(10), 10);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validCards).toHaveLength(10);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid=false, isCritical=false for 8 valid cards (warning, not critical)', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(8), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(false);
    expect(result.validCards).toHaveLength(8);
    expect(result.errors.some(e => e.includes('CẢNH BÁO'))).toBe(true);
  });

  it('allows empty pronunciation string without throwing or erroring', () => {
    const data = {
      flashcards: [
        makeFlashcard({ term: 'CNN', pronunciation: '' }),
        makeFlashcard({ term: 'RNN', pronunciation: '' }),
        makeFlashcard({ term: 'LSTM', pronunciation: '' }),
        makeFlashcard({ term: 'Transformer', pronunciation: '' }),
        makeFlashcard({ term: 'BERT', pronunciation: '' }),
      ]
    };
    const result = validateFlashcards(data, 5);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validCards).toHaveLength(5);
  });

  it('returns isCritical=true when flashcards.length < minCards (e.g. 5 out of 10)', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(5), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });

  it('returns isCritical=true when flashcards.length > expectedCount', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(11), 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
  });

  it('validates custom expectedCount (e.g., 5)', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(5), 5);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validCards).toHaveLength(5);
  });

  it('validates custom expectedCount (e.g., 20)', () => {
    const result = validateFlashcards(makeValidFlashcardPayload(20), 20);
    expect(result.valid).toBe(true);
    expect(result.isCritical).toBe(false);
    expect(result.validCards).toHaveLength(20);
  });

  it('returns isCritical=true when validCards.length < minCards due to validation errors', () => {
    const data = {
      flashcards: [
        makeFlashcard(),                                          // valid
        makeFlashcard(),                                          // valid
        makeFlashcard(),                                          // valid
        makeFlashcard({ term: '' }),                              // invalid
        makeFlashcard({ pronunciation: null }),                   // invalid
        makeFlashcard({ translation: '' }),                       // invalid
        makeFlashcard({ definition: '' }),                        // invalid
        makeFlashcard(),                                          // valid
        makeFlashcard(),                                          // valid
        makeFlashcard({ term: '' }),                              // invalid
      ],
    };
    const result = validateFlashcards(data, 10);
    expect(result.valid).toBe(false);
    expect(result.isCritical).toBe(true);
    expect(result.validCards).toHaveLength(5);
  });
});

// ============================================
// TESTS: handleFlashcardJob() (Gemini calls)
// ============================================

describe('handleFlashcardJob()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws JOB_NOT_FOUND when job does not exist in DB', async () => {
    mockGetJobItem.mockResolvedValueOnce(null);
    await expect(handleFlashcardJob({ jobId: 'job-missing', userId: 'user-123' }))
      .rejects.toThrow('JOB_NOT_FOUND');
  });

  it('throws FORBIDDEN when user does not own the job', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      ...VALID_JOB_ITEM,
      userId: { S: 'user-different' },
    });
    await expect(handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('FORBIDDEN');
  });

  it('throws ANALYSIS_NOT_FOUND when job translation is not completed', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      ...VALID_JOB_ITEM,
      status: { S: 'pending' },
    });
    await expect(handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('ANALYSIS_NOT_FOUND');
  });

  it('returns S3 cached flashcards directly if available and count matches', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    const cachedData = {
      flashcards: makeValidFlashcardPayload(10).flashcards,
      cardCount: 10,
    };
    mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

    const result = await handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123', count: 10 });
    expect(result).toEqual(cachedData);
    expect(mockGetResultFromS3).toHaveBeenCalledWith('results/job-abc/flashcards-10.json');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('retries with feedback on first fail, succeeds on second attempt', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockImplementation((key) => {
      if (key.includes('analysis.md')) return 'This is mock paper analysis content';
      throw { name: 'NoSuchKey' };
    });
    mockGetSecret.mockResolvedValue('fake-key');

    // 1st attempt: invalid (too few cards)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(3)) }
    });
    // 2nd attempt: valid
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(10)) }
    });

    const result = await handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123', count: 10 });
    expect(result.cardCount).toBe(10);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockSaveResultToS3).toHaveBeenCalledTimes(1);
  });

  it('saves partial flashcards after 2 failed validation attempts if not critical', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockImplementation((key) => {
      if (key.includes('analysis.md')) return 'This is mock paper analysis content';
      throw { name: 'NoSuchKey' };
    });
    mockGetSecret.mockResolvedValue('fake-key');

    // Attempt 1: 7 cards (valid, warning)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(7)) }
    });
    // Attempt 2: 8 cards (valid, warning)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(8)) }
    });

    const result = await handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123', count: 10 });
    expect(result.cardCount).toBe(8);
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    expect(mockSaveResultToS3).toHaveBeenCalled();
  });

  it('throws FLASHCARD_GENERATION_FAILED when both attempts are critical', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockImplementation((key) => {
      if (key.includes('analysis.md')) return 'This is mock paper analysis content';
      throw { name: 'NoSuchKey' };
    });
    mockGetSecret.mockResolvedValue('fake-key');

    // Attempt 1: 3 cards (critical)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(3)) }
    });
    // Attempt 2: 4 cards (critical)
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidFlashcardPayload(4)) }
    });

    await expect(handleFlashcardJob({ jobId: 'job-abc', userId: 'user-123', count: 10 }))
      .rejects.toThrow('FLASHCARD_GENERATION_FAILED');
  });
});

// ============================================
// TESTS: handleFlashcardPost() & handleFlashcardGet()
// ============================================

describe('Polling API Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleFlashcardPost()', () => {
    it('throws INVALID_COUNT when unsupported count is requested', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      await expect(handleFlashcardPost({ jobId: 'job-abc', userId: 'user-123', count: 7 }))
        .rejects.toThrow('INVALID_COUNT');
    });

    it('returns COMPLETED immediately on S3 cache hit', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      const cachedData = {
        flashcards: makeValidFlashcardPayload(10).flashcards,
        cardCount: 10,
      };
      mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await handleFlashcardPost({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('COMPLETED');
      expect(result.flashcards).toHaveLength(10);
    });

    it('returns GENERATING and invokes lambda when cache miss and lock acquired', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockRejectedValueOnce({ name: 'NoSuchKey' });
      mockDynamoDBSend.mockResolvedValueOnce({}); // Lock success

      const result = await handleFlashcardPost({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).toHaveBeenCalled();
    });

    it('returns GENERATING without invoking lambda when lock acquisition fails', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockRejectedValueOnce({ name: 'NoSuchKey' });
      const condError = new Error('ConditionalCheckFailedException');
      condError.name = 'ConditionalCheckFailedException';
      mockDynamoDBSend.mockRejectedValueOnce(condError); // Lock fail

      const result = await handleFlashcardPost({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });
  });

  describe('handleFlashcardGet()', () => {
    it('returns IDLE when status attribute is missing in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
      }); // No flashcardStatus_10 attribute
      const result = await handleFlashcardGet({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('IDLE');
    });

    it('returns GENERATING when status matches in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
        flashcardStatus_10: { S: 'GENERATING' },
      });
      const result = await handleFlashcardGet({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('GENERATING');
    });

    it('returns COMPLETED with flashcards when status is COMPLETED and cache exists', async () => {
      mockGetJobItem.mockResolvedValue({
        ...VALID_JOB_ITEM,
        flashcardStatus_10: { S: 'COMPLETED' },
      });
      const cachedData = {
        flashcards: makeValidFlashcardPayload(10).flashcards,
        cardCount: 10,
      };
      mockGetResultFromS3.mockResolvedValueOnce(JSON.stringify(cachedData));

      const result = await handleFlashcardGet({ jobId: 'job-abc', userId: 'user-123', count: 10 });
      expect(result.status).toBe('COMPLETED');
      expect(result.flashcards).toHaveLength(10);
    });
  });

  describe('handleAsyncFlashcardJob()', () => {
    it('generates flashcards and updates status to COMPLETED on success', async () => {
      mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
      mockGetResultFromS3.mockImplementation((key) => {
        if (key.includes('analysis.md')) return 'This is mock paper analysis content';
        throw { name: 'NoSuchKey' };
      });
      mockGetSecret.mockResolvedValue('fake-key');
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify(makeValidFlashcardPayload(10)) }
      });

      await handleAsyncFlashcardJob({ jobId: 'job-abc', userId: 'user-123', count: 10, invocationDepth: 1 });
      // Updates status to COMPLETED
      expect(mockDynamoDBSend).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ':status': { S: 'COMPLETED' }
        })
      }));
    });
  });
});
