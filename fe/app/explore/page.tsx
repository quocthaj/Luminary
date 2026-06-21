'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createExploreJob, getExploreJobStatus, fetchPreviewContent, getResultUrl, getJobs, JobStatus } from '../../lib/api';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// Progressive loading stages for Explore Mode
const LOADING_STAGES = [
  '🔍 Đang tìm kiếm các bài báo khoa học liên quan trên Semantic Scholar...',
  '📝 Đang trích xuất và tổng hợp tài liệu học thuật chất lượng cao...',
  '🤖 Đang phân tích, biên soạn bài giảng chi tiết bằng AI...',
  '📐 Đang kiểm chứng và định dạng lại các công thức toán học LaTeX...',
  '📊 Đang thiết kế và dựng sơ đồ quy trình Mermaid.js...',
  '💾 Đang đóng gói và lưu trữ bài giảng vào hệ thống...',
];

const SUGGESTED_TOPICS = [
  {
    title: 'Học sâu (Deep Learning)',
    description: 'Khám phá kiến trúc mạng nơ-ron, lan truyền ngược và tối ưu hóa.',
    icon: '🧠',
  },
  {
    title: 'Vật lý lượng tử (Quantum Physics)',
    description: 'Từ nguyên lý chồng chập đến rối lượng tử và máy tính lượng tử.',
    icon: '⚛️',
  },
  {
    title: 'Mật mã học (Cryptography)',
    description: 'Hành trình từ mật mã đối xứng đến mật mã bất đối xứng hiện đại.',
    icon: '🔑',
  },
  {
    title: 'Hình học phi Euclid (Non-Euclidean Geometry)',
    description: 'Khám phá không gian cong, thuyết tương đối và vũ trụ.',
    icon: '📐',
  },
];

// Clean Mermaid syntax to prevent rendering crashes
function cleanMermaidCode(code: string): string {
  let clean = code;
  if (clean.includes('\\n')) {
    clean = clean.replace(/\\n/g, '\n');
  }
  if (clean.startsWith('"') && clean.endsWith('"')) {
    try {
      clean = JSON.parse(clean);
    } catch (_) {}
  }

  // Remove parenthesis/bracket/curly shapes and strip outer quotes
  clean = clean.replace(/\(\("(.+?)"\)\)/g, '$1');
  clean = clean.replace(/\(\((.+?)\)\)/g, '$1');
  clean = clean.replace(/^(\s*)"(.+)"$/gm, '$1$2');

  const lines = clean.split('\n');
  const sanitizedLines = lines.map((line) => {
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.toLowerCase() === 'mindmap' || trimmed.startsWith('graph')) {
      return line;
    }

    const cleanText = trimmed
      .replace(/[()\[\]{}]/g, '')
      .replace(/"/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText === '') {
      return '';
    }
    return `${indent}${cleanText}`;
  });

  return sanitizedLines.filter((l) => l !== '').join('\n');
}

