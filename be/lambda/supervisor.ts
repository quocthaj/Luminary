// ============================================
// SUPERVISOR HANDLER
// Điều phối các agent và quản lý luồng xử lý tổng thể
// ============================================

import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { extractPlaceholders } from './utils/placeholder';
import { updateJobStatus } from './utils/dynamodb-helpers';
import { translatorAgent } from './agents/translator';
import { latexAgent } from './agents/latex';
import { diagramAgent } from './agents/diagram';
import { citationAgent } from './agents/citation';
import { mergeAgent } from './agents/merge';
import type { AgentInput, AgentResult, SupervisorInput, SupervisorOutput } from './types';

const REGION = process.env.AWS_REGION || 'ap-southeast-1';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || '';
const sfnClient = new SFNClient({ region: REGION });

/**
 * Supervisor handler — điều phối các agent.
 *
 * Có 2 chế độ hoạt động:
 * 1. **Direct mode** (khi không có Step Function): chạy agents in-process
 * 2. **Step Function mode** (khi có STATE_MACHINE_ARN): khởi động Step Function
 *    và để nó điều phối agents song song
 */
export async function supervisorHandler(input: SupervisorInput): Promise<SupervisorOutput> {
    const { jobId, fileName, extractedText } = input;
    console.log(`🎯 [Supervisor] Starting for job ${jobId}`);

    // Step 1: Tách placeholders
    const { cleanedText, formulas, figures, citations } = extractPlaceholders(extractedText);
    const hasFormula = formulas.length > 0;
    const hasDiagram = figures.length > 0;
    const hasCitation = citations.length > 0;

    console.log(`🔍 [Supervisor] Placeholders: ${formulas.length} formulas, ${figures.length} figures, ${citations.length} citations`);

    // Cập nhật DynamoDB — đánh dấu đang xử lý + metadata
    await updateJobStatus(jobId, 'processing', { hasFormula, hasDiagram, hasCitation });

    // Step 2: Quyết định chế độ hoạt động
    if (STATE_MACHINE_ARN) {
        // === Step Function mode ===
        return await startStepFunction(jobId, fileName, cleanedText, formulas, figures, citations, hasFormula, hasDiagram, hasCitation);
    } else {
        // === Direct mode (fallback — chạy agents trong process) ===
        return await runAgentsDirect(jobId, fileName, cleanedText, formulas, figures, citations, hasFormula, hasDiagram, hasCitation);
    }
}

/**
 * Khởi động Step Function để điều phối agents song song.
 */
async function startStepFunction(
    jobId: string,
    fileName: string,
    cleanedText: string,
    formulas: string[],
    figures: string[],
    citations: string[],
    hasFormula: boolean,
    hasDiagram: boolean,
    hasCitation: boolean,
): Promise<SupervisorOutput> {
    console.log(`🚀 [Supervisor] Starting Step Function: ${STATE_MACHINE_ARN}`);

    const sfnInput = {
        jobId,
        fileName,
        cleanedText,
        formulas,
        figures,
        citations,
        hasFormula,
        hasDiagram,
        hasCitation,
    };

    await sfnClient.send(new StartExecutionCommand({
        stateMachineArn: STATE_MACHINE_ARN,
        name: `job-${jobId}`,
        input: JSON.stringify(sfnInput),
    }));

    console.log(`✅ [Supervisor] Step Function started for job ${jobId}`);

    // Step Function sẽ xử lý phần còn lại (agents + save + update)
    // Trả về trạng thái "orchestrating"
    return {
        jobId,
        status: 'orchestrating',
        hasFormula,
        hasDiagram,
        hasCitation,
        agentResults: [],
    };
}

/**
 * Chạy agents trực tiếp trong process (khi không có Step Function).
 * Các agents chạy song song bằng Promise.allSettled.
 */
async function runAgentsDirect(
    jobId: string,
    fileName: string,
    cleanedText: string,
    formulas: string[],
    figures: string[],
    citations: string[],
    hasFormula: boolean,
    hasDiagram: boolean,
    hasCitation: boolean,
): Promise<SupervisorOutput> {
    console.log(`🔄 [Supervisor] Running agents directly (no Step Function)`);

    const agentInput: AgentInput = {
        jobId,
        fileName,
        text: cleanedText,
        formulas,
        figures,
        citations,
    };

    // Chạy tất cả agents song song
    const agentPromises = [
        translatorAgent(agentInput),
        latexAgent(agentInput),
        diagramAgent(agentInput),
        citationAgent(agentInput),
    ];

    const results = await Promise.allSettled(agentPromises);
    const agentResults: AgentResult[] = results.map((result, idx) => {
        const agentNames = ['translator', 'latex', 'diagram', 'citation'];
        if (result.status === 'fulfilled') {
            return result.value;
        } else {
            return {
                agentName: agentNames[idx],
                success: false,
                error: result.reason?.message || 'Unknown error',
            };
        }
    });

    // Log kết quả
    for (const r of agentResults) {
        const icon = r.success ? '✅' : '❌';
        console.log(`${icon} [Supervisor] Agent "${r.agentName}": ${r.success ? 'success' : r.error}`);
    }

    // Cập nhật DynamoDB → agents_completed
    await updateJobStatus(jobId, 'agents_completed', {
        hasFormula,
        hasDiagram,
        hasCitation,
    });

    console.log(`✅ [Supervisor] Agents finished for job ${jobId} -> agents_completed`);

    // Gọi Merge Agent để kết hợp kết quả ngay trong chế độ chạy trực tiếp (Direct Mode)
    console.log(`🤝 [Supervisor] Calling MergeAgent for job ${jobId} (Direct Mode)...`);
    const mergeResult = await mergeAgent({
        jobId,
        fileName,
        cleanedText,
        agentResults,
    });

    return {
        jobId,
        status: mergeResult.success ? 'completed' : 'failed',
        outputKey: mergeResult.outputKey,
        hasFormula,
        hasDiagram,
        hasCitation,
        agentResults,
    };
}

/**
 * Lambda handler — được gọi trực tiếp từ Step Function hoặc từ index.ts
 */
export const handler = async (event: SupervisorInput): Promise<SupervisorOutput> => {
    return supervisorHandler(event);
};
