import { NextRequest, NextResponse } from 'next/server';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await context.params;

  if (shareId.startsWith('mock-')) {
    return NextResponse.json({
      downloadUrl: 'mock-download-url',
      count: 5,
      title: 'Bài báo thử nghiệm AI (Mock Share)',
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      mockQuestions: [
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
      ]
    });
  }

  const backendUrl = `${API_BASE}/share/quiz/${shareId}`;
  console.log(`🌍 [NextJS Public API Quiz Share GET] Forwarding request to API Gateway: ${backendUrl}`);

  try {
    const res = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Public share lookup failed' };
      }
      console.error(`❌ [NextJS Public API Quiz Share GET] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    if (data.downloadUrl) {
      try {
        const quizRes = await fetch(data.downloadUrl);
        if (quizRes.ok) {
          const quizJson = await quizRes.json();
          data.questions = quizJson.questions || [];
        }
      } catch (s3Err) {
        console.warn('⚠️ [NextJS Public API Quiz Share GET] Could not pre-fetch S3 quiz content:', s3Err);
      }
    }
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('❌ [NextJS Public API Quiz Share GET] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
