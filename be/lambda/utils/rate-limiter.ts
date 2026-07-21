import { UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { dynamodbClient, JOBS_TABLE } from './aws-clients';

export type RateLimitFeature = 'chat' | 'explore' | 'defense' | 'podcast' | 'tools';

export async function checkRateLimit(
  userId: string,
  feature: RateLimitFeature,
  limit: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    // Tính toán reset thời gian theo múi giờ Việt Nam (UTC+7)
    const vnOffset = 7 * 60 * 60 * 1000;
    const nowVN = new Date(Date.now() + vnOffset);
    const today = nowVN.toISOString().split('T')[0];
    const pk = `rateLimit#${userId}#${today}`;
    
    const endOfDayVN = new Date(nowVN);
    endOfDayVN.setUTCHours(23, 59, 59, 999);
    const endOfDay = Math.floor((endOfDayVN.getTime() - vnOffset) / 1000);

    const result = await dynamodbClient.send(new UpdateItemCommand({
      TableName: JOBS_TABLE || 'vietai-jobs',
      Key: { jobId: { S: pk } },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :one, #ttl = if_not_exists(#ttl, :endOfDay)',
      ExpressionAttributeNames: {
        '#count': `${feature}Count`,
        '#ttl': 'expiresAt'
      },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':one': { N: '1' },
        ':endOfDay': { N: endOfDay.toString() }
      },
      ReturnValues: 'ALL_NEW'
    }));

    const count = parseInt(result.Attributes?.[`${feature}Count`]?.N || '0', 10);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count)
    };
  } catch (error: any) {
    console.error('[RateLimiter] Error checking rate limit:', error);
    // Fail-open: If DynamoDB is overloaded (ProvisionedThroughputExceededException)
    // or unavailable, we allow the request through rather than crashing the system.
    return { allowed: true, remaining: 1 };
  }
}

export function rateLimitResponse(feature: string) {
  return {
    statusCode: 429,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Bạn đã dùng hết lượt ${feature} hôm nay. Thử lại vào ngày mai.`,
      remaining: 0,
      resetAt: new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
    })
  };
}
