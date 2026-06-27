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

  if (jobId.startsWith('mock-') && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // optional body
  }

  const count = body.count || req.nextUrl.searchParams.get('count') || 5;

  if (jobId.startsWith('mock-')) {
    return NextResponse.json({
      shareId: 'mock-share-123',
      shareUrl: '/share/quiz/mock-share-123',
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    });
  }

  const backendUrl = `${API_BASE}/job/${jobId}/share/quiz`;
  console.log(`🔗 [NextJS API Quiz Share] Forwarding request to API Gateway: ${backendUrl}`);

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ count: Number(count) }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Backend call failed' };
      }
      console.error(`❌ [NextJS API Quiz Share] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('❌ [NextJS API Quiz Share] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
