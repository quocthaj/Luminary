const mockGetJobItem = jest.fn();
const mockUpdateJobStatus = jest.fn();
const mockDynamoDBSend = jest.fn();
const mockS3Send = jest.fn();
const mockLambdaSend = jest.fn();
const mockProcessWithGroq = jest.fn();
const mockProcessWithGemini = jest.fn();

jest.mock('../lambda/utils/dynamodb-helpers', () => ({
  getJobItem: (jobId: string) => mockGetJobItem(jobId),
  updateJobStatus: (...args: any[]) => mockUpdateJobStatus(...args),
}));

jest.mock('../lambda/utils/aws-clients', () => ({
  dynamodbClient: {
    send: (cmd: any) => mockDynamoDBSend(cmd),
  },
  s3Client: {
    send: (cmd: any) => mockS3Send(cmd),
  },
  JOBS_TABLE: 'mock-jobs-table',
  RESULTS_BUCKET: 'mock-results-bucket',
}));

jest.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: jest.fn().mockImplementation(() => ({
    send: (cmd: any) => mockLambdaSend(cmd),
  })),
  InvokeCommand: jest.fn().mockImplementation((payload) => payload),
}));

jest.mock('../lambda/utils/ai-providers', () => ({
  processWithGroq: (...args: any[]) => mockProcessWithGroq(...args),
  processWithGemini: (...args: any[]) => mockProcessWithGemini(...args),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  validateExploreContent,
  handleExplorePost,
  handleExploreGet,
  handleAsyncExploreJob,
} from '../lambda/handlers/explore';

// ============================================
// FIXTURES
// ============================================
const VALID_EXPLORE_CONTENT = `
# Giới thiệu về Machine Learning
Machine Learning là một lĩnh vực của trí tuệ nhân tạo. Nó tập trung vào việc phát triển các hệ thống máy tính có khả năng tự động học hỏi, phân tích dữ liệu và tự nâng cao hiệu suất thông qua các trải nghiệm thực tế mà không cần phải được lập trình một cách rõ ràng hay cứng nhắc.

## Lý thuyết cốt lõi
Học máy cho phép máy tính tự học từ dữ liệu thô. Để giải thích một cách chi tiết, chúng ta có các phương thức học máy phổ biến như học có giám sát (supervised learning), học không giám sát (unsupervised learning) và học tăng cường (reinforcement learning). Trong học có giám sát, mô hình được huấn luyện trên một tập dữ liệu có nhãn, nghĩa là mỗi điểm dữ liệu đầu vào đều đi kèm với nhãn kết quả mong đợi tương ứng. Trong học không giám sát, mô hình phải tự khám phá các cấu trúc ẩn giấu bên trong tập dữ liệu không có nhãn. Học tăng cường lại hoạt động dựa trên cơ chế thưởng phạt khi tác tử tương tác với môi trường xung quanh.

## Công thức toán học toán cốt lõi
Ví dụ công thức toán học LaTeX:
Định dạng block:
$$f(x) = w^T x + b$$
Định dạng inline: $y = f(x)$. Các mô hình tuyến tính sử dụng công thức này để tối ưu hóa hàm mất mát (loss function) thông qua thuật toán lan truyền ngược hoặc thuật toán xuống dốc gradient descent. Việc tối ưu hóa này là nền tảng của mạng nơ-ron nhân tạo hiện đại.

## Sơ đồ quy trình
\`\`\`mermaid
graph TD
  A[Dữ liệu thô] --> B(Tiền xử lý)
  B --> C{Huấn luyện}
  C --> D[Mô hình hoàn thiện]
\`\`\`

## Kết luận
Tóm lại học máy là một kỹ thuật cực kỳ mạnh mẽ và đóng vai trò quan trọng trong việc định hình thế giới công nghệ tương lai.
Nội dung này rất dài và đầy đủ thông tin để vượt qua giới hạn 1500 ký tự tối thiểu của hệ thống. Chúng tôi tiếp tục bổ sung thêm nhiều văn bản tiếng Việt học thuật ở đây để chắc chắn rằng bài viết sẽ được chấp nhận bởi tầng kiểm duyệt nội dung. Cụ thể, học máy được ứng dụng rộng rãi trong nhiều lĩnh vực bao gồm xử lý ngôn ngữ tự nhiên, thị giác máy tính, xe tự lái, phân tích tài chính và y tế thông minh. Với sự bùng nổ của dữ liệu lớn (Big Data) và khả năng tính toán mạnh mẽ của các chip xử lý đồ họa (GPU/TPU) thế hệ mới, các mô hình học máy ngày càng trở nên chính xác và có thể giải quyết các bài toán phức tạp hơn nhiều so với trước đây. Tuy nhiên, điều này cũng đặt ra những thách thức lớn về mặt đạo đức, quyền riêng tư dữ liệu và tính minh bạch của các thuật toán (XAI - Explainable AI) vốn thường được coi là những chiếc hộp đen (black box) khó giải mã. Chúng ta cần có những nghiên cứu nghiêm túc và các quy định pháp lý rõ ràng để định hướng cho sự phát triển lành mạnh của công nghệ học máy trong những thập kỷ tiếp theo.
`;

const INVALID_MERMAID_HTML = VALID_EXPLORE_CONTENT.replace('A[Dữ liệu thô]', 'A[<b>Dữ liệu thô</b>]');
const INVALID_MERMAID_TYPE = VALID_EXPLORE_CONTENT.replace('graph TD', 'invalidType TD');
const NO_MERMAID = VALID_EXPLORE_CONTENT.replace(/```mermaid[\s\S]*?```/, '');
const TOO_SHORT = "Nội dung quá ngắn.";
const NO_LATEX = VALID_EXPLORE_CONTENT.replace(/\$\$[\s\S]*?\$\$/g, '').replace(/\$[^\$]*?\$/g, '');

// ============================================
// TESTS
// ============================================

describe('validateExploreContent()', () => {
  it('returns true for valid content with LaTeX and Mermaid', () => {
    expect(validateExploreContent(VALID_EXPLORE_CONTENT)).toBe(true);
  });

  it('returns false for content that is too short', () => {
    expect(validateExploreContent(TOO_SHORT)).toBe(false);
  });

  it('returns false for content without Mermaid', () => {
    expect(validateExploreContent(NO_MERMAID)).toBe(false);
  });

  it('returns false when Mermaid contains HTML tags', () => {
    expect(validateExploreContent(INVALID_MERMAID_HTML)).toBe(false);
  });

  it('returns false when Mermaid has an invalid diagram type', () => {
    expect(validateExploreContent(INVALID_MERMAID_TYPE)).toBe(false);
  });

  it('returns false when there are no LaTeX formulas', () => {
    expect(validateExploreContent(NO_LATEX)).toBe(false);
  });
});

describe('handleExplorePost()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws an error if topic is missing', async () => {
    await expect(handleExplorePost({ userId: 'user-1', topic: '' }))
      .rejects.toThrow('TOPIC_REQUIRED');
  });

  it('records a new generating job in DynamoDB and invokes lambda', async () => {
    mockDynamoDBSend.mockResolvedValueOnce({});
    mockLambdaSend.mockResolvedValueOnce({});

    const result = await handleExplorePost({ userId: 'user-1', topic: 'Machine Learning' });
    expect(result.jobId).toBeDefined();
    expect(result.jobId.startsWith('exp-')).toBe(true);
    expect(result.status).toBe('GENERATING');
    expect(mockDynamoDBSend).toHaveBeenCalled();
    expect(mockLambdaSend).toHaveBeenCalled();
  });
});

