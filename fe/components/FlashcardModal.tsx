'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateFlashcards, checkFlashcardStatus, FlashcardItem } from '../lib/api';
import katex from 'katex';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render inline/block KaTeX expressions inside plain text. */
function renderWithKatex(text: string): string {
  if (!text) return '';
  return text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
      catch { return `<code>${expr}</code>`; }
    })
    .replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
      catch { return `<code>${expr}</code>`; }
    });
}

// ─── Progressive loading messages ─────────────────────────────────────────────

const LOADING_STAGES = [
  { at: 0,     text: '🔍 Đang phân tích nội dung học thuật...' },
  { at: 4000,  text: '🧠 Đang trích xuất thuật ngữ chuyên ngành...' },
  { at: 10000, text: '✨ Đang tạo định nghĩa song ngữ và phát âm...' },
  { at: 18000, text: '⏳ Đang hoàn thiện các thẻ ghi nhớ...' },
];

function useProgressiveLoading(active: boolean) {
  const [stageText, setStageText] = useState(LOADING_STAGES[0].text);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (!active) {
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      setStageText(LOADING_STAGES[0].text);
      return;
    }
    setStageText(LOADING_STAGES[0].text);
    const timers = LOADING_STAGES.slice(1).map(({ at, text }) =>
      setTimeout(() => setStageText(text), at)
    );
    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [active]);

  return stageText;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface FlashcardModalProps {
  isOpen: boolean;
  jobId: string;
  onClose: () => void;
}

type FlashcardPhase = 'setup' | 'loading' | 'playing';

// ─── Main Component ─────────────────────────────────────────────────────────────

