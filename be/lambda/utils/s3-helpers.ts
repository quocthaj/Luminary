// ============================================
// S3 HELPERS
// ============================================

import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, RESULTS_BUCKET } from './aws-clients';

/**
 * Lưu kết quả (markdown, json, txt) vào S3 results bucket.
 * @returns S3 output key
 */
export async function saveResultToS3(
    jobId: string,
    fileName: string,
    content: string,
    outputFileName: string
): Promise<string> {
    const outputKey = `results/${jobId}/${outputFileName}`;

    // Xác định Content-Type dựa trên đuôi file
    let contentType = 'text/plain; charset=utf-8';
    if (outputFileName.endsWith('.md')) {
        contentType = 'text/markdown; charset=utf-8';
    } else if (outputFileName.endsWith('.json')) {
        contentType = 'application/json; charset=utf-8';
    }

    await s3Client.send(
        new PutObjectCommand({
            Bucket: RESULTS_BUCKET,
            Key: outputKey,
            Body: content,
            ContentType: contentType,
            Metadata: {
                jobId,
                fileName: encodeURIComponent(fileName),
                processedAt: new Date().toISOString(),
            },
        })
    );

    console.log(`✅ Result saved to s3://${RESULTS_BUCKET}/${outputKey}`);
    return outputKey;
}

/**
 * Đọc nội dung file từ S3 results bucket.
 * @returns nội dung dạng string
 */
export async function getResultFromS3(outputKey: string): Promise<string> {
    console.log(`📥 Downloading s3://${RESULTS_BUCKET}/${outputKey}...`);
    
    try {
        const response = await s3Client.send(
            new GetObjectCommand({
                Bucket: RESULTS_BUCKET,
                Key: outputKey,
            })
        );

        const content = await response.Body?.transformToString() || '';
        return content;
    } catch (err) {
        console.error(`❌ Failed to read S3 key ${outputKey}:`, err);
        throw err;
    }
}

