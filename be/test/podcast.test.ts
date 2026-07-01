const mockGetJobItem = jest.fn();
const mockGetSecret = jest.fn();
const mockGetResultFromS3 = jest.fn();
const mockGenerateContent = jest.fn();
const mockDynamoDBSend = jest.fn();
const mockLambdaSend = jest.fn();
const mockS3Send = jest.fn();
const mockPollySend = jest.fn();
const mockGetSignedUrl = jest.fn();

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
  s3Client: {
    send: (cmd: any) => mockS3Send(cmd),
  },
  RESULTS_BUCKET: 'mock-results-bucket',
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

jest.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: jest.fn().mockImplementation((payload) => payload),
  GetObjectCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('@aws-sdk/client-polly', () => ({
  PollyClient: jest.fn().mockImplementation(() => ({
    send: (cmd: any) => mockPollySend(cmd),
  })),
  SynthesizeSpeechCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}));

jest.mock('../lambda/utils/s3-helpers', () => ({
  getResultFromS3: (key: string) => mockGetResultFromS3(key),
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

// Mock ws WebSocket class
const mockWSListeners: Record<string, Function[]> = {};
const mockWSSend = jest.fn();
const mockWSTerminate = jest.fn();
const mockWSClose = jest.fn();

jest.mock('ws', () => {
  const mockWS = jest.fn().mockImplementation(() => {
    return {
      on: (event: string, callback: Function) => {
        if (!mockWSListeners[event]) {
          mockWSListeners[event] = [];
        }
        mockWSListeners[event].push(callback);
      },
      send: (data: any, cb?: Function) => {
        mockWSSend(data);
        if (cb) cb();
      },
      terminate: () => mockWSTerminate(),
      close: () => mockWSClose(),
    };
  });
  return {
    WebSocket: mockWS,
    default: mockWS,
  };
});

import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  handlePodcastJob,
  tryRepairJSON,
  stripId3,
  mergeMp3Buffers,
  handlePodcastPost,
  handlePodcastGet,
  handleAsyncPodcastJob
} from '../lambda/handlers/podcast';

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

function makeValidScriptPayload() {
  return {
    turns: [
      { speaker: 'hostA', text: 'Chào mừng các bạn đến với kênh học thuật.' },
      { speaker: 'hostB', text: 'Chào MC, rất vui được ở đây hôm nay.' }
    ]
  };
}

// ============================================
// TESTS
// ============================================

describe('tryRepairJSON()', () => {
  it('correctly parses valid JSON', () => {
    const payload = makeValidScriptPayload();
    const result = tryRepairJSON(JSON.stringify(payload));
    expect(result).toEqual(payload);
  });

  it('repairs truncated JSON by extracting completed turns only', () => {
    const truncatedRaw = `{ "turns": [
      { "speaker": "hostA", "text": "Chào mừng các bạn" },
      { "speaker": "hostB", "text": "Chào MC" },
      { "speaker": "hostA", "text": "Hôm nay chúng ta sẽ thảo luận về`
    ;
    const result = tryRepairJSON(truncatedRaw);
    expect(result.turns).toHaveLength(2);
    expect(result.turns[0]).toEqual({ speaker: 'hostA', text: 'Chào mừng các bạn' });
    expect(result.turns[1]).toEqual({ speaker: 'hostB', text: 'Chào MC' });
  });

  it('throws error when no turns can be recovered', () => {
    const badRaw = '{ "turns": [ { "speaker": "hostC", "text": "invalid speaker"';
    expect(() => tryRepairJSON(badRaw)).toThrow('Unable to repair or parse truncated JSON');
  });
});

describe('stripId3() & mergeMp3Buffers()', () => {
  it('passes through buffer unmodified if no ID3 tags present', () => {
    const rawBuffer = Buffer.from([1, 2, 3, 4, 5]);
    const result = stripId3(rawBuffer);
    expect(result).toEqual(rawBuffer);
  });

  it('strips ID3v2 header and ID3v1 footer correctly', () => {
    // ID3v2 header starts with "ID3" (3 bytes)
    // byte 3-4 version, byte 5 flags, byte 6-9 size (synchsafe)
    // Let's create a size of 4 bytes: tagSize = 4
    // total tag size = 10 + 4 = 14 bytes
    const tagHeader = Buffer.from([
      0x49, 0x44, 0x33, // 'I', 'D', '3'
      0x04, 0x00,       // version 4
      0x00,             // flags
      0x00, 0x00, 0x00, 0x04 // synchsafe size = 4
    ]);
    const payload = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd]); // 4 bytes of tag payload
    const rawMp3Data = Buffer.from([0x11, 0x22, 0x33, 0x44]); // 4 bytes of actual MP3 frame
    
    // ID3v1 footer is 128 bytes, starts with 'TAG'
    const tagFooter = Buffer.alloc(128);
    tagFooter[0] = 0x54; // 'T'
    tagFooter[1] = 0x41; // 'A'
    tagFooter[2] = 0x47; // 'G'

    const combinedBuffer = Buffer.concat([tagHeader, payload, rawMp3Data, tagFooter]);

    const result = stripId3(combinedBuffer);
    expect(result).toEqual(rawMp3Data);
  });
});

