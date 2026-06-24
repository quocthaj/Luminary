'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { generateMindmap, checkMindmapStatus } from '../lib/api';

// Progressive loading messages
const LOADING_STAGES = [
  { at: 0,     text: '🔍 Đang phân tích nội dung bài viết...' },
  { at: 4000,  text: '🧠 Đang trích xuất cấu trúc phân cấp...' },
  { at: 10000, text: '✨ Đang tạo sơ đồ Mermaid.js...' },
  { at: 18000, text: '⏳ Đang dựng bản vẽ trực quan...' },
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

interface TreeNode {
  label: string;
  children: TreeNode[];
}

function parseMindmapToTree(code: string): TreeNode | null {
  try {
    const lines = code.split('\n');
    const stack: { node: TreeNode; indent: number }[] = [];
    let root: TreeNode | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === 'mindmap') continue;

      const indent = line.length - line.trimStart().length;

      // Extract label
      let label = trimmed;
      if (label.includes('((') && label.includes('))')) {
        const match = label.match(/\(\("(.*?)"\)\)/) || label.match(/\(\((.*?)\)\)/);
        if (match) label = match[1];
      } else if (label.startsWith('"') && label.endsWith('"')) {
        label = label.slice(1, -1);
      }

      const node: TreeNode = { label, children: [] };

      if (stack.length === 0) {
        root = node;
        stack.push({ node, indent });
      } else {
        while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }
        if (stack.length > 0) {
          stack[stack.length - 1].node.children.push(node);
        } else if (!root) {
          root = node;
        }
        stack.push({ node, indent });
      }
    }
    return root;
  } catch (err) {
    console.error('Failed to parse mindmap to tree:', err);
    return null;
  }
}

function RenderTextTree({ node }: { node: TreeNode }) {
  return (
    <div className="pl-4 border-l border-white/10 my-1">
      <div className="flex items-center gap-2 text-sm text-gray-300 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent,#38bdf8)] flex-shrink-0" />
        <span className="font-medium">{node.label}</span>
      </div>
      {node.children.map((child, i) => (
        <RenderTextTree key={i} node={child} />
      ))}
    </div>
  );
}

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

      return `${indent}${trimmed}`;
    });

    return sanitizedLines.filter((l) => l !== '').join('\n');
  }
}

interface MindmapModalProps {
  isOpen: boolean;
  jobId: string;
  onClose: () => void;
}

type MindmapPhase = 'setup' | 'loading' | 'viewing';

