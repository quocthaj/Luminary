// ============================================
// HANDLER: RAG Chat Assistant (Agentic RAG)
// ============================================

import { QdrantClient } from '@qdrant/js-client-rest';
import { getJobItem } from '../utils/dynamodb-helpers';
import { getSecret, GEMINI_SECRET_ARN, GROQ_SECRET_ARN } from '../utils/aws-clients';
import { getEmbeddingsBatch } from '../utils/ai-providers';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

interface ChatInput {
  jobId: string;
  userId: string;
  message: string;
}

interface ChatOutput {
  answer: string;
}

const COLLECTION_NAME = 'vietai-scholar-chunks';
let qdrantClientInstance: QdrantClient | null = null;
let geminiGenAIInstance: GoogleGenerativeAI | null = null;

async function getQdrantClient(): Promise<QdrantClient> {
  if (!qdrantClientInstance) {
    const qdrantSecretArn = process.env.QDRANT_SECRET_ARN || '';
    if (!qdrantSecretArn) {
      throw new Error('QDRANT_SECRET_ARN environment variable is not defined');
    }
    const qdrantSecretStr = await getSecret(qdrantSecretArn);
    const qdrantConfig = JSON.parse(qdrantSecretStr);
    const qdrantUrl = qdrantConfig.url;
    const qdrantApiKey = qdrantConfig.apiKey;

    if (!qdrantUrl) {
      throw new Error('Qdrant URL is not defined in secret config');
    }

    console.log(`📡 [chat] Connecting to Qdrant at: ${qdrantUrl}`);
    qdrantClientInstance = new QdrantClient({
      url: qdrantUrl,
      apiKey: qdrantApiKey,
    });
  }
  return qdrantClientInstance;
}

async function getGeminiClient(): Promise<GoogleGenerativeAI> {
  if (!geminiGenAIInstance) {
    const geminiSecretStr = await getSecret(GEMINI_SECRET_ARN);
    geminiGenAIInstance = new GoogleGenerativeAI(geminiSecretStr);
  }
  return geminiGenAIInstance;
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

async function vectorSearch(jobId: string, userId: string, query: string): Promise<any[]> {
  const [embedding] = await getEmbeddingsBatch([query], 'search_query');
  if (!embedding) {
    throw new Error('Failed to generate embedding for the search query');
  }

  const qdrantClient = await getQdrantClient();
  const searchResults = await qdrantClient.search(COLLECTION_NAME, {
    vector: embedding,
    filter: {
      must: [
        { key: 'userId', match: { value: userId } },
        { key: 'jobId', match: { value: jobId } }
      ]
    },
    limit: 4,
  });

  return searchResults.map((hit) => {
    const payload = hit.payload || {};
    return {
      chunkIndex: payload.chunkIndex ?? 'unknown',
      text_original: payload.text_original ?? '',
      text_translated: payload.text_translated ?? ''
    };
  });
}

async function fetchAdjacentParagraphs(
  jobId: string,
  chunkIndex: number,
  direction: 'prev' | 'next' | 'both',
  count: number
): Promise<any[]> {
  const qdrantClient = await getQdrantClient();
  const targetIndices: number[] = [];

  const capCount = Math.min(count, 3); // Giới hạn tối đa 3 đoạn lân cận để tránh quá tải token

  if (direction === 'prev' || direction === 'both') {
    for (let i = 1; i <= capCount; i++) {
      if (chunkIndex - i >= 0) {
        targetIndices.push(chunkIndex - i);
      }
    }
  }
  if (direction === 'next' || direction === 'both') {
    for (let i = 1; i <= capCount; i++) {
      targetIndices.push(chunkIndex + i);
    }
  }

  if (targetIndices.length === 0) return [];

  const response = await qdrantClient.scroll(COLLECTION_NAME, {
    filter: {
      must: [
        { key: 'jobId', match: { value: jobId } },
        { key: 'chunkIndex', match: { any: targetIndices } }
      ]
    },
    limit: targetIndices.length,
    with_payload: true,
    with_vector: false
  });

  return response.points.map(point => ({
    chunkIndex: point.payload?.chunkIndex as number,
    text_original: point.payload?.text_original as string,
    text_translated: point.payload?.text_translated as string
  })).sort((a, b) => a.chunkIndex - b.chunkIndex);
}

async function readExecutiveSummary(jobItem: Record<string, any>): Promise<any> {
  const summaryAttr = jobItem.summary?.M;
  if (!summaryAttr) {
    return { error: 'Không tìm thấy bản tóm tắt Executive Summary của tài liệu này.' };
  }

  return {
    tldr: summaryAttr.tldr?.S || '',
    keyContributions: summaryAttr.keyContributions?.L?.map((item: any) => item.S || '') || [],
    methodology: summaryAttr.methodology?.S || '',
    limitations: summaryAttr.limitations?.S || ''
  };
}

async function searchExternalPapers(query: string, limit: number = 5): Promise<any[]> {
  try {
    const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
    url.searchParams.set('query', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('fields', 'title,authors,year,abstract,url,openAccessPdf');

    console.log(`🔍 [chat] searchExternalPapers querying Semantic Scholar: ${query}`);
    const headers: Record<string, string> = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers['x-api-key'] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }
    const res = await fetch(url.toString(), {
      headers,
      signal: AbortSignal.timeout(6000), // Timeout 6 seconds
    });
    if (!res.ok) {
      throw new Error(`Semantic Scholar returned status ${res.status}`);
    }
    const data: any = await res.json();
    return (data.data || []).map((paper: any) => ({
      paperId: paper.paperId,
      title: paper.title || 'Untitled',
      authors: (paper.authors || []).map((a: any) => a.name),
      year: paper.year || null,
      abstract: paper.abstract || null,
      url: paper.url || null,
      pdfUrl: paper.openAccessPdf?.url || null
    }));
  } catch (err: any) {
    console.warn(`⚠️ [chat] Semantic Scholar search failed, trying fallback to OpenAlex:`, err.message || String(err));
    try {
      console.log(`🔍 [chat] searchExternalPapers querying OpenAlex: ${query}`);
      const url = new URL('https://api.openalex.org/works');
      url.searchParams.set('search', query);
      url.searchParams.set('per_page', String(limit));
      url.searchParams.set('mailto', 'hello@vietai.org');

      const res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(6000), // Timeout 6 seconds
      });
      if (!res.ok) {
        throw new Error(`OpenAlex returned status ${res.status}`);
      }
      const data: any = await res.json();
      return (data.results || []).map((work: any) => {
        let abstract = null;
        if (work.abstract_inverted_index) {
          const words: string[] = [];
          for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
            if (Array.isArray(positions)) {
              positions.forEach((pos: any) => {
                words[pos] = word;
              });
            }
          }
          abstract = words.join(' ').trim();
        }

        const authors = (work.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean);
        const url = work.doi || work.primary_location?.landing_page_url || work.id || null;
        const pdfUrl = work.primary_location?.pdf_url || work.open_access?.oa_url || null;

        return {
          paperId: work.id ? work.id.split('/').pop() : 'W-unknown',
          title: work.title || 'Untitled',
          authors,
          year: work.publication_year || null,
          abstract: abstract ? (abstract.length > 300 ? abstract.slice(0, 300) + '...' : abstract) : null,
          url,
          pdfUrl
        };
      });
    } catch (fallbackErr: any) {
      console.error('❌ [chat] Both Semantic Scholar and OpenAlex failed:', fallbackErr);
      return [{ error: `Lỗi kết nối học thuật: ${fallbackErr.message || String(fallbackErr)}` }];
    }
  }
}

