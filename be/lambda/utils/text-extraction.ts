// ============================================
// PDF TEXT EXTRACTION (pdf-parse + Textract fallback)
// ============================================

import { GetObjectCommand } from '@aws-sdk/client-s3';
import {
    StartDocumentTextDetectionCommand,
    GetDocumentTextDetectionCommand,
} from '@aws-sdk/client-textract';
import { s3Client, textractClient } from './aws-clients';

export async function extractTextFromS3(bucket: string, key: string): Promise<string> {
    console.log(`📄 Extracting text from s3://${bucket}/${key}`);

    // Tải PDF từ S3
    const s3Response = await s3Client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    if (!s3Response.Body) {
        throw new Error('Empty S3 response body');
    }

    // Chuyển stream thành Buffer
    const chunks: Uint8Array[] = [];
    const stream = s3Response.Body as AsyncIterable<Uint8Array>;
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);
    console.log(`✅ PDF downloaded: ${pdfBuffer.length} bytes`);

    // === Bước 1: Thử pdfjs-dist (nhanh, rẻ) ===
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfjsLib = require('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = false;

        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
        const pdf = await loadingTask.promise;
        const numPages: number = pdf.numPages;
        const pageTexts: string[] = [];

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            let pageText = '';
            for (const item of content.items as Array<{ str: string; hasEOL: boolean }>) {
                pageText += item.str;
                if (item.hasEOL) pageText += '\n';
                else if (item.str) pageText += ' ';
            }
            pageText = pageText.trim();
            if (pageText) pageTexts.push(pageText);
        }

        const text = pageTexts.join('\n\n').trim().replace(/  +/g, ' ').replace(/-\n(\w)/g, '$1');
        if (text && text.length > 100) {
            console.log(`✅ pdfjs-dist succeeded: ${text.length} chars, ${numPages} pages`);
            return text;
        }
        console.log(`pdfjs-dist returned only ${text.length} chars, falling back to Textract`);
    } catch (err) {
        console.warn('⚠️ pdfjs-dist failed, falling back to Textract:', err);
    }

    // === Bước 2: Fallback sang Amazon Textract OCR (async - hỗ trợ PDF) ===
    console.log('🔍 Calling Amazon Textract (async)...');
    try {
        // Bắt đầu job Textract bất đồng bộ
        const startCommand = new StartDocumentTextDetectionCommand({
            DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
        });
        const startResponse = await textractClient.send(startCommand);
        const textractJobId = startResponse.JobId;
        if (!textractJobId) throw new Error('Textract did not return a JobId');
        console.log(`🔄 Textract JobId: ${textractJobId}`);

        // Polling cho đến khi job hoàn thành (tối đa ~90 giây)
        const maxAttempts = 18;
        const pollIntervalMs = 5000;
        let extractedText = '';

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
            const getCommand = new GetDocumentTextDetectionCommand({ JobId: textractJobId });
            const getResponse = await textractClient.send(getCommand);

            if (getResponse.JobStatus === 'SUCCEEDED') {
                const blocks = getResponse.Blocks || [];
                const lineBlocks = blocks.filter(
                    block => block.BlockType === 'LINE' && block.Geometry?.BoundingBox
                );

                // Nhóm các dòng theo trang để giữ nguyên cấu trúc phân trang
                const pageGroups: { [pageNum: number]: typeof lineBlocks } = {};
                for (const block of lineBlocks) {
                    const pageNum = block.Page || 1;
                    if (!pageGroups[pageNum]) {
                        pageGroups[pageNum] = [];
                    }
                    pageGroups[pageNum].push(block);
                }

                // Sắp xếp trang tăng dần
                const sortedPageNums = Object.keys(pageGroups)
                    .map(Number)
                    .sort((a, b) => a - b);
                
                const pageTexts: string[] = [];

                for (const pageNum of sortedPageNums) {
                    const pageLines = pageGroups[pageNum];
                    
                    // Phân tích xem trang này có cấu trúc 2 cột hay không
                    let centerCrossers = 0;
                    let normalLines = 0;
                    for (const line of pageLines) {
                        const box = line.Geometry!.BoundingBox!;
                        if (box.Width && box.Width > 0.15) { // Chỉ xét dòng dài đáng kể
                            normalLines++;
                            if (box.Left !== undefined && box.Left < 0.45 && (box.Left + box.Width) > 0.55) {
                                centerCrossers++;
                            }
                        }
                    }

                    // Tỷ lệ dòng băng qua giữa < 20% thì coi là trang 2 cột
                    const isTwoColumn = normalLines > 0 && (centerCrossers / normalLines) < 0.20;
                    console.log(`[Textract] Page ${pageNum} layout: normalLines=${normalLines}, centerCrossers=${centerCrossers}, isTwoColumn=${isTwoColumn}`);

                    // Hàm helper để gộp dòng kèm phát hiện ngắt đoạn
                    const joinLinesWithParagraphBreaks = (lines: typeof lineBlocks): string => {
                        if (lines.length === 0) return '';
                        let result = lines[0].Text || '';

                        for (let i = 1; i < lines.length; i++) {
                            const prev = lines[i - 1];
                            const curr = lines[i];
                            const prevBox = prev.Geometry!.BoundingBox!;
                            const currBox = curr.Geometry!.BoundingBox!;

                            const prevBottom = (prevBox.Top || 0) + (prevBox.Height || 0);
                            const gap = (currBox.Top || 0) - prevBottom;
                            const threshold = (prevBox.Height || 0) * 1.8;

                            const prevText = prev.Text || '';
                            const currText = curr.Text || '';

                            if (gap > threshold || gap > 0.02) {
                                // Khoảng cách lớn -> Ngắt đoạn mới
                                result += '\n\n' + currText;
                            } else {
                                // Khoảng cách nhỏ -> Nối dòng liên tục
                                if (prevText.endsWith('-')) {
                                    // Loại bỏ gạch nối nếu xuống dòng ngắt từ
                                    result = result.slice(0, -1) + currText;
                                } else {
                                    result += ' ' + currText;
                                }
                            }
                        }
                        return result;
                    };

                    if (isTwoColumn) {
                        // Tách dòng thành cột trái và cột phải dựa trên tâm dòng (centerX)
                        const leftCol: typeof lineBlocks = [];
                        const rightCol: typeof lineBlocks = [];

                        for (const line of pageLines) {
                            const box = line.Geometry!.BoundingBox!;
                            const Left = box.Left || 0;
                            const Width = box.Width || 0;
                            const centerX = Left + Width / 2;

                            if (centerX < 0.5) {
                                leftCol.push(line);
                            } else {
                                rightCol.push(line);
                            }
                        }

                        // Sắp xếp các cột theo tọa độ Y (Top) tăng dần
                        leftCol.sort((a, b) => (a.Geometry!.BoundingBox!.Top || 0) - (b.Geometry!.BoundingBox!.Top || 0));
                        rightCol.sort((a, b) => (a.Geometry!.BoundingBox!.Top || 0) - (b.Geometry!.BoundingBox!.Top || 0));

                        const leftText = joinLinesWithParagraphBreaks(leftCol);
                        const rightText = joinLinesWithParagraphBreaks(rightCol);

                        if (leftText && rightText) {
                            pageTexts.push(leftText + '\n\n' + rightText);
                        } else {
                            pageTexts.push(leftText || rightText);
                        }
                    } else {
                        // Trang 1 cột: Chỉ cần sắp xếp theo tọa độ Y (Top) tăng dần
                        const sortedLines = [...pageLines].sort(
                            (a, b) => (a.Geometry!.BoundingBox!.Top || 0) - (b.Geometry!.BoundingBox!.Top || 0)
                        );
                        pageTexts.push(joinLinesWithParagraphBreaks(sortedLines));
                    }
                }

                extractedText = pageTexts.join('\n\n').replace(/  +/g, ' ');
                console.log(`✅ Textract succeeded (attempt ${attempt}): ${extractedText.length} chars`);
                break;
            } else if (getResponse.JobStatus === 'FAILED') {
                throw new Error(`Textract job failed: ${getResponse.StatusMessage}`);
            }
            console.log(`⏳ Textract status: ${getResponse.JobStatus} (attempt ${attempt}/${maxAttempts})`);
        }

        if (extractedText && extractedText.length > 50) {
            return extractedText;
        } else {
            throw new Error('Textract returned insufficient text or timed out');
        }
    } catch (textractErr) {
        console.error('❌ Textract also failed:', textractErr);
        // Fallback cuối cùng: placeholder để job không bị fail hoàn toàn
        return `[PDF extraction failed - file: ${key}]`;
    }
}