describe('handlePodcastJob()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws JOB_NOT_FOUND if job does not exist', async () => {
    mockGetJobItem.mockResolvedValueOnce(null);
    await expect(handlePodcastJob({ jobId: 'job-missing', userId: 'user-123' }))
      .rejects.toThrow('JOB_NOT_FOUND');
  });

  it('throws FORBIDDEN if user is not the owner', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      ...VALID_JOB_ITEM,
      userId: { S: 'user-different' }
    });
    await expect(handlePodcastJob({ jobId: 'job-abc', userId: 'user-123' }))
      .rejects.toThrow('FORBIDDEN');
  });

  it('runs standard mode successfully with AWS Polly', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockResolvedValueOnce('Paper bilingual analysis goes here.');
    mockGetSecret.mockResolvedValueOnce('fake-gemini-key');
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidScriptPayload()) }
    });
    mockPollySend.mockResolvedValue({
      AudioStream: {
        transformToByteArray: () => Promise.resolve(new Uint8Array([1, 2, 3]))
      }
    });

    const result = await handlePodcastJob({ jobId: 'job-abc', userId: 'user-123', hdMode: false });
    expect(result.fallbackUsed).toBe(false);
    expect(result.s3Key).toBe('results/job-abc/podcast.mp3');
    expect(mockPollySend).toHaveBeenCalledTimes(2); // 2 turns
    expect(mockS3Send).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'mock-results-bucket',
      Key: 'results/job-abc/podcast.mp3'
    }));
  });

  it('runs HD mode successfully with Google Cloud TTS (no fallback)', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockResolvedValueOnce('Paper bilingual analysis goes here.');
    mockGetSecret.mockResolvedValueOnce('fake-gemini-key'); // Gemini key
    mockGetSecret.mockResolvedValueOnce('fake-google-tts-key'); // Google TTS key
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidScriptPayload()) }
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ audioContent: Buffer.from([1, 2, 3]).toString('base64') }),
    }) as any;

    const result = await handlePodcastJob({ jobId: 'job-abc', userId: 'user-123', hdMode: true });
    expect(result.fallbackUsed).toBe(false);
    expect(result.s3Key).toBe('results/job-abc/podcast.mp3');
    expect(mockS3Send).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'mock-results-bucket',
      Key: 'results/job-abc/podcast.mp3'
    }));

    global.fetch = originalFetch;
  });

  it('runs HD mode falling back to AWS Polly if Google TTS and Edge TTS both fail', async () => {
    mockGetJobItem.mockResolvedValue(VALID_JOB_ITEM);
    mockGetResultFromS3.mockResolvedValueOnce('Paper bilingual analysis goes here.');
    mockGetSecret.mockResolvedValueOnce('fake-gemini-key'); // Gemini key
    mockGetSecret.mockResolvedValueOnce('fake-google-tts-key'); // Google TTS key
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify(makeValidScriptPayload()) }
    });

    // Google TTS throws error
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('Google TTS API Error'));

    // Mock EdgeTTSProvider.prototype.synthesize to reject
    const EdgeTTSProvider = require('../lambda/handlers/podcast').EdgeTTSProvider;
    const originalEdgeSynthesize = EdgeTTSProvider.prototype.synthesize;
    EdgeTTSProvider.prototype.synthesize = jest.fn().mockRejectedValue(new Error('Edge TTS Socket Error'));

    mockPollySend.mockResolvedValue({
      AudioStream: {
        transformToByteArray: () => Promise.resolve(new Uint8Array([4, 5, 6]))
      }
    });

    const result = await handlePodcastJob({ jobId: 'job-abc', userId: 'user-123', hdMode: true });
    expect(result.fallbackUsed).toBe(true);
    expect(result.s3Key).toBe('results/job-abc/podcast.mp3');
    expect(mockPollySend).toHaveBeenCalledTimes(2);

    global.fetch = originalFetch;
    EdgeTTSProvider.prototype.synthesize = originalEdgeSynthesize;
  });
});