async function generateAnswer(prompt: string): Promise<string> {
  // Primary: Gemini (non-tool-use fallback)
  try {
    const geminiKey = await getSecret(GEMINI_SECRET_ARN);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err: any) {
    const status = err?.status || err?.statusCode;
    const message = err?.message || '';
    
    const isTransientError = 
      status === 429 || 
      status === 500 || 
      status === 502 || 
      status === 503 || 
      status === 504 ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('fetch failed') ||
      err?.name === 'AbortError';

    if (isTransientError) {
      console.warn(`⚠️ Gemini failed (status: ${status}, msg: ${message}). Falling back to Groq...`);
    } else {
      throw err;
    }
  }

  // Fallback: Groq
  const groqKey = await getSecret(GROQ_SECRET_ARN);
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${groqKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    }),
    signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq API failed: ${res.status} - ${errText}`);
  }
  const data: any = await res.json();
  return data.choices[0].message.content;
}

// ============================================
// CHAT HANDLER
// ============================================

export const handleChatJob = async (event: ChatInput): Promise<ChatOutput> => {
  const { jobId, userId, message } = event;
  console.log(`💬 [chat] Processing RAG chat for job=${jobId}, user=${userId}`);

  if (!message || message.trim().length === 0) {
    return { answer: 'Vui lòng cung cấp nội dung câu hỏi.' };
  }

  // 1. Fetch job from DynamoDB and check ownership
  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S || 'guest';
  if (jobOwnerId !== 'guest' && jobOwnerId !== userId) {
    console.warn(`⚠️ [chat] User ${userId} unauthorized access to job ${jobId} owned by ${jobOwnerId}`);
    throw new Error('FORBIDDEN');
  }

  const totalStart = performance.now();

  // 2. Define Tools JSON Schema
  // 2. Define Tools JSON Schema
  const tools: any[] = [
    {
      functionDeclarations: [
        {
          name: 'vectorSearch',
          description: 'Tìm kiếm ngữ cảnh tương đồng từ bài báo dựa trên câu hỏi chi tiết, cục bộ.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              query: { type: SchemaType.STRING, description: 'Câu truy vấn tiếng Anh để tìm kiếm vector' }
            },
            required: ['query']
          }
        },
        {
          name: 'fetchAdjacentParagraphs',
          description: 'Lấy thêm các đoạn văn liền trước hoặc liền sau của một đoạn văn cụ thể để bù đắp ngữ cảnh bị đứt gãy.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              chunkIndex: { type: SchemaType.INTEGER, description: 'Chỉ số đoạn văn hiện tại' },
              direction: { type: SchemaType.STRING, enum: ['prev', 'next', 'both'], description: 'Hướng lấy các đoạn văn lân cận' },
              count: { type: SchemaType.INTEGER, description: 'Số lượng đoạn văn cần lấy' }
            },
            required: ['chunkIndex', 'direction', 'count']
          }
        },
        {
          name: 'readExecutiveSummary',
          description: 'Đọc bản tóm tắt toàn bộ tài liệu bao gồm tldr, key contributions, methodology, limitations cho câu hỏi tổng quan, toàn cục.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {}
          }
        },
        {
          name: 'searchExternalPapers',
          description: 'Tìm kiếm các nghiên cứu hoặc bài báo khoa học liên quan từ Semantic Scholar dựa trên từ khóa hoặc chủ đề nghiên cứu.',
          parameters: {
            type: SchemaType.OBJECT,
            properties: {
              query: { type: SchemaType.STRING, description: 'Từ khóa tìm kiếm (bằng tiếng Anh)' },
              limit: { type: SchemaType.INTEGER, description: 'Số lượng bài báo tối đa cần lấy (mặc định là 5)' }
            },
            required: ['query']
          }
        }
      ]
    }
  ];

  // 3. Initialize Gemini Client and Model with Tools
  const geminiStart = performance.now();
  let answer = 'Không có phản hồi từ trợ lý học thuật.';

  try {
    const genAI = await getGeminiClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `Bạn là trợ lý AI học thuật song ngữ. Nhiệm vụ của bạn là hỗ trợ người dùng đọc và hiểu tài liệu khoa học song ngữ.
