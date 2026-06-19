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
    return { jobId, status };
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
        resolve({ answer: `Đây là câu trả lời thử nghiệm từ tài liệu mock cho câu hỏi "${message}" [Đoạn 1].` });
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


