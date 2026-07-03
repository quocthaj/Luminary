'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  initDefenseSession, 
  submitDefenseAnswer, 
  closeDefenseSession, 
  DefenseSession,
  getCopilotSuggestions,
  CopilotSuggestion
} from '../lib/api';

interface DefenseModalProps {
  isOpen: boolean;
  jobId: string;
  onClose: () => void;
  fileName?: string;
}

type DefensePhase = 'setup' | 'loading' | 'active' | 'closed';

export function DefenseModal({ isOpen, jobId, onClose, fileName }: DefenseModalProps) {
  const [phase, setPhase] = useState<DefensePhase>('setup');
  const [session, setSession] = useState<DefenseSession | null>(null);
  const [chatHistory, setChatHistory] = useState<{ role: 'ai' | 'user'; content: string; convincing?: boolean }[]>([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // o1-like thinking steps simulation
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [displayedThinking, setDisplayedThinking] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const thinkingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Report data & Copilot suggestions
  const [facts, setFacts] = useState<any[]>([]);
  const [copilotSuggestions, setCopilotSuggestions] = useState<CopilotSuggestion[]>([]);
  const [loadingCopilot, setLoadingCopilot] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, displayedThinking]);

  // Load session on open
  useEffect(() => {
    if (!isOpen) {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      return;
    }
    setPhase('setup');
    setSession(null);
    setChatHistory([]);
    setUserAnswer('');
    setErrorMsg(null);
    setThinkingSteps([]);
    setDisplayedThinking([]);
    setIsThinking(false);
    setFacts([]);
    setCopilotSuggestions([]);
  }, [isOpen]);

  const handleStartDefense = async () => {
    setPhase('loading');
    setErrorMsg(null);
    try {
      const data = await initDefenseSession(jobId);
      setSession(data);
      if (data.recent_turns && data.recent_turns.length > 0) {
        // If there's already an active turn, load it
        const history: { role: 'ai' | 'user'; content: string; convincing?: boolean }[] = [];
        data.recent_turns.forEach(turn => {
          if (turn.question) {
            history.push({ role: 'ai', content: turn.question });
          }
          if (turn.answer) {
            history.push({ role: 'user', content: turn.answer, convincing: turn.convincing });
          }
        });
        setChatHistory(history);
      }
      setPhase('active');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Không thể khởi tạo phiên phản biện.');
      setPhase('setup');
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim() || !session || isSending) return;
    const answer = userAnswer.trim();
    setUserAnswer('');
    setIsSending(true);
    setIsThinking(true);
    setDisplayedThinking([]);
    
    // Add user answer to visual chat immediately
    setChatHistory(prev => [...prev, { role: 'user', content: answer }]);

    try {
      const res = await submitDefenseAnswer(session.sessionId, answer);
      
      // Simulate thinking steps sequentially
      let idx = 0;
      setThinkingSteps(res.thinking_steps || []);
      
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
      }

      thinkingIntervalRef.current = setInterval(() => {
        if (idx < res.thinking_steps.length) {
          setDisplayedThinking(prev => [...prev, res.thinking_steps[idx]]);
          idx++;
        } else {
          if (thinkingIntervalRef.current) {
            clearInterval(thinkingIntervalRef.current);
            thinkingIntervalRef.current = null;
          }
          setIsThinking(false);
          setIsSending(false);
          
          // Once thinking is finished, update session state and add next question to chat
          setSession(prev => prev ? {
            ...prev,
            status: res.status,
            concept_status: res.concept_status,
            recent_turns: res.recent_turns
          } : null);

          setChatHistory(prev => [...prev, { role: 'ai', content: res.next_question }]);

          // If concluded, go to closed phase and show report
          if (res.status === 'CLOSED') {
            setFacts(res.report?.facts || []);
            setPhase('closed');
            fetchCopilot(session.sessionId);
          }
        }
      }, 1200);

    } catch (err: any) {
      console.error(err);
      setIsThinking(false);
      setIsSending(false);
      setChatHistory(prev => [...prev, { role: 'ai', content: `Lỗi kết nối: ${err.message || 'Không thể gửi câu trả lời.'}` }]);
    }
  };

  const handleEndSessionEarly = async () => {
    if (!session) return;
    setPhase('loading');
    try {
      const res = await closeDefenseSession(session.sessionId);
      setSession(prev => prev ? { ...prev, status: 'CLOSED', concept_status: res.report?.concepts_evaluated || prev.concept_status } : null);
      setFacts(res.report?.facts || []);
      setPhase('closed');
      fetchCopilot(session.sessionId);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Không thể đóng phiên phản biện sớm.');
      setPhase('active');
    }
  };

  const fetchCopilot = async (sessId: string) => {
    setLoadingCopilot(true);
    try {
      const data = await getCopilotSuggestions(jobId, sessId);
      setCopilotSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to load copilot suggestions:', err);
    } finally {
      setLoadingCopilot(false);
    }
  };

  const handleDownloadReport = () => {
    if (!session) return;
    let mdContent = `# BÁO CÁO NĂNG LỰC PHẢN BIỆN LUẬN ÁN\n\n`;
    mdContent += `- **Tài liệu bảo vệ:** ${fileName || 'Bài báo học thuật'}\n`;
    mdContent += `- **Mã phiên:** \`${session.sessionId}\`\n`;
    mdContent += `- **Thời gian:** ${new Date().toLocaleString('vi-VN')}\n\n`;
    
    mdContent += `## 📊 Kết quả đánh giá các khái niệm:\n\n`;
    
    session.concept_status.forEach(c => {
      const statusEmoji = c.status === 'MASTERED' ? '🟢 MASTERED' : c.status === 'WARNING' ? '🟡 WARNING' : '🔴 GAP';
      mdContent += `### 🏷️ ${c.concept_id}\n`;
      mdContent += `- **Đánh giá:** ${statusEmoji}\n`;
      if (c.last_gap_summary) {
        mdContent += `- **Lỗ hổng logic:** *${c.last_gap_summary}*\n`;
      }
      mdContent += `\n`;
    });

    if (facts && facts.length > 0) {
      mdContent += `## 📝 Tóm tắt sự kiện học tập (Session Facts):\n\n`;
      facts.forEach(f => {
        mdContent += `- **[${f.concept_id}]** ${f.verdict} ${f.gap_summary ? `— ${f.gap_summary}` : ''}\n`;
      });
      mdContent += `\n`;
    }

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `competency-report-${session.sessionId}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div data-testid="defense-modal" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out forwards;
        }
        .concept-glowing {
          box-shadow: 0 0 10px rgba(56, 189, 248, 0.4);
        }
      `}</style>

      <div className="relative w-full max-w-6xl h-[90vh] bg-[#0c101d] border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden font-sans">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-[#0e1424]">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <h3 className="text-sm font-bold text-white tracking-wider uppercase">
              Hội đồng phản biện luận án giả lập (Thesis Defense AI)
            </h3>
          </div>
          <button
            onClick={onClose}
            data-testid="defense-close-btn"
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Phase 1: Setup ── */}
        {phase === 'setup' && (
          <div className="flex-1 flex flex-col justify-center items-center p-8 text-center bg-[#080c14]">
            <div className="max-w-lg w-full flex flex-col items-center gap-6">
              <div className="h-20 w-20 rounded-3xl bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              
              <div>
                <h4 className="text-lg font-bold text-white mb-2">Thách thức phản biện với Agentic AI</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Đối mặt với hội đồng phản biện luận án tự động. AI sẽ tự động phân tích sâu bài báo gốc, đặt các câu hỏi phản biện sắc bén không theo kịch bản cố định, tự điều chỉnh độ khó và chấm điểm độ thuyết phục của bạn để cập nhật vào bản đồ nhiệt năng lực lâu dài.
                </p>
              </div>

              {errorMsg && (
                <div className="w-full p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-left flex gap-2.5">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              <button
                onClick={handleStartDefense}
                data-testid="start-defense-btn"
                className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-red-500/10 flex items-center justify-center gap-2"
              >
                <span>Bắt đầu bảo vệ đề tài</span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* ── Phase 2: Loading ── */}
        {phase === 'loading' && (
          <div className="flex-1 flex flex-col justify-center items-center gap-6 bg-[#080c14]">
            <div className="h-16 w-16 rounded-full border-4 border-white/5 border-t-red-500 animate-spin" />
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest animate-pulse">
              Đang thiết lập phòng phản biện luận án...
            </span>
          </div>
        )}

        {/* ── Phase 3: Active Defense ── */}
        {phase === 'active' && session && (
          <div className="flex-1 flex overflow-hidden">
            
            {/* Left/Center Chat Screen */}
            <div className="flex-grow flex flex-col bg-[#070b14] border-r border-white/5">
              
              {/* Defense Dialogue */}
              <div className="flex-grow overflow-y-auto p-6 flex flex-col gap-6 scrollbar-thin">
                
                {/* Introduction system prompt */}
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-[11px] text-gray-400 leading-relaxed flex gap-3 max-w-2xl">
                  <span>🎓</span>
                  <div>
                    <p className="font-semibold text-white mb-0.5">Hội đồng phản biện luận án</p>
                    Hãy trả lời các câu hỏi phản biện dưới đây thật rõ ràng và đưa ra các minh chứng kỹ thuật có sức thuyết phục dựa trên nội dung bài báo gốc.
                  </div>
                </div>

                {chatHistory.map((chat, idx) => (
                  <div key={idx} className={`flex gap-3 max-w-[85%] ${chat.role === 'user' ? 'self-end flex-row-reverse' : ''}`}>
                    {chat.role === 'ai' ? (
                      <div className="h-8 w-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        AI
                      </div>
                    ) : (
                      <div className="h-8 w-8 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                        U
                      </div>
                    )}
                    
                    <div className={`p-4 rounded-2xl text-xs leading-relaxed ${
                      chat.role === 'user'
                        ? 'bg-blue-950/40 border border-blue-500/20 text-white rounded-tr-none'
                        : 'bg-[#0e1424] border border-white/5 text-gray-200 rounded-tl-none'
                    }`}>
                      {chat.role === 'ai' && (
                        <p className="font-bold text-red-400 mb-1.5 flex items-center gap-1.5">
                          <span>Giáo sư Phản biện AI</span>
                          {idx === chatHistory.length - 1 && isSending && (
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
                          )}
                        </p>
                      )}
                      
                      <p className="whitespace-pre-wrap">{chat.content}</p>

                      {chat.role === 'user' && chat.convincing !== undefined && (
                        <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-between items-center text-[10px]">
                          <span className="text-gray-400">Độ thuyết phục:</span>
                          <span className={`font-bold px-2 py-0.5 rounded-md ${chat.convincing ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                            {chat.convincing ? '✓ Thuyết phục' : '✗ Cần làm rõ thêm'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* o1 thinking simulation screen */}
                {isThinking && (
                  <div className="flex gap-3 max-w-[85%]">
                    <div className="h-8 w-8 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      AI
                    </div>
                    <div className="p-4 rounded-2xl bg-[#0b0f19] border border-white/5 rounded-tl-none w-full">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/80 mb-2 flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full border border-t-transparent border-red-400 animate-spin" />
                        Đang phân tích và lập luận (o1-like thinking)
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {displayedThinking.map((step, i) => (
                          <div key={i} className="text-[11px] text-gray-400 leading-relaxed flex gap-2 items-start animate-fade-in">
                            <span className="text-red-500/80">•</span>
                            <span>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-white/5 bg-[#0a0d17]">
                <div className="flex gap-3 items-end">
                  <textarea
                    rows={2}
                    value={userAnswer}
                    onChange={(e) => setUserAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendAnswer();
                      }
                    }}
                    data-testid="answer-input"
                    placeholder={isSending ? "AI đang tư duy..." : "Nhập câu trả lời của bạn..."}
                    disabled={isSending}
                    className="flex-1 bg-[#0e1424] border border-white/5 rounded-xl px-4 py-3 text-xs text-white placeholder-gray-500 outline-none focus:border-red-500/30 transition-colors resize-none disabled:opacity-50"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={handleSendAnswer}
                      disabled={isSending || !userAnswer.trim()}
                      data-testid="submit-answer-btn"
                      className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Trả lời
                    </button>
                    <button
                      onClick={handleEndSessionEarly}
                      disabled={isSending}
                      className="border border-white/10 hover:bg-white/5 text-gray-300 font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                      Kết thúc
                    </button>
                  </div>
                </div>
              </div>

            </div>

            {/* Right sidebar: real-time concept mapping & heatmap */}
            <div className="w-80 bg-[#0e1424] flex flex-col">
              <div className="p-4 border-b border-white/5">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Khái niệm đang đánh giá</h4>
                <p className="text-[10px] text-gray-400 mt-0.5">Trạng thái cập nhật thời gian thực trong phiên</p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5 scrollbar-thin">
                {session.concept_status.length === 0 ? (
                  <div className="text-center py-10 text-[11px] text-gray-500">
                    Chưa có khái niệm nào được kiểm chứng. Câu hỏi đầu tiên sẽ mở ra các chủ đề.
                  </div>
                ) : (
                  session.concept_status.map((c, i) => (
                    <div key={i} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1.5 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-200 truncate max-w-[150px]" title={c.concept_id}>
                          {c.concept_id}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          c.status === 'MASTERED' ? 'bg-green-500/10 text-green-400' :
                          c.status === 'WARNING' ? 'bg-yellow-500/10 text-yellow-400' :
                          'bg-red-500/10 text-red-400'
                        }`}>
                          {c.status}
                        </span>
                      </div>
                      
                      {c.last_gap_summary && (
                        <p className="text-[10px] text-gray-400 leading-snug italic">
                          Lỗ hổng: {c.last_gap_summary}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-white/5 bg-[#0a0d17]">
                <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-[10px] text-gray-400 leading-relaxed flex gap-2">
                  <span>ℹ️</span>
                  <span>Các concept bị đánh giá GAP/WARNING sẽ được ghi nhận vào hồ sơ lâu dài để Research Copilot đề xuất ôn tập.</span>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* ── Phase 4: Competency Report ── */}
        {phase === 'closed' && session && (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#080c14]">
            
            {/* Scrollable Report container */}
            <div className="flex-grow overflow-y-auto p-6 md:p-8 flex flex-col gap-6 scrollbar-thin">
              
              {/* Report Header card */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-red-950/30 to-blue-950/20 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">Báo cáo Năng lực Bảo vệ Luận án</h4>
                  <p className="text-xs text-gray-400">Tài liệu: {fileName || 'Bài báo học thuật'}</p>
                </div>
                
                <button
                  onClick={handleDownloadReport}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tải báo cáo Markdown
                </button>
              </div>

              {/* Grid split */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Mastered concepts column */}
                <div className="p-5 rounded-2xl bg-green-950/10 border border-green-500/10">
                  <h5 className="text-xs font-bold text-green-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    Đã làm chủ (MASTERED)
                  </h5>
                  <div className="flex flex-col gap-3">
                    {session.concept_status.filter(c => c.status === 'MASTERED').length === 0 ? (
                      <span className="text-[11px] text-gray-500 italic">Không có khái niệm nào.</span>
                    ) : (
                      session.concept_status.filter(c => c.status === 'MASTERED').map((c, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 text-xs text-white font-semibold">
                          {c.concept_id}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Warnings concepts column */}
                <div className="p-5 rounded-2xl bg-yellow-950/10 border border-yellow-500/10">
                  <h5 className="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-yellow-500" />
                    Cần củng cố (WARNING)
                  </h5>
                  <div className="flex flex-col gap-3">
                    {session.concept_status.filter(c => c.status === 'WARNING').length === 0 ? (
                      <span className="text-[11px] text-gray-500 italic">Không có khái niệm nào.</span>
                    ) : (
                      session.concept_status.filter(c => c.status === 'WARNING').map((c, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1.5">
                          <span className="text-xs text-white font-semibold">{c.concept_id}</span>
                          {c.last_gap_summary && (
                            <p className="text-[10px] text-gray-400 leading-snug italic">{c.last_gap_summary}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Gaps concepts column */}
                <div className="p-5 rounded-2xl bg-red-950/10 border border-red-500/10">
                  <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    Lỗ hổng kiến thức (GAP)
                  </h5>
                  <div className="flex flex-col gap-3">
                    {session.concept_status.filter(c => c.status === 'GAP').length === 0 ? (
                      <span className="text-[11px] text-gray-500 italic">Không có khái niệm nào.</span>
                    ) : (
                      session.concept_status.filter(c => c.status === 'GAP').map((c, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-white/5 border border-white/5 flex flex-col gap-1.5">
                          <span className="text-xs text-white font-semibold">{c.concept_id}</span>
                          {c.last_gap_summary && (
                            <p className="text-[10px] text-gray-400 leading-snug italic">{c.last_gap_summary}</p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

              {/* Research Copilot suggestions block */}
              <div className="p-6 rounded-2xl bg-[#0e1424] border border-white/5">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
                  <span>💡</span>
                  <span>Gợi ý hành động từ Research Copilot</span>
                </h5>

                {loadingCopilot ? (
                  <div className="flex items-center gap-2 py-4">
                    <div className="h-4 w-4 rounded-full border-2 border-white/5 border-t-red-500 animate-spin" />
                    <span className="text-xs text-gray-400">Đang phân tích lộ trình ôn tập tiếp theo...</span>
                  </div>
                ) : copilotSuggestions.length === 0 ? (
                  <p className="text-xs text-gray-400">Tuyệt vời! Bạn không có lỗ hổng kiến thức cấp bách nào cần hành động ngay.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {copilotSuggestions.map((s, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/5 flex flex-col justify-between gap-3">
                        <div>
                          <h6 className="text-xs font-bold text-white flex items-center gap-1.5">
                            <span className="text-red-400">[{s.action}]</span>
                            <span>{s.title}</span>
                          </h6>
                          <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">{s.description}</p>
                        </div>
                        
                        <div className="flex justify-end">
                          <button
                            onClick={() => {
                              onClose();
                              // In the future, we could trigger events mapped to actions, but for now we close and guide the user.
                              alert(`Hành động đề xuất: ${s.action} - ${s.payload}. Hãy sử dụng công cụ tương ứng ngoài Workspace.`);
                            }}
                            className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-1.5 rounded-lg text-[10px] transition-all cursor-pointer"
                          >
                            Thực hiện ngay
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 bg-[#0e1424] flex justify-end">
              <button
                onClick={onClose}
                className="bg-red-600 hover:bg-red-500 text-white font-bold px-6 py-2 rounded-xl text-xs transition-all cursor-pointer"
              >
                Hoàn thành & Quay lại Workspace
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
