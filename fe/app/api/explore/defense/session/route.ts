import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getForwardHeaders } from '@/lib/proxy-utils';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { jobId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobId } = body;
  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 });
  }

  const backendUrl = `${API_BASE}/explore/defense/session`;
  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: getForwardHeaders(req, session.accessToken),
      body: JSON.stringify({ jobId }),
    });

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
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    console.error('❌ [NextJS API Defense Init] error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
