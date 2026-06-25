import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;

  let session = await auth();
  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightHeader = req.headers.get('x-playwright-test') === 'true';

  // Mock session for Playwright / test environments
  if (jobId.startsWith('mock-') && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mock response for Playwright test jobs
  if (jobId.startsWith('mock-')) {
    return NextResponse.json({
      status: 'GENERATING'
    });
  }

  let hdMode = false;
  try {
    const body = await req.json();
    hdMode = body.hdMode === true;
  } catch (e) {
    // Ignore body parse errors
  }

  const backendUrl = `${API_BASE}/job/${jobId}/podcast`;
  console.log(`🎧 [NextJS API Podcast] Forwarding POST request to API Gateway: ${backendUrl} (hdMode: ${hdMode})`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ hdMode }),
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
      console.error(`❌ [NextJS API Podcast] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('❌ [NextJS API Podcast] Request timed out after 55s');
      return NextResponse.json(
        { error: 'Quá trình khởi tạo podcast mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.' },
        { status: 504 }
      );
    }
    console.error('❌ [NextJS API Podcast] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await context.params;

  let session = await auth();
  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightHeader = req.headers.get('x-playwright-test') === 'true';

  // Mock session for Playwright / test environments
  if (jobId.startsWith('mock-') && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Mock response for Playwright test jobs
  if (jobId.startsWith('mock-')) {
    return NextResponse.json({
      status: 'COMPLETED',
      downloadUrl: 'https://example.com/mock-podcast.mp3',
      fallbackUsed: false,
      hdMode: true
    });
  }

  const backendUrl = `${API_BASE}/job/${jobId}/podcast`;
  console.log(`🎧 [NextJS API Podcast GET] Forwarding request to API Gateway: ${backendUrl}`);

  try {
    const res = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Backend call failed' };
      }
      console.error(`❌ [NextJS API Podcast GET] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('❌ [NextJS API Podcast GET] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
