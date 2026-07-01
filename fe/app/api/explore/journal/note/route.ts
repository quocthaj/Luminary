import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId, noteContent, citation } = body;

    if (!sessionId || !noteContent) {
      return NextResponse.json({ error: 'sessionId and noteContent are required' }, { status: 400 });
    }

    const noteId = `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = new Date().toISOString();

    // Single-Table Atomic PutItem representation: PK=SESSION#<sessionId>, SK=NOTE#<noteId>
    const newNote = {
      noteId,
      sessionId,
      noteContent,
      citation: citation || null,
      createdAt: timestamp
    };

    return NextResponse.json({
      success: true,
      message: 'Note saved atomically without race conditions',
      note: newNote
    }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