// Simple Markdown + LaTeX parser
function renderMarkdown(md: string): string {
  if (!md) return '';

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];
  const blockMaths: { raw: string; html: string }[] = [];
  const inlineMaths: { raw: string; html: string }[] = [];
  const mermaidBlocks: { raw: string }[] = [];

  // Extract mermaid blocks first to separate them from standard code blocks
  let h = md.replace(/```mermaid\n([\s\S]*?)```/g, (_, c) => {
    mermaidBlocks.push({ raw: c });
    return `\x00MB${mermaidBlocks.length - 1}\x00`;
  });

  // Extract standard code blocks and inline code
  h = h
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => { codeBlocks.push(c); return `\x00CB${codeBlocks.length - 1}\x00`; })
    .replace(/`([^`\n]+)`/g, (_, c) => { inlineCodes.push(c); return `\x00IC${inlineCodes.length - 1}\x00`; });

  // Extract block math ($$ ... $$)
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

  // Extract inline math ($ ... $)
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

  // Basic Markdown tags rendering
  h = h
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr/>')
    .split('\n\n')
    .map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-6]|pre|ul|ol|blockquote|hr|li|div)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  // Insert block math
  blockMaths.forEach((m, i) => {
    const rawLatexEscaped = encodeURIComponent(m.raw);
    const wrapper = `<div class="katex-formula-wrapper relative group my-4 flex justify-center items-center rounded-xl p-4 transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle);" data-latex="${rawLatexEscaped}">
      <div class="overflow-x-auto w-full text-center py-2">${m.html}</div>
      <button class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg shadow-md cursor-pointer z-10 copy-latex-btn flex items-center justify-center gap-1 transition-all duration-150 active:scale-95" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" />
        </svg>
      </button>
    </div>`;
    h = h.replace(`\x00BM${i}\x00`, wrapper);
  });

  // Insert inline math
  inlineMaths.forEach((m, i) => {
    const rawLatexEscaped = encodeURIComponent(m.raw);
    const wrapper = `<span class="katex-formula-wrapper relative group inline-flex items-center mx-0.5 px-1 rounded transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle); cursor: default;" data-latex="${rawLatexEscaped}">
      <span>${m.html}</span>
      <button class="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded shadow-md text-[10px] cursor-pointer z-10 copy-latex-btn flex items-center gap-1 transition-all duration-150 active:scale-95 whitespace-nowrap" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
        <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" />
        </svg>
        <span>Copy</span>
      </button>
    </span>`;
    h = h.replace(`\x00IM${i}\x00`, wrapper);
  });

  // Insert Mermaid diagrams placeholders
  mermaidBlocks.forEach((mb, i) => {
    const rawCodeEscaped = encodeURIComponent(mb.raw);
    const wrapper = `<div class="mermaid-diagram-container w-full my-6 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center" data-mermaid="${rawCodeEscaped}">
      <div class="mermaid-target w-full flex justify-center py-4">
         <span class="text-xs text-[var(--text-muted)] flex items-center gap-2">
           <span class="inline-block w-3 h-3 rounded-full border border-t-transparent animate-spin"></span>
           Đang vẽ sơ đồ trực quan...
         </span>
      </div>
    </div>`;
    h = h.replace(`\x00MB${i}\x00`, wrapper);
  });

  // Insert standard code blocks and inline codes
  codeBlocks.forEach((c, i) => { h = h.replace(`\x00CB${i}\x00`, `<pre class="bg-[var(--bg-elevated)] p-4 rounded-xl overflow-x-auto border border-[var(--border-subtle)] text-xs font-mono my-4"><code>${c}</code></pre>`); });
  inlineCodes.forEach((c, i) => { h = h.replace(`\x00IC${i}\x00`, `<code class="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-xs font-mono text-[var(--accent)]">${c}</code>`); });

  return h;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function ExplorePageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlJobId = searchParams.get('jobId');

  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<'IDLE' | 'GENERATING' | 'COMPLETED' | 'FAILED'>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [error, setError] = useState('');

  // Reader View State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [articleContent, setArticleContent] = useState('');
  const [articleTitle, setArticleTitle] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');

  // History State
  const [exploreHistory, setExploreHistory] = useState<JobStatus[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stageTimerRef = useRef<NodeJS.Timeout | null>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);

  // 1. Session Redirect Guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/?login_required=true');
    }
  }, [status, router]);

  // Load history when authenticated and IDLE
  useEffect(() => {
    if (status === 'authenticated' && pollingStatus === 'IDLE') {
      const fetchHistory = async () => {
        try {
          setLoadingHistory(true);
          const allJobs = await getJobs();
          const filtered = allJobs.filter(j => j.jobId && j.jobId.startsWith('exp-'));
          setExploreHistory(filtered);
        } catch (err) {
          console.error('Failed to fetch explore history:', err);
        } finally {
          setLoadingHistory(false);
        }
      };
      fetchHistory();
    }
  }, [status, pollingStatus]);

  // 2. Dynamic progress stages timer
  useEffect(() => {
    if (pollingStatus === 'GENERATING') {
      setStageIndex(0);
      setProgress(5);
      stageTimerRef.current = setInterval(() => {
        setStageIndex((prev) => {
          const next = prev + 1;
          return next < LOADING_STAGES.length ? next : prev;
        });
        setProgress((prev) => {
          const increment = Math.floor(Math.random() * 12) + 5;
          const next = prev + increment;
          return next < 95 ? next : 95; // Cap at 95% until S3 yields completed
        });
      }, 4000);
    } else {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    }
    return () => {
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
    };
  }, [pollingStatus]);

  // 3. Render Mermaid diagrams dynamically
  const loadMermaidDiagrams = useCallback(async () => {
    const containers = document.querySelectorAll('.mermaid-diagram-container');
    if (containers.length === 0) return;

    try {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
      });

      containers.forEach(async (container, idx) => {
        const target = container.querySelector('.mermaid-target');
        const rawCode = container.getAttribute('data-mermaid');
        if (!target || !rawCode) return;

        try {
          const code = decodeURIComponent(rawCode);
          const cleaned = cleanMermaidCode(code);
          const uniqueId = `mermaid-explore-${idx}-${Date.now()}`;
          const { svg } = await mermaid.render(uniqueId, cleaned);
          target.innerHTML = svg;
        } catch (err: any) {
          console.error('Mermaid rendering failed inside markdown:', err);
          target.innerHTML = `
            <div class="text-xs text-[var(--error)] bg-red-950/20 p-3 rounded-lg border border-red-900/50 w-full">
              <p class="font-bold mb-1">Không thể vẽ sơ đồ quy trình:</p>
              <pre class="overflow-x-auto text-[10px] font-mono whitespace-pre-wrap">${err.message || 'Cú pháp Mermaid không hợp lệ.'}</pre>
            </div>
          `;
        }
      });
    } catch (importErr) {
      console.error('Failed to dynamically load mermaid library:', importErr);
    }
  }, []);

  // 4. Generate dynamic Table of Contents (TOC) synchronously from markdown string
  const toc = useMemo<TocItem[]>(() => {
    if (!articleContent) return [];
    const lines = articleContent.split('\n');
    const items: TocItem[] = [];
    let headingIdx = 0;

    for (let line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = `heading-${headingIdx++}`;
        items.push({ id, text, level });
      }
    }
    return items;
  }, [articleContent]);

  // Trigger post-rendering logic (assigning IDs to headings in the DOM and rendering mermaid diagrams)
  useEffect(() => {
    if (articleContent) {
      // Small timeout to allow DOM to commit HTML update before scanning headings/rendering mermaid
      const timeout = setTimeout(() => {
        if (contentAreaRef.current) {
          const headings = contentAreaRef.current.querySelectorAll('h1, h2, h3');
          headings.forEach((heading, idx) => {
            heading.id = `heading-${idx}`;
          });
        }
        loadMermaidDiagrams();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [articleContent, loadMermaidDiagrams]);

  // Handle Copy LaTeX click inside content area
  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-latex-btn');
    if (btn) {
      e.stopPropagation();
      const wrapper = btn.closest('.katex-formula-wrapper');
      const latexEscaped = wrapper?.getAttribute('data-latex');
      if (latexEscaped) {
        const latex = decodeURIComponent(latexEscaped);
        navigator.clipboard.writeText(latex)
          .then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `
              <svg class="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            `;
            setTimeout(() => {
              btn.innerHTML = originalHTML;
            }, 1500);
          })
          .catch(err => console.error('Failed to copy LaTeX:', err));
      }
    }
  }, []);

  // 5. Load and read a completed job
  const loadCompletedJob = useCallback(async (jobId: string) => {
    try {
      setLoading(true);
      setError('');
      
      // Load metadata to obtain the topic name
      const meta = await getExploreJobStatus(jobId);
      setArticleTitle(meta.originalName || 'Bài giảng Khám phá');

      // Fetch preview content from S3 via proxy
      const mdContent = await fetchPreviewContent(jobId);
      setArticleContent(mdContent);

      // Fetch presigned S3 download url
      const { downloadUrl: url } = await getResultUrl(jobId);
      setDownloadUrl(url);

      setActiveJobId(jobId);
      setPollingStatus('COMPLETED');
    } catch (err: any) {
      console.error('Failed to load explore article:', err);
      setError(err.message || 'Không thể tải nội dung bài giảng.');
      setPollingStatus('FAILED');
    } finally {
      setLoading(false);
    }
  }, []);

  // 6. Polling loop logic
  const startPolling = useCallback((jobId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setPollingStatus('GENERATING');
    setActiveJobId(jobId);
    setProgress(5);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await getExploreJobStatus(jobId);
        if (res.status === 'COMPLETED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setProgress(100);
          // Small delay for progress completion visual effect
          setTimeout(() => {
            loadCompletedJob(jobId);
          }, 800);
        } else if (res.status === 'FAILED') {
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          setError(res.error || 'Trình biên soạn AI gặp lỗi trong quá trình tổng hợp.');
          setPollingStatus('FAILED');
        }
      } catch (err: any) {
        console.error('Polling error:', err);
        // Do not crash loop on minor transient networking errors
      }
    }, 2500);
  }, [loadCompletedJob]);

  // Clean intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // 7. Initial query params check (for direct link loads)
  useEffect(() => {
    if (urlJobId) {
      if (activeJobId === urlJobId) return;

      const checkInitialStatus = async () => {
        try {
          const res = await getExploreJobStatus(urlJobId);
          if (res.status === 'COMPLETED') {
            loadCompletedJob(urlJobId);
          } else if (res.status === 'FAILED') {
            setError(res.error || 'Trình biên soạn AI gặp lỗi.');
            setPollingStatus('FAILED');
          } else {
            startPolling(urlJobId);
          }
        } catch (err: any) {
          console.error('Failed to check initial job status:', err);
          loadCompletedJob(urlJobId); // Fallback
        }
      };
      checkInitialStatus();
    } else {
      // Reset reader state
      setActiveJobId(null);
      setArticleContent('');
      setArticleTitle('');
      setPollingStatus('IDLE');
      setProgress(0);
    }
  }, [urlJobId, activeJobId, loadCompletedJob, startPolling]);

  // 8. Submit research topic
  const handleStartExplore = async (selectedTopic?: string) => {
    const activeTopic = selectedTopic || topic;
    if (!activeTopic || activeTopic.trim() === '') {
      setError('Vui lòng nhập chủ đề nghiên cứu.');
      return;
    }

    try {
      setError('');
      setLoading(true);
      setPollingStatus('GENERATING');
      
      const res = await createExploreJob(activeTopic);
      if (res.jobId) {
        // Push jobId to router URL for bookmarkability and polling persistence
        router.push(`/explore?jobId=${res.jobId}`);
        startPolling(res.jobId);
      }
    } catch (err: any) {
      console.error('Failed to create explore job:', err);
      setError(err.message || 'Khởi tạo Chế độ Khám phá thất bại. Vui lòng thử lại.');
      setPollingStatus('FAILED');
    } finally {
      setLoading(false);
    }
  };

  // Scroll to heading on TOC click
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Trigger file download
  const handleDownloadMd = () => {
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${articleTitle.toLowerCase().replace(/\s+/g, '_')}_bai_giang.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className="min-h-screen flex flex-col p-6 pb-16 animate-fade-in relative"
      style={{ background: 'var(--bg-base)' }}
    >
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0" />

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between w-full max-w-5xl mx-auto mb-10 z-10">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => router.push('/')}>
          <span className="text-xl">🎓</span>
          <span
            className="text-lg font-bold text-white tracking-wide"
            style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
          >
            VietAI Scholar
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/library')}
            className="text-xs text-[var(--accent)] hover:underline font-bold transition-all bg-transparent border-none cursor-pointer"
          >
            Thư viện cá nhân
          </button>
          <div aria-hidden className="w-[1px] h-4 bg-[var(--border-normal)]" />
          <span className="text-xs font-semibold text-[var(--text-muted)] truncate max-w-[160px]">
            {session?.user?.email}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col z-10">
        {/* ─── CASE 1: IDLE / SEARCH STATE ─── */}
        {pollingStatus === 'IDLE' && (
          <div className="flex flex-col items-center justify-center my-auto w-full max-w-2xl mx-auto animate-fade-up">
            <div className="text-center mb-10">
              <span className="text-xs font-bold uppercase tracking-[0.25em] px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent)]">
                Chế độ Khám phá (Explore Mode)
              </span>
              <h1
                className="mt-6 text-4xl font-normal leading-tight text-[var(--text-primary)] tracking-tight"
                style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
              >
                Học tập không giới hạn
              </h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Nhập bất kỳ chủ đề học thuật nào. AI sẽ kết hợp với Semantic Scholar để biên soạn một bài giảng chuyên sâu hoàn chỉnh với LaTeX và Sơ đồ quy trình.
              </p>
            </div>

            {/* Custom search bar */}
            <div className="relative w-full flex items-center bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl p-2 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_rgba(56,189,248,0.15)] transition-all">
              <span className="pl-3 text-lg">🔍</span>
              <input
                type="text"
                placeholder="Nhập chủ đề khoa học hoặc công nghệ muốn khám phá..."
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartExplore()}
                className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
              />
              <button
                onClick={() => handleStartExplore()}
                disabled={loading || !topic.trim()}
                className="bg-[var(--accent)] hover:opacity-90 active:scale-[0.98] text-[#080b12] text-xs font-bold px-5 py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Bắt đầu khám phá
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3.5 w-full rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 text-center animate-fade-in">
                ❌ {error}
              </div>
            )}

            {/* Suggestion Grid */}
            <div className="w-full mt-14">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-5">
                💡 Gợi ý chủ đề nghiên cứu nổi bật
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {SUGGESTED_TOPICS.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setTopic(item.title);
                      handleStartExplore(item.title);
                    }}
                    className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 group flex gap-4"
                  >
                    <span className="text-3xl filter drop-shadow-md select-none">{item.icon}</span>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs mt-1.5 text-[var(--text-secondary)] leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* History Grid */}
            {exploreHistory.length > 0 && (
              <div className="w-full mt-14 border-t border-[var(--border-subtle)] pt-10">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-5">
                  📚 Bộ sưu tập chủ đề đã khám phá ({exploreHistory.length})
                </p>
                {loadingHistory ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
                    Đang tải danh sách bài giảng...
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {exploreHistory.map((job) => (
                      <div
                        key={job.jobId}
                        onClick={() => {
                          router.push(`/explore?jobId=${job.jobId}`);
                        }}
                        className="p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] cursor-pointer transition-all duration-200 group flex items-start justify-between"
                      >
                        <div className="flex gap-4 items-start flex-1 min-w-0">
                          <span className="text-3xl select-none filter drop-shadow-md">📖</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors truncate">
                              {job.fileName || 'Chủ đề chưa đặt tên'}
                            </h4>
                            <p className="text-[10px] mt-1.5 text-[var(--text-muted)]">
                              {job.completedAt ? `Đã hoàn thành lúc: ${new Date(parseInt(job.completedAt) * 1000).toLocaleString('vi-VN')}` : 'Đang xử lý...'}
                            </p>
                          </div>
                        </div>
                        
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ml-2 ${
                          job.status === 'COMPLETED' 
                            ? 'bg-emerald-950/20 text-emerald-400 border-emerald-900/50'
                            : job.status === 'FAILED'
                            ? 'bg-rose-950/20 text-rose-400 border-rose-900/50'
                            : 'bg-amber-950/20 text-amber-400 border-amber-900/50'
                        }`}>
                          {job.status === 'COMPLETED' ? 'Sẵn sàng' : job.status === 'FAILED' ? 'Lỗi' : 'Đang tạo'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── CASE 2: POLLING / GENERATING STATE ─── */}
        {pollingStatus === 'GENERATING' && (
          <div className="flex flex-col items-center justify-center my-auto w-full max-w-md mx-auto text-center animate-fade-up">
            {/* Glowing progress circle spinner */}
            <div className="relative flex items-center justify-center mb-8">
              <svg className="w-32 height-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="var(--border-subtle)"
                  strokeWidth="4"
                  fill="transparent"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="var(--accent)"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={351.8}
                  strokeDashoffset={351.8 - (351.8 * progress) / 100}
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-xl font-extrabold text-white">{progress}%</span>
                <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Tiến độ</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-[0.25em] text-[var(--accent)] uppercase animate-pulse">
                EXPLORE ENGINE RUNNING
              </span>
              <h3 className="text-base font-bold text-white px-4 min-h-[3rem] flex items-center justify-center">
                {LOADING_STAGES[stageIndex]}
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                Quá trình này cần kết nối Semantic Scholar và phân tích chéo tài liệu khoa học, thường mất khoảng 30-60 giây. Vui lòng giữ cửa sổ trình duyệt mở.
              </p>
            </div>

            {/* Smooth linear progress bar */}
            <div className="w-full bg-[var(--border-subtle)] h-1 rounded-full overflow-hidden mt-8">
              <div
                className="bg-[var(--accent)] h-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── CASE 3: FAILED STATE ─── */}
        {pollingStatus === 'FAILED' && !activeJobId && (
          <div className="flex flex-col items-center justify-center my-auto w-full max-w-sm mx-auto text-center animate-fade-up">
            <div className="h-16 w-16 rounded-2xl bg-red-950/30 border border-red-900/40 text-red-500 flex items-center justify-center text-3xl mb-6">
              ⚠️
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Thao tác thất bại</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-6">
              {error || 'Đã xảy ra lỗi không xác định trong quá trình tổng hợp tri thức.'}
            </p>
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setPollingStatus('IDLE')}
                className="flex-1 bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-normal)] text-xs font-bold py-3 rounded-xl transition-all cursor-pointer"
              >
                Quay lại Tìm kiếm
              </button>
              <button
                onClick={() => handleStartExplore()}
                className="flex-1 bg-[var(--accent)] text-[#080b12] text-xs font-bold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer"
              >
                Thử lại ngay
              </button>
            </div>
          </div>
        )}

        {/* ─── CASE 4: COMPLETED / READER VIEW STATE ─── */}
        {pollingStatus === 'COMPLETED' && activeJobId && (
          <div className="flex-1 flex flex-col md:flex-row gap-8 w-full animate-fade-in">
            {/* Left Main Article content (75%) */}
            <div className="flex-1 w-full md:w-3/4 flex flex-col">
              <div className="mb-6">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--accent)]">
                  Bài giảng Học thuật Độc quyền
                </span>
                <h1
                  className="text-3xl font-normal leading-tight text-white tracking-tight mt-1.5"
                  style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
                >
                  {articleTitle}
                </h1>
              </div>

              {/* Rich Content Card */}
              <div
                onClick={handleContentClick}
                className="relative w-full rounded-2xl overflow-hidden"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <div
                  ref={contentAreaRef}
                  className="markdown-preview px-8 py-10 overflow-y-auto scroll-container max-h-[75vh]"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(articleContent) }}
                />
              </div>
            </div>

            {/* Right sidebar Table of Contents & Quick Actions (25%) */}
            <div className="w-full md:w-1/4 flex flex-col gap-6 md:sticky md:top-24 h-fit">
              {/* Actions card */}
              <div
                className="p-5 rounded-2xl flex flex-col gap-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={handleDownloadMd}
                  disabled={!downloadUrl}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--success)] text-[#080b12] text-xs font-bold py-3 rounded-xl hover:opacity-95 transition-all cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tải về Markdown (.md)
                </button>

                <button
                  onClick={() => {
                    // Reset exploration flow
                    router.push('/explore');
                    setActiveJobId(null);
                    setArticleContent('');
                    setArticleTitle('');
                    setTopic('');
                    setPollingStatus('IDLE');
                  }}
                  className="w-full flex items-center justify-center gap-2 bg-transparent border border-[var(--border-normal)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-subtle)] text-xs font-bold py-3 rounded-xl transition-all cursor-pointer"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Khám phá chủ đề khác
                </button>
              </div>

              {/* Table of Contents card */}
              {toc.length > 0 && (
                <div
                  className="p-5 rounded-2xl flex flex-col gap-4 max-h-[50vh] overflow-y-auto scroll-container"
                  style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
                >
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] pb-2 mb-1">
                    📋 Mục lục chi tiết
                  </p>
                  <nav className="flex flex-col gap-2.5">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToHeading(item.id)}
                        className="text-left text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors leading-relaxed cursor-pointer bg-transparent border-none p-0"
                        style={{
                          paddingLeft: `${(item.level - 1) * 12}px`,
                          fontWeight: item.level === 1 ? '700' : '500',
                        }}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Global CSS injection to style parsed markdown elements, spacing, and quotes */}
      <style jsx global>{`
        .markdown-preview {
          color: var(--text-secondary);
          font-size: 0.95rem;
          line-height: 1.75;
          letter-spacing: 0.008em;
        }
        .markdown-preview h1,
        .markdown-preview h2,
        .markdown-preview h3,
        .markdown-preview h4 {
          color: var(--text-primary);
          font-weight: 700;
          line-height: 1.35;
          margin-top: 2rem;
          margin-bottom: 1rem;
        }
        .markdown-preview h1 {
          font-size: 1.6rem;
          font-family: var(--font-fraunces);
          font-style: italic;
          border-b: 1px solid var(--border-subtle);
          padding-bottom: 0.5rem;
        }
        .markdown-preview h2 {
          font-size: 1.35rem;
          margin-top: 1.75rem;
        }
        .markdown-preview h3 {
          font-size: 1.15rem;
        }
        .markdown-preview p {
          margin-bottom: 1.25rem;
          text-align: justify;
        }
        .markdown-preview blockquote {
          border-left: 3px solid var(--accent);
          background: var(--bg-elevated);
          padding: 1rem 1.25rem;
          border-radius: 0 12px 12px 0;
          margin: 1.5rem 0;
          font-style: italic;
          color: var(--text-primary);
        }
        .markdown-preview li {
          margin-bottom: 0.5rem;
          list-style-position: inside;
        }
        .markdown-preview ul,
        .markdown-preview ol {
          margin-bottom: 1.25rem;
          padding-left: 0.5rem;
        }
        .markdown-preview hr {
          border: 0;
          height: 1px;
          background: var(--border-subtle);
          margin: 2rem 0;
        }
        /* Custom scrollbar for left column */
        .scroll-container::-webkit-scrollbar {
          width: 6px;
        }
        .scroll-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .scroll-container::-webkit-scrollbar-thumb {
          background: var(--border-normal);
          border-radius: 4px;
        }
        .scroll-container::-webkit-scrollbar-thumb:hover {
          background: var(--border-subtle);
        }
        /* Mermaid specific overrides */
        .mermaid-diagram-container svg {
          max-width: 100% !important;
          height: auto !important;
        }
        .mermaid-diagram-container svg g.node rect,
        .mermaid-diagram-container svg g.node polygon,
        .mermaid-diagram-container svg g.node circle {
          fill: #141b2d !important;
          stroke: var(--accent) !important;
          stroke-width: 1.5px !important;
        }
        .mermaid-diagram-container svg g.node text {
          fill: #ffffff !important;
          font-weight: 500 !important;
          font-size: 11px !important;
        }
        .mermaid-diagram-container svg path.edgePath .path,
        .mermaid-diagram-container svg path.edge {
          stroke: rgba(56, 189, 248, 0.4) !important;
          stroke-width: 2px !important;
        }
        .mermaid-diagram-container svg .marker {
          fill: rgba(56, 189, 248, 0.4) !important;
          stroke: rgba(56, 189, 248, 0.4) !important;
        }
      `}</style>
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="flex items-center gap-3">
          <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border-normal)', borderTopColor: 'var(--accent)', animation: 'spin-cw 0.75s linear infinite' }} />
          <span className="text-sm text-[var(--text-secondary)] font-semibold">Đang tải ứng dụng...</span>
        </div>
      </div>
    }>
      <ExplorePageContent />
    </Suspense>
  );
}
