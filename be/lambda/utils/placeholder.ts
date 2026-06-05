// ============================================
// PLACEHOLDER EXTRACTION (Formulas, Figures & Citations)
// ============================================

import type { PlaceholderResult } from '../types';

export function extractPlaceholders(text: string): PlaceholderResult {
    // Bước 1: Tách công thức toán bằng Regex
    // Tiêu chí: phải có ký hiệu toán đặc trưng (=, ^, \LaTeX, ký hiệu Unicode)
    // KHÔNG match chỉ vì có dấu - hay / (tránh false positive với từ ghép, path)
    const FORMULA_REGEX = new RegExp(
        [
            // LaTeX inline: $...$
            '\\$[^$\\n]+\\$',
            // LaTeX \(...\) và \[...\]
            '\\\\\\(.+?\\\\\\)',
            '\\\\\\[.+?\\\\\\]',
            // Phương trình có dấu =: y = mx + b, E = mc^2, f(x) = x^2
            '[a-zA-Z_]\\w{0,10}\\s*=\\s*[\\w\\s()^+\\-*/]{2,30}',
            // Ký hiệu mũ ^: x^2, e^{-x}, n^k
            '\\w{1,8}\\^(?:\\{[^}]{1,10}\\}|\\w{1,8})',
            // Ký hiệu Unicode toán học (không gồm →): bất kỳ context ngắn
            '[\\w\\s()]{0,10}[∑∫∏√≤≥≠≈±×÷∞∂∇][\\w\\s()^]{0,15}',
            // → chỉ match khi cả hai bên là biến ngắn ≤3 ký tự (A→B, f→g, x→y²)
            // tránh match diagram flow như "→ Output Prompt" hay "Process → Next Step"
            '[a-zA-Z0-9_^]{1,3}\\s*→\\s*[a-zA-Z0-9_^]{1,3}',
        ].join('|'),
        'g'
    );

    const formulas = text.match(FORMULA_REGEX) || [];
    let formulaIndex = 0;
    const cleanedText = text.replace(FORMULA_REGEX, () => {
        formulaIndex++;
        return `{{formula_${formulaIndex}}}`;
    });

    // Bước 2: Tách figure/table/image references
    // Match both [fig 1] style and Fig. 1 / Figure 1 style (common in academic papers)
    const FIGURE_REGEX = /(?:\[(?:fig(?:ure)?|table|image)\s*\d+(?:[a-z])?\]|(?:fig(?:ure)?|table)\.?\s*\d+(?:[a-z])?)/gi;

    const figures = cleanedText.match(FIGURE_REGEX) || [];
    let figureIndex = 0;
    const cleanedTextWithFigs = cleanedText.replace(FIGURE_REGEX, () => {
        figureIndex++;
        return `{{figure_${figureIndex}}}`;
    });

    // Bước 3: Tách citations
    // Hỗ trợ 3 dạng:
    //   [1], [2], [1,2,3]         — numbered references
    //   [Smith, 2024]             — named references (bracket style)
    //   (Author, 2024)            — parenthetical references
    const CITATION_REGEX = /\[(\d+(?:\s*,\s*\d+)*)\]|\[([A-Z][a-zA-Zà-ỹÀ-Ỹ\s]+(?:\s+et\s+al\.?)?,?\s*\d{4}[a-z]?)\]|\(([A-Z][a-zA-Zà-ỹÀ-Ỹ\s]+(?:\s+et\s+al\.?)?,?\s*\d{4}[a-z]?)\)/g;

    const citations = cleanedTextWithFigs.match(CITATION_REGEX) || [];

    console.log(`🔍 Extracted ${formulas.length} formulas, ${figures.length} figures, ${citations.length} citations`);

    // Bước 4: Return kết quả
    return {
        cleanedText: cleanedTextWithFigs,
        formulas,
        figures,
        citations,
    };
}
