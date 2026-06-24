import { PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { v4 as uuidv4 } from 'uuid';
import { dynamodbClient, s3Client, JOBS_TABLE, RESULTS_BUCKET } from '../utils/aws-clients';
import { getJobItem, updateJobStatus } from '../utils/dynamodb-helpers';
import { processWithGroq, processWithGemini } from '../utils/ai-providers';

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'ap-southeast-1' });

// ============================================
// VALIDATION
// ============================================
export function validateExploreContent(text: string): boolean {
  if (!text || text.length < 1500) {
    console.warn("⚠️ Validation failed: Content is too short.");
    return false;
  }

  // 1. Kiểm tra khối code Mermaid đóng mở hoàn chỉnh
  const mermaidRegex = /```mermaid[\s\S]*?```/;
  if (!mermaidRegex.test(text)) {
    console.warn("⚠️ Validation failed: Missing or malformed Mermaid block.");
    return false;
  }

  // Trích xuất phần nội dung Mermaid để kiểm duyệt cú pháp nhẹ (lightweight syntax check)
  const mermaidMatch = text.match(/```mermaid([\s\S]*?)```/);
  if (mermaidMatch && mermaidMatch[1]) {
    const mermaidContent = mermaidMatch[1];
    
    // Luật 1: Chặn thẻ HTML trong nhãn của Mermaid để tránh crash SVG parser
    if (/<[a-zA-Z\/][^>]*>/.test(mermaidContent)) {
      console.warn("⚠️ Validation failed: Mermaid block contains forbidden HTML tags.");
      return false;
    }
    
    // Luật 2: Đảm bảo bắt đầu bằng kiểu biểu đồ được hỗ trợ hợp lệ
    const validMermaidTypes = /^\s*(graph|flowchart|mindmap|sequenceDiagram|gantt|classDiagram|stateDiagram|erDiagram|pie|journey)/i;
    if (!validMermaidTypes.test(mermaidContent)) {
      console.warn("⚠️ Validation failed: Mermaid block does not start with a valid diagram type.");
      return false;
    }
  }

  // 2. Kiểm tra công thức LaTeX thực tế (Inline math độ dài từ 1-80 ký tự để loại bỏ nhiễu tiền tệ)
  const blockMath = text.match(/\$\$[\s\S]*?\$\$/g) || [];
  const inlineMath = text.match(/(?<!\$)\$[^\$\n]{1,80}?\$(?!\$)/g) || [];

  // Hàm lọc: Chỉ tính là LaTeX nếu chứa ký hiệu toán học hoặc ký tự điều hướng của LaTeX
  const isLikelyMath = (s: string) => /[=+\-^_\\]/.test(s);
  
  const validBlocks = blockMath.filter(m => isLikelyMath(m.slice(2, -2)));
  const validInlines = inlineMath.filter(m => isLikelyMath(m.slice(1, -1)));

  const totalMathFormulas = validBlocks.length + validInlines.length;
  if (totalMathFormulas < 2) {
    console.warn(`⚠️ Validation failed: Lacking real LaTeX formulas (found ${totalMathFormulas}, expected >= 2).`);
    return false;
  }

  return true;
}

// ============================================
// API CONTROLLERS
// ============================================

export async function handleExplorePost(input: { userId: string; topic: string }): Promise<any> {
  const { userId, topic } = input;
  if (!topic || topic.trim() === '') {
    throw new Error('TOPIC_REQUIRED');
  }

  const jobId = `exp-${uuidv4()}`;
  const now = Math.floor(Date.now() / 1000);

  // 1. Ghi record mới vào DynamoDB với trạng thái GENERATING
  await dynamodbClient.send(
    new PutItemCommand({
      TableName: JOBS_TABLE,
      Item: {
        jobId: { S: jobId },
        status: { S: 'GENERATING' },
        fileName: { S: topic },
        category: { S: 'explore' },
        userId: { S: userId },
        createdAt: { N: now.toString() },
        expiresAt: { N: (now + 30 * 24 * 60 * 60).toString() }
      }
    })
  );

  console.log(`🔒 [explore-post] Job created: ${jobId}. Invoking async worker...`);

  // 2. Gọi self-invocation lambda bất đồng bộ
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME || 'vietai-orchestrator',
        InvocationType: 'Event',
        Payload: Buffer.from(
          JSON.stringify({
            asyncRun: true,
            tool: 'explore',
            jobId,
            topic,
            userId,
            invocationDepth: 1
          })
        )
      })
    );
  } catch (invokeErr: any) {
    console.error(`❌ [explore-post] Failed to invoke lambda:`, invokeErr);
    await updateJobStatus(jobId, 'FAILED', { error: invokeErr.message || 'Lambda invocation error' });
    throw invokeErr;
  }

  return { jobId, status: 'GENERATING' };
}

export async function handleExploreGet(input: { jobId: string; userId: string }): Promise<any> {
  const { jobId, userId } = input;

  const jobItem = await getJobItem(jobId);
  if (!jobItem) {
    throw new Error('JOB_NOT_FOUND');
  }

  const jobOwnerId = jobItem.userId?.S;
  if (jobOwnerId !== userId) {
    console.warn(`⚠️ [explore-get] Unauthorized access: user ${userId} for job ${jobId}`);
    throw new Error('FORBIDDEN');
  }

  const status = (jobItem.status?.S || 'IDLE').toUpperCase();

  if (status === 'COMPLETED') {
    return {
      status: 'COMPLETED',
      jobId,
      originalName: jobItem.fileName?.S || 'Explore Topic',
      s3OutputKey: jobItem.s3OutputKey?.S || `explore/${jobId}.md`
    };
  }

  if (status === 'FAILED') {
    return {
      status: 'FAILED',
      error: jobItem.errorMsg?.S || 'Đã có lỗi xảy ra trong quá trình sinh nội dung học thuật.'
    };
  }

  return { status };
}

