
// PROMPT BUILDER

const DEFAULT_MAX_CHARS = 12000;

/**
 * Cắt text nếu vượt quá giới hạn ký tự.
 * Tất cả các hàm buildXxxPrompt đều dùng chung hàm này.
 */
export function truncateText(text: string, maxChars: number = DEFAULT_MAX_CHARS): string {
    if (text.length <= maxChars) return text;
    return text.slice(0, maxChars) + '\n\n[... nội dung bị cắt bớt do giới hạn độ dài ...]';
}

// ============================================
// CHUNKING
// ============================================

/**
 * Gom paragraphs thành chunks không vượt quá maxChars.
 * Một paragraph đơn lẻ dài hơn maxChars vẫn được giữ nguyên (không thể tách nhỏ hơn).
 */
function splitParagraphToSubChunks(para: string, maxChars: number): string[] {
    const sentences = para.split(/(?<=\. )/);
    const subChunks: string[] = [];
    let current = '';

    for (const sentence of sentences) {
        if (current.length > 0 && current.length + sentence.length > maxChars) {
            subChunks.push(current.trimEnd());
            current = sentence;
        } else {
            current += sentence;
        }
    }

    if (current.trim().length > 0) subChunks.push(current.trimEnd());
    return subChunks;
}

export function chunkTextByParagraph(text: string, maxChars: number = 7000): string[] {
    const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
    const chunks: string[] = [];
    let current: string[] = [];
    let currentLen = 0;

    for (const para of paragraphs) {
        if (para.length > maxChars) {
            // Paragraph quá dài → chia theo câu trước khi gom
            if (current.length > 0) {
                chunks.push(current.join('\n\n'));
                current = [];
                currentLen = 0;
            }
            chunks.push(...splitParagraphToSubChunks(para, maxChars));
            continue;
        }

        // +2 cho '\n\n' separator khi join vào chunk hiện tại
        if (currentLen > 0 && currentLen + 2 + para.length > maxChars) {
            chunks.push(current.join('\n\n'));
            current = [para];
            currentLen = para.length;
        } else {
            current.push(para);
            currentLen += currentLen > 0 ? 2 + para.length : para.length;
        }
    }

    if (current.length > 0) {
        chunks.push(current.join('\n\n'));
    }

    return chunks;
}

// ============================================
// TRANSLATOR AGENT PROMPT
// Chuyên gia dịch thuật tài liệu khoa học EN → VI
// ============================================
export function buildTranslatorPrompt(text: string, fileName: string): string {
    const inputText = text; // text đã được chunk sẵn, không cần truncate

    return `Bạn là chuyên gia dịch thuật tài liệu, bài báo nghiên cứu khoa học và học thuật từ tiếng Anh sang tiếng Việt.

## Nhiệm vụ
Dịch toàn bộ nội dung tài liệu dưới đây từ tiếng Anh sang tiếng Việt một cách chính xác, tự nhiên và giữ nguyên ý nghĩa khoa học.

## Quy tắc BẮT BUỘC
1. **Giữ nguyên placeholder** — Tất cả các placeholder dạng {{formula_1}}, {{formula_2}}, {{figure_1}}, {{figure_2}},... phải được giữ nguyên y hệt, KHÔNG dịch, KHÔNG thay đổi.
2. **Giữ nguyên citation** — Các trích dẫn dạng [1], [2], (Author, 2024), Điều X, Khoản Y phải được giữ nguyên vị trí và nội dung.
3. **Thuật ngữ chuyên ngành** — Các thuật ngữ khoa học/pháp lý hoặc liên quan với các lĩnh vực khác nên dịch chính xác. Nếu thuật ngữ chưa có bản dịch phổ biến, giữ nguyên tiếng Anh kèm chú thích tiếng Việt trong ngoặc.
4. **Output thuần text** — Chỉ trả về bản dịch tiếng Việt dạng text thuần (plain text).
KHÔNG sử dụng Markdown, KHÔNG thêm tiêu đề, KHÔNG thêm ghi chú của dịch giả, 
KHÔNG thêm các dòng như "(Tiếp tục dịch...)", "(Hết phần...)", "(Xem tiếp...)" hay bất kỳ chú thích nào khác. 
Dịch TOÀN BỘ nội dung được cung cấp, không bỏ sót, không rút gọn.
5. **Tái cấu trúc đoạn văn** — Gom các dòng bị ngắt giữa chừng do format PDF thành đoạn văn hoàn chỉnh, liền mạch. 
Một ý/chủ đề → một đoạn văn. KHÔNG giữ nguyên cách ngắt dòng tùy tiện của PDF gốc.

## Tên file gốc
${fileName}

## Nội dung cần dịch
${inputText}

## LƯU Ý QUAN TRỌNG
- Text đầu vào có thể bị ngắt dòng giữa chừng do extract từ PDF 2 cột — hãy tự nhận biết và gom lại thành câu/đoạn hoàn chỉnh trước khi dịch.
- Ví dụ: "intelli-\ngent sys-\ntems" → dịch thành "hệ thống thông minh" (1 cụm từ hoàn chỉnh).
- Output phải là văn xuôi tự nhiên, KHÔNG phải từng dòng ngắn lẻ tẻ.
## Bản dịch tiếng Việt`;
}