describe('Polling API Controllers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handlePodcastPost()', () => {
    it('returns COMPLETED directly if status is COMPLETED in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        ...VALID_JOB_ITEM,
        podcastStatus: { S: 'COMPLETED' },
        podcastFallbackUsed: { BOOL: false },
        podcastHdMode: { BOOL: true }
      });

      const result = await handlePodcastPost({ jobId: 'job-abc', userId: 'user-123', hdMode: true });
      expect(result.status).toBe('COMPLETED');
      expect(result.hdMode).toBe(true);
      expect(result.fallbackUsed).toBe(false);
      expect(mockLambdaSend).not.toHaveBeenCalled();
    });

    it('returns GENERATING and triggers async Lambda when cache miss', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        ...VALID_JOB_ITEM,
        podcastStatus: { S: 'IDLE' }
      });
      mockDynamoDBSend.mockResolvedValueOnce({}); // Lock acquired

      const result = await handlePodcastPost({ jobId: 'job-abc', userId: 'user-123', hdMode: true });
      expect(result.status).toBe('GENERATING');
      expect(mockLambdaSend).toHaveBeenCalled();
    });
  });

  describe('handlePodcastGet()', () => {
    it('returns IDLE if status attribute is missing in DynamoDB', async () => {
      mockGetJobItem.mockResolvedValueOnce(VALID_JOB_ITEM);

      const result = await handlePodcastGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('IDLE');
    });

    it('returns GENERATING if generation in progress', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        ...VALID_JOB_ITEM,
        podcastStatus: { S: 'GENERATING' }
      });

      const result = await handlePodcastGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('GENERATING');
    });

    it('returns COMPLETED with presigned url if generation finished', async () => {
      mockGetJobItem.mockResolvedValueOnce({
        ...VALID_JOB_ITEM,
        podcastStatus: { S: 'COMPLETED' },
        podcastFallbackUsed: { BOOL: true },
        podcastHdMode: { BOOL: true }
      });
      mockGetSignedUrl.mockResolvedValueOnce('https://mock-s3-presigned-url.com/podcast.mp3');

      const result = await handlePodcastGet({ jobId: 'job-abc', userId: 'user-123' });
      expect(result.status).toBe('COMPLETED');
      expect(result.downloadUrl).toBe('https://mock-s3-presigned-url.com/podcast.mp3');
      expect(result.fallbackUsed).toBe(true);
      expect(result.hdMode).toBe(true);
    });
  });
});
