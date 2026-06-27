import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import * as crypto from 'crypto';
import { s3Client, dynamodbClient, RESULTS_BUCKET, JOBS_TABLE, QUIZ_SHARES_TABLE } from '../utils/aws-clients';
import { QuizShareResponse } from '../types';

export async function handleCreateQuizShare(event: { jobId: string; userId: string; count?: number }): Promise<QuizShareResponse> {
  const { jobId, userId } = event;
  const count = event.count || 5;

  if (![5, 10, 20].includes(count)) {
    throw new Error('INVALID_COUNT');
  }

  // 1. Fetch job to verify existence & ownership
  const jobRes = await dynamodbClient.send(
    new GetItemCommand({
      TableName: JOBS_TABLE,
      Key: { jobId: { S: jobId } },
    })
  );

  if (!jobRes.Item) {
    throw new Error('JOB_NOT_FOUND');
  }

  const ownerId = jobRes.Item.userId?.S || 'guest';
  if (ownerId !== 'guest' && ownerId !== userId) {
    throw new Error('FORBIDDEN');
  }

  // 2. Verify quiz json exists on S3
  const s3Key = `results/${jobId}/quiz-${count}.json`;
  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: s3Key,
      })
    );
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      throw new Error('QUIZ_NOT_READY');
    }
    throw err;
  }

  // 3. Rate limiting check (max 10 active shares per job)
  const currentShareCount = jobRes.Item.shareCount?.N ? parseInt(jobRes.Item.shareCount.N, 10) : 0;
  if (currentShareCount >= 10) {
    throw new Error('MAX_SHARES_REACHED');
  }

  // 4. Generate cryptographically secure shareId & timestamps
  const shareId = crypto.randomUUID();
  const nowMs = Date.now();
  const expiresAtSec = Math.floor(nowMs / 1000) + 30 * 24 * 60 * 60; // 30 days TTL

  // 5. Insert record into vietai-quiz-shares table
  await dynamodbClient.send(
    new PutItemCommand({
      TableName: QUIZ_SHARES_TABLE,
      Item: {
        shareId: { S: shareId },
        jobId: { S: jobId },
        userId: { S: userId },
        count: { N: count.toString() },
        createdAt: { N: nowMs.toString() },
        expiresAt: { N: expiresAtSec.toString() },
      },
    })
  );

  // 6. Update share count in jobs table
  await dynamodbClient.send(
    new UpdateItemCommand({
      TableName: JOBS_TABLE,
      Key: { jobId: { S: jobId } },
      UpdateExpression: 'SET shareCount = if_not_exists(shareCount, :zero) + :inc',
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':inc': { N: '1' },
      },
    })
  );

  return {
    shareId,
    shareUrl: `/share/quiz/${shareId}`,
    expiresAt: expiresAtSec,
  };
}

export async function handleGetPublicQuiz(event: { shareId: string }): Promise<{ downloadUrl: string; count: number; title: string; expiresAt: number }> {
  const { shareId } = event;

  if (!shareId) {
    throw new Error('SHARE_NOT_FOUND');
  }

  // 1. Direct GetItem query on vietai-quiz-shares table by PK shareId (<5ms latency)
  const shareRes = await dynamodbClient.send(
    new GetItemCommand({
      TableName: QUIZ_SHARES_TABLE,
      Key: { shareId: { S: shareId } },
    })
  );

  if (!shareRes.Item) {
    throw new Error('SHARE_NOT_FOUND');
  }

  const item = shareRes.Item;
  const expiresAt = item.expiresAt?.N ? parseInt(item.expiresAt.N, 10) : 0;
  const nowSec = Math.floor(Date.now() / 1000);

  if (expiresAt > 0 && expiresAt < nowSec) {
    throw new Error('SHARE_EXPIRED');
  }

  const jobId = item.jobId?.S || '';
  const count = item.count?.N ? parseInt(item.count.N, 10) : 5;

  // 2. Fetch original job for title/fileName
  const jobRes = await dynamodbClient.send(
    new GetItemCommand({
      TableName: JOBS_TABLE,
      Key: { jobId: { S: jobId } },
    })
  );

  const title = jobRes.Item?.fileName?.S || 'Bài trắc nghiệm ôn tập';

  // 3. Generate S3 Pre-signed URL (valid for 300 seconds / 5 minutes)
  const s3Key = `results/${jobId}/quiz-${count}.json`;
  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: RESULTS_BUCKET,
      Key: s3Key,
    }),
    { expiresIn: 300 }
  );

  return {
    downloadUrl,
    count,
    title,
    expiresAt,
  };
}
