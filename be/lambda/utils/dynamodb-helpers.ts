// ============================================
// DYNAMODB HELPERS
// ============================================

import { UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { dynamodbClient, JOBS_TABLE } from './aws-clients';
import type { JobStatusExtra } from '../types';

export async function getJobStatus(jobId: string): Promise<{ status: string } | null> {
    const response = await dynamodbClient.send(
        new GetItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
        })
    );

    if (!response.Item) return null;
    return { status: response.Item.status?.S ?? 'unknown' };
}

export async function updateJobStatus(
    jobId: string,
    status: string,
    extra?: JobStatusExtra
): Promise<void> {
    let updateExpression = 'SET #status = :status';
    const names: Record<string, string> = { '#status': 'status' };
    const values: Record<string, any> = { ':status': { S: status } };

    if (extra?.s3OutputKey) {
        updateExpression += ', s3OutputKey = :outputKey';
        values[':outputKey'] = { S: extra.s3OutputKey };
    }
    if (extra?.completedAt) {
        updateExpression += ', completedAt = :completedAt';
        values[':completedAt'] = { N: extra.completedAt.toString() };
    }
    if (extra?.error) {
        updateExpression += ', errorMsg = :error';
        values[':error'] = { S: extra.error };
    }
    if (extra?.hasFormula !== undefined) {
        updateExpression += ', hasFormula = :hasFormula';
        values[':hasFormula'] = { BOOL: extra.hasFormula };
    }
    if (extra?.hasDiagram !== undefined) {
        updateExpression += ', hasDiagram = :hasDiagram';
        values[':hasDiagram'] = { BOOL: extra.hasDiagram };
    }
    if (extra?.hasCitation !== undefined) {
        updateExpression += ', hasCitation = :hasCitation';
        values[':hasCitation'] = { BOOL: extra.hasCitation };
    }

    await dynamodbClient.send(
        new UpdateItemCommand({
            TableName: JOBS_TABLE,
            Key: { jobId: { S: jobId } },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
        })
    );
}
