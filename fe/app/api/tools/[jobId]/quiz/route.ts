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
      questions: [
        {
          questionText: 'Thuật toán nào được đề xuất trong bài báo nghiên cứu này?',
          options: ['Phương án A', 'Phương án B', 'Phương án C (đúng)', 'Phương án D'],
          correctOptionIndex: 2,
          explanation: 'Đây là câu trả lời mock từ bài báo thử nghiệm.'
        },
        {
          questionText: 'Kết quả thực nghiệm chính của bài báo là gì?',
          options: ['Kết quả A', 'Kết quả B (đúng)', 'Kết quả C', 'Kết quả D'],
          correctOptionIndex: 1,
          explanation: 'Giải thích mock cho câu hỏi số 2.'
        },
        {
          questionText: 'Phương pháp đánh giá nào được sử dụng trong thực nghiệm?',
          options: ['Phương pháp A (đúng)', 'Phương pháp B', 'Phương pháp C', 'Phương pháp D'],
          correctOptionIndex: 0,
          explanation: 'Giải thích mock cho câu hỏi số 3.'
        },
        {
          questionText: 'Hạn chế chính của phương pháp đề xuất là gì?',
          options: ['Hạn chế A', 'Hạn chế B', 'Hạn chế C', 'Hạn chế D (đúng)'],
          correctOptionIndex: 3,
          explanation: 'Giải thích mock cho câu hỏi số 4.'
        },
        {
          questionText: 'Hướng nghiên cứu tiếp theo nào được đề xuất trong bài báo?',
          options: ['Hướng A', 'Hướng B', 'Hướng C (đúng)', 'Hướng D'],
          correctOptionIndex: 2,
          explanation: 'Giải thích mock cho câu hỏi số 5.'
        },
      ],
      questionCount: 5,
    });
  }

  const count = req.nextUrl.searchParams.get('count') || '';
  const backendUrl = `${API_BASE}/job/${jobId}/quiz${count ? `?count=${count}` : ''}`;
  console.log(`🧠 [NextJS API Quiz] Forwarding request to API Gateway: ${backendUrl}`);

  // Quiz generation có thể mất tới ~20s (2 Gemini attempts)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      // Không có body — quiz không cần input từ client
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
      console.error(`❌ [NextJS API Quiz] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('❌ [NextJS API Quiz] Request timed out after 55s');
      return NextResponse.json(
        { error: 'Quá trình tạo quiz mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.' },
        { status: 504 }
      );
    }
    console.error('❌ [NextJS API Quiz] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
