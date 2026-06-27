// ============================================
// VIETAI SCHOLAR — MAIN LAMBDA HANDLER
// Slim entry point: routing + supervisor delegation
// ============================================

import {
    PutObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    PutItemCommand,
    GetItemCommand,
    QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { v4 as uuidv4 } from 'uuid';

// Shared utilities
import { s3Client, dynamodbClient, UPLOADS_BUCKET, RESULTS_BUCKET, JOBS_TABLE } from './utils/aws-clients';
import { respond } from './utils/response';
import { updateJobStatus } from './utils/dynamodb-helpers';
import { extractTextFromS3 } from './utils/text-extraction';
import { supervisorHandler } from './supervisor';
import { verifyToken } from './utils/auth-helpers';
import { handleChatJob } from './handlers/chat';
import { handleQuizPost, handleQuizGet } from './handlers/quiz';
import { handleFlashcardPost, handleFlashcardGet } from './handlers/flashcard';
import { handleMindmapPost, handleMindmapGet } from './handlers/mindmap';
import { handlePodcastPost, handlePodcastGet } from './handlers/podcast';
import { handleCreateQuizShare, handleGetPublicQuiz } from './handlers/share';


const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

// ============================================
// MAIN HANDLER
// ============================================
export const handler = async (event: any) => {
    console.log('📨 Event received:', JSON.stringify(event, null, 2));

    try {
        // Async Quiz/Flashcard background worker self-invocation
        if (event.asyncRun) {
            const tool = event.tool;
            if (tool === 'flashcard') {
                const { handleAsyncFlashcardJob } = require('./handlers/flashcard');
                return await handleAsyncFlashcardJob(event);
            } else if (tool === 'mindmap') {
                const { handleAsyncMindmapJob } = require('./handlers/mindmap');
                return await handleAsyncMindmapJob(event);
            } else if (tool === 'synthesis') {
                const { handleAsyncSynthesisJob } = require('./handlers/synthesis');
                return await handleAsyncSynthesisJob(event);
            } else if (tool === 'explore') {
                const { handleAsyncExploreJob } = require('./handlers/explore');
                return await handleAsyncExploreJob(event);
            } else if (tool === 'podcast') {
                const { handleAsyncPodcastJob } = require('./handlers/podcast');
                return await handleAsyncPodcastJob(event);
            } else {
                // Default to quiz for backward compatibility (where tool is undefined or 'quiz')
                const { handleAsyncQuizJob } = require('./handlers/quiz');
                return await handleAsyncQuizJob(event);
            }
        }

        // S3 trigger
        if (event.Records && event.Records[0]?.s3) {
            return await handleS3Upload(event);
        }

        // API Gateway proxy
        const { httpMethod, path, body } = event;

        let requestBody: Record<string, any> = {};
        if (body) {
            try {
                requestBody = JSON.parse(body);
            } catch {
                return respond(400, { error: 'Invalid JSON body' });
            }
        }

        if (httpMethod === 'POST' && path === '/upload') {
            const authHeader = event.headers?.Authorization || event.headers?.authorization;
            const userId = await verifyToken(authHeader);
            return await handleGenerateUploadUrl({ fileName: requestBody.fileName || 'document.pdf', userId });
        }

        if (httpMethod === 'GET' && path === '/jobs') {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            return await handleListJobs({ userId });
        }

        if (httpMethod === 'POST' && path?.startsWith('/job/') && path?.endsWith('/reprocess')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            return await handleReprocessJob({ jobId, userId });
        }

        if (httpMethod === 'POST' && path?.startsWith('/job/') && path?.endsWith('/chat')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            try {
                const result = await handleChatJob({ jobId, userId, message: requestBody.message });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                console.error('❌ Chat handler error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (path?.startsWith('/job/') && path?.endsWith('/quiz') && !path?.includes('/share/')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            const countParam = event.queryStringParameters?.count;
            const count = countParam ? parseInt(countParam, 10) : undefined;

            try {
                if (httpMethod === 'POST') {
                    const result = await handleQuizPost({ jobId, userId, count });
                    const statusCode = result.status === 'COMPLETED' ? 200 : 202;
                    return respond(statusCode, result);
                } else if (httpMethod === 'GET') {
                    const result = await handleQuizGet({ jobId, userId, count });
                    return respond(200, result);
                } else {
                    return respond(405, { error: 'Method not allowed' });
                }
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'ANALYSIS_NOT_FOUND') {
                    return respond(409, { error: 'Bản dịch song ngữ chưa hoàn thành để tạo trắc nghiệm.' });
                }
                if (err.message === 'INVALID_COUNT') {
                    return respond(400, { error: 'Tham số count không hợp lệ. Chỉ hỗ trợ 5, 10, hoặc 20 câu hỏi.' });
                }
                console.error('❌ Quiz routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'POST' && path?.startsWith('/job/') && path?.includes('/share/quiz')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            const countParam = requestBody.count || event.queryStringParameters?.count;
            const count = countParam ? parseInt(countParam, 10) : undefined;

            try {
                const result = await handleCreateQuizShare({ jobId, userId, count });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') return respond(404, { error: 'Job not found' });
                if (err.message === 'FORBIDDEN') return respond(403, { error: 'Forbidden' });
                if (err.message === 'QUIZ_NOT_READY') return respond(409, { error: 'Bộ câu hỏi trắc nghiệm chưa được tạo để chia sẻ.' });
                if (err.message === 'MAX_SHARES_REACHED') return respond(429, { error: 'Đã đạt giới hạn tối đa 10 liên kết chia sẻ cho bài báo này.' });
                if (err.message === 'INVALID_COUNT') return respond(400, { error: 'Số lượng câu hỏi không hợp lệ.' });
                console.error('❌ Quiz share creation error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'GET' && path?.startsWith('/share/quiz/')) {
            const parts = path.split('/');
            const shareId = parts[3];
            try {
                const result = await handleGetPublicQuiz({ shareId });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'SHARE_NOT_FOUND') return respond(404, { error: 'Liên kết chia sẻ không tồn tại hoặc đã bị xóa.' });
                if (err.message === 'SHARE_EXPIRED') return respond(410, { error: 'Liên kết chia sẻ này đã hết hạn.' });
                console.error('❌ Public quiz share fetch error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (path?.startsWith('/job/') && path?.endsWith('/flashcard')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            const countParam = event.queryStringParameters?.count;
            const count = countParam ? parseInt(countParam, 10) : undefined;

            try {
                if (httpMethod === 'POST') {
                    const result = await handleFlashcardPost({ jobId, userId, count });
                    const statusCode = result.status === 'COMPLETED' ? 200 : 202;
                    return respond(statusCode, result);
                } else if (httpMethod === 'GET') {
                    const result = await handleFlashcardGet({ jobId, userId, count });
                    return respond(200, result);
                } else {
                    return respond(405, { error: 'Method not allowed' });
                }
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'ANALYSIS_NOT_FOUND') {
                    return respond(409, { error: 'Bản dịch song ngữ chưa hoàn thành để tạo thẻ ghi nhớ.' });
                }
                if (err.message === 'INVALID_COUNT') {
                    return respond(400, { error: 'Tham số count không hợp lệ. Chỉ hỗ trợ 5, 10, hoặc 20 thẻ ghi nhớ.' });
                }
                console.error('❌ Flashcard routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (path?.startsWith('/job/') && path?.endsWith('/mindmap')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];

            try {
                if (httpMethod === 'POST') {
                    const result = await handleMindmapPost({ jobId, userId });
                    const statusCode = result.status === 'COMPLETED' ? 200 : 202;
                    return respond(statusCode, result);
                } else if (httpMethod === 'GET') {
                    const result = await handleMindmapGet({ jobId, userId });
                    return respond(200, result);
                } else {
                    return respond(405, { error: 'Method not allowed' });
                }
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'ANALYSIS_NOT_FOUND') {
                    return respond(409, { error: 'Bản dịch song ngữ chưa hoàn thành để vẽ sơ đồ tư duy.' });
                }
                console.error('❌ Mindmap routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (path?.startsWith('/job/') && path?.endsWith('/podcast')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];

            try {
                if (httpMethod === 'POST') {
                    const result = await handlePodcastPost({ jobId, userId, hdMode: requestBody.hdMode });
                    const statusCode = result.status === 'COMPLETED' ? 200 : 202;
                    return respond(statusCode, result);
                } else if (httpMethod === 'GET') {
                    const result = await handlePodcastGet({ jobId, userId });
                    return respond(200, result);
                } else {
                    return respond(405, { error: 'Method not allowed' });
                }
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'ANALYSIS_NOT_FOUND') {
                    return respond(409, { error: 'Bản dịch song ngữ chưa hoàn thành để tạo podcast.' });
                }
                console.error('❌ Podcast routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'GET' && path?.startsWith('/job/')) {
            const jobId = path.split('/').pop();
            return await handleGetJobStatus({ jobId });
        }

        if (httpMethod === 'GET' && path?.startsWith('/result/')) {
            const jobId = path.split('/').pop();
            const authHeader = event.headers?.Authorization || event.headers?.authorization;
            const userId = await verifyToken(authHeader);
            return await handleGetResultUrl({ jobId, userId });
        }

        if (httpMethod === 'POST' && path === '/synthesis') {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const { handleSynthesisPost } = require('./handlers/synthesis');
            try {
                const result = await handleSynthesisPost({ userId, jobIds: requestBody.jobIds });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'INVALID_INPUT') {
                    return respond(400, { error: 'Vui lòng cung cấp danh sách từ 2 đến 10 tài liệu hợp lệ.' });
                }
                console.error('❌ Synthesis routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'POST' && path === '/synthesis/chat') {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const { handleSynthesisChat } = require('./handlers/synthesis');
            try {
                const result = await handleSynthesisChat({ userId, jobIds: requestBody.jobIds, message: requestBody.message });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                if (err.message === 'INVALID_INPUT') {
                    return respond(400, { error: 'Vui lòng cung cấp danh sách tài liệu và câu hỏi hợp lệ.' });
                }
                console.error('❌ Synthesis chat routing error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'POST' && path === '/explore') {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const { handleExplorePost } = require('./handlers/explore');
            try {
                const result = await handleExplorePost({ userId, topic: requestBody.topic });
                return respond(202, result);
            } catch (err: any) {
                console.error('❌ Explore POST error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        if (httpMethod === 'GET' && path?.startsWith('/explore/')) {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            const parts = path.split('/');
            const jobId = parts[2];
            const { handleExploreGet } = require('./handlers/explore');
            try {
                const result = await handleExploreGet({ jobId, userId });
                return respond(200, result);
            } catch (err: any) {
                if (err.message === 'JOB_NOT_FOUND') {
                    return respond(404, { error: 'Job not found' });
                }
                if (err.message === 'FORBIDDEN') {
                    return respond(403, { error: 'Forbidden' });
                }
                console.error('❌ Explore GET error:', err);
                return respond(500, { error: err.message || 'Internal server error' });
            }
        }

        return respond(404, { error: 'Not found' });

    } catch (error) {
        console.error('❌ Fatal error:', error);
        return respond(500, {
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown',
        });
    }
};

// ============================================
// ACTION 1: Generate Presigned Upload URL
// ============================================
async function handleGenerateUploadUrl(event: { fileName: string; userId: string }): Promise<any> {
    console.log(`📤 Generating presigned upload URL for user: ${event.userId}...`);

    const jobId = uuidv4();
    const fileName = event.fileName || 'document.pdf';
    const s3Key = `uploads/${jobId}/${fileName}`;

    const command = new PutObjectCommand({
        Bucket: UPLOADS_BUCKET,
        Key: s3Key,
        ContentType: 'application/pdf',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    const now = Math.floor(Date.now() / 1000);
    await dynamodbClient.send(
        new PutItemCommand({
            TableName: JOBS_TABLE,
            Item: {
                jobId: { S: jobId },
                status: { S: 'pending' },
                fileName: { S: fileName },
                s3Key: { S: s3Key },
                userId: { S: event.userId },
                createdAt: { N: now.toString() },
                expiresAt: { N: (now + 30 * 24 * 60 * 60).toString() },
            },
        })
    );

    console.log('✅ Job created:', jobId);
    return respond(200, { jobId, uploadUrl, expiresIn: 300 });
}

// ============================================
// ACTION 2: Get Job Status
// ============================================
async function handleGetJobStatus(event: { jobId?: string }): Promise<any> {
    const jobId = event.jobId;
    if (!jobId) return respond(400, { error: 'jobId is required' });

    const response = await dynamodbClient.send(
        new GetItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
        })
    );

    if (!response.Item) return respond(404, { error: 'Job not found' });

    const item = response.Item;
    return respond(200, {
        jobId: item.jobId?.S,
        status: item.status?.S,
        fileName: item.fileName?.S,
        s3OutputKey: item.s3OutputKey?.S,
        createdAt: item.createdAt?.N,
        completedAt: item.completedAt?.N,
        error: item.errorMsg?.S,
    });
}

// ============================================
// ACTION 3: Get Presigned Download URL for result
// ============================================
async function handleGetResultUrl(event: { jobId?: string; userId: string }): Promise<any> {
    const jobId = event.jobId;
    const userId = event.userId;
    if (!jobId) return respond(400, { error: 'jobId is required' });

    const response = await dynamodbClient.send(
        new GetItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
        })
    );

    if (!response.Item) return respond(404, { error: 'Job not found' });

    const jobOwnerId = response.Item.userId?.S || 'guest';
    if (jobOwnerId !== 'guest' && jobOwnerId !== userId) {
        console.warn(`User ${userId} attempted to access job ${jobId} owned by ${jobOwnerId}`);
        return respond(403, { error: 'Forbidden' });
    }

    const s3OutputKey = response.Item.s3OutputKey?.S;
    if (!s3OutputKey) {
        const status = response.Item.status?.S || 'unknown';
        return respond(409, { error: 'Result not ready', status });
    }

    const downloadUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: RESULTS_BUCKET, Key: s3OutputKey }),
        { expiresIn: 3600 }
    );

    return respond(200, { downloadUrl, expiresIn: 3600 });
}

// ============================================
// ACTION 4: Handle S3 Upload → Supervisor Delegation
// ============================================
async function handleS3Upload(event: any): Promise<any> {
    const bucket = event.Records[0].s3.bucket.name;
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
    console.log(`📥 S3 trigger: s3://${bucket}/${key}`);

    const parts = key.split('/');
    const jobId = parts[1];
    const fileName = parts[2] || 'document.pdf';

    if (!jobId) {
        console.error('❌ Cannot extract jobId from key:', key);
        return;
    }

    if (STATE_MACHINE_ARN) {
        // New pipeline: extractLambda inside SFN handles extraction
        // Pass raw S3 reference so extractLambda can download + process the PDF
        await updateJobStatus(jobId, 'queued');
        await sfnClient.send(new StartExecutionCommand({
            stateMachineArn: STATE_MACHINE_ARN,
            name: `job-${jobId}`,
            input: JSON.stringify({ jobId, bucket, key }),
        }));
        console.log(`✅ Job ${jobId} → Step Functions started`);
        return;
    }

    // Direct mode fallback (no State Machine configured)
    await updateJobStatus(jobId, 'extracting');
    try {
        const extractedText = await extractTextFromS3(bucket, key);
        if (!extractedText || extractedText.length < 10) {
            throw new Error('Could not extract readable text from PDF');
        }
        const result = await supervisorHandler({ jobId, fileName, extractedText });
        console.log(`✅ Job ${jobId} → ${result.status}`);
        return respond(200, {
            message: `Processing ${result.status}`,
            jobId,
            status: result.status,
        });
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ Job ${jobId} failed:`, errMsg);
        await updateJobStatus(jobId, 'failed', { error: errMsg });
        throw err;
    }
}

// ============================================
// ACTION 5: List Jobs for a User (GSI Query)
// ============================================
async function handleListJobs(event: { userId: string }): Promise<any> {
    console.log(`🔍 Listing jobs for user: ${event.userId}`);
    const response = await dynamodbClient.send(
        new QueryCommand({
            TableName: JOBS_TABLE,
            IndexName: 'userIdIndex',
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': { S: event.userId },
            },
            ScanIndexForward: false, // Newer first
        })
    );

    const items = response.Items || [];
    const jobs = items.map((item: any) => ({
        jobId: item.jobId?.S,
        status: item.status?.S,
        fileName: item.fileName?.S,
        s3OutputKey: item.s3OutputKey?.S,
        createdAt: item.createdAt?.N ? parseInt(item.createdAt.N) : undefined,
        completedAt: item.completedAt?.N ? parseInt(item.completedAt.N) : undefined,
        error: item.errorMsg?.S || item.error?.S,
    }));

    return respond(200, { jobs });
}

// ============================================
// ACTION 6: Reprocess a Job (Start Pipeline Again)
// ============================================
async function handleReprocessJob(event: { jobId: string; userId: string }): Promise<any> {
    const { jobId, userId } = event;
    console.log(`🔄 Reprocessing job: ${jobId} for user: ${userId}...`);

    // 1. Fetch job from DynamoDB
    const response = await dynamodbClient.send(
        new GetItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
        })
    );

    if (!response.Item) {
        return respond(404, { error: 'Job not found' });
    }

    // 2. Validate ownership
    const ownerId = response.Item.userId?.S;
    if (ownerId !== userId) {
        return respond(403, { error: 'Forbidden' });
    }

    const s3Key = response.Item.s3Key?.S;
    const fileName = response.Item.fileName?.S || 'document.pdf';

    if (!s3Key) {
        return respond(400, { error: 'Job does not have an associated source file' });
    }

    // 3. Verify original file still exists in S3
    try {
        await s3Client.send(
            new HeadObjectCommand({
                Bucket: UPLOADS_BUCKET,
                Key: s3Key,
            })
        );
    } catch (err: any) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
            return respond(410, { error: 'Original document has expired and cannot be re-translated' });
        }
        throw err;
    }

    // 4. Start Step Functions or fallback
    if (STATE_MACHINE_ARN) {
        await updateJobStatus(jobId, 'queued');
        await sfnClient.send(
            new StartExecutionCommand({
                stateMachineArn: STATE_MACHINE_ARN,
                name: `job-${jobId}-${Date.now()}`,
                input: JSON.stringify({ jobId, bucket: UPLOADS_BUCKET, key: s3Key }),
            })
        );
        console.log(`✅ Reprocess Job ${jobId} → Step Functions started`);
        return respond(200, { message: 'Reprocessing started' });
    }

    // Fallback mode
    await updateJobStatus(jobId, 'queued');
    console.log(`⚠️ Local mode: Reprocess Job ${jobId} status set to queued`);
    return respond(200, { message: 'Reprocessing queued (local fallback)' });
}