import { getSession } from 'next-auth/react';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export interface JobStatus {
  jobId: string;
  status: string;
  fileName?: string;
  s3OutputKey?: string;
  createdAt?: string;
  completedAt?: string;
  error?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

let cachedSession: any = null;
let cacheExpiry = 0;

// Helper to get standard API headers including Authorization token
async function getApiHeaders(extraHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  try {
    const now = Date.now();
    if (!cachedSession || now > cacheExpiry) {
      cachedSession = await getSession();
      cacheExpiry = now + 10000; // Cache for 10 seconds
    }
    if (cachedSession?.accessToken) {
      headers['Authorization'] = `Bearer ${cachedSession.accessToken}`;
    }
  } catch (err) {
    console.warn('Failed to retrieve session for API headers:', err);
  }
  return headers;
}

export async function createUploadUrl(fileName: string): Promise<{ jobId: string; uploadUrl: string; expiresIn: number }> {
  const headers = await getApiHeaders();
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ fileName }),
  });
  if (!res.ok) throw new ApiError(`Upload URL failed: ${res.status}`, res.status);
  return res.json();
}

export async function uploadFile(uploadUrl: string, file: File, signal?: AbortSignal): Promise<void> {
  // S3 Presigned URL uploads do NOT take Bearer authorization headers
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
    signal,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

let mockProgressIndex = 0;
const mockStates = ['extracting', 'processing', 'agents_completed', 'completed'];

export function resetMockProgress(): void {
  mockProgressIndex = 0;
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  if (jobId.startsWith('mock-')) {
    const status = mockStates[mockProgressIndex];
    if (mockProgressIndex < mockStates.length - 1) {
      mockProgressIndex++;
    }
    let fileName = `Tài liệu ${jobId}`;
    if (jobId === 'mock-job-1') fileName = 'Nghiên cứu về Transformer.pdf';
    else if (jobId === 'mock-job-2') fileName = 'Ứng dụng của CNN trong Y tế.pdf';
    return { jobId, status, fileName };
  }
  const headers = await getApiHeaders();
  const res = await fetch(`${API_BASE}/job/${jobId}`, { headers });
  if (!res.ok) throw new Error(`Get status failed: ${res.status}`);
  return res.json();
}

export async function getResultUrl(jobId: string): Promise<{ downloadUrl: string; expiresIn: number }> {
  if (jobId.startsWith('mock-')) {
    return { downloadUrl: 'data:text/markdown;charset=utf-8,mock-translation-data', expiresIn: 3600 };
  }
  const headers = await getApiHeaders();
  const res = await fetch(`${API_BASE}/result/${jobId}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Get result failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchPreviewContent(jobId: string): Promise<string> {
  const res = await fetch(`/api/preview/${jobId}`);
  if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);
  return res.text();
}

export async function getJobs(): Promise<JobStatus[]> {
  const headers = await getApiHeaders();
  const res = await fetch(`${API_BASE}/jobs`, { headers });
  if (!res.ok) throw new ApiError(`Get jobs failed: ${res.status}`, res.status);
  const data = await res.json();
  return data.jobs || [];
}

export async function sendRAGChatMessage(jobId: string, message: string): Promise<{ answer: string }> {
  if (jobId.startsWith('mock-')) {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (message.includes('Tìm các bài viết liên quan')) {
          resolve({
            answer: 'Dưới đây là một số bài báo liên quan tìm thấy:\n\n1. **[Attention Is All You Need](https://semanticscholar.org/paper/111)** (Vaswani et al., 2017)\nTóm tắt: Nghiên cứu giới thiệu kiến trúc Transformer.\n[Đọc PDF gốc](https://arxiv.org/pdf/1706.03762.pdf)'
          });
        } else {
          resolve({ answer: `Đây là câu trả lời thử nghiệm từ tài liệu mock cho câu hỏi "${message}" [Đoạn 1].` });
        }
      }, 1000);
    });
  }
  const res = await fetch(`/api/chat/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Chat failed: ${res.status}`);
  }
  return res.json();
}

export interface RelatedPaper {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string | null;
  pdfUrl: string | null;
}

export async function getRelatedPapers(jobId: string): Promise<RelatedPaper[]> {
  const res = await fetch(`/api/semantic-scholar?jobId=${jobId}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch related papers: ${res.status}`);
  }
  const data = await res.json();
  return data.papers || [];
}

export interface QuizQuestion {
  questionText: string;
  options: string[];
  correctOptionIndex: number;
  explanation: string;
}

export interface QuizData {
  questions: QuizQuestion[];
  questionCount: number;
}

export interface QuizResponse {
  status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED';
  questions?: QuizQuestion[];
  error?: string;
}

export async function generateQuiz(jobId: string, count?: number): Promise<QuizResponse> {
  const url = `/api/tools/${jobId}/quiz${count ? `?count=${count}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo quiz.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    if (status === 504) throw new ApiError('Quá trình tạo quiz mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.', 504);
    throw new ApiError(err.error || `Quiz generation failed: ${status}`, status);
  }
  return res.json();
}

export async function checkQuizStatus(jobId: string, count?: number): Promise<QuizResponse> {
  const url = `/api/tools/${jobId}/quiz${count ? `?count=${count}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo quiz.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    throw new ApiError(err.error || `Quiz status check failed: ${status}`, status);
  }
  return res.json();
}

export interface QuizShareResult {
  shareId: string;
  shareUrl: string;
  expiresAt: number;
}

export interface PublicQuizData {
  downloadUrl: string;
  count: number;
  title: string;
  expiresAt: number;
  questions?: QuizQuestion[];
  mockQuestions?: QuizQuestion[];
}

export async function createQuizShare(jobId: string, count: number = 5): Promise<QuizShareResult> {
  const url = `/api/tools/${jobId}/share/quiz`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để chia sẻ bài trắc nghiệm.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền chia sẻ bài trắc nghiệm này.', 403);
    if (status === 409) throw new ApiError('Bộ câu hỏi trắc nghiệm chưa được tạo để chia sẻ.', 409);
    if (status === 429) throw new ApiError('Đã đạt giới hạn tối đa 10 liên kết chia sẻ cho bài báo này.', 429);
    throw new ApiError(err.error || `Tạo liên kết chia sẻ thất bại: ${status}`, status);
  }
  return res.json();
}

export async function getPublicQuizShare(shareId: string): Promise<PublicQuizData> {
  const url = `/api/share/quiz/${shareId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 404) throw new ApiError('Liên kết chia sẻ không tồn tại hoặc đã bị xóa.', 404);
    if (status === 410) throw new ApiError('Liên kết chia sẻ này đã hết hạn (30 ngày).', 410);
    throw new ApiError(err.error || `Tải bài trắc nghiệm công khai thất bại: ${status}`, status);
  }
  return res.json();
}


export interface FlashcardItem {
  term: string;
  pronunciation: string;
  translation: string;
  definition: string;
}

export interface FlashcardResponse {
  status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED';
  flashcards?: FlashcardItem[];
  cardCount?: number;
  error?: string;
}

export async function generateFlashcards(jobId: string, count?: number): Promise<FlashcardResponse> {
  const url = `/api/tools/${jobId}/flashcard${count ? `?count=${count}` : ''}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo thẻ ghi nhớ.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    if (status === 504) throw new ApiError('Quá trình tạo thẻ ghi nhớ mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.', 504);
    throw new ApiError(err.error || `Flashcard generation failed: ${status}`, status);
  }
  return res.json();
}

export async function checkFlashcardStatus(jobId: string, count?: number): Promise<FlashcardResponse> {
  const url = `/api/tools/${jobId}/flashcard${count ? `?count=${count}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo thẻ ghi nhớ.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    throw new ApiError(err.error || `Flashcard status check failed: ${status}`, status);
  }
  return res.json();
}

export interface MindmapResponse {
  status: 'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED';
  mermaidCode?: string;
  error?: string;
}

export async function generateMindmap(jobId: string): Promise<MindmapResponse> {
  const url = `/api/tools/${jobId}/mindmap`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo sơ đồ tư duy.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    if (status === 504) throw new ApiError('Quá trình tạo sơ đồ tư duy mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.', 504);
    throw new ApiError(err.error || `Mindmap generation failed: ${status}`, status);
  }
  return res.json();
}

export async function checkMindmapStatus(jobId: string): Promise<MindmapResponse> {
  const url = `/api/tools/${jobId}/mindmap`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để tạo sơ đồ tư duy.', 401);
    if (status === 403) throw new ApiError('Bạn không có quyền truy cập tài liệu này.', 403);
    if (status === 409) throw new ApiError('Bản dịch tài liệu chưa hoàn thành. Vui lòng đợi quá trình dịch xong.', 409);
    throw new ApiError(err.error || `Mindmap status check failed: ${status}`, status);
  }
  return res.json();
}

export interface SynthesisReportResponse {
  report: string;
}

export interface SynthesisChatResponse {
  answer: string;
}

export async function generateSynthesisReport(jobIds: string[]): Promise<SynthesisReportResponse> {
  const maxRetries = 60; // 60 retries * 2s = 120 seconds max timeout (2 minutes)
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch('/api/synthesis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new ApiError(err.error || `Synthesis failed: ${res.status}`, res.status);
    }
    const data = await res.json();
    
    // Support both immediate report format (mock data) and polling format
    if (data.report && !data.status) {
      return { report: data.report };
    }
    
    if (data.status === 'COMPLETED') {
      return { report: data.report || '' };
    }
    
    if (data.status === 'FAILED') {
      throw new ApiError(data.error || 'Quá trình tổng hợp báo cáo đối chiếu thất bại (Background synthesis failed).', 500);
    }
    
    // Otherwise it is GENERATING, wait 2 seconds and poll again
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  
  throw new ApiError('Quá trình tổng hợp báo cáo đối chiếu đang mất quá nhiều thời gian để xử lý. Vui lòng tải lại trang để kiểm tra kết quả.', 504);
}

export async function sendSynthesisChatMessage(jobIds: string[], message: string): Promise<SynthesisChatResponse> {
  const res = await fetch('/api/synthesis/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobIds, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Synthesis chat failed: ${res.status}`, res.status);
  }
  return res.json();
}

export interface ExploreResponse {
  status: 'GENERATING' | 'FAILED' | 'COMPLETED';
  jobId?: string;
  originalName?: string;
  s3OutputKey?: string;
  error?: string;
}

export async function createExploreJob(topic: string): Promise<ExploreResponse> {
  const res = await fetch('/api/explore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để sử dụng Chế độ Khám phá.', 401);
    throw new ApiError(err.error || `Yêu cầu chế độ khám phá thất bại: ${status}`, status);
  }
  return res.json();
}

export async function getExploreJobStatus(jobId: string): Promise<ExploreResponse> {
  const res = await fetch(`/api/explore/${jobId}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    if (status === 401) throw new ApiError('Bạn cần đăng nhập để kiểm tra trạng thái Chế độ Khám phá.', 401);
    throw new ApiError(err.error || `Kiểm tra trạng thái thất bại: ${status}`, status);
  }
  return res.json();
}

export interface DefenseSession {
  sessionId: string;
  userId: string;
  jobId: string;
  status: 'ACTIVE' | 'CLOSED';
  recent_turns: {
    question: string;
    answer?: string;
    convincing?: boolean;
    gaps?: string[];
  }[];
  concept_status: {
    concept_id: string;
    status: 'MASTERED' | 'WARNING' | 'GAP';
    last_gap_summary?: string;
  }[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface DefenseAnswerResponse {
  sessionId: string;
  thinking_steps: string[];
  next_question: string;
  status: 'ACTIVE' | 'CLOSED';
  recent_turns: any[];
  concept_status: any[];
  report?: {
    concepts_evaluated: any[];
    facts: any[];
  };
}

export interface CopilotSuggestion {
  title: string;
  description: string;
  action: 'SCHOLAR_SEARCH' | 'SYNTHESIS_DOCS' | 'THESIS_DEFENSE' | 'READ_MORE';
  payload: string;
}

export interface CopilotResponse {
  suggestions: CopilotSuggestion[];
}

export async function initDefenseSession(jobId: string): Promise<DefenseSession> {
  const res = await fetch('/api/explore/defense/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Failed to init defense session: ${res.status}`, res.status);
  }
  return res.json();
}

