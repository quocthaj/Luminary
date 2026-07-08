import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function GET(req: NextRequest) {
  let session = await auth();
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const queryTopic = searchParams.get('topic') || 'Vision Transformer';

  if (!jobId) {
    return NextResponse.json({ error: 'jobId parameter is required' }, { status: 400 });
  }

  const isPlaywright = process.env.PLAYWRIGHT_TEST === 'true' || req.headers.get('x-playwright-test') === 'true';
  const isMockJob = jobId.startsWith('mock-');

  if (isPlaywright || isMockJob) {
    // Return mock topics immediately for tests/mocks
    const formattedTopic = queryTopic.trim();
    return NextResponse.json({
      status: 'COMPLETED',
      jobId,
      topics: {
        hotTrends: [
          { id: 't1', title: `${formattedTopic} trong chẩn đoán y khoa & lâm sàng`, papersCount: 45, citationGrowth: '+120%' },
          { id: 't2', title: `Tối ưu hóa và tăng tốc xử lý ${formattedTopic} bằng LLM`, papersCount: 38, citationGrowth: '+85%' }
        ],
        nicheGaps: [
          { id: 't3', title: `Ứng dụng ${formattedTopic} cho đặc thù dữ liệu Việt Nam`, papersCount: 3, gapDescription: 'Chưa có benchmark chuẩn hóa' },
          { id: 't4', title: `Thiết kế ${formattedTopic} có độ trễ cực thấp (<1.5s)`, papersCount: 5, gapDescription: 'Thiếu kiểm thử phần cứng biên' }
        ],
        crossDomain: [
          { id: 't5', title: `Kết hợp ${formattedTopic} với Graph Neural Networks và IoT`, papersCount: 12, innovationScore: 'High' }
        ]
      }
    });
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const backendUrl = `${API_BASE}/explore`;
    console.log(`📡 [NextJS Discovery Status] Calling backend API: ${backendUrl} with topic: ${queryTopic}`);

    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        topic: queryTopic,
        mode: 'discovery'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [NextJS Discovery Status] Backend returned error: ${res.status} - ${errText}`);
      return NextResponse.json({ error: errText || 'Backend discovery failed' }, { status: res.status });
    }

    const topicsData = await res.json();
    return NextResponse.json({
      status: 'COMPLETED',
      jobId,
      topics: topicsData
    });
  } catch (err: any) {
    console.error('❌ [NextJS Discovery Status] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

