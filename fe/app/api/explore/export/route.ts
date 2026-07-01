import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId, format } = body; // format: 'pdf' | 'word' | 'obsidian'

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const exportFormat = format || 'obsidian';
    
    // Point to our Next.js API download route instead of the invalid static S3 link
    const downloadUrl = `/api/explore/download?sessionId=${sessionId}&format=${exportFormat}`;

    return NextResponse.json({
      success: true,
      format: exportFormat,
      downloadUrl,
      expiresInSeconds: 300,
      message: 'Export package generated successfully'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
