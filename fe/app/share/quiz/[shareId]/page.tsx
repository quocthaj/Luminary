'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { getPublicQuizShare, QuizQuestion, PublicQuizData } from '@/lib/api';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function sanitizeAndRenderKatex(text: string): string {
  if (!text) return '';
  const rendered = text
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: true, throwOnError: false }); }
      catch { return `<code>${expr}</code>`; }
    })
    .replace(/\$([^\$\n]+?)\$/g, (_, expr) => {
      try { return katex.renderToString(expr.trim(), { displayMode: false, throwOnError: false }); }
      catch { return `<code>${expr}</code>`; }
    });

  if (typeof window !== 'undefined') {
    return DOMPurify.sanitize(rendered);
  }
  return rendered;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function PublicQuizPlayerPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<PublicQuizData | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<(number | null)[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    async function loadQuiz() {
      try {
        setLoading(true);
        setError(null);
        const data = await getPublicQuizShare(shareId);
        setMeta(data);

        let loadedQuestions: QuizQuestion[] = [];
        if (data.questions && data.questions.length > 0) {
          loadedQuestions = data.questions;
        } else if (data.mockQuestions && data.mockQuestions.length > 0) {
          loadedQuestions = data.mockQuestions;
        } else if (data.downloadUrl) {
          const res = await fetch(data.downloadUrl);
          if (!res.ok) throw new Error('Không thể tải file câu hỏi trắc nghiệm từ S3.');
          const quizJson = await res.json();
          loadedQuestions = quizJson.questions || [];
        }

        if (!loadedQuestions || loadedQuestions.length === 0) {
          throw new Error('Dữ liệu câu hỏi trắc nghiệm trống.');
        }

        setQuestions(loadedQuestions);
        setSelected(new Array(loadedQuestions.length).fill(null));
      } catch (err: any) {
        console.error('❌ Failed to load public quiz:', err);
        setError(err.message || 'Không thể tải bài trắc nghiệm.');
      } finally {
        setLoading(false);
      }
    }

    loadQuiz();
  }, [shareId]);

  const handleSelect = useCallback((optionIdx: number) => {
    if (submitted) return;
    setSelected((prev) => {
      const next = [...prev];
      next[currentQ] = optionIdx;
      return next;
    });
  }, [submitted, currentQ]);

  const handleSubmit = useCallback(() => {
    setSubmitted(true);
  }, []);

  const handleRetry = useCallback(() => {
    setSelected(new Array(questions.length).fill(null));
    setCurrentQ(0);
    setSubmitted(false);
  }, [questions.length]);

  const score = questions.reduce(
    (acc, q, i) => acc + (selected[i] === q.correctOptionIndex ? 1 : 0),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080b12] text-[#e2e8f0] flex flex-col items-center justify-center p-4">
        <div className="relative h-16 w-16 mb-4">
          <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-indigo-500 animate-spin" />
        </div>
        <p className="text-sm font-semibold text-slate-400">Đang tải bài trắc nghiệm chia sẻ...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#080b12] text-[#e2e8f0] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="h-14 w-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-white mb-2">Không thể xem bài trắc nghiệm</h1>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">{error}</p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors shadow-lg shadow-indigo-600/20"
          >
            Về trang chủ VietAI Scholar
          </a>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  const isLastQ = currentQ === questions.length - 1;
  const allAnswered = selected.every((s) => s !== null);

  return (
    <div className="min-h-screen bg-[#080b12] text-[#e2e8f0] flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Top Navigation / Branding Header */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between py-4 border-b border-slate-800 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center">
            <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-extrabold text-white tracking-tight">VietAI Scholar — Quiz Player</h1>
            <p className="text-xs text-slate-400 truncate max-w-xs sm:max-w-md">{meta?.title || 'Bài trắc nghiệm ôn tập'}</p>
          </div>
        </div>
        <a
          href="/"
          className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors hidden sm:inline-block"
        >
          Khám phá VietAI Scholar &rarr;
        </a>
      </header>

      {/* Main Player Container */}
      <main className="max-w-3xl w-full mx-auto flex-1 flex flex-col justify-center">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md flex flex-col">
          
          {/* Header Progress */}
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              {submitted ? 'Kết quả trắc nghiệm' : `Câu hỏi ${currentQ + 1} / ${questions.length}`}
            </span>
            {submitted && (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                Điểm: {score}/{questions.length} ({Math.round((score / questions.length) * 100)}%)
              </span>
            )}
          </div>

          {!submitted ? (
            <div className="p-6 flex flex-col gap-6" id="public-quiz-playing-state">
              {/* Progress Bar */}
              <div className="flex items-center gap-1.5">
                {questions.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentQ(i)}
                    className="flex-1 h-2 rounded-full transition-all cursor-pointer"
                    style={{
                      background: i === currentQ
                        ? '#6366f1'
                        : selected[i] !== null
                        ? '#22c55e'
                        : '#1e293b',
                    }}
                    title={`Câu ${i + 1}`}
                  />
                ))}
              </div>

              {/* Question Box */}
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-5 shadow-inner">
                <div
                  className="text-sm font-semibold text-slate-100 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeAndRenderKatex(q.questionText) }}
                />
              </div>

              {/* Options */}
              <div className="flex flex-col gap-3">
                {q.options.map((opt, i) => {
                  const isSelected = selected[currentQ] === i;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSelect(i)}
                      id={`public-quiz-option-${currentQ}-${i}`}
                      data-testid={`public-quiz-option-${currentQ}-${i}`}
                      className="flex items-start gap-3.5 text-left p-4 rounded-xl border transition-all cursor-pointer w-full group"
                      style={{
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                        borderColor: isSelected ? '#6366f1' : '#1e293b',
                      }}
                    >
                      <span
                        className="flex-shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold border transition-colors"
                        style={{
                          background: isSelected ? '#6366f1' : '#0f172a',
                          borderColor: isSelected ? '#6366f1' : '#334155',
                          color: isSelected ? '#ffffff' : '#94a3b8',
                        }}
                      >
                        {OPTION_LABELS[i]}
                      </span>
                      <span
                        className="text-xs leading-relaxed pt-1 text-slate-200"
                        dangerouslySetInnerHTML={{ __html: sanitizeAndRenderKatex(opt) }}
                      />
                    </button>
                  );
                })}
              </div>

              {/* Navigation Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
                  disabled={currentQ === 0}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  &larr; Câu trước
                </button>

                {isLastQ ? (
                  <button
                    onClick={handleSubmit}
                    disabled={!allAnswered}
                    id="public-quiz-submit-btn"
                    data-testid="public-quiz-submit-btn"
                    className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
                  >
                    Nộp bài &rarr;
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentQ((q) => Math.min(questions.length - 1, q + 1))}
                    disabled={selected[currentQ] === null}
                    id="public-quiz-next-btn"
                    data-testid="public-quiz-next-btn"
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-lg shadow-indigo-600/20"
                  >
                    Câu tiếp &rarr;
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* Submitted Results View */
            <div className="p-6 flex flex-col gap-6" id="public-quiz-results-state">
              {/* Summary Banner */}
              <div
                className="rounded-2xl border p-6 text-center shadow-inner"
                style={{
                  background: score === questions.length ? 'rgba(34, 197, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                  borderColor: score === questions.length ? 'rgba(34, 197, 94, 0.3)' : 'rgba(99, 102, 241, 0.3)',
                }}
              >
                <div className="text-5xl font-black mb-2 text-white">
                  {score}<span className="text-2xl text-slate-400 font-bold">/{questions.length}</span>
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  {score === questions.length
                    ? '🎉 Hoàn hảo! Bạn đã trả lời đúng tất cả các câu hỏi!'
                    : score >= Math.ceil(questions.length / 2)
                    ? '👏 Khá lắm! Bạn nắm vững các kiến thức cốt lõi.'
                    : '📚 Cùng xem lại giải thích chi tiết bên dưới để ôn tập nhé!'}
                </p>
              </div>

              {/* Review Section */}
              <div className="flex flex-col gap-4">
                {questions.map((q, qi) => {
                  const userAns = selected[qi];
                  const isCorrect = userAns === q.correctOptionIndex;
                  return (
                    <div
                      key={qi}
                      className="rounded-xl border p-5 flex flex-col gap-3"
                      data-testid={`public-quiz-result-${qi}`}
                      style={{
                        borderColor: isCorrect ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                        background: isCorrect ? 'rgba(34, 197, 94, 0.04)' : 'rgba(239, 68, 68, 0.04)',
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="text-base">{isCorrect ? '✅' : '❌'}</span>
                        <div
                          className="text-xs font-semibold text-slate-200 leading-relaxed pt-0.5"
                          dangerouslySetInnerHTML={{ __html: sanitizeAndRenderKatex(q.questionText) }}
                        />
                      </div>

                      <div className="flex flex-col gap-2 ml-7">
                        {q.options.map((opt, oi) => {
                          const isUser = userAns === oi;
                          const isRight = q.correctOptionIndex === oi;
                          return (
                            <div
                              key={oi}
                              className="flex items-start gap-2.5 text-xs rounded-lg px-3.5 py-2"
                              style={{
                                background: isRight ? 'rgba(34, 197, 94, 0.15)' : isUser && !isRight ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                                color: isRight ? '#4ade80' : isUser && !isRight ? '#f87171' : '#94a3b8',
                                fontWeight: isRight || isUser ? 600 : 400,
                              }}
                            >
                              <span className="font-bold w-4">{OPTION_LABELS[oi]}.</span>
                              <span dangerouslySetInnerHTML={{ __html: sanitizeAndRenderKatex(opt) }} />
                              {isRight && <span className="ml-auto flex-shrink-0">✓ (Đáp án đúng)</span>}
                              {isUser && !isRight && <span className="ml-auto flex-shrink-0">✗ (Bạn chọn)</span>}
                            </div>
                          );
                        })}
                      </div>

                      <div className="ml-7 pt-3 border-t border-slate-800/80">
                        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">Giải thích chi tiết:</p>
                        <div
                          className="text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-lg border border-slate-800/60"
                          dangerouslySetInnerHTML={{ __html: sanitizeAndRenderKatex(q.explanation) }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Footer */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  onClick={handleRetry}
                  id="public-quiz-redo-btn"
                  data-testid="public-quiz-redo-btn"
                  className="px-5 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  🔄 Làm lại bài test
                </button>
                <a
                  href="/"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-lg shadow-indigo-600/20"
                >
                  Tạo quiz cho tài liệu của bạn
                </a>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-3xl w-full mx-auto text-center py-6 text-xs text-slate-500 border-t border-slate-800/60 mt-8">
        Powered by <strong className="text-slate-400">VietAI Scholar</strong> &bull; Nền tảng phân tích và ôn tập tri thức khoa học Serverless.
      </footer>
    </div>
  );
}
