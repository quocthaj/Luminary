// ============================================
// SHARED AWS CLIENTS & ENVIRONMENT VARIABLES
// ============================================

import {
    S3Client,
} from '@aws-sdk/client-s3';
import {
    DynamoDBClient,
} from '@aws-sdk/client-dynamodb';
import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import {
    TextractClient,
} from '@aws-sdk/client-textract';

// ============================================
// AWS CLIENTS (singleton, reused across modules)
// ============================================
const REGION = process.env.AWS_REGION || 'ap-southeast-1';

export const s3Client = new S3Client({ region: REGION });
export const dynamodbClient = new DynamoDBClient({ region: REGION });
export const smClient = new SecretsManagerClient({ region: REGION });
export const textractClient = new TextractClient({ region: REGION });

// ============================================
// ENVIRONMENT VARIABLES
// ============================================
export const UPLOADS_BUCKET = process.env.S3_UPLOADS_BUCKET || '';
export const RESULTS_BUCKET = process.env.S3_RESULTS_BUCKET || '';
export const JOBS_TABLE = process.env.DYNAMODB_TABLE || '';
export const QUIZ_SHARES_TABLE = process.env.QUIZ_SHARES_TABLE || 'vietai-quiz-shares';
export const THESIS_DEFENSE_SESSIONS_TABLE = process.env.THESIS_DEFENSE_SESSIONS_TABLE || 'vietai-thesis-defense-sessions';
export const USER_COMPETENCY_PROFILE_TABLE = process.env.USER_COMPETENCY_PROFILE_TABLE || 'vietai-user-competency-profile';
export const GROQ_SECRET_ARN = process.env.GROQ_SECRET_ARN || '';
export const GEMINI_SECRET_ARN = process.env.GEMINI_SECRET_ARN || '';
export const DEEPSEEK_SECRET_ARN = process.env.DEEPSEEK_SECRET_ARN || '';
export const MISTRAL_SECRET_ARN = process.env.MISTRAL_SECRET_ARN || '';
export const GEMINI_EMBEDDING_SECRET_ARN = process.env.GEMINI_EMBEDDING_SECRET_ARN || '';
export const NOMIC_SECRET_ARN = process.env.NOMIC_SECRET_ARN || '';
export const GOOGLE_TTS_SECRET_ARN = process.env.GOOGLE_TTS_SECRET_ARN || '';

// ============================================
// SECRET CACHE
// ============================================
const secretCache: Record<string, string> = {};

export async function getSecret(arn: string): Promise<string> {
    if (secretCache[arn]) return secretCache[arn];
    const res = await smClient.send(new GetSecretValueCommand({ SecretId: arn }));
    const value = res.SecretString || '';
    secretCache[arn] = value;
    return value;
}
