import { processWithGroq, processWithMistral } from '../utils/ai-providers';
import { buildLatexPrompt } from '../utils/prompt-builder';
import { saveResultToS3 } from '../utils/s3-helpers';

interface LaTeXInput {
  jobId: string;
  formulas: string[];
}

interface LaTeXOutput {
  latexKey: string;
}

const SYSTEM_MSG =
  'Bạn là một chuyên gia toán học và LaTeX. Nhiệm vụ của bạn là chuẩn hóa cú pháp các công thức toán được trích xuất từ tài liệu sang định dạng LaTeX chuẩn. ' +
  'Bắt buộc chỉ trả về định dạng JSON array hợp lệ chứa các công thức đã xử lý theo cấu trúc được yêu cầu. Không thêm văn bản giải thích nào khác ngoài JSON.';

export const handler = async (event: LaTeXInput): Promise<LaTeXOutput> => {
  const { jobId, formulas } = event;

  console.log(`📐 [latex] job=${jobId} formulas=${formulas.length}`);

  if (formulas.length === 0) {
    const latexKey = await saveResultToS3(jobId, 'latex', '[]', 'latex.json');
    console.log(`ℹ️ [latex] No formulas, saved empty array`);
    return { latexKey };
  }

  const prompt = buildLatexPrompt(formulas);
  let output: string;
  try {
    output = await processWithGroq(prompt, SYSTEM_MSG);
  } catch (groqErr) {
    console.warn('⚠️ Groq failed, falling back to Mistral:', groqErr);
    output = await processWithMistral(prompt, SYSTEM_MSG);
  }

  const latexKey = await saveResultToS3(jobId, 'latex', output, 'latex.json');

  console.log(`✅ [latex] ${formulas.length} formulas processed → ${latexKey}`);

  return { latexKey };
};
