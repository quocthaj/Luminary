'use client';
import { useState, useEffect } from 'react';
import { getJobStatus } from '../lib/api';

const STEPS = [
  { label: 'Trích xuất', statuses: ['pending', 'queued', 'extracting'] },
  { label: 'Đang dịch', statuses: ['extracted', 'orchestrating', 'processing'] },
  { label: 'Đang gộp', statuses: ['agents_completed'] },
];

function getCurrentStep(status: string): number {
  if (status === 'completed') return 3;
  const idx = STEPS.findIndex(s => s.statuses.includes(status));
  return idx === -1 ? 0 : idx;
}

const STATUS_LABELS: Record<string, string> = {
  pending:       'Đang chờ xử lý...',
  queued:        'Đã xếp hàng, chuẩn bị chạy...',
  extracting:    'Đang trích xuất văn bản...',
  extracted:     'Đã trích xuất, bắt đầu dịch...',
  orchestrating: 'Đang điều phối dịch thuật...',
  processing:    'Đang dịch tài liệu...',
  agents_completed: 'Đang gộp kết quả...',
  completed:     'Hoàn thành!',
  failed:        'Xử lý thất bại.',
};

interface NewsItem {
  title: string;
  url: string;
  author: string;
  category: string;
}

const FALLBACK_NEWS: NewsItem[] = [
  {
    title: 'Mô hình ngôn ngữ lớn giúp tăng tốc độ tổng hợp tri thức khoa học lên 10 lần',
    url: 'https://news.ycombinator.com',
    author: 'Luminary Research',
    category: 'AI & Học thuật'
  },
  {
    title: 'Khám phá phương pháp trực quan hóa Mindmap giúp ghi nhớ sâu tài liệu phức tạp',
    url: 'https://news.ycombinator.com',
    author: 'Cognitive Science',
    category: 'Phương pháp Học'
  },
  {
    title: 'Xu hướng sử dụng Podcast đối thoại AI trong việc phổ biến nghiên cứu hàn lâm',
    url: 'https://news.ycombinator.com',
    author: 'EdTech Journal',
    category: 'Công nghệ Giáo dục'
  },
  {
    title: 'Thiết kế Warm-Cream: Xu hướng giao diện tối giản giúp giảm mỏi mắt khi đọc sách điện tử',
    url: 'https://news.ycombinator.com',
    author: 'UI/UX Collective',
    category: 'Thiết kế Giao diện'
  }
];

