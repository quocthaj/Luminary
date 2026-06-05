import { extractTextFromS3 } from '../utils/text-extraction';
import { extractPlaceholders } from '../utils/placeholder';
import { chunkTextByParagraph } from '../utils/prompt-builder';
import { saveResultToS3 } from '../utils/s3-helpers';
import { updateJobStatus } from '../utils/dynamodb-helpers';

interface ExtractInput {
  jobId: string;
  bucket: string;
  key: string;
}

interface ChunkRef {
  jobId: string;
  chunkKey: string;
  chunkIndex: number;
}

export interface ExtractOutput {
  jobId: string;
  chunks: ChunkRef[];
  formulas: string[];
  figures: string[];
  citations: string[];
  originalTextKey: string;
}

export const handler = async (event: ExtractInput): Promise<ExtractOutput> => {
  const { jobId, bucket, key } = event;

  console.log(`🔍 [extract] job=${jobId} key=${key}`);
  await updateJobStatus(jobId, 'extracting');

  const rawText = await extractTextFromS3(bucket, key);

  const { cleanedText, formulas, figures, citations } = extractPlaceholders(rawText);

  const textChunks = chunkTextByParagraph(cleanedText);

  const chunks: ChunkRef[] = await Promise.all(
    textChunks.map(async (chunkText, index) => {
      const chunkKey = await saveResultToS3(
        jobId,
        `chunk_${index}`,
        chunkText,
        `chunks/chunk_${index}.txt`
      );
      return { jobId, chunkKey, chunkIndex: index };
    })
  );

  // Normalize line breaks: join mid-sentence single \n → space
  // Exception: keep \n when next line starts with uppercase/digit (heading)
  const normalizedText = cleanedText
    .replace(/([^\n])\n(?![A-Z\d])/g, '$1 ')
    .replace(/  +/g, ' ')
    .trim();

  const originalTextKey = await saveResultToS3(jobId, 'original', normalizedText, 'original.txt');

  await updateJobStatus(jobId, 'extracted', {
    hasFormula: formulas.length > 0,
    hasDiagram: figures.length > 0,
    hasCitation: citations.length > 0,
  });

  console.log(`✅ [extract] ${chunks.length} chunks, ${formulas.length} formulas, ${figures.length} figures, ${citations.length} citations`);

  return { jobId, chunks, formulas, figures, citations, originalTextKey };
};
