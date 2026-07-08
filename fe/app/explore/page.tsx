'use client';

import { useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createExploreJob, getExploreJobStatus, fetchPreviewContent, getResultUrl, getJobs, JobStatus } from '../../lib/api';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { ProfileModal } from '../../components/ProfileModal';

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

  // Detect diagram type
  const firstLine = clean.trim().split('\n')[0].trim().toLowerCase();
  const isMindmap = firstLine.startsWith('mindmap');

  if (isMindmap) {
    clean = clean.replace(/\(\("(.+?)"\)\)/g, '$1');
    clean = clean.replace(/\(\((.+?)\)\)/g, '$1');
    clean = clean.replace(/^(\s*)"(.+)"$/gm, '$1$2');

    const lines = clean.split('\n');
    const sanitizedLines = lines.map((line) => {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      const trimmed = line.trim();

      if (trimmed === '' || trimmed.toLowerCase() === 'mindmap') {
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
  } else {
    const lines = clean.split('\n');
    const sanitizedLines = lines.map((line) => {
      const indentMatch = line.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';
      let trimmed = line.trim();

      if (trimmed === '') return '';

      // Fix invalid arrow endings like -->|Text|> or -->|>
      trimmed = trimmed.replace(/(-->\|[^|]+)\|>\s*/g, '$1| ');
      trimmed = trimmed.replace(/-->\|>\s*/g, '--> ');

      // Remove HTML tags inside labels
      trimmed = trimmed.replace(/<[^>]*>/g, '');

      // Wrap labels containing special characters in double quotes for Mermaid compliance
      // Matches nodes like: A[Some (text) here] or B(Detailed: description) or C{Decision - node}
      // and converts to: A["Some (text) here"] or B("Detailed: description") or C{"Decision - node"}
      const labelMatch = trimmed.match(/^(\w+)([(\[{])(.*)([)\]}])$/);
      if (labelMatch) {
        const nodeId = labelMatch[1];
        const openBracket = labelMatch[2];
        const labelText = labelMatch[3];
        const closeBracket = labelMatch[4];
        
        // Only wrap in quotes if not already wrapped
        if (!labelText.startsWith('"') && !labelText.endsWith('"')) {
          // Replace single quotes inside label text to prevent breaks
          const escapedLabel = labelText.replace(/"/g, "'");
          trimmed = `${nodeId}${openBracket}"${escapedLabel}"${closeBracket}`;
        }
      }

      return `${indent}${trimmed}`;
    });

    return sanitizedLines.filter((l) => l !== '').join('\n');
  }
}

// Helper: Slugify Vietnamese text to standard URL/Anchor safe ID
function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD') // decompose combined graphemes into base + diacritic
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9\s-]/g, '') // remove special characters
    .trim()
    .replace(/\s+/g, '-') // replace spaces with hyphens
    .replace(/-+/g, '-'); // remove consecutive hyphens
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

  // Basic Markdown tags rendering with id injection for headings
  h = h
    .replace(/^#### (.+)$/gm, (_, text) => {
      const cleanText = text.replace(/[*_`]/g, '');
      return `<h4 id="${slugify(cleanText)}">${text}</h4>`;
    })
    .replace(/^### (.+)$/gm, (_, text) => {
      const cleanText = text.replace(/[*_`]/g, '');
      return `<h3 id="${slugify(cleanText)}">${text}</h3>`;
    })
    .replace(/^## (.+)$/gm, (_, text) => {
      const cleanText = text.replace(/[*_`]/g, '');
      return `<h2 id="${slugify(cleanText)}">${text}</h2>`;
    })
    .replace(/^# (.+)$/gm, (_, text) => {
      const cleanText = text.replace(/[*_`]/g, '');
      return `<h1 id="${slugify(cleanText)}">${text}</h1>`;
    })
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

