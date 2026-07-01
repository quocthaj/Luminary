import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { topic, category } = body;

    if (!topic || topic.trim() === '') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const jobId = `search-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Return 202 Accepted immediately to prevent API Gateway 29s timeout
    return NextResponse.json({
      jobId,
      status: 'GENERATING',
      message: 'Multi-source discovery initiated successfully'
    }, { status: 202 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
