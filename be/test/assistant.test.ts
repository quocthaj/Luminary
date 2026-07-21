import { handleAssistantChat } from '../lambda/handlers/assistant';
import { checkRateLimit } from '../lambda/utils/rate-limiter';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Mock dependencies
jest.mock('../lambda/utils/aws-clients', () => ({
  getSecret: jest.fn().mockResolvedValue('fake-api-key'),
  GEMINI_SECRET_ARN: 'fake-arn'
}));

jest.mock('../lambda/utils/rate-limiter', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 50 }),
  rateLimitResponse: jest.fn().mockReturnValue({ statusCode: 429, body: 'Rate limit exceeded' })
}));

const mockSendMessage = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: mockSendMessage
      })
    })
  }))
}));

describe('Assistant Chat Handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return plain text reply if no tool is called', async () => {
    mockSendMessage.mockResolvedValue({
      response: {
        text: () => 'Xin chào! Tôi có thể giúp gì cho bạn?',
        functionCalls: () => [] // use function to match implementation
      }
    });

    const input = {
      userId: 'user-123',
      message: 'Xin chào',
      conversationHistory: [],
      context: { currentPage: 'library' }
    };

    const result = await handleAssistantChat(input);

    expect(result.reply).toBe('Xin chào! Tôi có thể giúp gì cho bạn?');
    expect(result.toolCalled).toBeUndefined();
  });

  it('should handle tool call properly (e.g. guideFeature)', async () => {
    // Mock the first response requesting a tool call
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => '',
        functionCalls: () => [{
          name: 'guideFeature',
          args: { feature: 'upload' }
        }]
      }
    });

    // Mock the second response after providing tool output
    mockSendMessage.mockResolvedValueOnce({
      response: {
        text: () => 'Dưới đây là hướng dẫn upload...',
        functionCalls: () => []
      }
    });

    const input = {
      userId: 'user-123',
      message: 'Làm sao để tải tài liệu lên?',
      conversationHistory: [],
      context: { currentPage: 'library' }
    };

    const result = await handleAssistantChat(input);

    expect(result.reply).toBe('Dưới đây là hướng dẫn upload...');
    expect(result.toolCalled).toBe('guideFeature');
    expect(result.toolResult.guide).toContain('Để tải tài liệu lên');
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });
});
