import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

  const session = await auth();
  if (!session || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // If mock job, return simulated success
  if (jobId.startsWith('mock-')) {
    return NextResponse.json({ message: 'Reprocessing started (mock)' });
  }

  try {
    const res = await fetch(`${API_BASE}/job/${jobId}/reprocess`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.accessToken}`,
      },
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData.error || 'Failed to trigger reprocess' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Error triggering reprocess:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
