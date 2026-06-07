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

// Helper to get standard API headers including Authorization token
async function getApiHeaders(extraHeaders: Record<string, string> = {}): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };
  try {
    const session = await getSession();
    if (session?.accessToken) {
      headers['Authorization'] = `Bearer ${session.accessToken}`;
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
