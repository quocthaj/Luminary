'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { UploadView } from './UploadView';
import { LoginModal } from './LoginModal';

interface LandingViewProps {
  onJobCreated: (jobId: string) => void;
}

export function LandingView({ onJobCreated }: LandingViewProps) {
  const { data: session, status } = useSession();
  const [showUpload, setShowUpload] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const isUserAuthenticated = status === 'authenticated';

  // If the user has entered the app workspace (authenticated or clicked "Trải nghiệm ngay")
  if (isUserAuthenticated || showUpload) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] relative select-none">
        {/* Background dot grid */}
        <div aria-hidden className="dot-grid pointer-events-none fixed inset-0 z-0" />
        
        {/* Return to welcome screen button for guests */}
        {!isUserAuthenticated && showUpload && (
          <button
            onClick={() => setShowUpload(false)}
            className="absolute top-6 left-6 z-40 flex items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Quay lại
          </button>
        )}

        <div className="relative z-10 w-full min-h-screen flex flex-col items-center justify-center">
          <UploadView onJobCreated={onJobCreated} />
        </div>
      </div>
    );
  }

  // Welcome page for anonymous users with scrollable features section
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] relative select-none flex flex-col scroll-smooth">
      {/* Background dot grid */}
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0 z-0" />

      {/* Hero Welcome Fold (Section 1) */}
      <section className="h-screen flex flex-col items-center justify-center relative z-10 px-6 text-center">
        {/* Brand Shield Icon */}
        <div className="h-14 w-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-md mb-6 animate-fade-up">
          <svg className="h-8 w-8 text-[var(--bg-base)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <h1
          className="text-5xl sm:text-6xl font-light tracking-tight leading-[1.1] text-[var(--text-primary)] animate-fade-up"
          style={{
            fontFamily: 'var(--font-fraunces)',
            fontStyle: 'italic',
          }}
        >
          Luminary
        </h1>
        
        <p
          className="mt-4 text-sm sm:text-base text-[var(--text-secondary)] max-w-md leading-relaxed font-light animate-fade-up"
          style={{ fontFamily: 'var(--font-be-vietnam)' }}
        >
          Dịch thuật học thuật song ngữ chuyên sâu, giữ nguyên định dạng công thức LaTeX và đàm thoại cùng AI Tutor.
        </p>

        {/* CTA Actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center animate-fade-up">
          <button
            onClick={() => setShowUpload(true)}
            className="px-8 py-3.5 rounded-full text-xs font-bold tracking-wide shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg-base)',
              fontFamily: 'var(--font-be-vietnam)',
            }}
          >
            Trải nghiệm ngay
          </button>
          
          <button
            onClick={() => setShowLoginModal(true)}
            className="px-8 py-3.5 rounded-full text-xs font-semibold tracking-wide border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
            style={{
              fontFamily: 'var(--font-be-vietnam)',
            }}
          >
            Đăng nhập tài khoản
          </button>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-60 hover:opacity-100 transition-opacity cursor-pointer z-20">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--text-muted)]">
            Cuộn xuống để xem tính năng
          </span>
          <svg className="h-4 w-4 text-[var(--accent)] animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7-7-7" />
          </svg>
        </div>
      </section>

      {/* Features Showcase Section (Section 2) */}
      <section className="relative z-10 w-full max-w-4xl mx-auto py-24 px-6 flex flex-col justify-center">
        <div className="text-center mb-16">
          <h2 
            className="text-3xl sm:text-4xl font-light tracking-tight text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
          >
            Tính năng nổi bật của hệ thống
          </h2>
          <div className="w-12 h-1 bg-[var(--accent)] mx-auto mt-4 rounded-full" />
        </div>

        {/* Grid cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1 */}
          <div className="p-6 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-350 shadow-sm flex gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5c-.006 2.16-.454 4.258-1.319 6.18" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Dịch song ngữ thông minh</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Hệ thống dịch thuật học thuật chuyên sâu tối ưu hóa thuật ngữ khoa học từ Anh sang Việt, hiển thị bố cục song ngữ trực quan để đối chiếu từng câu.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="p-6 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-350 shadow-sm flex gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Bảo toàn công thức LaTeX</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Đảm bảo các ký hiệu toán học, sơ đồ bảng biểu phức tạp và hệ thống citations tham chiếu của bài viết gốc được giữ nguyên vẹn 100% không lỗi định dạng.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="p-6 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-350 shadow-sm flex gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Không gian học tập & AI Tutor</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Không chỉ dịch, trợ lý học thuật AI Tutor sẽ giúp bạn giải nghĩa thuật ngữ, khởi tạo sơ đồ tư duy, thẻ ghi nhớ từ vựng và câu hỏi trắc nghiệm tự ôn luyện.
              </p>
            </div>
          </div>

          {/* Card 4 */}
          <div className="p-6 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-350 shadow-sm flex gap-4">
            <div className="h-10 w-10 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">Tổng hợp so sánh đa tài liệu</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Hỗ trợ phân tích đồng thời nhiều bài báo nghiên cứu khác nhau để tự động lập báo cáo đối chiếu, chỉ ra các điểm chung và sự khác biệt về phương pháp luận.
              </p>
            </div>
          </div>
        </div>

        {/* Action button at the bottom of features */}
        <div className="text-center mt-12">
          <button
            onClick={() => setShowUpload(true)}
            className="px-10 py-3.5 rounded-full text-xs font-bold tracking-wide shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
            style={{
              background: 'var(--accent)',
              color: 'var(--bg-base)',
              fontFamily: 'var(--font-be-vietnam)',
            }}
          >
            Trải nghiệm dịch thuật ngay
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)] relative z-10">
        &copy; {new Date().getFullYear()} Luminary Scholar Hub. Bảo lưu mọi quyền.
      </footer>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
    </div>
  );
}
