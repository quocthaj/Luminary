import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';
import { processWithMistral, processWithGroq, processWithGemini } from '../utils/ai-providers';
import { buildTranslatorPrompt } from '../utils/prompt-builder';

interface TranslateInput {
  jobId: string;
  chunkKey: string;
  chunkIndex: number;
}

interface TranslateOutput {
  chunkIndex: number;
  translatedKey: string;
}

const SYSTEM_MSG =
  'Bạn là chuyên gia dịch thuật tài liệu khoa học và học thuật từ tiếng Anh sang tiếng Việt. ' +
  'Dịch chính xác, tự nhiên, giữ nguyên mọi placeholder {{formula_X}}, {{figure_X}} và citation. ' +
  'Chỉ trả về bản dịch tiếng Việt dạng text thuần, không thêm gì khác.';

export const handler = async (event: TranslateInput): Promise<TranslateOutput> => {
  const { jobId, chunkKey, chunkIndex } = event;

  console.log(`🌐 [translate] job=${jobId} chunk=${chunkIndex}`);

  const chunkText = await getResultFromS3(chunkKey);
  const prompt = buildTranslatorPrompt(chunkText, chunkKey);

  let translated: string;
  try {
    translated = await processWithMistral(prompt, SYSTEM_MSG);
  } catch (mistralErr) {
    console.warn(`⚠️ Mistral failed chunk=${chunkIndex}, trying Groq:`, mistralErr);
    try {
      translated = await processWithGroq(prompt, SYSTEM_MSG);
    } catch (groqErr) {
      console.warn(`⚠️ Groq failed chunk=${chunkIndex}, falling back to Gemini:`, groqErr);
      translated = await processWithGemini(prompt);
    }
  }

  const translatedKey = await saveResultToS3(
    jobId,
    `translated_chunk_${chunkIndex}`,
    translated,
    `chunks/translated_${chunkIndex}.txt`
  );

  console.log(`✅ [translate] chunk=${chunkIndex} → ${translatedKey}`);

  return { chunkIndex, translatedKey };
};