export function FlashcardModal({ isOpen, jobId, onClose }: FlashcardModalProps) {
  const [phase, setPhase] = useState<FlashcardPhase>('setup');
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [requestedCount, setRequestedCount] = useState<number>(10);
  const [isFlipped, setIsFlipped] = useState(false);

  const loadingText = useProgressiveLoading(phase === 'loading' && isOpen);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    setPhase('setup');
    setFlashcards([]);
    setErrorMsg(null);
    setCurrentIdx(0);
    setRequestedCount(10);
    setIsFlipped(false);
  }, [isOpen]);

  const handleStartGeneration = useCallback((count: number) => {
    setPhase('loading');
    setErrorMsg(null);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    generateFlashcards(jobId, count)
      .then((data) => {
        const effectiveStatus = data.status || (data.flashcards ? 'COMPLETED' : undefined);

        if (effectiveStatus === 'COMPLETED' && data.flashcards) {
          setFlashcards(data.flashcards);
          setPhase('playing');
        } else if (effectiveStatus === 'GENERATING') {
          let ticks = 0;
          const maxTicks = 45; // 90 seconds (45 * 2s)

          pollIntervalRef.current = setInterval(() => {
            ticks++;
            if (ticks > maxTicks) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setErrorMsg('Quá trình tạo thẻ ghi nhớ mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.');
              setPhase('setup');
              return;
            }

            checkFlashcardStatus(jobId, count)
              .then((statusData) => {
                if (statusData.status === 'COMPLETED' && statusData.flashcards) {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setFlashcards(statusData.flashcards);
                  setPhase('playing');
                } else if (statusData.status === 'FAILED') {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setErrorMsg('Gemini không thể phân tích bài báo để tạo thẻ ghi nhớ. Vui lòng thử lại.');
                  setPhase('setup');
                }
              })
              .catch((err) => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                setErrorMsg(err.message || 'Lỗi kiểm tra trạng thái thẻ ghi nhớ.');
                setPhase('setup');
              });
          }, 2000);
        } else if (effectiveStatus === 'FAILED') {
          setErrorMsg('Tạo thẻ ghi nhớ thất bại.');
          setPhase('setup');
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Không thể bắt đầu tạo thẻ ghi nhớ.');
        setPhase('setup');
      });
  }, [jobId]);

  const handleNext = useCallback(() => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    // Wait for flip transition to reset before changing card
    setTimeout(() => {
      setCurrentIdx((prev) => (prev + 1) % flashcards.length);
    }, 150);
  }, [flashcards]);

  const handlePrev = useCallback(() => {
    if (flashcards.length === 0) return;
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }, 150);
  }, [flashcards]);

  // Touch Swipe Handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartXRef.current;
    if (diffX > 50) {
      handlePrev();
    } else if (diffX < -50) {
      handleNext();
    }
    touchStartXRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    if (phase !== 'playing' || !isOpen || flashcards.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsFlipped((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, isOpen, flashcards, handleNext, handlePrev]);

  if (!isOpen) return null;

  const currentCard = flashcards[currentIdx];
  const isPartial = flashcards.length > 0 && flashcards.length < requestedCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-all duration-300 animate-fadeIn"
      id="flashcard-modal"
      data-testid="flashcard-modal"
    >
      {/* Styles Injection */}
      <style>{`
        .flashcard-container {
          perspective: 1000px;
        }
        .flashcard-inner {
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          transform-style: preserve-3d;
        }
        .flashcard-inner.flipped {
          transform: rotateY(180deg);
        }
        .flashcard-front, .flashcard-back {
          backface-visibility: hidden;
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
        }
        .flashcard-back {
          transform: rotateY(180deg);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
      `}</style>

      <div className="relative w-full max-w-lg bg-[var(--bg-base)] border border-[var(--border-normal)] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <h3 className="text-sm font-bold text-[var(--text-primary)] tracking-wide">
              Thẻ Ghi Nhớ Học Thuật
            </h3>
          </div>
          <button
            onClick={onClose}
            id="flashcard-close-btn"
            data-testid="flashcard-close-btn"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors p-1 rounded-lg hover:bg-[var(--bg-elevated)]/40 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ─── SETUP STATE ─── */}
        {phase === 'setup' && (
          <div className="p-8 flex flex-col items-center text-center gap-6" id="flashcard-setup-state">
            <div className="h-16 w-16 rounded-2xl bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)]">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>

            <div>
              <h4 className="text-base font-semibold text-[var(--text-primary)] mb-2">Tự Động Sinh Thẻ Ghi Nhớ</h4>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm leading-relaxed">
                Hệ thống AI sẽ quét nội dung bài báo khoa học, tự động lọc ra các thuật ngữ chuyên ngành khó để tạo thẻ học song ngữ Anh - Việt.
              </p>
            </div>

            {errorMsg && (
              <div className="w-full p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2 text-left">
                <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="font-semibold mb-0.5">Không thể tạo thẻ</p>
                  <p className="opacity-90">{errorMsg}</p>
                </div>
              </div>
            )}

            <div className="w-full flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-2 text-left">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Số Lượng Thẻ Muốn Tạo
                </label>
                <div className="relative">
                  <select
                    id="flashcard-count-select"
                    data-testid="flashcard-count-select"
                    value={requestedCount}
                    onChange={(e) => setRequestedCount(Number(e.target.value))}
                    className="w-full bg-[var(--bg-surface)] border border-[var(--border-normal)] text-[var(--text-primary)] text-xs rounded-xl px-4 py-3.5 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer appearance-none animate-none"
                  >
                    <option value={5}>5 thẻ ghi nhớ</option>
                    <option value={10}>10 thẻ ghi nhớ (Khuyên dùng)</option>
                    <option value={20}>20 thẻ ghi nhớ</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-[var(--text-secondary)]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleStartGeneration(requestedCount)}
                id="flashcard-start-btn"
                data-testid="flashcard-start-btn"
                className="w-full bg-[var(--accent)] text-[var(--bg-base)] text-xs font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-[var(--accent)]/20"
              >
                Bắt đầu tạo thẻ với AI
              </button>
            </div>
          </div>
        )}

        {/* ─── LOADING STATE ─── */}
        {phase === 'loading' && (
          <div className="p-12 flex flex-col items-center text-center gap-6" id="flashcard-loading-state">
            <div className="relative flex items-center justify-center">
              {/* Outer spin */}
              <div className="h-16 w-16 rounded-full border-2 border-[var(--border-normal)] border-t-[var(--accent)] animate-spin" />
              {/* Inner pulsed logo */}
              <div className="absolute h-8 w-8 rounded-lg bg-[var(--accent-dim)] flex items-center justify-center text-[var(--accent)] animate-pulse">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                AI LUMINARY IS GENERATING
              </h4>
              <p className="text-sm font-semibold text-[var(--text-primary)] animate-pulse min-h-[1.5rem]">
                {loadingText}
              </p>
            </div>

            <p className="text-[10px] text-[var(--text-muted)] max-w-xs leading-relaxed">
              Quá trình xử lý bài báo khoa học nâng cao có thể mất từ 15 đến 30 giây để đảm bảo độ chính xác học thuật của các thuật ngữ.
            </p>
          </div>
        )}

        {/* ─── PLAYING STATE ─── */}
        {phase === 'playing' && currentCard && (
          <div className="p-6 flex flex-col gap-6" id="flashcard-playing-state">
            
            {/* Partial warning */}
            {isPartial && (
              <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 flex items-start gap-2 leading-relaxed">
                <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>
                  Bài nghiên cứu chuyên sâu này chứa lượng từ hạn chế — chúng tôi trích chọn được <strong>{flashcards.length} thẻ</strong> chất lượng nhất.
                </span>
              </div>
            )}

            {/* Pagination header & progress */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-secondary)] font-medium">
                Thẻ <span className="text-[var(--text-primary)] font-bold">{currentIdx + 1}</span> / {flashcards.length}
              </span>
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                Space hoặc Click để lật thẻ
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden flex gap-0.5">
              {flashcards.map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-full transition-all duration-300"
                  style={{
                    backgroundColor: i === currentIdx
                      ? 'var(--accent)'
                      : i < currentIdx
                      ? 'var(--accent-glow)'
                      : 'var(--border-subtle)'
                  }}
                />
              ))}
            </div>

            {/* 3D Flip Card Container */}
            <div 
              className="flashcard-container relative w-full h-72 cursor-pointer group"
              onClick={() => setIsFlipped(prev => !prev)}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <div className={`flashcard-inner relative w-full h-full rounded-2xl border border-[var(--border-normal)] shadow-lg ${isFlipped ? 'flipped' : ''}`}>
                
                {/* FRONT SIDE (Term & Pronunciation) */}
                <div className="flashcard-front bg-[var(--bg-surface)] rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4">
                  <div className="absolute top-4 right-4 text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-widest bg-[var(--bg-elevated)]/60 px-2.5 py-1 rounded-full border border-[var(--border-subtle)]">
                    Mặt trước (Term)
                  </div>

                  <h1
                    id="flashcard-term"
                    data-testid="flashcard-term"
                    className="text-2xl md:text-3xl font-extrabold text-[var(--text-primary)] leading-tight px-4"
                    dangerouslySetInnerHTML={{ __html: renderWithKatex(currentCard.term) }}
                  />

                  {currentCard.pronunciation && currentCard.pronunciation.trim() !== '' && (
                    <div 
                      id="flashcard-pronunciation"
                      data-testid="flashcard-pronunciation"
                      className="text-sm text-[var(--accent)] font-medium tracking-wide bg-[var(--accent-dim)] border border-[var(--accent-glow)] px-3.5 py-1 rounded-full"
                    >
                      {currentCard.pronunciation}
                    </div>
                  )}

                  <div className="text-[10px] text-[var(--text-secondary)] flex items-center gap-1 mt-2">
                    <svg className="h-3.5 w-3.5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 15.89M9 11l3 3L22 4" />
                    </svg>
                    <span>Lật để xem định nghĩa</span>
                  </div>
                </div>

                {/* BACK SIDE (Translation & Definition) */}
                <div className="flashcard-back bg-[var(--bg-surface)] rounded-2xl p-6 flex flex-col justify-between border-2 border-[var(--accent-glow)]">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold text-[var(--accent)] uppercase tracking-widest bg-[var(--accent-dim)] px-2.5 py-1 rounded-full">
                      Mặt sau (Definition)
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] font-semibold" dangerouslySetInnerHTML={{ __html: renderWithKatex(currentCard.term) }} />
                  </div>

                  {/* Body translation + definition */}
                  <div className="my-auto flex flex-col gap-4 py-2">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                        Bản dịch
                      </span>
                      <h2
                        id="flashcard-translation"
                        data-testid="flashcard-translation"
                        className="text-lg font-bold text-[var(--text-primary)] leading-snug"
                        dangerouslySetInnerHTML={{ __html: renderWithKatex(currentCard.translation) }}
                      />
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] block mb-1">
                        Định nghĩa song ngữ
                      </span>
                      <div
                        id="flashcard-definition"
                        data-testid="flashcard-definition"
                        className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium overflow-y-auto max-h-24 pr-1"
                        dangerouslySetInnerHTML={{ __html: renderWithKatex(currentCard.definition) }}
                      />
                    </div>
                  </div>

                  <div className="text-[9px] text-[var(--text-muted)] text-center">
                    Click chuột hoặc chạm để quay lại mặt trước
                  </div>
                </div>

              </div>
            </div>

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={(e) => { e.stopPropagation(); handlePrev(); }}
                id="flashcard-prev-btn"
                data-testid="flashcard-prev-btn"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[var(--border-normal)] text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/40 transition-all cursor-pointer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Trước đó
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); setIsFlipped(f => !f); }}
                className="px-5 py-2.5 rounded-xl bg-[var(--bg-elevated)]/60 border border-[var(--border-normal)] text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] active:scale-95 transition-all cursor-pointer"
              >
                Lật thẻ
              </button>

              <button
                onClick={(e) => { e.stopPropagation(); handleNext(); }}
                id="flashcard-next-btn"
                data-testid="flashcard-next-btn"
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)] hover:text-[var(--bg-base)] active:scale-95 transition-all cursor-pointer"
              >
                Tiếp theo
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
