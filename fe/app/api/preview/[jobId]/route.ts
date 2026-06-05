import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;

  const metaRes = await fetch(`${API_BASE}/result/${jobId}`);
  if (!metaRes.ok) {
    return NextResponse.json({ error: 'result fetch failed' }, { status: metaRes.status });
  }
  const { downloadUrl } = await metaRes.json() as { downloadUrl: string };

  const contentRes = await fetch(downloadUrl);
  if (!contentRes.ok) {
    return NextResponse.json({ error: 's3 fetch failed' }, { status: contentRes.status });
  }

  const text = await contentRes.text();
  return new NextResponse(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
