// ============================================
// AI PROVIDERS — Groq (Primary) & Gemini (Fallback)
// ============================================

import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { Mistral } from '@mistralai/mistralai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSecret, GROQ_SECRET_ARN, GEMINI_SECRET_ARN, DEEPSEEK_SECRET_ARN, MISTRAL_SECRET_ARN } from './aws-clients';

// ============================================
// MISTRAL
// ============================================
export async function processWithMistral(
    prompt: string,
    systemMessage: string
): Promise<string> {
    console.log('🤖 Calling Mistral API...');
    const apiKey = await getSecret(MISTRAL_SECRET_ARN);
    const client = new Mistral({ apiKey });

    const response = await client.chat.complete({
        model: 'open-mistral-7b',
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
        ],
        maxTokens: 4096,
        temperature: 0.3,
    });

    const result = response.choices?.[0]?.message?.content || '';
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    console.log(`✅ Mistral response: ${text.length} chars`);
    return text;
}

// ============================================
// DEEPSEEK — OpenAI-compatible API
// ============================================
export async function processWithDeepSeek(
    prompt: string,
    systemMessage: string
): Promise<string> {
    console.log('🤖 Calling DeepSeek API...');
    const apiKey = await getSecret(DEEPSEEK_SECRET_ARN);
    const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });

    const completion = await client.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
    });

    const result = completion.choices[0]?.message?.content || '';
    console.log(`✅ DeepSeek response: ${result.length} chars`);
    return result;
}

// ============================================
// GROQ — nhận prompt & system message từ caller
// ============================================
export async function processWithGroq(
    prompt: string,
    systemMessage: string
): Promise<string> {
    console.log('🤖 Calling Groq API...');
    const apiKey = await getSecret(GROQ_SECRET_ARN);
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.3,
    });

    const result = completion.choices[0]?.message?.content || '';
    console.log(`✅ Groq response: ${result.length} chars`);
    return result;
}

// ============================================
// GEMINI — nhận prompt từ caller
// ============================================
export async function processWithGemini(prompt: string): Promise<string> {
    console.log('🤖 Calling Gemini API (fallback)...');
    const apiKey = await getSecret(GEMINI_SECRET_ARN);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.log(`✅ Gemini response: ${response.length} chars`);
    return response;
}

// ============================================
// AI Processing with automatic Groq → Gemini fallback
// Caller tự build prompt bằng hàm buildXxxPrompt phù hợp
// ============================================
export async function processWithAI(
    prompt: string,
    systemMessage: string
): Promise<string> {
    try {
        return await processWithGroq(prompt, systemMessage);
    } catch (groqErr) {
        console.warn('⚠️ Groq failed, falling back to Gemini:', groqErr);
        return await processWithGemini(prompt);
    }
}

// Alias giữ backward-compat cho các caller cũ nếu có
export { processWithAI as callAIWithPrompt };

// ============================================
// GEMINI EMBEDDING
// ============================================
export async function getGeminiEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    console.log(`🤖 Generating Gemini embeddings for ${texts.length} texts...`);
    const apiKey = await getSecret(GEMINI_SECRET_ARN);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

    const batchSize = 50; // Use a conservative batch size to avoid payload/rate limits
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
        const chunk = texts.slice(i, i + batchSize);
        console.log(`📡 Fetching embedding batch ${Math.floor(i / batchSize) + 1} (${chunk.length} items)...`);
        const result = await model.batchEmbedContents({
            requests: chunk.map(t => ({
                content: { role: 'user', parts: [{ text: t }] },
                model: 'models/gemini-embedding-001',
            })),
        });

        if (!result.embeddings) {
            throw new Error('No embeddings returned from Gemini API batch request');
        }

        allEmbeddings.push(...result.embeddings.map(e => e.values));
    }

    return allEmbeddings;
}
