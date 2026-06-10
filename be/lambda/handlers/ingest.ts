import { getResultFromS3 } from '../utils/s3-helpers';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret } from '../utils/aws-clients';
import { getGeminiEmbeddingsBatch } from '../utils/ai-providers';
import { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';

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
  const embeddings = await getGeminiEmbeddingsBatch(originalTexts);

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
    if (!collectionExists) {
      console.log(`🧱 [ingest] Creating Qdrant collection ${COLLECTION_NAME}...`);
      await qdrantClient.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 768,
          distance: 'Cosine',
        },
      });
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

  console.log(`✅ [ingest] Ingestion completed for job=${jobId}`);
  return { jobId, status: 'ingested' };
};
