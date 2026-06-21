import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(req: NextRequest) {
  let session = await auth();
  const isTestOrDev = process.env.NODE_ENV !== 'production' || process.env.PLAYWRIGHT_TEST === 'true';
  const hasPlaywrightHeader = req.headers.get('x-playwright-test') === 'true';

  let body: { jobIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { jobIds } = body;
  if (!jobIds || !Array.isArray(jobIds) || jobIds.length < 2 || jobIds.length > 10) {
    return NextResponse.json({ error: 'Vui lòng cung cấp danh sách từ 2 đến 10 tài liệu hợp lệ.' }, { status: 400 });
  }

  if (jobIds.some(id => id.startsWith('mock-')) && (process.env.NODE_ENV === 'test' || process.env.PLAYWRIGHT_TEST === 'true' || (isTestOrDev && hasPlaywrightHeader))) {
    session = { accessToken: 'mock-token-123' } as any;
  }

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (jobIds.some(id => id.startsWith('mock-'))) {
    return NextResponse.json({
      report: `# Báo cáo đối chiếu thử nghiệm (Mock Synthesis Report)\n\n## 1. Bảng so sánh đối chiếu\n\n| Tiêu chí | Mock Document A | Mock Document B |\n|---|---|---|\n| **Mục tiêu** | Đánh giá mô hình A | Đánh giá mô hình B |\n| **Phương pháp** | Kiểm thử trực tiếp | Mô phỏng thực tế |\n| **Kết quả** | Đạt độ chính xác 95% | Đạt độ chính xác 92% |\n| **Hạn chế** | Kích thước mẫu nhỏ | Chi phí tính toán cao |\n\n## 2. Tổng hợp phân tích\n\nCác tài liệu thử nghiệm cho thấy sự tương đồng và khác biệt trong phương pháp nghiên cứu [Mock Document A - Đoạn 1].`
    });
  }

  const backendUrl = `${API_BASE}/synthesis`;
  console.log(`📡 [NextJS API Synthesis] Forwarding request to API Gateway: ${backendUrl}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for synthesis

  try {
    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({ jobIds }),
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
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error('❌ [NextJS API Synthesis] request timed out after 30s');
      return NextResponse.json(
        { error: 'Yêu cầu tạo báo cáo đối chiếu bị quá hạn (Timeout)' },
        { status: 504 }
      );
    }
    console.error('❌ [NextJS API Synthesis] error forwarding request:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
