import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

const MOCK_FLASHCARDS = [
  {
    term: 'Gradient Descent',
    pronunciation: '/ˈɡreɪdiənt dɪˈsɛnt/',
    translation: 'Cực tiểu hóa theo độ dốc',
    definition: 'An optimization algorithm used to minimize some cost function. Một thuật toán tối ưu hóa được sử dụng để giảm thiểu một hàm chi phí nào đó.'
  },
  {
    term: 'Convolutional Neural Network',
    pronunciation: '/ˌkɒnvəˈluːʃənl ˈnjʊərəl ˈnɛtwɜːk/',
    translation: 'Mạng thần kinh tích chập',
    definition: 'A class of deep neural networks, most commonly applied to analyzing visual imagery. Một lớp các mạng thần kinh sâu, thường được áp dụng phổ biến nhất để phân tích hình ảnh trực quan.'
  },
  {
    term: 'Overfitting',
    pronunciation: '/ˌoʊvərˈfɪtɪŋ/',
    translation: 'Quá khớp',
    definition: 'A concept where a model trains too well on training data but performs poorly on unseen data. Một khái niệm trong đó mô hình huấn luyện quá tốt trên dữ liệu huấn luyện nhưng hoạt động kém trên dữ liệu mới chưa từng thấy.'
  },
  {
    term: 'Transfer Learning',
    pronunciation: '/ˈtrænsfɜːr ˈlɜːrnɪŋ/',
    translation: 'Học chuyển giao',
    definition: 'A research problem in machine learning that focuses on storing knowledge gained while solving one problem and applying it to a different but related problem. Một bài toán nghiên cứu trong học máy tập trung vào việc lưu trữ kiến thức có được khi giải quyết một vấn đề và áp dụng nó vào một vấn đề khác nhưng có liên quan.'
  },
  {
    term: 'Attention Mechanism',
    pronunciation: '/əˈtɛnʃn ˈmɛkənɪzəm/',
    translation: 'Cơ chế chú ý',
    definition: 'A technique that mimics cognitive attention, allowing the model to focus on specific parts of the input sequence. Một kỹ thuật mô phỏng sự chú ý nhận thức, cho phép mô hình tập trung vào các phần cụ thể của chuỗi đầu vào.'
  }
];

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
      status: 'COMPLETED',
      flashcards: MOCK_FLASHCARDS,
      cardCount: MOCK_FLASHCARDS.length
    });
  }

  const count = req.nextUrl.searchParams.get('count') || '';
  const backendUrl = `${API_BASE}/job/${jobId}/flashcard${count ? `?count=${count}` : ''}`;
  console.log(`🧠 [NextJS API Flashcard] Forwarding request to API Gateway: ${backendUrl}`);

  // Flashcard generation can take up to ~20s
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
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
      console.error(`❌ [NextJS API Flashcard] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('❌ [NextJS API Flashcard] Request timed out after 55s');
      return NextResponse.json(
        { error: 'Quá trình tạo thẻ ghi nhớ mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.' },
        { status: 504 }
      );
    }
    console.error('❌ [NextJS API Flashcard] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
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
      status: 'COMPLETED',
      flashcards: MOCK_FLASHCARDS,
      cardCount: MOCK_FLASHCARDS.length
    });
  }

  const count = req.nextUrl.searchParams.get('count') || '';
  const backendUrl = `${API_BASE}/job/${jobId}/flashcard${count ? `?count=${count}` : ''}`;
  console.log(`🧠 [NextJS API Flashcard GET] Forwarding request to API Gateway: ${backendUrl}`);

  try {
    const res = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { error: errorText || 'Backend call failed' };
      }
      console.error(`❌ [NextJS API Flashcard GET] Backend returned ${res.status}:`, errorData);
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);

  } catch (err: any) {
    console.error('❌ [NextJS API Flashcard GET] Error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