Bạn có quyền truy cập vào các công cụ tìm kiếm ngữ cảnh cục bộ (vectorSearch), lấy thêm đoạn văn lân cận để tránh đứt gãy ngữ nghĩa (fetchAdjacentParagraphs), đọc bản tóm tắt toàn diện của bài báo (readExecutiveSummary), hoặc tìm kiếm bài báo liên quan từ nguồn bên ngoài (searchExternalPapers).

Quy tắc làm việc:
1. Đánh giá câu hỏi để quyết định xem cần gọi công cụ nào. Ví dụ:
   - Các câu hỏi chi tiết hoặc tìm thông tin cụ thể nên dùng 'vectorSearch'.
   - Nếu ngữ cảnh tìm được từ 'vectorSearch' bị ngắt quãng ở đầu hoặc cuối câu, hãy dùng 'fetchAdjacentParagraphs' để lấy thêm đoạn liền kề.
   - Các câu hỏi bao quát toàn tài liệu (như tóm tắt, đóng góp chính, hạn chế, phương pháp) nên sử dụng 'readExecutiveSummary'.
   - Khi người dùng muốn tìm các bài báo liên quan, mở rộng tài liệu tham khảo, hoặc tra cứu thêm thông tin ngoài tài liệu hiện tại, hãy sử dụng 'searchExternalPapers'. Bạn có thể tự động bóc tách từ khóa/chủ đề từ câu hỏi hoặc từ tài liệu hiện tại để đưa vào tham số 'query'.
2. Trình bày kết quả bài báo ngoài rõ ràng dưới dạng danh sách Markdown. Với mỗi bài báo ngoài, phải hiển thị:
   - **[Tiêu đề bài viết](url của bài viết)** (Luôn đính kèm link Semantic Scholar URL)
   - Tác giả, năm xuất bản
   - Tóm tắt ngắn (1-2 câu dịch sang tiếng Việt)
   - [Đọc PDF gốc](pdfUrl) (nếu pdfUrl tồn tại)
