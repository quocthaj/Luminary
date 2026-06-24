'use client';

import { useState, useEffect, useCallback, useRef, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { getJobStatus, generateSynthesisReport, sendSynthesisChatMessage, JobStatus } from '../../lib/api';

interface PaperInfo {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  status: string;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
}

function SynthesisContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse ids from query parameter ?ids=id1,id2...
  const jobIds = useMemo(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam) return [];
    return idsParam.split(',').map((id) => id.trim()).filter(Boolean);
  }, [searchParams]);

  // UI state
  const [papers, setPapers] = useState<PaperInfo[]>([]);
  const [reportHtml, setReportHtml] = useState<string>('');
  const [loadingReport, setLoadingReport] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string>('');

  // Side panels collapse states — default both collapsed for maximum report area
  const [leftCollapsed, setLeftCollapsed] = useState<boolean>(true);
  const [rightCollapsed, setRightCollapsed] = useState<boolean>(true);

  // Focus mode: collapse both panels for full-width reading
  const focusMode = leftCollapsed && rightCollapsed;
  const toggleFocusMode = () => {
    if (focusMode) {
      setLeftCollapsed(false);
      setRightCollapsed(false);
    } else {
      setLeftCollapsed(true);
      setRightCollapsed(true);
    }
  };

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [sendingChat, setSendingChat] = useState<boolean>(false);
  const [citationModalText, setCitationModalText] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Session authorization gate
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/?login_required=true');
    }
  }, [status, router]);

  // 2. Validate parameters and fetch metadata + generate report
  useEffect(() => {
    if (status !== 'authenticated' || jobIds.length === 0) return;

    if (jobIds.length < 2 || jobIds.length > 10) {
      setReportError('Vui lòng chọn từ 2 đến 10 tài liệu để tổng hợp đối chiếu.');
      setLoadingReport(false);
      return;
    }

    const initWorkspace = async () => {
      try {
        setLoadingReport(true);
        setReportError('');

        // Fetch metadata for each job
        const paperList = await Promise.all(
          jobIds.map(async (id) => {
            try {
              const info = await getJobStatus(id);
              return {
                id,
                title: info.fileName || `Tài liệu ${id.substring(0, 6)}`,
                authors: ['N/A'],
                year: null,
                status: info.status || 'unknown',
              };
            } catch {
              return {
                id,
                title: `Tài liệu ${id.substring(0, 6)}`,
                authors: ['N/A'],
                year: null,
                status: 'error',
              };
            }
          })
        );
        setPapers(paperList);

        // Call synthesis generator API
        const response = await generateSynthesisReport(jobIds);
        const parsedHtml = renderMarkdown(response.report);
        setReportHtml(parsedHtml);

        // Add welcome message from AI tutor
        setChatMessages([
          {
            sender: 'ai',
            text: `Xin chào! Tôi là AI Tutor của bạn. Tôi đã hoàn thành báo cáo đối chiếu giữa ${paperList.length} tài liệu bạn chọn. Bạn có thể hỏi tôi bất kỳ câu hỏi nào để so sánh sâu hơn hoặc giải thích các khái niệm chéo giữa các bài báo này.`,
          },
        ]);
      } catch (err: any) {
        console.error('Error generating synthesis report:', err);
        setReportError(err.message || 'Không thể tạo báo cáo tổng hợp liên tài liệu. Vui lòng thử lại sau.');
      } finally {
        setLoadingReport(false);
      }
    };

    initWorkspace();
  }, [status, jobIds]);

  // 3. Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // LaTeX Copy Handler
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    
    // Check LaTeX Copy button
    const btn = target.closest('.copy-latex-btn');
    if (btn) {
      e.stopPropagation();
      const wrapper = btn.closest('.katex-formula-wrapper');
      const latexEscaped = wrapper?.getAttribute('data-latex');
      if (latexEscaped) {
        const latex = decodeURIComponent(latexEscaped);
        if (navigator.clipboard) {
          navigator.clipboard.writeText(latex)
            .then(() => {
              const originalHTML = btn.innerHTML;
              btn.innerHTML = `
                <svg class="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              `;
              setTimeout(() => {
                btn.innerHTML = originalHTML;
              }, 1500);
            })
            .catch(err => console.error('Failed to copy LaTeX:', err));
        }
      }
      return;
    }

    // Check Citation Link click
    const citation = target.closest('.citation-link');
    if (citation) {
      e.stopPropagation();
      const text = citation.getAttribute('data-citation') || '';
      setCitationModalText(decodeURIComponent(text));
    }
  }, []);

  // Send message handler
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || sendingChat) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { sender: 'user', text: userMsg }]);
    setSendingChat(true);

    try {
      const response = await sendSynthesisChatMessage(jobIds, userMsg);
      setChatMessages((prev) => [...prev, { sender: 'ai', text: response.answer }]);
    } catch (err: any) {
      console.error('Error sending chat message:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `Đã xảy ra lỗi khi gửi câu hỏi: ${err.message || 'Lỗi kết nối hệ thống'}. Vui lòng thử lại.`,
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  // Convert raw Markdown and LaTeX to HTML
  const renderMarkdown = (md: string): string => {
    if (!md) return '';

    const codeBlocks: string[] = [];
    const inlineCodes: string[] = [];
    const blockMaths: { raw: string; html: string }[] = [];
    const inlineMaths: { raw: string; html: string }[] = [];

    // Extract code blocks and inline code
    let h = md
      .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => {
        codeBlocks.push(c);
        return `\x00CB${codeBlocks.length - 1}\x00`;
      })
      .replace(/`([^`\n]+)`/g, (_, c) => {
        inlineCodes.push(c);
        return `\x00IC${inlineCodes.length - 1}\x00`;
      });

    // Extract block math ($$)
    h = h.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_, c) => {
      let renderedHtml = '';
      try {
        renderedHtml = katex.renderToString(c, { displayMode: true, throwOnError: false });
      } catch {
        renderedHtml = `<code class="math-error">${c}</code>`;
      }
      blockMaths.push({ raw: c, html: renderedHtml });
      return `\x00BM${blockMaths.length - 1}\x00`;
    });

    // Extract inline math ($)
    h = h.replace(/\$([^\$\n]+?)\$/g, (_, c) => {
      let renderedHtml = '';
      try {
        renderedHtml = katex.renderToString(c, { displayMode: false, throwOnError: false });
      } catch {
        renderedHtml = `<code class="math-error">${c}</code>`;
      }
      inlineMaths.push({ raw: c, html: renderedHtml });
      return `\x00IM${inlineMaths.length - 1}\x00`;
    });

    // Handle Markdown headers, tables, bullet points, and citations
    h = h
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^---$/gm, '<hr/>');

    // Parse simple Markdown tables
    const lines = h.split('\n');
    let inTable = false;
    let tableRows: string[] = [];
    const processedLines = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        // Check if separator row
        if (/^[|\s:-]+$/.test(trimmed)) {
          return ''; // skip separator
        }
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        const cellTag = tableRows.length === 0 ? 'th' : 'td';
        const rowHtml = `<tr>${cells.map((c) => `<${cellTag} class="px-4 py-2 border border-[var(--border-normal)]">${c}</${cellTag}>`).join('')}</tr>`;
        tableRows.push(rowHtml);
        return '';
      } else {
        if (inTable) {
          inTable = false;
          const fullTable = `<div class="overflow-x-auto my-4"><table class="w-full text-left border-collapse border border-[var(--border-normal)]">${tableRows.join('')}</table></div>`;
          return fullTable + '\n' + line;
        }
        return line;
      }
    });
    h = processedLines.join('\n');

    // Group paragraphs
    h = h
      .split('\n\n')
      .map((block) => {
        const t = block.trim();
        if (!t) return '';
        if (/^<(h[1-6]|pre|ul|ol|blockquote|hr|li|div)/.test(t)) return t;
        return `<p class="leading-relaxed mb-4 text-[var(--text-primary)]">${t.replace(/\n/g, '<br/>')}</p>`;
      })
      .join('\n');

    // Put math back
    blockMaths.forEach((m, i) => {
      const rawLatexEscaped = encodeURIComponent(m.raw);
      const wrapper = `<div class="katex-formula-wrapper relative group my-4 flex justify-center items-center rounded-xl p-4 transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle);" data-latex="${rawLatexEscaped}">
        <div class="overflow-x-auto w-full text-center py-2">${m.html}</div>
        <button class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity p-2 rounded-lg shadow-md cursor-pointer z-10 copy-latex-btn flex items-center justify-center gap-1 transition-all duration-150 active:scale-95" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
          </svg>
        </button>
      </div>`;
      h = h.replace(`\x00BM${i}\x00`, wrapper);
    });

    inlineMaths.forEach((m, i) => {
      const rawLatexEscaped = encodeURIComponent(m.raw);
      const wrapper = `<span class="katex-formula-wrapper relative group inline-flex items-center mx-0.5 px-1 rounded transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); cursor: default;" data-latex="${rawLatexEscaped}">
        <span>${m.html}</span>
        <button class="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity px-2 py-1 rounded shadow-md text-[10px] cursor-pointer z-10 copy-latex-btn flex items-center gap-1 transition-all duration-150 active:scale-95 whitespace-nowrap" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
          <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" />
          </svg>
          <span>Copy</span>
        </button>
      </span>`;
      h = h.replace(`\x00IM${i}\x00`, wrapper);
    });

    codeBlocks.forEach((c, i) => {
      h = h.replace(`\x00CB${i}\x00`, `<pre class="p-4 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)] my-4 overflow-x-auto text-xs font-mono text-[var(--text-primary)]"><code>${c}</code></pre>`);
    });
    inlineCodes.forEach((c, i) => {
      h = h.replace(`\x00IC${i}\x00`, `<code class="px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--accent)]">${c}</code>`);
    });

    return h;
  };

  // Convert citations to HTML links in chat message text
  const parseChatCitations = (text: string) => {
    // Matches [Tài liệu: ... - Đoạn X] or [Tên bài viết - Đoạn X]
    const regex = /\[(?:Tài liệu:\s*)?([^\]]+?)\s*-\s*Đoạn\s*(\d+)\]/gi;
    return text.replace(regex, (match, title, chunk) => {
      const citationData = encodeURIComponent(`Trích dẫn từ tài liệu: ${title}\n(Đoạn số ${chunk} trong cơ sở dữ liệu học thuật)`);
      return `<span class="citation-link inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-glow)] cursor-pointer text-[10px] hover:bg-[var(--accent-glow)] transition-colors mx-0.5 font-medium" data-citation="${citationData}" title="Xem trích dẫn">
        📖 ${title.substring(0, 15)}${title.length > 15 ? '...' : ''} - Đ.${chunk}
      </span>`;
    });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center">
          <div className="inline-block w-8 h-8 rounded-full border-4 border-[var(--border-normal)] border-t-[var(--accent)] animate-spin" />
          <p className="mt-4 text-sm text-[var(--text-secondary)] font-medium">ĐANG XÁC THỰC QUYỀN TRUY CẬP...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col h-screen overflow-hidden text-[var(--text-primary)]" style={{ background: 'var(--bg-base)' }}>
      {/* Header Bar */}
      <header className="h-14 border-b border-[var(--border-normal)] px-6 flex items-center justify-between z-20 backdrop-blur-md bg-[var(--bg-surface)]/80">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/library')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-normal)] hover:bg-[var(--bg-elevated)] transition-colors text-xs font-semibold"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Quay lại thư viện
          </button>
          <div className="h-4 w-px bg-[var(--border-normal)]" />
          <h1 className="text-sm font-semibold tracking-wide flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-glow)] uppercase">Workspace</span>
            Đối chiếu & Tổng hợp liên bài viết
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle Left Panel */}
          <button
            onClick={() => setLeftCollapsed(!leftCollapsed)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              leftCollapsed
                ? 'border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                : 'border-[var(--accent-glow)] text-[var(--accent)] bg-[var(--accent-dim)]'
            }`}
            title={leftCollapsed ? 'Hiện danh sách tài liệu' : 'Ẩn danh sách tài liệu'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
            Tài liệu
          </button>
          {/* Focus Mode Toggle */}
          <button
            onClick={toggleFocusMode}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              focusMode
                ? 'border-[var(--accent-glow)] text-[var(--accent)] bg-[var(--accent-dim)]'
                : 'border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
            }`}
            title={focusMode ? 'Hiện tất cả panel' : 'Chế độ tập trung đọc'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {focusMode ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              )}
            </svg>
            {focusMode ? 'Mở panel' : 'Tập trung'}
          </button>
          {/* Toggle Right Panel */}
          <button
            onClick={() => setRightCollapsed(!rightCollapsed)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-200 ${
              rightCollapsed
                ? 'border-[var(--border-normal)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
                : 'border-[var(--accent-glow)] text-[var(--accent)] bg-[var(--accent-dim)]'
            }`}
            title={rightCollapsed ? 'Hiện khung chat' : 'Ẩn khung chat'}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Chat AI
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT COLUMN: Collapsible Paper List */}
        <aside
          className={`h-full border-r border-[var(--border-normal)] bg-[var(--bg-surface)]/40 backdrop-blur-sm flex flex-col transition-all duration-300 relative z-10 overflow-hidden ${
            leftCollapsed ? 'w-0 border-r-0' : 'w-80'
          }`}
        >
          {leftCollapsed ? null : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-[var(--border-normal)] flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">DANH SÁCH TÀI LIỆU ({papers.length})</span>
                <button
                  onClick={() => setLeftCollapsed(true)}
                  className="p-1 rounded-md hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)]"
                  title="Thu gọn"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {papers.map((p, idx) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border transition-all duration-200 flex flex-col gap-2 relative bg-[var(--bg-surface)]/60 hover:border-[var(--accent-glow)]"
                    style={{ border: '1px solid var(--border-normal)' }}
                  >
                    <div className="absolute top-3 left-3 text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-[var(--text-secondary)]">
                      {idx + 1}
                    </div>
                    <div className="pl-7">
                      <div className="text-xs font-semibold text-[var(--text-primary)] break-all leading-relaxed line-clamp-2" title={p.title}>
                        {p.title}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-[var(--text-secondary)]">
                        <span>Tác giả: {p.authors.join(', ')}</span>
                        <span>•</span>
                        <span>Năm: {p.year || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* MIDDLE COLUMN: Comparative Synthesis Report */}
        <main className="flex-1 flex flex-col h-full bg-[var(--bg-base)] overflow-hidden relative">
          {loadingReport ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-[var(--bg-base)] z-10">
              <div className="text-center space-y-4 max-w-md w-full">
                {/* Custom glowing loader */}
                <div className="relative w-16 h-16 mx-auto">
                  <div className="absolute inset-0 rounded-full border-4 border-[var(--accent-dim)]" />
                  <div className="absolute inset-0 rounded-full border-4 border-t-[var(--accent)] animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold tracking-wider text-[var(--text-primary)]">ĐANG PHÂN TÍCH VÀ ĐỐI CHIẾU...</h3>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    AI đang trích xuất tóm tắt và thực hiện so sánh chéo phương pháp luận, kết quả, đóng góp và hạn chế của các bài báo đã chọn. Quá trình này có thể mất tới 30 giây...
                  </p>
                </div>
                {/* Shimmer card loader visual placeholder */}
                <div className="mt-8 border border-[var(--border-normal)] rounded-2xl p-4 bg-[var(--bg-surface)]/20 space-y-3 animate-pulse">
                  <div className="h-4 bg-[var(--bg-elevated)] rounded-md w-2/3" />
                  <div className="h-3 bg-[var(--bg-elevated)] rounded-md w-full" />
                  <div className="h-20 bg-[var(--bg-elevated)] rounded-xl w-full" />
                  <div className="h-3 bg-[var(--bg-elevated)] rounded-md w-1/2" />
                </div>
              </div>
            </div>
          ) : reportError ? (
            <div className="flex-1 flex items-center justify-center p-6 text-center">
              <div className="max-w-md p-6 rounded-2xl border border-[var(--error)]/30 bg-[var(--error-dim)] text-center space-y-4">
                <svg className="h-10 w-10 text-[var(--error)] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 className="text-sm font-bold text-[var(--text-primary)]">ĐÃ CÓ LỖI XẢY RA</h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{reportError}</p>
                <button
                  onClick={() => router.push('/library')}
                  className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--bg-base)] text-xs font-bold hover:brightness-110 transition-all active:scale-95"
                >
                  Quay lại thư viện
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-10 py-8 select-text" onClick={handleContentClick}>
              <div className="max-w-6xl mx-auto space-y-6">
                {/* Document styling customization */}
                <style dangerouslySetInnerHTML={{__html: `
                  .synthesis-report-container h1 { font-size: 1.75rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; border-bottom: 1px solid var(--border-normal); padding-bottom: 0.5rem; color: var(--accent); }
                  .synthesis-report-container h2 { font-size: 1.35rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; color: var(--text-primary); }
                  .synthesis-report-container h3 { font-size: 1.1rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.5rem; }
                  .synthesis-report-container table { border-collapse: collapse; width: 100%; border: 1px solid var(--border-normal); margin: 1.5rem 0; border-radius: 12px; overflow: hidden; }
                  .synthesis-report-container th { background: var(--bg-surface); font-weight: 600; font-size: 0.85rem; padding: 12px 16px; border: 1px solid var(--border-normal); color: var(--accent); }
                  .synthesis-report-container td { padding: 12px 16px; border: 1px solid var(--border-normal); font-size: 0.85rem; vertical-align: top; line-height: 1.6; }
                  .synthesis-report-container tr:nth-child(even) td { background: var(--bg-surface)/30; }
                  .synthesis-report-container blockquote { border-left: 4px solid var(--accent); padding-left: 1rem; margin: 1rem 0; font-style: italic; color: var(--text-secondary); }
                  .synthesis-report-container ul, .synthesis-report-container ol { padding-left: 1.25rem; margin: 0.75rem 0; list-style-type: disc; }
                  .synthesis-report-container li { margin-bottom: 0.35rem; font-size: 0.875rem; line-height: 1.6; color: var(--text-primary); }
                `}} />

                <div
                  className="synthesis-report-container pb-20 prose dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: reportHtml }}
                />
              </div>
            </div>
          )}
        </main>

        {/* RIGHT COLUMN: AI Synthesis Chat Panel */}
        <aside
          className={`h-full border-l border-[var(--border-normal)] bg-[var(--bg-surface)]/40 backdrop-blur-sm flex flex-col transition-all duration-300 relative z-10 overflow-hidden ${
            rightCollapsed ? 'w-0 border-l-0' : 'w-[420px]'
          }`}
        >
          {rightCollapsed ? null : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              <div className="p-4 border-b border-[var(--border-normal)] flex items-center justify-between">
                <span className="text-xs font-bold tracking-wider text-[var(--text-secondary)] uppercase">AI SYNTHESIS TUTOR CHAT</span>
                <button
                  onClick={() => setRightCollapsed(true)}
                  className="p-1 rounded-md hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-secondary)]"
                  title="Thu gọn"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text" onClick={handleContentClick}>
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex flex-col max-w-[85%] ${
                      msg.sender === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'
                    }`}
                  >
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-[var(--accent)] text-[var(--bg-base)] font-semibold rounded-tr-none'
                          : 'bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-tl-none'
                      }`}
                      dangerouslySetInnerHTML={{
                        __html: msg.sender === 'user' ? msg.text : renderMarkdown(parseChatCitations(msg.text)),
                      }}
                    />
                  </div>
                ))}

                {sendingChat && (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3.5 rounded-2xl rounded-tl-none mr-auto max-w-[85%]">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span>AI Tutor đang trả lời...</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-[var(--border-normal)] bg-[var(--bg-surface)]/20">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Đặt câu hỏi đối chiếu liên tài liệu..."
                    disabled={sendingChat || loadingReport}
                    className="flex-grow bg-[var(--bg-elevated)] border border-[var(--border-normal)] rounded-xl px-4 py-2.5 text-xs focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 text-[var(--text-primary)]"
                  />
                  <button
                    type="submit"
                    disabled={sendingChat || !chatInput.trim() || loadingReport}
                    className="p-2.5 rounded-xl bg-[var(--accent)] text-[var(--bg-base)] flex items-center justify-center hover:brightness-110 transition-all disabled:opacity-50 active:scale-95 cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* CITATION MODAL POPUP */}
      {citationModalText && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl shadow-2xl p-6 relative animate-fade-up">
            <h3 className="text-xs font-bold tracking-wider text-[var(--accent)] uppercase mb-3 flex items-center gap-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Chi tiết nguồn trích dẫn
            </h3>
            <p className="text-xs text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-medium my-4">
              {citationModalText}
            </p>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setCitationModalText(null)}
                className="px-4 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-normal)] hover:bg-[var(--border-subtle)] text-xs font-bold cursor-pointer transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function SynthesisPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg-base)' }}>
        <div className="text-center animate-fade-in">
          <div
            style={{
              display: 'inline-block',
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '3px solid var(--border-normal)',
              borderTopColor: 'var(--accent)',
              animation: 'spin-cw 0.75s linear infinite',
            }}
          />
          <p className="mt-4 text-[10px] font-bold tracking-wider text-[var(--text-secondary)] uppercase">Đang chuẩn bị workspace đối chiếu...</p>
        </div>
      </div>
    }>
      <SynthesisContent />
    </Suspense>
  );
}
