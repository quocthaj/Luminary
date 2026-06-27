const mockDynamoDBSend = jest.fn();
const mockS3Send = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock('../lambda/utils/aws-clients', () => ({
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
  s3Client: {
    send: (cmd: any) => mockS3Send(cmd),
  },
  RESULTS_BUCKET: 'mock-results-bucket',
  JOBS_TABLE: 'mock-jobs-table',
  QUIZ_SHARES_TABLE: 'mock-quiz-shares-table',
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  GetItemCommand: jest.fn().mockImplementation((payload) => payload),
  PutItemCommand: jest.fn().mockImplementation((payload) => payload),
  UpdateItemCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('@aws-sdk/client-s3', () => ({
  HeadObjectCommand: jest.fn().mockImplementation((payload) => payload),
  GetObjectCommand: jest.fn().mockImplementation((payload) => payload),
}));

import { handleCreateQuizShare, handleGetPublicQuiz } from '../lambda/handlers/share';

describe('Quiz Share Handlers', () => {
  beforeEach(() => {
    mockDynamoDBSend.mockReset();
    mockS3Send.mockReset();
    mockGetSignedUrl.mockReset();
  });

  describe('handleCreateQuizShare()', () => {
    it('throws JOB_NOT_FOUND when job is missing in DynamoDB', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({}); // no Item
      await expect(handleCreateQuizShare({ jobId: 'job-1', userId: 'user-1' }))
        .rejects.toThrow('JOB_NOT_FOUND');
    });

    it('throws FORBIDDEN when user does not match job owner', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { userId: { S: 'user-owner' } },
      });
      await expect(handleCreateQuizShare({ jobId: 'job-1', userId: 'user-intruder' }))
        .rejects.toThrow('FORBIDDEN');
    });

    it('throws QUIZ_NOT_READY when quiz file missing on S3', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { userId: { S: 'user-1' } },
      });
      const s3Error = Object.assign(new Error('NotFound'), { name: 'NotFound' });
      mockS3Send.mockRejectedValueOnce(s3Error);

      await expect(handleCreateQuizShare({ jobId: 'job-1', userId: 'user-1' }))
        .rejects.toThrow('QUIZ_NOT_READY');
    });

    it('throws MAX_SHARES_REACHED when shareCount >= 10', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { userId: { S: 'user-1' }, shareCount: { N: '10' } },
      });
      mockS3Send.mockResolvedValueOnce({}); // head object succeeds

      await expect(handleCreateQuizShare({ jobId: 'job-1', userId: 'user-1' }))
        .rejects.toThrow('MAX_SHARES_REACHED');
    });

    it('creates share link and increments shareCount when valid', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { userId: { S: 'user-1' }, shareCount: { N: '2' } },
      });
      mockS3Send.mockResolvedValueOnce({}); // S3 head object exists
      mockDynamoDBSend.mockResolvedValueOnce({}); // PutItem in shares table
      mockDynamoDBSend.mockResolvedValueOnce({}); // UpdateItem in jobs table

      const res = await handleCreateQuizShare({ jobId: 'job-1', userId: 'user-1', count: 5 });

      expect(res.shareId).toBeDefined();
      expect(res.shareUrl).toContain(`/share/quiz/${res.shareId}`);
      expect(res.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(3);
    });
  });

  describe('handleGetPublicQuiz()', () => {
    it('throws SHARE_NOT_FOUND when share record does not exist', async () => {
      mockDynamoDBSend.mockResolvedValueOnce({});
      await expect(handleGetPublicQuiz({ shareId: 'invalid-share' }))
        .rejects.toThrow('SHARE_NOT_FOUND');
    });

    it('throws SHARE_EXPIRED when link has expired', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 1000;
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { shareId: { S: 'expired-share' }, expiresAt: { N: pastTime.toString() } },
      });

      await expect(handleGetPublicQuiz({ shareId: 'expired-share' }))
        .rejects.toThrow('SHARE_EXPIRED');
    });

    it('returns downloadUrl and quiz metadata when share link is valid', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 10000;
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: {
          shareId: { S: 'valid-share' },
          jobId: { S: 'job-99' },
          count: { N: '5' },
          expiresAt: { N: futureTime.toString() },
        },
      });
      mockDynamoDBSend.mockResolvedValueOnce({
        Item: { fileName: { S: 'AttentionIsAllYouNeed.pdf' } },
      });
      mockGetSignedUrl.mockResolvedValueOnce('https://s3.amazonaws.com/presigned-quiz-url');

      const res = await handleGetPublicQuiz({ shareId: 'valid-share' });

      expect(res.downloadUrl).toBe('https://s3.amazonaws.com/presigned-quiz-url');
      expect(res.count).toBe(5);
      expect(res.title).toBe('AttentionIsAllYouNeed.pdf');
    });
  });
});