export async function submitDefenseAnswer(sessionId: string, userAnswer: string): Promise<DefenseAnswerResponse> {
  const res = await fetch('/api/explore/defense/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userAnswer }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Failed to submit defense answer: ${res.status}`, res.status);
  }
  return res.json();
}

export async function closeDefenseSession(sessionId: string): Promise<any> {
  const res = await fetch('/api/explore/defense/session/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Failed to close defense session: ${res.status}`, res.status);
  }
  return res.json();
}

export async function getCopilotSuggestions(jobId: string, sessionId?: string): Promise<CopilotResponse> {
  let url = `/api/explore/copilot/suggest?jobId=${jobId}`;
  if (sessionId) {
    url += `&sessionId=${sessionId}`;
  }
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Failed to fetch copilot suggestions: ${res.status}`, res.status);
  }
  return res.json();
}

export interface CompetencyProfile {
  [conceptId: string]: {
    status: 'MASTERED' | 'WARNING' | 'GAP';
    mastery_score: number;
  };
}

export interface CompetencyProfileResponse {
  profile: CompetencyProfile;
}

export async function fetchCompetencyProfile(): Promise<CompetencyProfileResponse> {
  const res = await fetch('/api/explore/competency/profile', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(err.error || `Failed to fetch competency profile: ${res.status}`, res.status);
  }
  return res.json();
}




