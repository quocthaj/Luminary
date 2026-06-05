// ============================================
// CITATION AGENT (Pure Regex — No AI)
// Nhiệm vụ: Phân loại và đếm trích dẫn
// ============================================

import { saveResultToS3 } from '../utils/s3-helpers';
import type { AgentInput, AgentResult } from '../types';

// ---- Types ----

type CitationType = 'numbered' | 'author-year-bracket' | 'author-year-paren' | 'unknown';

interface CitationEntry {
    raw: string;
    type: CitationType;
    count: number;
    ids?: number[];     // cho numbered citations: [1,2,3] → [1,2,3]
    author?: string;    // cho author-year
    year?: number;
    etAl?: boolean;
}

// ---- Helpers ----

function classifyCitation(raw: string): Omit<CitationEntry, 'raw' | 'count'> {
    // [1] hoặc [1,2,3]
    const numberedMatch = raw.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (numberedMatch) {
        const ids = numberedMatch[1].split(',').map(n => parseInt(n.trim(), 10));
        return { type: 'numbered', ids };
    }

    // [Smith, 2024] hoặc [Smith et al., 2024a]
    const bracketMatch = raw.match(/^\[([A-Z][a-zA-Zà-ỹÀ-Ỹ\s]+?)(\s+et\s+al\.?)?,?\s*(\d{4}[a-z]?)\]$/);
    if (bracketMatch) {
        return {
            type: 'author-year-bracket',
            author: bracketMatch[1].trim(),
            year: parseInt(bracketMatch[3], 10),
            etAl: !!bracketMatch[2],
        };
    }

    // (Smith, 2024) hoặc (Smith et al., 2024)
    const parenMatch = raw.match(/^\(([A-Z][a-zA-Zà-ỹÀ-Ỹ\s]+?)(\s+et\s+al\.?)?,?\s*(\d{4}[a-z]?)\)$/);
    if (parenMatch) {
        return {
            type: 'author-year-paren',
            author: parenMatch[1].trim(),
            year: parseInt(parenMatch[3], 10),
            etAl: !!parenMatch[2],
        };
    }

    return { type: 'unknown' };
}

function countOccurrences(text: string, raw: string): number {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (text.match(new RegExp(escaped, 'g')) || []).length;
}

// ---- Agent ----

export async function citationAgent(input: AgentInput): Promise<AgentResult> {
    console.log(`📚 [CitationAgent] Starting for job ${input.jobId}`);

    try {
        const citations = input.citations || [];

        if (citations.length === 0) {
            console.log(`ℹ️ [CitationAgent] No citations to process, skipping`);
            return { agentName: 'citation', success: true, output: '[]' };
        }

        console.log(`📚 [CitationAgent] Processing ${citations.length} citations (pure regex)`);

        // Deduplicate raw strings trước khi process
        const unique = [...new Set(citations)];

        const results: CitationEntry[] = unique.map(raw => ({
            raw,
            count: countOccurrences(input.text, raw),
            ...classifyCitation(raw),
        }));

        // Sort: numbered trước, rồi author-year, rồi unknown; trong mỗi nhóm sort theo count giảm dần
        const ORDER: Record<CitationType, number> = {
            'numbered': 0,
            'author-year-bracket': 1,
            'author-year-paren': 2,
            'unknown': 3,
        };
        results.sort((a, b) => ORDER[a.type] - ORDER[b.type] || b.count - a.count);

        const output = JSON.stringify(results, null, 2);

        console.log(`💾 [CitationAgent] Saving result to S3...`);
        const outputKey = await saveResultToS3(input.jobId, input.fileName, output, 'citation.json');

        console.log(`✅ [CitationAgent] Completed: ${results.length} unique citations, saved to ${outputKey}`);
        return { agentName: 'citation', success: true, output, outputKey };

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`❌ [CitationAgent] Failed:`, errorMsg);
        return { agentName: 'citation', success: false, error: errorMsg };
    }
}

export const handler = async (event: AgentInput): Promise<AgentResult> => citationAgent(event);