describe('handleExploreGet()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws JOB_NOT_FOUND if job does not exist', async () => {
    mockGetJobItem.mockResolvedValueOnce(null);
    await expect(handleExploreGet({ jobId: 'exp-123', userId: 'user-1' }))
      .rejects.toThrow('JOB_NOT_FOUND');
  });

  it('throws FORBIDDEN if user is not the owner', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      userId: { S: 'user-2' },
      status: { S: 'GENERATING' }
    });
    await expect(handleExploreGet({ jobId: 'exp-123', userId: 'user-1' }))
      .rejects.toThrow('FORBIDDEN');
  });

  it('returns status GENERATING when job is generating', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      userId: { S: 'user-1' },
      status: { S: 'GENERATING' }
    });
    const result = await handleExploreGet({ jobId: 'exp-123', userId: 'user-1' });
    expect(result.status).toBe('GENERATING');
  });

  it('returns status COMPLETED and s3 key when complete', async () => {
    mockGetJobItem.mockResolvedValueOnce({
      userId: { S: 'user-1' },
      status: { S: 'COMPLETED' },
      s3OutputKey: { S: 'explore/exp-123.md' },
      fileName: { S: 'Machine Learning' }
    });
    const result = await handleExploreGet({ jobId: 'exp-123', userId: 'user-1' });
    expect(result.status).toBe('COMPLETED');
    expect(result.s3OutputKey).toBe('explore/exp-123.md');
  });
});

describe('handleAsyncExploreJob()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses Groq when output is valid and uploads to S3', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, // Simulate scholar fail (graceful fallback)
    });
    mockProcessWithGroq.mockResolvedValueOnce(VALID_EXPLORE_CONTENT);
    mockS3Send.mockResolvedValueOnce({});

    await handleAsyncExploreJob({
      jobId: 'exp-123',
      topic: 'Machine Learning',
      userId: 'user-1',
      invocationDepth: 1
    });

    expect(mockProcessWithGroq).toHaveBeenCalled();
    expect(mockProcessWithGemini).not.toHaveBeenCalled();
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockUpdateJobStatus).toHaveBeenCalledWith('exp-123', 'completed', expect.any(Object));
  });

  it('falls back to Gemini if Groq output is invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ title: 'Deep Learning', authors: [{ name: 'Bengio' }], year: 2015, abstract: 'Abstract info', url: 'http://example.com' }]
      })
    });
    mockProcessWithGroq.mockResolvedValueOnce(TOO_SHORT); // Invalid
    mockProcessWithGemini.mockResolvedValueOnce(VALID_EXPLORE_CONTENT); // Valid
    mockS3Send.mockResolvedValueOnce({});

    await handleAsyncExploreJob({
      jobId: 'exp-123',
      topic: 'Machine Learning',
      userId: 'user-1',
      invocationDepth: 1
    });

    expect(mockProcessWithGroq).toHaveBeenCalled();
    expect(mockProcessWithGemini).toHaveBeenCalled();
    expect(mockS3Send).toHaveBeenCalled();
    expect(mockUpdateJobStatus).toHaveBeenCalledWith('exp-123', 'completed', expect.any(Object));
  });

  it('fails the job if both Groq and Gemini outputs are invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false
    });
    mockProcessWithGroq.mockResolvedValueOnce(TOO_SHORT);
    mockProcessWithGemini.mockResolvedValueOnce(TOO_SHORT);

    await handleAsyncExploreJob({
      jobId: 'exp-123',
      topic: 'Machine Learning',
      userId: 'user-1',
      invocationDepth: 1
    });

    expect(mockProcessWithGroq).toHaveBeenCalled();
    expect(mockProcessWithGemini).toHaveBeenCalled();
    expect(mockS3Send).not.toHaveBeenCalled();
    expect(mockUpdateJobStatus).toHaveBeenCalledWith('exp-123', 'FAILED', expect.objectContaining({
      error: expect.any(String)
    }));
  });
});