3. Đính kèm liên kết trích dẫn ngược dưới dạng [Đoạn X] (với X là chunkIndex) trỏ đúng về nguồn của thông tin đó. Ví dụ: "...như đã được thảo luận [Đoạn 5]".
4. Phản hồi hoàn toàn bằng tiếng Việt thân thiện và chuyên nghiệp.`,
      tools
    });

    let contents: any[] = [{ role: 'user', parts: [{ text: message }] }];
    let loopCount = 0;
    const MAX_LOOPS = 3;

    while (loopCount < MAX_LOOPS) {
      console.log(`🤖 [chat] Executing reasoning loop ${loopCount + 1}/${MAX_LOOPS}...`);
      const result = await model.generateContent({ contents });
      const candidate = result.response.candidates?.[0];
      const content = candidate?.content;

      if (!content) {
        break;
      }

      // Check for safety block
      if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
        answer = 'Câu trả lời bị chặn bởi bộ lọc an toàn hoặc bản quyền của mô hình AI.';
        break;
      }

      contents.push(content);

      const functionCalls = result.response.functionCalls();
      if (!functionCalls || functionCalls.length === 0) {
        // No more tool calls needed, this is the final text answer
        answer = result.response.text() || answer;
        break;
      }

      // Execute tool calls in parallel/sequence
      const toolResponseParts: any[] = [];
      for (const call of functionCalls) {
        console.log(`⚙️ [chat] Tool call requested: ${call.name} with args:`, call.args);
        let callResult;
        const args = call.args as any;
        try {
          if (call.name === 'vectorSearch') {
            callResult = await vectorSearch(jobId, userId, args.query as string);
          } else if (call.name === 'fetchAdjacentParagraphs') {
            callResult = await fetchAdjacentParagraphs(
              jobId,
              Number(args.chunkIndex),
              args.direction as any,
              Number(args.count)
            );
          } else if (call.name === 'readExecutiveSummary') {
            callResult = await readExecutiveSummary(jobItem);
          } else if (call.name === 'searchExternalPapers') {
            callResult = await searchExternalPapers(
              args.query as string,
              args.limit ? Number(args.limit) : 5
            );
          } else {
            callResult = { error: `Unknown tool: ${call.name}` };
          }
        } catch (err: any) {
          console.error(`❌ [chat] Tool ${call.name} execution failed:`, err);
          callResult = { error: err.message || String(err) };
        }

        toolResponseParts.push({
          functionResponse: {
            name: call.name,
            response: { result: callResult }
          }
        });
      }

      contents.push({ role: 'user', parts: toolResponseParts });
      loopCount++;
    }

  } catch (err: any) {
    console.warn('⚠️ [chat] Gemini agentic loop failed or hit 429. Running fallback RAG chain...', err);
    try {
      // 1. Retrieve context
      const relevantChunks = await vectorSearch(jobId, userId, message).catch(vErr => {
        console.error('⚠️ [chat] Fallback vectorSearch failed:', vErr);
        return [];
      });
      const executiveSummary = await readExecutiveSummary(jobItem).catch(sErr => {
        console.error('⚠️ [chat] Fallback readExecutiveSummary failed:', sErr);
        return {};
      });

      // 2. Build system instruction prompt with context
      const contextPrompt = `Bạn là trợ lý AI học thuật song ngữ. Nhiệm vụ của bạn là hỗ trợ người dùng đọc và hiểu tài liệu khoa học song ngữ.
Trình bày câu trả lời rõ ràng bằng Markdown (bôi đậm, vẽ bảng, bullet points).
Đính kèm liên kết trích dẫn ngược dưới dạng [Đoạn X] (với X là chunkIndex) trỏ đúng về nguồn của thông tin đó. Ví dụ: "...như đã được thảo luận [Đoạn 5]".
Phản hồi hoàn toàn bằng tiếng Việt thân thiện và chuyên nghiệp.

Dưới đây là ngữ cảnh trích xuất từ tài liệu để hỗ trợ trả lời câu hỏi:
---
Tóm tắt tài liệu:
${JSON.stringify(executiveSummary, null, 2)}
---
Các đoạn văn bản liên quan tìm được:
${relevantChunks.map(c => `[Đoạn ${c.chunkIndex}]:
Tiếng Anh: ${c.text_original}
Tiếng Việt: ${c.text_translated}`).join('\n\n')}
---

Câu hỏi của người dùng: ${message}`;

      answer = await generateAnswer(contextPrompt);
    } catch (fallbackErr: any) {
      console.error('❌ [chat] Fallback chain failed:', fallbackErr);
      answer = `Không thể tạo câu trả lời do lỗi hệ thống AI (cả Gemini và Groq đều gặp lỗi): ${fallbackErr.message || fallbackErr}`;
    }
  }

  console.log(`⏱️ [chat] Gemini reasoning loop completed in ${(performance.now() - geminiStart).toFixed(0)}ms`);
  console.log(`⏱️ [chat] Total RAG Chat completed in ${(performance.now() - totalStart).toFixed(0)}ms`);

  return { answer };
};
