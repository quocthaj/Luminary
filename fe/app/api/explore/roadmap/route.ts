import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_BASE = 'https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev';

export async function POST(req: NextRequest) {
  let session = await auth();
  
  try {
    const { topic } = await req.json();
    if (!topic || topic.trim() === '') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const isPlaywright = process.env.PLAYWRIGHT_TEST === 'true' || req.headers.get('x-playwright-test') === 'true';
    const isMockTopic = topic.startsWith('mock-');

    if (isPlaywright || isMockTopic) {
      // Return static mock roadmap for tests to prevent API usage/timeouts
      const cleanTopic = topic.trim();
      return NextResponse.json([
        {
          stage: "Chặng 1: Nền tảng (Foundations)",
          color: "indigo",
          papers: [
            {
              id: "paper-1",
              title: `Nền tảng lý thuyết và mô hình cơ sở của ${cleanTopic}`,
              authors: "N. Nguyen et al., 2020",
              abstract: `Bài báo này trình bày kiến trúc cơ sở và các nguyên lý toán học nền tảng cho việc thiết lập ${cleanTopic}. Tác giả đề xuất định dạng dữ liệu đầu vào và các phép tính lan truyền ngược đặc thù.`,
              math: `\\mathcal{L}_{\\text{base}} = -\\frac{1}{N}\\sum_{i=1}^N \\left[ y_i \\log(\\hat{y}_i) + (1-y_i) \\log(1-\\hat{y}_i) \\right]`,
              gap: `⚠️ Các tiếp cận ban đầu có độ phức tạp tính toán cao và chưa tối ưu hóa phân phối trọng số.`
            }
          ]
        },
        {
          stage: "Chặng 2: Bài báo kinh điển (Landmarks)",
          color: "emerald",
          papers: [
            {
              id: "paper-2",
              title: `Đột phá kiến trúc nâng cao hiệu năng ${cleanTopic}`,
              authors: "Tran et al., 2022",
              abstract: `Một nghiên cứu mang tính bước ngoặt, giới thiệu cơ chế tối ưu hóa cục bộ và phân nhóm dữ liệu đặc trưng cho ${cleanTopic}. Kết quả thực nghiệm cho thấy hiệu năng vượt trội so với các mô hình CNN và RNN cổ điển.`,
              math: `\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V`,
              gap: `⚠️ Mô hình đòi hỏi dung lượng bộ nhớ lớn và chưa hỗ trợ tốt cho việc xử lý song song ở các phần cứng thế hệ cũ.`
            }
          ]
        },
        {
          stage: "Chặng 3: SOTA Hiện tại (Modern SOTA)",
          color: "amber",
          papers: [
            {
              id: "paper-3",
              title: `Ứng dụng lai SOTA của ${cleanTopic} trong y học & công nghiệp`,
              authors: "Luminary Scholar Team, 2024",
              abstract: `Nghiên cứu mới nhất kết hợp các kỹ thuật học sâu tiên tiến cùng ${cleanTopic} để xây dựng công cụ chẩn đoán đa năng độ chính xác cao. Hệ thống được tinh chỉnh để chạy mượt mà dưới 1.5 giây.`,
              math: `\\mathbf{y} = \\sigma\\left( \\mathbf{W}_2 \\cdot \\max(0, \\mathbf{W}_1 \\mathbf{x} + \\mathbf{b}_1) + \\mathbf{b}_2 \\right)`,
              gap: `⚠️ Việc tích hợp các thông tin phi cấu trúc bổ trợ (metadata văn bản, lịch sử bệnh án) vào mô hình vẫn chưa đạt độ tối ưu.`
            }
          ]
        },
        {
          stage: "Chặng 4: Thách thức mở (Open Challenges)",
          color: "rose",
          papers: [
            {
              id: "paper-4",
              title: `Các bài toán chưa có lời giải và hướng đi tương lai cho ${cleanTopic}`,
              authors: "S. Wang et al., 2025",
              abstract: `Phân tích toàn diện về các khoảng trống nghiên cứu của ${cleanTopic}. Đề xuất hướng tiếp cận tự giám sát (self-supervised learning) để giảm thiểu sự phụ thuộc vào nhãn thủ công và nâng cao tính minh bạch của AI.`,
              math: `\\text{Entropy}(P) = -\\sum_{x \\in X} P(x) \\log_2 P(x)`,
              gap: `⚠️ Mô hình AI vẫn đóng vai trò như 'hộp đen', thiếu đi khả năng giải thích logic lâm sàng một cách thuyết phục cho các bác sĩ.`
            }
          ]
        }
      ]);
    }

    if (!session?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const backendUrl = `${API_BASE}/explore`;
    console.log(`📡 [NextJS Roadmap] Calling backend API: ${backendUrl} with topic: ${topic}`);

    const res = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
      },
      body: JSON.stringify({
        topic,
        mode: 'roadmap'
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ [NextJS Roadmap] Backend returned error: ${res.status} - ${errText}`);
      return NextResponse.json({ error: errText || 'Backend roadmap generation failed' }, { status: res.status });
    }

    const roadmapData = await res.json();
    return NextResponse.json(roadmapData);
  } catch (err: any) {
    console.error('❌ [NextJS Roadmap] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
