import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(req: NextRequest) {
  let session = await auth();
  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightHeader = req.headers.get('x-playwright-test') === 'true';

  let body: { jobIds?: string[]; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobIds, message } = body;
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 10) {
    return NextResponse.json({ error: 'Vui lòng cung cấp danh sách từ 2 đến 10 tài liệu hợp lệ.' }, { status: 400 });
  }
  if (!message || message.trim().length === 0) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  if (jobIds.some(id => id.startsWith('mock-')) && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (jobIds.some(id => id.startsWith('mock-'))) {
    return NextResponse.json({
      answer: `Đây là câu trả lời thử nghiệm từ các tài liệu mock cho câu hỏi "${message}" [Mock Document A - Đoạn 1].`
    });
  }

  const backendUrl = `${API_BASE}/synthesis/chat`;
  console.log(`📡 [NextJS API Synthesis Chat] Forwarding request to API Gateway: ${backendUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ jobIds, message }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Backend call failed' };
      }
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('❌ [NextJS API Synthesis Chat] request timed out after 20s');
      return NextResponse.json(
        { error: 'Yêu cầu kết nối máy chủ backend bị quá hạn (Timeout)' },
        { status: 504 }
      );
    }
    console.error('❌ [NextJS API Synthesis Chat] error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