export function ProcessingView({ 
  jobId, 
  onComplete,
  onBack 
}: { 
  jobId: string; 
  onComplete: () => void;
  onBack?: () => void;
}) {
  const [status, setStatus] = useState('queued');
  const [error, setError] = useState('');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);

  // 1. Polling for job status
  useEffect(() => {
    let active = true;

    async function doPoll() {
      if (!active) return;
      try {
        const job = await getJobStatus(jobId);
        if (!active) return;
        setStatus(job.status);
        if (job.status === 'completed') { onComplete(); return; }
        if (job.status === 'failed') { setError(job.error || 'Đã xảy ra lỗi không xác định.'); return; }
      } catch {
        // network hiccup — retry
      }
      if (active) setTimeout(doPoll, 2000);
    }

    doPoll();
    return () => { active = false; };
  }, [jobId, onComplete]);

  // 2. Fetching Tech & Science News from Hacker News public API
  useEffect(() => {
    let active = true;
    async function fetchNews() {
      try {
        setLoadingNews(true);
        // Fetch top frontpage stories
        const res = await fetch('https://hn.algolia.com/api/v1/search?tags=front_page');
        if (!res.ok) throw new Error('API failed');
        const data = await res.json();
        
        if (!active) return;
        
        const items = data.hits.slice(0, 4).map((h: any) => {
          const title = h.title;
          const lower = title.toLowerCase();
          
          let category = 'Công nghệ';
          if (lower.includes('ai') || lower.includes('gpt') || lower.includes('llm') || lower.includes('learning')) {
            category = 'AI & Học máy';
          } else if (lower.includes('science') || lower.includes('physics') || lower.includes('quantum') || lower.includes('math')) {
            category = 'Khoa học';
          } else if (lower.includes('design') || lower.includes('ui') || lower.includes('ux') || lower.includes('css')) {
            category = 'Thiết kế';
          }
          
          return {
            title: h.title,
            url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
            author: h.author,
            category
          };
        });
        
        setNews(items);
      } catch (err) {
        console.error('Failed to fetch news, using fallback.', err);
        if (active) setNews(FALLBACK_NEWS);
      } finally {
        if (active) setLoadingNews(false);
      }
    }

    fetchNews();
    return () => { active = false; };
  }, []);

  const currentStep = getCurrentStep(status);
  const isFailed = status === 'failed';

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative select-none bg-[var(--bg-base)] text-[var(--text-primary)]"
    >
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0 z-0" />

      {/* Responsive layout container */}
      <div className="relative z-10 w-full max-w-sm md:max-w-4xl flex flex-col md:grid md:grid-cols-12 gap-12 items-center animate-fade-up">
        
        {/* Left Column: Progress Info */}
        <div className="w-full md:col-span-5 text-center flex flex-col items-center">
          {/* Brand */}
          <p
            className="text-xs font-semibold tracking-[0.22em] uppercase mb-2 text-[var(--accent)]"
          >
            VietAI Scholar
          </p>

          {isFailed ? (
            /* ── Error state ── */
            <div className="animate-fade-in w-full">
              <div className="my-10 flex justify-center">
                <div
                  className="flex h-20 w-20 items-center justify-center rounded-full"
                  style={{ background: 'var(--error-dim)', border: '1px solid var(--error)' }}
                >
                  <svg className="h-9 w-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: 'var(--error)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              </div>
              <p
                className="text-xl font-semibold"
                style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic', color: 'var(--error)' }}
              >
                Xử lý thất bại
              </p>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>

              {onBack && (
                <button
                  onClick={onBack}
                  className="mt-8 text-xs font-semibold px-5 py-2.5 rounded-xl border border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                >
                  Quay lại trang chủ
                </button>
              )}
            </div>
          ) : (
            /* ── Processing state ── */
            <div className="w-full flex flex-col items-center">
              {/* Dual-ring animation */}
              <div className="my-8 flex justify-center animate-ring-in delay-100">
                <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
                  {/* Outer ring — dashed, slow CW */}
                  <div
                    style={{
                      position: 'absolute', inset: 0,
                      borderRadius: '50%',
                      border: '1.5px dashed rgba(204,120,92,0.3)',
                      animation: 'spin-cw 5s linear infinite',
                    }}
                  />
                  {/* Middle ring — solid, CCW */}
                  <div
                    style={{
                      position: 'absolute', inset: 10,
                      borderRadius: '50%',
                      border: '2px solid transparent',
                      borderTopColor: 'var(--accent)',
                      borderRightColor: 'var(--accent)',
                      animation: 'spin-ccw 1.4s linear infinite',
                    }}
                  />
                  {/* Center dot */}
                  <div
                    style={{
                      width: 10, height: 10,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      animation: 'pulse-dot 2s ease-in-out infinite',
                    }}
                  />
                </div>
              </div>

              {/* Status label */}
              <p
                className="text-xl mb-1"
                style={{
                  fontFamily: 'var(--font-fraunces)',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: 'var(--text-primary)',
                }}
              >
                {STATUS_LABELS[status] ?? 'Đang xử lý...'}
              </p>
              <p className="text-[10px] font-mono mb-8 text-[var(--text-secondary)] tracking-tight max-w-[200px] truncate">
                {jobId}
              </p>

              {/* Pipeline stepper */}
              <div
                className="rounded-2xl p-5 w-full border border-[var(--border-normal)] bg-[var(--bg-surface)]"
              >
                <div className="flex items-center justify-between relative">
                  {/* connector line */}
                  <div
                    className="absolute top-3.5 left-3.5 right-3.5"
                    style={{ height: 1, background: 'var(--border-normal)', zIndex: 0 }}
                  />
                  {STEPS.map((step, i) => {
                    const done    = i < currentStep;
                    const active  = i === currentStep;
                    return (
                      <div key={step.label} className="flex flex-col items-center gap-2 relative z-10">
                        {/* Circle */}
                        <div
                          style={{
                            width: 28, height: 28,
                            borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: done || active ? 'var(--accent)' : 'var(--bg-elevated)',
                            border: `1.5px solid ${done || active ? 'var(--accent)' : 'var(--border-normal)'}`,
                            boxShadow: active ? '0 0 0 4px var(--accent-glow)' : 'none',
                            transition: 'all 0.4s ease',
                          }}
                        >
                          {done ? (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                              <path d="M2 6l3 3 5-5" stroke="var(--bg-base)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <span
                              style={{
                                width: 6, height: 6,
                                borderRadius: '50%',
                                background: active ? 'var(--bg-base)' : 'var(--text-secondary)',
                              }}
                            />
                          )}
                        </div>
                        {/* Label */}
                        <span
                          className="text-[10px] font-semibold"
                          style={{
                            color: done || active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            transition: 'color 0.4s ease',
                          }}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Escape hatch button */}
              {onBack && (
                <button
                  onClick={onBack}
                  className="mt-6 text-xs font-semibold px-4 py-2 rounded-xl border border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all cursor-pointer shadow-sm hover:shadow"
                >
                  Chạy ngầm & Quay lại trang chủ
                </button>
              )}
            </div>
          )}
        </div>

        {/* Vertical Divider for desktop */}
        <div className="hidden md:block col-span-1 h-80 border-r border-[var(--border-normal)] justify-self-center" />

        {/* Right Column: Science & Tech News */}
        <div className="w-full md:col-span-6 flex flex-col gap-4 self-start">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-normal)]">
            <h3 
              className="text-sm font-semibold tracking-tight"
              style={{ fontFamily: 'var(--font-be-vietnam)' }}
            >
              📰 Tin tức Khoa học & Công nghệ
            </h3>
            <span className="text-[10px] text-[var(--text-secondary)] font-medium animate-pulse">
              Đang cập nhật...
            </span>
          </div>

          {loadingNews ? (
            /* Shimmer loading */
            <div className="flex flex-col gap-3.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)] flex flex-col gap-2 animate-pulse">
                  <div className="h-3 w-16 bg-[var(--border-normal)] rounded" />
                  <div className="h-4 w-3/4 bg-[var(--border-normal)] rounded" />
                  <div className="h-3 w-24 bg-[var(--border-normal)] rounded" />
                </div>
              ))}
            </div>
          ) : (
            /* News items feed */
            <div className="flex flex-col gap-3.5">
              {news.map((item, idx) => (
                <a
                  key={idx}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 rounded-xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:shadow-sm transition-all duration-200 flex flex-col gap-1.5 group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent)]/20">
                      {item.category}
                    </span>
                    <span className="text-[9px] text-[var(--text-secondary)] font-medium">
                      by @{item.author}
                    </span>
                  </div>
                  <h4 
                    className="text-xs font-semibold text-[var(--text-primary)] leading-relaxed group-hover:text-[var(--accent)] transition-colors line-clamp-2"
                  >
                    {item.title}
                  </h4>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
