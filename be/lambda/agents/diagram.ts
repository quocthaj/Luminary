// ============================================
// DIAGRAM AGENT
// Nhiệm vụ: Xử lý và mô tả hình ảnh/biểu đồ
// ============================================

import { processWithAI } from '../utils/ai-providers';
import { buildDiagramPrompt } from '../utils/prompt-builder';
import { saveResultToS3 } from '../utils/s3-helpers';
import type { AgentInput, AgentResult } from '../types';

const DIAGRAM_SYSTEM_MSG =
    'Bạn là một chuyên gia phân tích tài liệu khoa học và thiết kế alt-text. Nhiệm vụ của bạn là xác định loại và mô tả chi tiết các sơ đồ, hình vẽ, biểu đồ được tham chiếu. ' +
    'Bắt buộc chỉ trả về định dạng JSON array hợp lệ. Không thêm bất kỳ lời giải thích nào ngoài JSON.';

export async function diagramAgent(input: AgentInput): Promise<AgentResult> {
    console.log(`📊 [DiagramAgent] Starting for job ${input.jobId}`);

    try {
        const figures = input.figures || [];

        if (figures.length === 0) {
            console.log(`ℹ️ [DiagramAgent] No figures to process, skipping`);
            return {
                agentName: 'diagram',
                success: true,
                output: '[]',
            };
        }

        console.log(`📊 [DiagramAgent] Processing ${figures.length} figures via AI`);

        const prompt = buildDiagramPrompt(figures);
        const output = await processWithAI(prompt, DIAGRAM_SYSTEM_MSG);

        console.log(`💾 [DiagramAgent] Saving result to S3...`);
        const outputKey = await saveResultToS3(input.jobId, input.fileName, output, 'diagram.json');

        console.log(`✅ [DiagramAgent] Completed: ${figures.length} figures processed, saved to ${outputKey}`);
        return {
            agentName: 'diagram',
            success: true,
            output,
            outputKey,
        };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [DiagramAgent] Failed:`, errorMsg);
        return {
            agentName: 'diagram',
            success: false,
            error: errorMsg,
        };
    }
}

/**
 * Lambda handler cho Step Functions invocation.
 */
export const handler = async (event: AgentInput): Promise<AgentResult> => {
    return diagramAgent(event);
};