function generateRoadmapForTopic(topicTitle: string) {
  const cleanTitle = topicTitle.trim();
  return [
    {
      stage: "Chặng 1: Nền tảng (Foundations)",
      color: "indigo",
      papers: [
        {
          id: "paper-1",
          title: `Nền tảng lý thuyết và mô hình cơ sở của ${cleanTitle}`,
          authors: "N. Nguyen et al., 2020",
          abstract: `Bài báo này trình bày kiến trúc cơ sở và các nguyên lý toán học nền tảng cho việc thiết lập ${cleanTitle}. Tác giả đề xuất định dạng dữ liệu đầu vào và các phép tính lan truyền ngược đặc thù.`,
          math: `\\mathcal{L}_{\\text{base}} = -\\frac{1}{N}\\sum_{i=1}^N \\left[ y_i \\log(\\hat{y}_i) + (1-y_i) \\log(1-\\hat{y}_i) \\right]`,
          gap: `⚠️ Các tiếp cận ban đầu có độ phức tạp tính toán cao và chưa tối ưu hóa phân phối trọng số.`
        }
      ]
    },
    {
      stage: "Chặng 2: Bài báo kinh điển (Landmarks)",
      color: "emerald",
      papers: [
        {
          id: "paper-2",
          title: `Đột phá kiến trúc nâng cao hiệu năng ${cleanTitle}`,
          authors: "Tran et al., 2022",
          abstract: `Một nghiên cứu mang tính bước ngoặt, giới thiệu cơ chế tối ưu hóa cục bộ và phân nhóm dữ liệu đặc trưng cho ${cleanTitle}. Kết quả thực nghiệm cho thấy hiệu năng vượt trội so với các mô hình CNN và RNN cổ điển.`,
          math: `\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V`,
          gap: `⚠️ Mô hình đòi hỏi dung lượng bộ nhớ lớn và chưa hỗ trợ tốt cho việc xử lý song song ở các phần cứng thế hệ cũ.`
        }
      ]
    },
    {
      stage: "Chặng 3: SOTA Hiện tại (Modern SOTA)",
      color: "amber",
      papers: [
        {
          id: "paper-3",
          title: `Med-${slugify(cleanTitle).replace(/-/g, '').toUpperCase().slice(0, 8) || 'SOTA'}: Ứng dụng lai SOTA của ${cleanTitle} trong y học & công nghiệp`,
          authors: "VietAI Scholar Team, 2024",
          abstract: `Nghiên cứu mới nhất kết hợp các kỹ thuật học sâu tiên tiến cùng ${cleanTitle} để xây dựng công cụ chẩn đoán đa năng độ chính xác cao. Hệ thống được tinh chỉnh để chạy mượt mà dưới 1.5 giây.`,
          math: `\\mathbf{y} = \\sigma\\left( \\mathbf{W}_2 \\cdot \\max(0, \\mathbf{W}_1 \\mathbf{x} + \\mathbf{b}_1) + \\mathbf{b}_2 \\right)`,
          gap: `⚠️ Việc tích hợp các thông tin phi cấu trúc bổ trợ (metadata văn bản, lịch sử bệnh án) vào mô hình vẫn chưa đạt độ tối ưu.`
        }
      ]
    },
    {
      stage: "Chặng 4: Thách thức mở (Open Challenges)",
      color: "rose",
      papers: [
        {
          id: "paper-4",
          title: `Các bài toán chưa có lời giải và hướng đi tương lai cho ${cleanTitle}`,
          authors: "S. Wang et al., 2025",
          abstract: `Phân tích toàn diện về các khoảng trống nghiên cứu của ${cleanTitle}. Đề xuất hướng tiếp cận tự giám sát (self-supervised learning) để giảm thiểu sự phụ thuộc vào nhãn thủ công và nâng cao tính minh bạch của AI.`,
          math: `\\text{Entropy}(P) = -\\sum_{x \\in X} P(x) \\log_2 P(x)`,
          gap: `⚠️ Mô hình AI vẫn đóng vai trò như 'hộp đen', thiếu đi khả năng giải thích logic lâm sàng một cách thuyết phục cho các bác sĩ.`
        }
      ]
    }
  ];
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
  const [isGeneratingRoadmap, setIsGeneratingRoadmap] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Explore 2.0 Multi-source Discovery State
  const [isSearchingSources, setIsSearchingSources] = useState(false);
  const [discoveredTopics, setDiscoveredTopics] = useState<{
    hotTrends: any[];
    nicheGaps: any[];
    crossDomain: any[];
  } | null>(null);
  const [discoveryProgress, setDiscoveryProgress] = useState(0);
  const [discoveryStage, setDiscoveryStage] = useState('');
  const [discoveryJobId, setDiscoveryJobId] = useState<string | null>(null);

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

    let mermaidLib: any = null;
    try {
      const imported = await import('mermaid');
      mermaidLib = imported.default || imported;
      
      // Some ESM packaging structures wrap it twice
      if (mermaidLib.default) {
        mermaidLib = mermaidLib.default;
      }

      mermaidLib.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
      });
    } catch (importErr: any) {
      console.error('Failed to dynamically load mermaid library:', importErr);
      containers.forEach((container) => {
        const target = container.querySelector('.mermaid-target');
        if (target) {
          target.innerHTML = `
            <div class="text-xs text-[var(--error)] bg-red-950/20 p-3 rounded-lg border border-red-900/50 w-full text-left">
              <p class="font-bold mb-1">Lỗi tải thư viện vẽ sơ đồ:</p>
              <pre class="overflow-x-auto text-[10px] font-mono whitespace-pre-wrap">${importErr.message || 'Không thể load thư viện Mermaid.'}</pre>
            </div>
          `;
        }
      });
      return;
    }

    containers.forEach(async (container, idx) => {
      const target = container.querySelector('.mermaid-target');
      const rawCode = container.getAttribute('data-mermaid');
      if (!target || !rawCode) return;

      try {
        let code = '';
        try {
          code = decodeURIComponent(rawCode);
        } catch {
          code = unescape(rawCode); // Fallback for legacy escaping
        }
        const cleaned = cleanMermaidCode(code);
        const uniqueId = `mermaid-explore-${idx}-${Date.now()}`;
        const { svg } = await mermaidLib.render(uniqueId, cleaned);
        target.innerHTML = svg;
      } catch (err: any) {
        console.error('Mermaid rendering failed inside markdown:', err);
        target.innerHTML = `
          <div class="text-xs text-[var(--error)] bg-red-950/20 p-3 rounded-lg border border-red-900/50 w-full text-left">
            <p class="font-bold mb-1">Không thể vẽ sơ đồ quy trình:</p>
            <pre class="overflow-x-auto text-[10px] font-mono whitespace-pre-wrap">${err.message || 'Cú pháp Mermaid không hợp lệ.'}</pre>
          </div>
        `;
      }
    });
  }, []);

  // 4. Generate dynamic Table of Contents (TOC) synchronously from markdown string
  const toc = useMemo<TocItem[]>(() => {
    if (!articleContent) return [];
    const lines = articleContent.split('\n');
    const items: TocItem[] = [];

    for (let line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const cleanTextForSlug = text.replace(/[*_`]/g, '');
        const id = slugify(cleanTextForSlug);
        items.push({ id, text: cleanTextForSlug, level });
      }
    }
    return items;
  }, [articleContent]);

  // Trigger post-rendering logic (rendering mermaid diagrams)
  useEffect(() => {
    if (articleContent) {
      // Allow DOM to commit HTML update before rendering mermaid
      const timeout = setTimeout(() => {
        loadMermaidDiagrams();
      }, 300);
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

  // 8.2. Submit Multi-Source Discovery (Explore 2.0)
  const handleStartMultiSourceDiscovery = async (selectedTopic?: string) => {
    const activeTopic = selectedTopic || topic;
    if (!activeTopic || activeTopic.trim() === '') {
      setError('Vui lòng nhập chủ đề nghiên cứu.');
      return;
    }

    try {
      setError('');
      setIsSearchingSources(true);
      setDiscoveredTopics(null);
      setDiscoveryProgress(5);
      setDiscoveryStage('🔍 Đang kết nối API Arxiv & Semantic Scholar...');

      // Step 1: POST to /api/explore/sources/search
      const searchRes = await fetch('/api/explore/sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: activeTopic })
      });

      if (!searchRes.ok) {
        throw new Error(`Khởi tạo tìm kiếm thất bại: ${searchRes.status}`);
      }

      const { jobId } = await searchRes.json();
      setDiscoveryJobId(jobId);

      // Start discovery progress animation
      let progressVal = 5;
      const stages = [
        '🔍 Đang kết nối API Arxiv & Semantic Scholar...',
        '📚 Đang quét và tải dữ liệu thư mục tài liệu...',
        '🧠 Gemini đang phân tích khoảng trống nghiên cứu (Niche Gaps)...',
        '📊 Đang lập nhóm xu hướng nóng và hướng phát triển mới...'
      ];
      
      const interval = setInterval(async () => {
        progressVal += Math.floor(Math.random() * 15) + 10;
        if (progressVal >= 90) {
          progressVal = 90;
        }
        setDiscoveryProgress(progressVal);
        setDiscoveryStage(stages[Math.min(Math.floor(progressVal / 25), stages.length - 1)]);
        
        // Poll status
        try {
          const statusRes = await fetch(`/api/explore/sources/status?jobId=${jobId}&topic=${encodeURIComponent(activeTopic)}`);
          if (statusRes.ok) {
            const data = await statusRes.json();
            if (data.status === 'COMPLETED') {
              clearInterval(interval);
              setDiscoveryProgress(100);
              setDiscoveredTopics(data.topics);
              setIsSearchingSources(false);
            }
          }
        } catch (pollErr) {
          console.error("Discovery polling error:", pollErr);
        }
      }, 1000);

    } catch (err: any) {
      console.error('Failed to run multi-source discovery:', err);
      setError(err.message || 'Khởi tạo phòng nghiên cứu thất bại.');
      setIsSearchingSources(false);
    }
  };

  // 8.3. Create dynamic Research Session and Redirect
  const handleStartResearchSession = async (topicTitle: string) => {
    try {
      setIsGeneratingRoadmap(true);
      setError('');
      
      const response = await fetch('/api/explore/roadmap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic: topicTitle })
      });

      if (!response.ok) {
        throw new Error('Không thể khởi tạo lộ trình nghiên cứu AI.');
      }

      const roadmap = await response.json();
      const slug = slugify(topicTitle);
      const sessionId = `session-${slug}-${Math.random().toString(36).substring(2, 7)}`;
      
      // Save to localStorage
      const sessionData = {
        sessionId,
        topic: topicTitle,
        roadmap,
        notes: [
          {
            noteId: 'note-initial',
            noteContent: `Khởi tạo không gian nghiên cứu cho đề tài: ${topicTitle}. Bạn có thể bôi đen văn bản ở cột giữa và lưu trích dẫn, hoặc tự ghi chú vào sổ tay.`,
            citation: 'Hệ thống tự động',
            createdAt: new Date().toISOString()
          }
        ]
      };
      
      localStorage.setItem(`vietai-research-session-${sessionId}`, JSON.stringify(sessionData));
      
      // Redirect to studio
      router.push(`/explore/studio/${sessionId}`);
    } catch (err: any) {
      console.error('Failed to start research session:', err);
      setError(err.message || 'Lỗi kết nối API lộ trình nghiên cứu.');
    } finally {
      setIsGeneratingRoadmap(false);
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

  // Trigger PDF print/save
  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div
      className="min-h-screen flex flex-col p-6 pb-16 animate-fade-in relative"
      style={{ background: 'var(--bg-base)' }}
    >
      <div aria-hidden className="no-print dot-grid pointer-events-none fixed inset-0" />

      {isGeneratingRoadmap && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex flex-col items-center justify-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          <p className="text-sm font-semibold text-indigo-400 animate-pulse">⏳ Đang tổng hợp các bài báo & thiết lập lộ trình nghiên cứu AI...</p>
          <p className="text-xs text-slate-400">Quá trình này có thể mất 3-5 giây</p>
        </div>
      )}

      {/* ─── HEADER ─── */}
      <div className="no-print flex items-center justify-between w-full max-w-5xl mx-auto mb-10 z-10">
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
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex flex-col text-right hover:opacity-85 transition-opacity cursor-pointer bg-transparent border-none p-0 text-left"
          >
            <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[160px] leading-tight">
              {session?.user?.name || session?.user?.email?.split('@')[0] || 'Thành viên'}
            </span>
            <span className="text-[9px] text-[var(--text-muted)] truncate max-w-[160px] leading-tight">
              {session?.user?.email}
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col z-10">
        {/* ─── CASE 1.5: MULTI-SOURCE DISCOVERY ACTIVE ─── */}
        {isSearchingSources && (
          <div className="flex flex-col items-center justify-center my-auto w-full max-w-md mx-auto text-center animate-fade-up py-12">
            <div className="relative flex items-center justify-center mb-8">
              <svg className="w-32 h-32 transform -rotate-90">
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
                  stroke="#6366f1"
                  strokeWidth="6"
                  fill="transparent"
                  strokeDasharray={351.8}
                  strokeDashoffset={351.8 - (351.8 * discoveryProgress) / 100}
                  className="transition-all duration-500 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-xl font-extrabold text-white">{discoveryProgress}%</span>
                <span className="text-[9px] uppercase tracking-widest text-[var(--text-muted)] mt-0.5">Tiến trình</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold tracking-[0.25em] text-indigo-400 uppercase animate-pulse">
                DISCOVERY ENGINE RUNNING
              </span>
              <h3 className="text-base font-bold text-white px-4 min-h-[3rem] flex items-center justify-center leading-relaxed">
                {discoveryStage}
              </h3>
              <p className="text-xs text-[var(--text-muted)] max-w-xs mx-auto">
                Đang quét và tổng hợp dữ liệu từ các kho lưu trữ học thuật lớn (Arxiv, Semantic Scholar...) dựa trên chủ đề của bạn.
              </p>
            </div>

            <div className="w-full bg-[var(--border-subtle)] h-1 rounded-full overflow-hidden mt-8">
              <div
                className="bg-indigo-500 h-full transition-all duration-500 ease-out"
                style={{ width: `${discoveryProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* ─── CASE 1.6: DISCOVERED TOPICS RESULTS PAGE ─── */}
        {!isSearchingSources && discoveredTopics && (
          <div className="flex flex-col w-full animate-fade-in py-6">
            <div className="text-center mb-8">
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Explore 2.0: Discovery Results
              </span>
              <h1 className="text-3xl font-bold text-white mt-3" style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}>
                Bản đồ Khai phá Tài liệu: {topic}
              </h1>
              <p className="text-xs text-slate-400 mt-2 max-w-xl mx-auto">
                Hệ thống đã thu thập các nguồn tài liệu xung quanh chủ đề. Chọn một định hướng nghiên cứu dưới đây để bắt đầu khởi tạo lộ trình Roadmap 4 chặng chi tiết trong Studio.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* HOT TRENDS COLUMN */}
              <div className="flex flex-col gap-4 p-4 rounded-2xl bg-indigo-950/20 border border-indigo-900/30">
                <div className="flex items-center gap-2 pb-2 border-b border-indigo-900/40">
                  <span className="text-lg">🔥</span>
                  <h3 className="text-sm font-bold text-indigo-300">Xu hướng Nóng (Hot Trends)</h3>
                </div>
                {discoveredTopics.hotTrends.map((t: any) => (
                  <div key={t.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between min-h-[140px] hover:border-indigo-500/50 transition">
                    <div>
                      <h4 className="text-xs font-bold text-white leading-relaxed">{t.title}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20">
                          {t.papersCount} tài liệu liên quan
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">{t.citationGrowth} trích dẫn</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartResearchSession(t.title)}
                      className="mt-4 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] py-2 rounded-lg transition"
                    >
                      🚀 Bắt đầu Nghiên cứu
                    </button>
                  </div>
                ))}
              </div>

              {/* NICHE GAPS COLUMN */}
              <div className="flex flex-col gap-4 p-4 rounded-2xl bg-emerald-950/20 border border-emerald-900/30">
                <div className="flex items-center gap-2 pb-2 border-b border-emerald-900/40">
                  <span className="text-lg">🎯</span>
                  <h3 className="text-sm font-bold text-emerald-300">Khoảng trống Nghiên cứu (Niche Gaps)</h3>
                </div>
                {discoveredTopics.nicheGaps.map((t: any) => (
                  <div key={t.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between min-h-[140px] hover:border-emerald-500/50 transition">
                    <div>
                      <h4 className="text-xs font-bold text-white leading-relaxed">{t.title}</h4>
                      <p className="text-[10px] text-slate-400 mt-1">{t.gapDescription}</p>
                      <div className="mt-2">
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/20">
                          {t.papersCount} tài liệu ít khai thác
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartResearchSession(t.title)}
                      className="mt-4 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-2 rounded-lg transition"
                    >
                      🚀 Bắt đầu Nghiên cứu
                    </button>
                  </div>
                ))}
              </div>

              {/* CROSS DOMAIN COLUMN */}
              <div className="flex flex-col gap-4 p-4 rounded-2xl bg-amber-950/20 border border-amber-900/30">
                <div className="flex items-center gap-2 pb-2 border-b border-amber-900/40">
                  <span className="text-lg">💡</span>
                  <h3 className="text-sm font-bold text-amber-300">Nghiên cứu Liên ngành (Cross-domain)</h3>
                </div>
                {discoveredTopics.crossDomain.map((t: any) => (
                  <div key={t.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between min-h-[140px] hover:border-amber-500/50 transition">
                    <div>
                      <h4 className="text-xs font-bold text-white leading-relaxed">{t.title}</h4>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20">
                          {t.papersCount} tài liệu liên kết
                        </span>
                        <span className="text-[10px] text-amber-400 font-semibold">Độ đột phá: {t.innovationScore}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleStartResearchSession(t.title)}
                      className="mt-4 w-full bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] py-2 rounded-lg transition"
                    >
                      🚀 Bắt đầu Nghiên cứu
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                setDiscoveredTopics(null);
                setTopic('');
              }}
              className="mt-8 mx-auto px-6 py-2.5 rounded-xl border border-[var(--border-normal)] text-xs font-bold text-[var(--text-secondary)] hover:text-white transition"
            >
              Quay lại Tìm kiếm
            </button>
          </div>
        )}

        {/* ─── CASE 1: IDLE / SEARCH STATE ─── */}
        {pollingStatus === 'IDLE' && !isSearchingSources && !discoveredTopics && (
          <div className="flex flex-col items-center justify-center my-auto w-full max-w-2xl mx-auto animate-fade-up">
            <div className="text-center mb-8">
              <span className="text-xs font-bold uppercase tracking-[0.25em] px-3.5 py-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--accent)]">
                Chế độ Khám phá (Explore Mode)
              </span>
              <h1
                className="mt-6 text-4xl font-normal leading-tight text-[var(--text-primary)] tracking-tight animate-pulse"
                style={{ fontFamily: 'var(--font-fraunces)', fontStyle: 'italic' }}
              >
                Học tập không giới hạn
              </h1>
              <p className="mt-3 text-sm text-[var(--text-secondary)]">
                Nhập chủ đề khoa học hoặc công nghệ. Hệ thống sẽ kết hợp Semantic Scholar và Arxiv để biên soạn bài giảng học thuật chuyên sâu hoặc mở phòng nghiên cứu độc lập.
              </p>
            </div>

            {/* Custom search bar with dual actions */}
            <div className="w-full flex flex-col gap-4">
              <div className="relative w-full flex items-center bg-[var(--bg-surface)] border border-[var(--border-normal)] rounded-2xl p-2.5 focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_rgba(56,189,248,0.15)] transition-all">
                <span className="pl-3 text-lg">🔍</span>
                <input
                  type="text"
                  placeholder="Nhập chủ đề khoa học hoặc công nghệ muốn khám phá..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleStartMultiSourceDiscovery();
                    }
                  }}
                  className="flex-1 bg-transparent border-none outline-none px-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]"
                />
              </div>

              <div className="flex flex-wrap gap-4 justify-center">
                <button
                  onClick={() => handleStartExplore()}
                  disabled={loading}
                  className="bg-[var(--bg-elevated)] hover:bg-[var(--border-normal)] border border-[var(--border-normal)] text-[var(--text-primary)] text-xs font-bold px-6 py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  📖 Biên soạn bài giảng (Explore 1.0)
                </button>
                <button
                  onClick={() => handleStartMultiSourceDiscovery()}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white text-xs font-bold px-6 py-3.5 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-950/50"
                >
                  🚀 Khai phá Đa nguồn (Explore 2.0)
                </button>
              </div>
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
            <div className="no-print w-full md:w-1/4 flex flex-col gap-6 md:sticky md:top-24 h-fit">
              {/* Actions card */}
              <div
                className="p-5 rounded-2xl flex flex-col gap-3"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
              >
                <button
                  onClick={handleDownloadPdf}
                  className="w-full flex items-center justify-center gap-2 bg-[var(--success)] text-[#080b12] text-xs font-bold py-3 rounded-xl hover:opacity-95 transition-all cursor-pointer border-none"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Tải về PDF
                </button>

                <button
                  onClick={handleDownloadMd}
                  disabled={!downloadUrl}
                  className="w-full flex items-center justify-center gap-2 bg-transparent border border-[var(--border-normal)] text-[var(--text-secondary)] hover:text-white hover:border-[var(--border-subtle)] text-xs font-bold py-3 rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        .scroll-container {
          scroll-behavior: smooth;
        }
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

        /* Print styles */
        @media print {
          .no-print {
            display: none !important;
          }
          body, html, .min-h-screen, .flex-1, .w-full.md\:w-3\/4, .relative.w-full.rounded-2xl {
            background: white !important;
            color: #000000 !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
            display: block !important;
          }
          .markdown-preview {
            background: white !important;
            color: #000000 !important;
            max-height: none !important;
            overflow: visible !important;
            padding: 0 !important;
          }
          .markdown-preview * {
            color: #000000 !important;
          }
          .copy-latex-btn {
            display: none !important;
          }
          .mermaid-diagram-container {
            border: 1px solid #ccc !important;
            background: #fafafa !important;
          }
        }
      `}</style>
      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
      />
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