// ============================================
// LATEX AGENT PROMPT
// Xử lý và chuẩn hóa công thức toán học
// ============================================
export function buildLatexPrompt(formulas: string[]): string {
    const formulaList = formulas
        .map((f, i) => `{{formula_${i + 1}}}: ${f}`)
        .join('\n');
    const inputText = truncateText(formulaList);

    return `Bạn là chuyên gia toán học và LaTeX. Nhiệm vụ của bạn là xử lý danh sách công thức thô được trích xuất từ tài liệu PDF.

## Nhiệm vụ
Với mỗi công thức dưới đây, hãy:
1. Kiểm tra và sửa cú pháp nếu bị lỗi do OCR
2. Chuyển đổi sang cú pháp LaTeX chuẩn (bọc trong $...$ hoặc $$...$$)
3. Giữ nguyên placeholder key ({{formula_1}}, {{formula_2}},...)

## Quy tắc BẮT BUỘC
1. **Output là JSON** — Trả về đúng 1 JSON array, KHÔNG thêm text giải thích.
2. **Mỗi phần tử** có dạng: {"key": "{{formula_1}}", "original": "...", "latex": "..."}
3. **Nếu công thức không hợp lệ** hoặc không phải công thức toán, đặt latex = null.
4. **KHÔNG bịa thêm** công thức không có trong danh sách.

## Danh sách công thức (${formulas.length} công thức)
${inputText}

## JSON Output`;
}

// ============================================
// DIAGRAM AGENT PROMPT
// Mô tả hình ảnh/biểu đồ/bảng từ tham chiếu
// ============================================
export function buildDiagramPrompt(figures: string[]): string {
    const figureList = figures
        .map((f, i) => `{{figure_${i + 1}}}: ${f}`)
        .join('\n');
    const inputText = truncateText(figureList);

    return `Bạn là chuyên gia phân tích tài liệu khoa học. Nhiệm vụ của bạn là mô tả các hình ảnh, biểu đồ và bảng được tham chiếu trong tài liệu PDF.

## Nhiệm vụ
Với mỗi tham chiếu figure/table/image dưới đây, hãy:
1. Xác định loại (hình ảnh, biểu đồ, bảng, sơ đồ,...)
2. Tạo mô tả ngắn gọn bằng tiếng Việt dựa trên ngữ cảnh tham chiếu
3. Đề xuất alt-text phù hợp cho accessibility
4. Giữ nguyên placeholder key ({{figure_1}}, {{figure_2}},...)

## Quy tắc BẮT BUỘC
1. **Output là JSON** — Trả về đúng 1 JSON array, KHÔNG thêm text giải thích.
2. **Mỗi phần tử** có dạng: {"key": "{{figure_1}}", "original": "...", "type": "figure|table|diagram", "description": "...", "altText": "..."}
3. **Nếu không xác định được loại**, đặt type = "unknown".
4. **KHÔNG bịa thêm** tham chiếu không có trong danh sách.

## Danh sách tham chiếu (${figures.length} tham chiếu)
${inputText}

## JSON Output`;
}

// ============================================
// CITATION AGENT PROMPT
// Phân tích và chuẩn hóa danh sách trích dẫn
// ============================================
export function buildCitationPrompt(citations: string[]): string {
    const citationList = citations
        .map((c, i) => `${i + 1}. ${c}`)
        .join('\n');
    const inputText = truncateText(citationList);

    return `Bạn là chuyên gia thư mục học (bibliographer) và trích dẫn tài liệu khoa học.

## Nhiệm vụ
Phân tích danh sách trích dẫn thô dưới đây (được trích xuất tự động từ PDF bằng regex). Với mỗi trích dẫn, hãy:
1. Xác định loại: numbered ([1]), named ([Smith, 2024]), parenthetical ((Author, 2024)), hoặc legal (Điều X, Khoản Y)
2. Chuẩn hóa định dạng theo chuẩn phổ biến nhất (APA, IEEE, hoặc pháp lý Việt Nam)
3. Gộp các trích dẫn trùng lặp (ví dụ: [1] xuất hiện 5 lần → chỉ giữ 1)

## Quy tắc BẮT BUỘC
1. **Output là JSON** — Trả về đúng 1 JSON array, KHÔNG thêm text giải thích.
2. **Mỗi phần tử** có dạng: {"original": "[1]", "type": "numbered|named|parenthetical|legal", "normalized": "...", "count": 3}
3. **count** là số lần trích dẫn xuất hiện trong tài liệu.
4. **KHÔNG bịa thêm** trích dẫn không có trong danh sách.

## Danh sách trích dẫn (${citations.length} trích dẫn, có thể trùng lặp)
${inputText}

## JSON Output`;
}
