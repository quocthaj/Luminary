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

export async function createUploadUrl(fileName: string): Promise<{ jobId: string; uploadUrl: string; expiresIn: number }> {
  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName }),
  });
  if (!res.ok) throw new Error(`Upload URL failed: ${res.status}`);
  return res.json();
}

export async function uploadFile(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!res.ok) throw new Error(`S3 upload failed: ${res.status}`);
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/job/${jobId}`);
  if (!res.ok) throw new Error(`Get status failed: ${res.status}`);
  return res.json();
}

export async function getResultUrl(jobId: string): Promise<{ downloadUrl: string; expiresIn: number }> {
  const res = await fetch(`${API_BASE}/result/${jobId}`);
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