export async function handleAsyncExploreJob(event: { jobId: string; topic: string; userId: string; invocationDepth: number }): Promise<void> {
  const { jobId, topic, userId, invocationDepth } = event;
  console.log(`🤖 [explore-async] Background worker started for jobId=${jobId}, topic="${topic}", depth=${invocationDepth}`);

  if (invocationDepth && invocationDepth > 1) {
    console.error(`❌ [explore-async] Circuit breaker: Recursive call detected! depth=${invocationDepth}. Aborting.`);
    return;
  }

  // 1. Gọi Semantic Scholar API tìm tài liệu tham khảo với timeout 5 giây
  let referencePapersText = '';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const scholarResponse = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(topic)}&limit=3&fields=title,authors,year,abstract,url`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (scholarResponse.ok) {
      const data: any = await scholarResponse.json();
      if (data.data && data.data.length > 0) {
        referencePapersText = "Tài liệu tham khảo thực tế tìm được từ Semantic Scholar:\n" + data.data.map((p: any) => 
          `- Tiêu đề: ${p.title}\nTác giả: ${p.authors?.map((a: any) => a.name).join(", ")}\nNăm: ${p.year}\nTóm tắt: ${p.abstract}\nURL: ${p.url}`
        ).join("\n\n");
      }
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn("⚠️ Semantic Scholar API failed or timed out. Falling back to internal LLM knowledge.", error);
  }

  // 2. Xây dựng prompt
  const systemInstruction = `
Bạn là một AI Agent chuyên trách nghiên cứu khoa học và biên soạn bài giảng học thuật.
Nhiệm vụ của bạn là viết một bài giảng chuyên sâu, chi tiết và có tính hệ thống cao về chủ đề người dùng yêu cầu.

Yêu cầu định dạng bài viết:
1. Sử dụng Markdown chuẩn (tiêu đề #, ##, ###, danh sách gạch đầu dòng, khối trích dẫn).
2. Viết tối thiểu 1000 từ, chia làm các phần: Giới thiệu chủ đề, Lý thuyết cốt lõi, Công thức toán học toán cốt lõi, Ví dụ thực tế, Sơ đồ trực quan hóa khái niệm, và Kết luận.
3. Chèn ít nhất 2 công thức toán học định dạng LaTeX. Định dạng inline là $...$, định dạng block là $$...$$. Ví dụ: $E = mc^2$.
4. Chèn ít nhất 1 sơ đồ tư duy hoặc sơ đồ quy trình bằng mã nguồn Mermaid.js. 
   Lưu ý cực kỳ quan trọng về Mermaid:
   - Chỉ sử dụng cú pháp mindmap hoặc graph TD/LR cơ bản nhất.
   - Không được dùng các thẻ HTML (như <b>, <br>) hoặc dấu ngoặc nhọn, ngoặc tròn sai lệch bên trong nhãn (label) của node.
   - Bắt đầu khối code Mermaid bằng \`\`\`mermaid và kết thúc bằng \`\`\`.
`;

  const prompt = `Hãy viết bài giảng học thuật khoa học chi tiết về chủ đề: "${topic}".\n\n${referencePapersText}`;

  // 3. Tiến hành gọi sinh và tự phục hồi (Self-Healing Fallback Loop)
  let content = "";
  try {
    console.log(`🤖 [explore-async] Generation attempt using Groq Llama 3.3 70B...`);
    const groqResult = await processWithGroq(prompt, systemInstruction);
    if (validateExploreContent(groqResult)) {
      content = groqResult;
      console.log(`✅ [explore-async] Groq response passed validation.`);
    } else {
      throw new Error("Llama 3.3 output failed validation check (short or missing LaTeX/Mermaid).");
    }
  } catch (err: any) {
    console.warn(`⚠️ [explore-async] Groq call or validation failed: ${err.message || err}. Falling back to Gemini 2.5 Flash...`);
    try {
      const geminiResult = await processWithGemini(prompt, systemInstruction);
      if (validateExploreContent(geminiResult)) {
        content = geminiResult;
        console.log(`✅ [explore-async] Gemini fallback passed validation.`);
      } else {
        throw new Error(
          "EXPLORE_VALIDATION_FAILED: Both Groq and Gemini outputs " +
          "failed content validation (truncated or missing LaTeX/Mermaid)."
        );
      }
    } catch (geminiErr: any) {
      console.error(`❌ [explore-async] Both Groq and Gemini failed validation. Setting job FAILED.`);
      await updateJobStatus(jobId, 'FAILED', { error: geminiErr.message || 'Validation failed on both LLMs' });
      return;
    }
  }

  // 4. Lưu tệp Markdown kết quả vào S3 ResultsBucket tại explore/{jobId}.md
  const s3OutputKey = `explore/${jobId}.md`;
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: RESULTS_BUCKET,
        Key: s3OutputKey,
        Body: content,
        ContentType: 'text/markdown; charset=utf-8',
        Metadata: {
          jobId,
          topic: encodeURIComponent(topic),
          processedAt: new Date().toISOString()
        }
      })
    );

    // 5. Cập nhật DynamoDB record thành COMPLETED
    const now = Math.floor(Date.now() / 1000);
    await updateJobStatus(jobId, 'COMPLETED', {
      s3OutputKey,
      completedAt: now
    });
    console.log(`✅ [explore-async] Job completed successfully for jobId=${jobId}`);
  } catch (s3Err: any) {
    console.error(`❌ [explore-async] Failed to save result to S3 or update status:`, s3Err);
    await updateJobStatus(jobId, 'FAILED', { error: s3Err.message || 'S3/DB error during completion' });
  }
}
