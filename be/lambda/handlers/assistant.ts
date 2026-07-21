import { getSecret, GEMINI_SECRET_ARN } from '../utils/aws-clients';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchExternalPapers, readExecutiveSummary } from './chat';
import { getJobItem } from '../utils/dynamodb-helpers';

const LUMINARY_TOOLS = [
  {
    name: 'searchPapers',
    description: 'Tìm bài báo khoa học trên Semantic Scholar/OpenAlex theo chủ đề hoặc từ khóa',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Từ khóa tìm kiếm' },
        limit: { type: 'NUMBER', description: 'Số kết quả (mặc định 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'guideFeature',
    description: 'Hướng dẫn người dùng sử dụng tính năng cụ thể của Luminary',
    parameters: {
      type: 'OBJECT',
      properties: {
        feature: { 
          type: 'STRING', 
          description: 'Tên tính năng: upload, chat, quiz, flashcard, mindmap, synthesis, explore, podcast, defense, scholar-search'
        }
      },
      required: ['feature']
    }
  },
  {
    name: 'getDocumentSummary',
    description: 'Lấy tóm tắt nhanh của tài liệu user đang xem (dựa vào jobId hiện tại)',
    parameters: {
      type: 'OBJECT',
      properties: {
        jobId: { type: 'STRING' }
      },
      required: ['jobId']
    }
  },
  {
    name: 'startFeature',
    description: 'Điều hướng user tới tính năng cụ thể',
    parameters: {
      type: 'OBJECT',
      properties: {
        feature: { type: 'STRING', description: 'Tên tính năng (quiz, flashcard, v.v)' },
        jobId: { type: 'STRING', description: 'Nếu cần context tài liệu' }
      },
      required: ['feature']
    }
  }
];

const FEATURE_GUIDES: Record<string, string> = {
  upload: "Để tải tài liệu lên, hãy kéo thả file PDF vào màn hình chính hoặc bấm nút 'Tải lên'.",
  chat: "Tính năng Chat giúp bạn hỏi đáp với tài liệu. Hãy chọn một bài báo trong thư viện và bắt đầu hỏi.",
  quiz: "Tạo bài trắc nghiệm từ bài báo để ôn tập.",
  flashcard: "Tạo bộ thẻ ghi nhớ (flashcards) giúp bạn học các thuật ngữ chuyên ngành.",
  mindmap: "Sơ đồ tư duy giúp bạn hình dung cấu trúc và ý chính của bài báo.",
  synthesis: "Tổng hợp nhiều bài báo lại với nhau để tìm ra điểm chung và khác biệt.",
  explore: "Chế độ khám phá giúp bạn tự động tìm hiểu một chủ đề mới.",
  podcast: "Nghe tóm tắt bài báo dưới dạng podcast âm thanh 2 người trò chuyện.",
  defense: "Tính năng bảo vệ luận văn giả lập giúp bạn phản biện lại các luận điểm của mình.",
  "scholar-search": "Tìm kiếm các bài báo học thuật từ các nguồn uy tín."
};

async function executeTool(name: string, args: any, userId: string) {
  switch (name) {
    case 'searchPapers':
      return await searchExternalPapers(args.query, args.limit || 5);
    
    case 'getDocumentSummary':
      if (!args.jobId) return { error: 'Thiếu jobId' };
      const jobItem = await getJobItem(args.jobId);
      if (!jobItem) return { error: 'Không tìm thấy tài liệu' };
      // Optional check ownership: 
      // if (jobItem.userId?.S !== 'guest' && jobItem.userId?.S !== userId) return { error: 'FORBIDDEN' };
      return await readExecutiveSummary(jobItem);
    
    case 'guideFeature':
      return { guide: FEATURE_GUIDES[args.feature] || "Tính năng này chưa có hướng dẫn chi tiết." };
    
    case 'startFeature':
      return { redirectTo: `/workspace/${args.jobId || 'new'}?feature=${args.feature}` };
      
    default:
      return { error: `Tool ${name} not found` };
  }
}

const ASSISTANT_SYSTEM_PROMPT = `
Bạn là Luminary AI — trợ lý học thuật thông minh của nền tảng VietAI Scholar. 
Nhiệm vụ của bạn là giúp người dùng nghiên cứu hiệu quả hơn bằng tiếng Việt.

CONTEXT HIỆN TẠI:
- Người dùng đang ở: {currentPage}
- Tài liệu đang xem: {currentJobTitle}
- JobId: {currentJobId}

CÁC TÍNH NĂNG BẠN CÓ THỂ ĐIỀU PHỐI:
1. Tìm bài báo khoa học (gọi searchPapers)
2. Hướng dẫn dùng tính năng (gọi guideFeature)  
3. Tóm tắt tài liệu hiện tại (gọi getDocumentSummary)
4. Mở tính năng cho user (gọi startFeature)

NGUYÊN TẮC:
- Luôn trả lời bằng tiếng Việt, thân thiện và chuyên nghiệp.
- Khi user hỏi về một chủ đề chưa biết, hãy tự động gọi \`searchPapers\`.
- KHÔNG BỊA THÔNG TIN. Nếu không chắc chắn, hãy tìm kiếm.
- Dựa vào kết quả trả về từ công cụ để trả lời người dùng.
- Cuối mỗi câu trả lời, ĐƯA RA 2-3 gợi ý câu hỏi tiếp theo để dẫn dắt user.

NGUYÊN TẮC GỌI TOOL:
- Khi user hỏi "làm sao để..." hoặc "hướng dẫn tôi..." về 1 tính năng cụ thể → gọi NGAY guideFeature + startFeature. KHÔNG hỏi lại "bạn có muốn tôi điều hướng không?".
- Hành động trước, hỏi sau nếu cần thêm thông tin.
- Nếu đã biết đủ thông tin để gọi tool → gọi luôn.
`;

export async function handleAssistantChat(input: {
  userId: string;
  message: string;
  conversationHistory: any[];
  context: {
    currentPage: string;
    currentJobId?: string;
    currentJobTitle?: string;
  }
}): Promise<any> {
  const { userId, message, conversationHistory, context } = input;

  const systemPrompt = ASSISTANT_SYSTEM_PROMPT
    .replace('{currentPage}', context.currentPage || 'Unknown')
    .replace('{currentJobTitle}', context.currentJobTitle || 'Chưa có')
    .replace('{currentJobId}', context.currentJobId || 'Không có');

  const geminiKey = await getSecret(GEMINI_SECRET_ARN);
  const genAI = new GoogleGenerativeAI(geminiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: LUMINARY_TOOLS as any[] }]
  });

  const chat = model.startChat({
    history: conversationHistory || [],
  });

  const result = await chat.sendMessage(message);
  let response = result.response;
  
  let toolCalled = undefined;
  let toolResult = undefined;

  const calls = response.functionCalls ? response.functionCalls() : [];
  if (calls && calls.length > 0) {
    const call = calls[0];
    toolCalled = call.name;
    toolResult = await executeTool(call.name, call.args, userId);
    
    console.log(`[Assistant] Executing tool ${call.name} with result:`, toolResult);

    const toolResponseResult = await chat.sendMessage([{
      functionResponse: {
        name: call.name,
        response: { result: toolResult }
      }
    }]);
    
    response = toolResponseResult.response;
  }

  const fullText = response.text();
  
  return {
    reply: fullText,
    toolCalled,
    toolResult,
  };
}