export function MindmapModal({ isOpen, jobId, onClose }: MindmapModalProps) {
  const [phase, setPhase] = useState<MindmapPhase>('setup');
  const [mermaidCode, setMermaidCode] = useState<string>('');
  const [svgMarkup, setSvgMarkup] = useState<string>('');
  const [renderError, setRenderError] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pan & Zoom
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const loadingText = useProgressiveLoading(phase === 'loading' && isOpen);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAndRenderMermaid = useCallback(async (code: string) => {
    try {
      setRenderError(false);
      const cleaned = cleanMermaidCode(code);
      const mermaid = (await import('mermaid')).default;
      
      const uniqueId = `mermaid-mindmap-${Date.now()}`;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'Inter, system-ui, sans-serif',
        mindmap: {
          useMaxWidth: false
        }
      });

      const { svg } = await mermaid.render(uniqueId, cleaned);
      setSvgMarkup(svg);
    } catch (err) {
      console.error('Mermaid render error:', err);
      setRenderError(true);
    }
  }, []);


  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Reset state and check status on open/close
  useEffect(() => {
    if (!isOpen) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }
    setPhase('loading');
    setMermaidCode('');
    setSvgMarkup('');
    setRenderError(false);
    setErrorMsg(null);
    setScale(1);
    setOffset({ x: 0, y: 0 });

    checkMindmapStatus(jobId)
      .then((data) => {
        if (data.status === 'COMPLETED' && data.mermaidCode) {
          const cleaned = cleanMermaidCode(data.mermaidCode);
          setMermaidCode(cleaned);
          setPhase('viewing');
          loadAndRenderMermaid(cleaned);
        } else if (data.status === 'GENERATING') {
          let ticks = 0;
          const maxTicks = 45; // 90 seconds (45 * 2s)

          pollIntervalRef.current = setInterval(() => {
            ticks++;
            if (ticks > maxTicks) {
              if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
              }
              setErrorMsg('Quá trình vẽ sơ đồ tư duy mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.');
              setPhase('setup');
              return;
            }

            checkMindmapStatus(jobId)
              .then((statusData) => {
                if (statusData.status === 'COMPLETED' && statusData.mermaidCode) {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  const cleaned = cleanMermaidCode(statusData.mermaidCode);
                  setMermaidCode(cleaned);
                  setPhase('viewing');
                  loadAndRenderMermaid(cleaned);
                } else if (statusData.status === 'FAILED') {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setErrorMsg('Gemini không thể dựng sơ đồ tư duy từ nội dung bài viết. Vui lòng thử lại.');
                  setPhase('setup');
                }
              })
              .catch((err) => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                setErrorMsg(err.message || 'Lỗi kiểm tra trạng thái sơ đồ tư duy.');
                setPhase('setup');
              });
          }, 2000);
        } else {
          setPhase('setup');
        }
      })
      .catch((err) => {
        console.error('Error checking initial mindmap status in modal:', err);
        setPhase('setup');
      });
  }, [isOpen, jobId, loadAndRenderMermaid]);



  const handleStartGeneration = useCallback(() => {
    setPhase('loading');
    setErrorMsg(null);

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    generateMindmap(jobId)
      .then((data) => {
        const effectiveStatus = data.status || (data.mermaidCode ? 'COMPLETED' : undefined);

        if (effectiveStatus === 'COMPLETED' && data.mermaidCode) {
          const cleaned = cleanMermaidCode(data.mermaidCode);
          setMermaidCode(cleaned);
          setPhase('viewing');
          loadAndRenderMermaid(cleaned);
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
              setErrorMsg('Quá trình vẽ sơ đồ tư duy mất nhiều thời gian hơn dự kiến. Vui lòng thử lại.');
              setPhase('setup');
              return;
            }

            checkMindmapStatus(jobId)
              .then((statusData) => {
                if (statusData.status === 'COMPLETED' && statusData.mermaidCode) {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  const cleaned = cleanMermaidCode(statusData.mermaidCode);
                  setMermaidCode(cleaned);
                  setPhase('viewing');
                  loadAndRenderMermaid(cleaned);
                } else if (statusData.status === 'FAILED') {
                  if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                  }
                  setErrorMsg('Gemini không thể dựng sơ đồ tư duy từ nội dung bài viết. Vui lòng thử lại.');
                  setPhase('setup');
                }
              })
              .catch((err) => {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                setErrorMsg(err.message || 'Lỗi kiểm tra trạng thái sơ đồ tư duy.');
                setPhase('setup');
              });
          }, 2000);
        } else if (effectiveStatus === 'FAILED') {
          setErrorMsg('Tạo sơ đồ tư duy thất bại.');
          setPhase('setup');
        }
      })
      .catch((err) => {
        setErrorMsg(err.message || 'Không thể bắt đầu tạo sơ đồ tư duy.');
        setPhase('setup');
      });
  }, [jobId, loadAndRenderMermaid]);

  // Pan & Zoom mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    setIsDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Only zoom if hovering the inner container
    const zoomFactor = 1.05;
    const newScale = e.deltaY < 0 ? scale * zoomFactor : scale / zoomFactor;
    setScale(Math.min(Math.max(newScale, 0.4), 3));
  };

  const handleZoomIn = () => setScale(s => Math.min(s * 1.1, 3));
  const handleZoomOut = () => setScale(s => Math.max(s / 1.1, 0.4));
  const handleResetZoom = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleDownloadSvg = () => {
    if (!svgMarkup) return;
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mindmap-${jobId}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  const parsedTree = mermaidCode ? parseMindmapToTree(mermaidCode) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 transition-all duration-300 animate-fadeIn"
      id="mindmap-modal"
      data-testid="mindmap-modal"
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out forwards;
        }
        /* Style node background and lines inside rendered SVG */
        .mindmap-viewport svg {
          max-width: none !important;
          height: auto !important;
          user-select: none;
        }
        .mindmap-viewport svg g.node rect {
          fill: #141b2d !important;
          stroke: var(--accent, #38bdf8) !important;
          stroke-width: 1.5px !important;
        }
        .mindmap-viewport svg g.node text {
          fill: #ffffff !important;
          font-weight: 500 !important;
        }
        .mindmap-viewport svg path.edge {
          stroke: rgba(56, 189, 248, 0.4) !important;
          stroke-width: 2px !important;
        }
      `}</style>

      <div className="relative w-full max-w-4xl h-[85vh] bg-[#0e131f] border border-[var(--border-normal,rgba(255,255,255,0.1))] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle,rgba(255,255,255,0.05))] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--accent,#38bdf8)] animate-pulse" />
            <h3 className="text-sm font-bold text-white tracking-wide">
              Sơ Đồ Tư Duy Bài Báo (Mindmap)
            </h3>
          </div>
          <button
            onClick={onClose}
            id="mindmap-close-btn"
            data-testid="mindmap-close-btn"
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden relative bg-[#090d16] flex flex-col justify-center items-center">
          {/* ─── SETUP STATE ─── */}
          {phase === 'setup' && (
            <div className="p-8 flex flex-col items-center text-center gap-6 max-w-md" id="mindmap-setup-state">
              <div className="h-16 w-16 rounded-2xl bg-[var(--accent,#38bdf8)]/10 flex items-center justify-center text-[var(--accent,#38bdf8)]">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              </div>

              <div>
                <h4 className="text-base font-semibold text-white mb-2">Tạo Sơ Đồ Tư Duy Tự Động</h4>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Trình tạo sơ đồ tư duy AI sẽ tổng hợp và trực quan hóa cấu trúc của bài báo thành một sơ đồ mindmap phân cấp sống động.
                </p>
              </div>

              {errorMsg && (
                <div className="w-full p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-start gap-2 text-left">
                  <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-semibold mb-0.5">Không thể tạo sơ đồ</p>
                    <p className="opacity-90">{errorMsg}</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleStartGeneration}
                id="mindmap-start-btn"
                data-testid="mindmap-start-btn"
                className="w-full bg-[var(--accent,#38bdf8)] text-[#080b12] text-xs font-bold py-3.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-lg shadow-[var(--accent,#38bdf8)]/20"
              >
                Bắt đầu vẽ sơ đồ tư duy
              </button>
            </div>
          )}

          {/* ─── LOADING STATE ─── */}
          {phase === 'loading' && (
            <div className="p-12 flex flex-col items-center text-center gap-6" id="mindmap-loading-state">
              <div className="relative flex items-center justify-center">
                <div className="h-16 w-16 rounded-full border-2 border-[var(--border-normal,rgba(255,255,255,0.1))] border-t-[var(--accent,#38bdf8)] animate-spin" />
                <div className="absolute h-8 w-8 rounded-lg bg-[var(--accent,#38bdf8)]/10 flex items-center justify-center text-[var(--accent,#38bdf8)] animate-pulse">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  AI IS SYNTHESIZING MINDMAP
                </h4>
                <p className="text-sm font-semibold text-white animate-pulse min-h-[1.5rem]">
                  {loadingText}
                </p>
              </div>
            </div>
          )}

          {/* ─── VIEWING STATE (SVG Render / Text Fallback) ─── */}
          {phase === 'viewing' && (
            <div className="w-full h-full flex flex-col relative overflow-hidden" id="mindmap-viewing-state">
              {/* Controls Overlay (Zoom & Fallback Mode Selector) */}
              <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                {!renderError && (
                  <div className="flex items-center bg-[#0e131f]/90 border border-white/10 rounded-xl p-1.5 shadow-lg backdrop-blur-sm">
                    <button
                      onClick={handleZoomIn}
                      title="Phóng to"
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    <span className="text-[10px] font-bold text-gray-300 min-w-[32px] text-center">
                      {Math.round(scale * 100)}%
                    </span>
                    <button
                      onClick={handleZoomOut}
                      title="Thu nhỏ"
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <div className="h-4 w-px bg-white/10 mx-1" />
                    <button
                      onClick={handleResetZoom}
                      title="Đặt lại zoom"
                      className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 cursor-pointer text-[10px] font-bold px-2.5"
                    >
                      Khôi phục
                    </button>
                  </div>
                )}
                
                {renderError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Lỗi dựng đồ họa. Hiển thị dạng sơ đồ cây thay thế.</span>
                  </div>
                )}
              </div>

              <div className="absolute top-4 right-4 z-10 flex gap-2">
                {!renderError && (
                  <button
                    onClick={handleDownloadSvg}
                    className="flex items-center gap-1.5 px-3.5 py-2.5 bg-[#0e131f]/90 hover:bg-[#151b2c] border border-white/10 text-[11px] font-bold text-white rounded-xl shadow-lg backdrop-blur-sm transition-all cursor-pointer"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Tải ảnh SVG
                  </button>
                )}
              </div>

              {/* Viewport content */}
              <div
                ref={viewportRef}
                className={`flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none ${isDragging ? 'active:cursor-grabbing' : ''}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                {!renderError && svgMarkup ? (
                  <div
                    className="mindmap-viewport absolute origin-center flex items-center justify-center min-w-full min-h-full"
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                    }}
                    dangerouslySetInnerHTML={{ __html: svgMarkup }}
                  />
                ) : (
                  // Fallback state: Nested Text Tree
                  <div className="w-full h-full overflow-y-auto p-12 flex flex-col justify-start">
                    <div className="max-w-xl mx-auto w-full bg-[#0e131f] border border-white/5 rounded-2xl p-6 shadow-xl">
                      <div className="border-b border-white/5 pb-3 mb-4 flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                          Sơ đồ cấu trúc dạng cây
                        </span>
                      </div>
                      {parsedTree ? (
                        <RenderTextTree node={parsedTree} />
                      ) : (
                        <div className="text-xs text-gray-500 py-6 text-center">
                          Không thể hiển thị sơ đồ.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Tip banner */}
              {!renderError && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#0e131f]/95 border border-white/5 rounded-full px-4 py-1.5 text-[10px] text-gray-400 shadow-md backdrop-blur-sm flex items-center gap-1.5 select-none pointer-events-none">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  Cuộn chuột để Phóng to/Thu nhỏ • Kéo chuột để Di chuyển sơ đồ
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
