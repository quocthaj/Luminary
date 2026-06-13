import { getResultFromS3 } from '../utils/s3-helpers';
import { getJobItem, updateJobSummary } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN } from '../utils/aws-clients';
import { getEmbeddingsBatch } from '../utils/ai-providers';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

interface IngestInput {
  jobId: string;
  outputKey: string;
  chunksCount: number;
}

interface IngestOutput {
  jobId: string;
  status: string;
}

const MY_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const COLLECTION_NAME = 'vietai-scholar-chunks';

export const handler = async (event: IngestInput): Promise<IngestOutput> => {
  const { jobId, outputKey, chunksCount } = event;
  console.log(`📥 [ingest] Starting ingestion for job=${jobId}, chunksCount=${chunksCount}`);

  // 1. Fetch userId from DynamoDB
  let userId = 'guest';
  try {
    const jobItem = await getJobItem(jobId);
    if (jobItem && jobItem.userId?.S) {
      userId = jobItem.userId.S;
    }
    console.log(`👤 [ingest] Job owned by userId=${userId}`);
  } catch (err) {
    console.warn(`⚠️ [ingest] Failed to fetch job item from DynamoDB:`, err);
  }

  // 2. Read merged Markdown from S3
  const content = await getResultFromS3(outputKey);

  // 3. Parse Markdown into aligned paragraphs using anchors
  const divider = '\n\n---\n\n## Tiếng Việt\n\n';
  const dividerIndex = content.indexOf(divider);
  if (dividerIndex === -1) {
    throw new Error('Could not find bilingual divider in Markdown output');
  }

  const englishSection = content.substring(0, dividerIndex).replace(/^## English\n\n/, '');
  const vietnameseSection = content.substring(dividerIndex + divider.length);

  const parseParagraphs = (sectionText: string): Map<number, string> => {
    const paragraphMap = new Map<number, string>();
    const paras = sectionText.split(/\n\n+/);
    for (const p of paras) {
      const match = p.match(/^\{#chunk-(\d+)\}([\s\S]*)$/);
      if (match) {
        const index = parseInt(match[1], 10);
        paragraphMap.set(index, match[2].trim());
      }
    }
    return paragraphMap;
  };

  const englishMap = parseParagraphs(englishSection);
  const vietnameseMap = parseParagraphs(vietnameseSection);

  const chunksToUpsert: Array<{ index: number; original: string; translated: string }> = [];
  for (let i = 0; i < chunksCount; i++) {
    const original = englishMap.get(i);
    const translated = vietnameseMap.get(i);
    if (original && translated) {
      chunksToUpsert.push({ index: i, original, translated });
    }
  }

  console.log(`📦 [ingest] Aligned ${chunksToUpsert.length}/${chunksCount} chunks for embedding`);

  if (chunksToUpsert.length === 0) {
    console.warn('⚠️ [ingest] No aligned chunks found, skipping Qdrant upsert');
    return { jobId, status: 'no_chunks' };
  }

  // 4. Generate embeddings for English paragraphs
  const originalTexts = chunksToUpsert.map(c => c.original);
  const embeddings = await getEmbeddingsBatch(originalTexts, 'search_document');

  // 5. Connect to Qdrant Cloud
  const qdrantSecretArn = process.env.QDRANT_SECRET_ARN || '';
  if (!qdrantSecretArn) {
    throw new Error('QDRANT_SECRET_ARN environment variable is not defined');
  }

  const qdrantSecretStr = await getSecret(qdrantSecretArn);
  const qdrantConfig = JSON.parse(qdrantSecretStr);
  const qdrantUrl = qdrantConfig.url;
  const qdrantApiKey = qdrantConfig.apiKey;

  if (!qdrantUrl) {
    throw new Error('Qdrant URL is not defined in secret config');
  }

  console.log(`📡 [ingest] Connecting to Qdrant at: ${qdrantUrl}`);
  const qdrantClient = new QdrantClient({
    url: qdrantUrl,
    apiKey: qdrantApiKey,
  });

  // 6. Ensure Qdrant Collection exists
  try {
    const collectionsResult = await qdrantClient.getCollections();
    const collectionExists = collectionsResult.collections.some(c => c.name === COLLECTION_NAME);
    let recreate = false;

    if (collectionExists) {
      // Check collection details for dimension mismatch
      const info = await qdrantClient.getCollection(COLLECTION_NAME);
      const vectorSize = (info.config?.params?.vectors as any)?.size;
      if (vectorSize !== 768) {
        console.log(`⚠️ [ingest] Dimension mismatch (expected 768, found ${vectorSize}). Deleting collection ${COLLECTION_NAME} to recreate it...`);
        await qdrantClient.deleteCollection(COLLECTION_NAME);
        recreate = true;
      }
    } else {
      recreate = true;
    }

    if (recreate) {
      console.log(`🧱 [ingest] Creating Qdrant collection ${COLLECTION_NAME}...`);
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });

      // Tạo payload index cho filter để tăng tốc và đảm bảo RAG tìm kiếm chính xác
      await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'userId',
        field_schema: 'keyword'
      });
      await qdrantClient.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'jobId',
        field_schema: 'keyword'
      });
      console.log('✅ [ingest] Payload indexes created for userId and jobId');
    }
  } catch (err) {
    console.warn(`⚠️ [ingest] Error checking/creating collection ${COLLECTION_NAME}:`, err);
  }

  // 7. Map points and Upsert
  const points = chunksToUpsert.map((chunk, idx) => {
    const pointId = uuidv5(`${jobId}-${chunk.index}`, MY_NAMESPACE);
    return {
      id: pointId,
      vector: embeddings[idx],
      payload: {
        userId,
        jobId,
        chunkIndex: chunk.index,
        text_original: chunk.original,
        text_translated: chunk.translated,
      },
    };
  });

  console.log(`🚀 [ingest] Upserting ${points.length} points to Qdrant...`);
  await qdrantClient.upsert(COLLECTION_NAME, { points });

  // 8. Generate and save Executive Summary
  try {
    const geminiSecretArn = GEMINI_SECRET_ARN || process.env.GEMINI_SECRET_ARN || '';
    if (geminiSecretArn) {
      const geminiApiKey = await getSecret(geminiSecretArn);
      if (geminiApiKey) {
        const genAI = new GoogleGenerativeAI(geminiApiKey);
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: SchemaType.OBJECT,
              properties: {
                tldr: { type: SchemaType.STRING, description: 'Tóm tắt 1 câu ngắn gọn về bài báo' },
                keyContributions: {
                  type: SchemaType.ARRAY,
                  items: { type: SchemaType.STRING },
                  description: 'Mảng chứa 3-5 đóng góp chính của bài viết'
                },
                methodology: { type: SchemaType.STRING, description: 'Tóm tắt phương pháp nghiên cứu' },
                limitations: { type: SchemaType.STRING, description: 'Tóm tắt các mặt hạn chế của nghiên cứu' }
              },
              required: ['tldr', 'keyContributions', 'methodology', 'limitations']
            }
          }
        });

        const docSample = content.length > 150000 ? content.substring(0, 150000) : content;
        const promptInput = `Bạn hãy trích xuất bản tóm tắt học thuật (Executive Summary) cho tài liệu song ngữ sau. Trả về đúng cấu trúc JSON được yêu cầu bằng Tiếng Việt.

Tài liệu:
${docSample}
`;

        console.log(`🤖 [ingest] Generating Executive Summary using Gemini 2.0 Flash...`);
        const result = await model.generateContent(promptInput);
        const responseText = result.response.text();
        console.log(`🤖 [ingest] Gemini summary response: ${responseText}`);

        const summaryObj = JSON.parse(responseText);

        await updateJobSummary(jobId, {
          tldr: summaryObj.tldr || '',
          keyContributions: Array.isArray(summaryObj.keyContributions) ? summaryObj.keyContributions : [],
          methodology: summaryObj.methodology || '',
          limitations: summaryObj.limitations || ''
        });
        console.log(`✅ [ingest] Executive Summary saved for jobId=${jobId}`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ [ingest] Failed to generate/save Executive Summary:`, err);
  }

  console.log(`✅ [ingest] Ingestion completed for job=${jobId}`);
  return { jobId, status: 'ingested' };
};
