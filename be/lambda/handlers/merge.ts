import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';
import { updateJobStatus } from '../utils/dynamodb-helpers';

interface TranslatedChunk {
  chunkIndex: number;
  translatedKey: string;
}

interface MergeInput {
  jobId: string;
  citations: string[];
  originalTextKey: string;
  parallelResults: [
    { translatedChunks: TranslatedChunk[] },
    { latexKey: string }
  ];
}

interface MergeOutput {
  jobId: string;
  outputKey: string;
  chunksCount: number;
}

export const handler = async (event: MergeInput): Promise<MergeOutput> => {
  const { jobId, citations, originalTextKey } = event;
  const [translateResult, latexResult] = event.parallelResults;

  console.log(`🤝 [merge] job=${jobId}`);

  const sortedChunks = [...translateResult.translatedChunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Bước 1: Download original English chunks + translated chunks song song
  const [originalParts, translatedParts] = await Promise.all([
    Promise.all(sortedChunks.map(c => getResultFromS3(`results/${jobId}/chunks/chunk_${c.chunkIndex}.txt`))),
    Promise.all(sortedChunks.map(c => getResultFromS3(c.translatedKey))),
  ]);

  // Bước 2: Apply LaTeX replacements lên từng bản dịch chunk
  let processedTranslatedParts = [...translatedParts];
  try {
    const latexJsonStr = await getResultFromS3(latexResult.latexKey);
    const latexArray: Array<{ key: string; original: string; latex: string | null }> = JSON.parse(latexJsonStr);
    if (Array.isArray(latexArray) && latexArray.length > 0) {
      processedTranslatedParts = translatedParts.map(part => {
        let text = part;
        for (const formula of latexArray) {
          if (formula.key) {
            const replacement = formula.latex ?? formula.original;
            text = text.replaceAll(formula.key, replacement);
          }
        }
        return text;
      });
      console.log(`📐 [merge] Applied ${latexArray.length} LaTeX replacements to chunks`);
    }
  } catch (err) {
    console.warn('⚠️ [merge] LaTeX apply failed, skipping:', err);
  }

  // Bước 3: Build bibliography từ raw citations (deduplicated)
  let bibliographySection = '';
  const uniqueCitations = [...new Set(citations)];
  if (uniqueCitations.length > 0) {
    bibliographySection =
      '\n\n---\n\n## 📚 Danh mục tài liệu tham khảo\n\n' +
      uniqueCitations.map(c => `- ${c}`).join('\n');
  }

  // Bước 4: Prepend anchors và assemble bilingual Markdown
  const englishContent = originalParts.map((part, idx) => `{#chunk-${idx}}${part.trim()}`).join('\n\n');
  const vietnameseContent = processedTranslatedParts.map((part, idx) => `{#chunk-${idx}}${part.trim()}`).join('\n\n');
  const finalMarkdown = `## English\n\n${englishContent}\n\n---\n\n## Tiếng Việt\n\n${vietnameseContent}${bibliographySection}`;

  // Bước 5: Save to S3
  const outputKey = await saveResultToS3(jobId, 'analysis', finalMarkdown, 'analysis.md');

  // Bước 6: Update DynamoDB → completed
  await updateJobStatus(jobId, 'completed', {
    s3OutputKey: outputKey,
    completedAt: Math.floor(Date.now() / 1000),
  });

  console.log(`✅ [merge] Completed → ${outputKey}`);

  return { jobId, outputKey, chunksCount: sortedChunks.length };
};
