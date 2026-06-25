'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getResultUrl, fetchPreviewContent, resetMockProgress, getJobs, JobStatus, sendRAGChatMessage, RelatedPaper, getRelatedPapers, generateMindmap, checkMindmapStatus } from '../lib/api';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useSession, signOut } from 'next-auth/react';
import { LoginModal } from './LoginModal';
import { QuizModal } from './QuizModal';
import { FlashcardModal } from './FlashcardModal';
import { MindmapModal } from './MindmapModal';
import { usePodcastPlayer } from './PodcastPlayer';


type Lang = 'en' | 'vi';
type RightTab = 'tutor' | 'scholar';

interface Sections {
  en: string;
  vi: string;
  hasEN: boolean;
}

function splitBilingual(raw: string): Sections {
  const enRe = /^#{1,3}[^\S\r\n]*(english|en\b|english version)/im;
  const viRe = /^#{1,3}[^\S\r\n]*(tiếng việt|vietnamese|vi\b|bản dịch)/im;
  const enM = enRe.exec(raw);
  const viM = viRe.exec(raw);

  if (enM && viM) {
    const enStart = enM.index;
    const viStart = viM.index;
    if (enStart < viStart) {
      return { en: raw.slice(enStart + enM[0].length, viStart).trim(), vi: raw.slice(viStart + viM[0].length).trim(), hasEN: true };
    }
    return { en: raw.slice(enStart + enM[0].length).trim(), vi: raw.slice(viStart + viM[0].length, enStart).trim(), hasEN: true };
  }

  const parts = raw.split(/\n---\n/);
  if (parts.length >= 2) {
    return { en: parts[0].trim(), vi: parts.slice(1).join('\n---\n').trim(), hasEN: true };
  }

  return { en: '', vi: raw, hasEN: false };
}

function renderMarkdown(md: string): string {
  if (!md) return '';

  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];
  const blockMaths: { raw: string; html: string }[] = [];
  const inlineMaths: { raw: string; html: string }[] = [];

  // Extract code blocks and inline code first
  let h = md
    .replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => { codeBlocks.push(c); return `\x00CB${codeBlocks.length - 1}\x00`; })
    .replace(/`([^`\n]+)`/g, (_, c) => { inlineCodes.push(c); return `\x00IC${inlineCodes.length - 1}\x00`; });

  // Extract block math next (so we don't process internal symbols)
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

  // Extract inline math next
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

  h = h
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-[var(--accent)] hover:underline">$1</a>')
    .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/^---$/gm, '<hr/>')
    .split('\n\n')
    .map(block => {
      const t = block.trim();
      if (!t) return '';
      if (/^<(h[1-6]|pre|ul|ol|blockquote|hr|li)/.test(t)) return t;
      const anchorMatch = t.match(/^\{#chunk-(\d+)\}([\s\S]*)$/);
      if (anchorMatch) {
        const chunkIndex = anchorMatch[1];
        const content = anchorMatch[2].replace(/\n/g, '<br/>');
        return `<p id="chunk-${chunkIndex}" data-chunk="${chunkIndex}">${content}</p>`;
      }
      return `<p>${t.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  // Put math back
  blockMaths.forEach((m, i) => {
    const rawLatexEscaped = encodeURIComponent(m.raw);
    const wrapper = `<div class="katex-formula-wrapper relative group my-4 flex justify-center items-center rounded-xl p-4 transition-colors duration-200" style="background: var(--bg-elevated); border: 1px solid var(--border-subtle);" data-latex="${rawLatexEscaped}">
      <div class="overflow-x-auto w-full text-center py-2">${m.html}</div>
      <button class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity p-2 rounded-lg shadow-md cursor-pointer z-10 copy-latex-btn flex items-center justify-center gap-1 transition-all duration-150 active:scale-95" style="background: var(--bg-surface); border: 1px solid var(--border-normal); color: var(--text-secondary);" title="Copy LaTeX">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
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
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1" />
        </svg>
        <span>Copy</span>
      </button>
    </span>`;
    h = h.replace(`\x00IM${i}\x00`, wrapper);
  });

  codeBlocks.forEach((c, i) => { h = h.replace(`\x00CB${i}\x00`, `<pre><code>${c}</code></pre>`); });
  inlineCodes.forEach((c, i) => { h = h.replace(`\x00IC${i}\x00`, `<code>${c}</code>`); });

  return h;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: number[];
}

function parseCitations(text: string): { cleanText: string; citations: number[] } {
  const citations: number[] = [];
  const regex = /\[(?:Đoạn\s*|chunk-)(\d+)\]/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && !citations.includes(num)) {
      citations.push(num);
    }
  }
  return { cleanText: text, citations: citations.sort((a, b) => a - b) };
}

