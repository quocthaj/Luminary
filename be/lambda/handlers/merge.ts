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
}

export const handler = async (event: MergeInput): Promise<MergeOutput> => {
  const { jobId, citations, originalTextKey } = event;
  const [translateResult, latexResult] = event.parallelResults;

  console.log(`🤝 [merge] job=${jobId}`);

  // Bước 1: Download original English text + translated chunks song song
  const [originalText, ...translatedParts] = await Promise.all([
    getResultFromS3(originalTextKey),
    ...([...translateResult.translatedChunks]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(c => getResultFromS3(c.translatedKey))),
  ]);
  let translatedText = translatedParts.join('\n\n');

  // Bước 2: Apply LaTeX replacements lên bản dịch
  try {
    const latexJsonStr = await getResultFromS3(latexResult.latexKey);
    const latexArray: Array<{ key: string; original: string; latex: string | null }> = JSON.parse(latexJsonStr);
    if (Array.isArray(latexArray)) {
      for (const formula of latexArray) {
        if (formula.key) {
          const replacement = formula.latex ?? formula.original;
          translatedText = translatedText.replaceAll(formula.key, replacement);
        }
      }
      console.log(`📐 [merge] Applied ${latexArray.length} LaTeX replacements`);
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

  // Bước 4: Assemble bilingual Markdown
  const finalMarkdown = `## English\n\n${originalText}\n\n---\n\n## Tiếng Việt\n\n${translatedText}${bibliographySection}`;

  // Bước 5: Save to S3
  const outputKey = await saveResultToS3(jobId, 'analysis', finalMarkdown, 'analysis.md');

  // Bước 6: Update DynamoDB → completed
  await updateJobStatus(jobId, 'completed', {
    s3OutputKey: outputKey,
    completedAt: Math.floor(Date.now() / 1000),
  });

  console.log(`✅ [merge] Completed → ${outputKey}`);

  return { jobId, outputKey };
};
