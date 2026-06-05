// ============================================
// MERGE AGENT
// Nhiệm vụ: Gộp kết quả từ tất cả các agents (Translator, LaTeX, Diagram, Citation)
// thành một tài liệu Markdown hoàn chỉnh cuối cùng.
// ============================================

import { getResultFromS3, saveResultToS3 } from '../utils/s3-helpers';
import { updateJobStatus } from '../utils/dynamodb-helpers';
import type { MergeAgentInput, MergeAgentResult } from '../types';

export async function mergeAgent(input: MergeAgentInput): Promise<MergeAgentResult> {
    const { jobId, fileName, cleanedText, agentResults } = input;
    console.log(`🤝 [MergeAgent] Starting merge process for job ${jobId}`);

    try {
        // Bước 1: Lấy kết quả của Translator Agent từ S3
        const translatorResult = agentResults.find(r => r.agentName === 'translator');
        if (!translatorResult || !translatorResult.success || !translatorResult.outputKey) {
            throw new Error('Translator agent output is missing or failed — cannot proceed with merge');
        }

        console.log(`📥 [MergeAgent] Downloading translator output from ${translatorResult.outputKey}...`);
        const translatedText = await getResultFromS3(translatorResult.outputKey);
        console.log(`ℹ️ [MergeAgent] Downloaded translator output: ${translatedText.length} chars`);

        let englishMarkdown = cleanedText;
        let vietnameseMarkdown = translatedText;

        // Bước 2: Xử lý gộp LaTeX Agent
        const latexResult = agentResults.find(r => r.agentName === 'latex');
        if (latexResult && latexResult.success && latexResult.outputKey) {
            console.log(`📥 [MergeAgent] Downloading LaTeX output from ${latexResult.outputKey}...`);
            const latexJsonStr = await getResultFromS3(latexResult.outputKey);
            
            try {
                const latexArray = JSON.parse(latexJsonStr);
                if (Array.isArray(latexArray)) {
                    console.log(`📐 [MergeAgent] Merging ${latexArray.length} LaTeX formulas...`);
                    for (const formula of latexArray) {
                        if (formula.key) {
                            // Thay thế placeholder bằng công thức LaTeX đã xử lý (nếu null thì giữ nguyên raw original)
                            const replacement = formula.latex || formula.original || '';
                            englishMarkdown = englishMarkdown.replace(formula.key, replacement);
                            vietnameseMarkdown = vietnameseMarkdown.replace(formula.key, replacement);
                        }
                    }
                }
            } catch (jsonErr) {
                console.warn(`⚠️ [MergeAgent] Failed to parse LaTeX JSON:`, jsonErr);
            }
        }

        // Bước 3: Xử lý gộp Diagram Agent
        const diagramResult = agentResults.find(r => r.agentName === 'diagram');
        if (diagramResult && diagramResult.success && diagramResult.outputKey) {
            console.log(`📥 [MergeAgent] Downloading Diagram output from ${diagramResult.outputKey}...`);
            const diagramJsonStr = await getResultFromS3(diagramResult.outputKey);

            try {
                const diagramArray = JSON.parse(diagramJsonStr);
                if (Array.isArray(diagramArray)) {
                    console.log(`📊 [MergeAgent] Merging ${diagramArray.length} diagram/figure descriptions...`);
                    for (const fig of diagramArray) {
                        if (fig.key) {
                            const description = fig.description || 'Không có mô tả chi tiết.';
                            const altText = fig.altText ? ` *(${fig.altText})*` : '';
                            
                            // Render cho tiếng Việt
                            let viTypeLabel = 'Tham chiếu';
                            if (fig.type === 'figure') viTypeLabel = 'Hình vẽ';
                            else if (fig.type === 'table') viTypeLabel = 'Bảng biểu';
                            else if (fig.type === 'diagram') viTypeLabel = 'Biểu đồ';
                            const viReplacement = `\n> 📊 **[${viTypeLabel}]** ${description}${altText}\n`;
                            vietnameseMarkdown = vietnameseMarkdown.replace(fig.key, viReplacement);

                            // Render cho tiếng Anh
                            let enTypeLabel = 'Reference';
                            if (fig.type === 'figure') enTypeLabel = 'Figure';
                            else if (fig.type === 'table') enTypeLabel = 'Table';
                            else if (fig.type === 'diagram') enTypeLabel = 'Diagram';
                            const enReplacement = `\n> 📊 **[${enTypeLabel}]** ${description}${altText}\n`;
                            englishMarkdown = englishMarkdown.replace(fig.key, enReplacement);
                        }
                    }
                }
            } catch (jsonErr) {
                console.warn(`⚠️ [MergeAgent] Failed to parse Diagram JSON:`, jsonErr);
            }
        }

        // Bước 4: Xử lý gộp Citation Agent
        let bibliographySection = '';
        const citationResult = agentResults.find(r => r.agentName === 'citation');
        if (citationResult && citationResult.success && citationResult.outputKey) {
            console.log(`📥 [MergeAgent] Downloading Citation output from ${citationResult.outputKey}...`);
            const citationJsonStr = await getResultFromS3(citationResult.outputKey);

            try {
                const citationArray = JSON.parse(citationJsonStr);
                if (Array.isArray(citationArray) && citationArray.length > 0) {
                    console.log(`📚 [MergeAgent] Generating bibliography from ${citationArray.length} citations...`);
                    
                    bibliographySection = '\n\n---\n\n## 📚 Danh mục tài liệu tham khảo / Bibliography\n\n';
                    
                    for (const cite of citationArray) {
                        const original = cite.raw || '';
                        const normalized = cite.author
                            ? `${cite.author}${cite.etAl ? ' et al.' : ''}, ${cite.year ?? ''}`
                            : cite.ids
                            ? `Tài liệu [${cite.ids.join(', ')}]`
                            : 'Chưa rõ thông tin chi tiết.';
                        const count = cite.count || 1;
                        
                        let typeLabel = 'Không xác định';
                        if (cite.type === 'numbered') typeLabel = 'Tài liệu số';
                        else if (cite.type === 'author-year-bracket') typeLabel = 'Tên tác giả';
                        else if (cite.type === 'author-year-paren') typeLabel = 'Trích dẫn';
                        else if (cite.type === 'unknown') typeLabel = 'Không xác định';
                        
                        bibliographySection += `- **${original}** — *[${typeLabel}]* ${normalized} *(Xuất hiện ${count} lần)*\n`;
                    }
                }
            } catch (jsonErr) {
                console.warn(`⚠️ [MergeAgent] Failed to parse Citation JSON:`, jsonErr);
            }
        }

        // Tạo cấu trúc song ngữ hoàn chỉnh cuối cùng
        const finalMarkdown = `## English\n\n${englishMarkdown}\n\n---\n\n## Tiếng Việt\n\n${vietnameseMarkdown}${bibliographySection}`;

        // Lưu kết quả gộp cuối cùng
        console.log(`💾 [MergeAgent] Saving final merged markdown to S3...`);
        const outputKey = await saveResultToS3(jobId, fileName, finalMarkdown, 'analysis.md');

        // Cập nhật DynamoDB → completed
        const now = Math.floor(Date.now() / 1000);
        await updateJobStatus(jobId, 'completed', {
            s3OutputKey: outputKey,
            completedAt: now,
        });

        console.log(`✅ [MergeAgent] Completed successfully! Saved to ${outputKey}`);

        return {
            jobId,
            success: true,
            outputKey,
        };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [MergeAgent] Failed:`, errorMsg);

        // Cập nhật DynamoDB → failed
        await updateJobStatus(jobId, 'failed', {
            error: errorMsg,
        });

        return {
            jobId,
            success: false,
            error: errorMsg,
        };
    }
}

/**
 * Lambda handler cho Step Functions invocation.
 */
export const handler = async (event: MergeAgentInput): Promise<MergeAgentResult> => {
    return mergeAgent(event);
};
