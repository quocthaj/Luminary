'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { generateQuiz, checkQuizStatus, createQuizShare, QuizData, QuizQuestion } from '../lib/api';
import katex from 'katex';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render inline KaTeX expressions inside plain text (no full markdown). */
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
  { at: 0,     text: '🔍 Đang đọc bài nghiên cứu...' },
  { at: 4000,  text: '🧠 Đang tạo câu hỏi trắc nghiệm...' },
  { at: 10000, text: '✨ Đang kiểm tra chất lượng câu hỏi...' },
  { at: 18000, text: '⏳ Bài này có nhiều nội dung, đang hoàn thiện...' },
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

// ─── Option label helper ───────────────────────────────────────────────────────

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface QuizModalProps {
  isOpen: boolean;
  jobId: string;
  onClose: () => void;
}

type QuizPhase = 'setup' | 'loading' | 'playing' | 'submitted';

// ─── Main Component ─────────────────────────────────────────────────────────────

export function QuizModal({ isOpen, jobId, onClose }: QuizModalProps) {
  const [phase, setPhase] = useState<QuizPhase>('setup');
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<(number | null)[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const loadingText = useProgressiveLoading(phase === 'loading' && isOpen);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Load quiz when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    // Reset state
    setPhase('setup');
    setQuiz(null);
    setErrorMsg(null);
    setSelected([]);
    setCurrentQ(0);
    setQuestionCount(10);
  }, [isOpen]);

  const handleStartGeneration = useCallback((count: number) => {
    setPhase('loading');
    setErrorMsg(null);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    generateQuiz(jobId, count)
      .then((data) => {
        // Backward compatibility for mock/legacy responses without status field
        const effectiveStatus = data.status || (data.questions ? 'COMPLETED' : undefined);

        if (effectiveStatus === 'COMPLETED' && data.questions) {
          const quizData: QuizData = {
            questions: data.questions,
            questionCount: data.questions.length,
          };
          setQuiz(quizData);
          setSelected(new Array(quizData.questionCount).fill(null));
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
              setErrorMsg('Quá trình tạo quiz mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.');
              setPhase('playing');
              return;
            }

            checkQuizStatus(jobId, count)
              .then((statusData) => {
                if (statusData.status === 'COMPLETED' && statusData.questions) {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  const quizData: QuizData = {
                    questions: statusData.questions,
                    questionCount: statusData.questions.length,
                  };
                  setQuiz(quizData);
                  setSelected(new Array(quizData.questionCount).fill(null));
                  setPhase('playing');
                } else if (statusData.status === 'FAILED') {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setErrorMsg(statusData.error || 'Không thể tạo quiz. Vui lòng thử lại sau.');
                  setPhase('playing');
                }
              })
              .catch((err) => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                setErrorMsg(err?.message || 'Không thể kiểm tra trạng thái tạo quiz.');
                setPhase('playing');
              });
          }, 2000);
        } else {
          setErrorMsg('Phản hồi không hợp lệ từ máy chủ.');
          setPhase('playing');
        }
      })
      .catch((err) => {
        setErrorMsg(err?.message || 'Không thể tạo quiz. Vui lòng thử lại sau.');
        setPhase('playing');
      });
  }, [jobId]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSelect = useCallback((optionIdx: number) => {
    if (phase !== 'playing' || !quiz) return;
    setSelected(prev => {
      const next = [...prev];
      next[currentQ] = optionIdx;
      return next;
    });
  }, [phase, quiz, currentQ]);

  const handleSubmit = useCallback(() => {
    setPhase('submitted');
  }, []);

  const handleRetry = useCallback(() => {
    if (!quiz) return;
    setSelected(new Array(quiz.questionCount).fill(null));
    setCurrentQ(0);
    setPhase('playing');
  }, [quiz]);

  const handleShareQuiz = useCallback(async () => {
    if (!jobId) return;
    try {
      setSharing(true);
      const res = await createQuizShare(jobId, quiz?.questionCount || 5);
      const fullUrl = `${window.location.origin}${res.shareUrl}`;
      await navigator.clipboard.writeText(fullUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Không thể tạo liên kết chia sẻ.');
    } finally {
      setSharing(false);
    }
  }, [jobId, quiz]);

  const score = quiz
    ? quiz.questions.reduce((acc, q, i) => acc + (selected[i] === q.correctOptionIndex ? 1 : 0), 0)
    : 0;

  if (!isOpen) return null;

  const q: QuizQuestion | undefined = quiz?.questions[currentQ];
  const isLastQ = quiz ? currentQ === quiz.questionCount - 1 : false;
  const allAnswered = selected.every(s => s !== null);
  const isPartial = quiz && quiz.questionCount < questionCount;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Quiz trắc nghiệm"
      id="quiz-modal"
    >
      <div
        className="w-full max-w-2xl bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-up max-h-[90vh]"
        style={{ boxShadow: '0 0 60px rgba(var(--accent-rgb, 99 102 241) / 0.12)' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-glow)] flex items-center justify-center">
              <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Trắc nghiệm AI</h3>
              {quiz && phase !== 'loading' && phase !== 'setup' && (
                <p className="text-[10px] text-[var(--text-muted)]">
                  {phase === 'submitted'
                    ? `Kết quả: ${score}/${quiz.questionCount} câu đúng`
                    : `Câu ${currentQ + 1} / ${quiz.questionCount}`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {quiz && phase !== 'loading' && phase !== 'setup' && (
              <button
                onClick={handleShareQuiz}
                disabled={sharing}
                id="quiz-share-btn"
                data-testid="quiz-share-btn"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)] hover:text-[#080b12] transition-all cursor-pointer"
                title="Chia sẻ bài trắc nghiệm này"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                {shareCopied ? 'Đã chép link! ✓' : sharing ? 'Đang tạo...' : 'Chia sẻ'}
              </button>
            )}
            <button
              onClick={onClose}
              id="quiz-modal-close"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* ─ SETUP STATE ─ */}
          {phase === 'setup' && (
            <div className="flex flex-col items-center justify-center gap-6 py-12 px-8" id="quiz-setup-state">
              <div className="h-12 w-12 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-glow)] flex items-center justify-center">
                <svg className="h-6 w-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="text-center max-w-sm">
                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">Cấu hình bài kiểm tra AI</h4>
                <p className="text-xs text-[var(--text-secondary)]">Chọn số lượng câu hỏi trắc nghiệm bạn muốn tạo từ bài báo nghiên cứu này.</p>
              </div>

              <div className="grid grid-cols-3 gap-3 w-full max-w-md">
                {[
                  { count: 5, label: '5 câu', desc: 'Nhanh chóng' },
                  { count: 10, label: '10 câu', desc: 'Tiêu chuẩn' },
                  { count: 20, label: '20 câu', desc: 'Thách thức' },
                ].map((opt) => {
                  const isSelected = questionCount === opt.count;
                  return (
                    <button
                      key={opt.count}
                      onClick={() => setQuestionCount(opt.count)}
                      type="button"
                      data-testid={`quiz-setup-opt-${opt.count}`}
                      className="flex flex-col items-center justify-center p-3.5 rounded-xl border transition-all cursor-pointer text-center"
                      style={{
                        background: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        borderColor: isSelected ? 'var(--accent)' : 'var(--border-subtle)',
                      }}
                    >
                      <span className="text-lg font-black" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}>
                        {opt.count}
                      </span>
                      <span className="text-xs font-bold text-[var(--text-primary)] mt-1">{opt.label}</span>
                      <span className="text-[9px] text-[var(--text-secondary)] opacity-75 mt-0.5">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => handleStartGeneration(questionCount)}
                className="w-full max-w-xs py-2.5 rounded-xl bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5 shadow-md mt-2"
                id="start-quiz-generation-btn"
                data-testid="start-quiz-generation-btn"
              >
                Bắt đầu tạo
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          {/* ─ LOADING STATE ─ */}
          {phase === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-5 py-16 px-8" id="quiz-loading-state">
              <div className="relative h-14 w-14">
                <div className="absolute inset-0 rounded-full border-4 border-[var(--border-subtle)]" />
                <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent)] animate-spin" />
              </div>
              <p className="text-sm font-semibold text-[var(--text-secondary)] text-center transition-all duration-500">
                {loadingText}
              </p>
              <p className="text-[10px] text-[var(--text-muted)] text-center max-w-xs">
                Gemini đang phân tích bài báo và tạo câu hỏi về các khái niệm cốt lõi.
              </p>
            </div>
          )}

          {/* ─ ERROR STATE ─ */}
          {phase === 'playing' && errorMsg && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-8 text-center" id="quiz-error-state">
              <div className="h-12 w-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">Không thể tạo quiz</p>
                <p className="text-xs text-[var(--text-secondary)]">{errorMsg}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setErrorMsg(null); setPhase('setup'); setSelected([]); setCurrentQ(0); setQuiz(null); }}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                  id="quiz-retry-after-error"
                >
                  Thử lại
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-[var(--border-normal)] text-[var(--text-secondary)] text-xs font-medium hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  Đóng
                </button>
              </div>
            </div>
          )}

          {/* ─ PLAYING STATE ─ */}
          {phase === 'playing' && quiz && q && !errorMsg && (
            <div className="p-6 flex flex-col gap-5" id="quiz-playing-state">

              {/* Partial quiz notice */}
              {isPartial && (
                <div className="px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Bài nghiên cứu này đặc biệt chuyên sâu — chúng tôi chọn lọc được{' '}
                    <strong>{quiz.questionCount} câu hỏi</strong> chất lượng nhất cho bạn.
                  </span>
                </div>
              )}

              {/* Progress bar */}
              <div className="flex items-center gap-2">
                {quiz.questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className="flex-1 h-1.5 rounded-full transition-all cursor-pointer"
                    style={{
                      background: i === currentQ
                        ? 'var(--accent)'
                        : selected[i] !== null
                        ? 'var(--success, #22c55e)'
                        : 'var(--border-normal)',
                    }}
                    title={`Câu ${i + 1}`}
                  />
                ))}
              </div>

              {/* Question */}
              <div className="rounded-xl bg-[var(--bg-elevated)]/50 border border-[var(--border-subtle)] p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)] mb-3">
                  Câu hỏi {currentQ + 1}
                </p>
                <div
                  className="text-sm font-semibold text-[var(--text-primary)] leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderWithKatex(q.questionText) }}
                />
              </div>

              {/* Options */}
              <div className="flex flex-col gap-2.5" id={`quiz-question-${currentQ}`}>
                {q.options.map((opt, i) => {
                  const isSelected = selected[currentQ] === i;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(i)}
                      id={`quiz-option-${currentQ}-${i}`}
                      data-testid={`quiz-option-${currentQ}-${i}`}
                      className="flex items-start gap-3 text-left p-4 rounded-xl border transition-all cursor-pointer w-full group"
                      style={{
                        background: isSelected ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        borderColor: isSelected ? 'var(--accent-glow)' : 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span
                        className="flex-shrink-0 h-6 w-6 rounded-lg flex items-center justify-center text-[10px] font-bold border transition-colors"
                        style={{
                          background: isSelected ? 'var(--accent)' : 'var(--bg-surface)',
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border-normal)',
                          color: isSelected ? '#080b12' : 'var(--text-secondary)',
                        }}
                      >
                        {OPTION_LABELS[i]}
                      </span>
                      <span
                        className="text-xs leading-relaxed pt-0.5"
                        dangerouslySetInnerHTML={{ __html: renderWithKatex(opt) }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--border-normal)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Câu trước
                </button>

                {isLastQ ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!allAnswered}
                    id="quiz-submit-btn"
                    data-testid="quiz-submit-btn"
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Nộp bài
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQ(q => Math.min(quiz.questionCount - 1, q + 1))}
                    disabled={selected[currentQ] === null}
                    id="quiz-next-btn"
                    data-testid="quiz-next-btn"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] text-xs font-bold hover:bg-[var(--accent)] hover:text-[#080b12] disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                  >
                    Câu tiếp
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─ SUBMITTED STATE ─ */}
          {phase === 'submitted' && quiz && (
            <div className="p-6 flex flex-col gap-5" id="quiz-results-state">

              {/* Score card */}
              <div className="rounded-2xl border border-[var(--border-normal)] p-6 text-center"
                style={{
                  background: score === quiz.questionCount
                    ? 'rgba(34, 197, 94, 0.08)'
                    : score >= Math.ceil(quiz.questionCount / 2)
                    ? 'var(--accent-dim)'
                    : 'rgba(239, 68, 68, 0.08)',
                  borderColor: score === quiz.questionCount
                    ? 'rgba(34, 197, 94, 0.3)'
                    : score >= Math.ceil(quiz.questionCount / 2)
                    ? 'var(--accent-glow)'
                    : 'rgba(239, 68, 68, 0.3)',
                }}
              >
                <div className="text-5xl font-black mb-2" style={{
                  color: score === quiz.questionCount ? 'var(--success, #22c55e)'
                    : score >= Math.ceil(quiz.questionCount / 2) ? 'var(--accent)'
                    : 'var(--error, #ef4444)',
                }}>
                  {score}<span className="text-2xl text-[var(--text-muted)] font-bold">/{quiz.questionCount}</span>
                </div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  {score === quiz.questionCount ? '🎉 Xuất sắc! Bạn trả lời đúng tất cả!'
                    : score >= Math.ceil(quiz.questionCount / 2) ? '👏 Tốt lắm! Bạn hiểu phần lớn nội dung.'
                    : '📚 Hãy ôn tập lại nhé — AI Tutor sẵn sàng giúp bạn!'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] mt-1">
                  Điểm: {Math.round((score / quiz.questionCount) * 100)}%
                </p>
              </div>

              {/* Review answers */}
              <div className="flex flex-col gap-4">
                {quiz.questions.map((q, qi) => {
                  const userAns = selected[qi];
                  const isCorrect = userAns === q.correctOptionIndex;
                  return (
                    <div
                      key={qi}
                      className="rounded-xl border p-4 flex flex-col gap-3"
                      data-testid={`quiz-result-${qi}`}
                      style={{
                        borderColor: isCorrect ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
                        background: isCorrect ? 'rgba(34, 197, 94, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex-shrink-0 text-sm">
                          {isCorrect ? '✅' : '❌'}
                        </span>
                        <div
                          className="text-xs font-semibold text-[var(--text-primary)] leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderWithKatex(q.questionText) }}
                        />
                      </div>

                      <div className="flex flex-col gap-1.5 ml-6">
                        {q.options.map((opt, oi) => {
                          const isUser = userAns === oi;
                          const isRight = q.correctOptionIndex === oi;
                          return (
                            <div
                              key={oi}
                              className="flex items-start gap-2 text-[11px] rounded-lg px-3 py-2"
                              style={{
                                background: isRight ? 'rgba(34, 197, 94, 0.1)' : isUser && !isRight ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                                color: isRight ? 'var(--success, #22c55e)' : isUser && !isRight ? 'var(--error, #ef4444)' : 'var(--text-muted)',
                                fontWeight: isRight || isUser ? 600 : 400,
                              }}
                            >
                              <span className="flex-shrink-0 font-bold w-4">{OPTION_LABELS[oi]}.</span>
                              <span dangerouslySetInnerHTML={{ __html: renderWithKatex(opt) }} />
                              {isRight && <span className="ml-auto flex-shrink-0">✓</span>}
                              {isUser && !isRight && <span className="ml-auto flex-shrink-0">✗</span>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Explanation */}
                      <div className="ml-6 pt-2 border-t border-[var(--border-subtle)]">
                        <p className="text-[9px] uppercase font-bold tracking-wider text-[var(--text-muted)] mb-1">Giải thích:</p>
                        <div
                          className="text-[11px] text-[var(--text-secondary)] leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderWithKatex(q.explanation) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {phase === 'submitted' && quiz && (
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20 flex-shrink-0">
            <button
              onClick={handleRetry}
              id="quiz-redo-btn"
              data-testid="quiz-redo-btn"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-[var(--border-normal)] text-[var(--text-secondary)] text-xs font-medium hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
              </svg>
              Làm lại
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
