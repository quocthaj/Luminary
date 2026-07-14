'use client';
import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const trialUsed = localStorage.getItem('guest_trial_used') === 'true' || document.cookie.includes('guest_trial_used=true');
      if (trialUsed) {
        setShowUpload(true);
      }
    }
  }, []);

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
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] relative select-none flex flex-col scroll-smooth overflow-x-hidden">
      {/* Dynamic Keyframe Animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes float-mockup {
            0%, 100% { transform: translateY(0px) rotateY(-8deg) rotateX(4deg); }
            50% { transform: translateY(-12px) rotateY(-8deg) rotateX(4deg); }
          }
          @keyframes glow-pulse {
            0%, 100% { box-shadow: 0 0 15px rgba(204, 120, 92, 0.08); }
            50% { box-shadow: 0 0 25px rgba(204, 120, 92, 0.16); }
          }
          .animate-float {
            animation: float-mockup 6s ease-in-out infinite;
          }
          .animate-glow {
            animation: glow-pulse 4s ease-in-out infinite;
          }
          .perspective-1000 {
            perspective: 1200px;
          }
        `
      }} />

      {/* Background dot grid */}
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0 z-0" />

      {/* Hero Welcome Fold (Section 1) */}
      <section className="min-h-screen flex flex-col justify-center relative z-10 px-6 sm:px-12 lg:px-20 py-20 max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center w-full">
          
          {/* Cột Trái: Nội dung chào mừng (Editorial Copy) - 7/12 cols */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left animate-fade-up">
            
            {/* Brand Shield Icon */}
            <div className="h-12 w-12 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-md mb-8 transition-transform duration-350 hover:rotate-12 cursor-pointer">
              <svg className="h-6 w-6 text-[var(--bg-base)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>

            <h1
              className="text-5xl sm:text-7xl font-light tracking-tight leading-[1.05]"
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                color: 'var(--accent)',
              }}
            >
              Luminary
            </h1>
            
            <p
              className="mt-6 text-sm sm:text-base text-[var(--text-secondary)] max-w-xl leading-relaxed font-light"
              style={{ fontFamily: 'var(--font-be-vietnam)' }}
            >
              Trải nghiệm trình đọc song ngữ thông minh tích hợp trợ lý học thuật AI dành riêng cho nghiên cứu khoa học. Dịch thuật chuyên sâu, giữ nguyên LaTeX và đồng bộ hóa ngữ cảnh.
            </p>

            {/* CTA Actions */}
            <div className="mt-10 flex flex-col sm:flex-row gap-4 items-center justify-center lg:justify-start w-full sm:w-auto">
              <button
                onClick={() => setShowUpload(true)}
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-xs font-bold tracking-wide shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
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
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl text-xs font-semibold tracking-wide border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] transition-all cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0 duration-200"
                style={{
                  fontFamily: 'var(--font-be-vietnam)',
                }}
              >
                Đăng nhập tài khoản
              </button>
            </div>
          </div>

          {/* Cột Phải: Mockup Interactive của Trình Đọc Song Ngữ - 5/12 cols */}
          <div className="lg:col-span-5 flex justify-center items-center perspective-1000 mt-8 lg:mt-0 animate-fade-in delay-200">
            <div className="w-full max-w-[430px] rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] overflow-hidden shadow-[0_20px_50px_rgba(204,120,92,0.07)] animate-float animate-glow transition-all duration-500 hover:scale-[1.02]">
              
              {/* Mock Browser Header */}
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/80" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400/80" />
                </div>
                <div className="flex-1 max-w-[240px] mx-auto rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] text-[10px] text-[var(--text-muted)] text-center py-0.5 select-none font-mono">
                  luminary.scholar/workspace
                </div>
              </div>

              {/* Mock Bilingual Reader Layout */}
              <div className="p-4 grid grid-cols-2 gap-3 h-52 bg-[var(--bg-base)]">
                
                {/* Cột English */}
                <div className="border-r border-[var(--border-subtle)] pr-2 flex flex-col gap-2 overflow-hidden">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] font-bold">English (Original)</span>
                  <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed">
                    We define the standard state vector model representing quantum entanglement as:
                  </p>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-center py-2.5 font-mono text-[9px] text-[var(--accent)]">
                    {"|\\psi\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)"}
                  </div>
                </div>

                {/* Cột Tiếng Việt */}
                <div className="pl-1 flex flex-col gap-2 overflow-hidden bg-[var(--accent-dim)]/20 p-1.5 rounded-lg border border-[var(--accent)]/10">
                  <span className="text-[9px] uppercase tracking-wider text-[var(--accent)] font-bold">Tiếng Việt (Translation)</span>
                  <p className="text-[10px] text-[var(--text-primary)] leading-relaxed font-medium">
                    Chúng tôi xác định mô hình vector trạng thái chuẩn biểu diễn liên đới lượng tử là:
                  </p>
                  <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--accent)]/30 flex items-center justify-center py-2.5 font-mono text-[9px] text-[var(--accent)]">
                    {"|\\psi\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle)"}
                  </div>
                </div>

              </div>

              {/* Mock AI Tutor Chat Bubble (Floating widget) */}
              <div className="border-t border-[var(--border-subtle)] p-3 bg-[var(--bg-surface)] flex gap-2.5 items-start">
                <div className="w-6 h-6 rounded-lg bg-[var(--accent)] flex items-center justify-center flex-shrink-0 text-white font-serif text-[10px] font-bold">
                  AI
                </div>
                <div className="flex-1 bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-xl p-2.5 shadow-sm">
                  <p className="text-[9px] text-[var(--text-primary)] leading-relaxed">
                    <strong className="text-[var(--accent)]">AI Tutor:</strong> Phương trình thể hiện trạng thái chồng chập Bell, một trạng thái liên đới lượng tử cực đại...
                  </p>
                </div>
              </div>

            </div>
          </div>

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
      <section className="relative z-10 w-full max-w-5xl mx-auto py-24 px-6 flex flex-col justify-center border-t border-[var(--border-subtle)]">
        <div className="text-center mb-20">
          <h2 
            className="text-4xl font-light tracking-tight text-[var(--text-primary)]"
            style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}
          >
            Tính năng nổi bật của hệ thống
          </h2>
          <div className="w-10 h-[2px] bg-[var(--accent)] mx-auto mt-4 rounded-full" />
        </div>

        {/* Asymmetric Editorial Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Card 1: Dịch song ngữ (Wider: col-span-7) */}
          <div className="md:col-span-7 p-8 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 flex flex-col justify-between group">
            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5c-.006 2.16-.454 4.258-1.319 6.18" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Dịch song ngữ thông minh</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Tối ưu hóa sâu sắc cho các thuật ngữ khoa học từ Anh sang Việt. Bố cục song ngữ hiển thị hai cột đối chiếu từng câu chuẩn xác, giúp người đọc nghiên cứu hiệu quả gấp 3 lần.
                </p>
              </div>
            </div>
          </div>

          {/* Card 2: Bảo toàn LaTeX (Shorter: col-span-5) */}
          <div className="md:col-span-5 p-8 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 flex flex-col justify-between group">
            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Bảo toàn công thức LaTeX</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Bảo vệ trọn vẹn cấu trúc toán học phức tạp, bảng số liệu và citations tham khảo của văn bản gốc, render trực tiếp qua thư viện KaTeX hiệu năng cao.
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: AI Tutor & Active Learning (Shorter: col-span-5) */}
          <div className="md:col-span-5 p-8 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 flex flex-col justify-between group">
            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Không gian học tập & AI Tutor</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Tương tác đàm thoại thông minh (RAG) kết nối trực tiếp với tài liệu. Tự động sinh thẻ ghi nhớ (Flashcards), câu hỏi trắc nghiệm (Quiz) và sơ đồ tư duy (Mindmap).
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: So sánh đa tài liệu & Thesis Defense (Wider: col-span-7) */}
          <div className="md:col-span-7 p-8 rounded-2xl border border-[var(--border-normal)] bg-[var(--bg-surface)] hover:border-[var(--accent)] hover:shadow-lg transition-all duration-300 flex flex-col justify-between group">
            <div className="flex gap-4 items-start">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)] mb-2" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>Tổng hợp & Phòng phản biện ảo</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Hỗ trợ nghiên cứu chéo nhiều tài liệu cùng lúc để tổng hợp tri thức. Phòng phản biện luận án ảo giúp học viên rèn luyện tư duy phản biện trước hội đồng chuyên gia AI.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Action button at the bottom of features */}
        <div className="text-center mt-16">
          <button
            onClick={() => setShowUpload(true)}
            className="px-10 py-4 rounded-xl text-xs font-bold tracking-wide shadow-md transition-all duration-200 hover:shadow-lg cursor-pointer transform hover:-translate-y-0.5"
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
      <footer className="py-12 border-t border-[var(--border-subtle)] text-center text-xs text-[var(--text-muted)] relative z-10 bg-[var(--bg-surface)]/30">
        &copy; {new Date().getFullYear()} Luminary Scholar Hub. Được thiết kế cho trải nghiệm học tập học thuật tối cao.
      </footer>

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />
    </div>
  );
}
