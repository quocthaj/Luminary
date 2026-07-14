'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface Note {
  noteId: string;
  noteContent: string;
  citation?: string;
  createdAt: string;
}

interface Paper {
  id: string;
  title: string;
  authors: string;
  abstract: string;
  math: string;
  gap: string;
}

interface Stage {
  stage: string;
  color: string;
  papers: Paper[];
}

export default function ResearchStudioPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  // Dynamic Session States
  const [topic, setTopic] = useState<string>('Đang tải đề tài...');
  const [roadmap, setRoadmap] = useState<Stage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  // Selected paper in roadmap
  const [selectedPaperId, setSelectedPaperId] = useState<string>('paper-1');
  const [isLoadingPaper, setIsLoadingPaper] = useState<boolean>(false);

  const [newNoteText, setNewNoteText] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessUrl, setExportSuccessUrl] = useState<string | null>(null);

  // Load session from localStorage or initialize fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const key = `vietai-research-session-${sessionId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const data = JSON.parse(stored);
        setTopic(data.topic || 'Đề tài nghiên cứu');
        setRoadmap(data.roadmap || []);
        setNotes(data.notes || []);
        if (data.roadmap?.[0]?.papers?.[0]?.id) {
          setSelectedPaperId(data.roadmap[0].papers[0].id);
        }
      } catch (err) {
        console.error('Failed to parse stored session data:', err);
      }
    } else {
      // Fallback: Generate dynamic mock session based on the sessionId slug
      let cleanTopic = 'Học máy & Xử lý ngôn ngữ tự nhiên';
      if (sessionId !== 'session-demo-123') {
        const parts = sessionId.replace('session-', '').split('-');
        if (parts.length > 1) {
          // Remove the random suffix at the end
          parts.pop();
          cleanTopic = decodeURIComponent(parts.join(' '));
          // Capitalize first letter
          cleanTopic = cleanTopic.charAt(0).toUpperCase() + cleanTopic.slice(1);
        }
      } else {
        cleanTopic = "Vision Transformer trong chẩn đoán y khoa";
      }

      const generatedRoadmap: Stage[] = [
        {
          stage: "Chặng 1: Nền tảng (Foundations)",
          color: "indigo",
          papers: [
            {
              id: "paper-1",
              title: `Nền tảng lý thuyết và mô hình cơ sở của ${cleanTopic}`,
              authors: "N. Nguyen et al., 2020",
              abstract: `Bài báo này trình bày kiến trúc cơ sở và các nguyên lý toán học nền tảng cho việc thiết lập ${cleanTopic}. Tác giả đề xuất định dạng dữ liệu đầu vào và các phép tính lan truyền ngược đặc thù.`,
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
              title: `Đột phá kiến trúc nâng cao hiệu năng ${cleanTopic}`,
              authors: "Tran et al., 2022",
              abstract: `Một nghiên cứu mang tính bước ngoặt, giới thiệu cơ chế tối ưu hóa cục bộ và phân nhóm dữ liệu đặc trưng cho ${cleanTopic}. Kết quả thực nghiệm cho thấy hiệu năng vượt trội so với các mô hình CNN và RNN cổ điển.`,
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
              title: `Med-${cleanTopic.replace(/[^a-zA-Z0-9]/g, '') || 'SOTA'}: Ứng dụng lai SOTA của ${cleanTopic} trong y học & công nghiệp`,
              authors: "Luminary Scholar Team, 2024",
              abstract: `Nghiên cứu mới nhất kết hợp các kỹ thuật học sâu tiên tiến cùng ${cleanTopic} để xây dựng công cụ chẩn đoán đa năng độ chính xác cao. Hệ thống được tinh chỉnh để chạy mượt mà dưới 1.5 giây.`,
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
              title: `Các bài toán chưa có lời giải và hướng đi tương lai cho ${cleanTopic}`,
              authors: "S. Wang et al., 2025",
              abstract: `Phân tích toàn diện về các khoảng trống nghiên cứu của ${cleanTopic}. Đề xuất hướng tiếp cận tự giám sát (self-supervised learning) để giảm thiểu sự phụ thuộc vào nhãn thủ công và nâng cao tính minh bạch của AI.`,
              math: `\\text{Entropy}(P) = -\\sum_{x \\in X} P(x) \\log_2 P(x)`,
              gap: `⚠️ Mô hình AI vẫn đóng vai trò như 'hộp đen', thiếu đi khả năng giải thích logic lâm sàng một cách thuyết phục cho các bác sĩ.`
            }
          ]
        }
      ];

      const initialNotes: Note[] = [
        {
          noteId: 'note-initial',
          noteContent: `Khởi tạo không gian nghiên cứu cho đề tài: ${cleanTopic}. Bạn có thể bôi đen văn bản ở cột giữa và lưu trích dẫn, hoặc tự ghi chú vào sổ tay.`,
          citation: 'Hệ thống tự động',
          createdAt: new Date().toISOString()
        }
      ];

      setTopic(cleanTopic);
      setRoadmap(generatedRoadmap);
      setNotes(initialNotes);
      setSelectedPaperId('paper-1');

      localStorage.setItem(key, JSON.stringify({
        sessionId,
        topic: cleanTopic,
        roadmap: generatedRoadmap,
        notes: initialNotes
      }));
    }
  }, [sessionId]);

  // Find currently active paper
  let activePaper: Paper | null = null;
  for (const stg of roadmap) {
    const found = stg.papers.find(p => p.id === selectedPaperId);
    if (found) {
      activePaper = found;
      break;
    }
  }

  // Handle paper selection (Simulates On-demand PDF Ingestion)
  const handleSelectPaper = (id: string) => {
    setSelectedPaperId(id);
    setIsLoadingPaper(true);
    setTimeout(() => {
      setIsLoadingPaper(false);
    }, 1200); // 1.2s delay for premium ingestion effect
  };

  // Capture current selected text in document reader
  const handleCaptureSelection = () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';
    if (selectedText) {
      setNewNoteText((prev) => prev ? `${prev}\n\n"${selectedText}"` : `"${selectedText}"`);
    } else {
      alert("Vui lòng bôi đen/chọn một đoạn văn bản ở cột giữa trước!");
    }
  };

  // Add note atomically via API
  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    const citationText = activePaper ? `${activePaper.authors} - ${activePaper.title}` : 'Trích dẫn từ bài đọc hiện tại';

    try {
      const res = await fetch('/api/explore/journal/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          noteContent: newNoteText,
          citation: citationText
        })
      });

      if (res.ok) {
        const data = await res.json();
        const updatedNotes = [data.note, ...notes];
        setNotes(updatedNotes);
        setNewNoteText('');

        // Persist updated notes to localStorage
        const key = `vietai-research-session-${sessionId}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const sessionData = JSON.parse(stored);
          sessionData.notes = updatedNotes;
          localStorage.setItem(key, JSON.stringify(sessionData));
        }
      }
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  };

  // Handle export via Pre-signed URL
  const handleExport = async (format: 'pdf' | 'word' | 'obsidian') => {
    setIsExporting(true);
    setExportSuccessUrl(null);
    try {
      const res = await fetch('/api/explore/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, format })
      });
      if (res.ok) {
        const data = await res.json();
        setExportSuccessUrl(data.downloadUrl);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* CỘT 1: ROADMAP NAVIGATOR (Cột Trái) */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col p-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <Link href="/explore" className="text-xs text-indigo-400 hover:underline">
            &larr; Quay lại Khám phá
          </Link>
          <span className="text-[10px] font-mono bg-indigo-900/50 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700">
            ID: {sessionId.substring(0, 12)}
          </span>
        </div>

        <div>
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-1">🎯 Lộ trình Nghiên cứu</h2>
          <p className="text-xs text-slate-400 font-medium leading-relaxed">{topic}</p>
        </div>

        {/* Timeline Stepper */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {roadmap.map((stg, idx) => (
            <div key={idx} className="p-3 rounded-lg bg-slate-800/80 border border-slate-700">
              <h3 className={`text-xs font-semibold mb-2 ${
                stg.color === 'indigo' ? 'text-indigo-400' :
                stg.color === 'emerald' ? 'text-emerald-400' :
                stg.color === 'amber' ? 'text-amber-400' : 'text-rose-400'
              }`}>{stg.stage}</h3>
              <div className="space-y-1.5">
                {stg.papers.map((paper) => (
                  <button
                    key={paper.id}
                    onClick={() => handleSelectPaper(paper.id)}
                    className={`w-full text-left p-2 rounded text-xs transition leading-relaxed ${
                      selectedPaperId === paper.id
                        ? 'bg-indigo-600 text-white font-medium shadow-md shadow-indigo-950/50'
                        : 'bg-slate-900/60 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    📄 {paper.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* CỘT 2: DOCUMENT READER (Cột Giữa) */}
      <main className="flex-1 flex flex-col bg-slate-950 border-r border-slate-800 overflow-hidden">
        <header className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/30">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-white truncate">
              {activePaper ? activePaper.title : 'Chưa chọn tài liệu'}
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
              {activePaper ? `Tác giả: ${activePaper.authors}` : 'On-Demand Ingestion System'}
            </p>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {isLoadingPaper ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              <p className="text-sm text-indigo-400 animate-pulse font-medium">⏳ Đang phân tích tài liệu & nạp song ngữ KaTeX...</p>
            </div>
          ) : activePaper ? (
            <div className="prose prose-invert max-w-none space-y-5">
              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Tóm tắt Cốt lõi (Core Abstract)</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activePaper.abstract}
                </p>
                <div className="p-3 my-3 rounded bg-slate-950 text-center font-mono text-indigo-300 text-xs border border-indigo-950 overflow-x-auto">
                  {activePaper.math}
                </div>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Khoảng trống Nghiên cứu (Research Gap)</h4>
                  <button
                    onClick={handleCaptureSelection}
                    className="text-[10px] text-indigo-300 hover:text-indigo-200 bg-indigo-950/50 hover:bg-indigo-900/50 px-2 py-1 rounded border border-indigo-900/30 transition flex items-center gap-1"
                  >
                    <span>📋 Trích xuất phần bôi đen</span>
                  </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  {activePaper.gap}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-12">Không tìm thấy nội dung tài liệu.</p>
          )}
        </div>
      </main>

      {/* CỘT 3: INTERACTIVE RESEARCH JOURNAL (Cột Phải) */}
      <aside className="w-96 bg-slate-900/40 flex flex-col p-4 space-y-4 shrink-0">
        <div className="pb-3 border-b border-slate-800 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">📓 Nhật ký Nghiên cứu</h2>
          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900">
            Atomic PutItem Active
          </span>
        </div>

        {/* Note Input */}
        <div className="space-y-2">
          <textarea
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            placeholder="Nhập suy ngẫm cá nhân, hoặc bôi đen văn bản ở cột giữa rồi bấm 'Trích xuất phần bôi đen' để dán tự động..."
            className="w-full h-24 p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
          ></textarea>
          <button
            onClick={handleAddNote}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition"
          >
            ➕ Lưu vào Sổ tay (Atomic Save)
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {notes.map((note) => (
            <div key={note.noteId} className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <p className="text-xs text-slate-200 leading-relaxed">{note.noteContent}</p>
              {note.citation && (
                <p className="text-[9px] text-indigo-400 font-medium truncate" title={note.citation}>
                  📌 {note.citation}
                </p>
              )}
              <p className="text-[8px] text-slate-500 text-right">
                {new Date(note.createdAt).toLocaleTimeString('vi-VN')}
              </p>
            </div>
          ))}
        </div>

        {/* Export Footer */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <p className="text-xs font-semibold text-slate-300">📦 Đóng gói Nghiên cứu (Pre-signed S3)</p>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleExport('pdf')}
              className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition"
            >
              📄 PDF
            </button>
            <button
              onClick={() => handleExport('word')}
              className="py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded border border-slate-700 transition"
            >
              📝 Word
            </button>
            <button
              onClick={() => handleExport('obsidian')}
              className="py-1.5 bg-indigo-950 hover:bg-indigo-900 text-indigo-300 text-xs rounded border border-indigo-700 font-medium transition"
            >
              💎 Obsidian
            </button>
          </div>
          {isExporting && (
            <div className="text-center py-2 text-xs text-indigo-400 animate-pulse font-medium">
              Đang đóng gói tài liệu...
            </div>
          )}
          {exportSuccessUrl && (
            <a
              href={exportSuccessUrl}
              download
              className="block w-full text-center py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-lg transition"
            >
              ⬇️ Tải xuống gói dữ liệu thành công
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
