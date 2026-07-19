// ============================================
// TRANSLATOR AGENT
// Nhiệm vụ: Dịch và phân tích tài liệu (Mistral/Groq/Gemini)
// ============================================

import { processWithMistral, processWithGroq, processWithGemini } from '../utils/ai-providers';
import { buildTranslatorPrompt, chunkTextByParagraph } from '../utils/prompt-builder';
import { saveResultToS3 } from '../utils/s3-helpers';
import type { AgentInput, AgentResult } from '../types';

const TRANSLATOR_SYSTEM_MSG =
    'Bạn là chuyên gia dịch thuật tài liệu khoa học và học thuật từ tiếng Anh sang tiếng Việt. ' +
    'Bạn dịch chính xác, tự nhiên, giữ nguyên mọi placeholder {{formula_X}}, {{figure_X}} và citation. ' +
    'Chỉ trả về bản dịch tiếng Việt dạng text thuần, không thêm gì khác.';

const CHUNK_MAX_CHARS = 7000;

export async function translatorAgent(input: AgentInput): Promise<AgentResult> {
    console.log(`🌐 [TranslatorAgent] Starting for job ${input.jobId}`);

    try {
        // Detect and split bibliography/references section so we do not translate it
        const refMatch = input.text.match(/\n+(?:#{1,4}\s+)?(references|bibliography|citations|tài liệu tham khảo)\b[\s\r\n]*\n+/i);
        let bodyText = input.text;
        let referencesText = '';
        if (refMatch && refMatch.index !== undefined) {
            bodyText = input.text.substring(0, refMatch.index);
            referencesText = input.text.substring(refMatch.index);
            console.log(`📚 [TranslatorAgent] Found references section at index ${refMatch.index} (${referencesText.length} chars). It will NOT be translated.`);
        }

        const chunks = chunkTextByParagraph(bodyText, CHUNK_MAX_CHARS);
        console.log(`🌐 [TranslatorAgent] Split into ${chunks.length} chunks`);

        const translatedParts: string[] = [];

        for (let i = 0; i < chunks.length; i++) {
            console.log(`🌐 [TranslatorAgent] Translating chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`);
            const prompt = buildTranslatorPrompt(chunks[i], input.fileName);
            let translated: string;
            try {
                translated = await processWithMistral(prompt, TRANSLATOR_SYSTEM_MSG);
            } catch (mistralErr) {
                console.warn(`⚠️ Mistral failed on chunk ${i + 1}, trying Groq:`, mistralErr);
                try {
                    translated = await processWithGroq(prompt, TRANSLATOR_SYSTEM_MSG);
                } catch (groqErr) {
                    console.warn(`⚠️ Groq failed on chunk ${i + 1}, falling back to Gemini:`, groqErr);
                    translated = await processWithGemini(prompt);
                }
            }
            translatedParts.push(translated);
        }

        let result = translatedParts.join('\n\n');
        if (referencesText) {
            result += '\n\n' + referencesText.trim();
        }

        console.log(`💾 [TranslatorAgent] Saving result to S3...`);
        const outputKey = await saveResultToS3(input.jobId, input.fileName, result, 'translator.txt');

        console.log(`✅ [TranslatorAgent] Completed: ${chunks.length} chunks, ${result.length} chars, saved to ${outputKey}`);
        return {
            agentName: 'translator',
            success: true,
            output: result,
            outputKey,
        };
    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [TranslatorAgent] Failed:`, errorMsg);
        return {
            agentName: 'translator',
            success: false,
            error: errorMsg,
        };
    }
}

export const handler = async (event: AgentInput): Promise<AgentResult> => translatorAgent(event);