export function WorkspaceView({
  jobId: initialJobId,
  onReset,
  onReprocess,
}: {
  jobId: string;
  onReset: () => void;
  onReprocess?: () => void;
}) {
  const { data: session, status } = useSession();
  const [jobId, setJobId] = useState(initialJobId);

  // Podcast Player states
  const {
    jobId: activeJobId,
    status: podcastPlayerStatus,
    isPlaying: isPodcastPlaying,
    playPodcast,
    togglePlay,
  } = usePodcastPlayer();
  const [podcastHdMode, setPodcastHdMode] = useState(true);

  // Layout states
  const [isLeftCollapsed, setIsLeftCollapsed] = useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('tutor');

  // AI Tutor Chat states
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Semantic Scholar states
  const [relatedPapers, setRelatedPapers] = useState<RelatedPaper[]>([]);
  const [hasFetchedPapers, setHasFetchedPapers] = useState(false);
  const [isLoadingPapers, setIsLoadingPapers] = useState(false);
  const [papersError, setPapersError] = useState<string | null>(null);
  const [expandedPaperId, setExpandedPaperId] = useState<string | null>(null);

  // Document data states
  const [downloadUrl, setDownloadUrl] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [sections, setSections] = useState<Sections | null>(null);
  const [tab, setTab] = useState<Lang>('vi');
  const [loading, setLoading] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState('');
  const [copiedLang, setCopiedLang] = useState<'en' | 'vi' | 'mobile' | null>(null);

  // Authentication and modal states
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  // Personal Library state
  const [libraryJobs, setLibraryJobs] = useState<JobStatus[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);

  // Scroll Sync Refs
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);
  const activeScrollColRef = useRef<'left' | 'right' | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Alert/Modal state for coming-soon features
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Quiz Modal state
  const [showQuizModal, setShowQuizModal] = useState(false);

  // Flashcard Modal state
  const [showFlashcardModal, setShowFlashcardModal] = useState(false);

  // Mindmap states
  const [showMindmapModal, setShowMindmapModal] = useState(false);
  const [mindmapStatus, setMindmapStatus] = useState<'IDLE' | 'GENERATING' | 'FAILED' | 'COMPLETED'>('IDLE');
  const [mindmapToast, setMindmapToast] = useState<{ type: 'generating' | 'success' | 'failed' | null; message: string }>({ type: null, message: '' });
  const mindmapPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startMindmapPolling = useCallback(() => {
    if (mindmapPollRef.current) {
      clearInterval(mindmapPollRef.current);
    }
    let ticks = 0;
    const maxTicks = 30; // 90 seconds (30 * 3s)

    mindmapPollRef.current = setInterval(() => {
      ticks++;
      if (ticks > maxTicks) {
        if (mindmapPollRef.current) {
          clearInterval(mindmapPollRef.current);
          mindmapPollRef.current = null;
        }
        setMindmapStatus('FAILED');
        setMindmapToast({ type: 'failed', message: 'Tạo sơ đồ tư duy quá thời gian. Vui lòng thử lại.' });
        return;
      }

      checkMindmapStatus(jobId)
        .then((data) => {
          if (data.status === 'COMPLETED') {
            if (mindmapPollRef.current) {
              clearInterval(mindmapPollRef.current);
              mindmapPollRef.current = null;
            }
            setMindmapStatus('COMPLETED');
            setMindmapToast({ type: 'success', message: 'Sơ đồ tư duy đã được vẽ hoàn tất bởi AI!' });
          } else if (data.status === 'FAILED') {
            if (mindmapPollRef.current) {
              clearInterval(mindmapPollRef.current);
              mindmapPollRef.current = null;
            }
            setMindmapStatus('FAILED');
            setMindmapToast({ type: 'failed', message: 'Tiến trình vẽ sơ đồ tư duy thất bại.' });
          }
        })
        .catch((err) => {
          console.error('Polling check failed:', err);
        });
    }, 3000);
  }, [jobId]);

  // Check mindmap status on load or jobId change
  useEffect(() => {
    if (mindmapPollRef.current) {
      clearInterval(mindmapPollRef.current);
      mindmapPollRef.current = null;
    }
    setMindmapStatus('IDLE');
    setMindmapToast({ type: null, message: '' });

    if (!jobId) return;

    checkMindmapStatus(jobId)
      .then((data) => {
        if (data.status === 'COMPLETED') {
          setMindmapStatus('COMPLETED');
        } else if (data.status === 'GENERATING') {
          setMindmapStatus('GENERATING');
          startMindmapPolling();
        }
      })
      .catch((err) => {
        console.warn('Initial check of mindmap status failed:', err);
      });

    return () => {
      if (mindmapPollRef.current) {
        clearInterval(mindmapPollRef.current);
      }
    };
  }, [jobId, startMindmapPolling]);

  const handleMindmapClick = useCallback(() => {
    if (mindmapStatus === 'COMPLETED') {
      setShowMindmapModal(true);
      return;
    }

    if (mindmapStatus === 'GENERATING') {
      setMindmapToast({ type: 'generating', message: 'Tiến trình vẽ sơ đồ tư duy đang được xử lý ở chế độ chạy ngầm...' });
      return;
    }

    setMindmapStatus('GENERATING');
    setMindmapToast({ type: 'generating', message: 'Đang khởi chạy tiến trình vẽ sơ đồ tư duy ở background...' });

    generateMindmap(jobId)
      .then((data) => {
        if (data.status === 'COMPLETED') {
          setMindmapStatus('COMPLETED');
          setMindmapToast({ type: 'success', message: 'Sơ đồ tư duy đã tạo xong!' });
        } else {
          startMindmapPolling();
        }
      })
      .catch((err: any) => {
        setMindmapStatus('FAILED');
        setMindmapToast({ type: 'failed', message: err.message || 'Khởi tạo tiến trình vẽ sơ đồ tư duy thất bại.' });
      });
  }, [jobId, mindmapStatus, startMindmapPolling]);


  // Sync current jobId to URL query params
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('jobId') !== jobId) {
        url.searchParams.set('jobId', jobId);
        window.history.pushState({}, '', url.toString());
      }
    }
  }, [jobId]);

  // Fetch Library list when authenticated
  useEffect(() => {
    if (status !== 'authenticated') {
      setLibraryJobs([]);
      return;
    }

    const fetchLib = async () => {
      try {
        setLoadingLibrary(true);
        const data = await getJobs();
        setLibraryJobs(data);
      } catch (err) {
        console.error('Failed to load library in workspace:', err);
      } finally {
        setLoadingLibrary(false);
      }
    };
    fetchLib();
  }, [status, jobId]);

  // Load document content
  useEffect(() => {
    setLoading(true);
    setError('');
    setRawContent('');
    setSections(null);

    getResultUrl(jobId)
      .then(({ downloadUrl: url }) => {
        setDownloadUrl(url);
        setLoadingContent(true);
        return fetchPreviewContent(jobId)
          .then(text => {
            setRawContent(text);
            const parsed = splitBilingual(text);
            setSections(parsed);
            setTab('vi'); // Default to Vietnamese
          })
          .catch(() => { /* preview unavailable */ })
          .finally(() => setLoadingContent(false));
      })
      .catch((err: any) => {
        console.error('Error fetching result details:', err);
        setError('Không thể lấy nội dung bản dịch. Vui lòng kiểm tra lại quyền truy cập.');
      })
      .finally(() => setLoading(false));

    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [jobId]);

  // Dynamic greeting message based on session user
  const userName = useMemo(() => {
    if (session?.user?.name) return session.user.name;
    if (session?.user?.email) {
      return session.user.email.split('@')[0];
    }
    return 'Thai';
  }, [session]);

  // Reset or initialize messages when userName changes
  useEffect(() => {
    setMessages(prev => {
      if (prev.length <= 1) {
        return [
          {
            role: 'assistant',
            content: `Chào ${userName}! Tôi là AI Tutor. Tôi có thể giúp bạn giải đáp, tóm tắt và phân tích chuyên sâu về bài báo này. Hãy thử đặt câu hỏi bên dưới nhé!`,
          },
        ];
      }
      const updated = [...prev];
      if (updated[0]?.role === 'assistant' && updated[0].content.startsWith('Chào ')) {
        updated[0] = {
          role: 'assistant',
          content: `Chào ${userName}! Tôi là AI Tutor. Tôi có thể giúp bạn giải đáp, tóm tắt và phân tích chuyên sâu về bài báo này. Hãy thử đặt câu hỏi bên dưới nhé!`,
        };
      }
      return updated;
    });
  }, [userName]);

  // Auto-scroll chat container to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  // Fetch papers from Semantic Scholar
  const fetchRelatedPapers = useCallback(async (targetJobId: string) => {
    if (!targetJobId) return;
    setIsLoadingPapers(true);
    setPapersError(null);
    try {
      const papers = await getRelatedPapers(targetJobId);
      setRelatedPapers(papers);
      setHasFetchedPapers(true);
    } catch (err: any) {
      console.error('Error fetching related papers:', err);
      setPapersError(err.message || 'Không thể tải bài báo liên quan.');
    } finally {
      setIsLoadingPapers(false);
    }
  }, []);

  // Fetch automatically when the scholar tab is selected and papers are not yet loaded
  useEffect(() => {
    if (rightTab === 'scholar' && !hasFetchedPapers && !isLoadingPapers && !papersError && jobId) {
      fetchRelatedPapers(jobId);
    }
  }, [rightTab, hasFetchedPapers, isLoadingPapers, papersError, jobId, fetchRelatedPapers]);

  // Reset papers when jobId changes
  useEffect(() => {
    setRelatedPapers([]);
    setHasFetchedPapers(false);
    setPapersError(null);
    setExpandedPaperId(null);
  }, [jobId]);

  // Handle click on citations to scroll-into-view and highlight target paragraph
  const handleCitationClick = useCallback((chunkIndex: number) => {
    const elements = document.querySelectorAll(`[data-chunk="${chunkIndex}"]`);
    if (elements.length === 0) {
      console.warn(`No chunk elements found with index ${chunkIndex}`);
      return;
    }

    elements.forEach(el => {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('chunk-highlight');
      setTimeout(() => {
        el.classList.remove('chunk-highlight');
      }, 3000);
    });
  }, []);

  // Handle sending RAG chat message
  const handleSendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isSending || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsSending(true);

    try {
      const res = await sendRAGChatMessage(jobId, text);
      const parsed = parseCitations(res.answer);
      const assistantMsg: Message = {
        role: 'assistant',
        content: parsed.cleanText,
        citations: parsed.citations,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('Chat failed:', err);
      const errorMsg: Message = {
        role: 'assistant',
        content: 'Xin lỗi, đã xảy ra lỗi khi gửi câu hỏi tới AI Tutor. Vui lòng thử lại sau.',
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsSending(false);
    }
  }, [jobId, isSending, loading]);

  const triggerFileDownload = useCallback(() => {
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = 'analysis.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl]);

  const handleDownloadClick = useCallback(() => {
    if (status === 'authenticated') {
      triggerFileDownload();
    } else {
      setPendingDownload(true);
      setShowLoginModal(true);
    }
  }, [status, triggerFileDownload]);

  const handleReprocessClick = useCallback(async () => {
    if (status !== 'authenticated') {
      setShowLoginModal(true);
      return;
    }

    try {
      setReprocessing(true);
      setError('');
      const res = await fetch(`/api/jobs/${jobId}/reprocess`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Dịch lại thất bại');
      }

      if (onReprocess) {
        resetMockProgress();
        onReprocess();
      }
    } catch (err: any) {
      console.error('Reprocess error:', err);
      setError(err.message || 'Không thể dịch lại tài liệu này. Vui lòng thử lại sau.');
    } finally {
      setReprocessing(false);
    }
  }, [jobId, status, onReprocess]);

  const handleLoginSuccess = useCallback(() => {
    triggerFileDownload();
    setPendingDownload(false);
  }, [triggerFileDownload]);

  const handleCopyText = useCallback((text: string, lang: 'en' | 'vi' | 'mobile') => {
    if (!navigator.clipboard) {
      console.warn('Clipboard API is not available');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      setCopiedLang(lang);
      setTimeout(() => setCopiedLang(null), 2000);
    });
  }, []);

  const handleContentClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.copy-latex-btn');
    if (btn) {
      e.stopPropagation();
      const wrapper = btn.closest('.katex-formula-wrapper');
      const latexEscaped = wrapper?.getAttribute('data-latex');
      if (latexEscaped) {
        const latex = decodeURIComponent(latexEscaped);
        if (!navigator.clipboard) {
          console.warn('Clipboard API is not available');
          return;
        }
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

  const handleScrollLeft = useCallback(() => {
    if (activeScrollColRef.current && activeScrollColRef.current !== 'left') return;
    activeScrollColRef.current = 'left';

    const source = leftScrollRef.current;
    const target = rightScrollRef.current;

    if (source && target) {
      const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
      target.scrollTop = Math.round(percentage * (target.scrollHeight - target.clientHeight));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      activeScrollColRef.current = null;
    }, 100);
  }, []);

  const handleScrollRight = useCallback(() => {
    if (activeScrollColRef.current && activeScrollColRef.current !== 'right') return;
    activeScrollColRef.current = 'right';

    const source = rightScrollRef.current;
    const target = leftScrollRef.current;

    if (source && target) {
      const percentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
      target.scrollTop = Math.round(percentage * (target.scrollHeight - target.clientHeight));
    }

    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      activeScrollColRef.current = null;
    }, 100);
  }, []);

  const activeContent = sections ? (tab === 'en' ? sections.en : sections.vi) : rawContent;
  const hasPreview = !!activeContent;
  const enDisabled = !sections?.hasEN;

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div aria-hidden className="dot-grid pointer-events-none fixed inset-0 z-0" />

      {/* ── CSS Shimmer & Animation Styles ── */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bg {
          background: linear-gradient(90deg, var(--bg-elevated) 25%, var(--border-normal) 50%, var(--bg-elevated) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite linear;
        }
      `}} />

      {/* ── LEFT SIDEBAR (15% on Desktop, collapsible) ── */}
      <aside
        className={`hidden lg:flex flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] transition-all duration-300 z-10 flex-shrink-0 select-none ${
          isLeftCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-72 opacity-100'
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold tracking-wider text-[var(--accent)]" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic' }}>
              Luminary
            </span>
            <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-[var(--border-normal)] text-[var(--text-secondary)]">
              Workspace
            </span>
          </div>
          <button
            onClick={onReset}
            title="Dịch tài liệu mới"
            className="p-1.5 rounded-lg border border-[var(--border-normal)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Library list section */}
        <div className="flex-1 flex flex-col min-h-0 p-4 gap-4">
          <div className="flex flex-col min-h-0 flex-1">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 px-1 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8m-5 5h2.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H16" />
              </svg>
              Thư viện cá nhân
            </h3>

            {status !== 'authenticated' ? (
              <div className="text-center py-6 border border-dashed border-[var(--border-normal)] rounded-xl p-4 bg-[var(--bg-elevated)]/30">
                <p className="text-[11px] text-[var(--text-secondary)] mb-2.5">
                  Đăng nhập để xem lịch sử bản dịch và lưu thư viện.
                </p>
                <button
                  onClick={() => setShowLoginModal(true)}
                  className="w-full py-1.5 rounded-lg bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Đăng nhập ngay
                </button>
              </div>
            ) : loadingLibrary ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 w-full rounded-xl shimmer-bg" />
                ))}
              </div>
            ) : libraryJobs.length === 0 ? (
              <p className="text-xs text-[var(--text-secondary)] italic text-center py-6">
                Chưa có tài liệu nào trong thư viện.
              </p>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 scrollbar-thin">
                {libraryJobs.map(job => {
                  const isActive = job.jobId === jobId;
                  const isCompleted = job.status === 'completed';
                  return (
                    <button
                      key={job.jobId}
                      onClick={() => isCompleted && setJobId(job.jobId)}
                      disabled={!isCompleted}
                      className={`text-left p-2.5 rounded-xl border transition-all text-xs flex flex-col gap-1 w-full ${
                        isActive
                          ? 'bg-[var(--accent-dim)] border-[var(--accent)] text-[var(--text-primary)] font-medium'
                          : 'bg-transparent border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-normal)]'
                      } ${!isCompleted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className="truncate w-full font-semibold">{job.fileName || 'Tài liệu học thuật.pdf'}</span>
                      <span className="text-[9px] opacity-75">
                        {job.createdAt ? new Date(parseInt(job.createdAt) * 1000).toLocaleDateString('vi-VN') : 'Mới'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tools List */}
          <div className="border-t border-[var(--border-subtle)] pt-4 flex-shrink-0">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3 px-1 flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Bộ công cụ học tập
            </h3>
            <div className="flex flex-col gap-2">
              {/* Kiểm tra AI (Quiz) */}
              <button
                onClick={() => setShowQuizModal(true)}
                disabled={loading}
                id="open-quiz-btn"
                data-testid="open-quiz-btn"
                title="Tạo bài kiểm tra trắc nghiệm từ bài báo này"
                className="text-left p-2.5 rounded-xl border border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-elevated)] transition-all flex flex-col gap-0.5 cursor-pointer relative group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Kiểm tra AI (Quiz)</span>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] opacity-75">Tự động tạo câu hỏi trắc nghiệm</span>
              </button>

              {/* Thẻ ghi nhớ (Flashcard) */}
              <button
                onClick={() => setShowFlashcardModal(true)}
                disabled={loading}
                id="open-flashcard-btn"
                data-testid="open-flashcard-btn"
                title="Tạo thẻ ghi nhớ thuật ngữ từ bài báo này"
                className="text-left p-2.5 rounded-xl border border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-elevated)] transition-all flex flex-col gap-0.5 cursor-pointer relative group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Thẻ ghi nhớ (Flashcard)</span>
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] opacity-75">Ôn tập thuật ngữ khoa học</span>
              </button>

              {/* Sơ đồ tư duy (Mindmap) */}
              <button
                onClick={handleMindmapClick}
                disabled={loading}
                id="open-mindmap-btn"
                data-testid="open-mindmap-btn"
                title="Tạo sơ đồ tư duy trực quan từ bài báo này"
                className={`text-left p-2.5 rounded-xl border transition-all flex flex-col gap-0.5 cursor-pointer relative group disabled:opacity-40 disabled:cursor-not-allowed ${
                  mindmapStatus === 'COMPLETED'
                    ? 'border-green-500/30 bg-green-500/5 hover:bg-green-500/10'
                    : 'border-[var(--border-subtle)] bg-transparent hover:bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    {mindmapStatus === 'COMPLETED' ? 'Xem sơ đồ tư duy (Mindmap)' : 'Sơ đồ tư duy (Mindmap)'}
                  </span>
                  {mindmapStatus === 'COMPLETED' && (
                    <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-90">
                      Đã xong
                    </span>
                  )}
                  {mindmapStatus === 'GENERATING' && (
                    <span className="text-[8px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider scale-90 animate-pulse flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-ping" />
                      Đang tạo
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-[var(--text-secondary)] opacity-75">
                  {mindmapStatus === 'COMPLETED'
                    ? 'Nhấn để mở sơ đồ tư duy trực quan'
                    : 'AI vẽ mindmap cấu trúc bài viết'}
                </span>
              </button>

              {/* Hội thoại AI (Podcast) */}
              <div
                className={`p-2.5 rounded-xl border transition-all flex flex-col gap-2 ${
                  activeJobId === jobId && podcastPlayerStatus === 'COMPLETED'
                    ? 'border-[var(--success)]/30 bg-[var(--success-dim)]'
                    : 'border-[var(--border-subtle)] bg-transparent'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">Hội thoại AI (Podcast)</span>
                  {activeJobId === jobId && podcastPlayerStatus === 'COMPLETED' && (
                    <span className="text-[8px] bg-[var(--success-dim)] text-[var(--success)] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                      Sẵn sàng
                    </span>
                  )}
                  {activeJobId === jobId && podcastPlayerStatus === 'GENERATING' && (
                    <span className="text-[8px] bg-[var(--warning-dim)] text-[var(--warning)] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-ping" />
                      Đang tạo
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-[var(--text-secondary)] opacity-75 leading-normal">
                  Nghe cuộc đối thoại ngắn giữa 2 chuyên gia phân tích bài báo này.
                </span>

                <div className="flex items-center justify-between mt-1 text-[10px]">
                  <span className="text-[var(--text-secondary)]">Chất lượng cao (HD)</span>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox"
                      checked={podcastHdMode}
                      onChange={(e) => setPodcastHdMode(e.target.checked)}
                      disabled={activeJobId === jobId && podcastPlayerStatus === 'GENERATING'}
                      className="sr-only peer"
                    />
                    <div className="w-7 h-4 bg-[var(--border-normal)] rounded-full peer peer-checked:after:translate-x-[12px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--text-primary)] after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[var(--accent)]" />
                  </label>
                </div>

                <button
                  onClick={() => {
                    const currentTitle = libraryJobs.find(j => j.jobId === jobId)?.fileName || 'Tài liệu học thuật';
                    playPodcast(jobId, currentTitle, podcastHdMode);
                  }}
                  disabled={loading || (activeJobId === jobId && podcastPlayerStatus === 'GENERATING')}
                  className="w-full mt-1.5 py-1.5 rounded-lg bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-[#080b12] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {activeJobId === jobId ? (
                    podcastPlayerStatus === 'GENERATING' ? (
                      <>
                        <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent border-[var(--bg-surface)] animate-spin" />
                        Đang tạo...
                      </>
                    ) : podcastPlayerStatus === 'COMPLETED' ? (
                      isPodcastPlaying ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                          </svg>
                          Tạm dừng nghe
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                          Tiếp tục nghe
                        </>
                      )
                    ) : podcastPlayerStatus === 'FAILED' ? (
                      'Thử lại'
                    ) : (
                      'Nghe Podcast'
                    )
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                      </svg>
                      Nghe Podcast
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* User profile footer */}
        <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20 flex items-center justify-between">
          {status === 'authenticated' ? (
            <div className="flex items-center gap-2 w-full justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                {session?.user?.image ? (
                  <img src={session.user.image} alt="Avatar" className="h-7 w-7 rounded-full flex-shrink-0" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-[10px] font-bold uppercase flex-shrink-0">
                    {session?.user?.email?.[0] || 'U'}
                  </div>
                )}
                <span className="text-xs font-medium text-[var(--text-primary)] truncate max-w-[120px]">
                  {session?.user?.email}
                </span>
              </div>
              <button
                onClick={() => signOut({ redirect: false })}
                className="text-[10px] text-[var(--text-secondary)] hover:text-red-400 font-semibold transition-colors bg-transparent border-none cursor-pointer"
              >
                Đăng xuất
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="w-full flex items-center justify-center gap-2 border border-[var(--border-normal)] bg-[var(--bg-surface)] py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all cursor-pointer"
            >
              Đăng nhập tài khoản
            </button>
          )}
        </div>
      </aside>

      {/* ── Left Sidebar Toggle Handle (Desktop only) ── */}
      <button
        onClick={() => setIsLeftCollapsed(!isLeftCollapsed)}
        id="left-sidebar-toggle"
        data-testid="left-sidebar-toggle"
        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-30 h-10 w-5 items-center justify-center rounded-r-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-md hover:text-[var(--text-primary)] hover:scale-105 transition-all cursor-pointer"
        style={{
          left: isLeftCollapsed ? '0px' : '288px', // matches Left Sidebar width (288px)
          transition: 'left 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <svg
          className={`h-3.5 w-3.5 transform transition-transform duration-300 ${isLeftCollapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* ── CENTER WORKSPACE (Bilingual Reader, expands to fill space) ── */}
      <main className="flex-1 flex flex-col h-full min-w-0 transition-all duration-300 bg-[var(--bg-base)] z-0 relative">
        {/* Workspace Toolbar */}
        <header className="h-14 border-b border-[var(--border-subtle)] px-6 flex items-center justify-between bg-[var(--bg-surface)]/60 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            {/* Mobile Home Button */}
            <button
              onClick={onReset}
              className="lg:hidden p-2 rounded-lg border border-[var(--border-normal)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">Đang đọc tài liệu</span>
              <h2 className="text-sm font-bold text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-md">
                {libraryJobs.find(j => j.jobId === jobId)?.fileName || 'Đang tải tài liệu...'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-xs text-[var(--text-secondary)]">Đang tải...</span>
            ) : error ? (
              <span className="text-xs text-[var(--error)] font-medium">Lỗi kết nối</span>
            ) : downloadUrl ? (
              <>
                <button
                  onClick={handleDownloadClick}
                  className="flex items-center gap-1.5 rounded-lg bg-[var(--success)] text-[#080b12] px-3.5 py-1.5 text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Tải về Markdown
                </button>

                <button
                  onClick={() => {
                    const currentTitle = libraryJobs.find(j => j.jobId === jobId)?.fileName || 'Tài liệu học thuật';
                    playPodcast(jobId, currentTitle, podcastHdMode);
                  }}
                  disabled={loading || (activeJobId === jobId && podcastPlayerStatus === 'GENERATING')}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
                  title="Nghe podcast hội thoại phân tích bài báo"
                >
                  {activeJobId === jobId && podcastPlayerStatus === 'GENERATING' ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border border-t-transparent border-[var(--text-secondary)] animate-spin" />
                      Đang tạo...
                    </>
                  ) : activeJobId === jobId && isPodcastPlaying ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75 animate-duration-1000"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--success)]"></span>
                      </span>
                      Tạm dừng nghe
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--accent)]">
                        <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                        <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                      </svg>
                      Nghe Podcast
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setIsRightCollapsed(false);
                    setRightTab('tutor');
                    handleSendMessage("Tìm các bài viết liên quan đến tài liệu này");
                  }}
                  disabled={loading || isSending}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
                  data-testid="header-find-related-btn"
                >
                  <svg className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Tìm liên quan
                </button>

                <button
                  onClick={handleReprocessClick}
                  disabled={reprocessing}
                  data-authenticated={status === 'authenticated'}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
                >
                  {reprocessing ? (
                    <>
                      <span className="inline-block w-3 h-3 rounded-full border border-[var(--border-normal)] border-t-[var(--accent)] animate-spin" />
                      Đang xử lý...
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
                      </svg>
                      Dịch lại
                    </>
                  )}
                </button>

              </>
            ) : null}
          </div>
        </header>

        {/* Reader container */}
        <div
          onClick={handleContentClick}
          className="flex-1 flex flex-col overflow-hidden relative"
        >
          {/* Tab bar header */}
          <div
            className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/30 backdrop-blur-sm"
          >
            {/* Language switches on mobile / small screen */}
            <div className={`flex items-center gap-1 ${sections?.hasEN ? 'lg:hidden' : ''}`}>
              {(['en', 'vi'] as Lang[]).map(lang => {
                const active = tab === lang;
                const disabled = lang === 'en' && enDisabled;
                return (
                  <button
                    key={lang}
                    onClick={() => !disabled && setTab(lang)}
                    disabled={disabled}
                    className="rounded-lg px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all"
                    style={{
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      background: active ? 'var(--bg-surface)' : 'transparent',
                      border: active ? '1px solid var(--border-normal)' : '1px solid transparent',
                      opacity: disabled ? 0.35 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {lang === 'en' ? 'English' : 'Tiếng Việt'}
                  </button>
                );
              })}
            </div>

            {/* Desktop Title Indicator */}
            {sections?.hasEN && (
              <div className="hidden lg:flex items-center gap-2">
                <svg className="h-4 w-4 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Xem song ngữ song song</span>
              </div>
            )}

            {/* Status indicators and copy text */}
            <div className="flex items-center gap-2">
              {hasPreview && (
                <button
                  onClick={() => handleCopyText(activeContent, 'mobile')}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] bg-transparent lg:hidden cursor-pointer"
                >
                  {copiedLang === 'mobile' ? (
                    <span className="text-[var(--success)] font-semibold flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Đã chép
                    </span>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Sao chép
                    </>
                  )}
                </button>
              )}

              {sections?.hasEN ? (
                <span className="rounded-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[var(--success-dim)] text-[var(--success)] border border-green-500/10">
                  Song Ngữ
                </span>
              ) : (
                <span className="rounded-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-[var(--accent-dim)] text-[var(--accent)] border border-[var(--accent-glow)]">
                  Tiếng Việt
                </span>
              )}
            </div>
          </div>

          {/* Core reader layout */}
          <div className="flex-1 overflow-hidden relative">
            {loadingContent ? (
              <div className="flex items-center justify-center gap-3 h-full">
                <span className="inline-block w-5 h-5 rounded-full border-2 border-[var(--border-normal)] border-t-[var(--accent)] animate-spin" />
                <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Đang tải bản dịch...</span>
              </div>
            ) : !hasPreview ? (
              <div className="flex flex-col items-center justify-center gap-3 h-full p-6 text-center">
                <svg className="h-10 w-10 text-[var(--text-muted)] opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-xs text-[var(--text-secondary)]">
                  Không thể tải bản xem trước trực tuyến.<br />Hãy tải Markdown về máy để đọc trực tiếp.
                </p>
              </div>
            ) : sections?.hasEN ? (
              <>
                {/* Desktop Side-by-Side Synced Scrolling View */}
                <div className="hidden lg:grid lg:grid-cols-2 lg:divide-x lg:divide-[var(--border-subtle)] h-full overflow-hidden">
                  {/* English original column */}
                  <div
                    ref={leftScrollRef}
                    onScroll={handleScrollLeft}
                    className="overflow-y-auto px-8 py-6 h-full scrollbar-thin relative"
                  >
                    <div className="sticky top-0 z-20 bg-[var(--bg-base)] pb-2 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-wider text-[var(--accent)] uppercase">EN · English Version</span>
                      <button
                        onClick={() => handleCopyText(sections.en, 'en')}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer"
                      >
                        {copiedLang === 'en' ? (
                          <span className="text-[var(--success)]">✓ Đã sao chép</span>
                        ) : (
                          'Sao chép'
                        )}
                      </button>
                    </div>
                    <div
                      className="markdown-preview animate-fade-in"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(sections.en) }}
                    />
                  </div>

                  {/* Vietnamese translation column */}
                  <div
                    ref={rightScrollRef}
                    onScroll={handleScrollRight}
                    className="overflow-y-auto px-8 py-6 h-full scrollbar-thin relative"
                  >
                    <div className="sticky top-0 z-20 bg-[var(--bg-base)] pb-2 mb-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-wider text-[var(--success)] uppercase">VI · Bản dịch tiếng Việt</span>
                      <button
                        onClick={() => handleCopyText(sections.vi, 'vi')}
                        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition-all text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] cursor-pointer"
                      >
                        {copiedLang === 'vi' ? (
                          <span className="text-[var(--success)]">✓ Đã sao chép</span>
                        ) : (
                          'Sao chép'
                        )}
                      </button>
                    </div>
                    <div
                      className="markdown-preview animate-fade-in"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(sections.vi) }}
                    />
                  </div>
                </div>

                {/* Mobile / Tablet single column view */}
                <div className="lg:hidden h-full overflow-y-auto px-6 py-6 scrollbar-thin">
                  <div
                    className="markdown-preview animate-fade-in"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(activeContent) }}
                  />
                </div>
              </>
            ) : (
              /* Single Language Fallback View */
              <div className="h-full overflow-y-auto px-8 py-6 scrollbar-thin">
                <div
                  className="markdown-preview animate-fade-in"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(activeContent) }}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ── Right Sidebar Toggle Handle (Desktop only) ── */}
      <button
        onClick={() => setIsRightCollapsed(!isRightCollapsed)}
        id="right-sidebar-toggle"
        data-testid="right-sidebar-toggle"
        className="hidden lg:flex fixed top-1/2 -translate-y-1/2 z-30 h-10 w-5 items-center justify-center rounded-l-lg border border-[var(--border-normal)] bg-[var(--bg-surface)] text-[var(--text-secondary)] shadow-md hover:text-[var(--text-primary)] hover:scale-105 transition-all cursor-pointer"
        style={{
          right: isRightCollapsed ? '0px' : '384px', // matches Right Sidebar width (384px)
          transition: 'right 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <svg
          className={`h-3.5 w-3.5 transform transition-transform duration-300 ${isRightCollapsed ? '' : 'rotate-180'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* ── RIGHT SIDEBAR (30% on Desktop, collapsible) ── */}
      <aside
        className={`hidden lg:flex flex-col h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] transition-all duration-300 z-10 flex-shrink-0 select-none ${
          isRightCollapsed ? 'w-0 opacity-0 overflow-hidden' : 'w-96 opacity-100'
        }`}
      >
        {/* Tab Headers */}
        <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]/20">
          <button
            onClick={() => setRightTab('tutor')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider text-center transition-all cursor-pointer border-b-2 ${
              rightTab === 'tutor'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            AI Tutor Chat
          </button>
          <button
            onClick={() => setRightTab('scholar')}
            className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider text-center transition-all cursor-pointer border-b-2 ${
              rightTab === 'scholar'
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            Papers liên quan
          </button>
        </div>

        {/* Tab content area */}
        <div className="flex-1 flex flex-col overflow-hidden p-5">
          {rightTab === 'tutor' ? (
            /* AI TUTOR TAB */
            <div className="flex-1 flex flex-col justify-between overflow-hidden gap-4">
              {/* Chat message history container */}
              <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-4 scrollbar-thin" id="chat-messages-container">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    {msg.role === 'assistant' ? (
                      <div className="h-6 w-6 rounded-full bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        AI
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-[var(--accent)] text-[#080b12] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        U
                      </div>
                    )}
                    <div className={`flex-1 p-3 rounded-2xl border text-xs leading-relaxed max-w-[85%] ${
                      msg.role === 'user'
                        ? 'bg-[var(--accent-dim)] border-[var(--accent-glow)] rounded-tr-none text-[var(--text-primary)] self-end'
                        : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] rounded-tl-none text-[var(--text-primary)]'
                    }`}>
                      {msg.role === 'assistant' && (
                        <p className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>AI Tutor học thuật</p>
                      )}
                      {msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div
                          className="markdown-preview"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                        />
                      )}

                      {/* Source Citations Badges */}
                      {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex flex-wrap gap-1.5 items-center">
                          <span className="text-[9px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">Nguồn trích dẫn:</span>
                          {msg.citations.map((citationIndex) => (
                            <button
                              key={citationIndex}
                              onClick={() => handleCitationClick(citationIndex)}
                              className="px-2 py-0.5 rounded bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[10px] font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#080b12] transition-all cursor-pointer"
                              data-testid={`citation-${citationIndex}`}
                            >
                              Đoạn {citationIndex}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Suggestions shown only when there is only 1 message (the greeting) */}
                {messages.length === 1 && (
                  <div className="flex flex-col gap-1.5 ml-8 mt-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-muted)] mb-1">Gợi ý câu hỏi:</span>
                    {[
                      'Tóm tắt mục Phương pháp nghiên cứu',
                      'Giải thích công thức toán học chính',
                      'Định nghĩa các thuật ngữ chuyên ngành',
                    ].map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setChatInput(q);
                          handleSendMessage(q);
                        }}
                        disabled={loading}
                        className="text-left text-xs p-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-normal)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Typing Indicator */}
                {isSending && (
                  <div className="flex items-start gap-2.5 animate-pulse">
                    <div className="h-6 w-6 rounded-full bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      AI
                    </div>
                    <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 rounded-2xl rounded-tl-none text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
                      <span>AI Tutor đang suy nghĩ</span>
                      <span className="flex gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0s' }}></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                      </span>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Chat input box */}
              <div className="border-t border-[var(--border-subtle)] pt-4 flex-shrink-0">
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleSendMessage("Tìm các bài viết liên quan đến tài liệu này");
                    }}
                    disabled={loading || isSending}
                    className="flex items-center gap-1.5 rounded-lg border border-[var(--border-normal)] bg-[var(--bg-elevated)]/60 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-subtle)] px-2.5 py-1 text-[10px] font-bold transition-all cursor-pointer"
                    data-testid="chat-find-related-btn"
                  >
                    <svg className="h-3 w-3 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    Tìm liên quan
                  </button>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(chatInput);
                  }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={loading ? "Đang tải tài liệu..." : "Hỏi AI Tutor..."}
                    disabled={loading || isSending}
                    className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] text-xs px-4 py-3 rounded-xl border border-[var(--border-subtle)] pr-10 outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] transition-colors disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={loading || isSending || !chatInput.trim()}
                    className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--accent)] disabled:text-[var(--text-muted)] disabled:hover:text-[var(--text-muted)] cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* SEMANTIC SCHOLAR TAB */
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 bg-[var(--accent-dim)] border border-[var(--accent-glow)] rounded-xl text-xs text-[var(--text-primary)] mb-4 flex-shrink-0">
                📌 <strong>Semantic Scholar API:</strong> Đề xuất các bài báo học thuật liên quan mật thiết dựa trên tiêu đề nghiên cứu của bài đang đọc.
              </div>

              {isLoadingPapers ? (
                /* Shimmer Loader */
                <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-thin">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="p-3.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 animate-pulse flex flex-col gap-2">
                      <div className="h-4 bg-[var(--border-normal)] rounded w-5/6"></div>
                      <div className="h-3 bg-[var(--border-subtle)] rounded w-1/2"></div>
                      <div className="flex justify-between pt-2 border-t border-[var(--border-subtle)]">
                        <div className="h-2 bg-[var(--border-subtle)] rounded w-1/4"></div>
                        <div className="h-2 bg-[var(--border-subtle)] rounded w-1/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : papersError ? (
                /* Error State */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs text-[var(--text-secondary)] mb-3">{papersError}</p>
                  <button
                    onClick={() => fetchRelatedPapers(jobId)}
                    className="px-4 py-2 rounded-lg bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-xs text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[#080b12] font-semibold transition-all cursor-pointer"
                  >
                    Thử lại
                  </button>
                </div>
              ) : !hasFetchedPapers ? (
                /* Empty/Initial State */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs text-[var(--text-secondary)] mb-4">Chưa tải thông tin bài báo liên quan.</p>
                  <button
                    onClick={() => fetchRelatedPapers(jobId)}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer border-none"
                    data-testid="find-related-btn"
                  >
                    Tìm bài báo liên quan
                  </button>
                </div>
              ) : relatedPapers.length === 0 ? (
                /* No Results Found State */
                <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                  <p className="text-xs text-[var(--text-secondary)] mb-4">Không tìm thấy bài báo liên quan.</p>
                  <button
                    onClick={() => fetchRelatedPapers(jobId)}
                    className="px-4 py-2 rounded-lg bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer border-none"
                  >
                    Thử tìm lại
                  </button>
                </div>
              ) : (
                /* Papers List */
                <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3 scrollbar-thin" data-testid="related-papers-list">
                  {relatedPapers.map((paper) => {
                    const isExpanded = expandedPaperId === paper.paperId;
                    return (
                      <div
                        key={paper.paperId}
                        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30 hover:bg-[var(--bg-elevated)]/50 transition-colors flex flex-col overflow-hidden"
                        data-testid={`paper-card-${paper.paperId}`}
                      >
                        {/* Header/Summary View */}
                        <div
                          onClick={() => setExpandedPaperId(isExpanded ? null : paper.paperId)}
                          className="p-3.5 cursor-pointer flex flex-col gap-1.5"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="text-xs font-bold text-[var(--text-primary)] leading-snug hover:text-[var(--accent)] transition-colors pr-2">
                              {paper.title}
                            </h4>
                            <span className="text-[var(--text-muted)] mt-0.5 flex-shrink-0 transition-transform duration-200">
                              <svg
                                className={`h-3.5 w-3.5 transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                              </svg>
                            </span>
                          </div>
                          <p className="text-[10px] text-[var(--text-secondary)] truncate">
                            {paper.authors.length > 0 ? paper.authors.join(', ') : 'Unknown Authors'}
                          </p>
                          <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)] font-medium pt-1 border-t border-[var(--border-subtle)]/50">
                            <span>Năm: {paper.year || 'N/A'}</span>
                            {paper.pdfUrl && (
                              <a
                                href={paper.pdfUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--accent)] hover:underline flex items-center gap-0.5 font-bold"
                                data-testid={`pdf-link-${paper.paperId}`}
                              >
                                Đọc PDF
                                <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            )}
                          </div>
                        </div>

                        {/* Expanded Abstract */}
                        {isExpanded && (
                          <div className="px-3.5 pb-3.5 pt-1 border-t border-[var(--border-subtle)]/50 text-[10px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-surface)]/50">
                            <p className="font-semibold text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1">Tóm tắt:</p>
                            <p className="whitespace-pre-wrap">{paper.abstract || 'Không có tóm tắt tiếng Anh.'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── Login Modal ── */}
      <LoginModal
        isOpen={showLoginModal}
        onClose={() => {
          setShowLoginModal(false);
          setPendingDownload(false);
        }}
        onSuccess={handleLoginSuccess}
      />

      {/* ── Quiz Modal ── */}
      <QuizModal
        isOpen={showQuizModal}
        jobId={jobId}
        onClose={() => setShowQuizModal(false)}
      />

      {/* ── Flashcard Modal ── */}
      <FlashcardModal
        isOpen={showFlashcardModal}
        jobId={jobId}
        onClose={() => setShowFlashcardModal(false)}
      />

      {/* ── Mindmap Modal ── */}
      <MindmapModal
        isOpen={showMindmapModal}
        jobId={jobId}
        onClose={() => setShowMindmapModal(false)}
      />

      {/* ── Background Mindmap Toast Notification ── */}
      {mindmapToast.type && (
        <div
          id="mindmap-toast"
          data-testid="mindmap-toast"
          className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-[#0e131f]/95 border border-[var(--border-normal,rgba(255,255,255,0.1))] rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-fade-in flex flex-col gap-3"
        >
          <div className="flex items-start gap-3">
            {mindmapToast.type === 'generating' && (
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 flex-shrink-0 animate-pulse">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89" />
                </svg>
              </div>
            )}
            {mindmapToast.type === 'success' && (
              <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400 flex-shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            )}
            {mindmapToast.type === 'failed' && (
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 flex-shrink-0">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}
            <div className="flex-1">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                {mindmapToast.type === 'generating' && 'Đang vẽ sơ đồ tư duy'}
                {mindmapToast.type === 'success' && 'Hoàn thành sơ đồ'}
                {mindmapToast.type === 'failed' && 'Lỗi tiến trình'}
              </h4>
              <p className="text-[11px] text-gray-300 leading-relaxed mt-0.5">{mindmapToast.message}</p>
            </div>
            <button
              onClick={() => setMindmapToast({ type: null, message: '' })}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/5 cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {mindmapToast.type === 'success' && (
            <button
              onClick={() => {
                setShowMindmapModal(true);
                setMindmapToast({ type: null, message: '' });
              }}
              id="toast-open-mindmap-btn"
              data-testid="toast-open-mindmap-btn"
              className="w-full bg-green-500 text-[#080b12] text-xs font-bold py-2 rounded-xl hover:opacity-90 active:scale-95 transition-all cursor-pointer text-center"
            >
              Mở sơ đồ tư duy ngay
            </button>
          )}
        </div>
      )}


      {/* ── Alert popup for mock elements ── */}
      {alertMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl p-6 bg-[var(--bg-surface)] border border-[var(--border-normal)] text-center shadow-xl animate-fade-up">
            <div className="h-10 w-10 mx-auto rounded-full bg-[var(--accent-dim)] border border-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center mb-3">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h4 className="text-sm font-bold text-[var(--text-primary)] mb-2">Tính năng đang phát triển</h4>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-5">{alertMessage}</p>
            <button
              onClick={() => setAlertMessage(null)}
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-[#080b12] text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer border-none w-full"
            >
              Tôi đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
