// ============================================
// VIETAI SCHOLAR — MAIN LAMBDA HANDLER
// Slim entry point: routing + supervisor delegation
// ============================================

import {
    PutObjectCommand,
    GetObjectCommand,
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

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';
const sfnClient = new SFNClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

// ============================================
// MAIN HANDLER
// ============================================
export const handler = async (event: any) => {
    console.log('📨 Event received:', JSON.stringify(event, null, 2));

    try {
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
            const userId = event.requestContext?.authorizer?.userId || 'guest';
            return await handleGenerateUploadUrl({ fileName: requestBody.fileName || 'document.pdf', userId });
        }

        if (httpMethod === 'GET' && path === '/jobs') {
            const userId = event.requestContext?.authorizer?.userId;
            if (!userId) {
                return respond(401, { error: 'Unauthorized' });
            }
            return await handleListJobs({ userId });
        }

        if (httpMethod === 'GET' && path?.startsWith('/job/')) {
            const jobId = path.split('/').pop();
            return await handleGetJobStatus({ jobId });
        }

        if (httpMethod === 'GET' && path?.startsWith('/result/')) {
            const jobId = path.split('/').pop();
            return await handleGetResultUrl({ jobId });
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
async function handleGetResultUrl(event: { jobId?: string }): Promise<any> {
    const jobId = event.jobId;
    if (!jobId) return respond(400, { error: 'jobId is required' });

    const response = await dynamodbClient.send(
        new GetItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
        })
    );

    if (!response.Item) return respond(404, { error: 'Job not found' });

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