// ============================================
// LATEX AGENT
// Nhiệm vụ: Xử lý và render công thức toán học
// ============================================

import { processWithAI } from '../utils/ai-providers';
import { buildLatexPrompt } from '../utils/prompt-builder';
import { saveResultToS3 } from '../utils/s3-helpers';
import type { AgentInput, AgentResult } from '../types';

const LATEX_SYSTEM_MSG =
    'Bạn là một chuyên gia toán học và LaTeX. Nhiệm vụ của bạn là chuẩn hóa cú pháp các công thức toán được trích xuất từ tài liệu sang định dạng LaTeX chuẩn. ' +
    'Bắt buộc chỉ trả về định dạng JSON array hợp lệ chứa các công thức đã xử lý theo cấu trúc được yêu cầu. Không thêm văn bản giải thích nào khác ngoài JSON.';

export async function latexAgent(input: AgentInput): Promise<AgentResult> {
    console.log(`📐 [LaTeXAgent] Starting for job ${input.jobId}`);

    try {
        const formulas = input.formulas || [];

        if (formulas.length === 0) {
            console.log(`ℹ️ [LaTeXAgent] No formulas to process, skipping`);
            return {
                agentName: 'latex',
                success: true,
                output: '[]',
            };
        }

        console.log(`📐 [LaTeXAgent] Processing ${formulas.length} formulas via AI`);

        const prompt = buildLatexPrompt(formulas);
        const output = await processWithAI(prompt, LATEX_SYSTEM_MSG);

        console.log(`💾 [LaTeXAgent] Saving result to S3...`);
        const outputKey = await saveResultToS3(input.jobId, input.fileName, output, 'latex.json');

        console.log(`✅ [LaTeXAgent] Completed: ${formulas.length} formulas processed, saved to ${outputKey}`);
        return {
            agentName: 'latex',
            success: true,
            output,
            outputKey,
        };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [LaTeXAgent] Failed:`, errorMsg);
        return {
            agentName: 'latex',
            success: false,
            error: errorMsg,
        };
    }
}

/**
 * Lambda handler cho Step Functions invocation.
 */
export const handler = async (event: AgentInput): Promise<AgentResult> => {
    return latexAgent(event);
};
